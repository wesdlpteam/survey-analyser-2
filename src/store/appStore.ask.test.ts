// TDD for the Ask tab's store additions (Task 10): chat, chatBusy, chatError,
// ask(). fetch is mocked - see ai/ai.test.ts for why (privacy + no
// flakiness). Every test builds its own store via createAppStore() and loads
// the sample survey first so a digest exists to ground the chat, then sets a
// fake key so ask() is not short-circuited by the "no key" guard.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from './appStore';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function chatCompletion(content: string) {
  return { choices: [{ message: { content } }] };
}

// setApiKey writes to real localStorage (see appStore.ts), which would
// otherwise persist a key across tests in this file (jsdom's localStorage is
// shared for the whole file) and make a later test's loadSample() fire a
// real, unwanted AI-audit fetch call before ask() ever runs. A fresh
// in-memory stub per test - same idiom as appStore.test.ts's "key + model
// persistence" block - keeps every test's apiKey isolated.
function makeLocalStorageStub() {
  const backing = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => (backing.has(k) ? backing.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => {
      backing.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      backing.delete(k);
    }),
    clear: vi.fn(() => backing.clear()),
    key: vi.fn(() => null),
    get length() {
      return backing.size;
    },
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageStub());
});

function readyStore() {
  const store = createAppStore();
  store.getState().loadSample();
  store.getState().setApiKey('sk-test-123');
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('appStore ask-the-data chat', () => {
  it('happy path appends the user message then the assistant reply, in order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, chatCompletion('Attendance looks strong.'))),
    );
    const store = readyStore();

    await store.getState().ask('What stood out most?');

    expect(store.getState().chat).toEqual([
      { role: 'user', content: 'What stood out most?' },
      { role: 'assistant', content: 'Attendance looks strong.' },
    ]);
  });

  it('caps the messages sent to the API at the last 12, even with a longer local history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, chatCompletion('Reply.')));
    vi.stubGlobal('fetch', fetchMock);
    const store = readyStore();

    // Fabricate 20 prior turns directly in state, then ask one more question.
    const priorChat: { role: 'user' | 'assistant'; content: string }[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `turn ${i}`,
    }));
    store.setState({ chat: priorChat });

    await store.getState().ask('One more question?');

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    // system + last 12 conversation messages (11 prior + the new question)
    expect(body.messages).toHaveLength(13);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[body.messages.length - 1]).toEqual({ role: 'user', content: 'One more question?' });
  });

  it('sets chatBusy true while the request is in flight and false once it settles', async () => {
    let resolveFetch!: (v: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));
    const store = readyStore();

    const askPromise = store.getState().ask('Busy check?');
    await Promise.resolve();
    expect(store.getState().chatBusy).toBe(true);

    resolveFetch(jsonResponse(200, chatCompletion('Done.')));
    await askPromise;
    expect(store.getState().chatBusy).toBe(false);
  });

  it('an AiError never rejects ask(), surfaces a friendly chatError, and keeps the user message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'bad key' })));
    const store = readyStore();

    await expect(store.getState().ask('Will this fail?')).resolves.toBeUndefined();

    const state = store.getState();
    expect(state.chatBusy).toBe(false);
    expect(state.chatError).toBe("That API key wasn't accepted. Check it in Settings and try again.");
    expect(state.chat).toEqual([{ role: 'user', content: 'Will this fail?' }]);
  });

  it('reset() clears chat, chatBusy and chatError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, chatCompletion('Reply.'))));
    const store = readyStore();
    await store.getState().ask('Anything?');
    expect(store.getState().chat.length).toBeGreaterThan(0);

    store.getState().reset();

    const state = store.getState();
    expect(state.chat).toEqual([]);
    expect(state.chatBusy).toBe(false);
    expect(state.chatError).toBeNull();
  });
});
