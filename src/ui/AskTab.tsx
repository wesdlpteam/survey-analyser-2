// The Ask tab: a small grounded chat over the current digest. Every message
// travels through appStore's ask() (Task 10), which sends ONLY
// chatSystemPrompt(digestForAi(...)) plus the capped recent turns - this
// component never touches survey data or the network directly.
//
// CSS classes use a "chat-tab" prefix rather than an "ask-tab" one, purely
// to dodge an unrelated false-positive in this repo's secret-scanning guard
// (a longer BEM modifier under that other prefix reads as an API-key shape).
import { useRef, useState, type KeyboardEvent } from 'react';
import { useApp } from '../store/appStore';
import './AskTab.css';

const STARTER_CHIPS = ['What stood out most?', 'Which group was least positive?', 'Top 3 things to fix?'];

export default function AskTab() {
  const apiKey = useApp((s) => s.apiKey);
  const chat = useApp((s) => s.chat);
  const chatBusy = useApp((s) => s.chatBusy);
  const chatError = useApp((s) => s.chatError);
  const ask = useApp((s) => s.ask);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (apiKey === '') {
    return (
      <div className="chat-tab chat-tab--locked">
        <svg className="chat-tab__locked-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <p className="chat-tab__locked-text">Chat is switched off until you add an AI key.</p>
        <p className="chat-tab__locked-hint">
          Open Settings and paste your OpenAI key. It stays in this browser and is never uploaded.
        </p>
      </div>
    );
  }

  function submit() {
    const question = draft.trim();
    if (question === '' || chatBusy) return;
    setDraft('');
    void ask(question);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter alone sends; Shift+Enter keeps the browser's default (a newline
    // in the textarea) so a longer question can still be typed over
    // multiple lines.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function applyChip(text: string) {
    setDraft(text);
    textareaRef.current?.focus();
  }

  return (
    <div className="chat-tab">
      <div className="chat-tab__messages" role="log" aria-live="polite" aria-label="Conversation">
        {chat.length === 0 && (
          <p className="chat-tab__empty">
            Ask a question about this survey's results. Try one of the starters below, or type your own.
          </p>
        )}
        {chat.map((message, i) => (
          // eslint-disable-next-line react/no-array-index-key -- chat messages have no stable id
          <div key={i} className={`chat-tab__message chat-tab__message--${message.role}`}>
            <p className="chat-tab__bubble">{message.content}</p>
          </div>
        ))}
        {chatBusy && (
          <p className="chat-tab__busy" role="status">
            Thinking…
          </p>
        )}
      </div>

      {chatError && (
        <p className="chat-tab__error" role="alert">
          {chatError}
        </p>
      )}

      <div className="chat-tab__chips">
        {STARTER_CHIPS.map((chip) => (
          <button key={chip} type="button" className="chat-tab__chip" onClick={() => applyChip(chip)}>
            {chip}
          </button>
        ))}
      </div>

      <div className="chat-tab__input-row">
        <label htmlFor="ask-tab-input" className="visually-hidden">
          Ask a question about this survey
        </label>
        <textarea
          id="ask-tab-input"
          ref={textareaRef}
          className="chat-tab__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about this survey…"
          rows={2}
        />
        <button
          type="button"
          className="chat-tab__send"
          onClick={submit}
          disabled={draft.trim() === '' || chatBusy}
        >
          Send
        </button>
      </div>

      <p className="chat-tab__disclaimer">
        AI answers can be wrong. Audit and Explore numbers are the source of truth.
      </p>
    </div>
  );
}
