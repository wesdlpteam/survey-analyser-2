// ACCEPTED RESIDUAL RISKS (fix2 E) - deliberately NOT handled here; the
// app's methodology panel + privacy statement describe scrubbing as
// best-effort and must copy this list:
//   - Bare third-party names with no honorific, not in any quarantined
//     column, in sentence context ("Sarah was great") - undetectable
//     without NER; manual column exclude + methodology note cover this.
//   - Class codes embedding teacher surnames ("7B Smith") in
//     non-quarantined choice columns.
//   - A suburb + postcode left over after an [address] redaction.
//   - Fully spelled-out email obfuscations beyond the at/dot shape below.
//   - Restorable-tier quarantine false positives: a >=5-row column of
//     distinct 2-word titles ("The Hunger Games", ...) can still read as a
//     name column, and a distinct EVENT-date column (excursion dates) can
//     read as birth dates via the date-shape scan; the UI's quarantine
//     override exists to restore these.
//   - Identifier tokens of 4 or fewer digits inside comments (the [id]
//     pass needs 5+ digits so years/postcodes survive).
//   - A long phone number typed with no spaces is redacted as [id] rather
//     than [phone] - mislabelled placeholder, still redacted.
//
// Redacts personally-identifiable substrings from free-text survey answers
// before they reach charts, exports or any AI prompt. Column-level PII (see
// quarantine.ts) is handled by excluding the whole column; this handles PII
// that leaks into an otherwise-fine open-text answer (e.g. someone leaves
// their phone number in a comment).
//
// Pass order (fix2 C5): emails -> obfuscated emails -> IDs -> phones ->
// addresses -> honorific names. Emails go first because an email is never a
// phone/id, so scrubbing it out first stops a digit-led local part being
// partly eaten by a later numeric pass.
import { headerCategory } from './quarantine';
import type { SurveyModel } from '../types';

// Finds an email anywhere inside a larger string. The domain's final segment
// is written as `[^\s@]*[^\s@.,;]` (not the simpler `[^\s@]+`) so the match
// can never end on sentence punctuation glued straight onto the address.
const TEXT_EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]*[^\s@.,;]/g;

// Obfuscated email (fix2 C4, tightened fix3 item 6): the final "dot X"
// segment must be TLD-like, so ordinary prose ("we looked at options dot
// points") never matches, and the local part absorbs leading "word dot"
// segments so "john dot smith at gmail dot com" is redacted whole.
const OBFUSCATED_EMAIL_REGEX =
  /(?<!\S)[\w-]+(?:\s+dot\s+[\w-]+)*\s+at\s+[\w-]+(?:\s+dot\s+[\w-]+)*\s+dot\s+(?:com|net|org|edu|gov|au|nz|uk|io|co)(?![\p{L}\p{N}])/giu;

// ID pass (fix2 C2): up to 3 leading letters, optional dash, then 5+ digits
// (5, not 4, so a bare year like 2026 and a 4-digit postcode are left
// alone). Unicode lookarounds keep it off the middle of a longer word.
const TEXT_ID_REGEX = /(?<![\p{L}\p{N}])[A-Za-z]{0,3}-?\d{5,}(?![\p{L}\p{N}])/gu;

// Finds a run of 8+ digits (spaces/dashes allowed inside, "+" allowed at the
// front). Requires the match to both start AND end on a digit so a trailing
// space is never swept in and glued onto the next word.
const TEXT_PHONE_REGEX = /\+?\d[\d\s-]{6,}\d/g;

// Street address (fix2 C3): a street number, one or two capitalised words,
// then a street-type token. Needs the leading number so a bare "St Kilda Rd
// campus" (no house number) is left untouched.
const TEXT_ADDRESS_REGEX =
  /(?<![\p{L}\p{N}])\d{1,4}[A-Za-z]?\s+\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)?\s+(?:St|Street|Rd|Road|Ave|Avenue|Ct|Court|Cres|Crescent|Dr|Drive|Pl|Place|Ln|Lane|Gr|Grove|Pde|Parade|Way|Cl|Close|Tce|Terrace)(?![\p{L}])\.?/gu;

// Honorific titles (fix2 C1). Lowercase forms are accepted too (students
// type lowercase); the stopword guard below stops "miss the bus" etc.
const HONORIFIC_TITLES = [
  'Mr',
  'Mrs',
  'Ms',
  'Miss',
  'Mx',
  'Dr',
  'Prof',
  'Professor',
  'Principal',
  'Coach',
  'Sir',
  'Madam',
  'Fr',
  'Pastor',
  'Rev',
  'Sensei',
];

// If the word after a title is one of these, it is not a name - leave the
// phrase untouched ("miss the bus", "coach the team").
const HONORIFIC_STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'our', 'your', 'his', 'her', 'their', 'this', 'that',
  'was', 'is', 'are', 'be', 'been', 'will', 'would', 'can', 'could', 'who',
  'what', 'when', 'all', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'it', 'he',
  'she', 'they', 'we', 'you', 'me', 'us', 'so', 'if', 'for', 'with', 'said', 'says',
]);

// Titles that are also everyday English words (fix3 item 3): their
// LOWERCASE form only reads as a title when the next word is capitalised
// ("miss Chen" yes, "miss working" no). Unambiguous titles (mr, dr, ...)
// keep the lenient lowercase rule.
const AMBIGUOUS_TITLES = new Set(['miss', 'coach', 'principal', 'sir', 'madam', 'pastor', 'rev']);

// Accept each title in its original, lower, and upper case forms. Longest
// first so "Professor" is tried before "Prof" at the same position.
const TITLE_ALT = [...new Set(HONORIFIC_TITLES.flatMap((t) => [t, t.toLowerCase(), t.toUpperCase()]))]
  .sort((a, b) => b.length - a.length)
  .join('|');

// captured title (group 1)  +  captured first name word (group 2)  +
// optional lowercase particle chain  +  0-2 further capitalised words. The
// particle chain uses a (?=\s) guard so a following hyphenated word
// ("de-escalated") is never partly consumed. The first word class includes
// "." so an initial ("J.") is captured as its own word.
const HONORIFIC_NAME_REGEX = new RegExp(
  `(?<![\\p{L}\\p{N}])(${TITLE_ALT})\\.?\\s+` +
    `([\\p{Lu}\\p{Ll}][\\p{L}'’.-]*)` +
    `(?:\\s+(?:[Vv]an|[Vv]on|[Dd]er|[Dd]e|[Dd]a|[Dd]i|[Ll]a|[Ll]e)(?=\\s))*` +
    `(?:\\s+\\p{Lu}[\\p{L}'’.-]*){0,2}` +
    `(?![\\p{L}\\p{N}])`,
  'gu',
);

function honorificReplacer(match: string, title: string, firstWord: string): string {
  if (HONORIFIC_STOPWORDS.has(firstWord.toLowerCase())) return match;
  // Ambiguous lowercase title + lowercase following word = ordinary prose
  // ("I will miss working with her"), not a person (fix3 item 3).
  if (/^\p{Ll}/u.test(title) && AMBIGUOUS_TITLES.has(title.toLowerCase()) && !STARTS_UPPER.test(firstWord)) {
    return match;
  }
  return '[name]';
}

export function scrubText(text: string): string {
  return text
    .replace(TEXT_EMAIL_REGEX, '[email]')
    .replace(OBFUSCATED_EMAIL_REGEX, '[email]')
    .replace(TEXT_ID_REGEX, '[id]')
    .replace(TEXT_PHONE_REGEX, '[phone]')
    .replace(TEXT_ADDRESS_REGEX, '[address]')
    .replace(HONORIFIC_NAME_REGEX, honorificReplacer);
}

// 1-char tokens (bare initials) are too collision-prone to scrub. 2-char and
// 3+ char tokens are handled with different, stricter rules below.
const TOKEN_MIN_LENGTH = 2;

// Common English words are never collected as single tokens (fix3 item 4) -
// a respondent named "Will"/"My"/"Do" would otherwise corrupt every comment
// containing that word. Multi-word PHRASES still catch the full name
// ("Will Turner"), and rare tokens ("Nguyen", "Anh") are unaffected.
const COMMON_WORDS = new Set([
  'do', 'so', 'my', 'an', 'no', 'if', 'is', 'it', 'at', 'on', 'or', 'to',
  'be', 'by', 'up', 'go', 'he', 'we', 'me', 'us', 'the', 'and', 'was', 'are',
  'but', 'not', 'all', 'one', 'two', 'our', 'out', 'had', 'has', 'her',
  'him', 'his', 'how', 'new', 'now', 'old', 'see', 'way', 'who', 'did',
  'get', 'let', 'say', 'she', 'too', 'use', 'yes', 'that', 'this', 'they',
  'from', 'have', 'more', 'when', 'some', 'time', 'year', 'well', 'than',
  'then', 'them', 'what', 'were', 'been', 'does', 'most', 'much', 'many',
  'also', 'just', 'like', 'over', 'only', 'very', 'with', 'will', 'may',
  'can', 'son', 'sun', 'mark', 'grace',
]);

// Whole-cell filler answers (fix3 item 5): never real names, and their
// words ("none", "prefer", "say") would corrupt ordinary comments.
const FILLER_VALUES = new Set([
  'n/a', 'na', 'none', 'nil', 'prefer not to say', 'not applicable',
  'not sure', 'unsure', 'unknown', 'yes', 'no', 'other', 'nothing', '-',
]);

// Splits a cell value into word tokens: runs of letters/digits, keeping
// apostrophes and hyphens inside a token ("O'Brien-Smith" stays whole) while
// treating email punctuation (".", "@") as separators.
const TOKEN_SPLIT_REGEX = /[^\p{L}\p{N}'’-]+/u;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Strip non-letter/digit edges (stray quotes, parens, trailing hyphens)
// left clinging to a token after the split.
function stripEdges(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
}

const STARTS_UPPER = /^\p{Lu}/u;

interface PiiColumn {
  colIndex: number;
  emailLocalOnly: boolean;
}

// Columns whose values are personal (fix2 D1): name / identifier /
// looks-personal always; email columns local-part-only; plus 'metadata'
// columns that are really Forms Name/Email columns by header.
function collectPiiColumns(model: SurveyModel): PiiColumn[] {
  const columns: PiiColumn[] = [];
  model.questions.forEach((question, colIndex) => {
    const reason = question.quarantineReason;
    if (reason === 'name' || reason === 'identifier' || reason === 'looks-personal') {
      columns.push({ colIndex, emailLocalOnly: false });
    } else if (reason === 'email') {
      columns.push({ colIndex, emailLocalOnly: true });
    } else if (reason === 'metadata') {
      const category = headerCategory(question.title);
      if (category === 'name') columns.push({ colIndex, emailLocalOnly: false });
      else if (category === 'email') columns.push({ colIndex, emailLocalOnly: true });
    }
  });
  return columns;
}

interface CollectedTokens {
  tokens3: Set<string>; // 3+ chars, lowercased key, matched case-insensitively
  tokens2: Set<string>; // exactly 2 chars, uppercase-initial, matched case-sensitively
  phrases: Set<string>; // whitespace-joined multi-word values
}

function collectTokens(model: SurveyModel): CollectedTokens {
  const tokens3 = new Set<string>();
  const tokens2 = new Set<string>();
  const phrases = new Set<string>();

  for (const { colIndex, emailLocalOnly } of collectPiiColumns(model)) {
    for (const row of model.rows) {
      const value = row[colIndex];
      if (value === null) continue;
      let str = String(value).trim();
      if (str === '') continue;
      if (FILLER_VALUES.has(str.toLowerCase())) continue; // fix3 item 5

      // Email columns: keep the local part only, never the domain (fix2 D2)
      // - a domain word like "wesley" or "example" must never redact prose.
      if (emailLocalOnly) {
        const at = str.indexOf('@');
        if (at !== -1) str = str.slice(0, at);
      }

      // Multi-word value -> a full-phrase pattern ("Jo Li").
      if (/\s/.test(str)) {
        const words = str.split(/\s+/).map(stripEdges).filter((w) => w.length >= 1);
        if (words.length >= 2) phrases.add(words.join(' '));
      }

      for (const raw of str.split(TOKEN_SPLIT_REGEX)) {
        const token = stripEdges(raw);
        if (token.length < TOKEN_MIN_LENGTH) continue;
        if (COMMON_WORDS.has(token.toLowerCase())) continue; // fix3 item 4
        if (token.length === 2) {
          // Only uppercase-initial 2-char tokens ("Ng", "Vy") - this keeps
          // numeric id fragments ("14") and lowercase junk out.
          if (STARTS_UPPER.test(token)) tokens2.add(token);
        } else {
          tokens3.add(token.toLowerCase());
        }
      }
    }
  }

  return { tokens3, tokens2, phrases };
}

// Builds a scrubber bound to one survey: it knows the actual names/ids
// respondents entered and removes them from comment text even when they
// appear with no honorific. The model passed in should already have been
// through applyQuarantine; with no quarantined personal columns the returned
// function degrades to plain scrubText.
export function makeScrubber(model: SurveyModel): (text: string) => string {
  const { tokens3, tokens2, phrases } = collectTokens(model);

  // Phrases first so "Jo Li" collapses in one hit.
  const phrasePatterns = [...phrases].map((phrase) => {
    const body = phrase.split(' ').map(escapeRegExp).join('\\s+');
    return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu');
  });

  // 3+ char tokens: case-insensitive match, but only substitute when the
  // matched text starts uppercase (protects lowercase common words; ALL-CAPS
  // still starts uppercase, so it is replaced).
  const patterns3 = [...tokens3].map(
    (token) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(token)}(?![\\p{L}\\p{N}])`, 'giu'),
  );

  // 2-char tokens: exact case only.
  const patterns2 = [...tokens2].map(
    (token) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(token)}(?![\\p{L}\\p{N}])`, 'gu'),
  );

  return (text: string) => {
    let result = scrubText(text);
    for (const pattern of phrasePatterns) result = result.replace(pattern, '[name]');
    for (const pattern of patterns3) {
      result = result.replace(pattern, (matched) => (STARTS_UPPER.test(matched) ? '[name]' : matched));
    }
    for (const pattern of patterns2) result = result.replace(pattern, '[name]');
    // Collapse whitespace-adjacent placeholders so one person reads as one
    // [name] ("Alex Sample" -> "[name] [name]" -> "[name]").
    return result.replace(/\[name\](?:\s+\[name\])+/g, '[name]');
  };
}
