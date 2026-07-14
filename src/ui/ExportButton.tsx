// Wires the real Export button into the report header (Task 11): collects
// whatever chart images are currently mounted (Explore's bare ids and
// Audit's 'audit:'-prefixed ids), builds a self-contained HTML report, and
// triggers a browser download. Disabled until a digest+audit are loaded -
// same guard App.tsx's placeholder button used before this task.
import { useApp } from '../store/appStore';
import { getChartImage } from './charts/ChartCanvas';
import { buildExportFileName, buildExportHtml, downloadExport } from '../exporter/exportHtml';

function formatGeneratedOn(): string {
  return new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Collects every chart image currently on screen for a question, under both
// possible ids - buildExportHtml itself picks whichever is valid (present,
// not the ChartCanvas 'data:,' degenerate value) for each spot it renders.
function collectChartImages(digest: { questions: { questionId: string; kind: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of digest.questions) {
    if (q.kind === 'text') continue;
    const bare = getChartImage(q.questionId);
    if (bare) out[q.questionId] = bare;
    const auditVariant = getChartImage(`audit:${q.questionId}`);
    if (auditVariant) out[`audit:${q.questionId}`] = auditVariant;
  }
  return out;
}

export default function ExportButton() {
  const digest = useApp((s) => s.digest);
  const audit = useApp((s) => s.audit);
  const reportTitle = useApp((s) => s.reportTitle);

  const disabled = !digest || !audit;

  function handleExport() {
    if (!digest || !audit) return;
    const title = reportTitle.trim() || 'Survey audit report';
    const html = buildExportHtml({
      audit,
      digest,
      title,
      chartImages: collectChartImages(digest),
      generatedOn: formatGeneratedOn(),
    });
    const fileName = buildExportFileName(title, new Date());
    downloadExport(html, fileName);
  }

  return (
    <button type="button" className="report__export" onClick={handleExport} disabled={disabled}>
      Export report
    </button>
  );
}
