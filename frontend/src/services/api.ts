import { apiFetch } from './auth';
import type { LanguageMode, SessionState, Bookmark } from '../types/transcription';

export interface SessionPatch {
  title?: string;
  tags?: string[];
  agenda?: string | null;
  template?: string | null;
}

export interface AskResult {
  answer: string;
  evidence_segment_ids: string[];
}

export interface ShareResult {
  share_token: string;
  expires_at: string;
}

function fail(res: Response, fallback: string): Error {
  if (res.status === 404) return new Error('Meeting not found');
  if (res.status === 401 || res.status === 403) return new Error('Not authorized');
  if (res.status === 409) return new Error('Meeting is still active');
  return new Error(fallback);
}

export async function fetchSessions(): Promise<SessionState[]> {
  const res = await apiFetch('/api/sessions');
  if (!res.ok) throw fail(res, 'Failed to fetch sessions');
  return res.json();
}

export async function fetchSession(sessionId: string): Promise<SessionState> {
  const res = await apiFetch(`/api/sessions/${sessionId}`);
  if (!res.ok) throw fail(res, 'Failed to fetch session');
  return res.json();
}

/** Full-text search across titles, summaries, transcripts, tags, agendas. */
export async function searchSessions(query: string): Promise<SessionState[]> {
  const res = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw fail(res, 'Search failed');
  return res.json();
}

/** Creates a session server-side; the returned ID is authoritative. */
export async function createSession(languageMode: LanguageMode = 'auto'): Promise<SessionState> {
  const res = await apiFetch(`/api/sessions?language_mode=${encodeURIComponent(languageMode)}`, {
    method: 'POST',
  });
  if (!res.ok) throw fail(res, 'Failed to create session');
  return res.json();
}

/** Partial update of meeting metadata (title, tags, agenda, template). */
export async function updateSession(
  sessionId: string,
  patch: SessionPatch | string
): Promise<SessionState> {
  const body: SessionPatch = typeof patch === 'string' ? { title: patch } : patch;
  const res = await apiFetch(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw fail(res, 'Failed to update meeting');
  return res.json();
}

/** Permanently deletes a meeting and its audio (DELETE /api/sessions/{id}). */
export async function deleteSession(sessionId: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
  if (res.status === 409) throw new Error('Cannot delete a meeting while it is active');
  if (!res.ok) {
    if (res.status === 404) return; // already gone — treat as success
    throw fail(res, 'Failed to delete meeting');
  }
}

/** Manual transcript correction for one segment. */
export async function editSegment(
  sessionId: string,
  segmentId: string,
  body: { text?: string; speaker?: string }
): Promise<SessionState> {
  const res = await apiFetch(`/api/sessions/${sessionId}/transcript/${segmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw fail(res, 'Failed to edit segment');
  return res.json();
}

export async function addBookmark(
  sessionId: string,
  body: { segment_id?: string; time_seconds?: number; note?: string }
): Promise<Bookmark> {
  const res = await apiFetch(`/api/sessions/${sessionId}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw fail(res, 'Failed to add bookmark');
  return res.json();
}

export async function deleteBookmark(sessionId: string, bookmarkId: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${sessionId}/bookmarks/${bookmarkId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) throw fail(res, 'Failed to delete bookmark');
}

/** Creates/rotates a read-only share link. */
export async function createShare(sessionId: string, ttlHours = 168): Promise<ShareResult> {
  const res = await apiFetch(`/api/sessions/${sessionId}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl_hours: ttlHours }),
  });
  if (!res.ok) throw fail(res, 'Failed to create share link');
  return res.json();
}

export async function revokeShare(sessionId: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${sessionId}/share`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw fail(res, 'Failed to revoke share link');
}

/** Grounded question answering (persisted server-side as chat history). */
export async function askQuestion(sessionId: string, question: string): Promise<AskResult> {
  const res = await apiFetch(`/api/sessions/${sessionId}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw fail(res, 'Failed to ask question');
  return res.json();
}

export async function renameSpeaker(
  sessionId: string,
  oldName: string,
  newName: string
): Promise<SessionState> {
  const res = await apiFetch(`/api/sessions/${sessionId}/speakers/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_name: oldName, new_name: newName }),
  });
  if (!res.ok) throw fail(res, 'Failed to rename speaker');
  return res.json();
}

export async function toggleAction(
  sessionId: string,
  actionId: string,
  completed: boolean
): Promise<void> {
  const res = await apiFetch(`/api/sessions/${sessionId}/actions/${actionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  });
  if (!res.ok) throw fail(res, 'Failed to update action item');
}

/** Triggers server-side processing of an uploaded audio file. */
export async function uploadAudioForProcessing(
  sessionId: string,
  file: File
): Promise<SessionState> {
  const form = new FormData();
  form.append('audio_file', file);
  const res = await apiFetch(`/api/sessions/${sessionId}/complete-audio`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw fail(res, 'Failed to process audio file');
  return res.json();
}

/** Downloads a URL as a file (used for export/ics/backup). */
export async function downloadUrl(path: string, filename?: string): Promise<void> {
  const res = await apiFetch(path);
  if (!res.ok) throw fail(res, 'Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function login(username: string, password: string): Promise<{ username: string; role: string }> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('Invalid username or password');
  return res.json();
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

export async function fetchMe(): Promise<{ username: string; role: string } | null> {
  try {
    const res = await apiFetch('/api/auth/me');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
