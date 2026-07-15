// Rule-based AuditReport builder — the audit shown when no AI key is
// configured. Produces the same AuditReport shape Task 9's AI layer will
// produce, so the UI never has to know which source built the report.
// Every sentence here is derived directly from the digest's own numbers;
// nothing calls an AI.
import { overallRag, questionRag, type Rag } from '../ratings/rag';
import type {
  ChoiceStats,
  NumericStats,
  QuestionStats,
  RatingStats,
  StatsDigest,
  TextStats,
} from '../stats/engine';
import type { AuditReport, AuditSection, Finding } from './auditTypes';

function isRating(q: QuestionStats): q is QuestionStats & RatingStats {
  return q.kind === 'rating';
}
function isText(q: QuestionStats): q is QuestionStats & TextStats {
  return q.kind === 'text';
}

// --- per-question findings + justifications ------------------------------

function ratingJustification(q: QuestionStats & RatingStats): string {
  return `${q.favourablePct}% answered favourably`;
}

// Uses scaleMin/scaleMax (the declared/derived scale the favourability split
// was classified against), not the observed distribution's first/last
// entries - those only cover values someone actually picked, so if nobody
// answered at an extreme the range would understate the real scale.
function ratingFinding(q: QuestionStats & RatingStats): Finding {
  return {
    text: `${q.favourablePct}% answered favourably (mean ${q.mean} of ${q.scaleMin}-${q.scaleMax})`,
    evidenceQuestionIds: [q.questionId],
  };
}

function sentimentJustification(q: QuestionStats & TextStats): string {
  const { pos, neg, neu } = q.sentiment;
  return `${pos} positive, ${neg} negative, ${neu} neutral comments`;
}

function textFinding(q: QuestionStats & TextStats): Finding {
  const top = q.themes[0];
  const text = top
    ? `The most common theme was "${top.term}" (mentioned ${top.count} times).`
    : 'No repeated themes emerged from the comments.';
  return { text, evidenceQuestionIds: [q.questionId] };
}

function choiceJustification(): string {
  return 'This is a choice question, so no favourable/unfavourable rating applies.';
}

function choiceFinding(q: QuestionStats & ChoiceStats): Finding {
  const top = q.counts[0];
  const text = top
    ? `The most common answer was "${top.option}", chosen by ${top.pct}% of respondents.`
    : 'No answers were recorded for this question.';
  return { text, evidenceQuestionIds: [q.questionId] };
}

function numericJustification(): string {
  return 'This is a numeric question, so no favourable/unfavourable rating applies.';
}

function numericFinding(q: QuestionStats & NumericStats): Finding {
  return {
    text: `Average response was ${q.mean} (range ${q.min}-${q.max}).`,
    evidenceQuestionIds: [q.questionId],
  };
}

// questionRag returns null for choice/numeric (no favourable notion) —
// those sections show amber, the "no signal" colour used consistently
// across rag.ts, rather than a false green or red.
function buildSection(q: QuestionStats): AuditSection {
  const rag = questionRag(q) ?? 'amber';
  const base = { title: q.title, questionIds: [q.questionId], rag, ragSource: 'rules' as const };
  switch (q.kind) {
    case 'rating':
      return { ...base, ragJustification: ratingJustification(q), findings: [ratingFinding(q)] };
    case 'text':
      return { ...base, ragJustification: sentimentJustification(q), findings: [textFinding(q)] };
    case 'choice':
      return { ...base, ragJustification: choiceJustification(), findings: [choiceFinding(q)] };
    case 'numeric':
      return { ...base, ragJustification: numericJustification(), findings: [numericFinding(q)] };
  }
}

// --- themes (aggregated across all text questions) -----------------------

function themeWeight(count: number): 'many' | 'some' | 'few' {
  if (count >= 5) return 'many';
  if (count >= 3) return 'some';
  return 'few';
}

// term may be a unigram or a bigram ("staff wellbeing") from engine.ts's
// extractThemes — matched as a whole phrase, case-insensitive, with
// unicode word-boundary lookarounds so "new" doesn't match inside "renew".
function containsTerm(comment: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
  return re.test(comment);
}

function sampleQuotesForTerm(term: string, comments: string[]): string[] {
  return comments.filter((c) => containsTerm(c, term)).slice(0, 2);
}

// A term found in more than one text question's themes (e.g. "staff" in
// both "what's working well" and "what could be improved") is merged by
// summing its counts — it's one theme across the whole survey, not two.
function buildThemes(questions: QuestionStats[]): AuditReport['themes'] {
  const textQuestions = questions.filter(isText);
  const merged = new Map<string, number>();
  for (const q of textQuestions) {
    for (const t of q.themes) merged.set(t.term, (merged.get(t.term) ?? 0) + t.count);
  }
  const allComments = textQuestions.flatMap((q) => q.comments);
  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([term, count]) => ({
      theme: term,
      weight: themeWeight(count),
      sampleQuotes: sampleQuotesForTerm(term, allComments),
    }));
}

// --- executive summary -----------------------------------------------------

// Ties keep the first-occurring (in digest.questions order) question, so
// two questions tied at the same favourablePct always resolve the same way.
function pickBestAndWeakest(ratingQuestions: (QuestionStats & RatingStats)[]) {
  let best = ratingQuestions[0];
  let weakest = ratingQuestions[0];
  for (const q of ratingQuestions) {
    if (q.favourablePct > best.favourablePct) best = q;
    if (q.favourablePct < weakest.favourablePct) weakest = q;
  }
  return { best, weakest };
}

// The exec summary is user-facing copy — plain English only, so the
// internal RAG colour words never leak into it.
const OVERALL_PLAIN: Record<Rag, string> = {
  green: 'positive',
  amber: 'mixed',
  red: 'concerning',
};

function buildExecutiveSummary(d: StatsDigest, ratingQuestions: (QuestionStats & RatingStats)[]): string {
  const people = d.respondentCount === 1 ? '1 person' : `${d.respondentCount} people`;
  const sentences: string[] = [`${people} responded to this survey.`];

  if (d.overallFavourablePct !== null) {
    sentences.push(`Overall, ${d.overallFavourablePct}% of rated responses were favourable.`);
  } else {
    sentences.push('There were no rating questions, so no overall favourable percentage could be calculated.');
  }

  if (ratingQuestions.length > 0) {
    const { best, weakest } = pickBestAndWeakest(ratingQuestions);
    sentences.push(`The strongest area was "${best.title}", at ${best.favourablePct}% favourable.`);
    if (weakest.questionId !== best.questionId) {
      sentences.push(
        `The area needing the most attention was "${weakest.title}", at ${weakest.favourablePct}% favourable.`,
      );
    }
  } else {
    // No rating questions to name a best/weakest area — fall back to the
    // whole-survey rating, translated into a plain word so the internal
    // colour code never reaches the reader.
    sentences.push(`Overall, the responses look ${OVERALL_PLAIN[overallRag(d)]}.`);
  }

  return sentences.join(' ');
}

// Recommendations are driven by the REAL rating signal, not the displayed
// section colour: choice/numeric sections carry the amber "no signal"
// default (questionRag(q) === null), and telling the reader to "look
// closer" at neutral information would paint it as a warning — so those
// sections are skipped. questions and sections are parallel arrays
// (sections is built by mapping over d.questions), so index-zipping is safe.
function buildRecommendations(questions: QuestionStats[], sections: AuditSection[]): string[] {
  return sections
    .filter((s, i) => questionRag(questions[i]) !== null && s.rag !== 'green')
    .map((s) => `Look closer at "${s.title}": ${s.ragJustification}`);
}

export function buildFallbackAudit(d: StatsDigest): AuditReport {
  const sections = d.questions.map(buildSection);
  const ratingQuestions = d.questions.filter(isRating);

  return {
    executiveSummary: buildExecutiveSummary(d, ratingQuestions),
    overall: overallRag(d),
    sections,
    themes: buildThemes(d.questions),
    recommendations: buildRecommendations(d.questions, sections),
    source: 'rules',
  };
}
