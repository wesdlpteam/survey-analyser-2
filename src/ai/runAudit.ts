// Orchestrates one AI audit: build the privacy-safe digest, call OpenAI,
// validate the reply. Nothing here touches the network directly (client.ts
// does) and nothing here builds the outbound JSON directly (prompts.ts
// does) - this file just wires the three pieces together in order.
import { questionRag, type Rag } from '../ratings/rag';
import type { StatsDigest } from '../stats/engine';
import type { AuditReport } from './auditTypes';
import { chatJSON } from './client';
import { auditSystemPrompt, auditUserPrompt, digestForAi } from './prompts';
import { validateAudit } from './validate';

export async function runAiAudit(
  d: StatsDigest,
  context: string,
  key: string,
  model: string,
): Promise<AuditReport> {
  const digestJson = digestForAi(d, context);

  const raw = await chatJSON({
    key,
    model,
    system: auditSystemPrompt(),
    user: auditUserPrompt(digestJson),
  });

  // Same default (amber "no signal") fallback.ts uses for choice/numeric
  // questions - questionRag returns null for those kinds.
  const ruleRags: Record<string, Rag> = {};
  for (const q of d.questions) ruleRags[q.questionId] = questionRag(q) ?? 'amber';

  // Model is threaded into validateAudit so the returned report is complete
  // (source 'ai' + model) at the point of validation - no post-hoc spread to
  // forget or drop on a later refactor.
  return validateAudit(raw, d, ruleRags, model);
}
