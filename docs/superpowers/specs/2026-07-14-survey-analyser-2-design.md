# Wesley Survey Analyser 2.0 — Design Spec

Date: 2026-07-14
Status: Approved pending user review
Owner: Nathan Benn

## 1. Overview

Web app hosted on GitHub Pages. User drops in a Microsoft Forms Excel export (.xlsx),
optionally types one line of survey context, and the app builds a professional,
clickable, audit-style results page with three tabs: **Audit**, **Explore**, **Ask**.

Brand-new project. No code shared with Survey Analyser v1 ("Pulse").

## 2. Goals

- World-class, audit-grade survey report from a Microsoft Forms export.
- Hybrid output: formal audit report + interactive explore dashboard + AI chat.
- AI-written narrative (exec summary, findings, ratings rationale, recommendations,
  comment themes) powered by user-supplied OpenAI API key.
- Full Wesley College brand kit, executed "exciting and modern".
- Shareable: one-click export to a single self-contained interactive HTML file + clean
  print-to-PDF styling.
- Safe for school data: all file processing client-side; PII quarantined; nothing from
  the spreadsheet ever stored on GitHub or any server.

## 3. Non-goals

- No backend/server. No accounts. No data storage anywhere.
- No support guarantee for non-Forms exports (best effort only if trivial).
- No learner-facing use; staff tool.
- No per-band (PYP/MYP/Senior) colour theming — not in brand.

## 4. Users

Nathan + colleague(s) at Wesley College. Non-technical. App must work by
"open page → drop file → read report".

## 5. Input & parsing

- Accepts `.xlsx` (Microsoft Forms export). Drag-drop or file picker.
- Parse with SheetJS entirely in browser.
- Microsoft Forms export shape: row 1 = headers (question titles + metadata columns
  like ID, Start time, Completion time, Email, Name), one row per respondent.
- Question type detection per column:
  - **Choice** (single/multi; multi = semicolon-separated values)
  - **Rating/Likert** (numeric 1–5/1–10, or ordered agreement scales)
  - **Numeric**
  - **Open text**
  - **Date/metadata**
- Likert text scales (e.g. Strongly disagree → Strongly agree) mapped to ordered
  numeric internally; original labels kept for display.
- Malformed/empty file → friendly plain-English error, nothing crashes.

## 6. PII quarantine (before any analysis)

- Auto-detect and quarantine columns: names, emails, ID numbers, phone numbers,
  IP addresses, and Forms metadata identity columns (Email, Name).
- Quarantined columns are excluded from stats, charts, AI payloads, exports, and chat.
- Comment text is scrubbed before any AI call: emails, phone numbers, and detected
  person-name patterns replaced with placeholders (e.g. `[name]`).
- Quarantine panel in UI shows what was excluded and why (transparency), with column
  names only, never values.
- User can additionally mark any column as "exclude" manually.

## 7. Stats engine (local, deterministic)

Separately-tested TypeScript module. Computes:
- Response count, completion rate, per-question response rate.
- Choice: counts, percentages.
- Rating: mean, median, distribution, % favourable / neutral / unfavourable
  (top-2 / middle / bottom-2 box on 5-point; documented rule per scale length).
- Numeric: mean, median, min/max.
- Text: comment count, length stats, keyword/theme candidates (local term frequency)
  as fallback when no AI.
- Group comparison: any categorical question can segment any other question
  (means/percentages per group).
- Rule-based sentiment fallback for text (simple lexicon) when no API key.

AI narrates; the stats engine is the single source of numeric truth. AI never invents
figures; every number shown in narrative sections is interpolated from computed stats.

## 8. Ratings (RAG)

- Each report section and the overall survey get Green / Amber / Red badge.
- Default rule (no AI): favourable % thresholds — Green ≥ 75, Amber 50–74, Red < 50;
  text-only sections rated from sentiment balance. Rules documented in UI tooltip.
- With AI: AI may adjust one step from rule-based rating with stated justification;
  UI marks rating source ("rules" vs "AI-adjusted").

## 9. AI integration (OpenAI, bring-your-own key)

- Key pasted into settings drawer; stored in `localStorage` only; masked in UI;
  "forget key" button. Never in repo, exports, or URLs.
- Model: sensible low-cost default (e.g. `gpt-4o-mini` or current equivalent);
  dropdown for other chat-completions models.
- Payload to OpenAI: survey context line, question titles, aggregate stats, and
  PII-scrubbed comment text only. Never quarantined columns, never raw rows.
- AI jobs:
  1. Executive summary.
  2. Section findings (numbered, each tied to specific stats given in prompt).
  3. Comment theme extraction + representative quotes (scrubbed).
  4. Recommendations.
  5. Ask-tab chat: answers grounded in a stats digest sent as context; refuses
     questions requiring data it doesn't have.
- All AI output rendered as text (no HTML injection); findings must reference stat IDs
  provided in the prompt so the app can render linked evidence.
- No key / API error → graceful fallback: rule-based summary bullets, term-frequency
  themes, rule-based ratings, chat tab disabled with friendly note.

## 10. UI structure

### Landing / upload
- Wesley-branded hero. Drag-drop zone, file picker, survey context input,
  settings drawer (API key, model), plain-English privacy statement.
- Demo mode: "Try with sample data" button using a fabricated survey.

### Tab 1 — Audit
- Cover block: survey title (from filename/context, editable), date, respondent count,
  completion rate, overall RAG badge.
- Executive summary (AI or fallback).
- Sections (one per question group/topic; grouping heuristic: rating batteries and
  related questions clustered, else per-question): RAG badge + numbered findings.
- Each finding clickable → expands evidence: the chart + supporting stats + backing
  anonymised comments.
- Recommendations section.
- Methodology & privacy footnote (what was excluded, rating rules, AI model used).

### Tab 2 — Explore
- KPI tiles (responses, completion, average favourability, comment sentiment).
- Chart per question (type-appropriate: bars for choice, diverging/stacked for Likert,
  histogram for numeric), respecting dataviz craft.
- Global segment filter (choose a categorical question → all charts split/compare).
- Comment browser: themes → click theme → read scrubbed comments.

### Tab 3 — Ask
- Chat interface. Suggested starter questions. Answers grounded in stats digest.
- Clear "AI can be wrong; numbers in Audit/Explore are the source of truth" note.
- Hidden/disabled without API key.

### Export
- "Export report" → generates a single self-contained `.html` file: full Audit tab
  (and Explore charts) with inline styles/scripts/data, still clickable offline.
  Contains aggregates and scrubbed comments only. Never the API key, never
  quarantined data. Chat not included.
- Print stylesheet: Audit tab prints as a clean paginated document (PDF via
  browser print).

## 11. Look & feel

Direction: **"Wesley but exciting and modern."** Bold, confident, contemporary;
subtle motion; still unmistakably Wesley.

- Wesley brand kit tokens (purple `#4F2759` sole interactive colour; gold `#C59F40`
  accent; neutrals for card layers; interface trio strictly for RAG state;
  highlighter pastels for chips/callouts with AA-safe inks).
- Typography: Graphik with `Segoe UI, system-ui` fallback. **No Graphik font files
  committed or served** (public repo licensing). Avenir Black fallback stack for
  display moments only if locally available.
- Type colour roles per brand layout-hierarchy pages (gold headline on white,
  purple standfirst, neutral body; ranged left; no centred headings; no underlined
  headings).
- "Exciting and modern" executed via: strong hero, purposeful micro-interactions and
  reveal transitions (respecting `prefers-reduced-motion`), animated count-up KPIs,
  polished charts, generous spacing — not via off-brand colours.
- WCAG 2.2 AA throughout: contrast verified, keyboard navigable, focus visible,
  charts with accessible fallback tables.

## 12. Architecture

- React (latest stable) + Vite + TypeScript. Chart.js (via react wrapper or thin custom wrapper).
  SheetJS (`xlsx`) for parsing.
- Module boundaries (each independently testable):
  - `parser/` — xlsx → typed survey model (questions, types, responses)
  - `pii/` — detection, quarantine, text scrubbing
  - `stats/` — all computation (pure functions)
  - `ratings/` — RAG rules
  - `ai/` — OpenAI client, prompt builders, response validators, fallbacks
  - `exporter/` — standalone HTML generation
  - `ui/` — components (tabs, findings, charts, chat), design tokens in CSS variables
- State: single app store (lightweight, e.g. React context/zustand) holding
  survey model + computed stats + AI artifacts.

## 13. Hosting & repo hygiene (public GitHub)

- Public repo, GitHub Pages deploy via GitHub Actions on push to `main`.
- `.gitignore`: `node_modules`, `dist`, `.env*`, `*.xlsx`, `*.xls`, `*.csv`
  (belt-and-braces: real survey files can never be committed even by accident),
  any font binaries.
- Test fixtures are fabricated data generated in-repo as code/JSON, clearly fake names
  like "Student A" — no real people, no real survey exports.
- No secrets anywhere in repo. Key is runtime-only user input.
- Push to GitHub only after Nathan's explicit OK (per his safety rule).

## 14. Testing & verification

- Vitest unit tests: stats engine (against hand-computed expected values),
  PII detection/scrubbing, ratings rules, parser against fabricated Forms fixtures.
- Playwright: upload fixture → report renders → tabs clickable → export produces
  self-contained file; axe-core accessibility scan (WCAG 2.2 AA) on main screens.
- AI layer tested with mocked responses (no live key in CI).
- Manual live check with Nathan's key before calling it done.

## 15. Success criteria

1. Drop a real Forms export → complete audit page in under ~10 s (excluding AI calls).
2. Zero spreadsheet data leaves the browser except documented anonymised AI payload.
3. Works with no API key (degraded but useful); works fully with key.
4. Export file opens offline in a fresh browser, fully styled and clickable.
5. Colleague can use it from a GitHub Pages URL with zero instructions.
6. Passes axe WCAG 2.2 AA scan; brand review against Wesley kit.
