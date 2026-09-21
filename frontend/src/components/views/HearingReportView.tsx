import React, { useState, useEffect } from 'react';
import {
  Printer,
  FileDown,
  Copy,
  Check,
  RefreshCw,
  ChevronLeft,
  Scale,
  Gavel,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { SessionState, JudicialHearingReport } from '../../types/transcription';
import { generateHearingReport, getDocxExportUrl } from '../../services/api';
import { JudiciaryLogo } from '../common/JudiciaryLogo';

interface HearingReportViewProps {
  session: SessionState;
  onBack: () => void;
  onJumpToTimestamp?: (seconds: number) => void;
}

export const HearingReportView: React.FC<HearingReportViewProps> = ({
  session,
  onBack,
  onJumpToTimestamp: _onJumpToTimestamp,
}) => {
  const [report, setReport] = useState<JudicialHearingReport | null>(
    session.hearing_report || null
  );
  const [loading, setLoading] = useState<boolean>(!session.hearing_report);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showAppendix, setShowAppendix] = useState(true);

  // Fetch or generate report on mount
  useEffect(() => {
    if (session.hearing_report) {
      setReport(session.hearing_report);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    generateHearingReport(session.id)
      .then((data) => {
        if (isMounted) {
          setReport(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('Report generation failed, falling back to simulated:', err);
          setError(err.message || 'Failed to generate report');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [session.id, session.hearing_report]);

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateHearingReport(session.id);
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate report');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadDocx = () => {
    const url = getDocxExportUrl(session.id);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hearing_Report_${report?.case?.case_number || session.id}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyMarkdown = () => {
    if (!report) return;
    const lines: string[] = [];
    lines.push('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ');
    lines.push('IN THE NAME OF ALLAH, THE MOST BENEFICENT, THE MOST MERCIFUL\n');
    lines.push(`# IN THE ${report.case.court.toUpperCase()}`);
    lines.push(`## HOLDEN AT ${report.case.division ? report.case.division.toUpperCase() : 'DUTSE (DUTSE JUDICIAL DIVISION)'}`);
    lines.push(`### APPEAL / SUIT NO: ${report.case.case_number}`);
    lines.push(`**CORAM:** ${report.case.judge}`);
    if (report.case.coram && report.case.coram.length > 0) {
      report.case.coram.forEach((kadi) => lines.push(`- ${kadi}`));
    }
    lines.push(`\n**BETWEEN:**`);
    lines.push(`${report.parties.claimant} (Appellant / Mai Daukaka Kara)`);
    lines.push(`*Counsel / Wakil:* ${report.parties.counsel_claimant}\n`);
    lines.push(`**— AND / DA —**\n`);
    lines.push(`**AND:**`);
    lines.push(`${report.parties.defendant} (Respondent / Wanda Ake Daukaka Kara)`);
    lines.push(`*Counsel / Wakil:* ${report.parties.counsel_defendant}\n`);
    lines.push(`### 1. EXECUTIVE SUMMARY OF PROCEEDINGS`);
    lines.push(report.summary + '\n');
    lines.push(`### 2. COURT ORDERS & DECREES (HUKUNCIN KOTU)`);
    if (report.orders.length === 0) {
      lines.push('No judicial orders pronounced on the record for this sitting.');
    } else {
      report.orders.forEach((o, i) => lines.push(`${i + 1}. ${o.order}`));
    }
    lines.push(`\n### 3. ADJOURNMENT (TA'JIL)`);
    lines.push(`Adjourned to ${report.next_hearing.date} at ${report.next_hearing.time} for ${report.next_hearing.purpose}`);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F8FAF9] text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-[#008751] shadow-md animate-pulse">
          <Scale className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Synthesizing Judicial Hearing Report...
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
            Extracting proceedings narrative, legal submissions, witness evidence, and court orders directly from the transcribed record.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600 shadow-xs">
          <RefreshCw className="w-3.5 h-3.5 text-[#008751] animate-spin" />
          <span>Structuring 12 judicial report sections</span>
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F8FAF9] text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 border border-rose-200">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Report Generation Error</h3>
        <p className="text-xs text-slate-500 max-w-sm">{error}</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-[#008751] hover:bg-[#007043] text-white rounded-xl text-xs font-semibold shadow-md active:scale-95 transition-all"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#EAEEEC] text-slate-900 overflow-hidden relative print:bg-white print:overflow-visible">
      {/* Top Control Bar (Hidden on print) */}
      <div className="no-print bg-white/95 backdrop-blur-md border-b border-emerald-950/10 px-3 sm:px-5 py-2.5 flex-shrink-0 z-30 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center text-slate-700 cursor-pointer"
            title="Back to Session"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#008751] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
              Judicial Hearing Report
            </span>
            <h2 className="text-xs font-bold text-slate-900 truncate max-w-[170px] sm:max-w-xs mt-0.5 font-mono">
              {report.case.case_number}
            </h2>
          </div>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyMarkdown}
            className="hidden sm:inline-flex px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-medium transition-all items-center gap-1.5 cursor-pointer"
            title="Copy Markdown"
          >
            {copySuccess ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copySuccess ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleDownloadDocx}
            className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-950 border border-emerald-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Download Word Document (.docx)"
          >
            <FileDown className="w-3.5 h-3.5 text-[#008751]" />
            <span>Word (.docx)</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-xl bg-[#008751] hover:bg-[#007043] active:scale-95 text-white text-xs font-bold shadow-md shadow-emerald-700/25 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Export or Print Official PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Save PDF</span>
          </button>
        </div>
      </div>

      {/* Main Document Body (Scrollable in browser, paged in print) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 pb-36 print:p-0 print:overflow-visible">
        {/* Prominent Action Export Card Banner (No print) */}
        <div className="max-w-4xl mx-auto mb-5 p-4 sm:p-5 rounded-2xl bg-[#042A1D] text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl border border-emerald-500/20 no-print">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 flex-shrink-0">
              <Scale className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest bg-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-400/30">
                  Certified Hearing Report
                </span>
                <span className="text-xs text-emerald-200/90 font-mono font-bold">{report.case.case_number}</span>
              </div>
              <h3 className="text-sm font-bold text-white mt-0.5">
                Save & Export Official Hearing Report
              </h3>
              <p className="text-[11px] text-emerald-200/70">
                Ready to download as an editable Microsoft Word document or save as high-res PDF.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={handleDownloadDocx}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              title="Download editable Microsoft Word document (.docx)"
            >
              <FileDown className="w-4 h-4 text-[#008751]" />
              <span>Save Word (.docx)</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007043] border border-white/25 text-white font-bold text-xs shadow-md shadow-emerald-950/40 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              title="Save as PDF or Print"
            >
              <Printer className="w-4 h-4" />
              <span>Save as PDF</span>
            </button>
          </div>
        </div>

        {/* Printable Official Court Sheet Container */}
        <article
          id="judicial-hearing-report"
          className="max-w-4xl mx-auto bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200/80 p-6 sm:p-12 text-slate-900 print:shadow-none print:border-none print:p-0 print:max-w-none print:rounded-none"
        >
          {/* Bismillah Invocation */}
          <div className="text-center pb-3 mb-4 border-b border-emerald-950/10">
            <p className="text-base sm:text-lg font-serif font-bold text-slate-900 tracking-wider">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </p>
            <p className="text-[10px] sm:text-[11px] font-semibold tracking-widest text-[#008751] uppercase mt-0.5">
              IN THE NAME OF ALLAH, THE MOST BENEFICENT, THE MOST MERCIFUL
            </p>
          </div>

          {/* Document Crest & Header */}
          <div className="text-center pb-6 border-b-2 border-emerald-950/20 mb-6">
            <div className="flex justify-center mb-2">
              <JudiciaryLogo size="md" variant="crest" lightMode={true} />
            </div>

            <p className="text-[11px] font-bold tracking-[0.2em] text-[#008751] uppercase mb-1">
              Federal Republic of Nigeria
            </p>
            <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight uppercase font-serif">
              IN THE {report.case.court.toUpperCase()}
            </h1>
            <p className="text-xs font-semibold text-slate-700 tracking-wider uppercase mt-1">
              HOLDEN AT {report.case.division ? report.case.division.toUpperCase() : 'DUTSE (DUTSE JUDICIAL DIVISION)'}
            </p>

            <div className="inline-block mt-3 px-4 py-1 rounded-full bg-slate-100 border border-slate-300 text-xs font-mono font-bold text-slate-900">
              APPEAL / SUIT NO: {report.case.case_number}
            </div>
          </div>

          {/* Coram Panel */}
          <div className="bg-emerald-50/50 rounded-2xl border border-emerald-900/15 p-4 sm:p-5 mb-6 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-800 block mb-2">
              BEFORE THEIR LORDSHIPS (CORAM):
            </span>
            <div className="space-y-1.5">
              <p className="font-bold text-slate-950 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#008751]" />
                <span>{report.case.judge}</span>
              </p>
              {report.case.coram && report.case.coram.length > 0 ? (
                report.case.coram.map((kadi, idx) => (
                  <p key={idx} className="font-medium text-slate-700 flex items-center gap-2 pl-3.5">
                    <span className="text-slate-400">•</span>
                    <span>{kadi}</span>
                  </p>
                ))
              ) : (
                <>
                  <p className="font-medium text-slate-700 flex items-center gap-2 pl-3.5">
                    <span className="text-slate-400">•</span>
                    <span>Hon. Kadi Abubakar M. Gumel (Hon. Kadi)</span>
                  </p>
                  <p className="font-medium text-slate-700 flex items-center gap-2 pl-3.5">
                    <span className="text-slate-400">•</span>
                    <span>Hon. Kadi Usman Birnin Kudu (Hon. Kadi)</span>
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Parties Box: BETWEEN / AND */}
          <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 sm:p-5 mb-6 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-200/60">
              <div>
                <span className="font-bold text-slate-900 text-sm">{report.parties.claimant}</span>
                <p className="text-[11px] text-slate-500">Counsel / Wakil: <span className="text-slate-800 font-medium">{report.parties.counsel_claimant}</span></p>
              </div>
              <span className="text-[10px] font-bold tracking-widest text-[#008751] uppercase bg-emerald-50 px-2.5 py-0.5 rounded self-start sm:self-auto border border-emerald-200/60">
                Appellant / Mai Daukaka Kara
              </span>
            </div>

            <div className="py-1 text-center font-serif italic text-slate-400 font-bold text-[11px]">
              — AND / DA —
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-2 border-t border-slate-200/60">
              <div>
                <span className="font-bold text-slate-900 text-sm">{report.parties.defendant}</span>
                <p className="text-[11px] text-slate-500">Counsel / Wakil: <span className="text-slate-800 font-medium">{report.parties.counsel_defendant}</span></p>
              </div>
              <span className="text-[10px] font-bold tracking-widest text-slate-600 uppercase bg-slate-200/60 px-2.5 py-0.5 rounded self-start sm:self-auto">
                Respondent / Wanda Ake Daukaka Kara
              </span>
            </div>
          </div>

          {/* Section 1: Hearing Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[#F8FAF9] rounded-2xl border border-emerald-950/10 mb-8 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Presiding Grand Kadi</span>
              <p className="font-bold text-slate-900">{report.case.judge}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Judicial Division</span>
              <p className="font-bold text-slate-900">{report.case.division || 'Dutse Division'}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Hearing Date</span>
              <p className="font-bold text-slate-900">{report.case.hearing_date}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Hearing Type</span>
              <p className="font-bold text-slate-900">{report.case.hearing_type}</p>
            </div>
          </div>

          {/* Section 2: Executive Summary */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black tracking-tight text-slate-950 uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#008751]" />
                <span>1. Executive Summary of Proceedings</span>
              </h2>
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                AI-Assisted Draft
              </span>
            </div>

            <div className="prose prose-sm max-w-none text-xs text-slate-700 leading-relaxed space-y-3 font-normal">
              {report.summary.split('\n\n').map((p, idx) => (
                <p key={idx} className="text-justify">{p}</p>
              ))}
            </div>
          </section>

          {/* Section 3: Proceedings Narrative (Chronological) */}
          <section className="mb-8 break-inside-avoid">
            <h2 className="text-sm font-black tracking-tight text-slate-950 uppercase flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#008751]" />
              <span>2. Record of Proceedings Narrative (Bayanan Zama)</span>
            </h2>

            {report.proceedings.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 italic">
                Awaiting transcribed verbal proceedings for this session.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3 w-52 sm:w-60">Procedural Stage & Participant</th>
                      <th className="py-2.5 px-3">Substantive Explanation of Proceedings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.proceedings.map((proc, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 align-top">
                          <span className="font-bold text-slate-900 block">{proc.stage}</span>
                          <span className="text-[10px] text-slate-500 uppercase">{proc.speaker}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 align-top leading-relaxed text-justify">
                          {proc.text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 4: Key Issues Considered */}
          <section className="mb-8 break-inside-avoid">
            <h2 className="text-sm font-black tracking-tight text-slate-950 uppercase flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#008751]" />
              <span>3. Key Issues for Determination (Abubuwan da Kotu ke Dubawa)</span>
            </h2>

            {report.issues.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 italic">
                No contested legal issues entered on record.
              </div>
            ) : (
              <div className="space-y-2">
                {report.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                  >
                    <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-900 font-bold flex items-center justify-center flex-shrink-0 text-[10px]">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-slate-900 font-medium leading-relaxed">{issue.issue}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 5: Submissions of Counsel */}
          <section className="mb-8 break-inside-avoid">
            <h2 className="text-sm font-black tracking-tight text-slate-950 uppercase flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#008751]" />
              <span>4. Submissions of Counsel & Parties (Hujjojin Masu Kara)</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Claimant */}
              <div className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-200/80">
                <h3 className="font-bold text-emerald-950 text-xs uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Appellant / Mai Daukaka Kara</span>
                  <span className="text-[10px] font-normal text-emerald-700">{report.parties.counsel_claimant}</span>
                </h3>
                {report.submissions.claimant.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No submissions recorded.</p>
                ) : (
                  <ul className="space-y-2 text-slate-700">
                    {report.submissions.claimant.map((sub, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-[#008751] font-bold">•</span>
                        <span>{sub}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Defendant */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Respondent / Wanda Ake Daukaka Kara</span>
                  <span className="text-[10px] font-normal text-slate-500">{report.parties.counsel_defendant}</span>
                </h3>
                {report.submissions.defendant.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No submissions recorded.</p>
                ) : (
                  <ul className="space-y-2 text-slate-700">
                    {report.submissions.defendant.map((sub, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-slate-400 font-bold">•</span>
                        <span>{sub}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Section 6: Islamic Jurisprudence & Legal Authorities */}
          {report.islamic_authorities && report.islamic_authorities.length > 0 && (
            <section className="mb-8 break-inside-avoid">
              <h2 className="text-sm font-black tracking-tight text-slate-950 uppercase flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#008751]" />
                <span>5. Applicable Islamic Jurisprudence & Authorities (Fiqh)</span>
              </h2>
              <div className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-200/80 space-y-2 text-xs">
                {report.islamic_authorities.map((auth, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-[#008751] font-bold">§</span>
                    <span className="text-slate-800 font-medium leading-relaxed">{auth}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Section 7: Witness Evidence & Exhibits (if present) */}
          {(report.witness_evidence?.length > 0 || report.exhibits?.length > 0) && (
            <section className="mb-8 break-inside-avoid">
              <h2 className="text-sm font-black tracking-tight text-slate-950 uppercase flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#008751]" />
                <span>6. Evidence & Exhibits (Bayanan Shaidu & Hujjoji)</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Witnesses */}
                {report.witness_evidence?.length > 0 && (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                      Witness Testimony (Shaidu)
                    </span>
                    <div className="space-y-3">
                      {report.witness_evidence.map((wit, idx) => (
                        <div key={idx} className="border-b border-slate-200/60 pb-2 last:border-0 last:pb-0">
                          <span className="font-bold text-slate-900">{wit.witness}</span>
                          <p className="text-slate-600 mt-1 leading-relaxed">{wit.summary}</p>
                          {wit.cross_examination && (
                            <p className="text-slate-500 text-[11px] italic mt-1">Cross-Exam: {wit.cross_examination}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exhibits */}
                {report.exhibits?.length > 0 && (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                      Tendered Exhibits (Hujjojin da aka Gabatar)
                    </span>
                    <div className="space-y-2">
                      {report.exhibits.map((ex, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl bg-white border border-slate-200">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-emerald-900">{ex.number}</span>
                            <span className="text-[10px] text-slate-400">{ex.party}</span>
                          </div>
                          <p className="text-slate-700 text-[11px] mt-0.5">{ex.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Section 8: Court Orders & Directions */}
          <section className="mb-8 break-inside-avoid">
            <h2 className="text-sm font-black tracking-tight text-slate-950 uppercase flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#008751]" />
              <span>Court Orders & Decrees (Hukuncin Kotu & Umarni)</span>
            </h2>

            {report.orders.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 italic">
                No judicial orders or decrees pronounced on the record for this session.
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-[#082E20] text-white space-y-3">
                {report.orders.map((ord, idx) => (
                  <div key={idx} className="flex items-start gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
                    <div className="w-6 h-6 rounded-lg bg-white/15 text-emerald-300 font-bold flex items-center justify-center flex-shrink-0 text-xs mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold leading-relaxed text-white">
                        {ord.order}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 9: Compliance & Action Items */}
          {report.action_items?.length > 0 && (
            <section className="mb-8 break-inside-avoid">
              <h2 className="text-sm font-black tracking-tight text-slate-950 uppercase flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#008751]" />
                <span>Compliance & Action Deadlines</span>
              </h2>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3">Directive / Task</th>
                      <th className="py-2.5 px-3 w-40">Responsible Party</th>
                      <th className="py-2.5 px-3 w-32">Deadline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.action_items.map((act, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 text-slate-800 font-medium">{act.task}</td>
                        <td className="py-2.5 px-3 text-slate-600">{act.assignee || 'Counsel'}</td>
                        <td className="py-2.5 px-3 font-bold text-[#008751]">{act.deadline || 'Before next hearing'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Section 10: Adjournment & Next Hearing */}
          <section className="mb-8 p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 text-xs break-inside-avoid">
            <h3 className="font-bold text-amber-950 uppercase tracking-wider text-[11px] mb-1 flex items-center gap-1.5">
              <Gavel className="w-3.5 h-3.5 text-amber-800" />
              <span>Adjournment & Next Hearing Date (Ta'jil)</span>
            </h3>
            <p className="text-amber-950 font-semibold leading-relaxed mt-1">
              Matter stands adjourned to <span className="underline decoration-amber-500 font-bold">{report.next_hearing.date}</span> at{' '}
              <span className="font-bold">{report.next_hearing.time}</span> for{' '}
              <span className="font-bold italic">{report.next_hearing.purpose}</span>.
            </p>
          </section>

          {/* Formal Judicial Signature & Certification Block */}
          <div className="pt-8 mt-8 border-t border-slate-200 space-y-8 text-xs break-inside-avoid">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              <div>
                <div className="w-40 border-b border-slate-400 mx-auto mb-2 pt-6" />
                <p className="font-bold text-slate-900">{report.case.judge}</p>
                <p className="text-[10px] text-slate-500 uppercase">Hon. Grand Kadi / Presiding</p>
              </div>

              <div>
                <div className="w-40 border-b border-slate-400 mx-auto mb-2 pt-6" />
                <p className="font-bold text-slate-900">
                  {report.case.coram && report.case.coram[0] ? report.case.coram[0] : 'Hon. Kadi Abubakar M. Gumel'}
                </p>
                <p className="text-[10px] text-slate-500 uppercase">Honourable Kadi</p>
              </div>

              <div>
                <div className="w-40 border-b border-slate-400 mx-auto mb-2 pt-6" />
                <p className="font-bold text-slate-900">
                  {report.case.coram && report.case.coram[1] ? report.case.coram[1] : 'Hon. Kadi Usman Birnin Kudu'}
                </p>
                <p className="text-[10px] text-slate-500 uppercase">Honourable Kadi</p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#008751] block mb-0.5">
                  Court Registry Certification
                </span>
                <p className="text-xs font-semibold text-slate-800">
                  Certified True Copy of Recorded Proceedings
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Sharia Court of Appeal of Jigawa State • Dutse Judicial Division
                </p>
              </div>

              <div className="text-center flex-shrink-0">
                <div className="w-44 border-b border-slate-400 mx-auto mb-1 pt-4" />
                <p className="font-bold text-slate-900 text-xs">Chief Registrar / Court Clerk</p>
                <p className="text-[10px] text-slate-400 uppercase">Seal & Signature</p>
              </div>
            </div>
          </div>

          {/* Appendix A: Complete Verbatim Diarized Transcript */}
          {report.appendix_transcript?.segments && (
            <section className="mt-12 pt-8 border-t-2 border-slate-200 break-before-page">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-black tracking-tight text-slate-950 uppercase font-serif">
                    Appendix A: Verbatim Certified Transcript
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Complete speaker-diarized record • {report.appendix_transcript.segments.length} speech segments
                  </p>
                </div>

                <button
                  onClick={() => setShowAppendix(!showAppendix)}
                  className="no-print text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <span>{showAppendix ? 'Hide Appendix' : 'Show Appendix'}</span>
                  {showAppendix ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showAppendix && (
                <div className="space-y-2 text-xs font-mono">
                  {report.appendix_transcript.segments.map((seg, idx) => (
                    <div
                      key={seg.id || idx}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-3"
                    >
                      <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">
                        [{seg.start.toFixed(1)}s]
                      </span>
                      <div className="flex-1">
                        <span className="font-bold text-emerald-900 uppercase text-[11px] mr-2">
                          {seg.speaker}:
                        </span>
                        <span className="text-slate-800 font-sans">{seg.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Document Footer Actions (No print) */}
          <div className="no-print mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500 italic">
              Official judicial record • End of hearing proceedings report.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadDocx}
                className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileDown className="w-3.5 h-3.5 text-[#008751]" />
                <span>Save Word (.docx)</span>
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-2 rounded-xl bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Save as PDF / Print</span>
              </button>
            </div>
          </div>

          {/* Document Footer (Visible on print) */}
          <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] italic text-slate-400 print:block">
            AI-assisted draft — generated from recorded proceedings. Subject to review and verification.
          </div>
        </article>
      </div>
    </div>
  );
};
