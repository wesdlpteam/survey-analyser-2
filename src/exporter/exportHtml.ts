// Self-contained HTML report exporter (Task 11). Builds a single static
// HTML string from the current AuditReport + StatsDigest - no <script>
// tags, no external resources, no apiKey. digest.questions is already
// filtered to analysable (non-meta, non-quarantined) questions by
// computeStats (see stats/engine.ts), so this module never even sees a
// quarantined column - it only ever reads named fields off the audit/digest
// it's given (never spreads or serialises the whole object), so a stray
// property smuggled onto a mutated clone can't leak into the document
// either. Every user/AI-supplied string is passed through escapeHtml before
// it touches the template - see exportHtml.test.ts's booby-trap and
// escaping tests for the concrete attacks this guards against.
import type { AuditReport, AuditSection, Finding } from '../ai/auditTypes';
import type { QuestionStats, StatsDigest } from '../stats/engine';

const RAG_LABEL: Record<AuditReport['overall'], string> = { green: 'Positive', amber: 'Mixed', red: 'Concerning' };

// ChartCanvas's degenerate value for a chart mounted in a hidden tab panel
// (Task 7 review, ledgered as a known issue) - treated the same as "no
// image" everywhere in this file.
const NO_IMAGE = 'data:,';

export interface BuildExportHtmlOpts {
  audit: AuditReport;
  digest: StatsDigest;
  title: string;
  chartImages: Record<string, string>;
  generatedOn: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Lowercase, spaces/punctuation -> single hyphens, leading/trailing hyphens
// trimmed. reportTitle in the store is NOT trimmed on save (AuditTab's
// commitTitle keeps whatever whitespace the user typed) - the leading
// .trim() here is what makes the filename well-formed regardless.
function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function buildExportFileName(title: string, date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `survey-audit-${slug(title)}-${y}-${m}-${d}.html`;
}

// Picks the first valid (present, non-degenerate) chart image among a list
// of candidate ids, in priority order. Callers pass ids most-specific
// first - e.g. a Findings-section evidence chart prefers the 'audit:'-
// prefixed id (the chart actually rendered in the Audit tab) before falling
// back to the bare Explore id for the same question.
function pickChartImage(chartImages: Record<string, string>, ids: string[]): string | null {
  for (const id of ids) {
    const src = chartImages[id];
    if (src && src !== NO_IMAGE) return src;
  }
  return null;
}

// Same numbers ExploreTab/FindingRow show, rebuilt purely from the digest's
// own QuestionStats (this module never receives the SurveyModel, so numeric
// questions get a summary-stats table rather than a binned histogram table -
// there are no raw values here to bin).
function statsTable(q: QuestionStats): { head: string[]; rows: (string | number)[][] } | null {
  if (q.kind === 'choice') {
    return { head: ['Option', 'Count', '%'], rows: q.counts.map((c) => [c.option, c.count, c.pct]) };
  }
  if (q.kind === 'rating') {
    return {
      head: ['Value', 'Count', '%'],
      rows: q.distribution.map((d) => [String(d.label ?? d.value), d.count, d.pct]),
    };
  }
  if (q.kind === 'numeric') {
    return {
      head: ['Metric', 'Value'],
      rows: [
        ['Answered', q.answered],
        ['Mean', q.mean],
        ['Median', q.median],
        ['Min', q.min],
        ['Max', q.max],
      ],
    };
  }
  return null; // text questions have no chart - rendered as a comment list instead
}

function renderTable(table: { head: string[]; rows: (string | number)[][] }): string {
  const head = table.head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const rows = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="wsa-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

// Renders whichever chart image is valid, or the same numbers as a plain
// HTML table when no usable chart was captured for this question.
function renderChartOrTable(imgSrc: string | null, alt: string, q: QuestionStats): string {
  if (imgSrc) {
    return `<img class="wsa-chart" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(alt)}" />`;
  }
  const table = statsTable(q);
  return table ? renderTable(table) : '<p class="wsa-muted">No chart data available.</p>';
}

const COMMENT_EVIDENCE_LIMIT = 8;

function renderComments(q: QuestionStats & { kind: 'text'; comments: string[] }): string {
  const shown = q.comments.slice(0, COMMENT_EVIDENCE_LIMIT);
  const remaining = q.comments.length - shown.length;
  const items = shown.map((c) => `<li>${escapeHtml(c)}</li>`).join('');
  const more = remaining > 0 ? `<p class="wsa-muted">&hellip;and ${remaining} more.</p>` : '';
  const count = `${q.comments.length} comment${q.comments.length === 1 ? '' : 's'}`;
  return `<p class="wsa-muted">${escapeHtml(count)}</p><ul class="wsa-comments">${items}</ul>${more}`;
}

function renderFindingEvidence(
  ids: string[],
  digest: StatsDigest,
  chartImages: Record<string, string>,
): string {
  const parts = ids
    .map((id) => {
      const qs = digest.questions.find((q) => q.questionId === id);
      if (!qs) return '';
      if (qs.kind === 'text') return renderComments(qs);
      const img = pickChartImage(chartImages, [`audit:${id}`, id]);
      return renderChartOrTable(img, `Chart: ${qs.title}`, qs);
    })
    .filter((s) => s !== '');
  return parts.length > 0 ? parts.join('') : '<p class="wsa-muted">No linked evidence for this finding.</p>';
}

function renderFinding(index: string, finding: Finding, digest: StatsDigest, chartImages: Record<string, string>): string {
  const body = renderFindingEvidence(finding.evidenceQuestionIds, digest, chartImages);
  return `<details class="wsa-finding"><summary><span class="wsa-finding__index">${escapeHtml(index)}</span> ${escapeHtml(finding.text)}</summary><div class="wsa-finding__body">${body}</div></details>`;
}

function renderSection(section: AuditSection, num: number, digest: StatsDigest, chartImages: Record<string, string>): string {
  const findings = section.findings.map((f, j) => renderFinding(`${num}.${j + 1}`, f, digest, chartImages)).join('');
  const label = RAG_LABEL[section.rag];
  return `<article class="wsa-section wsa-section--${section.rag}">
      <h3>${num}. ${escapeHtml(section.title)} <span class="wsa-badge wsa-badge--${section.rag}">${label}</span></h3>
      <p class="wsa-justification">${escapeHtml(section.ragJustification)}</p>
      ${findings}
    </article>`;
}

function renderGallery(digest: StatsDigest, chartImages: Record<string, string>): string {
  const chartable = digest.questions.filter((q) => q.kind !== 'text');
  if (chartable.length === 0) return '<p class="wsa-muted">No chartable questions in this survey.</p>';
  const cards = chartable
    .map((q) => {
      const img = pickChartImage(chartImages, [q.questionId, `audit:${q.questionId}`]);
      return `<figure class="wsa-chart-card"><figcaption>${escapeHtml(q.title)}</figcaption>${renderChartOrTable(img, `Chart: ${q.title}`, q)}</figure>`;
    })
    .join('');
  return `<div class="wsa-gallery">${cards}</div>`;
}

// Wesley palette values, inlined as literals (not css var()) so the
// exported file has no dependency on the app's own tokens.css - the
// template keeps its own copy, per the Task 11 brief.
const STYLE = `
:root{--purple:#4F2759;--gold:#C59F40;--ink:#2B281F;--muted:#6b6659;--line:#E6E2DD;--rag-green-bg:#e7f6e2;--rag-green-ink:#2c6b1a;--rag-amber-bg:#fdf0dd;--rag-amber-ink:#8a5410;--rag-red-bg:#fde4e4;--rag-red-ink:#a31817;}
*{box-sizing:border-box;}
body{margin:0;padding:0;background:#f7f5f2;color:var(--ink);font-family:"Graphik","Segoe UI",system-ui,sans-serif;line-height:1.5;}
.wsa-report{max-width:900px;margin:0 auto;padding:32px 24px 64px;}
.wsa-cover{background:var(--purple);color:#fff;border-radius:14px;padding:32px;margin-bottom:32px;}
.wsa-cover h1{margin:0 0 16px;font-size:1.75rem;}
.wsa-cover-meta{display:flex;gap:32px;margin:0 0 16px;flex-wrap:wrap;list-style:none;padding:0;}
.wsa-cover-meta dt{font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;opacity:.75;margin:0;}
.wsa-cover-meta dd{margin:0;font-size:1.25rem;font-weight:600;}
.wsa-overall{margin:0;}
h2{color:var(--gold);border-bottom:1px solid var(--line);padding-bottom:8px;}
.wsa-badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.75rem;font-weight:600;}
.wsa-badge--green{background:var(--rag-green-bg);color:var(--rag-green-ink);}
.wsa-badge--amber{background:var(--rag-amber-bg);color:var(--rag-amber-ink);}
.wsa-badge--red{background:var(--rag-red-bg);color:var(--rag-red-ink);}
.wsa-section{border:1px solid var(--line);border-radius:14px;padding:16px 20px;margin-bottom:16px;}
.wsa-finding{border-top:1px solid var(--line);padding:8px 0;}
.wsa-finding summary{cursor:pointer;font-weight:600;}
.wsa-finding__index{color:var(--muted);margin-right:8px;}
.wsa-finding__body{padding:12px 0 4px 16px;}
.wsa-table{border-collapse:collapse;width:100%;margin:8px 0;}
.wsa-table th,.wsa-table td{border:1px solid var(--line);padding:6px 10px;text-align:left;font-size:.9rem;}
.wsa-chart{max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px;}
.wsa-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;}
.wsa-chart-card{border:1px solid var(--line);border-radius:14px;padding:12px;margin:0;}
.wsa-chart-card figcaption{font-weight:600;margin-bottom:8px;}
.wsa-comments{padding-left:20px;}
.wsa-muted{color:var(--muted);font-size:.9rem;}
.wsa-recommendations{padding-left:20px;}
.wsa-methodology p{color:var(--muted);font-size:.9rem;}
@media print{body{background:#fff;}}
`;

export function buildExportHtml(opts: BuildExportHtmlOpts): string {
  const { audit, digest, title, chartImages, generatedOn } = opts;
  const overallLabel = RAG_LABEL[audit.overall];
  const sectionsHtml = audit.sections.map((s, i) => renderSection(s, i + 1, digest, chartImages)).join('');
  const recommendationsHtml =
    audit.recommendations.length > 0
      ? `<ol class="wsa-recommendations">${audit.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ol>`
      : '<p class="wsa-muted">No specific recommendations were flagged. Results look solid across the board.</p>';
  const sourceLine =
    audit.source === 'ai'
      ? `This report's ratings and wording were generated with AI assistance (model: ${escapeHtml(audit.model ?? 'unknown')}), checked against the rules below.`
      : 'No AI was used for this report. Every number, rating and sentence comes from fixed rules applied directly to your data.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wsa-report">
  <header class="wsa-cover">
    <h1>${escapeHtml(title)}</h1>
    <dl class="wsa-cover-meta">
      <div><dt>Generated</dt><dd>${escapeHtml(generatedOn)}</dd></div>
      <div><dt>Respondents</dt><dd>${digest.respondentCount}</dd></div>
      <div><dt>Completion</dt><dd>${Math.round(digest.completionRate * 100)}%</dd></div>
    </dl>
    <p class="wsa-overall">Overall <span class="wsa-badge wsa-badge--${audit.overall}">${overallLabel}</span></p>
  </header>

  <section>
    <h2>Executive summary</h2>
    <p>${escapeHtml(audit.executiveSummary)}</p>
  </section>

  <section>
    <h2>Findings by area</h2>
    ${sectionsHtml}
  </section>

  <section>
    <h2>Recommendations</h2>
    ${recommendationsHtml}
  </section>

  <section>
    <h2>Explore: all charts</h2>
    ${renderGallery(digest, chartImages)}
  </section>

  <footer class="wsa-methodology">
    <h2>Methodology &amp; privacy</h2>
    <p>Rating questions are scored favourable when an answer falls in the top 30% of the scale, unfavourable when it falls in the bottom 30%, and neutral in between.</p>
    <p>Sections are rated green at 75% or more favourable, amber from 50% to 74%, and red below 50%. Comment sentiment uses a similar idea: green when 66% or more of comments with a clear tone are positive, amber from 40% to 65%, and red below 40%.</p>
    <p>${sourceLine}</p>
    <p>Comments are automatically checked for names, emails, phone numbers and other personal details, and any column that could contain personal information is excluded, before this report is produced. This is a best-effort process, not a guarantee.</p>
  </footer>
</div>
</body>
</html>`;
}

export function downloadExport(html: string, fileName: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
