import { describe, expect, it } from 'vitest';
import { scoreSentiment, sentimentCounts } from './sentiment';

// Sentiment is lexicon-driven: a comment is 'pos' when it has more positive
// than negative words, 'neg' when the reverse, 'neu' on a tie (including
// zero-zero). These crafted strings are hand-scored against the lexicon.
describe('scoreSentiment', () => {
  it('scores a clearly positive comment as pos', () => {
    // "great" + "helpful" (2 pos, 0 neg)
    expect(scoreSentiment('The team was great and really helpful.')).toBe('pos');
  });

  it('scores a clearly negative comment as neg', () => {
    // "slow" + "confusing" (0 pos, 2 neg)
    expect(scoreSentiment('The system is slow and confusing.')).toBe('neg');
  });

  it('scores a comment with no lexicon hits as neu', () => {
    expect(scoreSentiment('I filled in the form on Tuesday afternoon.')).toBe('neu');
  });

  it('scores a balanced comment (one pos, one neg) as neu', () => {
    // "good" (pos) vs "slow" (neg) -> tie -> neu
    expect(scoreSentiment('The idea is good but the rollout was slow.')).toBe('neu');
  });

  it('counts a batch of comments', () => {
    const counts = sentimentCounts([
      'great and helpful', // pos
      'slow and confusing', // neg
      'filled in the form', // neu
    ]);
    expect(counts).toEqual({ pos: 1, neg: 1, neu: 1 });
  });

  it('is case-insensitive and ignores surrounding punctuation (e.g. a scrubbed placeholder)', () => {
    // "GREAT!" and "[helpful]" both still hit the lexicon (2 pos, 0 neg).
    expect(scoreSentiment('GREAT! Really [helpful].')).toBe('pos');
  });

  it('returns all-zero counts for an empty comment list', () => {
    expect(sentimentCounts([])).toEqual({ pos: 0, neg: 0, neu: 0 });
  });
});
