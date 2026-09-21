import React, { useState } from 'react';
import { X, Mic, Scale, Calendar, User, Users, Building, Hash } from 'lucide-react';
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

const JIGAWA_DIVISIONS = [
  { id: 'Dutse Judicial Division', label: 'Dutse Division (State Headquarters)', code: 'DTS' },
  { id: 'Hadejia Judicial Division', label: 'Hadejia Judicial Division', code: 'HDJ' },
  { id: 'Kazaure Judicial Division', label: 'Kazaure Judicial Division', code: 'KZR' },
  { id: 'Gumel Judicial Division', label: 'Gumel Judicial Division', code: 'GML' },
  { id: 'Ringim Judicial Division', label: 'Ringim Judicial Division', code: 'RNG' },
  { id: 'Birnin Kudu Judicial Division', label: 'Birnin Kudu Judicial Division', code: 'BKD' },
];

const MATTER_TYPES = [
  { value: 'Civil Appeal (Islamic Personal Law / Mirath)', label: 'Inheritance & Estate Distribution (Mirath)' },
  { value: 'Civil Appeal (Hadanah & Nafaqah)', label: 'Child Custody & Maintenance (Hadanah & Nafaqah)' },
  { value: 'Civil Appeal (Nikah & Talaq)', label: 'Matrimonial Causes & Divorce (Nikah & Talaq)' },
  { value: 'Civil Appeal (Shuf\'ah & Land Ownership)', label: 'Land & Farmland Pre-emption (Shuf\'ah)' },
  { value: 'Civil Appeal (Mu\'amalat & Commercial Debt)', label: 'Commercial Transactions & Debts (Mu\'amalat)' },
  { value: 'Motion for Extension of Time to Appeal', label: 'Motion on Notice / Extension of Time to Appeal' },
  { value: 'Substantive Appeal Hearing', label: 'Substantive Appeal Hearing / Oral Arguments' },
  { value: 'Delivery of Judgment / Ruling', label: 'Delivery of Judgment / Ruling' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const parseToIsoDate = (dateStr?: string): string => {
  if (!dateStr) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  const match = dateStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const monthName = match[2].toLowerCase();
    const year = match[3];
    const monthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(monthName.slice(0, 3)));
    if (monthIdx !== -1) {
      const month = String(monthIdx + 1).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const formatIsoToReadableDate = (isoStr: string): string => {
  if (!isoStr) return '';
  const match = isoStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = match[1];
    const monthIdx = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const monthName = MONTH_NAMES[monthIdx] || match[2];
    return `${day} ${monthName} ${year}`;
  }
  return isoStr;
};

export const NewHearingModal: React.FC<NewHearingModalProps> = ({
  isOpen,
  onClose,
  onStartHearing,
  onSaveCaseInfo,
  initialCaseInfo,
  initialParties,
}) => {
  const [court, setCourt] = useState(
    initialCaseInfo?.court?.includes('Upper')
      ? 'Upper Sharia Court'
      : 'Sharia Court of Appeal of Jigawa State'
  );
  const [division, setDivision] = useState(
    initialCaseInfo?.division || 'Dutse Judicial Division'
  );
  const [caseNumber, setCaseNumber] = useState(
    initialCaseInfo?.case_number || 'JGS/SCA/DTS/CV/018/2026'
  );
  const [judge, setJudge] = useState(
    initialCaseInfo?.judge || 'Hon. Kadi Sani Salihu (Hon. Grand Kadi)'
  );
  const [hearingDate, setHearingDate] = useState(() =>
    parseToIsoDate(initialCaseInfo?.hearing_date || '2026-09-21')
  );
  const [hearingType, setHearingType] = useState(
    initialCaseInfo?.hearing_type || 'Civil Appeal (Islamic Personal Law / Mirath)'
  );
  const [hearingNo, setHearingNo] = useState(
    initialCaseInfo?.hearing_no || '1'
  );

  const [claimant, setClaimant] = useState(
    initialParties?.claimant || 'Alhaji Haruna Garba & Ors (Mai Daukaka Kara / Appellant)'
  );
  const [counselClaimant, setCounselClaimant] = useState(
    initialParties?.counsel_claimant || 'Barr. Ibrahim Gambo Dutse'
  );
  const [defendant, setDefendant] = useState(
    initialParties?.defendant || 'Malam Mustapha Suleiman (Wanda Ake Daukaka Kara / Respondent)'
  );
  const [counselDefendant, setCounselDefendant] = useState(
    initialParties?.counsel_defendant || 'Barr. Aisha Mohammed Hadejia'
  );

  if (!isOpen) return null;

  const handleDivisionChange = (newDivision: string) => {
    setDivision(newDivision);
    const found = JIGAWA_DIVISIONS.find((d) => d.id === newDivision);
    if (found) {
      setCaseNumber((prev) => {
        const match = prev.match(/^(JGS\/(?:SCA|USC)\/)[A-Z]{3}(\/.*)$/);
        if (match) {
          return `${match[1]}${found.code}${match[2]}`;
        }
        return prev;
      });
    }
  };

  const handleCourtChange = (newCourt: string) => {
    setCourt(newCourt);
    const isUpper = newCourt.includes('Upper');
    setCaseNumber((prev) => {
      if (isUpper) {
        return prev.replace('/SCA/', '/USC/');
      } else {
        return prev.replace('/USC/', '/SCA/');
      }
    });
  };

  const handleSubmit = (startRecording: boolean) => {
    const formattedHearingDate = formatIsoToReadableDate(hearingDate);
    const resolvedCourt = court === 'Upper Sharia Court'
      ? `Upper Sharia Court, ${division.replace(' Judicial Division', '')}`
      : 'Sharia Court of Appeal, Jigawa State';

    const caseInfo: CaseInformation = {
      case_number: caseNumber.trim() || 'JGS/SCA/DTS/CV/018/2026',
      court: resolvedCourt,
      division: division,
      judge: judge.trim() || 'Hon. Kadi Sani Salihu (Hon. Grand Kadi)',
      coram: [
        'Hon. Kadi Sani Salihu (Hon. Grand Kadi / Presiding)',
        'Hon. Kadi Abubakar M. Gumel (Hon. Kadi)',
        'Hon. Kadi Usman Birnin Kudu (Hon. Kadi)',
      ],
      hearing_date: formattedHearingDate,
      hearing_type: hearingType,
      hearing_no: hearingNo.toString().trim() || '1',
      duration: '00:00:00',
    };

    const parties: HearingParties = {
      claimant: claimant.trim() || 'Appellant / Mai Daukaka Kara',
      counsel_claimant: counselClaimant.trim() || 'Counsel for Appellant',
      defendant: defendant.trim() || 'Respondent / Wanda Ake Daukaka Kara',
      counsel_defendant: counselDefendant.trim() || 'Counsel for Respondent',
      witnesses: [], // Real empty initial list, no fabricated mock witnesses
    };

    if (startRecording) {
      onStartHearing(caseInfo, parties);
    } else if (onSaveCaseInfo) {
      onSaveCaseInfo(caseInfo, parties);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-emerald-900/15 overflow-hidden flex flex-col max-h-[92vh] animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#042A1D] via-[#083E2C] to-[#0A4D36] text-white p-4 sm:p-5 relative flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white/80 transition-all cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 p-1 flex items-center justify-center border border-white/20 flex-shrink-0">
              <JudiciaryLogo size="sm" variant="crest" lightMode={false} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  Judicial Hearing Setup
                </span>
                <span className="text-[11px] text-emerald-200/90 font-medium">Jigawa State Judiciary</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
                New Court Hearing & Cause Details
              </h2>
            </div>
          </div>
        </div>

        {/* Form Body - Scrollable */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(true);
          }}
          className="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-800 text-xs"
        >
          {/* Section 1: Court & Bench */}
          <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-emerald-900 font-bold uppercase tracking-wider text-[11px]">
                <Scale className="w-3.5 h-3.5 text-[#008751]" />
                <span>1. Court Jurisdiction & Bench (Mazaunin Shari'a)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Jigawa State</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Court System */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Building className="w-3 h-3 text-slate-400" />
                  <span>Court Type</span>
                </label>
                <select
                  value={court}
                  onChange={(e) => handleCourtChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                >
                  <option value="Sharia Court of Appeal of Jigawa State">Sharia Court of Appeal of Jigawa State</option>
                  <option value="Upper Sharia Court">Upper Sharia Court (Jigawa State)</option>
                </select>
              </div>

              {/* Judicial Division */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Building className="w-3 h-3 text-slate-400" />
                  <span>Judicial Division</span>
                </label>
                <select
                  value={division}
                  onChange={(e) => handleDivisionChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                >
                  {JIGAWA_DIVISIONS.map((div) => (
                    <option key={div.id} value={div.id}>
                      {div.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Appeal / Suit Number */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Hash className="w-3 h-3 text-slate-400" />
                  <span>Appeal / Suit Number</span>
                </label>
                <input
                  type="text"
                  required
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                  placeholder="e.g. JGS/SCA/DTS/CV/018/2026"
                />
              </div>

              {/* Presiding Grand Kadi / Judge */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  <span>Presiding Grand Kadi / Judge</span>
                </label>
                <input
                  type="text"
                  required
                  value={judge}
                  onChange={(e) => setJudge(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                  placeholder="e.g. Hon. Kadi Sani Salihu (Hon. Grand Kadi)"
                />
              </div>

              {/* Matter Nature / Category */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Scale className="w-3 h-3 text-slate-400" />
                  <span>Hearing Nature & Cause Category</span>
                </label>
                <select
                  value={hearingType}
                  onChange={(e) => setHearingType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                >
                  {MATTER_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Date & Sitting Schedule */}
          <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <div className="flex items-center gap-1.5 text-emerald-900 font-bold uppercase tracking-wider text-[11px]">
              <Calendar className="w-3.5 h-3.5 text-[#008751]" />
              <span>2. Hearing Schedule & Session (Lokacin Zama)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Native HTML5 Date Input */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>Hearing Date (Ranar Zama)</span>
                </label>
                <input
                  type="date"
                  required
                  value={hearingDate}
                  onChange={(e) => setHearingDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Report Date: <strong className="text-slate-700 font-semibold">{formatIsoToReadableDate(hearingDate)}</strong>
                </span>
              </div>

              {/* Sitting Session Number */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Hash className="w-3 h-3 text-slate-400" />
                  <span>Sitting Session Number (Zama na nawa)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  required
                  value={hearingNo}
                  onChange={(e) => setHearingNo(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
                  placeholder="1"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Indicates whether this is the 1st sitting, continuation, or delivery of judgment.
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Parties & Legal Representation */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-emerald-900 font-bold uppercase tracking-wider text-[11px]">
              <Users className="w-3.5 h-3.5 text-[#008751]" />
              <span>3. Litigants & Legal Representation (Masu Kara & Wakilai)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Appellant / Mai Daukaka Kara Card */}
              <div className="p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-200/80 space-y-2.5">
                <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#008751]">
                    Appellant (Mai Daukaka Kara)
                  </span>
                  <span className="text-[9px] text-emerald-800 bg-emerald-100/80 px-1.5 py-0.5 rounded font-medium">
                    Party 1
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Full Name / Title
                  </label>
                  <input
                    type="text"
                    required
                    value={claimant}
                    onChange={(e) => setClaimant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-emerald-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. Alhaji Haruna Garba & Ors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Counsel / Legal Representative (Wakil)
                  </label>
                  <input
                    type="text"
                    value={counselClaimant}
                    onChange={(e) => setCounselClaimant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-emerald-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. Barr. Ibrahim Gambo Dutse"
                  />
                </div>
              </div>

              {/* Respondent / Wanda Ake Daukaka Kara Card */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                    Respondent (Wanda Ake Daukaka Kara)
                  </span>
                  <span className="text-[9px] text-slate-600 bg-slate-200/70 px-1.5 py-0.5 rounded font-medium">
                    Party 2
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Full Name / Title
                  </label>
                  <input
                    type="text"
                    required
                    value={defendant}
                    onChange={(e) => setDefendant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. Malam Mustapha Suleiman"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Counsel / Legal Representative (Wakil)
                  </label>
                  <input
                    type="text"
                    value={counselDefendant}
                    onChange={(e) => setCounselDefendant(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#008751]"
                    placeholder="e.g. Barr. Aisha Mohammed Hadejia"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer Controls */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2">
              {onSaveCaseInfo && (
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
                <span>Start Hearing & Record</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
