// Decides which survey columns are personal information and must be
// excluded from all analysis, charts, AI prompts and exports. Column rules
// run in a fixed order per column (header rules first, then value-shape
// scans on whatever's left) - the first rule that matches wins, and that
// match becomes the column's quarantineReason.
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

// "dob" as a whole word only - unicode lookarounds so it never fires on a
// header that merely embeds the letters d-o-b inside a longer word.
const DOB_WORD_REGEX = /(?<![\p{L}\p{N}])dob(?![\p{L}\p{N}])/u;

// --- value-shape scan patterns (fix2 B) ----------------------------------
// Person-name shape: 1-4 words, each starting with an uppercase letter,
// with an optional trailing ", Year N". Total length capped at 40 so a long
// sentence that happens to start capitalised can't sneak through.
const NAME_SHAPE_REGEX =
  /^(?:\p{Lu}[\p{L}'’.-]*)(?:\s+\p{Lu}[\p{L}'’.-]*){0,3}(?:,\s*Year\s*\d{1,2})?$/u;
const NAME_SHAPE_MAX_LEN = 40;
const NAME_SHAPE_MATCH_RATIO = 0.6;
const NAME_SHAPE_DISTINCT_RATIO = 0.5;

// ID shape: up to 3 letters, an optional separator, then 4+ digits. Catches
// S12345, s1234567, WES-04821, and bare 6-7 digit numeric ID columns.
const ID_SHAPE_REGEX = /^[A-Za-z]{0,3}[-\s]?\d{4,}$/;
const ID_SHAPE_MATCH_RATIO = 0.6;
const ID_SHAPE_DISTINCT_RATIO = 0.8;

// Both shape scans need a floor of real answers so a 1-2 row synthetic
// column can never trip them on a coincidence.
const VALUE_SHAPE_MIN_NONEMPTY = 3;

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

// Exact-term name headers (fix2 A1) - matched against the whole normalised
// header, never as a substring.
const NAME_EXACT_TERMS = new Set(['name', 'surname', 'nickname', 'signature', 'initials']);

function isEmailHeader(h: string): boolean {
  return h.includes('email') || h.includes('e-mail');
}

function isNameHeader(h: string): boolean {
  return h === 'name' || h.endsWith(' name') || NAME_EXACT_TERMS.has(h);
}

// High-confidence "someone else's name" headers (fix2 A4). Reason 'name'.
function isNameContextHeader(h: string): boolean {
  return (
    h.includes('emergency contact') ||
    h.includes('parent') ||
    h.includes('carer') ||
    h.includes('guardian') ||
    h.startsWith('who is your') ||
    h.startsWith('who should we')
  );
}

function isPhoneHeader(h: string): boolean {
  return h.includes('phone') || h.includes('mobile');
}

// Date-of-birth headers (fix2 A3). Reason 'identifier'.
function isDobHeader(h: string): boolean {
  return h.includes('date of birth') || h.includes('birthday') || DOB_WORD_REGEX.test(h);
}

// NOTE on the identifier rule's "id" check: it must match the WHOLE header
// (trimmed) or its last word (a " id" suffix) - never a bare substring -
// otherwise ordinary questions like "Have you considered...?" would
// misfire, since "considered" contains the letters "id".
function isIdentifierHeader(h: string): boolean {
  return (
    h === 'id' ||
    h.endsWith(' id') ||
    ID_NUMBER_REGEX.test(h) ||
    h.includes('student number') ||
    h.includes('staff number') ||
    h.includes('employee number') ||
    h.includes('contact number') ||
    h.includes('student code') ||
    h.includes('staff code') ||
    h.includes('roll number') ||
    h.includes('payroll') ||
    h.includes('admission number') ||
    h.includes('reference number') ||
    h.includes('username') ||
    h.includes('ip address')
  );
}

// Header-based rules, checked in the brief's exact order; the first match
// wins. dob sits after phone and before identifier per fix2 A3.
function classifyHeader(title: string, type: QType): string | null {
  const h = normaliseHeader(title);

  if (isEmailHeader(h)) return 'email';
  if (isNameHeader(h)) return 'name';
  if (isNameContextHeader(h)) return 'name';
  if (isPhoneHeader(h)) return 'phone';
  if (isDobHeader(h)) return 'identifier';
  if (isIdentifierHeader(h)) return 'identifier';
  if (type === 'meta') return 'metadata';

  return null;
}

// Exposed so scrub.ts can decide whether a 'metadata'-reason column is
// really a Forms-style Name/Email column whose values must be scrubbed from
// free text (fix2 D1). Returns the header category or null.
export function headerCategory(title: string): 'name' | 'email' | null {
  const h = normaliseHeader(title);
  if (isEmailHeader(h)) return 'email';
  if (isNameHeader(h) || isNameContextHeader(h)) return 'name';
  return null;
}

function isNameShape(value: string): boolean {
  return value.length <= NAME_SHAPE_MAX_LEN && NAME_SHAPE_REGEX.test(value);
}

// Runs only on columns the header rules didn't already quarantine (see the
// `??` short-circuit in applyQuarantine below). EVERY non-empty cell is
// scanned, coerced to a trimmed string first - a Forms "Number" question
// full of phone numbers arrives as JS numbers, not strings, and skipping
// numeric cells would leave a whole column of phone numbers unquarantined.
function classifyByValues(rows: SurveyModel['rows'], colIndex: number): string | null {
  const nonEmpty = rows
    .map((row) => row[colIndex])
    .filter((value) => value !== null)
    .map((value) => String(value).trim())
    .filter((value) => value !== '');

  if (nonEmpty.length === 0) return null; // nothing to scan; avoids a 0/0 divide

  // Existing email/phone scan.
  const personalCount = nonEmpty.filter(
    (value) => VALUE_EMAIL_REGEX.test(value) || VALUE_PHONE_REGEX.test(value),
  ).length;
  if (personalCount / nonEmpty.length > VALUE_SCAN_THRESHOLD) return 'looks-personal';

  // Shape scans need enough rows AND enough distinct answers - a small
  // repeated choice set (campuses, roles, Likert labels, years) fails the
  // distinct-ratio guard even when the values look name- or id-shaped.
  if (nonEmpty.length >= VALUE_SHAPE_MIN_NONEMPTY) {
    const distinctRatio = new Set(nonEmpty).size / nonEmpty.length;

    // B1 - name shape.
    const nameCount = nonEmpty.filter(isNameShape).length;
    if (nameCount / nonEmpty.length >= NAME_SHAPE_MATCH_RATIO && distinctRatio >= NAME_SHAPE_DISTINCT_RATIO) {
      return 'looks-personal';
    }

    // B2 - id shape.
    const idCount = nonEmpty.filter((value) => ID_SHAPE_REGEX.test(value)).length;
    if (idCount / nonEmpty.length >= ID_SHAPE_MATCH_RATIO && distinctRatio >= ID_SHAPE_DISTINCT_RATIO) {
      return 'looks-personal';
    }
  }

  return null;
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
