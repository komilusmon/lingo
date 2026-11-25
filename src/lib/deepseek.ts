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
  sentenceUz?: string;
  answer: string;
  hint: string;
  explanation?: string;
}

export interface GenerateDrillPayload {
  level: Level;
  items: DeepSeekRequestItem[];
}

type SentenceFrame = (term: string, gloss: string) => { en: string; uz: string };

const FRAMES: Record<Level, Record<'word' | 'phrase', SentenceFrame[]>> = {
  A2: {
    word: [
      (term, gloss) => ({
        en: `I want to learn ${term}.`,
        uz: `Men ${gloss} ni o‘rganmoqchiman.`,
      }),
      (term, gloss) => ({
        en: `We need ${term} today.`,
        uz: `Bugun bizga ${gloss} kerak.`,
      }),
      (term, gloss) => ({
        en: `She said ${term} yesterday.`,
        uz: `U kecha ${gloss} dedi.`,
      }),
      (term, gloss) => ({
        en: `This lesson is about ${term}.`,
        uz: `Bu dars ${gloss} haqida.`,
      }),
    ],
    phrase: [
      (term, gloss) => ({
        en: `I want to learn "${term}".`,
        uz: `Men "${gloss}" ni o‘rganmoqchiman.`,
      }),
      (term, gloss) => ({
        en: `We need "${term}" today.`,
        uz: `Bugun bizga "${gloss}" kerak.`,
      }),
      (term, gloss) => ({
        en: `She said "${term}" yesterday.`,
        uz: `U kecha "${gloss}" dedi.`,
      }),
      (term, gloss) => ({
        en: `This lesson is about "${term}".`,
        uz: `Bu dars "${gloss}" haqida.`,
      }),
    ],
  },
  B1: {
    word: [
      (term, gloss) => ({
        en: `People use ${term} when they talk about everyday life.`,
        uz: `Odamlar kundalik hayot haqida gapirganda ${gloss} ishlatishadi.`,
      }),
      (term, gloss) => ({
        en: `The teacher explained ${term} with a simple example.`,
        uz: `O‘qituvchi ${gloss} ni oddiy misol bilan tushuntirdi.`,
      }),
      (term, gloss) => ({
        en: `You will see ${term} in short texts.`,
        uz: `Qisqa matnlarda ${gloss} ni ko‘rasiz.`,
      }),
      (term, gloss) => ({
        en: `I understood ${term} after I heard it in a sentence.`,
        uz: `Men ${gloss} ni gap ichida eshitgach tushundim.`,
      }),
    ],
    phrase: [
      (term, gloss) => ({
        en: `People use "${term}" when they talk about everyday life.`,
        uz: `Odamlar kundalik hayot haqida gapirganda "${gloss}" ishlatishadi.`,
      }),
      (term, gloss) => ({
        en: `The teacher explained "${term}" with a simple example.`,
        uz: `O‘qituvchi "${gloss}" ni oddiy misol bilan tushuntirdi.`,
      }),
      (term, gloss) => ({
        en: `You will see "${term}" in short texts.`,
        uz: `Qisqa matnlarda "${gloss}" ni ko‘rasiz.`,
      }),
      (term, gloss) => ({
        en: `I understood "${term}" after I heard it in a sentence.`,
        uz: `Men "${gloss}" ni gap ichida eshitgach tushundim.`,
      }),
    ],
  },
  B2: {
    word: [
      (term, gloss) => ({
        en: `Writers choose ${term} when they need a precise meaning.`,
        uz: `Yozuvchilar aniq ma’no kerak bo‘lganda ${gloss} ni tanlashadi.`,
      }),
      (term, gloss) => ({
        en: `In a longer discussion, ${term} can change the idea.`,
        uz: `Uzunroq suhbatda ${gloss} fikrni o‘zgartirishi mumkin.`,
      }),
      (term, gloss) => ({
        en: `A careful reader notices ${term} in the text.`,
        uz: `Diqqatli o‘quvchi matndagi ${gloss} ni sezadi.`,
      }),
      (term, gloss) => ({
        en: `The sentence uses ${term} to make the meaning clear.`,
        uz: `Gap ma’noni ochish uchun ${gloss} ni ishlatadi.`,
      }),
    ],
    phrase: [
      (term, gloss) => ({
        en: `Writers choose "${term}" when they need a precise meaning.`,
        uz: `Yozuvchilar aniq ma’no kerak bo‘lganda "${gloss}" ni tanlashadi.`,
      }),
      (term, gloss) => ({
        en: `In a longer discussion, "${term}" can change the idea.`,
        uz: `Uzunroq suhbatda "${gloss}" fikrni o‘zgartirishi mumkin.`,
      }),
      (term, gloss) => ({
        en: `A careful reader notices "${term}" in the text.`,
        uz: `Diqqatli o‘quvchi matndagi "${gloss}" ni sezadi.`,
      }),
      (term, gloss) => ({
        en: `The sentence uses "${term}" to make the meaning clear.`,
        uz: `Gap ma’noni ochish uchun "${gloss}" ni ishlatadi.`,
      }),
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

function buildSentence(term: string, type: 'word' | 'phrase', level: Level, gloss: string) {
  const frames = FRAMES[level][type];
  const frame = frames[pickIndex(`${level}:${type}:${term}`, frames.length)];
  return frame(term, gloss);
}

export async function generateDrills(payload: GenerateDrillPayload): Promise<DeepSeekResponseItem[]> {
  return payload.items.map((item) => {
    const term = item.term.trim();
    const gloss = item.translation?.trim() || term;
    const pair = buildSentence(term, item.type, payload.level, gloss);
    const sentence = replaceTargetWithBlank(pair.en, term);
    const hint = item.translation?.trim() || 'Fill in the missing word or phrase.';

    return {
      id: item.id,
      term,
      type: item.type,
      sentence,
      blankedSentence: sentence,
      sentenceUz: pair.uz,
      answer: normalizeAnswer(term),
      hint,
      explanation: hint,
    };
  });
}

export function normalizeDrillAnswer(value: string) {
  return normalizeAnswer(value);
}
