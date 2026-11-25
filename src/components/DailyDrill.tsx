import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, CheckCircle2, CircleAlert, RotateCw, Plus, Trash2, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generateDrills, normalizeDrillAnswer } from '../lib/deepseek';
import type { DrillInput, DrillSession, GeneratedItem, Level, StudyCard } from '../lib/types';

const STORAGE_KEY = 'krasword-daily-drill-session';
const DEFAULT_LINES = [
  'innovate',
  'beautiful',
  'take part',
  'learn new words',
  'healthy',
  'carefully',
  'quiet place',
  'make progress',
  'personal goal',
  'daily routine',
];

const LEVELS: Level[] = ['A2', 'B1', 'B2'];

function createId() {
  return crypto.randomUUID();
}

function detectType(term: string): 'word' | 'phrase' {
  return term.trim().includes(' ') ? 'phrase' : 'word';
}

function clampItems(items: string[]) {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((term) => ({
      id: createId(),
      term,
      level: 'B1' as Level,
      type: detectType(term),
    }));
}

function loadSavedSession(): DrillSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DrillSession;
  } catch {
    return null;
  }
}

function saveSession(session: DrillSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function buildInitialTerms(session: DrillSession | null) {
  if (session?.items?.length) {
    return session.items.map((item) => item.term).join('\n');
  }
  return DEFAULT_LINES.join('\n');
}

async function persistToSupabase(session: DrillSession) {
  if (!supabase) return;

  const sessionPayload = {
    id: session.id,
    level: session.level,
    status: session.status,
    correct_count: session.correctCount,
    total_count: session.totalCount,
    items: session.items,
    created_at: session.createdAt,
  };

  try {
    await supabase.from('drill_sessions').upsert(sessionPayload, { onConflict: 'id' });
  } catch {
    // Keep guest mode resilient even if schema is not installed yet.
  }
}

export function DailyDrill() {
  const savedSession = useMemo(() => loadSavedSession(), []);
  const [level, setLevel] = useState<Level>(savedSession?.level ?? 'B1');
  const [termsText, setTermsText] = useState(buildInitialTerms(savedSession));
  const [session, setSession] = useState<DrillSession | null>(savedSession);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      saveSession(session);
      void persistToSupabase(session);
    }
  }, [session]);

  const inputCount = termsText
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean).length;

  const correctCount = session?.items.filter((item) => normalizeDrillAnswer(answers[item.id] ?? '') === item.answer).length ?? session?.correctCount ?? 0;
  const totalCount = session?.items.length ?? 0;
  const progress = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;
  const xp = correctCount * 100;
  const streak = correctCount > 0 ? 1 : 0;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setSavedMessage(null);

    try {
      const items = clampItems(termsText.split(/\r?\n|,/));
      if (!items.length) {
        throw new Error('Kamida bitta so‘z yoki ibora kiriting.');
      }

      const prepared = items.map((item) => ({
        ...item,
        level,
        type: detectType(item.term),
      })) as DrillInput[];

      const generated = await generateDrills({
        level,
        items: prepared.map(({ id, term, type }) => ({ id, term, type })),
      });

      const normalizedItems: StudyCard[] = generated.map((item) => ({
        id: item.id,
        term: item.term,
        type: item.type,
        level,
        sentence: item.sentence,
        blankedSentence: item.sentence,
        answer: normalizeDrillAnswer(item.answer),
        hint: item.hint,
        explanation: item.explanation,
        translation: '',
        status: 'new',
        nextReviewAt: new Date().toISOString(),
        lastReviewedAt: undefined,
        attempts: 0,
        correctStreak: 0,
        intervalDays: 0,
        mastery: 0,
        lastResult: undefined,
      }));

      const nextSession: DrillSession = {
        id: createId(),
        createdAt: new Date().toISOString(),
        level,
        status: 'generated',
        items: normalizedItems,
        correctCount: 0,
        totalCount: normalizedItems.length,
        xpBalance: 0,
      };

      setSession(nextSession);
      setAnswers({});
      setSavedMessage(`${normalizedItems.length} ta gap tayyor.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generatsiya bajarilmadi.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleCheck(item: GeneratedItem) {
    const value = normalizeDrillAnswer(answers[item.id] ?? '');
    if (!value) return;

    const isCorrect = value === item.answer;
    const updatedItems = session?.items.map((current) => {
      if (current.id !== item.id) return current;
      return {
        ...current,
        explanation: current.explanation,
      };
    }) ?? [];

    if (session) {
      const correctNow = updatedItems.filter((current) => normalizeDrillAnswer(answers[current.id] ?? '') === current.answer).length;
      setSession({
        ...session,
        items: updatedItems,
        correctCount: correctNow,
        totalCount: updatedItems.length,
        status: correctNow === updatedItems.length ? 'completed' : 'generated',
      });
    }

    setAnswers((current) => ({
      ...current,
      [item.id]: isCorrect ? item.answer : current[item.id],
    }));
  }

  function resetSession() {
    setSession(null);
    setAnswers({});
    setSavedMessage(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  function updateAnswer(id: string, value: string) {
    setAnswers((current) => ({
      ...current,
      [id]: value,
    }));
  }

  function fillAllAnswers() {
    if (!session) return;
    const next: Record<string, string> = {};
    session.items.forEach((item) => {
      next[item.id] = '';
    });
    setAnswers(next);
  }

  return (
    <div className="space-y-6">
      <div className="grid xl:grid-cols-3 gap-6">
        <section className="xl:col-span-1 bg-slate-900/70 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-sm space-y-5">
          <div>
            <div className="flex items-center gap-2 text-amber-300 uppercase tracking-[0.3em] text-xs font-black mb-2">
              <Sparkles className="w-4 h-4" />
              Daily drill generator
            </div>
            <h2 className="text-2xl font-black text-white">30 so‘z yoki ibora tayyorla</h2>
            <p className="text-sm text-slate-400 mt-2">Har bir satrga bitta so‘z yoki ibora yozing. Darajaga mos gap shu yerda tuziladi va o‘sha joy bo‘sh qoldiriladi.</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLevel(item)}
                className={`rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${level === item ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'}`}
              >
                {item}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2 block">Terms</label>
            <textarea
              value={termsText}
              onChange={(event) => setTermsText(event.target.value)}
              rows={14}
              className="w-full rounded-2xl bg-slate-950 border border-slate-800 text-slate-100 p-4 outline-none focus:border-indigo-500/60 transition-colors resize-none"
              placeholder="one word or phrase per line"
            />
            <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
              <span>{inputCount}/30 element</span>
              <span>Word yoki phrase bo‘lishi mumkin</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Generatsiya...' : 'Kartalar yaratish'}
            </button>
            <button
              type="button"
              onClick={resetSession}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-3 text-sm font-bold text-slate-300 hover:border-slate-700"
            >
              <Trash2 className="w-4 h-4" />
              Reset
            </button>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-200 flex gap-3">
              <CircleAlert className="w-5 h-5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {savedMessage ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-sm text-emerald-200 flex gap-3">
              <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
              <span>{savedMessage}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500 font-bold">Progress</div>
              <div className="text-2xl font-black text-white mt-2">{progress}%</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500 font-bold">XP</div>
              <div className="text-2xl font-black text-white mt-2">{xp}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500 font-bold">Items</div>
              <div className="text-2xl font-black text-white mt-2">{session?.items.length ?? 0}</div>
            </div>
          </div>
        </section>

        <section className="xl:col-span-2 bg-slate-900/70 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-white">Bugungi mashq</h3>
              <p className="text-sm text-slate-400">Har bir gapda faqat bitta bo‘sh joy mavjud. phrase ham bo‘lishi mumkin.</p>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950 px-3 py-1.5">{session?.status ?? 'draft'}</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950 px-3 py-1.5">{correctCount}/{totalCount} correct</span>
            </div>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
            <div className="h-full rounded-full bg-linear-to-r from-indigo-500 to-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>

          {session ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={fillAllAnswers} className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300 hover:border-slate-700">
                  <RotateCw className="w-4 h-4" />
                  Clear answers
                </button>
                <span className="text-xs uppercase tracking-widest text-slate-500 font-bold self-center">Supabase {supabase ? 'ready' : 'not configured'}</span>
              </div>

              <div className="grid gap-4">
                {session.items.map((item, index) => {
                  const userAnswer = answers[item.id] ?? '';
                  const isCorrect = normalizeDrillAnswer(userAnswer) === item.answer;
                  return (
                    <article key={item.id} className={`rounded-3xl border p-5 transition-colors ${isCorrect ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-slate-800 bg-slate-950/60'}`}>
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-slate-300 border border-slate-800">{index + 1}</span>
                            <div>
                              <div className="text-xs uppercase tracking-widest text-slate-500 font-bold">{item.type} • {item.level}</div>
                              <div className="text-sm text-slate-400">Hint: {item.hint}</div>
                            </div>
                          </div>
                          <span className={`text-xs font-bold uppercase tracking-widest ${isCorrect ? 'text-emerald-300' : 'text-slate-500'}`}>{isCorrect ? 'Correct' : 'Pending'}</span>
                        </div>

                        <p className="text-lg leading-relaxed text-slate-100">{item.blankedSentence}</p>

                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-center">
                          <input
                            value={userAnswer}
                            onChange={(event) => updateAnswer(item.id, event.target.value)}
                            className="w-full rounded-2xl bg-slate-900 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:border-indigo-500/60"
                            placeholder="Type the missing word or phrase"
                          />
                          <button
                            type="button"
                            onClick={() => handleCheck(item)}
                            className="rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white"
                          >
                            Check
                          </button>
                        </div>

                        {isCorrect ? (
                          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-sm text-emerald-100">
                            <div className="font-bold">Great!</div>
                            <div>Answer: {item.answer}</div>
                            {item.explanation ? <div className="mt-1 text-emerald-100/80">{item.explanation}</div> : null}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-950/60 p-10 text-center text-slate-400">
              30 tagacha so‘z yoki ibora yozing. Mos gaplar shu yerda yaratiladi.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
