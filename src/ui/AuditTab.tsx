// The Audit tab: renders an AuditReport (src/ai/auditTypes.ts) as a
// read-like-a-document report - cover, executive summary, numbered RAG
// sections with drill-down findings, recommendations, and a methodology &
// privacy footnote. Renders identically whether `audit.source` is 'rules'
// (today, Task 5's fallback) or 'ai' (Task 9) - every field this component
// reads is on the shared AuditReport type, never fallback-specific.
import { useState } from 'react';
import { useApp } from '../store/appStore';
import FindingRow from './FindingRow';
import RagBadge from './RagBadge';
import './AuditTab.css';

const TODAY = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

export default function AuditTab() {
  const model = useApp((s) => s.model);
  const digest = useApp((s) => s.digest);
  const audit = useApp((s) => s.audit);
  const reportTitle = useApp((s) => s.reportTitle);
  const setReportTitle = useApp((s) => s.setReportTitle);
  const [editingTitle, setEditingTitle] = useState(false);
  // Draft value while editing, kept OUT of the store until commit - typing
  // straight into the store field would make Escape and Enter behave
  // identically (nothing left to "cancel" back to).
  const [draftTitle, setDraftTitle] = useState(reportTitle);

  if (!model || !digest || !audit) return null;

  const quarantinedTitles = model.questions.filter((q) => q.quarantined).map((q) => q.title);

  function startEditingTitle() {
    setDraftTitle(reportTitle);
    setEditingTitle(true);
  }

  function commitTitle() {
    setReportTitle(draftTitle);
    setEditingTitle(false);
  }

  return (
    <div className="audit-tab">
      <header className="audit-tab__cover">
        <div className="audit-tab__title-row">
          {editingTitle ? (
            <input
              className="audit-tab__title-input"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle();
                if (e.key === 'Escape') setEditingTitle(false); // discard draft, keep the stored title
              }}
              aria-label="Report title"
              autoFocus
            />
          ) : (
            <>
              <h1 className="audit-tab__title">{reportTitle}</h1>
              <button
                type="button"
                className="audit-tab__title-edit"
                onClick={startEditingTitle}
                aria-label="Edit report title"
                title="Edit report title"
              >
                ✏️
              </button>
            </>
          )}
        </div>

        <dl className="audit-tab__cover-meta">
          <div className="audit-tab__cover-stat">
            <dt>Date</dt>
            <dd>{TODAY}</dd>
          </div>
          <div className="audit-tab__cover-stat">
            <dt>Respondents</dt>
            <dd>{digest.respondentCount}</dd>
          </div>
          <div className="audit-tab__cover-stat">
            <dt>Completion</dt>
            <dd>{Math.round(digest.completionRate * 100)}%</dd>
          </div>
        </dl>

        <div className="audit-tab__cover-overall">
          <span className="audit-tab__cover-overall-label">Overall</span>
          <RagBadge rag={audit.overall} size="lg" />
        </div>
      </header>

      <section className="audit-tab__section" aria-labelledby="audit-exec-summary-heading">
        <h2 id="audit-exec-summary-heading" className="audit-tab__heading--gold">
          Executive summary
        </h2>
        <p className="audit-tab__body-text">{audit.executiveSummary}</p>
      </section>

      <section className="audit-tab__section" aria-labelledby="audit-sections-heading">
        <h2 id="audit-sections-heading" className="audit-tab__heading--gold">
          Findings by area
        </h2>
        {audit.sections.map((section, i) => {
          const num = i + 1;
          return (
            <article
              key={section.questionIds.join('-') || section.title}
              className={`audit-section audit-section--${section.rag}`}
            >
              <header className="audit-section__header">
                <h3 className="audit-section__title">
                  <span className="audit-section__number">{num}.</span> {section.title}
                </h3>
                <div className="audit-section__badges">
                  <RagBadge rag={section.rag} title={section.ragJustification} />
                  {section.ragSource === 'ai-adjusted' && (
                    <span className="audit-section__ai-tag" title="Adjusted by AI review">
                      AI-adjusted
                    </span>
                  )}
                </div>
              </header>
              <p className="audit-section__justification">{section.ragJustification}</p>
              <div className="audit-section__findings">
                {section.findings.map((finding, j) => (
                  <FindingRow
                    // eslint-disable-next-line react/no-array-index-key -- findings have no stable id
                    key={j}
                    index={`${num}.${j + 1}`}
                    finding={finding}
                    digest={digest}
                    model={model}
                  />
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <section className="audit-tab__section" aria-labelledby="audit-recommendations-heading">
        <h2 id="audit-recommendations-heading" className="audit-tab__heading--gold">
          Recommendations
        </h2>
        {audit.recommendations.length > 0 ? (
          <ol className="audit-tab__recommendations" aria-label="Recommendations">
            {audit.recommendations.map((r, i) => (
              // eslint-disable-next-line react/no-array-index-key -- recommendations have no stable id
              <li key={i}>{r}</li>
            ))}
          </ol>
        ) : (
          <p className="audit-tab__body-text">No specific recommendations were flagged — results look solid across the board.</p>
        )}
      </section>

      <footer className="audit-tab__methodology" aria-labelledby="audit-methodology-heading">
        <h2 id="audit-methodology-heading" className="audit-tab__heading--gold">
          Methodology &amp; privacy
        </h2>

        <p className="audit-tab__body-text">
          Rating questions are scored favourable when an answer falls in the top 30% of the scale, unfavourable
          when it falls in the bottom 30%, and neutral in between.
        </p>

        <p className="audit-tab__body-text">
          Sections are rated green at 75% or more favourable, amber from 50% to 74%, and red below 50%. Comment
          sentiment uses a similar idea: green when 66% or more of comments with a clear tone are positive, amber
          from 40% to 65%, and red below 40%. Questions with no favourable/unfavourable meaning (multiple-choice
          or number answers) show amber to mean &ldquo;no rating applies&rdquo;, not a warning.
        </p>

        <p className="audit-tab__body-text">
          {audit.source === 'ai'
            ? `This report's ratings and wording were generated with AI assistance (model: ${audit.model ?? 'unknown'}), checked against the rules above.`
            : 'No AI was used for this report — every number, rating and sentence comes from fixed rules applied directly to your data.'}
        </p>

        <p className="audit-tab__body-text">
          Comments are automatically checked for names, emails, phone numbers and other personal details before
          they appear here. This is a best-effort process, not a guarantee — for example, a colleague mentioned by
          first name only, or an email, phone number or ID written in an unusual format, might not always be
          caught. If you spot anything that should have been removed, use the column exclude option above to leave
          that question out of the report, or fix the file and upload it again.
        </p>

        {quarantinedTitles.length > 0 ? (
          <>
            <p className="audit-tab__body-text">
              The following columns were left out of this report because they could contain personal information:
            </p>
            <ul className="audit-tab__quarantine-list">
              {quarantinedTitles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="audit-tab__body-text">No columns needed to be left out of this report.</p>
        )}
      </footer>
    </div>
  );
}
