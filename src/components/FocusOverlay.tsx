import React from 'react';

interface FocusOverlayProps {
  secondsLeft: number;
}

export function FocusOverlay({ secondsLeft }: FocusOverlayProps) {
  const inhale = secondsLeft % 8 < 4;

  return (
    <div className="fixed inset-0 z-100 bg-slate-950/95 backdrop-blur-md flex items-center justify-center pointer-events-auto">
      <div className="max-w-md w-full mx-4 rounded-3xl border border-rose-500/30 bg-slate-900/90 p-8 text-center shadow-2xl">
        <p className="text-rose-300 font-black uppercase tracking-widest text-xs">Focus Lock Active</p>
        <h2 className="mt-3 text-2xl font-black text-white">Siz fokusni buzdingiz!</h2>
        <p className="mt-2 text-slate-300">Qayta boshlash uchun kuting. Bu paytda o‘qishga qayta fokuslaning.</p>

        <div className="mt-8 flex items-center justify-center">
          <div className={`h-32 w-32 rounded-full border-4 border-indigo-400/60 shadow-[0_0_40px_rgba(99,102,241,0.35)] transition-all duration-1000 ${inhale ? 'scale-100 bg-indigo-500/25' : 'scale-75 bg-sky-500/25'}`} />
        </div>

        <div className="mt-5 text-slate-200 font-bold text-lg">
          {inhale ? 'Inhale' : 'Exhale'}
        </div>

        <div className="mt-4 text-4xl font-black text-amber-300">{secondsLeft}s</div>
        <p className="mt-2 text-xs uppercase tracking-widest text-slate-500">Mouse/keyboard vaqtincha bloklangan</p>
      </div>
    </div>
  );
}
