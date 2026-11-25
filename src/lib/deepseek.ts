import type { Level } from './types';

export interface DeepSeekRequestItem {
  id: string;
  term: string;
  type: 'word' | 'phrase';
  translation?: string;
}

export interface DeepSeekResponseItem {
  id: string;
  term: string;
  type: 'word' | 'phrase';
  sentence: string;
  blankedSentence: string;
  answer: string;
  hint: string;
  explanation?: string;
}

export interface GenerateDrillPayload {
  level: Level;
  items: DeepSeekRequestItem[];
}

const TEMPLATES: Record<Level, Record<'word' | 'phrase', Array<(term: string) => string>>> = {
  A2: {
    word: [
      (term) => `I know the word ${term}.`,
      (term) => `Please write ${term}.`,
      (term) => `We say ${term} at school.`,
      (term) => `This word is ${term}.`,
    ],
    phrase: [
      (term) => `I know the phrase "${term}".`,
      (term) => `Please say "${term}".`,
      (term) => `We use "${term}" at school.`,
      (term) => `This phrase is "${term}".`,
    ],
  },
  B1: {
    word: [
      (term) => `I learned the word ${term} in English class.`,
      (term) => `People often use ${term} in daily conversation.`,
      (term) => `The teacher asked us to remember ${term}.`,
      (term) => `You can hear ${term} in simple stories.`,
    ],
    phrase: [
      (term) => `I learned the phrase "${term}" in English class.`,
      (term) => `People often say "${term}" in daily conversation.`,
      (term) => `The teacher asked us to remember "${term}".`,
      (term) => `You can hear "${term}" in simple stories.`,
    ],
  },
  B2: {
    word: [
      (term) => `A careful speaker chooses the word ${term} when the meaning must be clear.`,
      (term) => `You may recognize ${term} in articles and classroom discussions.`,
      (term) => `Writers use ${term} to make an idea more precise.`,
      (term) => `During a longer talk, the word ${term} can change the meaning.`,
    ],
    phrase: [
      (term) => `A careful speaker uses the phrase "${term}" when the meaning must be clear.`,
      (term) => `You may recognize "${term}" in articles and classroom discussions.`,
      (term) => `Writers use "${term}" to make an idea more precise.`,
      (term) => `During a longer talk, the phrase "${term}" can change the meaning.`,
    ],
  },
};

function pickIndex(seed: string, length: number) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function replaceTargetWithBlank(sentence: string, target: string) {
  const escaped = target.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');
  if (regex.test(sentence)) {
    return sentence.replace(regex, '____');
  }
  return sentence.includes('____') ? sentence : `${sentence} (____)`;
}

function buildSentence(term: string, type: 'word' | 'phrase', level: Level) {
  const templates = TEMPLATES[level][type];
  const template = templates[pickIndex(`${level}:${type}:${term}`, templates.length)];
  return template(term.trim());
}

export async function generateDrills(payload: GenerateDrillPayload): Promise<DeepSeekResponseItem[]> {
  return payload.items.map((item) => {
    const term = item.term.trim();
    const sentence = replaceTargetWithBlank(buildSentence(term, item.type, payload.level), term);
    const hint = item.translation?.trim() || 'Fill in the missing word or phrase.';

    return {
      id: item.id,
      term,
      type: item.type,
      sentence,
      blankedSentence: sentence,
      answer: normalizeAnswer(term),
      hint,
      explanation: hint,
    };
  });
}

export function normalizeDrillAnswer(value: string) {
  return normalizeAnswer(value);
}
