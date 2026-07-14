// API key + model settings. The key never leaves this browser: it's read
// from and written to localStorage 'wsa2:key' only (see appStore.ts), never
// logged or sent anywhere by this component.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/appStore';
import './SettingsDrawer.css';

const PRESET_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'];

export default function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const apiKey = useApp((s) => s.apiKey);
  const setApiKey = useApp((s) => s.setApiKey);
  const aiModel = useApp((s) => s.aiModel);
  const setAiModel = useApp((s) => s.setAiModel);

  const [showKey, setShowKey] = useState(false);
  const isPreset = PRESET_MODELS.includes(aiModel);
  // Tracks which dropdown option is showing, independent of the persisted
  // aiModel - picking "Custom..." must not blank out the saved model before
  // the person has typed a replacement (that would silently clear
  // wsa2:model). Only handleCustomModelChange ever writes to the store.
  const [mode, setMode] = useState<'preset' | 'custom'>(isPreset ? 'preset' : 'custom');
  const [customModel, setCustomModel] = useState(isPreset ? '' : aiModel);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Focus trap: keep Tab / Shift+Tab cycling inside the dialog so focus
      // can never walk out into the page behind it. Recomputed on each press
      // so it stays correct when the custom-model input appears/disappears.
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleModelSelect(value: string) {
    if (value === 'custom') {
      setMode('custom');
    } else {
      setMode('preset');
      setAiModel(value);
    }
  }

  function handleCustomModelChange(value: string) {
    setCustomModel(value);
    setAiModel(value);
  }

  return (
    <div className="settings-drawer__overlay" onClick={onClose}>
      <div
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-drawer-heading"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-drawer__header">
          <h2 id="settings-drawer-heading" className="settings-drawer__heading">
            Settings
          </h2>
          <button type="button" ref={closeButtonRef} className="settings-drawer__close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="settings-drawer__field">
          <label htmlFor="api-key-input" className="settings-drawer__label">
            AI key (optional)
          </label>
          <div className="settings-drawer__key-row">
            <input
              id="api-key-input"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              placeholder="sk-..."
              className="settings-drawer__key-input"
            />
            <button
              type="button"
              className="settings-drawer__show-toggle"
              onClick={() => setShowKey((v) => !v)}
              aria-pressed={showKey}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="settings-drawer__note">Your key stays in this browser only.</p>
          <button type="button" className="settings-drawer__forget" onClick={() => setApiKey('')}>
            Forget key
          </button>
        </div>

        <div className="settings-drawer__field">
          <label htmlFor="ai-model-select" className="settings-drawer__label">
            AI model
          </label>
          <select
            id="ai-model-select"
            className="settings-drawer__select"
            value={mode === 'preset' ? aiModel : 'custom'}
            onChange={(e) => handleModelSelect(e.target.value)}
          >
            {PRESET_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          {mode === 'custom' && (
            <input
              type="text"
              className="settings-drawer__custom-model"
              value={customModel}
              onChange={(e) => handleCustomModelChange(e.target.value)}
              placeholder="Enter a model name"
              aria-label="Custom AI model name"
            />
          )}
        </div>
      </div>
    </div>
  );
}
