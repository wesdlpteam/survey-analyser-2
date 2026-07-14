// TDD for the app store pipeline: file -> parse -> quarantine -> stats ->
// fallback audit -> phase 'report'. Every test creates its own store via
// createAppStore() so localStorage stubs and state never leak between tests.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { buildFixtureWorkbook } from '../fixtures/build';
import { createAppStore } from './appStore';

function fixtureFile(name = 'Staff_Survey_2026.xlsx'): File {
  const bytes = buildFixtureWorkbook();
  return new File([bytes], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function headerOnlyFile(): File {
  const worksheet = XLSX.utils.aoa_to_sheet([['Q1', 'Q2']]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([bytes], 'empty.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// Real junk bytes are surprisingly hard to trip XLSX.read up on - most
// gibberish just parses as an empty sheet (a ParseError, already covered by
// the test above). A truncated ZIP local-file-header signature ("PK\x03\x04")
// followed by nonsense makes the library throw a genuine, non-ParseError
// exception, which is what this test needs to exercise the catch-all.
function junkFile(): File {
  const bytes = new TextEncoder().encode('PK\x03\x04garbagegarbagegarbagegarbage');
  return new File([bytes], 'junk.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// In-memory localStorage stub shared by the persistence tests — real jsdom
// localStorage would also work, but a stub lets us assert on write calls and
// simulate "reload" by handing the same backing store to a fresh instance.
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

describe('appStore', () => {
  describe('loadFile happy path', () => {
    it('parses the fixture workbook through to the report phase', async () => {
      const store = createAppStore();
      await store.getState().loadFile(fixtureFile());
      const state = store.getState();

      expect(state.phase).toBe('report');
      expect(state.error).toBeNull();
      expect(state.model?.respondentCount).toBe(14);
      expect(state.digest?.respondentCount).toBe(14);
      expect(state.audit?.source).toBe('rules');
      // quarantine already applied to the model in state
      const email = state.model?.questions.find((q) => q.title === 'Email');
      expect(email?.quarantined).toBe(true);
      expect(email?.quarantineReason).toBe('email');
    });
  });

  describe('loadFile ParseError path', () => {
    it('sets a friendly error and stays on landing when the workbook has no responses', async () => {
      const store = createAppStore();
      await store.getState().loadFile(headerOnlyFile());
      const state = store.getState();

      expect(state.phase).toBe('landing');
      expect(state.error).toBe('This file has no survey responses in it.');
      expect(state.model).toBeNull();
    });
  });

  describe('loadFile junk-bytes path', () => {
    it('never throws and sets a generic friendly error for unreadable bytes', async () => {
      const store = createAppStore();
      await expect(store.getState().loadFile(junkFile())).resolves.toBeUndefined();
      const state = store.getState();

      expect(state.phase).toBe('landing');
      expect(state.error).toBe("We couldn't read that file. Is it a Microsoft Forms .xlsx export?");
      expect(state.model).toBeNull();
    });
  });

  describe('loadSample', () => {
    it('loads the built-in sample straight to report phase', () => {
      const store = createAppStore();
      store.getState().loadSample();
      const state = store.getState();

      expect(state.phase).toBe('report');
      expect(state.model?.respondentCount).toBe(14);
      expect(state.digest).not.toBeNull();
      expect(state.audit).not.toBeNull();
      expect(state.error).toBeNull();
    });

    it('defaults reportTitle from the survey title, with no em-dash (UI copy rule)', () => {
      const store = createAppStore();
      store.getState().loadSample();
      const title = store.getState().reportTitle;
      expect(title).toBe('Staff Survey 2026 Audit Report');
      expect(title).not.toContain('—');
    });
  });

  describe('reset', () => {
    it('clears model/digest/audit/error and returns to landing', () => {
      const store = createAppStore();
      store.getState().loadSample();
      store.getState().reset();
      const state = store.getState();

      expect(state.phase).toBe('landing');
      expect(state.model).toBeNull();
      expect(state.digest).toBeNull();
      expect(state.audit).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('key + model persistence', () => {
    let stub: Storage;

    beforeEach(() => {
      stub = makeLocalStorageStub();
      vi.stubGlobal('localStorage', stub);
    });

    it('defaults apiKey to empty string and aiModel to gpt-4o-mini when storage is empty', () => {
      const store = createAppStore();
      const state = store.getState();
      expect(state.apiKey).toBe('');
      expect(state.aiModel).toBe('gpt-4o-mini');
    });

    it('setApiKey persists to wsa2:key and setAiModel persists to wsa2:model', () => {
      const store = createAppStore();
      store.getState().setApiKey('sk-test-123');
      store.getState().setAiModel('gpt-4o');

      expect(stub.getItem('wsa2:key')).toBe('sk-test-123');
      expect(stub.getItem('wsa2:model')).toBe('gpt-4o');
    });

    it('a fresh store instance (simulated reload) reads the persisted key and model back', () => {
      const first = createAppStore();
      first.getState().setApiKey('sk-reload-me');
      first.getState().setAiModel('gpt-4.1-mini');

      const second = createAppStore();
      expect(second.getState().apiKey).toBe('sk-reload-me');
      expect(second.getState().aiModel).toBe('gpt-4.1-mini');
    });

    it('setApiKey("") forgets the key so a fresh store reads it back as empty', () => {
      const first = createAppStore();
      first.getState().setApiKey('sk-forget-me');
      first.getState().setApiKey('');

      const second = createAppStore();
      expect(second.getState().apiKey).toBe('');
    });
  });

  describe('manual exclude / restore re-runs the pipeline', () => {
    it('manually excluding a previously-analysable column removes it from the digest', () => {
      const store = createAppStore();
      store.getState().loadSample();
      const before = store.getState();
      const campus = before.model!.questions.find((q) => q.title === 'Which campus are you based at?')!;
      expect(campus.quarantined).toBe(false);
      expect(before.digest!.questions.some((q) => q.questionId === campus.id)).toBe(true);

      store.getState().setManualExcluded([campus.id]);
      const after = store.getState();
      const campusAfter = after.model!.questions.find((q) => q.id === campus.id)!;

      expect(campusAfter.quarantined).toBe(true);
      expect(campusAfter.quarantineReason).toBe('manual');
      expect(after.digest!.questions.some((q) => q.questionId === campus.id)).toBe(false);
      // audit is rebuilt too — section count tracks digest.questions
      expect(after.audit!.sections.length).toBe(after.digest!.questions.length);
    });

    it('clearing manualExcluded restores the column to analysis', () => {
      const store = createAppStore();
      store.getState().loadSample();
      const campus = store.getState().model!.questions.find((q) => q.title === 'Which campus are you based at?')!;

      store.getState().setManualExcluded([campus.id]);
      store.getState().setManualExcluded([]);

      const state = store.getState();
      const campusAfter = state.model!.questions.find((q) => q.id === campus.id)!;
      expect(campusAfter.quarantined).toBe(false);
      expect(state.digest!.questions.some((q) => q.questionId === campus.id)).toBe(true);
    });

    it('toggleRestore only re-includes columns quarantined by a value-shape scan (looks-personal)', () => {
      const store = createAppStore();
      store.getState().loadSample();
      const email = store.getState().model!.questions.find((q) => q.title === 'Email')!;
      expect(email.quarantineReason).toBe('email'); // hard header rule, not looks-personal

      // Attempting to restore a hard-rule quarantine must be a no-op.
      store.getState().toggleRestore(email.id);
      const state = store.getState();
      const emailAfter = state.model!.questions.find((q) => q.id === email.id)!;
      expect(emailAfter.quarantined).toBe(true);
      expect(state.digest!.questions.some((q) => q.questionId === email.id)).toBe(false);
    });
  });
});
