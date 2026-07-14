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

// Finds an email anywhere inside a larger string. Same character classes as
// quarantine.ts's VALUE_EMAIL_REGEX, but unanchored + global: that regex
// tests whether an ENTIRE cell value is (only) an email; this one instead
// finds and replaces an email substring embedded inside a full sentence.
// The domain's final segment is written as `[^\s@]*[^\s@.]` (not the simpler
// `[^\s@]+`) so the match can never end on a period: "...at john@x.com. Thanks"
// (no space before the sentence's full stop) would otherwise glue that full
// stop onto the domain and eat it into "[email]" along with the address.
const TEXT_EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]*[^\s@.]/g;

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

// Given verbatim in the brief.
const HONORIFIC_NAME_REGEX = /\b(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z][a-z]+/g;

export function scrubText(text: string): string {
  return text
    .replace(TEXT_EMAIL_REGEX, '[email]')
    .replace(TEXT_PHONE_REGEX, '[phone]')
    .replace(HONORIFIC_NAME_REGEX, '[name]');
}
