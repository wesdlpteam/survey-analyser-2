import { useApp } from './store/appStore';
import Landing from './ui/Landing';
import QuarantinePanel from './ui/QuarantinePanel';

// Temporary report placeholder for this task only - respondent count + raw
// JSON digest, so the pipeline can be smoke-tested end to end. Replaced by
// the real report screens in Task 7/8.
function Report() {
  const model = useApp((s) => s.model);
  const digest = useApp((s) => s.digest);
  const audit = useApp((s) => s.audit);
  const reset = useApp((s) => s.reset);

  if (!model || !digest) {
    return <p style={{ padding: '1.5rem' }}>Reading your file…</p>;
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '60rem', margin: '0 auto' }}>
      <button
        type="button"
        onClick={reset}
        style={{
          background: 'none',
          border: '1px solid var(--wes-purple)',
          color: 'var(--wes-purple)',
          borderRadius: '8px',
          padding: '0.5rem 1rem',
          cursor: 'pointer',
          marginBottom: '1rem',
        }}
      >
        Start over
      </button>
      <p>{model.respondentCount} respondents</p>
      <QuarantinePanel />
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {JSON.stringify({ digest, audit }, null, 2)}
      </pre>
    </div>
  );
}

function App() {
  const phase = useApp((s) => s.phase);

  return (
    <>
      <header
        style={{
          backgroundColor: 'var(--wes-purple)',
          borderBottom: '4px solid var(--wes-gold)',
          padding: '1rem 1.5rem',
        }}
      >
        <h1 style={{ color: 'var(--wes-white)', fontSize: '1.25rem', margin: 0 }}>
          Wesley Survey Analyser
        </h1>
      </header>
      <main>{phase === 'landing' ? <Landing /> : <Report />}</main>
    </>
  )
}

export default App
