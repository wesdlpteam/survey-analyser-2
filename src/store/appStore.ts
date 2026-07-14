// App-wide zustand store: wires the parser -> quarantine -> stats -> fallback
// audit pipeline (Tasks 2-5) to the UI. Later tasks depend on the exact
// AppState field names listed in the Task 6 brief - don't rename them.
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { AuditReport } from '../ai/auditTypes';
import { buildFallbackAudit } from '../ai/fallback';
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
    error: null,

    rawModel: null,
    manualExcluded: [],
    restored: [],
    reportTitle: '',
    setReportTitle: (title) => set({ reportTitle: title }),

    async loadFile(file) {
      set({ phase: 'analysing', error: null });
      try {
        const bytes = await file.arrayBuffer();
        const rawModel = parseWorkbook(bytes, file.name);
        const { model, digest, audit } = runPipeline(rawModel, [], []);
        set({
          rawModel,
          model,
          digest,
          audit,
          manualExcluded: [],
          restored: [],
          phase: 'report',
          error: null,
          reportTitle: `${model.title} — Audit Report`,
        });
      } catch (e) {
        const message = e instanceof ParseError ? e.message : GENERIC_LOAD_ERROR;
        set({ phase: 'landing', error: message, rawModel: null, model: null, digest: null, audit: null });
      }
    },

    loadSample() {
      const rawModel = sampleModel();
      const { model, digest, audit } = runPipeline(rawModel, [], []);
      set({
        rawModel,
        model,
        digest,
        audit,
        manualExcluded: [],
        restored: [],
        phase: 'report',
        error: null,
        reportTitle: `${model.title} — Audit Report`,
      });
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
      });
    },

    setManualExcluded(ids) {
      const { rawModel, restored } = get();
      if (!rawModel) return;
      const { model, digest, audit } = runPipeline(rawModel, ids, restored);
      set({ manualExcluded: ids, model, digest, audit });
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
    },
  }));
}

export const useApp = createAppStore();
