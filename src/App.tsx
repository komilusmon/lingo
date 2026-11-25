import { StudyDrill } from './components/StudyDrill';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 sm:p-6 overflow-x-hidden selection:bg-indigo-500/30">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.35em] text-indigo-300">Krasword</div>
            <h1 className="mt-2 text-3xl font-black text-white">Easy Vocabulary Memorizer</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">30 ta word yoki phrase kiriting, tarjimasini qo‘shing, level tanlang. Gaplar shu yerda, API kalitsiz tuziladi.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-400">
            Guest mode • Review queue • Translation support
          </div>
        </header>

        <StudyDrill />
      </div>
    </div>
  );
}
