// RAG (red/amber/green) rating rules — pure functions from a stat to a
// traffic-light colour. No AI involved; every threshold here is exactly the
// brief's numbers so a human can hand-verify any rating shown in the app.
import type { QuestionStats, StatsDigest, TextStats } from '../stats/engine';

export type Rag = 'green' | 'amber' | 'red';

// Favourable-percent thresholds (brief): >=75 green, >=50 amber, else red.
export function ragFromFavourable(pct: number): Rag {
  if (pct >= 75) return 'green';
  if (pct >= 50) return 'amber';
  return 'red';
}

// Sentiment ratio = pos/(pos+neg) — neutral comments don't count either
// way. >=.66 green, >=.4 amber, else red. No pos/neg comments at all ("no
// signal") -> amber, the same "don't know, don't alarm" default used for
// choice/numeric sections in the fallback report.
export function ragFromSentiment(s: { pos: number; neg: number }): Rag {
  const total = s.pos + s.neg;
  if (total === 0) return 'amber';
  const ratio = s.pos / total;
  if (ratio >= 0.66) return 'green';
  if (ratio >= 0.4) return 'amber';
  return 'red';
}

// rating -> favourablePct, text -> sentiment; choice/numeric have no
// favourable/unfavourable notion, so null (caller decides the fallback —
// fallback.ts shows those sections as amber "no signal").
export function questionRag(q: QuestionStats): Rag | null {
  if (q.kind === 'rating') return ragFromFavourable(q.favourablePct);
  if (q.kind === 'text') return ragFromSentiment(q.sentiment);
  return null;
}

// Whole-survey colour: prefer the digest's own headline number
// (overallFavourablePct) since it's the most literal "how favourable were
// people" signal. A survey with no rating questions falls back to
// aggregate comment sentiment across all text questions; a survey with
// neither (choice/numeric only) has no favourability signal at all, so
// it's amber — the same "no signal" default used everywhere else here.
export function overallRag(d: StatsDigest): Rag {
  if (d.overallFavourablePct !== null) return ragFromFavourable(d.overallFavourablePct);
  const textQuestions = d.questions.filter((q): q is QuestionStats & TextStats => q.kind === 'text');
  if (textQuestions.length > 0) {
    const totals = textQuestions.reduce(
      (acc, q) => ({ pos: acc.pos + q.sentiment.pos, neg: acc.neg + q.sentiment.neg }),
      { pos: 0, neg: 0 },
    );
    return ragFromSentiment(totals);
  }
  return 'amber';
}
