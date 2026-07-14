import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildFixtureWorkbook } from '../fixtures/build';
import { ParseError, type Question } from '../types';
import { parseWorkbook } from './formsParser';

function findQuestion(questions: Question[], title: string): Question {
  const q = questions.find((question) => question.title === title);
  if (!q) throw new Error(`fixture missing question titled "${title}"`);
  return q;
}

function colIndex(questions: Question[], title: string): number {
  return questions.findIndex((question) => question.title === title);
}

describe('parseWorkbook (Microsoft Forms .xlsx fixture)', () => {
  const buf = buildFixtureWorkbook();
  const model = parseWorkbook(buf, 'Staff_Survey_2026.xlsx');

  it('counts 14 respondents', () => {
    expect(model.respondentCount).toBe(14);
    expect(model.rows).toHaveLength(14);
  });

  it('derives the survey title from the filename', () => {
    expect(model.title).toBe('Staff Survey 2026');
  });

  it('detects ID, Email and Name as meta columns', () => {
    expect(findQuestion(model.questions, 'ID').type).toBe('meta');
    expect(findQuestion(model.questions, 'Email').type).toBe('meta');
    expect(findQuestion(model.questions, 'Name').type).toBe('meta');
  });

  it('detects the 1-5 satisfaction question as a numeric rating with scale 1-5', () => {
    const q = findQuestion(model.questions, 'How satisfied are you with communication? (1-5)');
    expect(q.type).toBe('rating');
    expect(q.scale).toEqual({ min: 1, max: 5 });
  });

  it('detects the Likert agreement question as rating with labels, and normalises rows to numbers', () => {
    const q = findQuestion(model.questions, 'I feel supported by leadership.');
    expect(q.type).toBe('rating');
    expect(q.scale?.min).toBe(1);
    expect(q.scale?.max).toBe(5);
    expect(q.scale?.labels).toEqual([
      'Strongly disagree',
      'Disagree',
      'Neither agree nor disagree',
      'Agree',
      'Strongly agree',
    ]);

    const idx = colIndex(model.questions, 'I feel supported by leadership.');
    // Fixture row 0 answered "Strongly agree" -> normalised to 5; every cell in the
    // column must now be a number (or null), never the original label string.
    expect(model.rows[0][idx]).toBe(5);
    for (const row of model.rows) {
      expect(typeof row[idx]).toBe('number');
    }
  });

  it('detects the 0-10 NPS question as a numeric rating with scale 0-10', () => {
    const q = findQuestion(model.questions, 'How likely are you to recommend working here? (0-10)');
    expect(q.type).toBe('rating');
    expect(q.scale).toEqual({ min: 0, max: 10 });
  });

  it('detects the resources question as multiChoice with semicolon-split options', () => {
    const q = findQuestion(model.questions, 'Which resources do you use?');
    expect(q.type).toBe('multiChoice');
    expect(q.options).toContain('Library');
  });

  it('detects campus as a single-select choice question', () => {
    const q = findQuestion(model.questions, 'Which campus are you based at?');
    expect(q.type).toBe('choice');
    expect(q.options).toBeDefined();
    expect(q.options).toContain('Glen Waverley');
  });

  it('detects open-ended comment questions as free text', () => {
    const q = findQuestion(model.questions, 'What is working well?');
    expect(q.type).toBe('text');
  });

  it('assigns question ids as q + column index', () => {
    expect(model.questions[0].id).toBe('q0');
    expect(model.questions[3].id).toBe('q3');
  });

  it('leaves every question un-quarantined (Task 3 owns quarantine decisions)', () => {
    expect(model.questions.every((q) => q.quarantined === false)).toBe(true);
  });
});

describe('parseWorkbook error handling', () => {
  it('throws ParseError for a workbook with no headers and no rows', () => {
    const ws = XLSX.utils.aoa_to_sheet([]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    expect(() => parseWorkbook(buf, 'Empty.xlsx')).toThrow(ParseError);
    expect(() => parseWorkbook(buf, 'Empty.xlsx')).toThrow('This file has no survey responses in it.');
  });

  it('throws ParseError for a workbook with headers but zero data rows', () => {
    const ws = XLSX.utils.aoa_to_sheet([['ID', 'Email', 'Name']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    expect(() => parseWorkbook(buf, 'Empty.xlsx')).toThrow(ParseError);
  });
});

function buildBuf(aoa: (string | number | null)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('parseWorkbook edge cases', () => {
  it('a rating column with some blank cells still detects as rating; blanks become null', () => {
    const buf = buildBuf([
      ['ID', 'Score (1-5)'],
      [1, 1],
      [2, null],
      [3, 5],
      [4, 3],
      [5, ''],
      [6, 4],
      [7, 2],
      [8, 5],
    ]);
    const model = parseWorkbook(buf, 'Blanks.xlsx');
    const q = model.questions[1];
    expect(q.type).toBe('rating');
    expect(q.scale).toEqual({ min: 1, max: 5 });
    expect(model.rows[1][1]).toBeNull();
    expect(model.rows[4][1]).toBeNull();
  });

  it('a column of mixed junk (numbers + text) does not crash and does not classify as numeric/rating', () => {
    const buf = buildBuf([
      ['ID', 'Weird'],
      [1, 5],
      [2, 'n/a'],
      [3, 7],
      [4, 'unknown'],
      [5, 2],
      [6, 'skip'],
      [7, 9],
      [8, 'other'],
    ]);
    const model = parseWorkbook(buf, 'Junk.xlsx');
    const q = model.questions[1];
    expect(['choice', 'text']).toContain(q.type);
  });

  it('a fully blank column falls back to text with no crash', () => {
    const buf = buildBuf([
      ['ID', 'AllBlank'],
      [1, null],
      [2, ''],
      [3, null],
      [4, null],
      [5, ''],
      [6, null],
      [7, null],
      [8, null],
    ]);
    const model = parseWorkbook(buf, 'AllBlank.xlsx');
    expect(model.questions[1].type).toBe('text');
    expect(model.rows.every((r) => r[1] === null)).toBe(true);
  });

  it('a wholly blank trailing row does not inflate respondentCount', () => {
    const buf = buildBuf([
      ['ID', 'Email'],
      [1, 'a@example.com'],
      [2, 'b@example.com'],
      [null, null],
    ]);
    const model = parseWorkbook(buf, 'Trailing.xlsx');
    expect(model.respondentCount).toBe(2);
  });
});
