// One numbered finding inside an audit section, as a native <details> -
// free keyboard support, no JS needed to open/close. The body is always
// rendered into the DOM (never gated on the details' own open state) so
// print.css's CSS-only "expand everything" trick has real content to reveal
// - see print.css's comment for why that's the chosen technique over an
// onbeforeprint JS listener.
//
// Evidence: a chart for choice/rating/numeric questions (same builders
// ExploreTab uses), scrubbed comments for text questions - text answers have
// no chart in chartConfig.ts, and a finding about a comment theme is best
// shown as the comments themselves. Chart ids are prefixed "audit:" so they
// never collide with ExploreTab's ids for the same question (both tabs can
// be mounted at once; Task 11's getChartImage(id) needs a unique id per
// on-screen chart).
import type { ChartConfiguration } from 'chart.js';
import type { Finding } from '../ai/auditTypes';
import type { StatsDigest } from '../stats/engine';
import type { SurveyModel } from '../types';
import { ChartCanvas } from './charts/ChartCanvas';
import { binNumeric, choiceChart, numericChart, ratingChart } from './charts/chartConfig';
import './FindingRow.css';

// Text evidence can run to hundreds of comments on a big survey - capped so
// one finding's evidence panel never becomes the whole report.
const COMMENT_EVIDENCE_LIMIT = 8;

export interface FindingRowProps {
  index: string; // e.g. "1.2" - section number . finding number
  finding: Finding;
  digest: StatsDigest;
  model: SurveyModel;
}

interface EvidenceChart {
  config: ChartConfiguration;
  ariaLabel: string;
  tableFallback: { head: string[]; rows: (string | number)[][] };
}

function buildEvidenceChart(questionId: string, digest: StatsDigest, model: SurveyModel): EvidenceChart | null {
  const qs = digest.questions.find((q) => q.questionId === questionId);
  if (!qs) return null;

  if (qs.kind === 'choice') {
    return {
      config: choiceChart(qs),
      ariaLabel: `Bar chart: ${qs.title}`,
      tableFallback: { head: ['Option', 'Count', '%'], rows: qs.counts.map((c) => [c.option, c.count, c.pct]) },
    };
  }
  if (qs.kind === 'rating') {
    return {
      config: ratingChart(qs),
      ariaLabel: `Bar chart: ${qs.title}`,
      tableFallback: {
        head: ['Value', 'Count', '%'],
        rows: qs.distribution.map((d) => [d.label ?? d.value, d.count, d.pct]),
      },
    };
  }
  if (qs.kind === 'numeric') {
    const colIndex = model.questions.findIndex((q) => q.id === questionId);
    const values = model.rows.map((row) => row[colIndex]).filter((v): v is number => typeof v === 'number');
    const bins = binNumeric(values);
    return {
      config: numericChart(bins, qs.title),
      ariaLabel: `Bar chart: ${qs.title}`,
      tableFallback: { head: ['Range', 'Count'], rows: bins.map((b) => [b.label, b.count]) },
    };
  }
  return null; // 'text' - handled as comments below, not a chart
}

export default function FindingRow({ index, finding, digest, model }: FindingRowProps) {
  return (
    <details className="finding-row">
      <summary className="finding-row__summary">
        <span className="finding-row__index">{index}</span>
        <span className="finding-row__text">{finding.text}</span>
      </summary>
      <div className="finding-row__body">
        {finding.evidenceQuestionIds.length === 0 && (
          <p className="finding-row__empty">No linked evidence for this finding.</p>
        )}
        {finding.evidenceQuestionIds.map((questionId) => {
          const qs = digest.questions.find((q) => q.questionId === questionId);
          if (!qs) return null;

          if (qs.kind === 'text') {
            const shown = qs.comments.slice(0, COMMENT_EVIDENCE_LIMIT);
            const remaining = qs.comments.length - shown.length;
            return (
              <div key={questionId} className="finding-row__comments">
                <p className="finding-row__comments-label">
                  {qs.comments.length} comment{qs.comments.length === 1 ? '' : 's'} for &ldquo;{qs.title}&rdquo;
                </p>
                <ul className="finding-row__comments-list">
                  {shown.map((comment, i) => (
                    // eslint-disable-next-line react/no-array-index-key -- comments have no stable id
                    <li key={i}>{comment}</li>
                  ))}
                </ul>
                {remaining > 0 && <p className="finding-row__comments-more">…and {remaining} more.</p>}
              </div>
            );
          }

          const evidence = buildEvidenceChart(questionId, digest, model);
          if (!evidence) return null;
          return (
            <ChartCanvas
              key={questionId}
              id={`audit:${questionId}`}
              config={evidence.config}
              ariaLabel={evidence.ariaLabel}
              tableFallback={evidence.tableFallback}
            />
          );
        })}
      </div>
    </details>
  );
}
