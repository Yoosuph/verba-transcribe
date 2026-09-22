"""Authentication: shared bearer token, per-user session cookies, roles, and
read-only share-token access for individual sessions."""
import hmac
import logging
from typing import Optional

from fastapi import HTTPException, Request, WebSocket

from app.config import settings
from app.services.user_store import ROLE_ORDER, verify_session_cookie

logger = logging.getLogger(__name__)

COOKIE_NAME = "scribe_session"


def _extract_token(
    authorization: Optional[str],
    x_auth_token: Optional[str],
    query_token: Optional[str],
) -> Optional[str]:
    if authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer" and value.strip():
            return value.strip()
        if authorization.strip() and not value:
            return authorization.strip()
    if x_auth_token and x_auth_token.strip():
        return x_auth_token.strip()
    if query_token and query_token.strip():
        return query_token.strip()
    return None


def is_authorized(
    authorization: Optional[str] = None,
    x_auth_token: Optional[str] = None,
    query_token: Optional[str] = None,
) -> bool:
    """True when auth is disabled or the presented token matches the configured one."""
    expected = settings.auth_token
    if not expected:
        return True
    presented = _extract_token(authorization, x_auth_token, query_token)
    return bool(presented) and hmac.compare_digest(presented, expected)


def _cookie_role(request: Request) -> Optional[tuple]:
    """Valid session cookie → (username, role) or None."""
    raw = request.cookies.get(COOKIE_NAME)
    role = verify_session_cookie(raw)
    if not role or not raw:
        return None
    username = raw.rsplit(".", 4)[0]
    # Ensure the user still exists and the role matches the stored record
    from app.services.user_store import user_store

    stored = user_store.get_role(username)
    if stored is None or stored != role:
        return None
    return username, role


def _share_allows(request: Request) -> bool:
    """Read-only bypass: GET + valid, unexpired share token for THIS session."""
    if request.method != "GET":
        return False
    sid = request.path_params.get("session_id")
    share = request.query_params.get("share")
    if not sid or not share:
        return False
    from app.services.session_manager import session_manager

    session = session_manager.get(sid)
    if not session or not session.share_token or not session.share_expires_at:
        return False
    if not hmac.compare_digest(share, session.share_token):
        return False
    import datetime as _dt

    try:
        expires = _dt.datetime.fromisoformat(session.share_expires_at)
        if expires < _dt.datetime.now(_dt.timezone.utc):
            return False
    except Exception:
        return False
    return True


async def require_auth(request: Request) -> None:
    """FastAPI dependency: master token, user cookie, or session share token."""
    if is_authorized(
        authorization=request.headers.get("authorization"),
        x_auth_token=request.headers.get("x-auth-token"),
        query_token=request.query_params.get("token"),
    ):
        return
    if _cookie_role(request):
        return
    if _share_allows(request):
        return
    raise HTTPException(status_code=401, detail="Missing or invalid auth token")


def _current_role(request: Request) -> str:
    """Resolved role: 'admin' for master token / auth-disabled, else cookie role."""
    if is_authorized(
        authorization=request.headers.get("authorization"),
        x_auth_token=request.headers.get("x-auth-token"),
        query_token=request.query_params.get("token"),
    ):
        return "admin"
    cookie = _cookie_role(request)
    if cookie:
        return cookie[1]
    if _share_allows(request):
        return "viewer"
    raise HTTPException(status_code=401, detail="Not authenticated")


async def require_editor(request: Request) -> None:
    """Mutating routes: editor or admin."""
    role = _current_role(request)
    if ROLE_ORDER[role] < ROLE_ORDER["editor"]:
        raise HTTPException(status_code=403, detail="Editor role required")


async def require_admin(request: Request) -> None:
    role = _current_role(request)
    if ROLE_ORDER[role] < ROLE_ORDER["admin"]:
        raise HTTPException(status_code=403, detail="Admin role required")


async def require_ws_auth(websocket: WebSocket) -> None:
    """WebSocket handshake guard (token via header or ?token= query param)."""
    if is_authorized(
        authorization=websocket.headers.get("authorization"),
        x_auth_token=websocket.headers.get("x-auth-token"),
        query_token=websocket.query_params.get("token"),
    ):
        return
    await websocket.close(code=1008, reason="Missing or invalid auth token")
