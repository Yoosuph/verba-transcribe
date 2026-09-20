import React, { useState } from 'react';
import { Download, ChevronDown, FileCode, FileText } from 'lucide-react';
import type { SessionStatus } from '../../types/transcription';

interface HeaderProps {
  status: SessionStatus;
  hasTranscript: boolean;
  onExport: (format: 'markdown' | 'txt' | 'json') => void;
}

export const Header: React.FC<HeaderProps> = ({ status, hasTranscript, onExport }) => {
  const [isExportOpen, setIsExportOpen] = useState(false);

  return (
    <header className="w-full bg-[#060d09]/90 border-b border-emerald-500/15 sticky top-0 z-40 backdrop-blur-xl">
      <div className="max-w-md sm:max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2.5">
          {/* Nigerian Green & White Symbol (Minimalist Emblem) */}
          <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-[#008751] via-white to-[#008751] p-[2px] shadow-md shadow-emerald-950">
            <div className="w-full h-full bg-[#08120d] rounded-[10px] flex items-center justify-center">
              <span className="font-bold text-xs tracking-wider text-emerald-400">V</span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-bold tracking-tight text-white">
                Verba
              </h1>
              <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                LIVE
              </span>
            </div>
            <p className="text-[10px] text-emerald-200/60 leading-none">
              Real-Time Speech & Meeting Intelligence
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Status Indicator Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#0e1a13] border border-emerald-500/20">
            <span className={`w-2 h-2 rounded-full ${
              status === 'recording' ? 'bg-rose-500 animate-ping' :
              status === 'processing' ? 'bg-amber-400 animate-pulse' :
              status === 'complete' ? 'bg-emerald-400' : 'bg-slate-600'
            }`} />
            <span className="capitalize text-slate-300">
              {status === 'recording' ? 'Live' : status}
            </span>
          </div>

          {/* Export Button */}
          {hasTranscript && (
            <div className="relative">
              <button
                onClick={() => setIsExportOpen(!isExportOpen)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0e1a13] hover:bg-[#15271d] active:scale-95 text-[11px] font-semibold text-white border border-emerald-500/25 transition-all shadow"
              >
                <Download className="w-3 h-3 text-emerald-400" />
                <span>Export</span>
                <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
              </button>

              {isExportOpen && (
                <div
                  className="absolute right-0 mt-2 w-44 bg-[#0d1812] border border-emerald-500/20 rounded-xl shadow-2xl p-1 z-50 animate-fade-in"
                  onMouseLeave={() => setIsExportOpen(false)}
                >
                  <button
                    onClick={() => {
                      onExport('markdown');
                      setIsExportOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:text-white hover:bg-emerald-950/50 rounded-lg text-left transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Markdown Report</span>
                  </button>

                  <button
                    onClick={() => {
                      onExport('txt');
                      setIsExportOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:text-white hover:bg-emerald-950/50 rounded-lg text-left transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>Plain Text (.txt)</span>
                  </button>

                  <button
                    onClick={() => {
                      onExport('json');
                      setIsExportOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:text-white hover:bg-emerald-950/50 rounded-lg text-left transition-colors"
                  >
                    <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                    <span>JSON Data (.json)</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
