import rawWords from '../data/google-10000-english-master/google-10000-english-usa-no-swears.txt?raw';
import rawGlosses from '../data/en-uz.tsv?raw';

export type WordBand = 'all' | 'short' | 'medium' | 'long';

function parseWords(raw: string) {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const word = line.trim().toLowerCase();
    if (!word || seen.has(word) || !/^[a-z]+$/.test(word)) {
      continue;
    }
    seen.add(word);
    words.push(word);
  }
  return words;
}

// Frequency-ordered US English list from the Google Web Trillion Word Corpus
// (via Peter Norvig). The swear-word subset is left out.
export const ENGLISH_WORDS = parseWords(rawWords);

const UZBEK = new Map<string, string>();
for (const line of rawGlosses.split(/\r?\n/)) {
  const tab = line.indexOf('\t');
  if (tab <= 0) {
    continue;
  }
  const word = line.slice(0, tab).trim().toLowerCase();
  const gloss = line.slice(tab + 1).trim();
  if (word && gloss) {
    UZBEK.set(word, gloss);
  }
}

export function uzbekFor(word: string) {
  return UZBEK.get(word.trim().toLowerCase());
}

export function formatEntry(word: string) {
  const gloss = uzbekFor(word);
  return gloss ? `${word} | ${gloss}` : word;
}

export const WORD_BANDS: { id: WordBand; label: string; hint: string }[] = [
  { id: 'short', label: 'Qisqa', hint: '1–4' },
  { id: 'medium', label: "O'rta", hint: '5–8' },
  { id: 'long', label: 'Uzun', hint: '9+' },
  { id: 'all', label: 'Hammasi', hint: '10k' },
];

const byBand: Record<WordBand, readonly string[]> = {
  all: ENGLISH_WORDS,
  short: ENGLISH_WORDS.filter((word) => word.length <= 4),
  medium: ENGLISH_WORDS.filter((word) => word.length >= 5 && word.length <= 8),
  long: ENGLISH_WORDS.filter((word) => word.length >= 9),
};

export function bandSize(band: WordBand) {
  return byBand[band].length;
}

export function nextWords(band: WordBand, offset: number, count: number) {
  const list = byBand[band];
  if (!list.length) {
    return { words: [] as string[], nextOffset: 0 };
  }

  const start = ((offset % list.length) + list.length) % list.length;
  const words: string[] = [];
  const take = Math.min(count, list.length);
  for (let index = 0; index < take; index += 1) {
    words.push(list[(start + index) % list.length]);
  }

  return { words, nextOffset: (start + words.length) % list.length };
}

export function randomWords(band: WordBand, count: number) {
  const list = [...byBand[band]];
  const take = Math.min(count, list.length);
  for (let index = 0; index < take; index += 1) {
    const swap = index + Math.floor(Math.random() * (list.length - index));
    const current = list[index];
    list[index] = list[swap];
    list[swap] = current;
  }
  return list.slice(0, take);
}

export function searchWords(band: WordBand, query: string, limit = 8) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) {
    return [];
  }

  const starts: string[] = [];
  const contains: string[] = [];
  for (const word of byBand[band]) {
    if (word.startsWith(needle)) {
      starts.push(word);
    } else if (starts.length < limit && word.includes(needle)) {
      contains.push(word);
    }
    if (starts.length >= limit) {
      break;
    }
  }

  return [...starts, ...contains].slice(0, limit);
}
