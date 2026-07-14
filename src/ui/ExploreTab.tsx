// The Explore tab: KPI row, a "compare by" segment select, one chart card
// per choice/rating/numeric question, and a comment browser per text
// question. Reads model/digest straight from the store, same idiom as
// QuarantinePanel.
import { useMemo, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { segmentStats, type QuestionStats, type TextStats } from '../stats/engine';
import { useApp } from '../store/appStore';
import { ChartCanvas } from './charts/ChartCanvas';
import { binNumeric, choiceChart, numericChart, ratingChart, segmentChart } from './charts/chartConfig';
import KpiTiles from './KpiTiles';
import CommentBrowser from './CommentBrowser';
import './ExploreTab.css';

interface ChartCard {
  questionId: string;
  title: string;
  config: ChartConfiguration;
  ariaLabel: string;
  tableFallback: { head: string[]; rows: (string | number)[][] };
}

export default function ExploreTab() {
  const model = useApp((s) => s.model);
  const digest = useApp((s) => s.digest);
  const [segmentQuestionId, setSegmentQuestionId] = useState('');

  const choiceQuestions = useMemo(
    () => (model ? model.questions.filter((q) => !q.quarantined && q.type === 'choice') : []),
    [model],
  );

  const segmentGroups = useMemo(() => {
    if (!model || !segmentQuestionId) return null;
    return segmentStats(model, segmentQuestionId);
  }, [model, segmentQuestionId]);

  const cards = useMemo<ChartCard[]>(() => {
    if (!model || !digest) return [];
    const out: ChartCard[] = [];

    for (const qs of digest.questions) {
      if (qs.kind === 'text') continue;
      const modelQuestion = model.questions.find((q) => q.id === qs.questionId);
      const canSegment =
        segmentGroups !== null &&
        qs.questionId !== segmentQuestionId &&
        modelQuestion?.type !== 'multiChoice' &&
        (qs.kind === 'choice' || qs.kind === 'rating');

      if (canSegment && segmentGroups) {
        const config = segmentChart(segmentGroups, qs.questionId, qs.title);
        // segmentChart's own choice-vs-rating branch keys off qs.kind
        // (choice questions carry choicePcts, rating questions carry a
        // single ratingMeans scalar) - mirror that here to build the
        // matching table fallback without re-deriving it from the config.
        const rows =
          qs.kind === 'rating'
            ? segmentGroups.map((g) => [g.value, g.ratingMeans[qs.questionId] ?? 0])
            : segmentGroups.map((g, i) => [
                g.value,
                ...config.data.datasets.map((d) => Number((d.data as number[])[i] ?? 0)),
              ]);
        const head =
          qs.kind === 'rating' ? ['Segment', 'Mean'] : ['Segment', ...config.data.datasets.map((d) => String(d.label))];
        out.push({
          questionId: qs.questionId,
          title: qs.title,
          config,
          ariaLabel: `Bar chart: ${qs.title}, broken down by segment`,
          tableFallback: { head, rows },
        });
        continue;
      }

      if (qs.kind === 'choice') {
        out.push({
          questionId: qs.questionId,
          title: qs.title,
          config: choiceChart(qs),
          ariaLabel: `Bar chart: ${qs.title}`,
          tableFallback: {
            head: ['Option', 'Count', '%'],
            rows: qs.counts.map((c) => [c.option, c.count, c.pct]),
          },
        });
      } else if (qs.kind === 'rating') {
        out.push({
          questionId: qs.questionId,
          title: qs.title,
          config: ratingChart(qs),
          ariaLabel: `Bar chart: ${qs.title}`,
          tableFallback: {
            head: ['Value', 'Count', '%'],
            rows: qs.distribution.map((d) => [d.label ?? d.value, d.count, d.pct]),
          },
        });
      } else if (qs.kind === 'numeric') {
        const colIndex = model.questions.findIndex((q) => q.id === qs.questionId);
        const values = model.rows
          .map((row) => row[colIndex])
          .filter((v): v is number => typeof v === 'number');
        const bins = binNumeric(values);
        out.push({
          questionId: qs.questionId,
          title: qs.title,
          config: numericChart(bins, qs.title),
          ariaLabel: `Bar chart: ${qs.title}`,
          tableFallback: {
            head: ['Range', 'Count'],
            rows: bins.map((b) => [b.label, b.count]),
          },
        });
      }
    }

    return out;
  }, [model, digest, segmentGroups, segmentQuestionId]);

  const textQuestions = useMemo(
    () => (digest ? digest.questions.filter((q): q is QuestionStats & TextStats => q.kind === 'text') : []),
    [digest],
  );

  if (!model || !digest) return null;

  return (
    <div className="explore-tab">
      <KpiTiles digest={digest} />

      {choiceQuestions.length > 0 && (
        <div className="explore-tab__segment">
          <label htmlFor="compare-by-select" className="explore-tab__segment-label">
            Compare by
          </label>
          <select
            id="compare-by-select"
            className="explore-tab__segment-select"
            value={segmentQuestionId}
            onChange={(e) => setSegmentQuestionId(e.target.value)}
          >
            <option value="">Don&rsquo;t compare</option>
            {choiceQuestions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="explore-tab__grid">
        {cards.map((card) => (
          <ChartCanvas
            key={card.questionId}
            id={card.questionId}
            config={card.config}
            ariaLabel={card.ariaLabel}
            tableFallback={card.tableFallback}
          />
        ))}
      </div>

      {textQuestions.length > 0 && (
        <div className="explore-tab__comments">
          <h2 className="explore-tab__comments-heading">Comments</h2>
          {textQuestions.map((qs) => (
            <CommentBrowser key={qs.questionId} stats={qs} />
          ))}
        </div>
      )}
    </div>
  );
}
