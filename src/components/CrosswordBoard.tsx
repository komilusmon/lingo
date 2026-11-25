import React, { useState } from 'react';

// Reusing the Vue blueprint's CSS paradigms visually, migrated to React
interface Cell {
  letter: string;
  source?: 'me' | 'opponent';
  isCorrect?: boolean;
}

interface CrosswordBoardProps {
  grid: (Cell | null)[][];
}

export function CrosswordBoard({ grid }: CrosswordBoardProps) {
  const [activeCell, setActiveCell] = useState<{ x: number | null, y: number | null }>({ x: null, y: null });

  return (
    <div className="w-full mx-auto p-4 sm:p-8 bg-slate-950 min-h-[500px] rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col justify-center items-center backdrop-blur-sm">
      {/* Ambient Lighting */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/30 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-rose-900/10 blur-[100px] rounded-full pointer-events-none" />
      
      {/* Top Legend */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-20">
         <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
            Live Sync
         </div>
      </div>

      <div className="grid gap-1 sm:gap-2 justify-center content-center relative z-10 w-full overflow-auto p-4 sm:p-12">
        {grid.map((row, y) => (
          <div key={y} className="flex gap-1 sm:gap-2 justify-center">
            {row.map((cell, x) => {
              const isActive = activeCell.x === x && activeCell.y === y;
              
              if (!cell) {
                return (
                  <div key={`${y}-${x}`} className="w-10 h-10 sm:w-14 sm:h-14 bg-transparent border-transparent" />
                );
              }

              return (
                <div 
                  key={`${y}-${x}`}
                  onClick={() => setActiveCell({ x, y })}
                  className={`
                    w-10 h-10 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center text-xl sm:text-2xl font-black uppercase transition-all duration-200 select-none cursor-pointer
                    ${!cell.letter ? 'bg-slate-800 border-2 border-slate-700/80 hover:border-slate-500 hover:bg-slate-700/80 text-transparent shadow-inner' : ''}
                    ${isActive && !cell.isCorrect ? 'ring-4 ring-indigo-500/50 border-indigo-500 scale-[1.08] z-20 bg-slate-700 text-white' : ''}
                    ${cell.letter && !cell.source && !cell.isCorrect ? 'bg-slate-800 text-slate-200 border-2 border-slate-600' : ''}
                    ${cell.source === 'me' ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 border-2 border-indigo-400 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)] transform -translate-y-0.5' : ''}
                    ${cell.source === 'opponent' ? 'bg-rose-500/10 text-rose-300 border-2 border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)] animate-pulse' : ''}
                    ${cell.isCorrect ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 border-2 border-emerald-300 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : ''}
                  `}
                >
                  <span className={`transform transition-all ${isActive ? 'scale-110' : 'scale-100'}`}>
                    {cell.letter}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
