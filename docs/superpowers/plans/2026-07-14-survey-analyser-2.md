# Wesley Survey Analyser 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Client-side React app on GitHub Pages: drop Microsoft Forms .xlsx → audit-style clickable report (Audit / Explore / Ask tabs), BYO OpenAI key, Wesley brand, self-contained HTML export.

**Architecture:** Pure client-side. `parser → pii → stats → ratings → (ai | fallback) → ui/exporter` pipeline. Stats engine is sole numeric truth; AI narrates only. Zustand store holds pipeline artifacts. No server, no data persistence except API key in localStorage.

**Tech Stack:** React (latest) + Vite + TypeScript, zustand, chart.js v4, xlsx (SheetJS), vitest, Playwright + axe-core (final task).

**Spec:** `docs/superpowers/specs/2026-07-14-survey-analyser-2-design.md` — read it first.

## Global Constraints

- ALL processing client-side. Survey data NEVER sent anywhere except documented anonymised OpenAI payload (aggregates + scrubbed comments only).
- Quarantined columns: excluded from stats, charts, AI payloads, exports, chat.
- API key: localStorage only, masked in UI, never in repo/exports/URLs.
- `.gitignore` must include: `node_modules`, `dist`, `.env*`, `*.xlsx`, `*.xls`, `*.csv`, `*.otf`, `*.ttf`, `*.woff`, `*.woff2`.
- Fixtures: fabricated data only, fake names ("Alex Sample", "Student A"). Never real exports.
- Brand: purple `#4F2759` is the ONLY interactive colour; gold `#C59F40` accent; RAG uses interface trio green `#58C337` amber `#F0A54F` red `#E83534` (state only). Fonts: `"Graphik","Segoe UI",system-ui,sans-serif` — NO font files committed. No centred headings, no underlined headings, range left.
- WCAG 2.2 AA: 4.5:1 body text, visible focus, keyboard operable, `prefers-reduced-motion` respected.
- App copy: plain English, no jargon. Non-technical audience.
- No pushing to GitHub without Nathan's explicit OK (Task 13 pauses for it).
- Commit after every task (message style `feat:`/`test:`/`chore:`).
- Working dir: `c:\Users\BennN\OneDrive - Wesley College\Documents\Apps Nathan Developed\Survey Analyser 2.0` (repo root = app root).

---

### Task 1: Scaffold + brand tokens

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/styles/global.css`, `.gitignore`

**Interfaces:**
- Produces: running Vite dev server; CSS custom properties every later task uses (`--wes-*` names below); `App` renders `<header>` + empty `<main>`.

- [ ] **Step 1: Scaffold Vite app in repo root**

```bash
cd "c:\Users\BennN\OneDrive - Wesley College\Documents\Apps Nathan Developed\Survey Analyser 2.0"
npm create vite@latest . -- --template react-ts
npm install
npm install zustand chart.js xlsx
npm install -D vitest @vitest/coverage-v8 jsdom
```
If `npm create vite` refuses non-empty dir (docs/, .git present), scaffold into `tmp-scaffold`, move contents up, delete `tmp-scaffold`.

- [ ] **Step 2: .gitignore**

```gitignore
node_modules
dist
.env*
*.xlsx
*.xls
*.csv
*.otf
*.ttf
*.woff
*.woff2
*.log
```

- [ ] **Step 3: tokens.css** — paste Wesley kit tokens exactly:

```css
:root {
  --wes-purple: #4F2759; --wes-gold: #C59F40; --wes-black: #000; --wes-white: #fff;
  --wes-yellow-dark:#A2814A; --wes-yellow:#DFAB57; --wes-yellow-light:#FFD157;
  --wes-orange-dark:#A35333; --wes-orange:#F37024; --wes-orange-light:#FFA245;
  --wes-red-dark:#983859; --wes-red:#DC3859; --wes-red-light:#FA3859;
  --wes-blue-dark:#4242A1; --wes-blue:#2F60C7; --wes-blue-light:#7CA3FF;
  --wes-green-dark:#636656; --wes-green:#6E9D60; --wes-green-light:#86C791;
  --wes-neutral-100:#EFEDED; --wes-neutral-200:#E6E2DD; --wes-neutral-300:#DAD7D1; --wes-neutral-900:#2B281F;
  --wes-success:#58C337; --wes-warning:#F0A54F; --wes-error:#E83534;
  --wes-tint-amber:#FFEDBC; --wes-tint-peach:#FFDAB5; --wes-tint-rose:#FDAFBD; --wes-tint-blue:#CBDAFF; --wes-tint-green:#CFE9D3;
  --wes-ink-gold:#7A5012; --wes-ink-rose:#8F1D2E; --wes-ink-rust:#8A4B12;
  --wes-font-ui:"Graphik","Segoe UI",system-ui,sans-serif;
  /* derived (this app) */
  --rag-green-bg:#e7f6e2; --rag-green-ink:#2c6b1a;
  --rag-amber-bg:#fdf0dd; --rag-amber-ink:#8a5410;
  --rag-red-bg:#fde4e4; --rag-red-ink:#a31817;
  --radius:14px; --shadow:0 2px 12px rgb(43 40 31 / .08);
}
```
Note: `--rag-*-ink` are AA-safe darkened inks for text on tint; raw interface trio reserved for badges/dots with dark text or as large graphic fills only. Verify all pairings ≥4.5:1.

- [ ] **Step 4: global.css** — reset, `body{font-family:var(--wes-font-ui);color:var(--wes-neutral-900);background:var(--wes-white)}`, `h1..h4{text-align:left}`, link/button base = purple, `:focus-visible{outline:3px solid var(--wes-purple);outline-offset:2px}`, `@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}`.

- [ ] **Step 5: App.tsx** — purple header bar: app name "Wesley Survey Analyser" (white), gold underline-free accent rule; empty `<main>`. `index.html` title + `<html lang="en">`.

- [ ] **Step 6: vitest config** — in `vite.config.ts` add `test: { environment: 'jsdom' }` (`/// <reference types="vitest/config" />`). Add scripts: `"test":"vitest run"`, `"test:watch":"vitest"`.

- [ ] **Step 7: Verify** — `npm run dev` serves; `npm run build` passes; `npx vitest run` reports no tests (exit 0 with `--passWithNoTests` flag added to script).

- [ ] **Step 8: Commit** — `chore: scaffold vite react-ts app with wesley tokens`

---

### Task 2: Types + fixture builder + Forms parser

**Files:**
- Create: `src/types.ts`, `src/parser/formsParser.ts`, `src/fixtures/build.ts`, `src/parser/formsParser.test.ts`

**Interfaces:**
- Produces:
```ts
// types.ts
export type QType = 'choice' | 'multiChoice' | 'rating' | 'numeric' | 'text' | 'meta';
export interface Question {
  id: string;              // 'q' + column index, e.g. 'q3'
  title: string;
  type: QType;
  options?: string[];
  scale?: { min: number; max: number; labels?: string[] }; // labels index 0 = min
  quarantined: boolean;
  quarantineReason?: string;
}
export interface SurveyModel {
  title: string;
  questions: Question[];
  rows: (string | number | null)[][]; // rows[r][colIndex]; rating answers normalised to numbers
  respondentCount: number;
}
export class ParseError extends Error {}
// formsParser.ts
export function parseWorkbook(data: ArrayBuffer, fileName: string): SurveyModel;
// fixtures/build.ts
export function buildFixtureWorkbook(): ArrayBuffer;   // xlsx binary via XLSX.write
export function sampleModel(): SurveyModel;            // parsed fixture, for demo mode + later tests
```

**Fixture content (fabricated staff-survey, reused everywhere):** headers
`ID, Start time, Completion time, Email, Name, Which campus are you based at?, Your role, How satisfied are you with communication? (1-5), I feel supported by leadership., How likely are you to recommend working here? (0-10), Which resources do you use? , What is working well?, What could be improved?`
14 data rows: campuses Glen Waverley/St Kilda Rd/Elsternwick; roles Teacher/Support staff/Leadership; satisfaction ints 1–5; agreement labels Strongly disagree…Strongly agree; 0–10 ints; resources semicolon-joined (`Library;Printing`, etc.); open text incl. one comment containing `Contact me on john.smith@example.com or 0412 345 678` and names `Mr Chen`, fake emails `alex.sample@example.com`.

**Detection rules (implement in this order per column):**
1. Header in metadata set (case-insensitive): `id, start time, completion time, email, name, last modified time, language, total points` or starts with `points -`/`feedback -` → `meta`.
2. Collect non-empty values. All parse as finite numbers AND integer AND distinct ≤ 12 AND min ≥ 0 AND max ≤ 10 AND max−min ≥ 2 → `rating`, scale `{min,max}` from observed bounds snapped: if min∈{0,1} and max∈{5,10} use those; else observed.
3. All numeric otherwise → `numeric`.
4. Ordered Likert label sets (compare lowercased trimmed distinct values as subset): `[strongly disagree, disagree, neither agree nor disagree|neutral, agree, strongly agree]`, `[very dissatisfied, dissatisfied, neutral, satisfied, very satisfied]`, `[never, rarely, sometimes, often, always]` → `rating` scale `{min:1,max:5,labels}`; normalise row values to 1–5 numbers in `rows`.
5. Any value contains `;` AND distinct token count ≤ 15 → `multiChoice`, options = distinct tokens.
6. Distinct ≤ 12 AND (distinct/nonEmpty ≤ 0.6 OR nonEmpty < 8) AND every value length ≤ 60 → `choice`, options sorted by frequency desc.
7. Else `text`.
`quarantined:false` for all here (Task 3 sets it). Title = header trimmed. Survey title = fileName minus extension, underscores/hyphens → spaces. Zero data rows or no headers → `throw new ParseError('This file has no survey responses in it.')`.

- [ ] **Step 1: Write failing tests** (`formsParser.test.ts`): build fixture via `buildFixtureWorkbook()`, parse, assert: respondentCount 14; q for `Email`/`Name`/`ID` = meta; satisfaction q type rating scale 1–5; agreement q rating with labels and numeric normalised rows; 0–10 q rating min 0 max 10; resources = multiChoice with options incl. `Library`; campus = choice; open text = text; title from filename `Staff_Survey_2026.xlsx` → `Staff Survey 2026`; empty workbook → ParseError.
- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/parser`).
- [ ] **Step 3: Implement** `types.ts`, `fixtures/build.ts` (use `XLSX.utils.aoa_to_sheet` + `XLSX.write(wb,{type:'array'})`), `formsParser.ts` per rules above.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat: forms xlsx parser with question-type detection`

---

### Task 3: PII quarantine + text scrubbing

**Files:**
- Create: `src/pii/quarantine.ts`, `src/pii/scrub.ts`, `src/pii/pii.test.ts`

**Interfaces:**
- Consumes: `SurveyModel` from Task 2.
- Produces:
```ts
export function applyQuarantine(model: SurveyModel): SurveyModel; // returns copy, sets quarantined+reason
export function scrubText(text: string): string;
export function makeScrubber(model: SurveyModel): (text: string) => string; // scrubText + exact-word removal of values found in quarantined name/email columns (tokens ≥3 chars, case-insensitive) → '[name]'
```

**Column rules (quarantine, with reason)** — hardened after adversarial review; `src/pii/pii.test.ts` (70+ tests) is the full behavioural contract: header rules for email / name (incl. surname, nickname, signature, initials, parent/carer/guardian/emergency-contact, "who is your…") / phone / identifier (incl. student code, roll number, payroll, id-number variants, date of birth) / metadata; headers normalised (lowercase, trailing punctuation stripped), person-words word-boundary matched. Value scans on ALL cells via `String(v).trim()`: >30% email/phone shapes; ≥60% person-NAME-shape with ≥50% distinct ratio; ≥60% ID-shape (`[A-Za-z]{0,3}-?\d{4,}`) with ≥80% distinct ratio → `looks-personal`. Guards: repeated small choice sets and sentence-like answers never quarantined.

**scrubText / makeScrubber:** unicode-aware passes in order: emails → obfuscated emails → IDs (`[id]`) → phones → street addresses (`[address]`) → honorific names (`[name]`; wide title list incl. Principal/Coach/Mx, lowercase titles with stopword guard, particles, accents). `makeScrubber(model)` additionally erases tokens and full phrases from quarantined name/email/identifier/looks-personal column values (email local-part only; ≥3-char tokens uppercase-initial-matched, 2-char tokens case-sensitive). Accepted residual risks are listed in a comment atop `src/pii/scrub.ts` — Task 6 privacy statement and Task 8 methodology note must describe scrubbing as best-effort and point to manual column exclusion.

- [ ] **Step 1: Failing tests** — fixture model: Email/Name/ID quarantined with reasons; campus/role NOT quarantined; scrubText on the planted comment removes email, phone, `Mr Chen`; plain comment unchanged.
- [ ] **Step 2: Run — FAIL.** 
- [ ] **Step 3: Implement.** 
- [ ] **Step 4: Run — PASS.** 
- [ ] **Step 5: Commit** — `feat: pii quarantine and comment scrubbing`

---

### Task 4: Stats engine

**Files:**
- Create: `src/stats/engine.ts`, `src/stats/sentiment.ts`, `src/stats/engine.test.ts`

**Interfaces:**
- Consumes: quarantined `SurveyModel`.
- Produces:
```ts
export interface ChoiceStats { kind:'choice'; answered:number; counts:{option:string;count:number;pct:number}[] }
export interface RatingStats { kind:'rating'; answered:number; mean:number; median:number;
  distribution:{value:number;label?:string;count:number;pct:number}[];
  favourablePct:number; neutralPct:number; unfavourablePct:number }
export interface NumericStats { kind:'numeric'; answered:number; mean:number; median:number; min:number; max:number }
export interface TextStats { kind:'text'; answered:number; comments:string[]; // SCRUBBED via makeScrubber(model)
  themes:{term:string;count:number}[]; sentiment:{pos:number;neg:number;neu:number} }
export type QuestionStats = { questionId:string; title:string } & (ChoiceStats|RatingStats|NumericStats|TextStats);
export interface StatsDigest {
  respondentCount:number; completionRate:number;      // mean answered/respondentCount over analysable questions, 0..1
  questions:QuestionStats[];                          // analysable (non-meta, non-quarantined) only
  overallFavourablePct:number|null;                   // mean of rating favourablePct, null if no ratings
  commentCount:number;
}
export function computeStats(model: SurveyModel): StatsDigest;
export interface SegmentGroup { value:string; n:number; ratingMeans:Record<string,number>; choicePcts:Record<string,Record<string,number>> }
export function segmentStats(model: SurveyModel, segmentQuestionId: string): SegmentGroup[];
```
**Favourable rule (document in code comment + UI later):** span=max−min; fav: v ≥ min+0.7·span; unfav: v ≤ min+0.3·span; else neutral. (1–5 → 4,5 fav / 1,2 unfav; 0–10 → 7–10 fav / 0–3 unfav.) Pcts of answered, rounded 1dp. multiChoice counts each token; pct = count/answered. Themes: lowercase, strip punctuation, stopword list (~50 common words incl. survey words `survey,really,would,could`), count unigrams+bigrams, top 8 with count ≥ 2. `sentiment.ts`: lexicons POS (~40: good, great, love, excellent, helpful, supportive, happy, clear, easy, improved…) NEG (~40: bad, poor, hate, slow, confusing, stressful, unhappy, difficult, lack, never, broken…); per comment: pos>neg → pos, etc.; return counts.

- [ ] **Step 1: Failing tests** — hand-computed expectations from the 14-row fixture (compute by hand while writing the test, e.g. satisfaction mean/median/favourablePct exact values; campus counts; multiChoice pcts; comment sentiment counts; planted email absent from `comments`).
- [ ] **Step 2: FAIL.** 
- [ ] **Step 3: Implement.** 
- [ ] **Step 4: PASS.** 
- [ ] **Step 5: Commit** — `feat: local stats engine with segments, themes, sentiment fallback`

---

### Task 5: RAG ratings + rule-based fallback audit

**Files:**
- Create: `src/ratings/rag.ts`, `src/ai/auditTypes.ts`, `src/ai/fallback.ts`, `src/ratings/rag.test.ts`, `src/ai/fallback.test.ts`

**Interfaces:**
- Consumes: `StatsDigest`.
- Produces:
```ts
// rag.ts
export type Rag = 'green'|'amber'|'red';
export function ragFromFavourable(pct:number): Rag;         // ≥75 green, ≥50 amber, else red
export function ragFromSentiment(s:{pos:number;neg:number}): Rag; // ratio pos/(pos+neg): ≥.66 g, ≥.4 a, else r; no signal → amber
export function questionRag(q:QuestionStats): Rag|null;     // rating→favourable, text→sentiment, choice/numeric→null
export function overallRag(d:StatsDigest): Rag;
// auditTypes.ts
export interface Finding { text:string; evidenceQuestionIds:string[] }
export interface AuditSection { title:string; questionIds:string[]; rag:Rag; ragSource:'rules'|'ai-adjusted'; ragJustification:string; findings:Finding[] }
export interface AuditReport {
  executiveSummary:string; overall:Rag; sections:AuditSection[];
  themes:{theme:string;weight:'many'|'some'|'few';sampleQuotes:string[]}[];
  recommendations:string[]; source:'ai'|'rules'; model?:string;
}
// fallback.ts
export function buildFallbackAudit(d:StatsDigest): AuditReport;
```
**Fallback content rules:** one section per question (title = question title, ragSource `'rules'`, justification names the favourable % or sentiment balance). Findings: rating → `X% answered favourably (mean M of range)`; lowest + highest favourable questions flagged in exec summary bullets; choice → top option sentence; text → top theme sentence. Themes from `TextStats.themes` mapped count≥5→many, ≥3→some, else few, quotes = first 2 scrubbed comments containing term. Recommendations: for each red/amber section, `Look closer at "<title>" — <justification>`. Exec summary = 3–4 plain-English bullets joined as sentences (respondents, overall favourable, best area, weakest area).

- [ ] **Step 1: Failing tests** — rag thresholds boundary values (75, 74.9, 50, 49.9); overallRag on fixture digest; fallback audit: has ≥1 section per analysable question, exec summary non-empty, every finding's evidenceQuestionIds exist in digest, red/amber sections produce recommendations.
- [ ] **Step 2: FAIL.** → **Step 3: Implement.** → **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat: rag rules and rule-based fallback audit`

---

### Task 6: Store + Landing screen (upload, settings, quarantine panel)

**Files:**
- Create: `src/store/appStore.ts`, `src/ui/Landing.tsx`, `src/ui/SettingsDrawer.tsx`, `src/ui/QuarantinePanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `parseWorkbook`, `applyQuarantine`, `computeStats`, `buildFallbackAudit`, `sampleModel`.
- Produces (zustand store — later tasks rely on these exact names):
```ts
interface AppState {
  phase:'landing'|'analysing'|'report';
  model:SurveyModel|null; digest:StatsDigest|null; audit:AuditReport|null;
  context:string; setContext(s:string):void;
  apiKey:string; setApiKey(k:string):void;        // persists localStorage 'wsa2:key'; '' = none
  aiModel:string; setAiModel(m:string):void;      // default 'gpt-4o-mini', persisted 'wsa2:model'
  aiStatus:'idle'|'running'|'done'|'error'; aiError:string|null;
  loadFile(f:File):Promise<void>;                 // parse→quarantine→stats→fallback audit→phase 'report'; sets friendly error on ParseError
  loadSample():void;
  reset():void;
  error:string|null;
}
export const useApp = create<AppState>(...);
```
**Landing:** modern hero (purple headline block per brand type-roles: gold display headline on white "Understand any survey in minutes.", purple standfirst, neutral body), big drag-drop zone (purple dashed border, gold hover glow; also `<input type=file accept=".xlsx,.xls">` + label button), context text input ("What is this survey about? (optional)"), "Try with sample data" secondary button, plain-English privacy strip ("Your file is read on this computer only. It is never uploaded…"), settings gear → **SettingsDrawer**: masked key input (`type=password`, show/hide toggle), model dropdown (`gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini`, custom text option), "Forget key" button, note "Your key stays in this browser only." **QuarantinePanel** (rendered on report screens, collapsible): list quarantined column names + plain reason, e.g. `Email — looks like personal contact details`; manual exclude: multiselect of remaining columns → on change re-runs quarantine(manual)+stats+fallback audit. Columns quarantined by value-shape scans (`looks-personal`) are additionally RESTORABLE: shown with "auto-detected — restore this column?" toggle; restoring re-includes the column (re-runs stats/audit). Hard header/email/phone rule quarantines are not restorable from the UI.

- [ ] **Step 1: Implement store** (pipeline wired to Tasks 2–5 functions; xlsx File → `await f.arrayBuffer()`).
- [ ] **Step 2: Implement Landing + drawer + panel with styles** (new `src/styles/` or co-located CSS; use tokens; focus states; keyboard: dropzone is a `<button>`).
- [ ] **Step 3: Wire App.tsx** — `phase==='landing' ? <Landing/> : <Report/>` (temporary `<Report/>` = respondent count + JSON summary `<pre>` placeholder view for smoke-testing this task only; replaced in Task 7/8).
- [ ] **Step 4: Verify live** — `npm run dev`; drop a fixture file (write `scripts/make-fixture.mjs` that saves `buildFixtureWorkbook()` bytes to `scratch/fixture.xlsx` OUTSIDE repo or in gitignored path; run `node scripts/make-fixture.mjs`); confirm parse→report phase, quarantine list correct, key persists across reload, sample button works. Use browser (chrome-devtools MCP or Playwright) to screenshot.
- [ ] **Step 5: Commit** — `feat: app store, landing, settings, quarantine panel`

---

### Task 7: Charts + Explore tab

**Files:**
- Create: `src/ui/charts/ChartCanvas.tsx`, `src/ui/charts/chartConfig.ts`, `src/ui/ExploreTab.tsx`, `src/ui/KpiTiles.tsx`, `src/ui/CommentBrowser.tsx`
- Modify: `src/App.tsx` (real Report shell: tab nav Audit/Explore/Ask + QuarantinePanel + Export button placeholder)

**Interfaces:**
- Consumes: `StatsDigest`, `segmentStats`.
- Produces:
```ts
// ChartCanvas.tsx
export function ChartCanvas(props:{ id:string; config:ChartConfiguration; ariaLabel:string;
  tableFallback:{head:string[];rows:(string|number)[][]} }): JSX.Element;
export function getChartImage(id:string):string|null;   // canvas.toDataURL('image/png') via chart registry — exporter uses this
// chartConfig.ts
export function choiceChart(s:ChoiceStats&{title:string}):ChartConfiguration;      // horizontal bars, purple fills
export function ratingChart(s:RatingStats&{title:string}):ChartConfiguration;      // distribution bars + fav/neu/unfav colouring (green/neutral/red inks)
export function segmentChart(groups:SegmentGroup[], questionId:string, title:string):ChartConfiguration; // grouped bars per segment
```
Chart craft (read `dataviz` skill in executing session before writing chartConfig): axis labels, no legends when single series, tooltips on, brand-consistent categorical colours (purple, gold, then blue/green harmonies), RAG semantics only where meaning = state. Each chart renders `<figure>` with visually-hidden `<table>` fallback. Register all charts in a module map so `getChartImage` works.

**ExploreTab:** `KpiTiles` (Responses, Completion %, Overall favourable %, Comments count — animated count-up, disabled under reduced-motion); segment `<select>` listing choice-type questions ("Compare by…"); grid of per-question chart cards (choice/rating/numeric); numeric rendered as rating-style distribution (bin into ≤10 integer bins); text questions listed in **CommentBrowser**: theme chips (pastel tints + AA inks) → click filters scrubbed comments list; sentiment mini-bar.

- [ ] **Step 1: Implement chartConfig + ChartCanvas** (unit-test `choiceChart`/`ratingChart` return expected labels/data arrays: `src/ui/charts/chartConfig.test.ts`).
- [ ] **Step 2: Implement Explore tab UI + tab shell in App.**
- [ ] **Step 3: Verify live** — dev server + sample data: all fixture questions charted correctly, segment compare by campus works, comment themes clickable, keyboard-navigable tabs (roving tabindex or native buttons + `aria-selected`).
- [ ] **Step 4: Run all tests.** → **Step 5: Commit** — `feat: explore dashboard with brand charts, segments, comment browser`

---

### Task 8: Audit tab (renders AuditReport)

**Files:**
- Create: `src/ui/AuditTab.tsx`, `src/ui/RagBadge.tsx`, `src/ui/FindingRow.tsx`, `src/ui/print.css`

**Interfaces:**
- Consumes: `AuditReport`, `StatsDigest`, chart components (evidence charts), `useApp`.
- Produces: `<AuditTab/>` fully rendering fallback audit now, AI audit later with zero changes (same `AuditReport` type).

**Layout (audit-document feel, exciting-modern execution):** cover block (editable title `contentEditable=false` + pencil → input; date; respondent count; completion %; big overall RagBadge); "Executive summary" (gold heading per type-roles, body text); numbered sections as cards: RagBadge + `ragJustification` tooltip/`title` + rating-source tag when `ai-adjusted`; findings numbered `1.1, 1.2…` — each `FindingRow` a native `<details>`: summary = finding text, open = evidence (chart(s) for `evidenceQuestionIds` + related scrubbed comments if text question); "Recommendations" numbered list; "Methodology & privacy" footnote (quarantined columns, favourable rule text, RAG thresholds, AI model used or "no AI used"). `print.css` (`@media print`): hide nav/Explore/Ask/controls, expand all details, page-break rules between sections, black-on-white.

- [ ] **Step 1: Implement components.** 
- [ ] **Step 2: Verify live** — sample data: audit reads like a report, findings expand showing correct evidence chart, print preview clean.
- [ ] **Step 3: Tests still green.** → **Step 4: Commit** — `feat: audit tab with rag sections, evidence drill-down, print styles`

---

### Task 9: AI layer (OpenAI client, prompts, validation) + wiring

**Files:**
- Create: `src/ai/client.ts`, `src/ai/prompts.ts`, `src/ai/validate.ts`, `src/ai/runAudit.ts`, `src/ai/ai.test.ts`
- Modify: `src/store/appStore.ts` (call `runAudit` after stats when key present)

**Interfaces:**
- Consumes: `StatsDigest`, `AuditReport` types, rag rules.
- Produces:
```ts
// client.ts
export class AiError extends Error { constructor(public kind:'auth'|'rate'|'network'|'bad-response', msg:string){super(msg)} }
export async function chatJSON(opts:{key:string;model:string;system:string;user:string;maxTokens?:number}):Promise<unknown>; // response_format json_object; throws AiError (401→auth, 429→rate)
export async function chatText(opts:{key:string;model:string;system:string;messages:{role:'user'|'assistant';content:string}[]}):Promise<string>;
// prompts.ts
export function digestForAi(d:StatsDigest, context:string):string; // compact JSON: per-question stats, NO raw rows, comments already scrubbed, cap comments at 60 (state cap in prompt)
export function auditSystemPrompt():string;  // role: school survey auditor; MUST: use only supplied numbers, reference questionIds, rag may differ max 1 step from suppliedRuleRag, plain English AU spelling, JSON shape spec
export function auditUserPrompt(digestJson:string):string;
export function chatSystemPrompt(digestJson:string):string; // ground rules: answer ONLY from digest; if unanswerable say so; numbers verbatim
// validate.ts
export function validateAudit(raw:unknown, d:StatsDigest, ruleRags:Record<string,Rag>):AuditReport; // throws AiError('bad-response'); clamps rag >1 step to rule rag + marks ragSource; drops findings referencing unknown questionIds; source:'ai'
// runAudit.ts
export async function runAiAudit(d:StatsDigest, context:string, key:string, model:string):Promise<AuditReport>;
```
Store wiring: after fallback audit set, if `apiKey` non-empty → `aiStatus:'running'`, call `runAiAudit`; success → replace `audit`, `aiStatus:'done'`; AiError → keep fallback, `aiStatus:'error'`, `aiError` plain-English per kind ("That API key wasn't accepted…", "OpenAI is busy…", etc.). UI: status pill in report header ("AI audit ready" / "Writing AI audit…" spinner / error note + retry button).

- [ ] **Step 1: Failing tests** — mock `fetch` (vi.stubGlobal): 401→AiError auth; valid JSON → parsed; `digestForAi` output contains NO quarantined titles and comments are scrubbed fixture ones capped at 60; `validateAudit`: good payload passes, rag 2 steps off → clamped + `ai-adjusted`, findings with bogus questionId dropped, garbage → bad-response.
- [ ] **Step 2: FAIL.** → **Step 3: Implement + wire store.** → **Step 4: PASS.**
- [ ] **Step 5: Live check with fake key** — expect graceful auth error + fallback intact.
- [ ] **Step 6: Commit** — `feat: openai audit generation with validation and graceful fallback`

---

### Task 10: Ask tab (chat)

**Files:**
- Create: `src/ui/AskTab.tsx`
- Modify: `src/store/appStore.ts` (chat state)

**Interfaces:**
- Consumes: `chatText`, `chatSystemPrompt`, `digestForAi`.
- Produces store additions: `chat:{role:'user'|'assistant';content:string}[]`, `ask(q:string):Promise<void>`, `chatBusy:boolean`.

**UI:** no key → friendly locked state ("Add your OpenAI key in settings to ask questions."). With key: message list (user purple bubble right, assistant neutral card left), 3 suggested starter chips ("What stood out most?", "Which group was least positive?", "Top 3 things to fix?"), input + send (Enter submits, Shift+Enter newline), busy indicator, persistent note "AI answers can be wrong. Audit and Explore numbers are the source of truth." History NOT persisted; capped at last 12 messages sent to API.

- [ ] **Step 1: Implement.** → **Step 2: Live check (fake key → clean error; mock check via tests optional).** → **Step 3: Commit** — `feat: ask-the-data chat grounded in stats digest`

---

### Task 11: Export (self-contained HTML + download)

**Files:**
- Create: `src/exporter/exportHtml.ts`, `src/exporter/exportHtml.test.ts`, `src/ui/ExportButton.tsx`
- Modify: report header (real Export button)

**Interfaces:**
- Consumes: `AuditReport`, `StatsDigest`, `getChartImage`.
- Produces:
```ts
export function buildExportHtml(opts:{ audit:AuditReport; digest:StatsDigest; title:string;
  chartImages:Record<string,string>; generatedOn:string }):string;
export function downloadExport(html:string, fileName:string):void; // Blob + a[download]
```
Single HTML string: inline `<style>` (tokens + report styles duplicated into exporter template — keep template literal in exportHtml.ts), Audit content with `<details>` findings (charts as `<img>` dataURLs), Explore chart gallery section, methodology footer, `<script>`-free. MUST NOT contain: `apiKey`, raw rows, quarantined column data. Filename `survey-audit-<slug(title)>-<yyyy-mm-dd>.html`.

- [ ] **Step 1: Failing tests** — output contains exec summary text, a `<details>` per finding, embedded `data:image/png` when provided; output does NOT contain a planted fake key string passed via a booby-trapped digest clone, nor quarantined column titles; no `<script`.
- [ ] **Step 2: FAIL.** → **Step 3: Implement.** → **Step 4: PASS.**
- [ ] **Step 5: Live check** — export sample report, open file from disk in fresh browser: styled, clickable, offline.
- [ ] **Step 6: Commit** — `feat: self-contained html report export`

---

### Task 12: Design polish pass ("Wesley but exciting and modern")

**Files:** Modify UI/CSS across `src/ui/`, `src/styles/`.

Invoke `impeccable` skill (and `dataviz` for chart refinement) in the executing session. Scope: hero moment on landing (bold gold/purple display type, subtle animated gradient or pattern in brand hues), staggered card reveal on report build (respect reduced-motion), micro-interactions (hover lift on cards, RAG badge pop-in, count-up KPIs), consistent spacing rhythm, empty/error states with personality, mobile responsive (≥360px), favicon (purple W tile). Hard rules: purple only interactive colour; no centred/underlined headings; AA contrast verified for every new pairing.

- [ ] **Step 1: Run impeccable-guided pass with live browser iteration.**
- [ ] **Step 2: Verify** — reduced-motion honoured (emulate via devtools), keyboard walkthrough, contrast spot-check, screenshots desktop + 375px.
- [ ] **Step 3: Tests green.** → **Step 4: Commit** — `feat: brand polish, motion, responsive refinement`

---

### Task 13: GitHub repo + Pages deploy (GATED on Nathan's OK)

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`
- Modify: `vite.config.ts` (`base: '/<repo-name>/'`)

- [ ] **Step 1: README** — plain-English: what it is, how to use, privacy promises (mirror spec §6/§9/§13), "built by DLP Team".
- [ ] **Step 2: deploy.yml** — on push to main: checkout, setup-node 24, `npm ci`, `npm run build`, `actions/upload-pages-artifact` + `actions/deploy-pages` (Pages via Actions source).
- [ ] **Step 3: PAUSE — ask Nathan in plain English for OK to create public repo `survey-analyser-2` on his GitHub and push.** Confirm repo name with him.
- [ ] **Step 4 (after OK):** `gh repo create --public --source . --push`; enable Pages (Actions) via `gh api`; set `base` to repo name; verify workflow green + live URL loads; sanity: `git ls-files` shows NO xlsx/csv/font/key files.
- [ ] **Step 5: Commit/push** — `chore: github pages deployment`

---

### Task 14: E2E + accessibility + final verification

**Files:**
- Create: `playwright.config.ts`, `e2e/report.spec.ts`, `e2e/a11y.spec.ts`
- Modify: `package.json` (scripts `e2e`)

- [ ] **Step 1:** `npm i -D @playwright/test @axe-core/playwright && npx playwright install chromium`
- [ ] **Step 2: report.spec.ts** — load dev server, click "Try with sample data", assert: report renders, respondent count visible, tab to Explore (charts present), findings `<details>` opens evidence, Export downloads file, downloaded file contains exec summary text and no `wsa2:key`.
- [ ] **Step 3: a11y.spec.ts** — axe scan (WCAG 2.2 AA tags) on landing + audit + explore; zero violations (document any rule exemption with reason if truly false-positive).
- [ ] **Step 4: Run all** — `npx vitest run && npx playwright test`, all green.
- [ ] **Step 5: Dispatch `verifier` agent** — independent check of success criteria spec §15 (1–6); fix anything it finds.
- [ ] **Step 6: Commit + push (push already authorised in Task 13).**
- [ ] **Step 7: Ask Nathan to do the live test:** open Pages URL, drop a REAL Forms export, add his real key, confirm AI audit + chat + export. (His key never touches the repo or CI.)
