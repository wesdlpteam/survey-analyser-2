import { describe, expect, it } from 'vitest';
import { applyQuarantine } from '../pii/quarantine';
import { sampleModel } from '../fixtures/build';
import { computeStats } from '../stats/engine';
import { buildFallbackAudit } from './fallback';

function digest() {
  return computeStats(applyQuarantine(sampleModel()));
}

describe('buildFallbackAudit (fixture staff survey)', () => {
  const report = buildFallbackAudit(digest());

  it('produces one section per analysable question (8 for the fixture)', () => {
    expect(report.sections).toHaveLength(8);
  });

  it("sets source to 'rules' and every section's ragSource to 'rules'", () => {
    expect(report.source).toBe('rules');
    for (const section of report.sections) expect(section.ragSource).toBe('rules');
  });

  it('has a non-empty executive summary naming the respondent count', () => {
    expect(report.executiveSummary.length).toBeGreaterThan(0);
    expect(report.executiveSummary).toContain('14');
  });

  it('names the strongest and weakest rating areas in the executive summary', () => {
    // recommend 64.3% is the highest favourablePct; satisfaction 57.1% is
    // the lowest (tied with agreement - first-occurring wins, see fallback.ts).
    expect(report.executiveSummary).toContain('How likely are you to recommend working here? (0-10)');
    expect(report.executiveSummary).toContain('How satisfied are you with communication? (1-5)');
  });

  it("every finding's evidenceQuestionIds reference a real question in the digest", () => {
    const validIds = new Set(digest().questions.map((q) => q.questionId));
    for (const section of report.sections) {
      for (const finding of section.findings) {
        for (const id of finding.evidenceQuestionIds) {
          expect(validIds.has(id)).toBe(true);
        }
      }
    }
  });

  it('produces a rating finding sentence with the favourable % and mean-of-range', () => {
    const section = report.sections.find((s) => s.title === 'How satisfied are you with communication? (1-5)');
    expect(section?.findings[0].text).toBe('57.1% answered favourably (mean 3.57 of 1-5)');
  });

  it('produces a choice finding sentence naming the top option', () => {
    const section = report.sections.find((s) => s.title === 'Which campus are you based at?');
    expect(section?.findings[0].text).toBe(
      'The most common answer was "Glen Waverley", chosen by 35.7% of respondents.',
    );
  });

  it('produces a text finding sentence naming the top theme', () => {
    const section = report.sections.find((s) => s.title === 'What is working well?');
    expect(section?.findings[0].text).toBe('The most common theme was "new" (mentioned 5 times).');
  });

  it('every red/amber section produces a matching recommendation naming its title', () => {
    const nonGreen = report.sections.filter((s) => s.rag !== 'green');
    expect(report.recommendations).toHaveLength(nonGreen.length);
    expect(nonGreen.length).toBeGreaterThan(0);
    for (const section of nonGreen) {
      expect(report.recommendations.some((r) => r.includes(`"${section.title}"`))).toBe(true);
    }
  });

  it('all three rating sections are amber (57.1%/57.1%/64.3% are all below the 75% green threshold)', () => {
    const ratingTitles = [
      'How satisfied are you with communication? (1-5)',
      'I feel supported by leadership.',
      'How likely are you to recommend working here? (0-10)',
    ];
    for (const title of ratingTitles) {
      const section = report.sections.find((s) => s.title === title);
      expect(section?.rag).toBe('amber');
    }
  });

  it('overall matches overallRag on the fixture digest (amber)', () => {
    expect(report.overall).toBe('amber');
  });

  it('merges the "staff" theme across both text questions into weight "many" (3+2=5)', () => {
    const staffTheme = report.themes.find((t) => t.theme === 'staff');
    expect(staffTheme).toBeDefined();
    expect(staffTheme?.weight).toBe('many');
    expect(staffTheme?.sampleQuotes.length).toBeGreaterThan(0);
    expect(staffTheme?.sampleQuotes.length).toBeLessThanOrEqual(2);
  });
});

describe('buildFallbackAudit (synthetic: no analysable questions)', () => {
  it('still produces a non-empty executive summary and no crash', () => {
    const emptyDigest = computeStats({
      title: 'empty',
      questions: [{ id: 'q0', title: 'Internal note', type: 'meta', quarantined: false }],
      rows: [['x']],
      respondentCount: 1,
    });
    const report = buildFallbackAudit(emptyDigest);
    expect(report.sections).toHaveLength(0);
    expect(report.executiveSummary.length).toBeGreaterThan(0);
    expect(report.recommendations).toHaveLength(0);
    expect(report.source).toBe('rules');
  });
});
