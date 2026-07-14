// Lightweight lexicon-based sentiment fallback for free-text comments, used
// when no AI summary is available. Deliberately simple and fully
// deterministic: lowercase, split into words, exact-word lexicon lookup - no
// stemming ("easier" does not match "easy") and no negation handling ("not
// good" still counts "good") are known limitations of this fallback, not
// bugs; it's a rough signal, not a claim of NLP accuracy.
export type Sentiment = 'pos' | 'neg' | 'neu';

const POS_WORDS = new Set([
  'good', 'great', 'love', 'loved', 'excellent', 'helpful', 'supportive', 'happy', 'clear', 'easy',
  'improved', 'improve', 'improvement', 'positive', 'wonderful', 'fantastic', 'nice', 'enjoy', 'enjoyed',
  'enjoyable', 'appreciate', 'appreciated', 'effective', 'efficient', 'productive', 'focused', 'flexible',
  'flexibility', 'resolved', 'quickly', 'better', 'best', 'smooth', 'engaging', 'genuinely', 'satisfied',
  'pleasant', 'useful', 'welcoming', 'friendly',
]);

const NEG_WORDS = new Set([
  'bad', 'poor', 'hate', 'hated', 'slow', 'confusing', 'stressful', 'stress', 'unhappy', 'difficult',
  'lack', 'lacking', 'never', 'broken', 'worse', 'worst', 'frustrating', 'frustrated', 'annoying',
  'annoyed', 'delay', 'delayed', 'clunky', 'cluttered', 'noisy', 'distracting', 'unclear', 'unreliable',
  'inconsistent', 'disorganised', 'disorganized', 'complicated', 'tedious', 'outdated', 'limited',
  'insufficient', 'negative', 'disappointing', 'disappointed', 'unsupported',
]);

// Words: letters/digits/apostrophes; everything else (punctuation, brackets
// around a pii placeholder like "[email]") is a separator.
const WORD_REGEX = /[\p{L}\p{N}']+/gu;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(WORD_REGEX) ?? [];
}

export function scoreSentiment(text: string): Sentiment {
  let pos = 0;
  let neg = 0;
  for (const word of tokenize(text)) {
    if (POS_WORDS.has(word)) pos++;
    else if (NEG_WORDS.has(word)) neg++;
  }
  if (pos > neg) return 'pos';
  if (neg > pos) return 'neg';
  return 'neu';
}

export function sentimentCounts(comments: string[]): { pos: number; neg: number; neu: number } {
  const counts = { pos: 0, neg: 0, neu: 0 };
  for (const comment of comments) counts[scoreSentiment(comment)]++;
  return counts;
}
