// Thin OpenAI chat-completions client - the ONLY place a network request
// leaves the browser in this app. The API key travels in the Authorization
// header only (never a URL param, never logged, never echoed into an error
// message) so it can't end up in browser history, dev-tools console dumps,
// or a crash report.
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

export type AiErrorKind = 'auth' | 'rate' | 'network' | 'bad-response';

export class AiError extends Error {
  kind: AiErrorKind;

  constructor(kind: AiErrorKind, msg: string) {
    super(msg);
    this.name = 'AiError';
    this.kind = kind;
  }
}

interface ChatBody {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  response_format?: { type: 'json_object' };
  max_tokens?: number;
}

// Single place that actually calls fetch. Maps every failure mode to an
// AiError kind; the message text is always generic/static, never built from
// the key or the raw response body (which could echo the key back).
async function postChat(key: string, body: ChatBody): Promise<string> {
  let res: Response;
  try {
    res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // fetch itself rejected - offline, DNS failure, CORS block, etc.
    throw new AiError('network', 'Could not reach OpenAI. Check your internet connection and try again.');
  }

  if (res.status === 401) throw new AiError('auth', 'OpenAI rejected the API key.');
  if (res.status === 429) throw new AiError('rate', 'OpenAI is rate-limiting requests right now.');
  if (!res.ok) throw new AiError('network', `OpenAI request failed with status ${res.status}.`);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new AiError('bad-response', "OpenAI's response body could not be read as JSON.");
  }

  const content = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new AiError('bad-response', "OpenAI's response did not have the expected shape.");
  }
  return content;
}

// response_format json_object - OpenAI guarantees the content string is
// valid JSON when this is set, but we still guard the parse in case a model
// that doesn't honour the setting is configured (e.g. a custom/older model).
export async function chatJSON(opts: {
  key: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<unknown> {
  const content = await postChat(opts.key, {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    response_format: { type: 'json_object' },
    max_tokens: opts.maxTokens,
  });
  try {
    return JSON.parse(content);
  } catch {
    throw new AiError('bad-response', 'OpenAI returned text that was not valid JSON.');
  }
}

// Plain-text chat, used by the Ask-a-question feature (Task 10) - no
// response_format, and the caller supplies the running conversation turns.
export async function chatText(opts: {
  key: string;
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}): Promise<string> {
  return postChat(opts.key, {
    model: opts.model,
    messages: [{ role: 'system', content: opts.system }, ...opts.messages],
  });
}
