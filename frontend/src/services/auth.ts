const META_SELECTOR = 'meta[name="auth-token"]';

function isValidToken(value: string | null | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  // Reject unexpanded placeholders from templates/builds
  if (v.includes('%%') || v.includes('${')) return false;
  return true;
}

/**
 * Read-only share token from the URL (?share=...). When present the app is in
 * share mode: the master bearer token is suppressed and requests are scoped to
 * the shared session via the share query param.
 */
export function getShareToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const t = new URLSearchParams(window.location.search).get('share');
    return t && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

export function isShareMode(): boolean {
  return getShareToken() !== null;
}

/**
 * Resolves the shared API bearer token.
 * Priority: HTML meta tag (injected by the backend or nginx at serve time),
 * then the Vite env var for local development.
 * Suppressed entirely in share mode (read-only links must not carry admin rights).
 */
export function getAuthToken(): string {
  if (isShareMode()) return '';
  if (typeof document !== 'undefined') {
    const meta = document.querySelector(META_SELECTOR)?.getAttribute('content');
    if (isValidToken(meta)) return meta.trim();
  }
  const envToken = import.meta.env.VITE_AUTH_TOKEN as string | undefined;
  return isValidToken(envToken) ? envToken.trim() : '';
}

/** Appends ?share= when in share mode (no-op otherwise). */
function withShareParam(path: string): string {
  const share = getShareToken();
  if (!share) return path;
  try {
    const url = new URL(path, window.location.origin);
    if (!url.searchParams.has('share')) url.searchParams.set('share', share);
    return `${url.pathname}${url.search}`;
  } catch {
    return path;
  }
}

/** fetch wrapper: bearer token normally; share param (and no bearer) in share mode. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let resolved = path;
  let headers = new Headers(init.headers);
  if (isShareMode()) {
    resolved = withShareParam(path);
    // Never attach the master token in share mode.
    headers.delete('Authorization');
    headers.delete('X-Auth-Token');
  } else {
    const token = getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }
  return fetch(resolved, { ...init, headers });
}

/** Appends token (or share param in share mode) for WebSocket/media URLs. */
export function withTokenParam(baseUrl: string): string {
  if (isShareMode()) return withShareParam(baseUrl);
  const token = getAuthToken();
  if (!token) return baseUrl;
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}
