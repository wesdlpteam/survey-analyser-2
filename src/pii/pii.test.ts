import { describe, expect, it } from 'vitest';
import { sampleModel } from '../fixtures/build';
import type { QType, SurveyModel, Question } from '../types';
import { applyQuarantine } from './quarantine';
import { scrubText } from './scrub';

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

  it('matches "First Name" / "Preferred Name" (ends with " name") but not "Nickname" (no space before "name")', () => {
    expect(applyQuarantine(modelWithHeader('First Name')).questions[0].quarantineReason).toBe('name');
    expect(applyQuarantine(modelWithHeader('Preferred Name')).questions[0].quarantineReason).toBe('name');
    expect(applyQuarantine(modelWithHeader('Nickname')).questions[0].quarantined).toBe(false);
  });
});

describe('applyQuarantine - value-scan rule ("looks-personal")', () => {
  function modelWithRows(rows: SurveyModel['rows'], type: QType = 'text'): SurveyModel {
    return {
      title: 'Synthetic',
      questions: [{ id: 'q0', title: 'Notes', type, quarantined: false }],
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

  it('ignores numeric cell values (only string values are scanned)', () => {
    const result = applyQuarantine(modelWithRows([[412345678], [412345678], [412345678]], 'numeric'));
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
});
