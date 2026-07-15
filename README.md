# Wesley Survey Analyser

Turn a Microsoft Forms survey export into a plain-English, audit-style report,
right in your browser. Built by the DLP Team, Wesley College.

Use it here: https://wesdlpteam.github.io/survey-analyser-2/

## What it does

1. You drop in the `.xlsx` file that Microsoft Forms exports for a survey.
2. The app reads it, works out what each question is (choice, rating, number,
   written comment, etc.), and builds a report with three tabs:
   - **Audit** — a formal report: overview, findings, ratings, recommendations.
   - **Explore** — charts and tiles you can click and filter.
   - **Ask** — a chat box where you can ask questions about the results.
3. You can download the whole report as a single HTML file to share or print.

No sign-up, no install, no server. You open a web page and drop in a file.

## Your data never leaves your computer

This is the most important thing to know about this tool:

- The spreadsheet you upload is read and processed entirely inside your own
  browser. It is never uploaded anywhere, never stored anywhere, and the
  people who built this app never see it.
- **The one exception:** if you choose to add your own OpenAI API key (in
  Settings), the app will send a small, anonymised summary of the numbers
  (things like "72% rated this 4 or 5 out of 5") to OpenAI, so it can write
  the report's narrative sections and answer your questions in the Ask tab.
  It never sends raw answers, individual responses, or names.
- **No API key? No problem.** The app still works fully offline, using
  built-in rules to write a plain, straightforward version of the report
  instead of an AI-written one.
- Your API key is stored only in your own browser (in what's called
  "localStorage"), never sent anywhere except directly to OpenAI, and never
  saved in this app's files or code.

## How it protects people's privacy

Before any analysis happens, the app automatically looks for and sets aside
columns that could identify a person, such as names, email addresses, phone
numbers, and ID numbers (Microsoft Forms often includes these automatically).
Those columns are:

- Left out of every chart, statistic, AI request, and exported report.
- Shown in a "what we excluded and why" panel, so you can check the app's
  work. Only the column *names* are shown there, never anyone's actual answers.

Written comments (free-text answers) are also scanned and have anything that
looks like a name, email, or phone number replaced with a placeholder like
`[name]` before they're ever sent to the AI.

**Please note:** this scrubbing is done automatically and carefully, but it
is a best-effort safety net, not a 100% guarantee. If you know a survey
contains sensitive comments, please check the report yourself before sharing
it further, and you can always manually exclude a column in Settings if the
app misses something.

## How to use it

1. Open the app in a web browser (link above).
2. Drag your Microsoft Forms `.xlsx` export onto the page, or click to choose
   the file. (No file handy? Click "Try with sample data" to see a demo.)
3. Optionally type one line describing the survey (who it was for, when).
4. Read the report across the Audit, Explore, and Ask tabs.
5. Optionally add your own OpenAI API key in Settings for AI-written
   narrative and chat.
6. Click "Export report" to download a single HTML file you can email, print,
   or save, containing the full report with charts, but never your API key
   and never the excluded/personal columns.

## What file does it need?

A `.xlsx` file exported from Microsoft Forms (the "Open in Excel" or
"Export results" option on a Forms results page). Row 1 should be the
question titles, and each following row is one person's answers.

---

## For the technically curious

A client-side-only React + TypeScript + Vite app. No backend, no database,
no accounts. Charting via Chart.js, spreadsheet parsing via SheetJS. Hosted
as a static site on GitHub Pages.

### Local development

```bash
npm install
npm run dev      # start local dev server
npm run build    # type-check + production build
npm run test     # run tests (vitest)
```

### Hosting

The `main` branch auto-deploys to GitHub Pages via GitHub Actions on every
push (see `.github/workflows/deploy.yml`). No server-side code runs anywhere;
Pages just serves the static build output.

### Architecture

- `src/parser/` — turns the `.xlsx` file into a typed survey model.
- `src/pii/` — detects and quarantines personally identifying data.
- `src/stats/` — pure, tested statistics calculations (the single source of
  numeric truth; the AI narrates but never invents numbers).
- `src/ratings/` — rule-based Green/Amber/Red rating logic.
- `src/ai/` — OpenAI client, prompt building, and offline fallbacks.
- `src/exporter/` — builds the self-contained downloadable HTML report.
- `src/ui/` — the React components, tabs, charts, and chat.

### Repo hygiene

`.xlsx`, `.xls`, `.csv`, `.env*`, and font binaries are all git-ignored so
real survey data or secrets can never be committed by accident. Test
fixtures use fabricated data only (fake names like "Student A"), never real
survey exports.
