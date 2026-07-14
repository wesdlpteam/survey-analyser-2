// Renders one Chart.js bar chart inside a <figure>, with a visually-hidden
// <table> twin carrying the same numbers (the dataviz skill's "table-view
// generator" rule - nothing here is ever gated behind hover/colour). Every
// mounted chart is kept in a module-level registry so getChartImage(id) can
// hand the Task 11 exporter a PNG for any chart currently on screen.
import { BarController, BarElement, CategoryScale, Chart, Legend, LinearScale, Tooltip } from 'chart.js';
import type { ChartConfiguration } from 'chart.js';
import { useEffect, useRef } from 'react';
import './ChartCanvas.css';

// Tree-shaken registration - every chart this app draws is a bar chart.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// Chart furniture (gridlines/ticks/legend text) uses the app's ink token and
// font stack, never a series colour - see marks-and-anatomy.md.
Chart.defaults.font.family = '"Graphik","Segoe UI",system-ui,sans-serif';
Chart.defaults.color = '#2B281F'; // --wes-neutral-900
Chart.defaults.borderColor = '#E6E2DD'; // --wes-neutral-200, recessive hairline gridlines

const registry = new Map<string, Chart>();

export function getChartImage(id: string): string | null {
  const chart = registry.get(id);
  if (!chart) return null;
  return chart.canvas.toDataURL('image/png');
}

export interface ChartCanvasProps {
  id: string;
  config: ChartConfiguration;
  ariaLabel: string;
  tableFallback: { head: string[]; rows: (string | number)[][] };
}

export function ChartCanvas({ id, config, ariaLabel, tableFallback }: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const chart = new Chart(canvas, config);
    registry.set(id, chart);

    return () => {
      chart.destroy();
      if (registry.get(id) === chart) registry.delete(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config is the
    // whole chart spec; callers memoise it so identity only changes when
    // the data actually does.
  }, [id, config]);

  return (
    <figure className="chart-canvas">
      <div className="chart-canvas__plot">
        <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
      </div>
      <table className="visually-hidden">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            {tableFallback.head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableFallback.rows.map((row, i) => (
            // eslint-disable-next-line react/no-array-index-key -- rows have no stable id of their own
            <tr key={i}>
              {row.map((cell, j) => (
                // eslint-disable-next-line react/no-array-index-key -- cells have no stable id of their own
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
