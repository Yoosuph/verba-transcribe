import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppPage } from '../components/layout/ButtonPlate';

const PAGE_ORDER: Record<string, number> = {
  meetings: 0,
  transcript: 1,
  actions: 2,
  live: 3,
};

export type NavDirection = 'forward' | 'backward' | 'up' | 'fade';

export interface PageNavigation {
  activePage: AppPage;
  navDirection: NavDirection;
  /** Optional third arg pins the session id for transcript deep links. */
  navigateTo: (newPage: AppPage, customDir?: NavDirection, sessionIdForHash?: string) => void;
  /** Session id embedded in the hash (deep link), if any. */
  hashSessionId: string | null;
}

function parseHash(): { page: AppPage; sessionId: string | null } {
  if (typeof window === 'undefined') return { page: 'meetings', sessionId: null };
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pagePart, idPart] = raw.split('/');
  const valid: AppPage[] = ['meetings', 'live', 'transcript', 'actions'];
  const page = (valid.includes(pagePart as AppPage) ? pagePart : 'meetings') as AppPage;
  return { page, sessionId: idPart || null };
}

function writeHash(page: AppPage, sessionId?: string | null, mode: 'push' | 'replace' = 'push') {
  const next = `#/${page}${sessionId ? `/${sessionId}` : ''}`;
  if (window.location.hash !== next) {
    if (mode === 'push') {
      window.history.pushState(null, '', next);
    } else {
      window.history.replaceState(null, '', next);
    }
  }
}

/**
 * Page navigation with directional transitions and hash-based deep links
 * (`#/meetings`, `#/transcript/<id>`, `#/live`, `#/actions`).
 */
export function usePageNavigation(initialSessionId?: string | null): PageNavigation {
  const initial = parseHash();
  const [activePage, setActivePage] = useState<AppPage>(initial.page);
  const [navDirection, setNavDirection] = useState<NavDirection>('fade');
  const [hashSessionId, setHashSessionId] = useState<string | null>(
    initial.sessionId ?? initialSessionId ?? null
  );
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;

  const navigateTo = useCallback((newPage: AppPage, customDir?: NavDirection, sessionIdForHash?: string) => {
    const pinnedId = sessionIdForHash !== undefined ? sessionIdForHash : null;
    const hashIdForPage =
      newPage === 'transcript' ? (sessionIdForHash ?? hashSessionId) : null;

    if (newPage === activePageRef.current) {
      // Same page: still refresh the hash so a new selection updates the link
      // (replace, so browsing through transcripts doesn't spam history)
      if (newPage === 'transcript' && sessionIdForHash) {
        setHashSessionId(sessionIdForHash);
        writeHash(newPage, sessionIdForHash, 'replace');
      }
      return;
    }

    let dir: NavDirection = customDir || 'fade';
    if (!customDir) {
      if (newPage === 'live') {
        dir = 'up';
      } else if (activePageRef.current === 'live') {
        dir = 'backward';
      } else {
        const fromIdx = PAGE_ORDER[activePageRef.current] ?? 0;
        const toIdx = PAGE_ORDER[newPage] ?? 0;
        dir = toIdx > fromIdx ? 'forward' : toIdx < fromIdx ? 'backward' : 'fade';
      }
    }

    setNavDirection(dir);
    if (pinnedId !== null) setHashSessionId(pinnedId);

    const apply = () => {
      setActivePage(newPage);
      writeHash(newPage, hashIdForPage);
    };

    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as any).startViewTransition(apply);
    } else {
      apply();
    }
  }, [hashSessionId]);

  // Track the selected session for transcript deep links
  useEffect(() => {
    if (activePage === 'transcript' && initialSessionId) {
      setHashSessionId(initialSessionId);
      writeHash('transcript', initialSessionId, 'replace');
    }
  }, [activePage, initialSessionId]);

  // Browser back/forward restores pages from the hash
  useEffect(() => {
    const onHashChange = () => {
      const { page, sessionId } = parseHash();
      setHashSessionId(sessionId);
      if (page !== activePageRef.current) {
        setNavDirection('fade');
        setActivePage(page);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    // pushState/replaceState do not fire hashchange; popstate covers back/forward
    window.addEventListener('popstate', onHashChange);
    // Establish the initial hash so the first navigation has a baseline
    writeHash(initial.page, initial.sessionId, 'replace');
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { activePage, navDirection, navigateTo, hashSessionId };
}
