// Redacts personally-identifiable substrings from free-text survey answers
// before they reach charts, exports or any AI prompt. Column-level PII (see
// quarantine.ts) is handled by excluding the whole column; this handles PII
// that leaks into an otherwise-fine open-text answer (e.g. someone leaves
// their phone number in a comment).
//
// Order matters: emails are scrubbed first because an email is never a
// phone number - scrubbing the email out first means a digit-led local part
// (e.g. "12345678@example.com") can never be partly eaten by the phone
// pass - then phones, then honorific names last.
import type { SurveyModel } from '../types';

// Finds an email anywhere inside a larger string. Same character classes as
// quarantine.ts's VALUE_EMAIL_REGEX, but unanchored + global: that regex
// tests whether an ENTIRE cell value is (only) an email; this one instead
// finds and replaces an email substring embedded inside a full sentence.
// The domain's final segment is written as `[^\s@]*[^\s@.,;]` (not the
// simpler `[^\s@]+`) so the match can never end on sentence punctuation:
// "...at john@x.com. Thanks" / "john@x.com, thanks" would otherwise glue
// that period/comma onto the domain and eat it into "[email]" along with
// the address.
const TEXT_EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]*[^\s@.,;]/g;

// Finds a run of 8+ digits (spaces/dashes allowed inside, "+" allowed at the
// front) anywhere inside a larger string. Deliberately requires the match to
// both start AND end on a digit - unlike quarantine.ts's VALUE_PHONE_REGEX,
// which only ever tests a whole, already-isolated cell value, so it doesn't
// matter there whether a trailing space gets swept in. Here the match gets
// spliced back into a sentence: a version that could end on a trailing
// space (e.g. matching "0412 345 678 " with the space glued on, right
// before the word "if") would eat that space and glue the next word onto
// "[phone]" wrongly ("[phone]if" instead of "[phone] if"). Requiring a
// digit at both ends avoids that.
const TEXT_PHONE_REGEX = /\+?\d[\d\s-]{6,}\d/g;

// Honorific + name. Beyond the plain "Mr Chen" shape this also catches:
//   - an optional initial:            Mr J. Chen
//   - lowercase surname particles:    Dr van der Berg, Ms de la Cruz
//   - apostrophes/hyphens/capitals
//     inside the surname:             Mrs O'Brien-Smith, Mr McDonald
//   - an optional second capitalised
//     word (first + last name):       Ms Taylor Swift
// The particle alternatives after the surname carry a \b guard so a
// following word that merely STARTS with a particle ("described", "dented")
// is never partly consumed, which would glue text onto "[name]".
const HONORIFIC_NAME_REGEX =
  /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+(?:[A-Z]\.\s+)?(?:(?:van|von|der|de|da|di|la|le)\s+)*[A-Z][A-Za-z'’-]+(?:\s+(?:van|von|der|de|da|di|la|le)\b)*(?:\s+[A-Z][A-Za-z'’-]+)?/g;

export function scrubText(text: string): string {
  return text
    .replace(TEXT_EMAIL_REGEX, '[email]')
    .replace(TEXT_PHONE_REGEX, '[phone]')
    .replace(HONORIFIC_NAME_REGEX, '[name]');
}

// Tokens shorter than this are too collision-prone to scrub as whole words
// (e.g. initials, "a", "on").
const MIN_TOKEN_LENGTH = 3;

// Splits a cell value into word tokens: runs of letters/digits, keeping
// apostrophes and hyphens inside a token ("O'Brien-Smith" stays whole) while
// treating email punctuation (".", "@") as separators, so
// "alex.sample@example.com" yields alex / sample / example / com.
const TOKEN_SPLIT_REGEX = /[^\p{L}\p{N}'’-]+/u;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Builds a scrubber bound to one survey: it knows the actual names/emails
// respondents entered (from columns quarantined with reason 'name' or
// 'email') and removes them from comment text even when they appear with no
// honorific ("Alex was great" -> "[name] was great"). The model passed in
// should already have been through applyQuarantine; with no quarantined
// name/email columns the returned function degrades to plain scrubText.
export function makeScrubber(model: SurveyModel): (text: string) => string {
  const patterns = collectNameTokens(model).map(
    (token) => new RegExp(`\\b${escapeRegExp(token)}\\b`, 'gi'),
  );

  return (text: string) => {
    let result = scrubText(text);
    for (const pattern of patterns) {
      result = result.replace(pattern, '[name]');
    }
    // "Alex Sample" scrubs token-by-token into "[name] [name]"; collapse
    // whitespace-adjacent placeholders so one person reads as one [name].
    return result.replace(/\[name\](?:\s+\[name\])+/g, '[name]');
  };
}

function collectNameTokens(model: SurveyModel): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  model.questions.forEach((question, colIndex) => {
    if (question.quarantineReason !== 'name' && question.quarantineReason !== 'email') return;
    for (const row of model.rows) {
      const value = row[colIndex];
      if (value === null) continue;
      for (const token of String(value).split(TOKEN_SPLIT_REGEX)) {
        if (token.length < MIN_TOKEN_LENGTH) continue;
        const key = token.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          tokens.push(token);
        }
      }
    }
  });

  return tokens;
}
