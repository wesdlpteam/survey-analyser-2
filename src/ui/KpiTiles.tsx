// Headline KPI row: Responses, Completion %, Overall favourable %, Comments.
// Numbers count up from 0 on first paint, unless the user has asked for
// reduced motion - then they render at their final value straight away,
// with no animation loop started at all (not just a faster/skipped one).
import { useEffect, useRef, useState } from 'react';
import type { StatsDigest } from '../stats/engine';
import './KpiTiles.css';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const COUNT_UP_MS = 700;

function useCountUp(target: number): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return undefined;
    }
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      setValue(target * t);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // Re-runs only when the target itself changes (new digest) - COUNT_UP_MS is a fixed constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

interface KpiTileProps {
  label: string;
  target: number | null;
  format: (n: number) => string;
}

function KpiTile({ label, target, format }: KpiTileProps) {
  const animated = useCountUp(target ?? 0);
  return (
    <div className="kpi-tile">
      <p className="kpi-tile__label">{label}</p>
      <p className="kpi-tile__value">{target === null ? 'Not available' : format(animated)}</p>
    </div>
  );
}

export interface KpiTilesProps {
  digest: StatsDigest;
}

export default function KpiTiles({ digest }: KpiTilesProps) {
  return (
    <div className="kpi-tiles" role="group" aria-label="Key numbers for this survey">
      <KpiTile label="Responses" target={digest.respondentCount} format={(n) => String(Math.round(n))} />
      <KpiTile label="Completion %" target={digest.completionRate * 100} format={(n) => `${Math.round(n)}%`} />
      <KpiTile
        label="Overall favourable %"
        target={digest.overallFavourablePct}
        format={(n) => `${n.toFixed(1)}%`}
      />
      <KpiTile label="Comments" target={digest.commentCount} format={(n) => String(Math.round(n))} />
    </div>
  );
}
