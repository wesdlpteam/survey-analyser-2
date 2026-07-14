// TDD for RagBadge: a small state pill that must never rely on colour alone
// - every rag value gets its own visible text label plus a class hook the
// audit tab's card styling keys off.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import RagBadge from './RagBadge';

afterEach(() => cleanup());

describe('RagBadge', () => {
  it('renders a visible "Positive" label with a rag-badge--green class for green', () => {
    render(<RagBadge rag="green" />);
    const badge = screen.getByText('Positive');
    expect(badge.className).toContain('rag-badge--green');
  });

  it('renders a visible "Mixed" label with a rag-badge--amber class for amber', () => {
    render(<RagBadge rag="amber" />);
    const badge = screen.getByText('Mixed');
    expect(badge.className).toContain('rag-badge--amber');
  });

  it('renders a visible "Concerning" label with a rag-badge--red class for red', () => {
    render(<RagBadge rag="red" />);
    const badge = screen.getByText('Concerning');
    expect(badge.className).toContain('rag-badge--red');
  });

  it('exposes an optional tooltip via the native title attribute', () => {
    render(<RagBadge rag="green" title="82% answered favourably" />);
    const badge = screen.getByText('Positive');
    expect(badge.getAttribute('title')).toBe('82% answered favourably');
  });

  it('supports a large size for the cover badge', () => {
    render(<RagBadge rag="red" size="lg" />);
    const badge = screen.getByText('Concerning');
    expect(badge.className).toContain('rag-badge--lg');
  });
});
