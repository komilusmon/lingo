import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Dices, ListPlus, Send, Sparkles, Trash2, Volume2 } from 'lucide-react';
import { FocusOverlay } from './FocusOverlay';
import { generateDrills, normalizeDrillAnswer } from '../lib/deepseek';
import { flushQueue, syncNowOrQueue } from '../api/supabaseService';
import { bandSize, formatEntry, nextWords, randomWords, searchWords, uzbekFor, WORD_BANDS, type WordBand } from '../lib/wordBank';
import type { DrillInput, DrillSession, Level, StudyCard } from '../lib/types';

const STORAGE_KEY = 'krasword-study-session-v3';
const WORD_OFFSET_KEY = 'krasword-wordbank-offset-v1';
const MAX_ITEMS = 30;
const LEVELS: Level[] = ['A2', 'B1', 'B2'];
const DEFAULT_LINES = [
  'innovate | ixtiro qilmoq',
  'beautiful | chiroyli',
  'take part | ishtirok etmoq',
  'daily routine | kundalik odat',
];

type ParsedInput = {
  term: string;
  translation?: string;
};

function createId() {
  return crypto.randomUUID();
}

function detectType(term: string): 'word' | 'phrase' {
  return term.trim().includes(' ') ? 'phrase' : 'word';
}

function parseLine(line: string): ParsedInput | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const separators = ['|', '-', '=', ':', '/'];
  for (const separator of separators) {
    const index = trimmed.indexOf(separator);
    if (index > 0) {
      const term = trimmed.slice(0, index).trim();
      const translation = trimmed.slice(index + 1).trim();
      if (term) {
        return { term, translation: translation || undefined };
      }
    }
  }

  return { term: trimmed };
}

function parseInput(text: string): ParsedInput[] {
  return text
    .split(/\r?\n|,/)
    .map(parseLine)
    .filter((item): item is ParsedInput => Boolean(item))
    .slice(0, MAX_ITEMS);
}

function normalizeCard(card: Partial<StudyCard> & { id: string; term: string; level: Level; type: 'word' | 'phrase'; sentence: string; blankedSentence: string; answer: string; hint: string; }): StudyCard {
  return {
    ...card,
    translation: card.translation ?? '',
    definitionEn: card.definitionEn ?? card.hint,
    clueSynonyms: card.clueSynonyms ?? [],
    status: card.status ?? 'new',
    nextReviewAt: card.nextReviewAt ?? new Date().toISOString(),
    attempts: card.attempts ?? 0,
    correctStreak: card.correctStreak ?? 0,
    intervalDays: card.intervalDays ?? 0,
    mastery: typeof card.mastery === 'number' ? card.mastery : 0,
    isSolved: card.isSolved ?? false,
    translationRevealCount: card.translationRevealCount ?? 0,
  };
}

function normalizeSession(raw: DrillSession | null): DrillSession | null {
  if (!raw) {
    return null;
  }

  return {
    ...raw,
    xpBalance: raw.xpBalance ?? 0,
    items: (raw.items ?? []).map((item) => normalizeCard(item)),
  };
}

function loadSavedSession(): DrillSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw) as DrillSession);
  } catch {
    return null;
  }
}

function saveSession(session: DrillSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function getInitialInput(session: DrillSession | null) {
  if (session?.items?.length) {
    return session.items.map((item) => `${item.term}${item.translation ? ` | ${item.translation}` : ''}`).join('\n');
  }
  return DEFAULT_LINES.join('\n');
}

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

function nextUnsolvedCardId(cards: StudyCard[]) {
  return cards.find((card) => !card.isSolved)?.id ?? cards[0]?.id ?? null;
}

function loadWordOffsets(): Record<WordBand, number> {
  const empty: Record<WordBand, number> = { all: 0, short: 0, medium: 0, long: 0 };
  try {
    const raw = localStorage.getItem(WORD_OFFSET_KEY);
    if (!raw) {
      return empty;
    }
    const parsed = JSON.parse(raw) as Partial<Record<WordBand, number>>;
    return {
      all: parsed.all ?? 0,
      short: parsed.short ?? 0,
      medium: parsed.medium ?? 0,
      long: parsed.long ?? 0,
    };
  } catch {
    return empty;
  }
}

export function StudyDrill() {
  const saved = useMemo(() => loadSavedSession(), []);

  const [level, setLevel] = useState<Level>(saved?.level ?? 'B1');
  const [inputText, setInputText] = useState(getInitialInput(saved));
  const [session, setSession] = useState<DrillSession | null>(saved);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(true);
  const [wordBand, setWordBand] = useState<WordBand>('medium');
  const [wordQuery, setWordQuery] = useState('');
  const [wordOffsets, setWordOffsets] = useState(loadWordOffsets);

  const [consecutiveViolations, setConsecutiveViolations] = useState(0);
  const [penaltyActive, setPenaltyActive] = useState(false);
  const [lockUntilMs, setLockUntilMs] = useState<number | null>(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);

  const hiddenTimeoutRef = useRef<number | null>(null);
  const answerInputRef = useRef<HTMLInputElement>(null);

  const cards = session?.items ?? [];
  const activeCardId = useMemo(() => nextUnsolvedCardId(cards), [cards]);
  const activeCard = useMemo(() => cards.find((card) => card.id === activeCardId) ?? null, [cards, activeCardId]);

  const parsedInput = useMemo(() => parseInput(inputText), [inputText]);
  const wordMatches = useMemo(() => searchWords(wordBand, wordQuery), [wordBand, wordQuery]);
  const isLocked = penaltyActive && lockSecondsLeft > 0;

  useEffect(() => {
    if (!activeCardId || isLocked) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      answerInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCardId, isLocked]);

  const solvedCount = cards.filter((card) => card.isSolved).length;
  const progress = cards.length ? Math.round((solvedCount / cards.length) * 100) : 0;

  useEffect(() => {
    if (!session) return;
    saveSession(session);
  }, [session]);

  useEffect(() => {
    const handleOnline = () => {
      void flushQueue();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!session || !isFocusMode || session.status === 'completed') {
        return;
      }

      if (document.hidden) {
        hiddenTimeoutRef.current = window.setTimeout(() => {
          if (!document.hidden) {
            return;
          }

          setConsecutiveViolations((previous) => {
            const next = previous + 1;
            const lockSeconds = 15 * next;
            const lockUntil = Date.now() + lockSeconds * 1000;
            setPenaltyActive(true);
            setLockUntilMs(lockUntil);
            setLockSecondsLeft(lockSeconds);

            setSession((current) => {
              if (!current) return current;
              const updated: DrillSession = {
                ...current,
                xpBalance: Math.max(0, current.xpBalance - 10),
              };
              void syncNowOrQueue(updated, 'penalty', -10);
              return updated;
            });

            return next;
          });
        }, 2000);
      } else if (hiddenTimeoutRef.current) {
        window.clearTimeout(hiddenTimeoutRef.current);
        hiddenTimeoutRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (hiddenTimeoutRef.current) {
        window.clearTimeout(hiddenTimeoutRef.current);
        hiddenTimeoutRef.current = null;
      }
    };
  }, [isFocusMode, session]);

  useEffect(() => {
    if (!penaltyActive || !lockUntilMs) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockUntilMs - Date.now()) / 1000));
      setLockSecondsLeft(remaining);

      if (remaining <= 0) {
        setPenaltyActive(false);
        setLockUntilMs(null);
      }
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [penaltyActive, lockUntilMs]);

  useEffect(() => {
    if (!isLocked) {
      return;
    }

    const blockInteraction = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', blockInteraction, true);
    window.addEventListener('mousedown', blockInteraction, true);
    window.addEventListener('touchstart', blockInteraction, true);

    return () => {
      window.removeEventListener('keydown', blockInteraction, true);
      window.removeEventListener('mousedown', blockInteraction, true);
      window.removeEventListener('touchstart', blockInteraction, true);
    };
  }, [isLocked]);

  function fillWordList(words: string[]) {
    setInputText(words.map(formatEntry).join('\n'));
    setError(null);
    setMessage(`${words.length} ta so‘z o‘zbekcha tarjimasi bilan qo‘yildi.`);
  }

  function rememberWordOffset(band: WordBand, nextOffset: number) {
    setWordOffsets((current) => {
      const next = { ...current, [band]: nextOffset };
      localStorage.setItem(WORD_OFFSET_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleNextWords() {
    const batch = nextWords(wordBand, wordOffsets[wordBand], MAX_ITEMS);
    fillWordList(batch.words);
    rememberWordOffset(wordBand, batch.nextOffset);
  }

  function handleRandomWords() {
    fillWordList(randomWords(wordBand, MAX_ITEMS));
  }

  function handleAddWord(word: string) {
    const existing = parseInput(inputText);
    if (existing.some((item) => item.term.toLowerCase() === word)) {
      return;
    }
    if (existing.length >= MAX_ITEMS) {
      setError('Ro‘yxatda 30 ta so‘z bor. Bitta olib tashlang yoki yangi 30 tasini qo‘ying.');
      return;
    }
    setError(null);
    const line = formatEntry(word);
    setInputText(existing.length ? `${inputText.trim()}\n${line}` : line);
  }

  const syncSession = (nextSession: DrillSession, reason: 'session-generated' | 'answer-correct' | 'answer-wrong' | 'penalty' | 'session-completed', xpDelta = 0) => {
    void syncNowOrQueue(nextSession, reason, xpDelta);
  };

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const items = parsedInput;
      if (!items.length) {
        throw new Error('Kamida bitta so‘z yoki ibora kiriting.');
      }

      const prepared: DrillInput[] = items.map((item) => ({
        id: createId(),
        term: item.term,
        translation: item.translation,
        level,
        type: detectType(item.term),
      }));

      const generated = await generateDrills({
        level,
        items: prepared.map(({ id, term, type, translation }) => ({ id, term, type, translation })),
      });

      const generatedMap = new Map(generated.map((item) => [item.id, item]));
      const cardsToSave: StudyCard[] = prepared.map((item) => {
        const generatedItem = generatedMap.get(item.id);
        if (!generatedItem) {
          throw new Error('Karta ma’lumoti to‘liq emas.');
        }

        return normalizeCard({
          ...generatedItem,
          level,
          translation: item.translation,
          definitionEn: generatedItem.explanation || generatedItem.hint,
          clueSynonyms: generatedItem.hint
            .split(/[;,]/)
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 4),
          mastery: 0,
          isSolved: false,
          translationRevealCount: 0,
        });
      });

      const nextSession: DrillSession = {
        id: createId(),
        createdAt: new Date().toISOString(),
        level,
        status: 'generated',
        items: cardsToSave,
        correctCount: 0,
        totalCount: cardsToSave.length,
        xpBalance: 0,
      };

      setSession(nextSession);
      setAnswers({});
      setFeedback({});
      setConsecutiveViolations(0);
      syncSession(nextSession, 'session-generated', 0);
      setMessage(`${cardsToSave.length} ta karta tayyor.`);
    } catch (err) {
      const nextMessage = err instanceof Error ? err.message : 'Generatsiya bajarilmadi.';
      setError(nextMessage);
    } finally {
      setLoading(false);
    }
  }

  function completeSessionIfNeeded(nextItems: StudyCard[], baseSession: DrillSession, xpDelta = 0) {
    const solved = nextItems.filter((card) => card.isSolved).length;
    const isCompleted = solved === nextItems.length && nextItems.length > 0;

    const nextSession: DrillSession = {
      ...baseSession,
      items: nextItems,
      correctCount: solved,
      totalCount: nextItems.length,
      status: isCompleted ? 'completed' : 'generated',
    };

    if (isCompleted && consecutiveViolations > 0) {
      setConsecutiveViolations(0);
    }

    syncSession(nextSession, isCompleted ? 'session-completed' : xpDelta > 0 ? 'answer-correct' : 'answer-wrong', xpDelta);
    return nextSession;
  }

  function handleSubmit(card: StudyCard) {
    const value = normalizeDrillAnswer(answers[card.id] ?? '');
    if (!value) {
      setFeedback((current) => ({ ...current, [card.id]: 'Javob yozing.' }));
      return;
    }

    const isCorrect = value === card.answer;
    if (!session) {
      return;
    }

    if (!isCorrect) {
      setFeedback((current) => ({ ...current, [card.id]: 'Noto‘g‘ri. Qayta yozing va Enter bosing.' }));
      const nextItems = session.items.map((item) => item.id === card.id ? { ...item, attempts: item.attempts + 1, mastery: Math.max(0, item.mastery - 5), status: 'mistake' as const } : item);
      const nextSession = completeSessionIfNeeded(nextItems, session, 0);
      setSession(nextSession);
      window.requestAnimationFrame(() => {
        answerInputRef.current?.focus();
        answerInputRef.current?.select();
      });
      return;
    }

    speak(card.term);
    setFeedback((current) => ({ ...current, [card.id]: 'To‘g‘ri! Endi keyingi kartaga o‘ting.' }));

    const nextItems = session.items.map((item) => {
      if (item.id !== card.id) return item;
      const nextMastery = Math.min(100, item.mastery + 20);
      return {
        ...item,
        attempts: item.attempts + 1,
        correctStreak: item.correctStreak + 1,
        mastery: nextMastery,
        isSolved: true,
        status: nextMastery >= 90 ? 'mastered' : 'learning',
        lastReviewedAt: new Date().toISOString(),
      };
    });

    const nextSession = completeSessionIfNeeded(nextItems, { ...session, xpBalance: session.xpBalance + 10 }, 10);
    setSession(nextSession);
    setAnswers((current) => ({ ...current, [card.id]: card.answer }));
  }

  function resetSession() {
    setSession(null);
    setAnswers({});
    setFeedback({});
    setMessage(null);
    setConsecutiveViolations(0);
    localStorage.removeItem(STORAGE_KEY);
  }

  const cardsToRender = (isFocusMode || isLocked) ? (activeCard ? [activeCard] : []) : cards;

  return (
    <div className="space-y-6">
      {isLocked ? <FocusOverlay secondsLeft={lockSecondsLeft} /> : null}

      <div className="grid xl:grid-cols-3 gap-6">
        <section className="xl:col-span-1 space-y-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-sm">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-amber-300">
              <Sparkles className="h-4 w-4" />
              Hardcore focus trainer
            </div>
            <h2 className="text-2xl font-black text-white">Typing-only memorization</h2>
            <p className="mt-2 text-sm text-slate-400">
              Focus buzilsa penalti beriladi. Kartadan o‘tish uchun faqat to‘g‘ri yozish kerak.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLevel(item)}
                className={`rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${level === item ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'}`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 p-3">
            <span className="text-xs uppercase tracking-widest text-slate-400">Focus mode</span>
            <button
              type="button"
              onClick={() => setIsFocusMode((current) => !current)}
              className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${isFocusMode ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}
            >
              {isFocusMode ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">10 000 so‘z</span>
              <span className="text-xs text-slate-500">{bandSize(wordBand).toLocaleString()} ta</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {WORD_BANDS.map((band) => (
                <button
                  key={band.id}
                  type="button"
                  onClick={() => setWordBand(band.id)}
                  className={`rounded-xl border px-2 py-2 text-xs font-bold transition-colors ${wordBand === band.id ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'}`}
                >
                  <span className="block">{band.label}</span>
                  <span className={`block text-[10px] font-medium ${wordBand === band.id ? 'text-indigo-100' : 'text-slate-500'}`}>{band.hint}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleNextWords}
                disabled={isLocked}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:border-slate-700 disabled:opacity-60"
              >
                <ListPlus className="h-3.5 w-3.5" />
                Keyingi 30
              </button>
              <button
                type="button"
                onClick={handleRandomWords}
                disabled={isLocked}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:border-slate-700 disabled:opacity-60"
              >
                <Dices className="h-3.5 w-3.5" />
                Tasodifiy 30
              </button>
            </div>
            <input
              value={wordQuery}
              onChange={(event) => setWordQuery(event.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-indigo-500/60"
              placeholder="So‘z qidirish"
            />
            {wordMatches.length ? (
              <div className="flex flex-wrap gap-2">
                {wordMatches.map((word) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => handleAddWord(word)}
                    className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-bold text-slate-200 hover:border-indigo-400"
                  >
                    {uzbekFor(word) ? `${word} · ${uzbekFor(word)}` : word}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Input</label>
            <textarea
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              rows={12}
              className="w-full resize-none rounded-2xl border border-slate-800 bg-slate-950 p-4 text-slate-100 outline-none transition-colors focus:border-indigo-500/60"
              placeholder="word | translation"
            />
            <div className="mt-2 text-xs text-slate-500">{parsedInput.length}/{MAX_ITEMS} item</div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || isLocked}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {loading ? 'Yaratilmoqda...' : 'Kartalar yaratish'}
            </button>
            <button
              type="button"
              onClick={resetSession}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-3 text-sm font-bold text-slate-300 hover:border-slate-700"
            >
              <Trash2 className="h-4 w-4" />
              Reset
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">XP</div>
              <div className="mt-2 text-2xl font-black text-white">{session?.xpBalance ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">Solved</div>
              <div className="mt-2 text-2xl font-black text-emerald-300">{solvedCount}/{cards.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">Violations</div>
              <div className="mt-2 text-2xl font-black text-rose-300">{consecutiveViolations}</div>
            </div>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950">
            <div className="h-full rounded-full bg-linear-to-r from-indigo-500 to-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>

          {error ? (
            <div className="flex gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-200">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {message ? (
            <div className="flex gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-sm text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{message}</span>
            </div>
          ) : null}
        </section>

        <section className="xl:col-span-2 space-y-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-sm">
          <div>
            <h3 className="text-xl font-black text-white">Strict typing session</h3>
            <p className="text-sm text-slate-400">
              {isFocusMode ? 'Yozing va Enter bosing. Keyingi kartaga o‘zi o‘tadi.' : 'Normal mode: review controls available.'}
            </p>
          </div>

          {session && cardsToRender.length ? (
            <div className="space-y-4">
              {cardsToRender.map((card) => {
                const userAnswer = answers[card.id] ?? '';
                const normalized = normalizeDrillAnswer(userAnswer);
                const isCorrect = normalized === card.answer;

                return (
                  <article key={card.id} className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-2xl font-black text-white">{card.term}</h4>
                          {card.translation ? <p className="mt-1 text-sm text-sky-300">{card.translation}</p> : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => speak(`${card.term}. ${card.sentence.replace('____', card.term)}`)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-black uppercase tracking-widest text-slate-300 hover:border-slate-700"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          Speak
                        </button>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                        <p className="text-lg text-slate-100">{card.blankedSentence}</p>
                        {card.sentenceUz ? <p className="mt-2 text-base text-sky-200">{card.sentenceUz}</p> : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                        <input
                          ref={card.id === activeCardId ? answerInputRef : undefined}
                          value={userAnswer}
                          onChange={(event) => setAnswers((current) => ({ ...current, [card.id]: event.target.value }))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleSubmit(card);
                            }
                          }}
                          disabled={isLocked}
                          autoFocus={card.id === activeCardId}
                          className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-indigo-500/60 disabled:opacity-60"
                          placeholder="So‘zni yozing, Enter bosing"
                        />
                        <button
                          type="button"
                          onClick={() => handleSubmit(card)}
                          disabled={isLocked}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                        >
                          Submit
                        </button>
                      </div>

                      {(!isFocusMode && !isLocked) ? (
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-400">
                            Review controls hidden in focus/lock mode
                          </span>
                        </div>
                      ) : null}

                      {feedback[card.id] ? (
                        <div className={`rounded-2xl border p-4 text-sm ${isCorrect ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-100' : 'border-slate-800 bg-slate-900/60 text-slate-300'}`}>
                          {feedback[card.id]}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-950/60 p-10 text-center text-slate-400">
              Sessiya boshlash uchun kartalarni yarating.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
