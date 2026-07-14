// Pure Chart.js config builders — no rendering, no side effects. ChartCanvas
// hands these straight to `new Chart(canvas, config)`.
//
// Colour rules (see dataviz skill + task-7 brief):
// - choiceChart is a single series (one bar per option) -> nominal
//   categorical, every bar the SAME brand hue (purple), no legend box.
// - ratingChart colours by favourability (state, not identity) -> RAG inks.
// - segmentChart colours by segment identity when the target is a choice
//   question (one dataset per option) -> the fixed 8-hue categorical order.
//
// Palette validator note (scripts/validate_palette.js from the dataviz
// skill, run against this exact 8-hue order): CVD adjacency PASSES cleanly
// (worst adjacent ΔE ~71). Two checks FAIL against the generic OKLCH bands:
// Wesley purple (#4F2759) sits below the light-mode lightness band and its
// chroma reads under the "stays a hue" floor, and green-light (#86C791)
// sits a hair over the lightness ceiling. Both are exact brand hex values
// (task brief: "purple #4F2759 ONLY interactive colour" + brand kit
// mandates), not adjustable without leaving the brand palette, so they're
// accepted as documented deviations. Mitigation: every chart ships direct
// axis/segment labels, a tooltip and a <table> fallback (ChartCanvas), so
// no value ever depends on hue alone. Gold/blue-light/green-light also read
// a contrast WARN (<3:1 fill-vs-surface) — same mitigation applies.
import type { ChartConfiguration } from 'chart.js';
import type { ChoiceStats, RatingStats, SegmentGroup } from '../../stats/engine';

export const PURPLE = '#4F2759';
export const GOLD = '#C59F40';

// Fixed order, never cycled: purple, gold, then blue/green harmonies from
// the Wesley tokens (--wes-blue*, --wes-green*). A segment with more than 8
// distinct values repeats the last slot rather than generating a new hue.
export const CATEGORICAL_PALETTE: readonly string[] = [
  PURPLE,
  GOLD,
  '#2F60C7', // wes-blue
  '#6E9D60', // wes-green
  '#7CA3FF', // wes-blue-light
  '#86C791', // wes-green-light
  '#4242A1', // wes-blue-dark
  '#636656', // wes-green-dark
];

// RAG inks (state colour, reserved meaning) — same family as
// src/ratings/rag.ts's red/amber/green, used here for the per-bar
// favourability of a rating distribution and the sentiment mini-bar.
export const RAG_FAV_INK = '#2c6b1a';
export const RAG_NEUTRAL_INK = '#8a5410';
export const RAG_UNFAV_INK = '#a31817';

function categoricalColor(index: number): string {
  return CATEGORICAL_PALETTE[Math.min(index, CATEGORICAL_PALETTE.length - 1)];
}

// Mirrors src/stats/engine.ts's favourability() exactly (same 70/30 span
// split) so a distribution's bar colours always agree with the
// favourablePct/unfavourablePct numbers already shown elsewhere.
function favourability(v: number, min: number, max: number): 'fav' | 'unfav' | 'neutral' {
  const span = max - min;
  if (v >= min + 0.7 * span) return 'fav';
  if (v <= min + 0.3 * span) return 'unfav';
  return 'neutral';
}

const BAR_SPEC = { borderRadius: 4, borderSkipped: false as const, maxBarThickness: 24 };

export function choiceChart(s: ChoiceStats & { title: string }): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: s.counts.map((c) => c.option),
      datasets: [
        {
          label: s.title,
          data: s.counts.map((c) => c.count),
          backgroundColor: PURPLE,
          ...BAR_SPEC,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  };
}

export function ratingChart(s: RatingStats & { title: string }): ChartConfiguration {
  // Classify with the DECLARED scale bounds the engine used (RatingStats
  // carries them as scaleMin/scaleMax), never bounds re-derived from the
  // observed distribution - when answers don't span the scale (e.g. a 0-10
  // question answered only 6-10), observed bounds would shift the fav/unfav
  // cutoffs and paint bars a colour that contradicts favourablePct.
  const { scaleMin: min, scaleMax: max } = s;

  return {
    type: 'bar',
    data: {
      labels: s.distribution.map((d) => d.label ?? String(d.value)),
      datasets: [
        {
          label: s.title,
          data: s.distribution.map((d) => d.count),
          backgroundColor: s.distribution.map((d) => {
            const f = favourability(d.value, min, max);
            return f === 'fav' ? RAG_FAV_INK : f === 'unfav' ? RAG_UNFAV_INK : RAG_NEUTRAL_INK;
          }),
          ...BAR_SPEC,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  };
}

// Not part of the brief's 3 required builders, but the brief also asks for
// numeric questions to render "as a rating-style distribution" (binned
// histogram bars). Unlike ratingChart there is no favourable/unfavourable
// notion for an arbitrary numeric field (e.g. years of service, class
// size) - colouring low bins red and high bins green would assert a value
// judgement the data doesn't support. So this keeps ratingChart's bar
// layout but uses one neutral brand hue throughout - the dataviz skill's
// "compare magnitude -> sequential, one hue" rule, which for a single
// series degenerates to the same "one brand hue, no legend" treatment as
// choiceChart. ExploreTab extracts raw values from model rows and calls
// binNumeric + this with the result.
const MAX_NUMERIC_BINS = 10;

// Bins raw numeric values for numericChart. When the integer range fits in
// MAX_NUMERIC_BINS (span+1 distinct integers <= 10), every integer gets its
// own bin - including the max, so 1..5 yields exactly 5 bars labelled 1-5.
// Wider ranges split into 10 equal-width buckets with an inclusive top edge
// (the max value always lands in the LAST bin, never merged into the
// penultimate one).
export function binNumeric(values: number[]): { label: string; count: number }[] {
  if (values.length === 0) return [];
  const min = Math.floor(Math.min(...values));
  const max = Math.ceil(Math.max(...values));
  const span = max - min;

  if (span + 1 <= MAX_NUMERIC_BINS) {
    // One bin per integer, min..max inclusive. Non-integer values count
    // toward their nearest integer's bin.
    const counts = new Array<number>(span + 1).fill(0);
    for (const v of values) counts[Math.min(span, Math.max(0, Math.round(v) - min))]++;
    return counts.map((count, i) => ({ label: String(min + i), count }));
  }

  const width = span / MAX_NUMERIC_BINS;
  const counts = new Array<number>(MAX_NUMERIC_BINS).fill(0);
  for (const v of values) {
    // Top edge inclusive: v === max would compute index MAX_NUMERIC_BINS;
    // clamp it into the last bin.
    const idx = Math.min(MAX_NUMERIC_BINS - 1, Math.max(0, Math.floor((v - min) / width)));
    counts[idx]++;
  }
  return counts.map((count, i) => {
    const lo = Math.round(min + i * width);
    const hi = Math.round(min + (i + 1) * width);
    return { label: hi - lo <= 1 ? String(lo) : `${lo}–${hi}`, count };
  });
}

export function numericChart(bins: { label: string; count: number }[], title: string): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: bins.map((b) => b.label),
      datasets: [
        {
          label: title,
          data: bins.map((b) => b.count),
          backgroundColor: PURPLE,
          ...BAR_SPEC,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  };
}

// groups come from stats/engine.ts's segmentStats(model, segmentQuestionId)
// - one entry per distinct value of the chosen "compare by" question.
// questionId is the OTHER question being broken down across those groups:
// - if it's a rating question, each group has a single mean -> one purple
//   bar per segment (nominal, no legend - same rule as choiceChart).
// - if it's a choice question, each group has a pct per option -> one
//   dataset per option, grouped by segment on the X axis, categorical
//   colours + legend (this is the "tell distinct series apart" job).
// - if it's neither (numeric/text/multiChoice targets have no segment
//   data - see engine.ts's segmentStats), returns an empty-but-valid chart;
//   callers should avoid segmenting those question types.
export function segmentChart(groups: SegmentGroup[], questionId: string, title: string): ChartConfiguration {
  const labels = groups.map((g) => g.value);
  const hasRating = groups.some((g) => questionId in g.ratingMeans);

  if (hasRating) {
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: title,
            data: groups.map((g) => g.ratingMeans[questionId] ?? 0),
            backgroundColor: PURPLE,
            ...BAR_SPEC,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
        },
        scales: {
          y: { beginAtZero: true },
        },
      },
    };
  }

  // Choice target: option order = first appearance across groups (groups
  // themselves are already deterministic - n desc, then value asc).
  const options: string[] = [];
  for (const g of groups) {
    for (const option of Object.keys(g.choicePcts[questionId] ?? {})) {
      if (!options.includes(option)) options.push(option);
    }
  }

  return {
    type: 'bar',
    data: {
      labels,
      datasets: options.map((option, i) => ({
        label: option,
        data: groups.map((g) => g.choicePcts[questionId]?.[option] ?? 0),
        backgroundColor: categoricalColor(i),
        ...BAR_SPEC,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: options.length > 1 },
        tooltip: { enabled: true },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  };
}
