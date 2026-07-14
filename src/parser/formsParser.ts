// Parses a Microsoft Forms .xlsx export into a SurveyModel, detecting each
// column's question type from its header + observed values. Detection rules
// run in a fixed order per column; the first rule that matches wins.
import * as XLSX from 'xlsx';
import { ParseError, type Question, type QType, type SurveyModel } from '../types';

const NO_RESPONSES_MESSAGE = 'This file has no survey responses in it.';

const META_HEADERS = new Set([
  'id',
  'start time',
  'completion time',
  'email',
  'name',
  'last modified time',
  'language',
  'total points',
]);

const META_PREFIXES = ['points -', 'feedback -'];

interface LikertRung {
  canonical: string;
  synonyms: string[]; // lowercase, trimmed
}

interface LikertSet {
  rungs: LikertRung[]; // index 0 = min rung .. last = max rung
}

const LIKERT_SETS: LikertSet[] = [
  {
    rungs: [
      { canonical: 'Strongly disagree', synonyms: ['strongly disagree'] },
      { canonical: 'Disagree', synonyms: ['disagree'] },
      { canonical: 'Neither agree nor disagree', synonyms: ['neither agree nor disagree', 'neutral'] },
      { canonical: 'Agree', synonyms: ['agree'] },
      { canonical: 'Strongly agree', synonyms: ['strongly agree'] },
    ],
  },
  {
    rungs: [
      { canonical: 'Very dissatisfied', synonyms: ['very dissatisfied'] },
      { canonical: 'Dissatisfied', synonyms: ['dissatisfied'] },
      { canonical: 'Neutral', synonyms: ['neutral'] },
      { canonical: 'Satisfied', synonyms: ['satisfied'] },
      { canonical: 'Very satisfied', synonyms: ['very satisfied'] },
    ],
  },
  {
    rungs: [
      { canonical: 'Never', synonyms: ['never'] },
      { canonical: 'Rarely', synonyms: ['rarely'] },
      { canonical: 'Sometimes', synonyms: ['sometimes'] },
      { canonical: 'Often', synonyms: ['often'] },
      { canonical: 'Always', synonyms: ['always'] },
    ],
  },
];

type Cell = string | number | null;

interface ColumnDetection {
  type: QType;
  scale?: { min: number; max: number; labels?: string[] };
  options?: string[];
  likertSet?: LikertSet;
}

export function parseWorkbook(data: ArrayBuffer, fileName: string): SurveyModel {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    throw new ParseError(NO_RESPONSES_MESSAGE);
  }

  const rawAoa = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  // Excel's "used range" sometimes pads a sheet with fully-blank rows; those
  // aren't real respondents (or a real header), so drop them before counting.
  const aoa = rawAoa.filter((row) => row.some((cell) => !isEmptyCell(cell)));

  if (aoa.length === 0) {
    throw new ParseError(NO_RESPONSES_MESSAGE);
  }

  const [headerRow, ...dataRows] = aoa;
  if (dataRows.length === 0) {
    throw new ParseError(NO_RESPONSES_MESSAGE);
  }

  const columnCount = headerRow.length;
  const questions: Question[] = [];
  const likertByColumn = new Map<number, LikertSet>();

  for (let c = 0; c < columnCount; c++) {
    const header = headerCellToTitle(headerRow[c]);
    const values = dataRows.map((row) => row[c] ?? null);
    const detection = detectColumn(header, values);
    if (detection.likertSet) likertByColumn.set(c, detection.likertSet);

    questions.push({
      id: `q${c}`,
      title: header,
      type: detection.type,
      quarantined: false,
      ...(detection.options ? { options: detection.options } : {}),
      ...(detection.scale ? { scale: detection.scale } : {}),
    });
  }

  const rows: Cell[][] = dataRows.map((row) =>
    Array.from({ length: columnCount }, (_, c) => {
      const raw = row[c] ?? null;
      // A cell can be blank as either a missing entry (already null via
      // defval) or an explicit empty string; treat both as "no answer".
      const value = isEmptyCell(raw) ? null : raw;
      const likertSet = likertByColumn.get(c);
      return likertSet ? normaliseLikert(value, likertSet) : value;
    }),
  );

  return {
    title: titleFromFileName(fileName),
    questions,
    rows,
    respondentCount: dataRows.length,
  };
}

function headerCellToTitle(cell: Cell): string {
  return cell === null ? '' : String(cell).trim();
}

function isEmptyCell(v: Cell): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function isMetaHeader(header: string): boolean {
  const h = header.trim().toLowerCase();
  if (META_HEADERS.has(h)) return true;
  return META_PREFIXES.some((prefix) => h.startsWith(prefix));
}

function toFiniteNumber(v: string | number): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const trimmed = v.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function matchLikertSet(distinctLower: Set<string>): LikertSet | null {
  if (distinctLower.size === 0) return null;
  for (const set of LIKERT_SETS) {
    const allowed = new Set(set.rungs.flatMap((r) => r.synonyms));
    let isSubset = true;
    for (const v of distinctLower) {
      if (!allowed.has(v)) {
        isSubset = false;
        break;
      }
    }
    if (isSubset) return set;
  }
  return null;
}

function collectSemicolonTokens(values: (string | number)[]): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const v of values) {
    for (const raw of String(v).split(';')) {
      const token = raw.trim();
      if (token && !seen.has(token)) {
        seen.add(token);
        tokens.push(token);
      }
    }
  }
  return tokens;
}

function summariseChoice(values: (string | number)[]) {
  const counts = new Map<string, number>();
  let maxLen = 0;
  for (const v of values) {
    const key = String(v).trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    maxLen = Math.max(maxLen, key.length);
  }
  const optionsByFrequency = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value);
  return {
    distinctCount: counts.size,
    ratio: counts.size / values.length,
    maxLen,
    optionsByFrequency,
  };
}

function detectColumn(header: string, values: Cell[]): ColumnDetection {
  // Rule 1: header identifies a metadata column, regardless of its values.
  if (isMetaHeader(header)) {
    return { type: 'meta' };
  }

  const nonEmpty = values.filter((v): v is string | number => !isEmptyCell(v));
  if (nonEmpty.length === 0) {
    return { type: 'text' };
  }

  // Rule 2 / 3: every value is a finite number.
  const numericValues = nonEmpty.map(toFiniteNumber);
  const allNumeric = numericValues.every((n) => n !== null);
  if (allNumeric) {
    const nums = numericValues as number[];
    const allInteger = nums.every((n) => Number.isInteger(n));
    const distinctCount = new Set(nums).size;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    if (allInteger && distinctCount <= 12 && min >= 0 && max <= 10 && max - min >= 2) {
      // Bounds are already the observed min/max; when they land on the
      // conventional 1-5 / 0-10 rungs that's exactly what gets used.
      return { type: 'rating', scale: { min, max } };
    }
    return { type: 'numeric' };
  }

  // Rule 4: ordered Likert label set.
  const distinctLower = new Set(nonEmpty.map((v) => String(v).trim().toLowerCase()));
  const likertSet = matchLikertSet(distinctLower);
  if (likertSet) {
    return {
      type: 'rating',
      scale: { min: 1, max: 5, labels: likertSet.rungs.map((r) => r.canonical) },
      likertSet,
    };
  }

  // Rule 5: semicolon-joined multi-select.
  if (nonEmpty.some((v) => String(v).includes(';'))) {
    const tokens = collectSemicolonTokens(nonEmpty);
    if (tokens.length <= 15) {
      return { type: 'multiChoice', options: tokens };
    }
  }

  // Rule 6: small, low-cardinality single-select.
  const { distinctCount, ratio, maxLen, optionsByFrequency } = summariseChoice(nonEmpty);
  if (distinctCount <= 12 && (ratio <= 0.6 || nonEmpty.length < 8) && maxLen <= 60) {
    return { type: 'choice', options: optionsByFrequency };
  }

  // Rule 7: fallback.
  return { type: 'text' };
}

function normaliseLikert(raw: Cell, set: LikertSet): Cell {
  if (raw === null) return null;
  const key = String(raw).trim().toLowerCase();
  const idx = set.rungs.findIndex((r) => r.synonyms.includes(key));
  return idx === -1 ? null : idx + 1;
}

function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^./\\]+$/, '');
  return withoutExtension
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
