import React, { useState, useEffect } from 'react';
import {
  X,
  Mic,
  Calendar,
  MapPin,
  User,
  Users,
  Hash,
  RotateCcw,
} from 'lucide-react';
import type { MeetingInfo } from '../../types/transcription';
import { VerbaLogo } from '../common/VerbaLogo';

interface NewMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartMeeting: (info: MeetingInfo) => void;
  onSaveMeetingInfo?: (info: MeetingInfo) => void;
  initialInfo?: Partial<MeetingInfo>;
}

const MEETING_TYPES = [
  'Team Meeting',
  'Client Call',
  'Project Review',
  'Brainstorming Session',
  'Board Meeting',
  'Interview',
  'Workshop / Training',
  'Other',
];

const QUICK_PRESETS = [
  {
    name: 'Weekly Team Sync',
    type: 'Team Meeting',
    location: 'Conference Room A',
  },
  {
    name: 'Client Kickoff Call',
    type: 'Client Call',
    location: 'Google Meet',
  },
  {
    name: 'Project Review',
    type: 'Project Review',
    location: 'Zoom',
  },
];

export const NewMeetingModal: React.FC<NewMeetingModalProps> = ({
  isOpen,
  onClose,
  onStartMeeting,
  onSaveMeetingInfo,
  initialInfo,
}) => {
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingType, setMeetingType] = useState(MEETING_TYPES[0]);
  const [location, setLocation] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [participants, setParticipants] = useState('');

  // Seed the form each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle(initialInfo?.title || '');
      setMeetingDate(
        initialInfo?.meeting_date ||
          new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      );
      setMeetingType(initialInfo?.meeting_type || MEETING_TYPES[0]);
      setLocation(initialInfo?.location || '');
      setOrganizer(initialInfo?.organizer || '');
      setParticipants((initialInfo?.participants || []).join(', '));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const buildInfo = (): MeetingInfo => ({
    title: title.trim(),
    meeting_date: meetingDate.trim(),
    meeting_type: meetingType,
    location: location.trim(),
    organizer: organizer.trim(),
    participants: participants
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
  });

  const handleSubmit = (startRecording: boolean) => {
    const info = buildInfo();
    if (startRecording) {
      onStartMeeting(info);
    } else if (onSaveMeetingInfo) {
      onSaveMeetingInfo(info);
    }
  };

  const resetForm = () => {
    setTitle('');
    setLocation('');
    setOrganizer('');
    setParticipants('');
    setMeetingType(MEETING_TYPES[0]);
  };

  const inputCls =
    'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#008751] focus:ring-2 focus:ring-emerald-100 transition-all';
  const labelCls = 'text-[11px] font-semibold text-slate-700 mb-1 block';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-meeting-title"
    >
      <div className="w-full max-w-md max-h-[92vh] bg-slate-50 rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 bg-white border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <VerbaLogo size="sm" variant="icon" lightMode />
            <div>
              <h2 id="new-meeting-title" className="text-sm font-bold text-slate-900 leading-tight">
                New Meeting
              </h2>
              <p className="text-[10px] text-slate-500">
                Optional details — you can also just hit record
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(true);
          }}
        >
          {/* Quick presets */}
          <div>
            <span className={labelCls}>Quick start</span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setTitle(preset.name);
                    setMeetingType(preset.type);
                    setLocation(preset.location);
                  }}
                  className="px-2.5 py-1 text-[10px] font-semibold rounded-full bg-white border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-800 hover:bg-emerald-50 transition-all cursor-pointer active:scale-95"
                >
                  {preset.name}
                </button>
              ))}
              <button
                type="button"
                onClick={resetForm}
                className="px-2.5 py-1 text-[10px] font-semibold rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 transition-all cursor-pointer active:scale-95 inline-flex items-center gap-1"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Reset
              </button>
            </div>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="nm-title" className={labelCls}>
              Meeting Title
            </label>
            <div className="relative">
              <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="nm-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`${inputCls} pl-9`}
                placeholder="e.g. Weekly Team Sync"
              />
            </div>
          </div>

          {/* Date & Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="nm-date" className={labelCls}>
                Date
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="nm-date"
                  type="text"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className={`${inputCls} pl-9`}
                  placeholder="21 September 2026"
                />
              </div>
            </div>
            <div>
              <label htmlFor="nm-type" className={labelCls}>
                Type
              </label>
              <select
                id="nm-type"
                value={meetingType}
                onChange={(e) => setMeetingType(e.target.value)}
                className={inputCls}
              >
                {MEETING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Location */}
          <div>
            <label htmlFor="nm-location" className={labelCls}>
              Location / Platform
            </label>
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="nm-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={`${inputCls} pl-9`}
                placeholder="e.g. Conference Room B or Google Meet"
              />
            </div>
          </div>

          {/* Organizer */}
          <div>
            <label htmlFor="nm-organizer" className={labelCls}>
              Organizer / Chair
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="nm-organizer"
                type="text"
                value={organizer}
                onChange={(e) => setOrganizer(e.target.value)}
                className={`${inputCls} pl-9`}
                placeholder="e.g. Amina Yusuf"
              />
            </div>
          </div>

          {/* Participants */}
          <div>
            <label htmlFor="nm-participants" className={labelCls}>
              Participants <span className="font-normal text-slate-400">(comma separated)</span>
            </label>
            <div className="relative">
              <Users className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <textarea
                id="nm-participants"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                rows={2}
                className={`${inputCls} pl-9 resize-none`}
                placeholder="e.g. Amina, Bola, Chidi, Musa"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2">
              {onSaveMeetingInfo && (
                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  className="px-4 py-2 text-xs font-semibold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-all cursor-pointer active:scale-95"
                >
                  Save Details Only
                </button>
              )}
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-bold text-white bg-[#008751] hover:bg-[#007043] rounded-xl shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Start Recording</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
