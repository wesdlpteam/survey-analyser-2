// TDD for the whole AI layer (client, prompts, validate, runAudit) in one
// file, matching the brief's file list. fetch is ALWAYS mocked via
// vi.stubGlobal - a real network call in these tests would be both flaky and
// a privacy violation of the test suite itself.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StatsDigest } from '../stats/engine';
import type { SurveyModel } from '../types';
import { computeStats } from '../stats/engine';
import { AI_REQUEST_TIMEOUT_MS, AiError, chatJSON, chatText } from './client';
import { auditSystemPrompt, auditUserPrompt, chatSystemPrompt, digestForAi } from './prompts';
import { validateAudit } from './validate';
import { runAiAudit } from './runAudit';
import type { Rag } from '../ratings/rag';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

// --- client.ts ------------------------------------------------------------

describe('client.ts', () => {
  describe('chatJSON', () => {
    it('parses a valid JSON reply into an object', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse(200, chatCompletion('{"hello":"world"}'))),
      );
      const result = await chatJSON({ key: 'sk-test', model: 'gpt-4o-mini', system: 'sys', user: 'usr' });
      expect(result).toEqual({ hello: 'world' });
    });

    it('sends the key ONLY in the Authorization header, never in the URL or body', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, chatCompletion('{}')));
      vi.stubGlobal('fetch', fetchMock);
      await chatJSON({ key: 'sk-secret-abc', model: 'gpt-4o-mini', system: 'sys', user: 'usr' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).not.toContain('sk-secret-abc');
      expect(init.body).not.toContain('sk-secret-abc');
      expect(init.headers.Authorization).toBe('Bearer sk-secret-abc');
    });

    it('requests response_format json_object', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, chatCompletion('{}')));
      vi.stubGlobal('fetch', fetchMock);
      await chatJSON({ key: 'sk-test', model: 'gpt-4o-mini', system: 'sys', user: 'usr' });

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('a 401 status throws AiError kind "auth"', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'bad key' })));
      const call = chatJSON({ key: 'sk-wrong', model: 'gpt-4o-mini', system: 'sys', user: 'usr' });
      await expect(call).rejects.toBeInstanceOf(AiError);
      await expect(call).rejects.toMatchObject({ kind: 'auth' });
    });

    it('a 429 status throws AiError kind "rate"', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(429, { error: 'slow down' })));
      const call = chatJSON({ key: 'sk-test', model: 'gpt-4o-mini', system: 'sys', user: 'usr' });
      await expect(call).rejects.toMatchObject({ kind: 'rate' });
    });

    it('a rejected fetch (offline / DNS) throws AiError kind "network"', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      const call = chatJSON({ key: 'sk-test', model: 'gpt-4o-mini', system: 'sys', user: 'usr' });
      await expect(call).rejects.toMatchObject({ kind: 'network' });
    });

    it('a response that never arrives times out into AiError kind "network" (bounded AbortController timeout)', async () => {
      // Fails fast (not by hanging) when the timeout constant doesn't exist.
      expect(AI_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
      vi.useFakeTimers();
      try {
        // Mock behaves like real fetch under abort: never resolves on its
        // own, rejects with an AbortError ONLY when the passed signal fires.
        // Optional chaining so a missing signal leaves the promise pending
        // forever (a genuine failure) instead of crashing the executor into
        // a vacuous 'network' rejection.
        const fetchMock = vi.fn(
          (_url: string, init?: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('The operation was aborted.', 'AbortError')),
              );
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const call = chatJSON({ key: 'sk-test', model: 'gpt-4o-mini', system: 'sys', user: 'usr' });
        const assertion = expect(call).rejects.toMatchObject({ kind: 'network' });

        // The request must actually carry an abort signal...
        await vi.advanceTimersByTimeAsync(0);
        const init = fetchMock.mock.calls[0][1];
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(init?.signal?.aborted).toBe(false); // ...that hasn't fired early

        await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS);
        expect(init?.signal?.aborted).toBe(true);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });

    it('a fast success does not leave a dangling timeout timer', async () => {
      vi.useFakeTimers();
      try {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(jsonResponse(200, chatCompletion('{"ok":true}'))),
        );
        await chatJSON({ key: 'sk-test', model: 'gpt-4o-mini', system: 'sys', user: 'usr' });
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('non-JSON content throws AiError kind "bad-response"', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, chatCompletion('not json at all'))));
      const call = chatJSON({ key: 'sk-test', model: 'gpt-4o-mini', system: 'sys', user: 'usr' });
      await expect(call).rejects.toMatchObject({ kind: 'bad-response' });
    });

    it('an auth error message never contains the API key', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'bad key' })));
      try {
        await chatJSON({ key: 'sk-should-never-leak', model: 'gpt-4o-mini', system: 'sys', user: 'usr' });
        expect.unreachable('expected chatJSON to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(AiError);
        expect((e as AiError).message).not.toContain('sk-should-never-leak');
      }
    });
  });

  describe('chatText', () => {
    it('returns the plain text content of the reply', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse(200, chatCompletion('The answer is 42.'))),
      );
      const text = await chatText({
        key: 'sk-test',
        model: 'gpt-4o-mini',
        system: 'sys',
        messages: [{ role: 'user', content: 'What is the answer?' }],
      });
      expect(text).toBe('The answer is 42.');
    });

    it('a 401 status throws AiError kind "auth"', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'bad key' })));
      const call = chatText({ key: 'sk-test', model: 'gpt-4o-mini', system: 'sys', messages: [] });
      await expect(call).rejects.toMatchObject({ kind: 'auth' });
    });
  });
});

// --- prompts.ts -------------------------------------------------------------

function boobyTrappedDigest(): StatsDigest {
  // A quarantined "Home Address" column planted next to a real analysable
  // rating question - proves digestForAi (via computeStats' own guarantee)
  // never lets a quarantined column's title or values through.
  const model: SurveyModel = {
    title: 'Booby trap survey',
    questions: [
      { id: 'q0', title: 'Home Address', type: 'text', quarantined: true, quarantineReason: 'looks-personal' },
      { id: 'q1', title: 'How satisfied are you?', type: 'rating', quarantined: false, scale: { min: 1, max: 5 } },
    ],
    rows: [
      ['123 Fake Street, Nowhere', 4],
      ['456 Fake Street, Nowhere', 5],
    ],
    respondentCount: 2,
  };
  return computeStats(model);
}

function digestWithManyComments(): StatsDigest {
  const comments = Array.from({ length: 70 }, (_, i) => `Scrubbed comment number ${i}`);
  return {
    respondentCount: 70,
    completionRate: 1,
    overallFavourablePct: null,
    commentCount: 70,
    questions: [
      {
        questionId: 'q0',
        title: 'What could be improved?',
        kind: 'text',
        answered: 70,
        comments,
        themes: [],
        sentiment: { pos: 0, neg: 0, neu: 70 },
      },
    ],
  };
}

describe('prompts.ts', () => {
  describe('digestForAi', () => {
    it('never contains a quarantined column title or its values (booby-trapped model)', () => {
      const json = digestForAi(boobyTrappedDigest(), 'Staff engagement survey');
      expect(json).not.toContain('Home Address');
      expect(json).not.toContain('123 Fake Street');
      expect(json).not.toContain('456 Fake Street');
      // the real, analysable question must still be there
      expect(json).toContain('How satisfied are you?');
    });

    it('caps a text question\'s comments at 60, keeping the first 60 scrubbed comments', () => {
      const json = digestForAi(digestWithManyComments(), '');
      const parsed = JSON.parse(json);
      const textQuestion = parsed.questions.find((q: { questionId: string }) => q.questionId === 'q0');
      expect(textQuestion.comments).toHaveLength(60);
      expect(textQuestion.comments[0]).toBe('Scrubbed comment number 0');
      expect(textQuestion.comments[59]).toBe('Scrubbed comment number 59');
      expect(textQuestion.comments).not.toContain('Scrubbed comment number 60');
      // true total is still surfaced so the AI knows it's seeing a sample
      expect(textQuestion.totalComments).toBe(70);
    });

    it('embeds the supplied context string', () => {
      const json = digestForAi(digestWithManyComments(), 'Term 1 staff engagement');
      expect(json).toContain('Term 1 staff engagement');
    });
  });

  describe('auditSystemPrompt', () => {
    it('states the 60-comment sample cap so the AI knows it is seeing a sample', () => {
      expect(auditSystemPrompt()).toMatch(/60/);
    });

    it('instructs the AI to reference questionIds and stay within 1 rag step of the rule rag', () => {
      const prompt = auditSystemPrompt();
      expect(prompt).toMatch(/questionId/i);
      expect(prompt).toMatch(/1 step/i);
    });
  });

  describe('auditUserPrompt / chatSystemPrompt', () => {
    it('auditUserPrompt embeds the digest JSON verbatim', () => {
      const digestJson = '{"respondentCount":5}';
      expect(auditUserPrompt(digestJson)).toContain(digestJson);
    });

    it('chatSystemPrompt embeds the digest JSON and states answers must come only from it', () => {
      const digestJson = '{"respondentCount":5}';
      const prompt = chatSystemPrompt(digestJson);
      expect(prompt).toContain(digestJson);
      expect(prompt).toMatch(/only/i);
    });
  });
});

// --- validate.ts ------------------------------------------------------------

function validateTestDigest(): StatsDigest {
  return {
    respondentCount: 10,
    completionRate: 1,
    overallFavourablePct: 60,
    commentCount: 0,
    questions: [
      {
        questionId: 'q1',
        title: 'How satisfied are you?',
        kind: 'rating',
        answered: 10,
        mean: 3,
        median: 3,
        scaleMin: 1,
        scaleMax: 5,
        distribution: [],
        favourablePct: 60,
        neutralPct: 20,
        unfavourablePct: 20,
      },
    ],
  };
}

function goodPayload(rag: Rag = 'amber') {
  return {
    executiveSummary: '10 people responded and results were mixed.',
    overall: 'amber',
    sections: [
      {
        title: 'How satisfied are you?',
        questionIds: ['q1'],
        rag,
        ragJustification: '60% answered favourably.',
        findings: [{ text: '60% answered favourably.', evidenceQuestionIds: ['q1'] }],
      },
    ],
    themes: [{ theme: 'communication', weight: 'some', sampleQuotes: ['it was fine'] }],
    recommendations: ['Look closer at communication.'],
  };
}

describe('validate.ts', () => {
  describe('validateAudit', () => {
    it('accepts a well-formed payload, sets source "ai", keeps rag when it matches the rule rag exactly', () => {
      const digest = validateTestDigest();
      const report = validateAudit(goodPayload('amber'), digest, { q1: 'amber' });
      expect(report.source).toBe('ai');
      expect(report.sections).toHaveLength(1);
      expect(report.sections[0].rag).toBe('amber');
      expect(report.sections[0].ragSource).toBe('rules');
    });

    it('stamps the model id onto the report when one is passed, so exports name the model not "unknown"', () => {
      const digest = validateTestDigest();
      const report = validateAudit(goodPayload('amber'), digest, { q1: 'amber' }, 'gpt-4o-mini');
      expect(report.model).toBe('gpt-4o-mini');
    });

    it('leaves model undefined when no model id is passed', () => {
      const digest = validateTestDigest();
      const report = validateAudit(goodPayload('amber'), digest, { q1: 'amber' });
      expect(report.model).toBeUndefined();
    });

    it('a rag 1 step off the rule rag is kept as the AI\'s value and marked "ai-adjusted"', () => {
      const digest = validateTestDigest();
      // rule rag amber, AI says green -> distance 1 (allowed adjustment)
      const report = validateAudit(goodPayload('green'), digest, { q1: 'amber' });
      expect(report.sections[0].rag).toBe('green');
      expect(report.sections[0].ragSource).toBe('ai-adjusted');
    });

    it('a rag 2 steps off the rule rag is clamped to the rule rag and marked "rules"', () => {
      const digest = validateTestDigest();
      // rule rag green, AI says red -> distance 2 (rejected, clamped)
      const report = validateAudit(goodPayload('red'), digest, { q1: 'green' });
      expect(report.sections[0].rag).toBe('green');
      expect(report.sections[0].ragSource).toBe('rules');
    });

    it('drops findings that reference an unknown questionId', () => {
      const digest = validateTestDigest();
      const payload = goodPayload('amber');
      payload.sections[0].findings.push({
        text: 'This cites a question that does not exist.',
        evidenceQuestionIds: ['q99-bogus'],
      });
      const report = validateAudit(payload, digest, { q1: 'amber' });
      expect(report.sections[0].findings).toHaveLength(1);
      expect(report.sections[0].findings[0].evidenceQuestionIds).toEqual(['q1']);
    });

    it('drops an entire section whose questionIds are all unknown', () => {
      const digest = validateTestDigest();
      const payload = goodPayload('amber');
      payload.sections.push({
        title: 'Fabricated section',
        questionIds: ['q99-bogus'],
        rag: 'red',
        ragJustification: 'made up',
        findings: [],
      });
      const report = validateAudit(payload, digest, { q1: 'amber' });
      expect(report.sections).toHaveLength(1);
      expect(report.sections[0].title).toBe('How satisfied are you?');
    });

    it('garbage input (not an object) throws AiError kind "bad-response"', () => {
      const digest = validateTestDigest();
      expect(() => validateAudit('just a string', digest, { q1: 'amber' })).toThrow(AiError);
      try {
        validateAudit(null, digest, { q1: 'amber' });
        expect.unreachable('expected validateAudit to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(AiError);
        expect((e as AiError).kind).toBe('bad-response');
      }
    });

    it('garbage input (missing required fields) throws AiError kind "bad-response"', () => {
      const digest = validateTestDigest();
      expect(() => validateAudit({ executiveSummary: 'hi' }, digest, { q1: 'amber' })).toThrow(AiError);
    });
  });
});

// --- runAudit.ts --------------------------------------------------------

describe('runAudit.ts', () => {
  it('builds the digest, calls the chat API, and returns a validated AuditReport with the model name attached', async () => {
    const digest = validateTestDigest();
    const reply = chatCompletion(JSON.stringify(goodPayload('amber')));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, reply));
    vi.stubGlobal('fetch', fetchMock);

    const report = await runAiAudit(digest, 'Staff survey', 'sk-test', 'gpt-4o-mini');

    expect(report.source).toBe('ai');
    expect(report.model).toBe('gpt-4o-mini');
    expect(report.sections).toHaveLength(1);

    // the outbound request must be the OpenAI chat completions endpoint only
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('propagates an AiError from the client (e.g. a 401) without swallowing it', async () => {
    const digest = validateTestDigest();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'bad key' })));
    await expect(runAiAudit(digest, '', 'sk-wrong', 'gpt-4o-mini')).rejects.toMatchObject({ kind: 'auth' });
  });
});
