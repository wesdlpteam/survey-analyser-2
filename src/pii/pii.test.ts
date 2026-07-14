import { describe, expect, it } from 'vitest';
import { sampleModel } from '../fixtures/build';
import type { QType, SurveyModel, Question } from '../types';
import { applyQuarantine } from './quarantine';
import { makeScrubber, scrubText } from './scrub';

function findQuestion(questions: Question[], title: string): Question {
  const q = questions.find((question) => question.title === title);
  if (!q) throw new Error(`fixture missing question titled "${title}"`);
  return q;
}

// Locates the fixture row/column holding a known substring, instead of a
// hard-coded row index, so this doesn't silently go stale if fixtures/build.ts
// reorders its rows later.
function findRowContaining(model: SurveyModel, questionTitle: string, needle: string): string {
  const colIndex = model.questions.findIndex((q) => q.title === questionTitle);
  const row = model.rows.find((r) => typeof r[colIndex] === 'string' && (r[colIndex] as string).includes(needle));
  if (!row) throw new Error(`fixture missing a "${questionTitle}" answer containing "${needle}"`);
  return row[colIndex] as string;
}

describe('applyQuarantine (fixture staff survey)', () => {
  const model = sampleModel();
  const result = applyQuarantine(model);

  it('quarantines Email with reason "email"', () => {
    const q = findQuestion(result.questions, 'Email');
    expect(q.quarantined).toBe(true);
    expect(q.quarantineReason).toBe('email');
  });

  it('quarantines Name with reason "name"', () => {
    const q = findQuestion(result.questions, 'Name');
    expect(q.quarantined).toBe(true);
    expect(q.quarantineReason).toBe('name');
  });

  it('quarantines ID with reason "identifier"', () => {
    const q = findQuestion(result.questions, 'ID');
    expect(q.quarantined).toBe(true);
    expect(q.quarantineReason).toBe('identifier');
  });

  it('quarantines the meta Start time / Completion time columns with reason "metadata"', () => {
    expect(findQuestion(result.questions, 'Start time').quarantineReason).toBe('metadata');
    expect(findQuestion(result.questions, 'Completion time').quarantineReason).toBe('metadata');
  });

  it('does NOT quarantine campus', () => {
    const q = findQuestion(result.questions, 'Which campus are you based at?');
    expect(q.quarantined).toBe(false);
    expect(q.quarantineReason).toBeUndefined();
  });

  it('does NOT quarantine role', () => {
    expect(findQuestion(result.questions, 'Your role').quarantined).toBe(false);
  });

  it('does NOT quarantine the rating, multiChoice or free-text questions', () => {
    const untouchedTitles = [
      'How satisfied are you with communication? (1-5)',
      'I feel supported by leadership.',
      'How likely are you to recommend working here? (0-10)',
      'Which resources do you use?',
      'What is working well?',
      'What could be improved?',
    ];
    for (const title of untouchedTitles) {
      expect(findQuestion(result.questions, title).quarantined).toBe(false);
    }
  });

  it('does not mutate the input model', () => {
    expect(model.questions.every((q) => q.quarantined === false)).toBe(true);
    expect(model.questions.every((q) => q.quarantineReason === undefined)).toBe(true);
  });

  it('returns a new model and a new questions array', () => {
    expect(result).not.toBe(model);
    expect(result.questions).not.toBe(model.questions);
  });

  it('leaves rows and respondentCount untouched', () => {
    expect(result.rows).toEqual(model.rows);
    expect(result.respondentCount).toBe(model.respondentCount);
  });
});

describe('applyQuarantine - header rule edge cases', () => {
  function modelWithHeader(title: string, type: QType = 'text'): SurveyModel {
    return {
      title: 'Synthetic',
      questions: [{ id: 'q0', title, type, quarantined: false }],
      rows: [['Some plain free-text answer.'], ['Another plain answer.']],
      respondentCount: 2,
    };
  }

  it('does not treat a header merely containing the letters "id" as an identifier column', () => {
    // "considered" contains "id" as a substring - must not misfire.
    const result = applyQuarantine(modelWithHeader('Have you considered leaving feedback?'));
    expect(result.questions[0].quarantined).toBe(false);
  });

  it('matches a bare "id" header with surrounding whitespace, case-insensitively', () => {
    const result = applyQuarantine(modelWithHeader('  ID  '));
    expect(result.questions[0].quarantineReason).toBe('identifier');
  });

  it('matches "Student ID" (ends with " id")', () => {
    const result = applyQuarantine(modelWithHeader('Student ID'));
    expect(result.questions[0].quarantineReason).toBe('identifier');
  });

  it('matches "Username" and "IP Address" (contains-anywhere identifier phrases)', () => {
    expect(applyQuarantine(modelWithHeader('Username')).questions[0].quarantineReason).toBe('identifier');
    expect(applyQuarantine(modelWithHeader('IP Address')).questions[0].quarantineReason).toBe('identifier');
  });

  it('matches "E-mail Address" via the hyphenated spelling', () => {
    const result = applyQuarantine(modelWithHeader('E-mail Address'));
    expect(result.questions[0].quarantineReason).toBe('email');
  });

  it('matches "Mobile Number" and "Contact Phone"', () => {
    expect(applyQuarantine(modelWithHeader('Mobile Number')).questions[0].quarantineReason).toBe('phone');
    expect(applyQuarantine(modelWithHeader('Contact Phone')).questions[0].quarantineReason).toBe('phone');
  });

  it('matches "First Name" / "Preferred Name" (ends with " name")', () => {
    expect(applyQuarantine(modelWithHeader('First Name')).questions[0].quarantineReason).toBe('name');
    expect(applyQuarantine(modelWithHeader('Preferred Name')).questions[0].quarantineReason).toBe('name');
  });

  // BEHAVIOUR CHANGE (fix2 A1): Nickname/Surname/Signature/Initials are now
  // exact-term name headers (previously "Nickname" was left un-quarantined).
  it('matches exact-term name headers Surname / Nickname / Signature / Initials', () => {
    expect(applyQuarantine(modelWithHeader('Nickname')).questions[0].quarantineReason).toBe('name');
    expect(applyQuarantine(modelWithHeader('Surname')).questions[0].quarantineReason).toBe('name');
    expect(applyQuarantine(modelWithHeader('Signature')).questions[0].quarantineReason).toBe('name');
    expect(applyQuarantine(modelWithHeader('Initials')).questions[0].quarantineReason).toBe('name');
  });

  it('matches "Student ID:" - trailing punctuation is stripped before the suffix test', () => {
    expect(applyQuarantine(modelWithHeader('Student ID:')).questions[0].quarantineReason).toBe('identifier');
  });

  it('matches "ID Number", "Employee Number" and "Contact Number"', () => {
    expect(applyQuarantine(modelWithHeader('ID Number')).questions[0].quarantineReason).toBe('identifier');
    expect(applyQuarantine(modelWithHeader('Employee Number')).questions[0].quarantineReason).toBe('identifier');
    expect(applyQuarantine(modelWithHeader('Contact Number')).questions[0].quarantineReason).toBe('identifier');
  });

  it('does not treat "Did numbers help you?" as an id-number column', () => {
    // "Did numbers" contains the raw substring "id number" - the phrase
    // must only match at a word boundary.
    expect(applyQuarantine(modelWithHeader('Did numbers help you?')).questions[0].quarantined).toBe(false);
  });
});

describe('applyQuarantine - value-scan rule ("looks-personal")', () => {
  function modelWithRows(rows: SurveyModel['rows'], type: QType = 'text', header = 'Notes'): SurveyModel {
    return {
      title: 'Synthetic',
      questions: [{ id: 'q0', title: header, type, quarantined: false }],
      rows,
      respondentCount: rows.length,
    };
  }

  it('quarantines a column where most values look like emails', () => {
    const result = applyQuarantine(
      modelWithRows([['a@example.com'], ['b@example.com'], ['c@example.com'], ['plain text']]),
    );
    expect(result.questions[0].quarantined).toBe(true);
    expect(result.questions[0].quarantineReason).toBe('looks-personal');
  });

  it('quarantines a column where most values look like phone numbers', () => {
    const result = applyQuarantine(modelWithRows([['0412 345 678'], ['0413 111 222'], ['plain text']]));
    expect(result.questions[0].quarantined).toBe(true);
    expect(result.questions[0].quarantineReason).toBe('looks-personal');
  });

  it('does not quarantine at exactly 30% (rule requires strictly greater than 30%)', () => {
    const rows: SurveyModel['rows'] = [
      ['a@example.com'],
      ['b@example.com'],
      ['c@example.com'],
      ['x'],
      ['x'],
      ['x'],
      ['x'],
      ['x'],
      ['x'],
      ['x'],
    ];
    const result = applyQuarantine(modelWithRows(rows));
    expect(result.questions[0].quarantined).toBe(false);
  });

  it('does not divide by zero on a column of entirely null/blank values', () => {
    const model = modelWithRows([[null], [''], [null], ['   ']]);
    expect(() => applyQuarantine(model)).not.toThrow();
    expect(applyQuarantine(model).questions[0].quarantined).toBe(false);
  });

  it('scans numeric cells too: a numeric column of phone-like numbers is quarantined', () => {
    // A Forms "Number" question full of phone numbers arrives as JS numbers,
    // not strings - the scan must coerce and catch them.
    const result = applyQuarantine(modelWithRows([[91234567], [91234568], [91234569]], 'numeric', 'Extra info'));
    expect(result.questions[0].quarantined).toBe(true);
    expect(result.questions[0].quarantineReason).toBe('looks-personal');
  });

  it('does not flag ordinary small numbers (rating answers) as personal', () => {
    const result = applyQuarantine(modelWithRows([[4], [5], [3], [2]], 'rating', 'Extra info'));
    expect(result.questions[0].quarantined).toBe(false);
  });
});

describe('scrubText', () => {
  it('removes the email and phone from the planted "could be improved" comment', () => {
    const model = sampleModel();
    const raw = findRowContaining(model, 'What could be improved?', 'john.smith@example.com');
    const scrubbed = scrubText(raw);
    expect(scrubbed).not.toContain('john.smith@example.com');
    expect(scrubbed).not.toContain('0412');
    expect(scrubbed).toBe('Contact me on [email] or [phone] if you want more detail.');
  });

  it('removes "Mr Chen" from the "working well" comment', () => {
    const model = sampleModel();
    const raw = findRowContaining(model, 'What is working well?', 'Mr Chen');
    const scrubbed = scrubText(raw);
    expect(scrubbed).not.toContain('Mr Chen');
    expect(scrubbed).toBe('[name] in the science department is always willing to help with new ideas.');
  });

  it('leaves a plain comment with no PII completely unchanged', () => {
    const plain = 'The new timetable software has made scheduling much easier this term.';
    expect(scrubText(plain)).toBe(plain);
  });

  it('scrubs every email when a comment contains more than one', () => {
    const text = 'Email either a@example.com or b@example.org for help.';
    expect(scrubText(text)).toBe('Email either [email] or [email] for help.');
  });

  it('scrubs an international +61-format phone number', () => {
    expect(scrubText('Call +61 412 345 678 for details.')).toBe('Call [phone] for details.');
  });

  it('scrubs a honorific name with a trailing period ("Dr. Smith")', () => {
    expect(scrubText('Please ask Dr. Smith about it.')).toBe('Please ask [name] about it.');
  });

  it('scrubs emails before phones, so a digit-led email local-part is not partly eaten as a phone number', () => {
    expect(scrubText('Reach 12345678@example.com for help.')).toBe('Reach [email] for help.');
  });

  it('leaves an empty string unchanged', () => {
    expect(scrubText('')).toBe('');
  });

  it('does not swallow a sentence-ending period glued directly onto an email', () => {
    expect(scrubText('My email is john@example.com. Thanks.')).toBe('My email is [email]. Thanks.');
  });

  it('keeps a comma or semicolon glued directly onto an email', () => {
    expect(scrubText('mail john@x.com, thanks')).toBe('mail [email], thanks');
    expect(scrubText('mail john@x.com; thanks')).toBe('mail [email]; thanks');
  });

  it("scrubs apostrophe/hyphen surnames (Mrs O'Brien-Smith)", () => {
    expect(scrubText("Ask Mrs O'Brien-Smith for details.")).toBe('Ask [name] for details.');
  });

  it('scrubs particle surnames (Dr van der Berg)', () => {
    expect(scrubText('Dr van der Berg runs the clinic.')).toBe('[name] runs the clinic.');
  });

  it('scrubs an initial before the surname (Mr J. Chen)', () => {
    expect(scrubText('Mr J. Chen presented the results.')).toBe('[name] presented the results.');
  });

  it('does not over-eat words after the name ("Dr Smith said the Library helps")', () => {
    expect(scrubText('Dr Smith said the Library helps')).toBe('[name] said the Library helps');
  });

  it('does not eat a following word that merely starts with a particle ("described")', () => {
    expect(scrubText('Dr Smith described the plan.')).toBe('[name] described the plan.');
  });
});

describe('makeScrubber', () => {
  const scrubber = makeScrubber(applyQuarantine(sampleModel()));

  it('scrubs a quarantined Name-column value from a comment even without an honorific', () => {
    const scrubbed = scrubber('I spoke to Alex Sample about the roster.');
    expect(scrubbed).not.toContain('Alex');
    expect(scrubbed).not.toContain('Sample');
    expect(scrubbed).toBe('I spoke to [name] about the roster.');
  });

  // BEHAVIOUR CHANGE (fix2 D3): a 3+ char token is only substituted when the
  // matched text starts with an uppercase letter, so a lowercase "jamie"
  // survives (protects common words that happen to be someone's name, e.g.
  // "It will help" when a respondent is named Will). ALL-CAPS still replaced.
  it('replaces an uppercase/ALL-CAPS name occurrence but leaves a lowercase one', () => {
    expect(scrubber('ALEX and jamie both agreed.')).toBe('[name] and jamie both agreed.');
  });

  it('does not scrub partial-word matches ("sampler" must survive the "Sample" token)', () => {
    expect(scrubber('The sampler course was great.')).toBe('The sampler course was great.');
  });

  it('still applies the base scrubText pass first (emails, phones, honorifics)', () => {
    expect(scrubber('Contact me on john.smith@example.com or 0412 345 678 if you want more detail.')).toBe(
      'Contact me on [email] or [phone] if you want more detail.',
    );
  });

  it('leaves a plain comment unchanged', () => {
    const plain = 'More notice before roster changes would help a lot.';
    expect(scrubber(plain)).toBe(plain);
  });

  it('falls back to a plain scrubText pass when the model has no quarantined name/email columns', () => {
    const bare: SurveyModel = {
      title: 'X',
      questions: [{ id: 'q0', title: 'Notes', type: 'text', quarantined: false }],
      rows: [['hello']],
      respondentCount: 1,
    };
    expect(makeScrubber(bare)('Ask Dr Smith or email a@b.co today.')).toBe('Ask [name] or email [email] today.');
  });
});

// ---------------------------------------------------------------------------
// Fix round 2 — adversarial-review gap closures
// ---------------------------------------------------------------------------

function synthHeader(title: string, type: QType = 'text'): SurveyModel {
  return {
    title: 'Synthetic',
    questions: [{ id: 'q0', title, type, quarantined: false }],
    rows: [['Plain answer.'], ['Another plain answer.'], ['Third plain answer.']],
    respondentCount: 3,
  };
}

function synthRows(rows: SurveyModel['rows'], type: QType = 'text', header = 'Notes'): SurveyModel {
  return {
    title: 'Synthetic',
    questions: [{ id: 'q0', title: header, type, quarantined: false }],
    rows,
    respondentCount: rows.length,
  };
}

describe('fix2 A — header rules', () => {
  // A2 — identifier terms widened
  it('A2: quarantines Student Code / Staff Code / Roll Number / Payroll / Admission Number / Reference Number', () => {
    for (const h of [
      'Student Code',
      'Staff Code',
      'Roll Number',
      'Payroll',
      'Payroll ID',
      'Admission Number',
      'Reference Number',
    ]) {
      expect(applyQuarantine(synthHeader(h)).questions[0].quarantineReason).toBe('identifier');
    }
  });

  // A3 — date of birth
  it('A3: quarantines "Date of Birth", "Birthday" and word "DOB" as identifier', () => {
    expect(applyQuarantine(synthHeader('Date of Birth')).questions[0].quarantineReason).toBe('identifier');
    expect(applyQuarantine(synthHeader('Birthday')).questions[0].quarantineReason).toBe('identifier');
    expect(applyQuarantine(synthHeader('DOB')).questions[0].quarantineReason).toBe('identifier');
    expect(applyQuarantine(synthHeader('Your DOB:')).questions[0].quarantineReason).toBe('identifier');
  });

  it('A3 guard: a header merely containing the letters "dob" is not matched', () => {
    // "Hairdo bother" contains no whole-word "dob"; a contains-check would be
    // wrong. Word-boundary keeps it safe.
    expect(applyQuarantine(synthHeader('How do you feel about feedback?')).questions[0].quarantined).toBe(false);
  });

  // A4 — name-context headers
  it('A4: quarantines Emergency Contact / Parent / Carer / Guardian headers as name', () => {
    for (const h of ['Emergency Contact', 'Parent or Guardian', 'Primary Carer', 'Guardian details']) {
      expect(applyQuarantine(synthHeader(h)).questions[0].quarantineReason).toBe('name');
    }
  });

  it('A4: quarantines "Who is your ..." / "Who should we ..." headers as name', () => {
    expect(applyQuarantine(synthHeader('Who is your emergency contact?')).questions[0].quarantineReason).toBe('name');
    expect(applyQuarantine(synthHeader('Who should we contact in an emergency?')).questions[0].quarantineReason).toBe(
      'name',
    );
  });
});

describe('fix2 B — value-shape scans', () => {
  // B1 — name shape
  it('B1: quarantines a column of distinct person-names as looks-personal', () => {
    const result = applyQuarantine(
      synthRows([['John Smith'], ['Mary Jones'], ['Ahmed Khan'], ['Priya Patel'], ['Wei Chen']]),
    );
    expect(result.questions[0].quarantineReason).toBe('looks-personal');
  });

  it('B1 guard: a small repeated choice set (campuses) is NOT quarantined (distinct ratio too low)', () => {
    const campuses = [
      'Glen Waverley',
      'St Kilda Rd',
      'Elsternwick',
      'Glen Waverley',
      'St Kilda Rd',
      'Elsternwick',
      'Glen Waverley',
      'St Kilda Rd',
      'Elsternwick',
      'Glen Waverley',
      'St Kilda Rd',
      'Elsternwick',
      'Glen Waverley',
      'St Kilda Rd',
    ].map((c) => [c]);
    expect(applyQuarantine(synthRows(campuses)).questions[0].quarantined).toBe(false);
  });

  it('B1 guard: sentence-like free-text answers are NOT quarantined (fail the shape)', () => {
    const answers = [
      ['The new timetable software has made scheduling easier.'],
      ['Communication from leadership has improved a lot.'],
      ['I appreciate the flexibility around remote work.'],
      ['Parking has been less stressful since new bays opened.'],
    ];
    expect(applyQuarantine(synthRows(answers)).questions[0].quarantined).toBe(false);
  });

  // B2 — id shape
  it('B2: quarantines a column of distinct student-code IDs as looks-personal', () => {
    const result = applyQuarantine(synthRows([['S12345'], ['s1234567'], ['WES-04821'], ['6012345'], ['S54321']]));
    expect(result.questions[0].quarantineReason).toBe('looks-personal');
  });

  it('B2 guard: a 0-10 rating column is NOT quarantined (low distinct ratio, too few digits)', () => {
    const ratings = [[8], [10], [6], [4], [9], [0], [7], [8], [9], [10], [5], [7]];
    expect(applyQuarantine(synthRows(ratings, 'rating')).questions[0].quarantined).toBe(false);
  });

  it('B2 guard: a repeated "year" column (2024/2025/2026) is NOT quarantined (low distinct ratio)', () => {
    const years = [
      ['2024'],
      ['2025'],
      ['2026'],
      ['2024'],
      ['2025'],
      ['2026'],
      ['2024'],
      ['2025'],
      ['2026'],
      ['2024'],
    ];
    expect(applyQuarantine(synthRows(years)).questions[0].quarantined).toBe(false);
  });
});

describe('fix2 C — scrubText upgrades', () => {
  // C1 — honorifics
  it('C1: scrubs lowercase and extended titles', () => {
    expect(scrubText('I spoke to mr chen yesterday.')).toBe('I spoke to [name] yesterday.');
    expect(scrubText('Principal Nguyen visited us.')).toBe('[name] visited us.');
    expect(scrubText('Coach Taylor was encouraging.')).toBe('[name] was encouraging.');
    expect(scrubText('Sensei Tanaka runs the dojo.')).toBe('[name] runs the dojo.');
    expect(scrubText('Pastor Green led the assembly.')).toBe('[name] led the assembly.');
  });

  it('C1: does NOT scrub a title followed by a stopword', () => {
    expect(scrubText('I might miss the bus tomorrow.')).toBe('I might miss the bus tomorrow.');
    expect(scrubText('We coach the team on Fridays.')).toBe('We coach the team on Fridays.');
  });

  it('C1: scrubs capitalised particle chains and accented names cleanly', () => {
    expect(scrubText('Mrs Van Der Berg chaired it.')).toBe('[name] chaired it.');
    expect(scrubText('Ask Mr Müller about it.')).toBe('Ask [name] about it.');
    expect(scrubText('Ms Ngô presented well.')).toBe('[name] presented well.');
  });

  it('C1: does not glue a following hyphenated word onto the name', () => {
    expect(scrubText('Dr Smith de-escalated the situation.')).toBe('[name] de-escalated the situation.');
  });

  // C2 — id pass
  it('C2: scrubs alphanumeric / long-digit IDs but not years or postcodes', () => {
    expect(scrubText('My login is s1234567 today.')).toBe('My login is [id] today.');
    expect(scrubText('Ref WES-04821 please.')).toBe('Ref [id] please.');
    expect(scrubText('Back in 2026 we changed it.')).toBe('Back in 2026 we changed it.');
    expect(scrubText('The postcode is 3150 here.')).toBe('The postcode is 3150 here.');
  });

  // C3 — address pass
  it('C3: scrubs a street address but leaves a bare campus road name', () => {
    expect(scrubText('I live at 12 Aster Ct, Glen Waverley 3150.')).toBe('I live at [address], Glen Waverley 3150.');
    expect(scrubText('the St Kilda Rd campus is nice')).toBe('the St Kilda Rd campus is nice');
  });

  // C4 — obfuscated email
  it('C4: redacts an obfuscated email at/dot form (loses the domain)', () => {
    const scrubbed = scrubText('Email john dot smith at gmail dot com for details.');
    expect(scrubbed).toContain('[email]');
    expect(scrubbed).not.toContain('gmail');
  });
});

describe('fix2 D — makeScrubber upgrades', () => {
  function nameColumnModel(names: (string | null)[], reason = 'name', title = 'Name'): SurveyModel {
    return {
      title: 'X',
      questions: [{ id: 'q0', title, type: 'text', quarantined: true, quarantineReason: reason }],
      rows: names.map((n) => [n]),
      respondentCount: names.length,
    };
  }

  // D2 — email local part only
  it('D2: only the email local part is tokenised, never the domain', () => {
    const model: SurveyModel = {
      title: 'X',
      questions: [{ id: 'q0', title: 'Email', type: 'text', quarantined: true, quarantineReason: 'email' }],
      rows: [['alex.sample@wesley.vic.edu.au']],
      respondentCount: 1,
    };
    const scrub = makeScrubber(model);
    expect(scrub('Wesley College feels welcoming.')).toBe('Wesley College feels welcoming.');
    expect(scrub('For example, the timetable is clearer.')).toBe('For example, the timetable is clearer.');
  });

  // D3 — uppercase-initial guard for 3+ char tokens.
  // BEHAVIOUR CHANGE (fix3 item 4): previously demonstrated with "Will";
  // "will" is now on the common-word stoplist so a bare Will token is never
  // collected (only the full "Will Turner" phrase would be). The
  // uppercase-initial rule itself is unchanged, shown here with "Rose".
  it('D3: a 3+ char token is only replaced when it starts uppercase', () => {
    const scrub = makeScrubber(nameColumnModel(['Rose']));
    expect(scrub('The rose garden is lovely.')).toBe('The rose garden is lovely.');
    expect(scrub('Rose helped me settle in.')).toBe('[name] helped me settle in.');
  });

  // D3 — 2-char case-sensitive tokens
  it('D3: 2-char names match case-sensitively as whole words', () => {
    const scrub = makeScrubber(nameColumnModel(['Ng']));
    expect(scrub('Ng helped me settle in.')).toBe('[name] helped me settle in.');
    expect(scrub('the song ng remix is good')).toBe('the song ng remix is good');
  });

  // D3 — full-phrase match regardless of case
  it('D3: a multi-word name phrase matches regardless of case', () => {
    const scrub = makeScrubber(nameColumnModel(['Jo Li']));
    expect(scrub('jo li was helpful today.')).toBe('[name] was helpful today.');
  });

  // D4 — unicode names
  it('D4: scrubs accented and non-Latin quarantined names', () => {
    const scrub = makeScrubber(nameColumnModel(['Chloé', 'André', 'Zoë', 'Ngô']));
    expect(scrub('Chloé has been amazing.')).toBe('[name] has been amazing.');
    expect(scrub('André emailed me twice.')).toBe('[name] emailed me twice.');
    expect(scrub('Zoë runs the choir.')).toBe('[name] runs the choir.');
    expect(scrub('Ngô presented well.')).toBe('[name] presented well.');
  });

  // D1 — collect from looks-personal columns too (not just name/email)
  it('D1: tokens from a looks-personal name column are scrubbed from comments', () => {
    // A value scan can quarantine a bare-names column as looks-personal; its
    // tokens must still feed the scrubber. "Okonkwo" is not an honorific name
    // and scrubText alone would leave it, so a change here proves collection.
    const scrub = makeScrubber(nameColumnModel(['Okonkwo'], 'looks-personal', 'Full name'));
    expect(scrub('Okonkwo chaired the meeting.')).toBe('[name] chaired the meeting.');
    expect(scrubText('Okonkwo chaired the meeting.')).toBe('Okonkwo chaired the meeting.');
  });

  // D1 — collect from Forms-style metadata columns whose header is Name/Email
  it('D1: a metadata-typed column with a Name header still feeds the scrubber', () => {
    const model: SurveyModel = {
      title: 'X',
      questions: [{ id: 'q0', title: 'Name', type: 'meta', quarantined: true, quarantineReason: 'metadata' }],
      rows: [['Okonkwo']],
      respondentCount: 1,
    };
    expect(makeScrubber(model)('Okonkwo chaired the meeting.')).toBe('[name] chaired the meeting.');
  });
});

// ---------------------------------------------------------------------------
// Fix round 3 — stop over-matching destroying survey data
// ---------------------------------------------------------------------------

describe('fix3 item 1 — A4 word-boundaries + question-style header guard', () => {
  it('1a: does not quarantine headers where "parent" is only a substring', () => {
    expect(applyQuarantine(synthHeader('How transparent is leadership communication?')).questions[0].quarantined).toBe(
      false,
    );
    expect(applyQuarantine(synthHeader('Is the new policy transparent enough?')).questions[0].quarantined).toBe(false);
    expect(applyQuarantine(synthHeader('How useful was the parenting seminar?')).questions[0].quarantined).toBe(false);
    // Non-question variant proves the word-boundary alone (no question guard).
    expect(applyQuarantine(synthHeader('Parenting workshop feedback')).questions[0].quarantined).toBe(false);
  });

  it('1b: question-style headers do not trip the contains-rules', () => {
    expect(applyQuarantine(synthHeader('How effective is email communication?')).questions[0].quarantined).toBe(false);
    expect(
      applyQuarantine(synthHeader('What do you think of the mobile phone policy?')).questions[0].quarantined,
    ).toBe(false);
  });

  it('1b: exact/suffix and who-rules still fire on question-style headers', () => {
    expect(applyQuarantine(synthHeader('Email address')).questions[0].quarantineReason).toBe('email');
    expect(applyQuarantine(synthHeader('Who is your homeroom teacher?')).questions[0].quarantineReason).toBe('name');
  });

  it('1b: the value scan still backstops a question-headed column of real emails', () => {
    const result = applyQuarantine(
      synthRows([['a@example.com'], ['b@example.com'], ['c@example.com']], 'text', 'How can we contact you?'),
    );
    expect(result.questions[0].quarantineReason).toBe('looks-personal');
  });
});

describe('fix3 item 2 — B1/B2 tightening', () => {
  it('B1: a single-word choice column (favourite subjects) is NOT quarantined', () => {
    const subjects = [
      ['English'],
      ['Maths'],
      ['Science'],
      ['History'],
      ['Geography'],
      ['Drama'],
      ['Music'],
      ['Visual Arts'],
    ];
    expect(applyQuarantine(synthRows(subjects)).questions[0].quarantined).toBe(false);
  });

  it('B1: a 5-row club column is NOT quarantined (row floor / distinct guard)', () => {
    const clubs = [['Chess Club'], ['Debate Team'], ['Chess Club'], ['Chess Club'], ['Debate Team']];
    expect(applyQuarantine(synthRows(clubs)).questions[0].quarantined).toBe(false);
  });

  it('B1: a 6-row full-name column IS still quarantined', () => {
    const names = [
      ['Amelia Watson'],
      ['Ben Okafor'],
      ['Carla Reyes'],
      ['Divya Nair'],
      ['Ethan Walsh'],
      ['Fiona Zhu'],
    ];
    expect(applyQuarantine(synthRows(names)).questions[0].quarantineReason).toBe('looks-personal');
  });

  it('B2: a distinct year-of-entry column is NOT quarantined (year guard)', () => {
    const years = [['1998'], ['2003'], ['2010'], ['2015'], ['2021'], ['1987']];
    expect(applyQuarantine(synthRows(years, 'text', 'What year did you start?')).questions[0].quarantined).toBe(false);
  });
});

describe('fix3 item 3 — ambiguous lowercase titles', () => {
  it('leaves lowercase ambiguous titles followed by lowercase words unchanged', () => {
    expect(scrubText('I will miss working with her.')).toBe('I will miss working with her.');
    expect(scrubText('I miss having planning time.')).toBe('I miss having planning time.');
    expect(scrubText('We coach netball on Fridays.')).toBe('We coach netball on Fridays.');
    expect(scrubText('The principal reason I stay is the team.')).toBe('The principal reason I stay is the team.');
  });

  it('still scrubs an ambiguous lowercase title before a capitalised name', () => {
    expect(scrubText('miss Chen marks fairly')).toBe('[name] marks fairly');
  });

  it('keeps the lenient rule for unambiguous titles and uppercase forms', () => {
    expect(scrubText('mr chen helped me')).toBe('[name] helped me');
    expect(scrubText('Principal Nguyen visited us.')).toBe('[name] visited us.');
  });
});

describe('fix3 item 4 — common-word token stoplist', () => {
  function nameModel(names: (string | null)[]): SurveyModel {
    return {
      title: 'X',
      questions: [{ id: 'q0', title: 'Name', type: 'text', quarantined: true, quarantineReason: 'name' }],
      rows: names.map((n) => [n]),
      respondentCount: names.length,
    };
  }

  it('"My Nguyen": common word My never scrubbed, phrase and rare token still are', () => {
    const scrub = makeScrubber(nameModel(['My Nguyen']));
    expect(scrub('My favourite part is the library.')).toBe('My favourite part is the library.');
    expect(scrub('my nguyen helped me')).toBe('[name] helped me');
    expect(scrub('Nguyen ran the session.')).toBe('[name] ran the session.');
  });

  it('"Anh Do": Do survives as a word, Anh is still scrubbed', () => {
    const scrub = makeScrubber(nameModel(['Anh Do']));
    expect(scrub('Do you think we need more PD?')).toBe('Do you think we need more PD?');
    expect(scrub('Anh was helpful')).toBe('[name] was helpful');
  });

  it('"Will Turner": Will survives as a word, the full phrase is still scrubbed', () => {
    const scrub = makeScrubber(nameModel(['Will Turner']));
    expect(scrub('Will this policy change soon?')).toBe('Will this policy change soon?');
    expect(scrub('will turner asked about it')).toBe('[name] asked about it');
  });
});

describe('fix3 item 5 — filler values are never collected as tokens', () => {
  it('filler Name-column values do not corrupt ordinary comments', () => {
    const model: SurveyModel = {
      title: 'X',
      questions: [{ id: 'q0', title: 'Name', type: 'text', quarantined: true, quarantineReason: 'name' }],
      rows: [['Prefer not to say'], ['None']],
      respondentCount: 2,
    };
    const scrub = makeScrubber(model);
    expect(scrub('I would prefer not to say more.')).toBe('I would prefer not to say more.');
    expect(scrub('None of the changes helped.')).toBe('None of the changes helped.');
  });
});

describe('fix3b — date of birth backstop', () => {
  it('1: "date of birth" and word "dob" are exempt from the question-style guard', () => {
    expect(applyQuarantine(synthHeader('When is your date of birth?')).questions[0].quarantineReason).toBe(
      'identifier',
    );
    expect(applyQuarantine(synthHeader('What is your DOB?')).questions[0].quarantineReason).toBe('identifier');
  });

  it('1: "birthday" stays under the question guard (opinion questions survive)', () => {
    expect(applyQuarantine(synthHeader('Did you enjoy the birthday breakfast?')).questions[0].quarantined).toBe(false);
    // Non-question "Birthday" header still quarantines (round 2 behaviour).
    expect(applyQuarantine(synthHeader('Birthday')).questions[0].quarantineReason).toBe('identifier');
  });

  it('2: a distinct dd/mm/yyyy column is quarantined by the date-shape scan', () => {
    const dates = [['12/03/2011'], ['05/11/2010'], ['23/07/2011'], ['01/09/2010'], ['17/02/2011'], ['30/06/2011']];
    expect(applyQuarantine(synthRows(dates, 'text', 'When is your birthday?')).questions[0].quarantineReason).toBe(
      'looks-personal',
    );
  });

  it('2 guard: a repeated event-date column is NOT quarantined (low distinct ratio)', () => {
    const termDates = [
      ['01/02/2026'],
      ['14/04/2026'],
      ['01/02/2026'],
      ['14/04/2026'],
      ['01/02/2026'],
      ['14/04/2026'],
      ['01/02/2026'],
      ['14/04/2026'],
    ];
    expect(applyQuarantine(synthRows(termDates, 'text', 'Which term?')).questions[0].quarantined).toBe(false);
  });
});

describe('fix3 item 6 — obfuscated-email pass requires a TLD-like ending', () => {
  it('leaves ordinary "at ... dot ..." prose unchanged', () => {
    expect(scrubText('we looked at options dot points')).toBe('we looked at options dot points');
    expect(scrubText('we ate lunch at school dot the canteen was busy')).toBe(
      'we ate lunch at school dot the canteen was busy',
    );
  });

  it('redacts the whole obfuscated address including leading "word dot" segments', () => {
    expect(scrubText('Email john dot smith at gmail dot com for details.')).toBe('Email [email] for details.');
  });
});
