import React from 'react';

interface GameStatsProps {
  username?: string;
  xp?: number;
  streak?: number;
}

export function GameStats({ username = 'Player 1', xp = 450, streak = 3 }: GameStatsProps) {
  const currentLevel = Math.floor(xp / 1000) + 1;
  const xpProgress = (xp % 1000) / 10;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between p-5 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl gap-4 hover:border-slate-700 transition-colors">
      {/* User Profile & XP */}
      <div className="flex items-center gap-4 w-full sm:w-auto">
        <div className="w-14 h-14 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-[0_0_20px_rgba(79,70,229,0.5)] transform -rotate-3 hover:rotate-0 transition-transform">
          {currentLevel}
          <span className="text-[10px] absolute -top-2 -right-2 bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 shadow-sm border border-slate-700">LVL</span>
        </div>
        <div className="flex-1 sm:flex-none">
          <h3 className="text-white font-bold text-lg mb-1">{username}</h3>
          <div className="flex items-center gap-3">
            <div className="w-32 sm:w-48 h-2 bg-slate-950 shadow-inner rounded-full overflow-hidden relative border border-slate-800/50">
              <div 
                className="absolute top-0 left-0 h-full bg-linear-to-r from-indigo-600 to-blue-400 rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${xpProgress}%` }}
              />
            </div>
            <span className="text-xs font-mono text-slate-400 font-medium">{xp} <span className="opacity-50">XP</span></span>
          </div>
        </div>
      </div>
      
      {/* Streak Counter */}
      <div className="flex items-center gap-3 px-4 py-2 bg-orange-950/20 border border-orange-900/30 rounded-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/10 blur-xl group-hover:bg-orange-500/20 transition-colors" />
        <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(249,115,22,0.4)] animate-pulse">🔥</span>
        <div className="flex flex-col">
          <span className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-br from-orange-400 to-rose-500 uppercase tracking-wider">
            {streak} Day Streak
          </span>
          <span className="text-[10px] text-orange-200/50 uppercase tracking-widest font-semibold">+50% Bonus XP</span>
        </div>
      </div>
    </div>
  );
}
