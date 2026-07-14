// One free-text question's scrubbed comments: a sentiment mini-bar, theme
// chips (click to filter the list below), and the comments themselves.
// Comments are already PII-scrubbed by the stats engine before they ever
// reach this component - see stats/engine.ts's computeTextStats.
import { useState } from 'react';
import type { QuestionStats, TextStats } from '../stats/engine';
import { RAG_FAV_INK, RAG_NEUTRAL_INK, RAG_UNFAV_INK } from './charts/chartConfig';
import './CommentBrowser.css';

// Pastel tint background + an AA-contrast ink on top (checked against the
// dataviz skill's contrast() helper: all 5 pairs clear 4.5:1). Chips cycle
// through this set by position - unlike a chart's identity colours, a chip
// is just a filter control, not a data series, so repetition past 5 themes
// is fine.
const CHIP_STYLES = [
  { bg: 'var(--wes-tint-amber)', ink: 'var(--wes-ink-gold)' },
  { bg: 'var(--wes-tint-peach)', ink: 'var(--wes-ink-rust)' },
  { bg: 'var(--wes-tint-rose)', ink: 'var(--wes-ink-rose)' },
  { bg: 'var(--wes-tint-blue)', ink: 'var(--wes-blue-dark)' },
  { bg: 'var(--wes-tint-green)', ink: 'var(--wes-green-dark)' },
];

export interface CommentBrowserProps {
  stats: QuestionStats & TextStats;
}

export default function CommentBrowser({ stats }: CommentBrowserProps) {
  const [activeTheme, setActiveTheme] = useState<string | null>(null);

  const filtered = activeTheme
    ? stats.comments.filter((c) => c.toLowerCase().includes(activeTheme.toLowerCase()))
    : stats.comments;

  const { pos, neu, neg } = stats.sentiment;
  const total = pos + neu + neg;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const headingId = `comments-${stats.questionId}`;

  return (
    <section className="comment-browser" aria-labelledby={headingId}>
      <h3 id={headingId} className="comment-browser__title">
        {stats.title}
      </h3>
      <p className="comment-browser__count">
        {stats.answered} comment{stats.answered === 1 ? '' : 's'}
      </p>

      {total > 0 && (
        <div className="comment-browser__sentiment">
          <div
            className="comment-browser__sentiment-bar"
            role="img"
            aria-label={`Sentiment: ${pct(pos)}% positive, ${pct(neu)}% neutral, ${pct(neg)}% negative`}
          >
            <span style={{ width: `${pct(pos)}%`, background: RAG_FAV_INK }} />
            <span style={{ width: `${pct(neu)}%`, background: RAG_NEUTRAL_INK }} />
            <span style={{ width: `${pct(neg)}%`, background: RAG_UNFAV_INK }} />
          </div>
          <p className="comment-browser__sentiment-legend">
            {pct(pos)}% positive &middot; {pct(neu)}% neutral &middot; {pct(neg)}% negative
          </p>
        </div>
      )}

      {stats.themes.length > 0 && (
        <div className="comment-browser__themes">
          <p className="comment-browser__themes-label" id={`${headingId}-themes`}>
            Common themes (select one to filter the comments below)
          </p>
          <div className="comment-browser__chips" role="group" aria-labelledby={`${headingId}-themes`}>
            {stats.themes.map((theme, i) => {
              const style = CHIP_STYLES[i % CHIP_STYLES.length];
              const isActive = activeTheme === theme.term;
              return (
                <button
                  key={theme.term}
                  type="button"
                  className="comment-browser__chip"
                  aria-pressed={isActive}
                  style={{
                    background: style.bg,
                    color: style.ink,
                    boxShadow: isActive ? `inset 0 0 0 2px ${style.ink}` : undefined,
                  }}
                  onClick={() => setActiveTheme(isActive ? null : theme.term)}
                >
                  {theme.term} ({theme.count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ul className="comment-browser__list">
        {filtered.map((comment, i) => (
          // eslint-disable-next-line react/no-array-index-key -- comments have no stable id of their own
          <li key={i} className="comment-browser__item">
            {comment}
          </li>
        ))}
      </ul>
      {filtered.length === 0 && <p className="comment-browser__empty">No comments match this theme.</p>}
    </section>
  );
}
