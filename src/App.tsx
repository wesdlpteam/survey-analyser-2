import { useState, type KeyboardEvent } from 'react';
import { useApp } from './store/appStore';
import Landing from './ui/Landing';
import QuarantinePanel from './ui/QuarantinePanel';
import AuditTab from './ui/AuditTab';
import ExploreTab from './ui/ExploreTab';
import AskTab from './ui/AskTab';
import ExportButton from './ui/ExportButton';
import './App.css';

type ReportTabId = 'audit' | 'explore' | 'ask';

const TABS: { id: ReportTabId; label: string }[] = [
  { id: 'audit', label: 'Audit' },
  { id: 'explore', label: 'Explore' },
  { id: 'ask', label: 'Ask' },
];

// WAI-ARIA tabs pattern: Left/Right (and Home/End) move focus AND selection
// together (single-select, "automatic activation" - the common case for a
// small, fast tab set like this one).
function nextTabIndex(key: string, current: number): number | null {
  if (key === 'ArrowRight') return (current + 1) % TABS.length;
  if (key === 'ArrowLeft') return (current - 1 + TABS.length) % TABS.length;
  if (key === 'Home') return 0;
  if (key === 'End') return TABS.length - 1;
  return null;
}

// Report header pill showing where the audit came from. Hidden entirely
// when no AI key is configured - the fallback audit is the whole story then,
// so there's nothing AI-related worth mentioning.
function AiStatusPill() {
  const apiKey = useApp((s) => s.apiKey);
  const aiStatus = useApp((s) => s.aiStatus);
  const aiError = useApp((s) => s.aiError);
  const retryAiAudit = useApp((s) => s.retryAiAudit);

  if (!apiKey || aiStatus === 'idle') return null;

  if (aiStatus === 'running') {
    return (
      <p className="report__ai-status report__ai-status--running" role="status">
        Writing AI audit…
      </p>
    );
  }

  if (aiStatus === 'error') {
    return (
      <p className="report__ai-status report__ai-status--error" role="alert">
        {aiError ?? 'The AI audit could not be generated. The audit below is still the rule-based one.'}
        <button type="button" className="report__ai-retry" onClick={() => retryAiAudit()}>
          Retry
        </button>
      </p>
    );
  }

  return <p className="report__ai-status report__ai-status--done">AI audit ready</p>;
}

function Report() {
  const model = useApp((s) => s.model);
  const digest = useApp((s) => s.digest);
  const reset = useApp((s) => s.reset);
  const [activeTab, setActiveTab] = useState<ReportTabId>('audit');

  if (!model || !digest) {
    return <p className="report__loading">Reading your file…</p>;
  }

  function selectTab(index: number) {
    setActiveTab(TABS[index].id);
    document.getElementById(`tab-${TABS[index].id}`)?.focus();
  }

  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextTabIndex(e.key, index);
    if (next === null) return;
    e.preventDefault();
    selectTab(next);
  }

  return (
    <div className="report">
      <div className="report__toolbar">
        <button type="button" className="report__reset" onClick={reset}>
          Start over
        </button>
        <AiStatusPill />
        <ExportButton />
      </div>

      <QuarantinePanel />

      <div className="report__tabs" role="tablist" aria-label="Report sections">
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`report__tab${activeTab === tab.id ? ' report__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, i)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id="panel-audit" role="tabpanel" aria-labelledby="tab-audit" hidden={activeTab !== 'audit'} className="report__panel">
        <AuditTab />
      </div>
      <div
        id="panel-explore"
        role="tabpanel"
        aria-labelledby="tab-explore"
        hidden={activeTab !== 'explore'}
        className="report__panel"
      >
        <ExploreTab />
      </div>
      <div id="panel-ask" role="tabpanel" aria-labelledby="tab-ask" hidden={activeTab !== 'ask'} className="report__panel">
        <AskTab />
      </div>
    </div>
  );
}

function App() {
  const phase = useApp((s) => s.phase);

  return (
    <>
      <header className="app-header">
        <h1 className="app-header__title">Wesley Survey Analyser</h1>
      </header>
      <main>{phase === 'landing' ? <Landing /> : <Report />}</main>
    </>
  );
}

export default App;
