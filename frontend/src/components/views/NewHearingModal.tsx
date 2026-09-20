import React, { useState } from 'react';
import { X, Mic, Scale, Calendar, User, Users } from 'lucide-react';
import type { CaseInformation, HearingParties } from '../../types/transcription';
import { JudiciaryLogo } from '../common/JudiciaryLogo';

interface NewHearingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartHearing: (caseInfo: CaseInformation, parties: HearingParties) => void;
  onSaveCaseInfo?: (caseInfo: CaseInformation, parties: HearingParties) => void;
  initialCaseInfo?: Partial<CaseInformation>;
  initialParties?: Partial<HearingParties>;
}

export const NewHearingModal: React.FC<NewHearingModalProps> = ({
  isOpen,
  onClose,
  onStartHearing,
  onSaveCaseInfo,
  initialCaseInfo,
  initialParties,
}) => {
  const [caseNumber, setCaseNumber] = useState(initialCaseInfo?.case_number || 'FHC/KN/CS/1042/2026');
  const [court, setCourt] = useState(initialCaseInfo?.court || 'Federal High Court, Kano');
  const [judge, setJudge] = useState(initialCaseInfo?.judge || 'Hon. Justice M. S. Abubakar');
  const [hearingDate, setHearingDate] = useState(initialCaseInfo?.hearing_date || '21 September 2026');
  const [hearingType, setHearingType] = useState(initialCaseInfo?.hearing_type || 'Motion Hearing');
  const [hearingNo, setHearingNo] = useState(initialCaseInfo?.hearing_no || '4');

  const [claimant, setClaimant] = useState(initialParties?.claimant || 'ABC Limited');
  const [counselClaimant, setCounselClaimant] = useState(initialParties?.counsel_claimant || 'Barr. Ibrahim Gambo');
  const [defendant, setDefendant] = useState(initialParties?.defendant || 'XYZ Limited');
  const [counselDefendant, setCounselDefendant] = useState(initialParties?.counsel_defendant || 'Barr. Aisha Bello');
  const [witnessesText, setWitnessesText] = useState(
    initialParties?.witnesses?.join(', ') || 'PW1 — Aliyu Mohammed, DW1 — Zainab Garba'
  );

  if (!isOpen) return null;

  const handleSubmit = (startRecording: boolean) => {
    const caseInfo: CaseInformation = {
      case_number: caseNumber.trim() || 'FHC/KN/CS/1042/2026',
      court: court.trim() || 'Federal High Court, Kano',
      judge: judge.trim() || 'Hon. Justice M. S. Abubakar',
      hearing_date: hearingDate.trim() || '21 September 2026',
      hearing_type: hearingType.trim() || 'Motion Hearing',
      hearing_no: hearingNo.trim() || '1',
      duration: '00:00:00',
    };

    const witnessList = witnessesText
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);

    const parties: HearingParties = {
      claimant: claimant.trim() || 'Claimant',
      counsel_claimant: counselClaimant.trim() || 'Counsel for Claimant',
      defendant: defendant.trim() || 'Defendant',
      counsel_defendant: counselDefendant.trim() || 'Counsel for Defendant',
      witnesses: witnessList.length > 0 ? witnessList : ['PW1'],
    };

    if (startRecording) {
      onStartHearing(caseInfo, parties);
    } else if (onSaveCaseInfo) {
      onSaveCaseInfo(caseInfo, parties);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-emerald-900/15 overflow-hidden flex flex-col max-h-[90vh] animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#042A1D] via-[#083E2C] to-[#0A4D36] text-white p-5 relative flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white/80 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 p-1.5 flex items-center justify-center border border-white/15">
              <JudiciaryLogo size="sm" variant="crest" lightMode={false} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Judicial Hearing Setup
                </span>
                <span className="text-[11px] text-emerald-200/80">Federal High Court</span>
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight mt-0.5">
                New Court Proceeding
              </h2>
            </div>
          </div>
        </div>

        {/* Form Body - Scrollable */}
        <div className="p-5 overflow-y-auto space-y-5 text-slate-800 text-xs">
          {/* Section 1: Case Details */}
          <div>
            <div className="flex items-center gap-1.5 text-emerald-800 font-bold uppercase tracking-wider text-[11px] mb-3">
              <Scale className="w-3.5 h-3.5 text-[#008751]" />
              <span>Case Identification</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Suit / Case Number
                </label>
                <input
                  type="text"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                  placeholder="e.g. FHC/KN/CS/1042/2026"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Court & Judicial Division
                </label>
                <input
                  type="text"
                  value={court}
                  onChange={(e) => setCourt(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                  placeholder="e.g. Federal High Court, Kano"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Presiding Judge
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={judge}
                    onChange={(e) => setJudge(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                    placeholder="e.g. Hon. Justice M. S. Abubakar"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Hearing Date
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={hearingDate}
                    onChange={(e) => setHearingDate(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                    placeholder="e.g. 21 September 2026"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Hearing Type
                </label>
                <select
                  value={hearingType}
                  onChange={(e) => setHearingType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                >
                  <option value="Motion Hearing">Motion Hearing (Notice of Motion)</option>
                  <option value="Substantive Trial">Substantive Trial / Examination</option>
                  <option value="Delivery of Ruling">Delivery of Ruling / Judgment</option>
                  <option value="Arraignment">Arraignment / Plea Taking</option>
                  <option value="Case Management Conference">Case Management Conference</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Hearing Number
                </label>
                <input
                  type="text"
                  value={hearingNo}
                  onChange={(e) => setHearingNo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                  placeholder="e.g. 4"
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section 2: Parties & Counsel */}
          <div>
            <div className="flex items-center gap-1.5 text-emerald-800 font-bold uppercase tracking-wider text-[11px] mb-3">
              <Users className="w-3.5 h-3.5 text-[#008751]" />
              <span>Parties & Appearances</span>
            </div>

            <div className="space-y-3">
              {/* Claimant */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-emerald-50/40 rounded-2xl border border-emerald-100">
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-950 mb-1">
                    Claimant / Applicant
                  </label>
                  <input
                    type="text"
                    value={claimant}
                    onChange={(e) => setClaimant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-emerald-200 rounded-lg font-semibold text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. ABC Limited"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-950 mb-1">
                    Claimant's Counsel
                  </label>
                  <input
                    type="text"
                    value={counselClaimant}
                    onChange={(e) => setCounselClaimant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. Barr. Ibrahim Gambo"
                  />
                </div>
              </div>

              {/* Defendant */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                    Defendant / Respondent
                  </label>
                  <input
                    type="text"
                    value={defendant}
                    onChange={(e) => setDefendant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. XYZ Limited"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                    Defendant's Counsel
                  </label>
                  <input
                    type="text"
                    value={counselDefendant}
                    onChange={(e) => setCounselDefendant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. Barr. Aisha Bello"
                  />
                </div>
              </div>

              {/* Witnesses */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Witnesses Scheduled / Called (comma separated)
                </label>
                <input
                  type="text"
                  value={witnessesText}
                  onChange={(e) => setWitnessesText(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                  placeholder="PW1 — Aliyu Mohammed, DW1 — Zainab Garba"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {onSaveCaseInfo && (
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                className="px-4 py-2 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-all cursor-pointer active:scale-95"
              >
                Save Details Only
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSubmit(true)}
              className="px-5 py-2.5 text-xs font-bold text-white bg-[#008751] hover:bg-[#007043] rounded-xl shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Start Hearing & Record</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
