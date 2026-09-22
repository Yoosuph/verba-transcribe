import React, { useState, useEffect } from 'react';
import { X, UserCheck, Users } from 'lucide-react';

interface SpeakerManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  speakers: string[];
  onRenameSpeaker: (oldName: string, newName: string) => void;
  targetSpeaker?: string;
  /** Optional segment counts per speaker for the roster display. */
  speakerCounts?: Record<string, number>;
}

export const SpeakerManagerModal: React.FC<SpeakerManagerModalProps> = ({
  isOpen,
  onClose,
  speakers,
  onRenameSpeaker,
  targetSpeaker = '',
  speakerCounts,
}) => {
  const [selectedSpeaker, setSelectedSpeaker] = useState(targetSpeaker || (speakers[0] || ''));
  const [newName, setNewName] = useState('');

  // Re-sync selection whenever the modal opens (or is retargeted)
  useEffect(() => {
    if (isOpen) {
      const initial =
        targetSpeaker && speakers.includes(targetSpeaker)
          ? targetSpeaker
          : speakers[0] || '';
      setSelectedSpeaker(initial);
      setNewName('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, targetSpeaker]);

  // Escape closes the modal
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSpeaker && newName.trim()) {
      onRenameSpeaker(selectedSpeaker, newName.trim());
      setNewName('');
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rename speaker"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-[#0a140f] border border-emerald-500/30 rounded-3xl shadow-2xl p-5 ring-1 ring-white/10"
      >
        <div className="flex items-center justify-between pb-3 border-b border-emerald-500/20 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#008751]/20 text-emerald-300 border border-[#008751]/30">
              <Users className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white">
              Rename Speaker
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-emerald-950/50 rounded-lg transition-colors touch-press"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Roster: all detected speakers with their segment counts */}
          {speakers.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-emerald-300 mb-1.5">
                Speaker Roster
              </label>
              <div className="flex flex-wrap gap-1.5">
                {speakers.map((spk) => {
                  const count = speakerCounts?.[spk];
                  const active = spk === selectedSpeaker;
                  return (
                    <button
                      key={spk}
                      type="button"
                      onClick={() => {
                        setSelectedSpeaker(spk);
                        setNewName('');
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer active:scale-95 ${
                        active
                          ? 'bg-[#008751] text-white border-[#008751] shadow-sm'
                          : 'bg-[#050c08] text-emerald-200 border-emerald-500/25 hover:border-emerald-400'
                      }`}
                      title={count !== undefined ? `${count} segments` : spk}
                    >
                      <Users className="w-3 h-3" />
                      <span className="truncate max-w-[110px]">{spk}</span>
                      {count !== undefined && (
                        <span className={`text-[10px] tabular-nums ${active ? 'text-white/80' : 'text-emerald-400'}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-emerald-300 mb-1">
              Select Speaker
            </label>
            <select
              value={selectedSpeaker}
              onChange={(e) => setSelectedSpeaker(e.target.value)}
              className="w-full px-3 py-2 bg-[#050c08] border border-emerald-500/20 rounded-xl text-xs text-white outline-none focus:border-emerald-400"
            >
              {speakers.map((spk) => (
                <option key={spk} value={spk}>
                  {spk}
                  {speakerCounts?.[spk] !== undefined ? ` (${speakerCounts[spk]})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-emerald-300 mb-1">
              Custom Name
            </label>
            <input
              type="text"
              placeholder="e.g. Yusuf or Ahmed (Lead)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 bg-[#050c08] border border-emerald-500/20 rounded-xl text-xs text-white placeholder:text-slate-600 outline-none focus:border-emerald-400"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-emerald-950/40 rounded-xl transition-colors touch-press"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newName.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#008751] hover:bg-[#009b5d] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-emerald-950 touch-press"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
