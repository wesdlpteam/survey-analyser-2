// App-wide zustand store: wires the parser -> quarantine -> stats -> fallback
// audit pipeline (Tasks 2-5) to the UI. Later tasks depend on the exact
// AppState field names listed in the Task 6 brief - don't rename them.
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { AuditReport } from '../ai/auditTypes';
import { AiError, chatText, type AiErrorKind } from '../ai/client';
import { buildFallbackAudit } from '../ai/fallback';
import { chatSystemPrompt, digestForAi } from '../ai/prompts';
import { runAiAudit } from '../ai/runAudit';
import { sampleModel } from '../fixtures/build';
import { parseWorkbook } from '../parser/formsParser';
import { applyQuarantine } from '../pii/quarantine';
import type { StatsDigest } from '../stats/engine';
import { computeStats } from '../stats/engine';
import { ParseError, type SurveyModel } from '../types';

const KEY_STORAGE_KEY = 'wsa2:key';
const MODEL_STORAGE_KEY = 'wsa2:model';
const DEFAULT_AI_MODEL = 'gpt-4o-mini';
const GENERIC_LOAD_ERROR = "We couldn't read that file. Is it a Microsoft Forms .xlsx export?";
// Task 10 (Ask tab): only the last N turns of the chat go to the API on any
// one request - keeps the prompt (and the privacy surface) bounded even in a
// very long conversation. The full history still shows in the UI.
const CHAT_HISTORY_CAP = 12;

// Plain-English translations of AiError kinds for aiError - never the raw
// AiError.message (which may describe an HTTP status code, not something a
// non-technical reader needs).
const AI_ERROR_MESSAGES: Record<AiErrorKind, string> = {
  auth: "That API key wasn't accepted. Check it in Settings and try again.",
  rate: 'OpenAI is busy right now. Wait a moment and try again.',
  // 'network' also covers non-401/429 HTTP failures (403/500/quota) where
  // the connection itself worked - so the copy can't promise the problem is
  // the user's internet, only suggest it as one thing to check.
  network: "We couldn't get an answer from OpenAI. Check your internet connection and try again.",
  'bad-response': "OpenAI sent back something we couldn't use. Try again.",
};

// localStorage can throw (private browsing, storage disabled) - every call
// is wrapped so a storage failure never breaks the app.
function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore - key just won't persist this session
  }
}

export interface AppState {
  phase: 'landing' | 'analysing' | 'report';
  model: SurveyModel | null;
  digest: StatsDigest | null;
  audit: AuditReport | null;
  context: string;
  setContext(s: string): void;
  apiKey: string;
  setApiKey(k: string): void;
  aiModel: string;
  setAiModel(m: string): void;
  aiStatus: 'idle' | 'running' | 'done' | 'error';
  aiError: string | null;
  // Re-runs the AI audit against the current digest (report header's Retry
  // button). No-op if there's no key or no digest loaded.
  retryAiAudit(): void;
  loadFile(f: File): Promise<void>;
  loadSample(): void;
  reset(): void;
  error: string | null;

  // --- quarantine override state (QuarantinePanel) -----------------------
  // The parsed-but-not-yet-quarantined model, kept so overrides can be
  // recomputed from scratch every time rather than mutating quarantined
  // state in place.
  rawModel: SurveyModel | null;
  // Extra question ids the user chose to exclude on top of auto-quarantine.
  manualExcluded: string[];
  // Question ids auto-quarantined by a value-shape scan ("looks-personal")
  // that the user has chosen to restore back into analysis.
  restored: string[];
  setManualExcluded(ids: string[]): void;
  toggleRestore(questionId: string): void;

  // --- Task 8: Audit tab cover title (additive) ---------------------------
  // The editable audit report title (AuditTab's cover block pencil-to-input
  // control). Lives in the store, not local component state, because Task
  // 11's export needs the user's edited title, not the raw survey filename.
  // Defaults to the survey's own title on load; cleared on reset().
  reportTitle: string;
  setReportTitle(title: string): void;

  // --- Task 10: Ask tab (chat) --------------------------------------------
  // Full local conversation, oldest first - shown in full in the UI. NOT
  // persisted (in-memory only): a page reload or reset() loses it, same as
  // model/digest/audit.
  chat: { role: 'user' | 'assistant'; content: string }[];
  chatBusy: boolean;
  // Friendly per-kind message for the most recent failed ask(), or null.
  // Shown as an inline note near the input, never as a fake assistant
  // message - a chat bubble claiming to be the AI's answer when it isn't
  // would be actively misleading to a non-technical reader.
  chatError: string | null;
  // Sends q plus the capped recent history to OpenAI, grounded in the
  // current digest. Never rejects: any failure is caught and turned into
  // chatError so a caller (the UI) never needs a try/catch.
  ask(q: string): Promise<void>;
}

// Applies quarantine to the raw model, then layers manual overrides on top:
// restored looks-personal columns are re-included; manually excluded columns
// are force-quarantined with reason 'manual'.
function buildOverriddenModel(rawModel: SurveyModel, manualExcluded: string[], restored: string[]): SurveyModel {
  const quarantined = applyQuarantine(rawModel);
  const restoredSet = new Set(restored);
  const excludedSet = new Set(manualExcluded);
  const questions = quarantined.questions.map((q) => {
    if (q.quarantined && q.quarantineReason === 'looks-personal' && restoredSet.has(q.id)) {
      return { ...q, quarantined: false, quarantineReason: undefined };
    }
    if (!q.quarantined && excludedSet.has(q.id)) {
      return { ...q, quarantined: true, quarantineReason: 'manual' };
    }
    return q;
  });
  return { ...quarantined, questions };
}

interface PipelineResult {
  model: SurveyModel;
  digest: StatsDigest;
  audit: AuditReport;
}

function runPipeline(rawModel: SurveyModel, manualExcluded: string[], restored: string[]): PipelineResult {
  const model = buildOverriddenModel(rawModel, manualExcluded, restored);
  const digest = computeStats(model);
  const audit = buildFallbackAudit(digest);
  return { model, digest, audit };
}

// Kicks off (or resets) the AI audit for whatever digest is currently in the
// store. Called right after every runPipeline() set(), so the AI audit
// re-runs on the exact same triggers as the fallback rebuild (initial load,
// quarantine override changes) - no separate trigger path to keep in sync.
// A stale-digest guard (object identity) means a slow reply left over from
// an earlier pipeline run can never clobber state a newer run already set;
// on success it replaces `audit` (same AuditReport shape the fallback used,
// so AuditTab needs no changes); on AiError it leaves the fallback `audit`
// already set by runPipeline untouched and only records aiStatus/aiError.
function runAiAuditIfKeyed(set: (partial: Partial<AppState>) => void, get: () => AppState): void {
  const { apiKey, digest, context, aiModel } = get();
  if (apiKey === '' || digest === null) {
    set({ aiStatus: 'idle', aiError: null });
    return;
  }
  const requestDigest = digest;
  set({ aiStatus: 'running', aiError: null });
  runAiAudit(requestDigest, context, apiKey, aiModel)
    .then((report) => {
      if (get().digest !== requestDigest) return; // superseded - drop this stale reply
      set({ audit: report, aiStatus: 'done', aiError: null });
    })
    .catch((e: unknown) => {
      if (get().digest !== requestDigest) return;
      const kind = e instanceof AiError ? e.kind : 'network';
      set({ aiStatus: 'error', aiError: AI_ERROR_MESSAGES[kind] });
    });
}

export function createAppStore(): UseBoundStore<StoreApi<AppState>> {
  return create<AppState>((set, get) => ({
    phase: 'landing',
    model: null,
    digest: null,
    audit: null,
    context: '',
    setContext: (s) => set({ context: s }),
    apiKey: readStorage(KEY_STORAGE_KEY),
    setApiKey: (k) => {
      writeStorage(KEY_STORAGE_KEY, k);
      set({ apiKey: k });
    },
    aiModel: readStorage(MODEL_STORAGE_KEY) || DEFAULT_AI_MODEL,
    setAiModel: (m) => {
      writeStorage(MODEL_STORAGE_KEY, m);
      set({ aiModel: m });
    },
    aiStatus: 'idle',
    aiError: null,
    retryAiAudit: () => runAiAuditIfKeyed(set, get),
    error: null,

    rawModel: null,
    manualExcluded: [],
    restored: [],
    reportTitle: '',
    setReportTitle: (title) => set({ reportTitle: title }),

    chat: [],
    chatBusy: false,
    chatError: null,
    async ask(q) {
      const { apiKey, digest, context, aiModel, chat } = get();
      const question = q.trim();
      // Defensive no-op: the UI hides the input entirely without a key or a
      // digest, and never sends a blank question, so these should be
      // unreachable in practice - kept anyway so ask() is safe to call.
      if (apiKey === '' || digest === null || question === '') return;

      // Same stale-reply identity guard runAiAuditIfKeyed uses: if the digest
      // object this question was grounded in is no longer the one in state
      // (reset, a new survey load, or a quarantine override re-ran the
      // pipeline), the answer describes data the user is no longer looking at
      // - drop it rather than appending an orphan/misleading bubble or a
      // stale error. chatBusy is still cleared on the bail because, unlike
      // reset/load (which clear it themselves), a quarantine override doesn't
      // touch chat state - without this the UI would stay on "Thinking"
      // forever with Send disabled.
      const requestDigest = digest;
      const nextChat = [...chat, { role: 'user' as const, content: question }];
      set({ chat: nextChat, chatBusy: true, chatError: null });

      const toSend = nextChat.slice(-CHAT_HISTORY_CAP);
      try {
        const reply = await chatText({
          key: apiKey,
          model: aiModel,
          system: chatSystemPrompt(digestForAi(requestDigest, context)),
          messages: toSend,
        });
        if (get().digest !== requestDigest) {
          set({ chatBusy: false }); // superseded - drop this stale reply
          return;
        }
        set((s) => ({
          chat: [...s.chat, { role: 'assistant', content: reply }],
          chatBusy: false,
          chatError: null,
        }));
      } catch (e) {
        if (get().digest !== requestDigest) {
          set({ chatBusy: false }); // superseded - drop this stale error too
          return;
        }
        const kind = e instanceof AiError ? e.kind : 'network';
        set({ chatBusy: false, chatError: AI_ERROR_MESSAGES[kind] });
      }
    },

    async loadFile(file) {
      set({ phase: 'analysing', error: null });
      try {
        const bytes = await file.arrayBuffer();
        const rawModel = parseWorkbook(bytes, file.name);
        const { model, digest, audit } = runPipeline(rawModel, [], []);
        // Chat state is cleared on every load (success AND failure) because
        // any existing conversation was grounded in the previous survey's
        // digest - keeping it under a new report would mislead the reader.
        set({
          rawModel,
          model,
          digest,
          audit,
          manualExcluded: [],
          restored: [],
          phase: 'report',
          error: null,
          reportTitle: `${model.title} Audit Report`,
          chat: [],
          chatBusy: false,
          chatError: null,
        });
        runAiAuditIfKeyed(set, get);
      } catch (e) {
        const message = e instanceof ParseError ? e.message : GENERIC_LOAD_ERROR;
        set({
          phase: 'landing',
          error: message,
          rawModel: null,
          model: null,
          digest: null,
          audit: null,
          chat: [],
          chatBusy: false,
          chatError: null,
        });
        runAiAuditIfKeyed(set, get);
      }
    },

    loadSample() {
      const rawModel = sampleModel();
      const { model, digest, audit } = runPipeline(rawModel, [], []);
      // Chat cleared for the same reason as loadFile: the old conversation
      // was grounded in the old digest.
      set({
        rawModel,
        model,
        digest,
        audit,
        manualExcluded: [],
        restored: [],
        phase: 'report',
        error: null,
        reportTitle: `${model.title} Audit Report`,
        chat: [],
        chatBusy: false,
        chatError: null,
      });
      runAiAuditIfKeyed(set, get);
    },

    reset() {
      set({
        phase: 'landing',
        model: null,
        digest: null,
        audit: null,
        rawModel: null,
        manualExcluded: [],
        restored: [],
        context: '',
        error: null,
        aiStatus: 'idle',
        aiError: null,
        reportTitle: '',
        chat: [],
        chatBusy: false,
        chatError: null,
      });
    },

    setManualExcluded(ids) {
      const { rawModel, restored } = get();
      if (!rawModel) return;
      const { model, digest, audit } = runPipeline(rawModel, ids, restored);
      set({ manualExcluded: ids, model, digest, audit });
      runAiAuditIfKeyed(set, get);
    },

    toggleRestore(questionId) {
      const { rawModel, restored, manualExcluded, model } = get();
      if (!rawModel) return;
      const question = model?.questions.find((q) => q.id === questionId);
      // Only value-shape ("looks-personal") quarantines are restorable; a
      // hard header rule (name/email/phone/identifier/metadata/manual) is
      // never touched here.
      const isRestorableReason =
        question?.quarantineReason === 'looks-personal' || restored.includes(questionId);
      if (!isRestorableReason) return;

      const nextRestored = restored.includes(questionId)
        ? restored.filter((id) => id !== questionId)
        : [...restored, questionId];
      const { model: nextModel, digest, audit } = runPipeline(rawModel, manualExcluded, nextRestored);
      set({ restored: nextRestored, model: nextModel, digest, audit });
      runAiAuditIfKeyed(set, get);
    },
  }));
}

export const useApp = createAppStore();
