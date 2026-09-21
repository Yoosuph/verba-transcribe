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
  const [caseNumber, setCaseNumber] = useState(initialCaseInfo?.case_number || 'JGS/SCA/DTS/CV/018/2026');
  const [court, setCourt] = useState(initialCaseInfo?.court || 'Sharia Court of Appeal, Jigawa State (Dutse Division)');
  const [judge, setJudge] = useState(initialCaseInfo?.judge || 'Hon. Kadi Sani Salihu (Hon. Grand Kadi)');
  const [hearingDate, setHearingDate] = useState(initialCaseInfo?.hearing_date || '21 September 2026');
  const [hearingType, setHearingType] = useState(initialCaseInfo?.hearing_type || 'Civil Appeal (Islamic Personal Law / Mirath)');
  const [hearingNo, setHearingNo] = useState(initialCaseInfo?.hearing_no || '2');

  const [claimant, setClaimant] = useState(initialParties?.claimant || 'Alhaji Haruna Garba & Ors (Mai Daukaka Kara / Appellant)');
  const [counselClaimant, setCounselClaimant] = useState(initialParties?.counsel_claimant || 'Barr. Ibrahim Gambo Dutse');
  const [defendant, setDefendant] = useState(initialParties?.defendant || 'Malam Mustapha Suleiman (Wanda Ake Daukaka Kara / Respondent)');
  const [counselDefendant, setCounselDefendant] = useState(initialParties?.counsel_defendant || 'Barr. Aisha Mohammed Hadejia');
  const [witnessesText, setWitnessesText] = useState(
    initialParties?.witnesses?.join(', ') || 'PW1 — Malam Sani Ringim, DW1 — Aliyu Adamu Gumel'
  );

  if (!isOpen) return null;

  const handleSubmit = (startRecording: boolean) => {
    const caseInfo: CaseInformation = {
      case_number: caseNumber.trim() || 'JGS/SCA/DTS/CV/018/2026',
      court: court.trim() || 'Sharia Court of Appeal, Jigawa State',
      division: 'Dutse Judicial Division',
      judge: judge.trim() || 'Hon. Kadi Sani Salihu (Hon. Grand Kadi)',
      coram: [
        'Hon. Kadi Sani Salihu (Hon. Grand Kadi / Presiding)',
        'Hon. Kadi Abubakar M. Gumel (Hon. Kadi)',
        'Hon. Kadi Usman Birnin Kudu (Hon. Kadi)',
      ],
      hearing_date: hearingDate.trim() || '21 September 2026',
      hearing_type: hearingType.trim() || 'Civil Appeal (Islamic Personal Law / Mirath)',
      hearing_no: hearingNo.trim() || '1',
      duration: '00:00:00',
    };

    const witnessList = witnessesText
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);

    const parties: HearingParties = {
      claimant: claimant.trim() || 'Appellant',
      counsel_claimant: counselClaimant.trim() || 'Counsel for Appellant',
      defendant: defendant.trim() || 'Respondent',
      counsel_defendant: counselDefendant.trim() || 'Counsel for Respondent',
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
                <span className="text-[11px] text-emerald-200/80">Sharia Court of Appeal, Jigawa State</span>
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight mt-0.5">
                New Court Proceeding / Appeal
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
              <span>Court & Cause Identification</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Appeal / Suit Number
                </label>
                <input
                  type="text"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                  placeholder="e.g. JGS/SCA/DTS/CV/018/2026"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Court & Division
                </label>
                <input
                  type="text"
                  list="jigawa-courts-list"
                  value={court}
                  onChange={(e) => setCourt(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                  placeholder="e.g. Sharia Court of Appeal, Jigawa State (Dutse Division)"
                />
                <datalist id="jigawa-courts-list">
                  <option value="Sharia Court of Appeal, Jigawa State (Dutse Division)" />
                  <option value="Sharia Court of Appeal, Jigawa State (Hadejia Division)" />
                  <option value="Sharia Court of Appeal, Jigawa State (Kazaure Division)" />
                  <option value="Sharia Court of Appeal, Jigawa State (Gumel Division)" />
                  <option value="Sharia Court of Appeal, Jigawa State (Ringim Division)" />
                  <option value="Sharia Court of Appeal, Jigawa State (Birnin Kudu Division)" />
                  <option value="Upper Sharia Court, Dutse" />
                  <option value="Upper Sharia Court, Hadejia" />
                  <option value="Upper Sharia Court, Kazaure" />
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Presiding Coram / Grand Kadi
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={judge}
                    onChange={(e) => setJudge(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                    placeholder="e.g. Hon. Kadi Sani Salihu (Hon. Grand Kadi)"
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
                  Hearing Nature / Matter Type
                </label>
                <select
                  value={hearingType}
                  onChange={(e) => setHearingType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                >
                  <option value="Civil Appeal (Islamic Personal Law / Mirath)">Civil Appeal (Mirath / Inheritance & Estate Distribution)</option>
                  <option value="Civil Appeal (Hadanah & Nafaqah)">Civil Appeal (Custody & Child Maintenance)</option>
                  <option value="Civil Appeal (Nikah & Talaq)">Civil Appeal (Matrimonial Causes / Dissolution of Marriage)</option>
                  <option value="Civil Appeal (Shuf'ah & Farmland Ownership)">Civil Appeal (Pre-emption & Land Ownership)</option>
                  <option value="Civil Appeal (Mu'amalat & Commercial Debt)">Civil Appeal (Islamic Commercial Transactions & Debts)</option>
                  <option value="Motion for Extension of Time to Appeal">Motion for Extension of Time to Appeal</option>
                  <option value="Substantive Appeal Hearing">Substantive Appeal Hearing / Oral Arguments</option>
                  <option value="Delivery of Judgment / Ruling">Delivery of Judgment / Ruling</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Hearing Session No.
                </label>
                <input
                  type="text"
                  value={hearingNo}
                  onChange={(e) => setHearingNo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                  placeholder="e.g. 2"
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section 2: Parties & Counsel */}
          <div>
            <div className="flex items-center gap-1.5 text-emerald-800 font-bold uppercase tracking-wider text-[11px] mb-3">
              <Users className="w-3.5 h-3.5 text-[#008751]" />
              <span>Parties & Representation (Wakilai)</span>
            </div>

            <div className="space-y-3">
              {/* Claimant / Appellant */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-emerald-50/40 rounded-2xl border border-emerald-100">
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-950 mb-1">
                    Appellant / Claimant (Mai Daukaka Kara / Mai Kara)
                  </label>
                  <input
                    type="text"
                    value={claimant}
                    onChange={(e) => setClaimant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-emerald-200 rounded-lg font-semibold text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. Alhaji Haruna Garba & Ors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-950 mb-1">
                    Counsel / Wakil for Appellant
                  </label>
                  <input
                    type="text"
                    value={counselClaimant}
                    onChange={(e) => setCounselClaimant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. Barr. Ibrahim Gambo Dutse"
                  />
                </div>
              </div>

              {/* Defendant / Respondent */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                    Respondent / Defendant (Wanda Ake Daukaka Kara)
                  </label>
                  <input
                    type="text"
                    value={defendant}
                    onChange={(e) => setDefendant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. Malam Mustapha Suleiman"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                    Counsel / Wakil for Respondent
                  </label>
                  <input
                    type="text"
                    value={counselDefendant}
                    onChange={(e) => setCounselDefendant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. Barr. Aisha Mohammed Hadejia"
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
                  placeholder="e.g. PW1 — Malam Sani Ringim, DW1 — Aliyu Adamu Gumel"
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
