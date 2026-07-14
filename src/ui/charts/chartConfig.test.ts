// TDD for the pure Chart.js config builders — no rendering here, just the
// labels/data/colour arrays each function hands to Chart.js. Fixture numbers
// below are hand-derived, same idiom as stats/engine.test.ts.
import { describe, expect, it } from 'vitest';
import type { ChoiceStats, RatingStats, SegmentGroup } from '../../stats/engine';
import {
  CATEGORICAL_PALETTE,
  choiceChart,
  GOLD,
  PURPLE,
  RAG_FAV_INK,
  RAG_NEUTRAL_INK,
  RAG_UNFAV_INK,
  ratingChart,
  segmentChart,
} from './chartConfig';

describe('choiceChart', () => {
  const stats: ChoiceStats & { title: string } = {
    kind: 'choice',
    answered: 14,
    title: 'Which campus are you based at?',
    counts: [
      { option: 'Glen Waverley', count: 5, pct: 35.7 },
      { option: 'St Kilda Rd', count: 5, pct: 35.7 },
      { option: 'Elsternwick', count: 4, pct: 28.6 },
    ],
  };

  it('renders horizontal bars (indexAxis y) with one option per row', () => {
    const config = choiceChart(stats);
    expect(config.type).toBe('bar');
    expect(config.options?.indexAxis).toBe('y');
    expect(config.data.labels).toEqual(['Glen Waverley', 'St Kilda Rd', 'Elsternwick']);
  });

  it('plots counts in option order as a single dataset', () => {
    const config = choiceChart(stats);
    expect(config.data.datasets).toHaveLength(1);
    expect(config.data.datasets[0].data).toEqual([5, 5, 4]);
    expect(config.data.datasets[0].label).toBe('Which campus are you based at?');
  });

  it('fills every bar the same brand purple and shows no legend (single series)', () => {
    const config = choiceChart(stats);
    expect(config.data.datasets[0].backgroundColor).toBe(PURPLE);
    expect(config.options?.plugins?.legend?.display).toBe(false);
  });

  it('keeps the tooltip on', () => {
    const config = choiceChart(stats);
    expect(config.options?.plugins?.tooltip?.enabled).toBe(true);
  });
});

describe('ratingChart', () => {
  // SATISFACTION=[4,5,3,2,4,5,1,3,4,5,2,4,3,5]: 1x1, 2x2, 3x3, 4x4, 5x4.
  // span=4; fav >= 1+2.8=3.8 (values 4,5); unfav <= 1+1.2=2.2 (values 1,2).
  const numeric: RatingStats & { title: string } = {
    kind: 'rating',
    answered: 14,
    mean: 3.57,
    median: 4,
    distribution: [
      { value: 1, count: 1, pct: 7.1 },
      { value: 2, count: 2, pct: 14.3 },
      { value: 3, count: 3, pct: 21.4 },
      { value: 4, count: 4, pct: 28.6 },
      { value: 5, count: 4, pct: 28.6 },
    ],
    favourablePct: 57.1,
    neutralPct: 21.4,
    unfavourablePct: 21.4,
    title: 'How satisfied are you with communication? (1-5)',
  };

  it('labels bars by value and plots counts in ascending value order', () => {
    const config = ratingChart(numeric);
    expect(config.type).toBe('bar');
    expect(config.data.labels).toEqual(['1', '2', '3', '4', '5']);
    expect(config.data.datasets[0].data).toEqual([1, 2, 3, 4, 4]);
  });

  it('colours bars by favourability: unfav (1,2) red, neutral (3) amber, fav (4,5) green', () => {
    const config = ratingChart(numeric);
    expect(config.data.datasets[0].backgroundColor).toEqual([
      RAG_UNFAV_INK,
      RAG_UNFAV_INK,
      RAG_NEUTRAL_INK,
      RAG_FAV_INK,
      RAG_FAV_INK,
    ]);
  });

  it('shows no legend for the single distribution series', () => {
    const config = ratingChart(numeric);
    expect(config.options?.plugins?.legend?.display).toBe(false);
  });

  it('uses Likert labels instead of raw values when the distribution carries them', () => {
    const likert: RatingStats & { title: string } = {
      kind: 'rating',
      answered: 5,
      mean: 3,
      median: 3,
      distribution: [
        { value: 1, label: 'Strongly disagree', count: 1, pct: 20 },
        { value: 3, label: 'Neither agree nor disagree', count: 1, pct: 20 },
        { value: 5, label: 'Strongly agree', count: 3, pct: 60 },
      ],
      favourablePct: 60,
      neutralPct: 20,
      unfavourablePct: 20,
      title: 'I feel supported by leadership.',
    };
    const config = ratingChart(likert);
    expect(config.data.labels).toEqual(['Strongly disagree', 'Neither agree nor disagree', 'Strongly agree']);
  });
});

describe('segmentChart', () => {
  const groups: SegmentGroup[] = [
    {
      value: 'Glen Waverley',
      n: 5,
      ratingMeans: { q7: 4.2 },
      choicePcts: { q6: { Teacher: 60, 'Support staff': 40 } },
    },
    {
      value: 'St Kilda Rd',
      n: 5,
      ratingMeans: { q7: 3 },
      choicePcts: { q6: { Teacher: 40, Leadership: 60 } },
    },
    {
      value: 'Elsternwick',
      n: 4,
      ratingMeans: { q7: 3.5 },
      choicePcts: {},
    },
  ];

  it('rating target: one purple bar per segment value, no legend', () => {
    const config = segmentChart(groups, 'q7', 'Satisfaction by campus');
    expect(config.data.labels).toEqual(['Glen Waverley', 'St Kilda Rd', 'Elsternwick']);
    expect(config.data.datasets).toHaveLength(1);
    expect(config.data.datasets[0].data).toEqual([4.2, 3, 3.5]);
    expect(config.data.datasets[0].backgroundColor).toBe(PURPLE);
    expect(config.options?.plugins?.legend?.display).toBe(false);
  });

  it('choice target: one dataset per option (first-seen order), grouped by segment, categorical colours + legend', () => {
    const config = segmentChart(groups, 'q6', 'Role by campus');
    expect(config.data.labels).toEqual(['Glen Waverley', 'St Kilda Rd', 'Elsternwick']);
    expect(config.data.datasets).toHaveLength(3);
    expect(config.data.datasets.map((d) => d.label)).toEqual(['Teacher', 'Support staff', 'Leadership']);
    // Elsternwick has no q6 data at all -> 0 for every option there.
    expect(config.data.datasets[0].data).toEqual([60, 40, 0]);
    expect(config.data.datasets[1].data).toEqual([40, 0, 0]);
    expect(config.data.datasets[2].data).toEqual([0, 60, 0]);
    expect(config.data.datasets.map((d) => d.backgroundColor)).toEqual([
      CATEGORICAL_PALETTE[0],
      CATEGORICAL_PALETTE[1],
      CATEGORICAL_PALETTE[2],
    ]);
    expect(CATEGORICAL_PALETTE[0]).toBe(PURPLE);
    expect(CATEGORICAL_PALETTE[1]).toBe(GOLD);
    expect(config.options?.plugins?.legend?.display).toBe(true);
  });

  it('a target with neither ratingMeans nor choicePcts data produces an empty-but-valid config', () => {
    const config = segmentChart(groups, 'unknown-question', 'Nothing here');
    expect(config.data.datasets).toHaveLength(0);
  });
});
