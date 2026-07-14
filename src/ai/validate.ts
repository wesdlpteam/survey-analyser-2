// Turns the AI's raw JSON reply into a trusted AuditReport. Three jobs:
// 1. Reject anything that isn't shaped like an AuditReport (AiError
//    'bad-response') so a malformed or truncated reply never reaches the UI.
// 2. Drop any finding/section that cites a questionId not in the digest -
//    the AI must never be allowed to invent evidence for a question that
//    doesn't exist (or, worse, imply it saw a quarantined one it was never
//    given).
// 3. Clamp each section's rag to within 1 step of the rule-based rag
//    supplied by the caller for that question, so the AI can nudge a
//    rating by one step (a legitimate judgement call) but never invert the
//    traffic-light the deterministic rules computed.
//
// ragSource reading (documented + tested for all three distances):
//   distance 0 -> AI's rag kept, ragSource 'rules'      (AI agreed with the rule)
//   distance 1 -> AI's rag kept, ragSource 'ai-adjusted' (a legitimate 1-step nudge)
//   distance 2 -> clamped to the rule rag, ragSource 'rules' (AI's call rejected,
//                 so what's shown IS the rule rag - 'rules' is the honest source)
import { overallRag, type Rag } from '../ratings/rag';
import type { StatsDigest } from '../stats/engine';
import type { AuditReport, AuditSection, Finding } from './auditTypes';
import { AiError } from './client';

const RAG_STEP: Record<Rag, number> = { green: 0, amber: 1, red: 2 };
const RAG_VALUES = new Set<string>(['green', 'amber', 'red']);
const THEME_WEIGHTS = new Set(['many', 'some', 'few']);

function isRag(v: unknown): v is Rag {
  return typeof v === 'string' && RAG_VALUES.has(v);
}

function ragDistance(a: Rag, b: Rag): number {
  return Math.abs(RAG_STEP[a] - RAG_STEP[b]);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function badResponse(detail: string): never {
  throw new AiError('bad-response', `The AI response could not be used (${detail}).`);
}

function validateFinding(raw: unknown, knownIds: Set<string>): Finding | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const f = raw as Record<string, unknown>;
  if (typeof f.text !== 'string' || f.text.trim() === '') return null;
  if (!isStringArray(f.evidenceQuestionIds) || f.evidenceQuestionIds.length === 0) return null;
  // A finding citing even one unknown questionId is dropped entirely - a mix
  // of real and fabricated evidence is still fabricated evidence.
  if (f.evidenceQuestionIds.some((id) => !knownIds.has(id))) return null;
  return { text: f.text, evidenceQuestionIds: f.evidenceQuestionIds };
}

function validateSection(
  raw: unknown,
  knownIds: Set<string>,
  ruleRags: Record<string, Rag>,
): AuditSection | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.title !== 'string' || s.title.trim() === '') return null;
  if (!isStringArray(s.questionIds)) return null;

  const questionIds = s.questionIds.filter((id) => knownIds.has(id));
  if (questionIds.length === 0) return null; // every cited question was unknown - drop the section

  if (!isRag(s.rag)) return null;
  if (typeof s.ragJustification !== 'string') return null;
  if (!Array.isArray(s.findings)) return null;

  const ruleRag = ruleRags[questionIds[0]] ?? 'amber';
  const distance = ragDistance(s.rag, ruleRag);
  const rag = distance > 1 ? ruleRag : s.rag;
  const ragSource: AuditSection['ragSource'] = distance === 1 ? 'ai-adjusted' : 'rules';

  const findings = s.findings
    .map((f) => validateFinding(f, knownIds))
    .filter((f): f is Finding => f !== null);

  return { title: s.title, questionIds, rag, ragSource, ragJustification: s.ragJustification, findings };
}

function validateTheme(raw: unknown): AuditReport['themes'][number] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.theme !== 'string' || t.theme.trim() === '') return null;
  if (typeof t.weight !== 'string' || !THEME_WEIGHTS.has(t.weight)) return null;
  if (!isStringArray(t.sampleQuotes)) return null;
  return { theme: t.theme, weight: t.weight as 'many' | 'some' | 'few', sampleQuotes: t.sampleQuotes };
}

export function validateAudit(raw: unknown, d: StatsDigest, ruleRags: Record<string, Rag>): AuditReport {
  if (typeof raw !== 'object' || raw === null) badResponse('not a JSON object');
  const r = raw as Record<string, unknown>;

  if (typeof r.executiveSummary !== 'string' || r.executiveSummary.trim() === '') {
    badResponse('missing executiveSummary');
  }
  if (!isRag(r.overall)) badResponse('missing or invalid overall rag');
  if (!Array.isArray(r.sections)) badResponse('missing sections array');
  if (!Array.isArray(r.themes)) badResponse('missing themes array');
  if (!isStringArray(r.recommendations)) badResponse('missing recommendations array');

  const knownIds = new Set(d.questions.map((q) => q.questionId));

  const sections = r.sections
    .map((s) => validateSection(s, knownIds, ruleRags))
    .filter((s): s is AuditSection => s !== null);

  const themes = r.themes.map((t) => validateTheme(t)).filter((t): t is AuditReport['themes'][number] => t !== null);

  // overall has no ragSource field to record a decision in - it's simply
  // never allowed more than 1 step away from the digest's own overallRag.
  const ruleOverall = overallRag(d);
  const overall: Rag = ragDistance(r.overall, ruleOverall) > 1 ? ruleOverall : r.overall;

  return {
    executiveSummary: r.executiveSummary as string,
    overall,
    sections,
    themes,
    recommendations: r.recommendations as string[],
    source: 'ai',
  };
}
