import { describe, expect, it } from 'vitest';
import { applyQuarantine } from '../pii/quarantine';
import { sampleModel } from '../fixtures/build';
import type { SurveyModel } from '../types';
import {
  computeStats,
  segmentStats,
  type ChoiceStats,
  type NumericStats,
  type QuestionStats,
  type RatingStats,
  type TextStats,
} from './engine';

// All expectations below are hand-computed from src/fixtures/build.ts's raw
// arrays (SATISFACTION, LEADERSHIP_SUPPORT, RECOMMEND, CAMPUSES, ROLES,
// RESOURCES, WORKING_WELL, COULD_IMPROVE) - see the task-4 report for the
// arithmetic. The model goes through applyQuarantine first, exactly like the
// real pipeline, so ID/Start time/Completion time/Email/Name are excluded.
function model(): SurveyModel {
  return applyQuarantine(sampleModel());
}

function findStats(questions: QuestionStats[], title: string): QuestionStats {
  const qs = questions.find((q) => q.title === title);
  if (!qs) throw new Error(`fixture missing stats for question titled "${title}"`);
  return qs;
}

describe('computeStats (fixture staff survey)', () => {
  const digest = computeStats(model());

  it('reports respondentCount and completionRate for the 14-row fixture (no missing answers)', () => {
    expect(digest.respondentCount).toBe(14);
    expect(digest.completionRate).toBe(1);
  });

  it('includes only the 8 analysable questions (excludes meta + quarantined ID/Start/Completion/Email/Name)', () => {
    expect(digest.questions).toHaveLength(8);
    const titles = digest.questions.map((q) => q.title);
    expect(titles).not.toContain('ID');
    expect(titles).not.toContain('Start time');
    expect(titles).not.toContain('Completion time');
    expect(titles).not.toContain('Email');
    expect(titles).not.toContain('Name');
  });

  it('computes campus (choice) counts: Glen Waverley 5, St Kilda Rd 5, Elsternwick 4', () => {
    const stats = findStats(digest.questions, 'Which campus are you based at?') as QuestionStats & ChoiceStats;
    expect(stats.kind).toBe('choice');
    expect(stats.answered).toBe(14);
    // Tie at count 5 broken alphabetically: "Glen Waverley" < "St Kilda Rd".
    expect(stats.counts).toEqual([
      { option: 'Glen Waverley', count: 5, pct: 35.7 },
      { option: 'St Kilda Rd', count: 5, pct: 35.7 },
      { option: 'Elsternwick', count: 4, pct: 28.6 },
    ]);
  });

  it('computes role (choice) counts: Teacher 7, Support staff 4, Leadership 3', () => {
    const stats = findStats(digest.questions, 'Your role') as QuestionStats & ChoiceStats;
    expect(stats.counts).toEqual([
      { option: 'Teacher', count: 7, pct: 50 },
      { option: 'Support staff', count: 4, pct: 28.6 },
      { option: 'Leadership', count: 3, pct: 21.4 },
    ]);
  });

  it('computes satisfaction (1-5 rating) mean/median/favourability from SATISFACTION=[4,5,3,2,4,5,1,3,4,5,2,4,3,5]', () => {
    const stats = findStats(digest.questions, 'How satisfied are you with communication? (1-5)') as QuestionStats &
      RatingStats;
    expect(stats.kind).toBe('rating');
    expect(stats.answered).toBe(14);
    // sum=50, 50/14=3.571428... -> 3.57
    expect(stats.mean).toBe(3.57);
    // sorted [1,2,2,3,3,3,4,4,4,4,5,5,5,5], median = avg(7th,8th) = (4+4)/2
    expect(stats.median).toBe(4);
    // span=4; fav >= 1+2.8=3.8 (values 4,5: 4+4=8/14=57.1%); unfav <= 1+1.2=2.2 (values 1,2: 1+2=3/14=21.4%)
    expect(stats.favourablePct).toBe(57.1);
    expect(stats.unfavourablePct).toBe(21.4);
    expect(stats.neutralPct).toBe(21.4);
    expect(stats.distribution).toEqual([
      { value: 1, count: 1, pct: 7.1 },
      { value: 2, count: 2, pct: 14.3 },
      { value: 3, count: 3, pct: 21.4 },
      { value: 4, count: 4, pct: 28.6 },
      { value: 5, count: 4, pct: 28.6 },
    ]);
  });

  it('computes leadership support (likert-labelled rating) with the same value distribution as satisfaction', () => {
    const stats = findStats(digest.questions, 'I feel supported by leadership.') as QuestionStats & RatingStats;
    // LEADERSHIP_SUPPORT normalises to [5,4,3,2,1,4,5,4,3,5,2,4,3,5] - same multiset as satisfaction.
    expect(stats.mean).toBe(3.57);
    expect(stats.median).toBe(4);
    expect(stats.favourablePct).toBe(57.1);
    expect(stats.distribution).toEqual([
      { value: 1, label: 'Strongly disagree', count: 1, pct: 7.1 },
      { value: 2, label: 'Disagree', count: 2, pct: 14.3 },
      { value: 3, label: 'Neither agree nor disagree', count: 3, pct: 21.4 },
      { value: 4, label: 'Agree', count: 4, pct: 28.6 },
      { value: 5, label: 'Strongly agree', count: 4, pct: 28.6 },
    ]);
  });

  it('computes recommend (0-10 rating) mean/median/favourability from RECOMMEND=[8,10,6,4,9,0,7,8,9,10,5,7,6,8]', () => {
    const stats = findStats(
      digest.questions,
      'How likely are you to recommend working here? (0-10)',
    ) as QuestionStats & RatingStats;
    // sum=97, 97/14=6.928571... -> 6.93
    expect(stats.mean).toBe(6.93);
    // sorted [0,4,5,6,6,7,7,8,8,8,9,9,10,10], median = avg(7th,8th) = (7+8)/2
    expect(stats.median).toBe(7.5);
    // span=10; fav >= 7 (7,8,9,10 -> 2+3+2+2=9/14=64.3%); unfav <= 3 (only 0 -> 1/14=7.1%)
    expect(stats.favourablePct).toBe(64.3);
    expect(stats.unfavourablePct).toBe(7.1);
    expect(stats.neutralPct).toBe(28.6);
  });

  it('computes resources (multiChoice) token counts/pcts (pct = count/answered, not count/total tokens)', () => {
    const stats = findStats(digest.questions, 'Which resources do you use?') as QuestionStats & ChoiceStats;
    expect(stats.kind).toBe('choice');
    expect(stats.answered).toBe(14);
    expect(stats.counts).toEqual([
      { option: 'Library', count: 7, pct: 50 },
      { option: 'Printing', count: 5, pct: 35.7 },
      { option: 'Wifi', count: 5, pct: 35.7 },
      { option: 'IT Helpdesk', count: 4, pct: 28.6 },
      { option: 'Parking', count: 3, pct: 21.4 },
      { option: 'Meeting rooms', count: 2, pct: 14.3 },
    ]);
  });

  it('scrubs the planted "Mr Chen" comment and computes working-well sentiment/themes', () => {
    const stats = findStats(digest.questions, 'What is working well?') as QuestionStats & TextStats;
    expect(stats.kind).toBe('text');
    expect(stats.answered).toBe(14);
    expect(stats.comments).toHaveLength(14);
    expect(stats.comments).not.toContain(
      'Mr Chen in the science department is always willing to help with new ideas.',
    );
    expect(stats.comments[2]).toBe('[name] in the science department is always willing to help with new ideas.');
    expect(stats.comments.join(' ')).not.toContain('Chen');
    // Hand-scored word-by-word against the sentiment lexicon: 9 pos, 1 neg
    // ("stressful"), 4 neu.
    expect(stats.sentiment).toEqual({ pos: 9, neg: 1, neu: 4 });
    // Hand-counted repeated content words (count>=2, stopwords removed):
    // "new" appears 5x, "staff" 3x, then a 5-way tie at count 2.
    expect(stats.themes).toEqual([
      { term: 'new', count: 5 },
      { term: 'staff', count: 3 },
      { term: 'days', count: 2 },
      { term: 'easier', count: 2 },
      { term: 'improved', count: 2 },
      { term: 'made', count: 2 },
      { term: 'team', count: 2 },
    ]);
  });

  it('scrubs the planted email+phone from the could-improve comment and computes its sentiment/themes', () => {
    const stats = findStats(digest.questions, 'What could be improved?') as QuestionStats & TextStats;
    expect(stats.answered).toBe(14);
    // Planted PII: "Contact me on john.smith@example.com or 0412 345 678 if you want more detail."
    expect(stats.comments.join(' ')).not.toContain('john.smith@example.com');
    expect(stats.comments.join(' ')).not.toContain('0412 345 678');
    expect(stats.comments[3]).toBe('Contact me on [email] or [phone] if you want more detail.');
    // Hand-scored: 3 pos, 4 neg, 7 neu.
    expect(stats.sentiment).toEqual({ pos: 3, neg: 4, neu: 7 });
    // Hand-counted repeated content words - a 6-way tie at count 2.
    expect(stats.themes).toEqual([
      { term: 'bit', count: 2 },
      { term: 'help', count: 2 },
      { term: 'notice', count: 2 },
      { term: 'out', count: 2 },
      { term: 'staff', count: 2 },
      { term: 'use', count: 2 },
    ]);
  });

  it('computes commentCount as the total answered across both text questions (14+14)', () => {
    expect(digest.commentCount).toBe(28);
  });

  it('computes overallFavourablePct as the mean of the 3 rating favourablePcts (57.1, 57.1, 64.3 -> 59.5)', () => {
    expect(digest.overallFavourablePct).toBe(59.5);
  });
});

describe('computeStats (synthetic edge cases not present in the fixture)', () => {
  it('returns null overallFavourablePct and 0 commentCount when there are no ratings/text questions', () => {
    const choiceOnly: SurveyModel = {
      title: 'choice only',
      questions: [{ id: 'q0', title: 'Pick one', type: 'choice', quarantined: false }],
      rows: [['A'], ['B'], ['A']],
      respondentCount: 3,
    };
    const digest = computeStats(choiceOnly);
    expect(digest.overallFavourablePct).toBeNull();
    expect(digest.commentCount).toBe(0);
  });

  it('computes NumericStats mean/median/min/max for a plain numeric column', () => {
    const numericModel: SurveyModel = {
      title: 'numeric fixture',
      questions: [{ id: 'q0', title: 'Age', type: 'numeric', quarantined: false }],
      rows: [[10], [20], [30], [40]],
      respondentCount: 4,
    };
    const digest = computeStats(numericModel);
    const stats = digest.questions[0] as QuestionStats & NumericStats;
    expect(stats).toEqual({
      questionId: 'q0',
      title: 'Age',
      kind: 'numeric',
      answered: 4,
      mean: 25,
      median: 25,
      min: 10,
      max: 40,
    });
  });

  it('excludes null cells from answered/completionRate for a partially-answered question', () => {
    const partialModel: SurveyModel = {
      title: 'partial fixture',
      questions: [{ id: 'q0', title: 'Comment', type: 'text', quarantined: false }],
      rows: [['good'], [null], ['bad']],
      respondentCount: 3,
    };
    const digest = computeStats(partialModel);
    expect(digest.questions[0].kind === 'text' && digest.questions[0].answered).toBe(2);
    // completionRate = mean(answered/respondentCount) over analysable questions = 2/3
    expect(digest.completionRate).toBeCloseTo(0.6667, 4);
  });
});

describe('segmentStats (fixture staff survey, segmented by campus q5)', () => {
  const groups = segmentStats(model(), 'q5');

  it('groups by n desc, then value asc on ties (Glen Waverley=5 and St Kilda Rd=5 tie, Elsternwick=4 last)', () => {
    expect(groups.map((g) => [g.value, g.n])).toEqual([
      ['Glen Waverley', 5],
      ['St Kilda Rd', 5],
      ['Elsternwick', 4],
    ]);
  });

  it('computes Glen Waverley group rating means (q7=3, q8=4, q9=7) and choice pcts', () => {
    const glenWaverley = groups.find((g) => g.value === 'Glen Waverley');
    expect(glenWaverley).toEqual({
      value: 'Glen Waverley',
      n: 5,
      ratingMeans: { q7: 3, q8: 4, q9: 7 },
      choicePcts: {
        q5: { 'Glen Waverley': 100 },
        q6: { Teacher: 60, Leadership: 20, 'Support staff': 20 },
      },
    });
  });

  it('computes St Kilda Rd group rating means (q7=3.8, q8=3.2, q9=8) and choice pcts', () => {
    const stKildaRd = groups.find((g) => g.value === 'St Kilda Rd');
    expect(stKildaRd).toEqual({
      value: 'St Kilda Rd',
      n: 5,
      ratingMeans: { q7: 3.8, q8: 3.2, q9: 8 },
      choicePcts: {
        q5: { 'St Kilda Rd': 100 },
        q6: { Teacher: 60, 'Support staff': 20, Leadership: 20 },
      },
    });
  });

  it('computes Elsternwick group rating means (q7=4, q8=3.5, q9=5.5) and choice pcts', () => {
    const elsternwick = groups.find((g) => g.value === 'Elsternwick');
    expect(elsternwick).toEqual({
      value: 'Elsternwick',
      n: 4,
      ratingMeans: { q7: 4, q8: 3.5, q9: 5.5 },
      choicePcts: {
        q5: { Elsternwick: 100 },
        q6: { 'Support staff': 50, Leadership: 25, Teacher: 25 },
      },
    });
  });

  it('throws for an unknown segment question id', () => {
    expect(() => segmentStats(model(), 'q999')).toThrow();
  });
});

describe('segmentStats (synthetic: skips rows with an empty segment value)', () => {
  const segModel: SurveyModel = {
    title: 'segment fixture',
    questions: [
      { id: 'q0', title: 'Team', type: 'choice', quarantined: false },
      { id: 'q1', title: 'Score', type: 'rating', quarantined: false, scale: { min: 1, max: 5 } },
    ],
    rows: [
      ['A', 4],
      ['A', 2],
      ['B', 5],
      [null, 3], // no segment value - must be excluded from every group
      ['', 1], // blank segment value - must be excluded too
    ],
    respondentCount: 5,
  };

  it('only groups the 3 rows with a non-empty segment value', () => {
    const groups = segmentStats(segModel, 'q0');
    expect(groups).toEqual([
      { value: 'A', n: 2, ratingMeans: { q1: 3 }, choicePcts: { q0: { A: 100 } } },
      { value: 'B', n: 1, ratingMeans: { q1: 5 }, choicePcts: { q0: { B: 100 } } },
    ]);
  });
});
