// TDD for Task 11's exporter. Every test builds small, purpose-made
// AuditReport/StatsDigest literals rather than the full sample fixture -
// the security-sensitive tests (booby traps, escaping) need exact control
// over what string lands where, and the type checker keeps each literal
// honest against the real shared types.
import { describe, expect, it, vi } from 'vitest';
import type { AuditReport, AuditSection } from '../ai/auditTypes';
import type { ChoiceStats, NumericStats, QuestionStats, RatingStats, StatsDigest, TextStats } from '../stats/engine';
import { buildExportFileName, buildExportHtml, downloadExport } from './exportHtml';

function choiceQ(id: string, title: string): QuestionStats & ChoiceStats {
  return {
    questionId: id,
    title,
    kind: 'choice',
    answered: 10,
    counts: [
      { option: 'Yes', count: 6, pct: 60 },
      { option: 'No', count: 4, pct: 40 },
    ],
  };
}

function ratingQ(id: string, title: string): QuestionStats & RatingStats {
  return {
    questionId: id,
    title,
    kind: 'rating',
    answered: 10,
    mean: 4,
    median: 4,
    scaleMin: 1,
    scaleMax: 5,
    distribution: [
      { value: 4, count: 6, pct: 60 },
      { value: 5, count: 4, pct: 40 },
    ],
    favourablePct: 100,
    neutralPct: 0,
    unfavourablePct: 0,
  };
}

function numericQ(id: string, title: string): QuestionStats & NumericStats {
  return { questionId: id, title, kind: 'numeric', answered: 10, mean: 5, median: 5, min: 1, max: 9 };
}

function textQ(id: string, title: string, comments: string[]): QuestionStats & TextStats {
  return {
    questionId: id,
    title,
    kind: 'text',
    answered: comments.length,
    comments,
    themes: [],
    sentiment: { pos: 0, neg: 0, neu: comments.length },
  };
}

function makeDigest(questions: QuestionStats[], overrides: Partial<StatsDigest> = {}): StatsDigest {
  return {
    respondentCount: 10,
    completionRate: 0.9,
    overallFavourablePct: null,
    commentCount: 0,
    questions,
    ...overrides,
  };
}

function makeSection(overrides: Partial<AuditSection> = {}): AuditSection {
  return {
    title: 'Section one',
    questionIds: ['q1'],
    rag: 'amber',
    ragSource: 'rules',
    ragJustification: 'test justification',
    findings: [{ text: 'A finding.', evidenceQuestionIds: ['q1'] }],
    ...overrides,
  };
}

function makeAudit(sections: AuditSection[], overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    executiveSummary: 'Ten people responded to this survey.',
    overall: 'amber',
    sections,
    themes: [],
    recommendations: [],
    source: 'rules',
    ...overrides,
  };
}

const GENERATED_ON = '15 July 2026';

describe('buildExportHtml', () => {
  it('contains the executive summary text', () => {
    const digest = makeDigest([choiceQ('q1', 'Which campus?')]);
    const audit = makeAudit([makeSection()]);
    const html = buildExportHtml({ audit, digest, title: 'Staff Survey', chartImages: {}, generatedOn: GENERATED_ON });
    expect(html).toContain('Ten people responded to this survey.');
  });

  it('renders exactly one <details> per finding, across all sections', () => {
    const digest = makeDigest([choiceQ('q1', 'Which campus?'), ratingQ('q2', 'Satisfaction')]);
    const audit = makeAudit([
      makeSection({
        findings: [
          { text: 'Finding one.', evidenceQuestionIds: ['q1'] },
          { text: 'Finding two.', evidenceQuestionIds: ['q2'] },
        ],
      }),
      makeSection({ title: 'Section two', findings: [{ text: 'Finding three.', evidenceQuestionIds: [] }] }),
    ]);
    const html = buildExportHtml({ audit, digest, title: 'Staff Survey', chartImages: {}, generatedOn: GENERATED_ON });
    const detailsCount = (html.match(/<details/g) ?? []).length;
    expect(detailsCount).toBe(3);
  });

  it('embeds a data:image/png chart image when a valid one is provided', () => {
    const digest = makeDigest([choiceQ('q1', 'Which campus?')]);
    const audit = makeAudit([makeSection()]);
    const fakeImage = 'data:image/png;base64,AAAABBBBCCCC';
    const html = buildExportHtml({
      audit,
      digest,
      title: 'Staff Survey',
      chartImages: { q1: fakeImage },
      generatedOn: GENERATED_ON,
    });
    expect(html).toContain(fakeImage);
  });

  it('treats the degenerate "data:," chart image as missing and renders a table instead of a broken <img>', () => {
    const digest = makeDigest([choiceQ('q1', 'Which campus?')]);
    const audit = makeAudit([makeSection()]);
    const html = buildExportHtml({
      audit,
      digest,
      title: 'Staff Survey',
      chartImages: { q1: 'data:,', 'audit:q1': 'data:,' },
      generatedOn: GENERATED_ON,
    });
    expect(html).not.toMatch(/src="data:,"/);
    expect(html).toContain('<table');
    expect(html).toContain('Yes'); // choice option surfaces via the table fallback
  });

  it('refuses to emit an <img> for a non-image src (e.g. a smuggled javascript:/data:text URI) and falls back to a table', () => {
    const digest = makeDigest([choiceQ('q1', 'Which campus?')]);
    const audit = makeAudit([makeSection()]);
    const html = buildExportHtml({
      audit,
      digest,
      title: 'Staff Survey',
      // Neither a genuine data:image/ raster - the exporter must not trust
      // either as an <img> source.
      chartImages: { q1: 'javascript:alert(1)', 'audit:q1': 'data:text/html,<b>x</b>' },
      generatedOn: GENERATED_ON,
    });
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).not.toContain('data:text/html');
    expect(html).not.toMatch(/<img[^>]*src="(?!data:image\/)/);
    expect(html).toContain('<table'); // stats table fallback took over
  });

  it('never lets a planted secret-like string leak through, even smuggled onto a cloned digest/audit', () => {
    const digest = makeDigest([choiceQ('q1', 'Which campus?')]);
    const audit = makeAudit([makeSection()]);
    const trapValue = 'PLANTED-BOOBYTRAP-SECRET-VALUE-1234567890';
    const digestClone = JSON.parse(JSON.stringify(digest)) as StatsDigest;
    const auditClone = JSON.parse(JSON.stringify(audit)) as AuditReport;
    (digestClone as unknown as Record<string, unknown>).apiKey = trapValue;
    (auditClone as unknown as Record<string, unknown>).apiKey = trapValue;
    const html = buildExportHtml({
      audit: auditClone,
      digest: digestClone,
      title: 'Staff Survey',
      chartImages: {},
      generatedOn: GENERATED_ON,
    });
    expect(html).not.toContain(trapValue);
  });

  it('never lets a planted quarantined-column title leak through a mutated digest', () => {
    const digest = makeDigest([choiceQ('q1', 'Which campus?')]);
    const audit = makeAudit([makeSection()]);
    const trapTitle = 'Home Phone Number (Do Not Publish)';
    const digestClone = JSON.parse(JSON.stringify(digest)) as StatsDigest;
    (digestClone as unknown as Record<string, unknown>).quarantinedColumns = [trapTitle];
    const html = buildExportHtml({
      audit,
      digest: digestClone,
      title: 'Staff Survey',
      chartImages: {},
      generatedOn: GENERATED_ON,
    });
    expect(html).not.toContain(trapTitle);
  });

  it('never contains a <script tag (case-insensitive), even when a finding text tries to inject one', () => {
    const digest = makeDigest([choiceQ('q1', 'Which campus?')]);
    const audit = makeAudit([
      makeSection({ findings: [{ text: 'Nice work <SCRIPT>alert(1)</SCRIPT>', evidenceQuestionIds: [] }] }),
    ]);
    const html = buildExportHtml({ audit, digest, title: 'Staff Survey', chartImages: {}, generatedOn: GENERATED_ON });
    expect(html.toLowerCase()).not.toContain('<script');
  });

  it('HTML-escapes a comment containing an <img onerror> XSS payload', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const digest = makeDigest([textQ('q1', 'What could be improved?', [payload])]);
    const audit = makeAudit([
      makeSection({ questionIds: ['q1'], findings: [{ text: 'A comment theme.', evidenceQuestionIds: ['q1'] }] }),
    ]);
    const html = buildExportHtml({ audit, digest, title: 'Staff Survey', chartImages: {}, generatedOn: GENERATED_ON });
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('neutralises an AI-supplied executive summary string containing </style>', () => {
    const digest = makeDigest([choiceQ('q1', 'Which campus?')]);
    const audit = makeAudit([makeSection()], {
      executiveSummary: 'Great survey </style><script>alert(1)</script> overall.',
      source: 'ai',
      model: 'gpt-4o-mini',
    });
    const html = buildExportHtml({ audit, digest, title: 'Staff Survey', chartImages: {}, generatedOn: GENERATED_ON });
    expect(html).not.toContain('</style><script>');
    expect(html).toContain('&lt;/style&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('includes an Explore chart gallery card for every chartable question', () => {
    const digest = makeDigest([choiceQ('q1', 'Which campus?'), numericQ('q2', 'Age'), textQ('q3', 'Comments', [])]);
    const audit = makeAudit([makeSection()]);
    const html = buildExportHtml({ audit, digest, title: 'Staff Survey', chartImages: {}, generatedOn: GENERATED_ON });
    expect(html).toContain('Which campus?');
    expect(html).toContain('Age');
  });
});

describe('buildExportFileName', () => {
  it('slugifies the title, lowercasing and turning spaces/punctuation into hyphens, trimmed', () => {
    const fileName = buildExportFileName('  My Great, Report!! 2026  ', new Date(2026, 6, 15));
    expect(fileName).toBe('survey-audit-my-great-report-2026-2026-07-15.html');
  });

  it('pads single-digit month and day to two digits', () => {
    const fileName = buildExportFileName('Staff Survey', new Date(2026, 0, 5));
    expect(fileName).toBe('survey-audit-staff-survey-2026-01-05.html');
  });
});

describe('downloadExport', () => {
  it('creates a Blob object URL, triggers an anchor download, and revokes the URL', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadExport('<!doctype html><html><body>hi</body></html>', 'survey-audit-test-2026-07-15.html');

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
