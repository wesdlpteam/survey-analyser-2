// The upload screen: hero, drag-drop zone, optional context note, sample
// data shortcut, privacy strip and the settings entry point.
import { useRef, useState } from 'react';
import { useApp } from '../store/appStore';
import SettingsDrawer from './SettingsDrawer';
import './Landing.css';

export default function Landing() {
  const loadFile = useApp((s) => s.loadFile);
  const loadSample = useApp((s) => s.loadSample);
  const context = useApp((s) => s.context);
  const setContext = useApp((s) => s.setContext);
  const error = useApp((s) => s.error);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void loadFile(file);
  }

  return (
    <div className="landing">
      <div className="landing__topbar">
        <button
          type="button"
          className="landing__settings-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M19.4 13a7.4 7.4 0 0 0 .07-1 7.4 7.4 0 0 0-.07-1l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.5 7.5 0 0 0-1.73-1L14.5 2.9a.5.5 0 0 0-.5-.4h-3.84a.5.5 0 0 0-.5.4l-.4 2.29a7.5 7.5 0 0 0-1.73 1l-2.39-.96a.5.5 0 0 0-.6.22L2.62 8.78a.5.5 0 0 0 .12.64L4.77 11c-.04.33-.07.66-.07 1s.03.67.07 1l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.53.43 1.1.77 1.73 1l.4 2.29c.05.24.26.4.5.4h3.84c.24 0 .45-.16.5-.4l.4-2.29a7.5 7.5 0 0 0 1.73-1l2.39.96c.21.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64L19.4 13Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="landing__hero">
        <p className="landing__standfirst">Made for Wesley College</p>
        <h1 className="landing__headline">Understand any survey in minutes.</h1>
        <p className="landing__body">
          Drop in a Microsoft Forms export and get a plain-English report: what people said, where the
          strengths and concerns are, and the comments behind the numbers.
        </p>

        <button
          type="button"
          className={`landing__dropzone${isDragging ? ' landing__dropzone--dragging' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 15V4m0 0 4 4m-4-4-4 4M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
              stroke="var(--wes-purple)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="landing__dropzone-text">Drag your file here, or click to choose a file</span>
          <span className="landing__dropzone-hint">Microsoft Forms .xlsx export</span>
        </button>
        <input
          ref={fileInputRef}
          id="survey-file-input"
          name="surveyFile"
          type="file"
          accept=".xlsx,.xls"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {error && (
          <p role="alert" className="landing__error">
            {error}
          </p>
        )}

        <div className="landing__context">
          <label htmlFor="survey-context" className="landing__context-label">
            What is this survey about? (optional)
          </label>
          <input
            id="survey-context"
            type="text"
            className="landing__context-input"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. Staff engagement, Term 1 2026"
          />
        </div>

        <button type="button" className="landing__sample-btn" onClick={loadSample}>
          Try with sample data
        </button>

        <p className="landing__privacy">
          Your file is read on this computer only. It is never uploaded anywhere. We automatically hide
          columns that look like names, emails or ID numbers, and we do our best to strip stray personal
          details out of comments. Automatic checks cannot catch everything, so once your report is ready
          you can also leave any column out by hand.
        </p>
      </div>

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
