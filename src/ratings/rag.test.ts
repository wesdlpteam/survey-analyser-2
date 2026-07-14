import { describe, expect, it } from 'vitest';
import { applyQuarantine } from '../pii/quarantine';
import { sampleModel } from '../fixtures/build';
import {
  computeStats,
  type ChoiceStats,
  type NumericStats,
  type QuestionStats,
  type RatingStats,
  type TextStats,
} from '../stats/engine';
import { overallRag, questionRag, ragFromFavourable, ragFromSentiment } from './rag';

function digest() {
  return computeStats(applyQuarantine(sampleModel()));
}

function findStats(questions: QuestionStats[], title: string): QuestionStats {
  const qs = questions.find((q) => q.title === title);
  if (!qs) throw new Error(`fixture missing stats for question titled "${title}"`);
  return qs;
}

describe('ragFromFavourable (thresholds: >=75 green, >=50 amber, else red)', () => {
  it('75 is the green boundary (inclusive)', () => {
    expect(ragFromFavourable(75)).toBe('green');
  });

  it('74.9 falls just short of green -> amber', () => {
    expect(ragFromFavourable(74.9)).toBe('amber');
  });

  it('50 is the amber boundary (inclusive)', () => {
    expect(ragFromFavourable(50)).toBe('amber');
  });

  it('49.9 falls just short of amber -> red', () => {
    expect(ragFromFavourable(49.9)).toBe('red');
  });

  it('100 and 0 sit well inside green/red', () => {
    expect(ragFromFavourable(100)).toBe('green');
    expect(ragFromFavourable(0)).toBe('red');
  });
});

describe('ragFromSentiment (ratio pos/(pos+neg): >=.66 green, >=.4 amber, else red; no signal -> amber)', () => {
  it('ratio exactly .66 is green', () => {
    expect(ragFromSentiment({ pos: 66, neg: 34 })).toBe('green');
  });

  it('ratio .65 falls just short of green -> amber', () => {
    expect(ragFromSentiment({ pos: 65, neg: 35 })).toBe('amber');
  });

  it('ratio exactly .4 is amber', () => {
    expect(ragFromSentiment({ pos: 40, neg: 60 })).toBe('amber');
  });

  it('ratio .39 falls just short of amber -> red', () => {
    expect(ragFromSentiment({ pos: 39, neg: 61 })).toBe('red');
  });

  it('no positive or negative comments at all -> amber (no signal)', () => {
    expect(ragFromSentiment({ pos: 0, neg: 0 })).toBe('amber');
  });
});

describe('questionRag (fixture staff survey)', () => {
  const d = digest();

  it('rating -> ragFromFavourable(favourablePct): satisfaction 57.1% -> amber', () => {
    const stats = findStats(d.questions, 'How satisfied are you with communication? (1-5)') as QuestionStats &
      RatingStats;
    expect(stats.favourablePct).toBe(57.1);
    expect(questionRag(stats)).toBe('amber');
  });

  it('text -> ragFromSentiment(sentiment): working-well {pos:9,neg:1,neu:4} ratio .9 -> green', () => {
    const stats = findStats(d.questions, 'What is working well?') as QuestionStats & TextStats;
    expect(stats.sentiment).toEqual({ pos: 9, neg: 1, neu: 4 });
    expect(questionRag(stats)).toBe('green');
  });

  it('text -> could-improve {pos:3,neg:4,neu:7} ratio 3/7=.4286 -> amber (>=.4)', () => {
    const stats = findStats(d.questions, 'What could be improved?') as QuestionStats & TextStats;
    expect(stats.sentiment).toEqual({ pos: 3, neg: 4, neu: 7 });
    expect(questionRag(stats)).toBe('amber');
  });

  it('choice -> null (no favourable/unfavourable notion)', () => {
    const stats = findStats(d.questions, 'Which campus are you based at?') as QuestionStats & ChoiceStats;
    expect(questionRag(stats)).toBeNull();
  });

  it('numeric -> null', () => {
    const numeric: QuestionStats & NumericStats = {
      questionId: 'q0',
      title: 'Age',
      kind: 'numeric',
      answered: 4,
      mean: 25,
      median: 25,
      min: 10,
      max: 40,
    };
    expect(questionRag(numeric)).toBeNull();
  });
});

describe('overallRag (fixture staff survey)', () => {
  it('overallFavourablePct 59.5 -> amber', () => {
    const d = digest();
    expect(d.overallFavourablePct).toBe(59.5);
    expect(overallRag(d)).toBe('amber');
  });

  it('falls back to aggregate text sentiment when there are no rating questions', () => {
    const textOnly = computeStats({
      title: 'text only',
      questions: [{ id: 'q0', title: 'Comment', type: 'text', quarantined: false }],
      rows: [['This was great and helpful.'], ['Also great.']],
      respondentCount: 2,
    });
    expect(textOnly.overallFavourablePct).toBeNull();
    // Both comments score pos (more pos words than neg), no negatives at
    // all -> ratio 1 -> green.
    expect(overallRag(textOnly)).toBe('green');
  });

  it('is amber (no signal) when there are neither rating nor text questions', () => {
    const choiceOnly = computeStats({
      title: 'choice only',
      questions: [{ id: 'q0', title: 'Pick one', type: 'choice', quarantined: false }],
      rows: [['A'], ['B']],
      respondentCount: 2,
    });
    expect(overallRag(choiceOnly)).toBe('amber');
  });
});
