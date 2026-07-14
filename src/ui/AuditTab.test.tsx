// TDD for AuditTab: the audit-document view. Wired to the singleton useApp
// store (same idiom as ExploreTab), so tests set store state directly with
// useApp.setState(...) rather than going through the file-load pipeline -
// this also lets the ai-adjusted-tag test fabricate a section shape the
// rule-based fallback never produces on its own.
//
// ChartCanvas is mocked for the same reason as FindingRow.test.tsx - no real
// canvas 2D context in jsdom.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { buildFallbackAudit } from '../ai/fallback';
import { applyQuarantine } from '../pii/quarantine';
import { sampleModel } from '../fixtures/build';
import { computeStats } from '../stats/engine';
import { useApp } from '../store/appStore';
import AuditTab from './AuditTab';

vi.mock('./charts/ChartCanvas', () => ({
  ChartCanvas: ({ id }: { id: string }) => <div data-testid="chart-canvas" data-id={id} />,
}));

function loadFixtureIntoStore() {
  const model = applyQuarantine(sampleModel());
  const digest = computeStats(model);
  const audit = buildFallbackAudit(digest);
  useApp.setState({ model, digest, audit, reportTitle: 'Staff Survey 2026 Audit Report', phase: 'report' });
  return { model, digest, audit };
}

const initialState = useApp.getState();

afterEach(() => {
  cleanup();
  useApp.setState(initialState, true);
});

beforeEach(() => {
  useApp.setState(initialState, true);
});

describe('AuditTab', () => {
  it("shows the cover block's respondent count and completion % from the digest", () => {
    const { digest } = loadFixtureIntoStore();
    render(<AuditTab />);
    expect(screen.getByText(String(digest.respondentCount))).toBeTruthy();
    expect(screen.getByText(`${Math.round(digest.completionRate * 100)}%`)).toBeTruthy();
  });

  it('numbers sections 1, 2, 3... and their findings 1.1, 2.1...', () => {
    const { audit } = loadFixtureIntoStore();
    render(<AuditTab />);
    // Every section's own number, and its first finding's "<n>.1" index.
    audit.sections.forEach((_, i) => {
      expect(screen.getByText(`${i + 1}.`)).toBeTruthy();
      expect(screen.getByText(`${i + 1}.1`)).toBeTruthy();
    });
  });

  it('renders the recommendations as a numbered list', () => {
    const { audit } = loadFixtureIntoStore();
    render(<AuditTab />);
    expect(audit.recommendations.length).toBeGreaterThan(0);
    const list = screen.getByRole('list', { name: /recommendations/i });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(audit.recommendations.length);
    expect(items[0].textContent).toContain(audit.recommendations[0]);
  });

  it('names the quarantined columns in the methodology footnote', () => {
    const { model } = loadFixtureIntoStore();
    render(<AuditTab />);
    // The fixture quarantines ID, Email and Name by header rule.
    const quarantinedTitles = model.questions.filter((q) => q.quarantined).map((q) => q.title);
    expect(quarantinedTitles).toContain('Email');
    for (const title of quarantinedTitles) {
      expect(screen.getAllByText((_, el) => el?.textContent === title).length).toBeGreaterThan(0);
    }
  });

  it('says "No AI was used" in methodology when source is rules', () => {
    loadFixtureIntoStore();
    render(<AuditTab />);
    expect(screen.getByText(/no ai was used/i)).toBeTruthy();
  });

  it('shows an AI-adjusted tag on a section whose ragSource is ai-adjusted', () => {
    const { digest } = loadFixtureIntoStore();
    const audit = buildFallbackAudit(digest);
    audit.sections[0] = { ...audit.sections[0], ragSource: 'ai-adjusted' };
    audit.source = 'ai';
    audit.model = 'gpt-4o-mini';
    useApp.setState({ audit });
    render(<AuditTab />);
    expect(screen.getByText(/ai-adjusted/i)).toBeTruthy();
    expect(screen.getByText(/gpt-4o-mini/)).toBeTruthy();
  });

  it('lets the pencil button swap the title into an editable input', async () => {
    loadFixtureIntoStore();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<AuditTab />);
    expect(screen.getByText('Staff Survey 2026 Audit Report')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /edit report title/i }));
    const input = screen.getByRole('textbox', { name: /report title/i });
    await user.clear(input);
    await user.type(input, 'Renamed report{Enter}');
    expect(useApp.getState().reportTitle).toBe('Renamed report');
  });

  it('keeps the previous title when the input is cleared to blank and committed', async () => {
    loadFixtureIntoStore();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<AuditTab />);
    await user.click(screen.getByRole('button', { name: /edit report title/i }));
    const input = screen.getByRole('textbox', { name: /report title/i });
    await user.clear(input);
    await user.type(input, '   {Enter}');
    expect(useApp.getState().reportTitle).toBe('Staff Survey 2026 Audit Report');
    expect(screen.getByText('Staff Survey 2026 Audit Report')).toBeTruthy();
  });

  it('has no em-dashes in its own UI copy (title, cover, methodology, empty states)', () => {
    const { digest } = loadFixtureIntoStore();
    // Force the "no recommendations" empty-state sentence to render too.
    const audit = buildFallbackAudit(digest);
    audit.recommendations = [];
    // Strip section/finding prose (fallback.ts copy, out of this task's
    // scope) so only AuditTab's own strings are checked.
    audit.sections = [];
    useApp.setState({ audit });
    const { container } = render(<AuditTab />);
    expect(container.textContent).not.toContain('—');
  });

  it('opens every finding on beforeprint and restores only print-opened ones on afterprint', () => {
    loadFixtureIntoStore();
    const { container } = render(<AuditTab />);
    const details = Array.from(container.querySelectorAll<HTMLDetailsElement>('details.finding-row'));
    expect(details.length).toBeGreaterThan(0);
    // User opens the first one by hand; it must survive the print cycle.
    details[0].open = true;

    window.dispatchEvent(new Event('beforeprint'));
    for (const d of details) expect(d.open).toBe(true);

    window.dispatchEvent(new Event('afterprint'));
    expect(details[0].open).toBe(true); // user's own state kept
    for (const d of details.slice(1)) expect(d.open).toBe(false); // print-opened ones re-collapsed
  });
});
