// Shows which columns were left out of the report and why, plus the manual
// override controls. Rendered on report screens. Reason strings come from
// src/pii/quarantine.ts - 'looks-personal' is the only value-shape-scan
// marker and is the only tier restorable from this UI (see Task 6 brief).
import type { ChangeEvent } from 'react';
import { useApp } from '../store/appStore';
import './QuarantinePanel.css';

const REASON_TEXT: Record<string, string> = {
  name: "looks like a person's name",
  email: 'looks like personal contact details',
  phone: 'looks like personal contact details',
  identifier: 'looks like an ID number or other identifying detail',
  metadata: 'this is form information, not a survey answer',
  'looks-personal': 'looks like it could contain personal details (auto-detected)',
  manual: 'you chose to leave this one out',
};

function reasonText(reason: string | undefined): string {
  return (reason && REASON_TEXT[reason]) || 'left out of the report';
}

export default function QuarantinePanel() {
  const model = useApp((s) => s.model);
  const manualExcluded = useApp((s) => s.manualExcluded);
  const restored = useApp((s) => s.restored);
  const setManualExcluded = useApp((s) => s.setManualExcluded);
  const toggleRestore = useApp((s) => s.toggleRestore);

  if (!model) return null;

  const quarantined = model.questions.filter((q) => q.quarantined);
  // Candidate pool for manual exclude: anything not auto-quarantined by a
  // hard rule or a value-shape scan - i.e. currently available, or currently
  // quarantined only because the user chose to exclude it by hand.
  const manualCandidates = model.questions.filter((q) => !q.quarantined || q.quarantineReason === 'manual');

  function handleManualChange(e: ChangeEvent<HTMLSelectElement>) {
    const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
    setManualExcluded(ids);
  }

  function putBack(id: string) {
    setManualExcluded(manualExcluded.filter((x) => x !== id));
  }

  return (
    <details className="quarantine-panel" open={quarantined.length > 0}>
      <summary className="quarantine-panel__summary">
        Columns left out of this report ({quarantined.length})
      </summary>
      <div className="quarantine-panel__body">
        <p className="quarantine-panel__intro">
          We automatically leave out anything that looks like personal information, so it never reaches
          charts, comments or an AI summary.
        </p>

        {quarantined.length > 0 && (
          <ul className="quarantine-panel__list">
            {quarantined.map((q) => (
              <li key={q.id} className="quarantine-panel__item">
                <div className="quarantine-panel__item-text">
                  <span className="quarantine-panel__title">{q.title}</span>
                  <span className="quarantine-panel__reason">: {reasonText(q.quarantineReason)}</span>
                </div>

                {q.quarantineReason === 'looks-personal' && (
                  <label className="quarantine-panel__toggle">
                    <input
                      type="checkbox"
                      checked={restored.includes(q.id)}
                      onChange={() => toggleRestore(q.id)}
                    />
                    Auto-detected: restore this column?
                  </label>
                )}

                {q.quarantineReason === 'manual' && (
                  <button type="button" className="quarantine-panel__putback" onClick={() => putBack(q.id)}>
                    Put this column back
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {manualCandidates.length > 0 && (
          <div className="quarantine-panel__manual">
            <label htmlFor="manual-exclude-select" className="quarantine-panel__manual-label">
              Leave out any other columns by hand
            </label>
            <select
              id="manual-exclude-select"
              multiple
              className="quarantine-panel__manual-select"
              value={manualExcluded}
              onChange={handleManualChange}
            >
              {manualCandidates.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                </option>
              ))}
            </select>
            <p className="quarantine-panel__manual-hint">Hold Ctrl (or Cmd on a Mac) to choose more than one.</p>
          </div>
        )}
      </div>
    </details>
  );
}
