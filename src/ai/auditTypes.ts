// Shared report shape for both the rule-based fallback (fallback.ts, this
// task) and the AI-generated report (Task 9) — the UI renders one
// AuditReport type regardless of which source built it.
import type { Rag } from '../ratings/rag';

export interface Finding {
  text: string;
  evidenceQuestionIds: string[];
}

export interface AuditSection {
  title: string;
  questionIds: string[];
  rag: Rag;
  ragSource: 'rules' | 'ai-adjusted';
  ragJustification: string;
  findings: Finding[];
}

export interface AuditReport {
  executiveSummary: string;
  overall: Rag;
  sections: AuditSection[];
  themes: { theme: string; weight: 'many' | 'some' | 'few'; sampleQuotes: string[] }[];
  recommendations: string[];
  source: 'ai' | 'rules';
  model?: string;
}
