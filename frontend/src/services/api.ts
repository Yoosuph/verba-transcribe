import type { SessionState, CaseInformation, HearingParties, JudicialHearingReport } from '../types/transcription';

export async function fetchSessions(): Promise<SessionState[]> {
  const res = await fetch('/api/sessions');
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchSession(sessionId: string): Promise<SessionState> {
  const res = await fetch(`/api/sessions/${sessionId}`);
  if (!res.ok) throw new Error('Failed to fetch session');
  return res.json();
}

export async function updateCaseInfo(
  sessionId: string,
  caseInfo?: CaseInformation,
  parties?: HearingParties
): Promise<SessionState> {
  const res = await fetch(`/api/sessions/${sessionId}/case-info`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case: caseInfo, parties }),
  });
  if (!res.ok) throw new Error('Failed to update case information');
  return res.json();
}

export async function generateHearingReport(sessionId: string): Promise<JudicialHearingReport> {
  const res = await fetch(`/api/sessions/${sessionId}/report`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to generate judicial hearing report');
  return res.json();
}

export async function getHearingReport(sessionId: string): Promise<JudicialHearingReport> {
  const res = await fetch(`/api/sessions/${sessionId}/report`);
  if (!res.ok) throw new Error('Failed to retrieve hearing report');
  return res.json();
}

export function getDocxExportUrl(sessionId: string): string {
  return `/api/sessions/${sessionId}/export/docx`;
}

export async function exportSessionFile(
  sessionId: string,
  format: 'markdown' | 'txt' | 'json' | 'docx'
): Promise<void> {
  if (format === 'docx') {
    const url = getDocxExportUrl(sessionId);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hearing_Report_${sessionId}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  const res = await fetch(`/api/sessions/${sessionId}/export?format=${format}`);
  if (!res.ok) throw new Error('Export failed');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ext = format === 'markdown' ? 'md' : format;
  a.download = `hearing_${sessionId}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
