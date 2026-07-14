// Core data model shared by the parser, quarantine logic, charts and UI.
// Everything downstream imports from here — keep it stable.

export type QType = 'choice' | 'multiChoice' | 'rating' | 'numeric' | 'text' | 'meta';

export interface Question {
  id: string; // 'q' + column index, e.g. 'q3'
  title: string;
  type: QType;
  options?: string[];
  scale?: { min: number; max: number; labels?: string[] }; // labels index 0 = min
  quarantined: boolean;
  quarantineReason?: string;
}

export interface SurveyModel {
  title: string;
  questions: Question[];
  rows: (string | number | null)[][]; // rows[r][colIndex]; rating answers normalised to numbers
  respondentCount: number;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}
