// A red/amber/green state pill. Colour is never the only signal - every
// value gets its own plain-English text label too (WCAG 2.2 1.4.1). The
// words deliberately mirror fallback.ts's OVERALL_PLAIN mapping so the badge
// and the executive-summary prose never disagree on vocabulary.
import type { Rag } from '../ratings/rag';
import './RagBadge.css';

const RAG_LABEL: Record<Rag, string> = {
  green: 'Positive',
  amber: 'Mixed',
  red: 'Concerning',
};

export interface RagBadgeProps {
  rag: Rag;
  size?: 'sm' | 'lg';
  title?: string; // native tooltip - callers that pass this also show the
  // same text visibly nearby, per the task's a11y note (tooltips need a
  // visible fallback, not just hover/title).
}

export default function RagBadge({ rag, size = 'sm', title }: RagBadgeProps) {
  return (
    <span className={`rag-badge rag-badge--${rag} rag-badge--${size}`} title={title}>
      {RAG_LABEL[rag]}
    </span>
  );
}
