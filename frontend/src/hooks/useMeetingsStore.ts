import { useCallback, useEffect, useState } from 'react';
import type { SessionState } from '../types/transcription';
import {
  fetchSessions,
  fetchSession,
  updateSession,
  deleteSession,
  searchSessions,
  addBookmark as apiAddBookmark,
  deleteBookmark as apiDeleteBookmark,
  createShare as apiCreateShare,
  revokeShare as apiRevokeShare,
  type SessionPatch,
  type ShareResult,
} from '../services/api';
import { isShareMode } from '../services/auth';

const LOCAL_STORAGE_KEY = 'verba_meetings_v1';

// Must mirror backend SESSION_ID_PATTERN (^[A-Za-z0-9_-]{1,64}$) — ids that
// fail it can never be fetched/deleted server-side (400 on every attempt).
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const VALID_STATUS = new Set([
  'idle',
  'connecting',
  'recording',
  'processing',
  'complete',
  'error',
]);

function loadFromStorage(): SessionState[] {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    // Drop corrupt/ghost rows and normalize unknown statuses so a bad cached
    // status (e.g. stuck "processing") can't permanently disable row actions.
    return parsed
      .filter(
        (s): s is SessionState =>
          !!s && typeof s.id === 'string' && SESSION_ID_RE.test(s.id)
      )
      .map((s) =>
        VALID_STATUS.has(s.status) ? s : { ...s, status: 'error' as const }
      );
  } catch {
    return [];
  }
}

function persist(sessions: SessionState[]) {
  try {
    if (isShareMode()) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* quota exceeded — non-fatal; backend remains the durable source */
  }
}

/**
 * Meeting library: localStorage as an offline-friendly mirror, merged with
 * the backend (SQLite-backed) store. The backend is authoritative for
 * anything it knows about; refreshSessions() pulls it in on demand and while
 * sessions are still processing, so the UI updates live without a reload.
 */
export function useMeetingsStore() {
  // Share mode is scoped to a single shared session — never hydrate from
  // localStorage (would leak other meetings' titles to share-link visitors).
  const [sessions, setSessions] = useState<SessionState[]>(() =>
    isShareMode() ? [] : loadFromStorage()
  );
  const [selectedSession, setSelectedSession] = useState<SessionState | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const backendSessions = await fetchSessions();
      // Server is authoritative: replace local state entirely so localStorage
      // "ghost" rows (stale ids/statuses the server no longer knows) are pruned.
      // An empty [] is a valid answer — it clears ghosts instead of keeping them.
      setSessions(() => {
        persist(backendSessions);
        return backendSessions;
      });
    } catch (err) {
      // Backend unreachable — keep the offline mirror as-is.
      console.log('Backend sync:', err);
    }
  }, []);

  // Sync with backend sessions on mount
  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // While any session is still processing, poll the backend so transcripts,
  // summaries, and audio URLs appear live (covers page reloads mid-process).
  const hasProcessing = sessions.some((s) => s.status === 'processing');
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = window.setInterval(() => {
      refreshSessions();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [hasProcessing, refreshSessions]);

  // Keep the selected session pointing at the latest merged copy so detail
  // views re-render when the backend (or an upsert) updates that meeting.
  useEffect(() => {
    if (!selectedSession) return;
    const updated = sessions.find((s) => s.id === selectedSession.id);
    if (updated && updated !== selectedSession) {
      setSelectedSession(updated);
    }
  }, [sessions, selectedSession]);

  // Save sessions to localStorage (not in share mode — avoid leaking titles)
  useEffect(() => {
    if (isShareMode()) return;
    persist(sessions);
  }, [sessions]);

  const upsertSession = useCallback((session: SessionState) => {
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === session.id);
      return exists ? prev.map((s) => (s.id === session.id ? session : s)) : [session, ...prev];
    });
  }, []);

  /** Renames a meeting: PATCH first (server authoritative), then mirror locally. */
  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      const updated = await updateSession(sessionId, title);
      upsertSession(updated);
    },
    [upsertSession]
  );

  /** Partial metadata update (title/tags/agenda/template). */
  const patchSession = useCallback(
    async (sessionId: string, patch: SessionPatch) => {
      const updated = await updateSession(sessionId, patch);
      upsertSession(updated);
      return updated;
    },
    [upsertSession]
  );

  /** Deletes a meeting: DELETE first, then drop it locally (incl. selection). */
  const removeSession = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSelectedSession((current) => (current && current.id === sessionId ? null : current));
    },
    []
  );

  /** Full-text search via backend; falls back to [] when unavailable. */
  const searchSessionsRemote = useCallback(
    async (query: string): Promise<SessionState[]> => {
      if (!query.trim() || query.trim().length < 2) return [];
      return searchSessions(query.trim());
    },
    []
  );

  /** Adds a bookmark then refetches the session so state matches server. */
  const addBookmarkFor = useCallback(
    async (sessionId: string, body: { segment_id?: string; time_seconds?: number; note?: string }) => {
      await apiAddBookmark(sessionId, body);
      const fresh = await fetchSession(sessionId);
      upsertSession(fresh);
    },
    [upsertSession]
  );

  const removeBookmarkFor = useCallback(
    async (sessionId: string, bookmarkId: string) => {
      await apiDeleteBookmark(sessionId, bookmarkId);
      try {
        const fresh = await fetchSession(sessionId);
        upsertSession(fresh);
      } catch {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, bookmarks: (s.bookmarks || []).filter((b) => b.id !== bookmarkId) }
              : s
          )
        );
      }
    },
    [upsertSession]
  );

  const createShareLink = useCallback(
    async (sessionId: string, ttlHours?: number): Promise<ShareResult> => {
      const result = await apiCreateShare(sessionId, ttlHours);
      try {
        const fresh = await fetchSession(sessionId);
        upsertSession(fresh);
      } catch {
        /* non-fatal: link is already returned */
      }
      return result;
    },
    [upsertSession]
  );

  const revokeShareLink = useCallback(
    async (sessionId: string) => {
      await apiRevokeShare(sessionId);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, share_token: null, share_expires_at: null } : s
        )
      );
      setSelectedSession((current) =>
        current && current.id === sessionId
          ? { ...current, share_token: null, share_expires_at: null }
          : current
      );
    },
    []
  );

  /** Loads a single session by id (used for share-mode deep links). */
  const loadSessionById = useCallback(
    async (sessionId: string): Promise<SessionState | null> => {
      try {
        const fresh = await fetchSession(sessionId);
        upsertSession(fresh);
        return fresh;
      } catch {
        return null;
      }
    },
    [upsertSession]
  );

  /** Most recently selected, falling back to the newest stored meeting. */
  const effectiveSession = selectedSession || (sessions.length > 0 ? sessions[0] : null);

  return {
    sessions,
    selectedSession,
    setSelectedSession,
    effectiveSession,
    upsertSession,
    renameSession,
    patchSession,
    removeSession,
    refreshSessions,
    searchSessionsRemote,
    addBookmarkFor,
    removeBookmarkFor,
    createShareLink,
    revokeShareLink,
    loadSessionById,
  };
}
