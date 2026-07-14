// Decides which survey columns are personal information and must be
// excluded from all analysis, charts, AI prompts and exports. Column rules
// run in a fixed order per column (header rules first, then a value scan on
// whatever's left) - the first rule that matches wins, and that match
// becomes the column's quarantineReason.
import type { Question, QType, SurveyModel } from '../types';

// Verbatim regexes from the brief. Both are only ever used to test whether a
// single, already-isolated cell value looks like a whole email/phone (see
// classifyByValues below) - a true/false test, not an in-place text
// substitution - so there's no risk of a match "bleeding" into surrounding
// characters the way there would be if these were spliced into a sentence.
// (scrub.ts needs its own, differently-shaped phone regex for exactly that
// reason - see the comment there.)
const VALUE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALUE_PHONE_REGEX = /(\+?\d[\d\s-]{7,})/;

const VALUE_SCAN_THRESHOLD = 0.3;

function normaliseHeader(title: string): string {
  return title.trim().toLowerCase();
}

// Header-based rules, checked in the brief's exact order; the first match
// wins.
//
// NOTE on the identifier rule's "id" check: it must match the WHOLE header
// (trimmed) or its last word (a " id" suffix) - never a bare substring -
// otherwise ordinary questions like "Have you considered...?" would
// misfire, since "considered" contains the letters "id".
function classifyHeader(title: string, type: QType): string | null {
  const h = normaliseHeader(title);

  if (h.includes('email') || h.includes('e-mail')) return 'email';
  if (h === 'name' || h.endsWith(' name')) return 'name';
  if (h.includes('phone') || h.includes('mobile')) return 'phone';
  if (
    h === 'id' ||
    h.endsWith(' id') ||
    h.includes('student number') ||
    h.includes('staff number') ||
    h.includes('username') ||
    h.includes('ip address')
  ) {
    return 'identifier';
  }
  if (type === 'meta') return 'metadata';

  return null;
}

// Runs only on columns the header rules didn't already quarantine (see the
// `??` short-circuit in applyQuarantine below). Only string cell values can
// look like an email/phone - rating/numeric columns hold numbers, never
// strings, by the time they reach here - so non-string cells are simply
// excluded rather than coerced to text.
function classifyByValues(rows: SurveyModel['rows'], colIndex: number): string | null {
  const nonEmptyStrings = rows
    .map((row) => row[colIndex])
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '');

  if (nonEmptyStrings.length === 0) return null; // nothing to scan; avoids a 0/0 divide

  const personalCount = nonEmptyStrings.filter(
    (value) => VALUE_EMAIL_REGEX.test(value) || VALUE_PHONE_REGEX.test(value),
  ).length;

  return personalCount / nonEmptyStrings.length > VALUE_SCAN_THRESHOLD ? 'looks-personal' : null;
}

export function applyQuarantine(model: SurveyModel): SurveyModel {
  const questions: Question[] = model.questions.map((question, colIndex) => {
    const reason = classifyHeader(question.title, question.type) ?? classifyByValues(model.rows, colIndex);
    return {
      ...question,
      quarantined: reason !== null,
      quarantineReason: reason ?? undefined,
    };
  });

  return { ...model, questions };
}
