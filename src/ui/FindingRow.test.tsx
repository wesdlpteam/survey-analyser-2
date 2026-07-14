// TDD for FindingRow: a native <details> that shows a finding's text as its
// summary and, always mounted in the body (see print.css - it relies on
// content being in the DOM so the print stylesheet can force it visible),
// the right evidence for the linked question(s) - a chart for
// choice/rating/numeric, scrubbed comments for text.
//
// ChartCanvas is mocked because it drives real Chart.js against a <canvas>,
// which needs a 2D context jsdom doesn't provide - the same reason no other
// test in this repo renders a live chart. The mock just echoes the id/config
// it was given so this test can assert FindingRow wired the right evidence.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyQuarantine } from '../pii/quarantine';
import { sampleModel } from '../fixtures/build';
import { computeStats } from '../stats/engine';
import FindingRow from './FindingRow';

vi.mock('./charts/ChartCanvas', () => ({
  ChartCanvas: ({ id, config, ariaLabel }: { id: string; config: { type: string }; ariaLabel: string }) => (
    <div data-testid="chart-canvas" data-id={id} data-type={config.type} aria-label={ariaLabel} />
  ),
}));

afterEach(() => cleanup());

function fixture() {
  const model = applyQuarantine(sampleModel());
  const digest = computeStats(model);
  return { model, digest };
}

describe('FindingRow', () => {
  it('renders the numbered index and the finding text in the summary', () => {
    const { model, digest } = fixture();
    render(
      <FindingRow
        index="1.1"
        finding={{ text: 'The most common answer was "Glen Waverley".', evidenceQuestionIds: [] }}
        digest={digest}
        model={model}
      />,
    );
    expect(screen.getByText('1.1')).toBeTruthy();
    expect(screen.getByText(/The most common answer was "Glen Waverley"/)).toBeTruthy();
  });

  it('renders a bar chart evidence card, id-prefixed "audit:", for a choice question', () => {
    const { model, digest } = fixture();
    const campus = digest.questions.find((q) => q.title === 'Which campus are you based at?')!;
    render(
      <FindingRow
        index="1.1"
        finding={{ text: 'finding text', evidenceQuestionIds: [campus.questionId] }}
        digest={digest}
        model={model}
      />,
    );
    const chart = screen.getByTestId('chart-canvas');
    expect(chart.getAttribute('data-id')).toBe(`audit:${campus.questionId}`);
    expect(chart.getAttribute('data-type')).toBe('bar');
  });

  it('renders a bar chart evidence card for a rating question', () => {
    const { model, digest } = fixture();
    const satisfaction = digest.questions.find((q) => q.title.includes('satisfied'))!;
    render(
      <FindingRow
        index="1.1"
        finding={{ text: 'finding text', evidenceQuestionIds: [satisfaction.questionId] }}
        digest={digest}
        model={model}
      />,
    );
    const chart = screen.getByTestId('chart-canvas');
    expect(chart.getAttribute('data-id')).toBe(`audit:${satisfaction.questionId}`);
  });

  it('renders the scrubbed comments (not a chart) as evidence for a text question', () => {
    const { model, digest } = fixture();
    const workingWell = digest.questions.find((q) => q.title === 'What is working well?')!;
    render(
      <FindingRow
        index="1.1"
        finding={{ text: 'finding text', evidenceQuestionIds: [workingWell.questionId] }}
        digest={digest}
        model={model}
      />,
    );
    expect(screen.queryByTestId('chart-canvas')).toBeNull();
    // The fixture's "Mr Chen" comment is scrubbed to "[name]" before it ever
    // reaches this component (stats/engine.ts's computeTextStats) - assert
    // the scrubbed form is what's shown, not the raw name.
    expect(screen.getByText(/\[name\] in the science department/)).toBeTruthy();
  });

  it('shows a friendly note when a finding has no linked evidence', () => {
    const { model, digest } = fixture();
    render(
      <FindingRow index="1.1" finding={{ text: 'finding text', evidenceQuestionIds: [] }} digest={digest} model={model} />,
    );
    expect(screen.getByText(/no linked evidence/i)).toBeTruthy();
  });
});
