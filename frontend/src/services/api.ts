import type { SessionState, MeetingInfo } from '../types/transcription';

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

export async function updateMeetingInfo(
  sessionId: string,
  meetingInfo?: MeetingInfo
): Promise<SessionState> {
  const res = await fetch(`/api/sessions/${sessionId}/meeting-info`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meeting_info: meetingInfo }),
  });
  if (!res.ok) throw new Error('Failed to update meeting information');
  return res.json();
}

export async function exportSessionFile(
  sessionId: string,
  format: 'markdown' | 'txt' | 'json'
): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/export?format=${format}`);
  if (!res.ok) throw new Error('Export failed');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ext = format === 'markdown' ? 'md' : format;
  a.download = `meeting_${sessionId}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
