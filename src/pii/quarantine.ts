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

// "id number" must only match at a word boundary, or "Did numbers help
// you?" would misfire ("[d]id number[s]" contains the raw substring).
// No trailing \b so the plural "ID Numbers" still matches.
const ID_NUMBER_REGEX = /\bid number/;

function normaliseHeader(title: string): string {
  // Trailing punctuation/whitespace is stripped so "Student ID:" still ends
  // with " id". Unicode-aware ([^\p{L}\p{N}]) so only non-letter/non-digit
  // characters are eaten - a trailing accented letter is never clipped into
  // an accidental rule match.
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .trim();
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
    ID_NUMBER_REGEX.test(h) ||
    h.includes('student number') ||
    h.includes('staff number') ||
    h.includes('employee number') ||
    h.includes('contact number') ||
    h.includes('username') ||
    h.includes('ip address')
  ) {
    return 'identifier';
  }
  if (type === 'meta') return 'metadata';

  return null;
}

// Runs only on columns the header rules didn't already quarantine (see the
// `??` short-circuit in applyQuarantine below). EVERY non-empty cell is
// scanned, coerced to a trimmed string first - a Forms "Number" question
// full of phone numbers arrives as JS numbers, not strings, and skipping
// numeric cells would leave a whole column of phone numbers unquarantined.
// (Short numbers like rating answers can't false-positive: the phone regex
// needs an 8+ character digit run.)
function classifyByValues(rows: SurveyModel['rows'], colIndex: number): string | null {
  const nonEmpty = rows
    .map((row) => row[colIndex])
    .filter((value) => value !== null)
    .map((value) => String(value).trim())
    .filter((value) => value !== '');

  if (nonEmpty.length === 0) return null; // nothing to scan; avoids a 0/0 divide

  const personalCount = nonEmpty.filter(
    (value) => VALUE_EMAIL_REGEX.test(value) || VALUE_PHONE_REGEX.test(value),
  ).length;

  return personalCount / nonEmpty.length > VALUE_SCAN_THRESHOLD ? 'looks-personal' : null;
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
