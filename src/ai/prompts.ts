// Builds everything sent to OpenAI. digestForAi is the ONLY function that
// touches survey data on its way out of the browser - it consumes a
// StatsDigest (already quarantine-filtered by engine.ts: analysable
// questions only, never raw rows, text comments already PII-scrubbed) and
// additionally caps each text question's comments at 60 so a large survey
// never balloons the prompt or over-shares beyond a representative sample.
import type { QuestionStats, StatsDigest, TextStats } from '../stats/engine';

export const COMMENT_SAMPLE_CAP = 60;

function isText(q: QuestionStats): q is QuestionStats & TextStats {
  return q.kind === 'text';
}

// Every field on a QuestionStats is already an aggregate number, string or
// small array - never a raw respondent row - so spreading it is safe. Text
// questions get their comments array capped and a totalComments count added
// so the AI knows the true size behind the sample it's shown.
function questionForAi(q: QuestionStats): Record<string, unknown> {
  if (isText(q)) {
    return { ...q, totalComments: q.comments.length, comments: q.comments.slice(0, COMMENT_SAMPLE_CAP) };
  }
  return { ...q };
}

export function digestForAi(d: StatsDigest, context: string): string {
  return JSON.stringify({
    context,
    respondentCount: d.respondentCount,
    completionRate: d.completionRate,
    overallFavourablePct: d.overallFavourablePct,
    commentCount: d.commentCount,
    commentSampleCap: COMMENT_SAMPLE_CAP,
    questions: d.questions.map(questionForAi),
  });
}

const JSON_SHAPE = `{
  "executiveSummary": "string, 2-5 plain-English sentences",
  "overall": "green" | "amber" | "red",
  "sections": [
    {
      "title": "string, the exact question title from the digest",
      "questionIds": ["one or more questionId values from the digest"],
      "rag": "green" | "amber" | "red",
      "ragJustification": "string, one sentence citing the actual numbers",
      "findings": [
        { "text": "string, one sentence citing actual numbers", "evidenceQuestionIds": ["questionId", "..."] }
      ]
    }
  ],
  "themes": [
    { "theme": "string", "weight": "many" | "some" | "few", "sampleQuotes": ["string", "..."] }
  ],
  "recommendations": ["string", "..."]
}`;

// Fixed role + rules text - no survey data lives in this string, so it's
// safe to log/cache/reuse across requests. The digest itself only ever
// travels via auditUserPrompt.
export function auditSystemPrompt(): string {
  return [
    'You are a school survey auditor, helping a non-technical school leader understand a staff or student survey.',
    '',
    'Rules you MUST follow:',
    '- Use ONLY the numbers supplied in the digest JSON you are given in the next message. Never invent a statistic, percentage or count.',
    '- Every finding must cite at least one real questionId from the digest\'s "questions" list, in evidenceQuestionIds. Never invent a questionId.',
    '- Each section\'s "rag" is compared against a rule-based colour already computed for that question (its suppliedRuleRag). Your rag may differ from suppliedRuleRag by at most 1 step (green<->amber or amber<->red) - never by 2 steps (green<->red). If you disagree more strongly than that, still choose the closest allowed colour and put your concern in ragJustification instead.',
    '- Write in plain English with Australian spelling (e.g. "colour", "favourable", "organise"). No jargon, no internal colour-code words in the executiveSummary.',
    `- The comments you see for each text question are a sample capped at ${COMMENT_SAMPLE_CAP} (see "commentSampleCap" and each question's "totalComments" in the digest). Treat them as a representative sample, not the full set - never claim an exact comment count beyond what the digest states.`,
    '- Respond with ONLY a single JSON object, no prose before or after it, matching exactly this shape:',
    JSON_SHAPE,
  ].join('\n');
}

export function auditUserPrompt(digestJson: string): string {
  return `Here is the survey digest as JSON. Write the audit report described in the system prompt, using only these numbers.\n\n${digestJson}`;
}

// Ground rules for the Ask-a-question chat (Task 10) - the digest is baked
// straight into the system prompt since chatText only takes a running
// message list, not a separate digest argument.
export function chatSystemPrompt(digestJson: string): string {
  return [
    'You are answering questions about a school survey for a non-technical reader.',
    'Answer ONLY using the numbers in the digest JSON below. If the answer is not in the digest, say plainly that you do not have that information - never guess or estimate.',
    'Always quote numbers exactly as they appear in the digest; do not round differently or recalculate them.',
    'Plain English, Australian spelling, no jargon.',
    '',
    'Digest JSON:',
    digestJson,
  ].join('\n');
}
