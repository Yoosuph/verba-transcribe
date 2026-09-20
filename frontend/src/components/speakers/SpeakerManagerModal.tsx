import React, { useState } from 'react';
import { X, UserCheck, Users } from 'lucide-react';

interface SpeakerManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  speakers: string[];
  onRenameSpeaker: (oldName: string, newName: string) => void;
  targetSpeaker?: string;
}

export const SpeakerManagerModal: React.FC<SpeakerManagerModalProps> = ({
  isOpen,
  onClose,
  speakers,
  onRenameSpeaker,
  targetSpeaker = '',
}) => {
  const [selectedSpeaker, setSelectedSpeaker] = useState(targetSpeaker || (speakers[0] || ''));
  const [newName, setNewName] = useState('');

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm bg-[#0a140f] border border-emerald-500/30 rounded-3xl shadow-2xl p-5 ring-1 ring-white/10">
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
