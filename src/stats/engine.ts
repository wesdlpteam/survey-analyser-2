// Local, deterministic stats engine - the sole source of numeric truth in the
// app. Nothing here calls an AI; every number is reproducible by hand from a
// SurveyModel (see engine.test.ts for worked examples against the 14-row
// fixture). Consumes a model that has already been through applyQuarantine -
// analysable = question.type !== 'meta' && !question.quarantined.
import { makeScrubber } from '../pii/scrub';
import type { Question, QType, SurveyModel } from '../types';
import { sentimentCounts } from './sentiment';

export interface ChoiceStats {
  kind: 'choice';
  answered: number;
  counts: { option: string; count: number; pct: number }[];
}
export interface RatingStats {
  kind: 'rating';
  answered: number;
  mean: number;
  median: number;
  // The scale bounds favourability was classified against: the question's
  // declared scale when present, otherwise the observed min/max. Downstream
  // colouring (charts) must use these, never re-derive bounds from the
  // distribution - responses that don't span the scale would shift the
  // fav/unfav cutoffs and contradict favourablePct.
  scaleMin: number;
  scaleMax: number;
  distribution: { value: number; label?: string; count: number; pct: number }[];
  favourablePct: number;
  neutralPct: number;
  unfavourablePct: number;
}
export interface NumericStats {
  kind: 'numeric';
  answered: number;
  mean: number;
  median: number;
  min: number;
  max: number;
}
export interface TextStats {
  kind: 'text';
  answered: number;
  comments: string[]; // scrubbed via makeScrubber(model) - never raw
  themes: { term: string; count: number }[];
  sentiment: { pos: number; neg: number; neu: number };
}
export type QuestionStats = { questionId: string; title: string } & (
  | ChoiceStats
  | RatingStats
  | NumericStats
  | TextStats
);
export interface StatsDigest {
  respondentCount: number;
  completionRate: number; // mean answered/respondentCount over analysable questions, 0..1
  questions: QuestionStats[]; // analysable (non-meta, non-quarantined) only
  overallFavourablePct: number | null; // mean of rating favourablePct, null if no ratings
  commentCount: number;
}
export interface SegmentGroup {
  value: string;
  n: number;
  ratingMeans: Record<string, number>;
  choicePcts: Record<string, Record<string, number>>;
}

// --- rounding ---------------------------------------------------------
// Pcts (0-100 scale) round to 1dp; means/medians round to 2dp. Both go
// through Math.round on a scaled value (not toFixed) so the result stays a
// number, not a string.
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
// completionRate isn't a pct or a mean/median in the brief's rounding rules -
// round to 4dp purely to avoid float noise (e.g. 0.9999999999999999).
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function isAnalysable(q: Question): boolean {
  return q.type !== 'meta' && !q.quarantined;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Favourable rule (brief): span = max-min; fav when v >= min+0.7*span, unfav
// when v <= min+0.3*span, else neutral. For a 1-5 scale this is 4,5 fav /
// 1,2 unfav; for 0-10 it's 7-10 fav / 0-3 unfav.
function favourability(v: number, min: number, max: number): 'fav' | 'unfav' | 'neutral' {
  const span = max - min;
  if (v >= min + 0.7 * span) return 'fav';
  if (v <= min + 0.3 * span) return 'unfav';
  return 'neutral';
}

function columnValues(model: SurveyModel, colIndex: number): (string | number)[] {
  const out: (string | number)[] = [];
  for (const row of model.rows) {
    const v = row[colIndex];
    if (v !== null) out.push(v);
  }
  return out;
}

// --- per-question stats -------------------------------------------------

// Shared by 'choice' and 'multiChoice': a single-select column counts each
// answered cell once; a multi-select column splits on ';' and counts each
// token once - so counts can sum to more than `answered`. Both produce the
// same ChoiceStats shape (the brief has no separate multiChoice stat kind).
function computeChoiceLikeStats(model: SurveyModel, colIndex: number, type: QType): ChoiceStats {
  const raw = columnValues(model, colIndex).map((v) => String(v));
  const answered = raw.length;
  const counts = new Map<string, number>();
  if (type === 'multiChoice') {
    for (const cell of raw) {
      for (const token of cell.split(';')) {
        const t = token.trim();
        if (t === '') continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
  } else {
    for (const v of raw) {
      const t = v.trim();
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const entries = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([option, count]) => ({ option, count, pct: answered === 0 ? 0 : round1((count / answered) * 100) }));
  return { kind: 'choice', answered, counts: entries };
}

function computeRatingStats(model: SurveyModel, question: Question, colIndex: number): RatingStats {
  const raw = columnValues(model, colIndex).map((v) => Number(v));
  const answered = raw.length;
  const min = question.scale?.min ?? (answered ? Math.min(...raw) : 0);
  const max = question.scale?.max ?? (answered ? Math.max(...raw) : 0);
  const labels = question.scale?.labels;

  const counts = new Map<number, number>();
  let fav = 0;
  let unfav = 0;
  let neutral = 0;
  for (const v of raw) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
    const f = favourability(v, min, max);
    if (f === 'fav') fav++;
    else if (f === 'unfav') unfav++;
    else neutral++;
  }

  const distribution = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({
      value,
      ...(labels ? { label: labels[value - min] } : {}),
      count,
      pct: answered === 0 ? 0 : round1((count / answered) * 100),
    }));

  return {
    kind: 'rating',
    answered,
    mean: answered === 0 ? 0 : round2(mean(raw)),
    median: answered === 0 ? 0 : round2(median(raw)),
    scaleMin: min,
    scaleMax: max,
    distribution,
    favourablePct: answered === 0 ? 0 : round1((fav / answered) * 100),
    neutralPct: answered === 0 ? 0 : round1((neutral / answered) * 100),
    unfavourablePct: answered === 0 ? 0 : round1((unfav / answered) * 100),
  };
}

function computeNumericStats(model: SurveyModel, colIndex: number): NumericStats {
  const raw = columnValues(model, colIndex).map((v) => Number(v));
  const answered = raw.length;
  return {
    kind: 'numeric',
    answered,
    mean: answered === 0 ? 0 : round2(mean(raw)),
    median: answered === 0 ? 0 : round2(median(raw)),
    min: answered === 0 ? 0 : Math.min(...raw),
    max: answered === 0 ? 0 : Math.max(...raw),
  };
}

// ~70 common English stopwords (brief asks for "~50 common words incl.
// survey,really,would,could") - articles, pronouns, prepositions, auxiliary
// and modal verbs, plus a few survey-specific filler words. Deliberately
// does NOT include ordinary content words like "new" or "staff" even though
// they're common in staff-survey text - those are exactly the words themes
// should surface.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'so', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them', 'their',
  'this', 'that', 'these', 'those', 'as', 'than', 'then',
  'more', 'most', 'much', 'many', 'some', 'all', 'very', 'just', 'also', 'really', 'too', 'only', 'each', 'other',
  'would', 'could', 'should', 'can', 'will', 'shall', 'must', 'may', 'might',
  'survey', 'because', 'while', 'when', 'where', 'why', 'who', 'which', 'whom', 'there', 'here', 'no', 'not', 'yes',
]);

const THEME_WORD_REGEX = /[\p{L}\p{N}']+/gu;

// Content words for theme-mining: lowercase, strip punctuation (brackets
// around a scrubbed placeholder like "[name]" fall away, leaving "name" as
// an ordinary - usually one-off - word), drop stopwords and short (<=2 char)
// tokens.
function themeWords(text: string): string[] {
  const words = text.toLowerCase().match(THEME_WORD_REGEX) ?? [];
  return words.filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Unigrams + bigrams (adjacent pairs in the stopword-filtered sequence, not
// necessarily adjacent in the original sentence), top 8 by count desc (ties
// alphabetical), count >= 2 only - a term mentioned once isn't a theme.
function extractThemes(comments: string[]): { term: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const comment of comments) {
    const words = themeWords(comment);
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([term, count]) => ({ term, count }));
}

function computeTextStats(model: SurveyModel, colIndex: number, scrub: (text: string) => string): TextStats {
  const comments = columnValues(model, colIndex).map((v) => scrub(String(v)));
  return {
    kind: 'text',
    answered: comments.length,
    comments,
    themes: extractThemes(comments),
    sentiment: sentimentCounts(comments),
  };
}

function computeQuestionStats(
  model: SurveyModel,
  question: Question,
  colIndex: number,
  scrub: (text: string) => string,
): QuestionStats {
  const base = { questionId: question.id, title: question.title };
  switch (question.type) {
    case 'choice':
    case 'multiChoice':
      return { ...base, ...computeChoiceLikeStats(model, colIndex, question.type) };
    case 'rating':
      return { ...base, ...computeRatingStats(model, question, colIndex) };
    case 'numeric':
      return { ...base, ...computeNumericStats(model, colIndex) };
    case 'text':
      return { ...base, ...computeTextStats(model, colIndex, scrub) };
    case 'meta':
      // isAnalysable already excludes 'meta' before this is called.
      throw new Error(`computeQuestionStats: "${question.id}" is meta, not analysable`);
  }
}

export function computeStats(model: SurveyModel): StatsDigest {
  const scrub = makeScrubber(model);
  const analysable = model.questions
    .map((q, colIndex) => ({ q, colIndex }))
    .filter(({ q }) => isAnalysable(q));

  const questions = analysable.map(({ q, colIndex }) => computeQuestionStats(model, q, colIndex, scrub));

  const completionRate =
    analysable.length === 0
      ? 0
      : round4(mean(questions.map((qs) => (model.respondentCount === 0 ? 0 : qs.answered / model.respondentCount))));

  const ratingStats = questions.filter((qs): qs is QuestionStats & RatingStats => qs.kind === 'rating');
  const overallFavourablePct = ratingStats.length === 0 ? null : round1(mean(ratingStats.map((r) => r.favourablePct)));

  const commentCount = questions
    .filter((qs): qs is QuestionStats & TextStats => qs.kind === 'text')
    .reduce((sum, qs) => sum + qs.comments.length, 0);

  return {
    respondentCount: model.respondentCount,
    completionRate,
    questions,
    overallFavourablePct,
    commentCount,
  };
}

// Groups rows by a choice question's answer value, then computes per-group
// rating means and choice option pcts. Rows with an empty segment value
// (null or '') are skipped entirely - they can't be assigned to a group.
// Group order: n desc, then value asc (documented + tested, see
// engine.test.ts - ties happen whenever two segments have equal size).
export function segmentStats(model: SurveyModel, segmentQuestionId: string): SegmentGroup[] {
  const colIndex = model.questions.findIndex((q) => q.id === segmentQuestionId);
  if (colIndex === -1) {
    throw new Error(`segmentStats: unknown question id "${segmentQuestionId}"`);
  }

  const ratingCols = model.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => isAnalysable(q) && q.type === 'rating');
  const choiceCols = model.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => isAnalysable(q) && q.type === 'choice');

  const groups = new Map<string, number[]>(); // segment value -> row indexes
  model.rows.forEach((row, rowIndex) => {
    const raw = row[colIndex];
    if (raw === null) return;
    const value = String(raw).trim();
    if (value === '') return;
    const rowIndexes = groups.get(value) ?? [];
    rowIndexes.push(rowIndex);
    groups.set(value, rowIndexes);
  });

  const result: SegmentGroup[] = [...groups.entries()].map(([value, rowIndexes]) => {
    const ratingMeans: Record<string, number> = {};
    for (const { q, i } of ratingCols) {
      const values = rowIndexes.map((r) => model.rows[r][i]).filter((v): v is number => typeof v === 'number');
      if (values.length > 0) ratingMeans[q.id] = round2(mean(values));
    }

    const choicePcts: Record<string, Record<string, number>> = {};
    for (const { q, i } of choiceCols) {
      const values = rowIndexes
        .map((r) => model.rows[r][i])
        .filter((v): v is string | number => v !== null)
        .map((v) => String(v));
      if (values.length === 0) continue;
      const counts = new Map<string, number>();
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      const pctByOption: Record<string, number> = {};
      for (const [option, count] of counts) pctByOption[option] = round1((count / values.length) * 100);
      choicePcts[q.id] = pctByOption;
    }

    return { value, n: rowIndexes.length, ratingMeans, choicePcts };
  });

  return result.sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}
