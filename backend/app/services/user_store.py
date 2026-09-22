"""User accounts with pbkdf2-hashed passwords and roles (viewer/editor/admin)."""
import logging
import os
import sqlite3
import threading
import time
from hashlib import pbkdf2_hmac
from hmac import compare_digest
from typing import List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

ROLE_ORDER = {"viewer": 0, "editor": 1, "admin": 2}
_COOKIE_NAME = "scribe_session"
_PBKDF2_ITERATIONS = 200_000


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or os.urandom(16)
    dk = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2${_PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2":
            return False
        dk = pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


class UserStore:
    """SQLite-backed user directory. Single shared library; roles gate mutations."""

    def __init__(self, db_path: Optional[str] = None):
        self._lock = threading.RLock()
        path = db_path or settings.db_path
        parent = os.path.dirname(os.path.abspath(path))
        os.makedirs(parent, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        self._conn.commit()
        self._bootstrap_admin()

    def _bootstrap_admin(self) -> None:
        with self._lock:
            row = self._conn.execute("SELECT 1 FROM users LIMIT 1").fetchone()
            if row:
                return
            username = os.environ.get("APP_ADMIN_USER", "admin")
            password = os.environ.get("APP_ADMIN_PASSWORD", "admin")
            self.create(username, password, "admin")
            logger.warning(
                "Bootstrapped admin user '%s' (set APP_ADMIN_USER/APP_ADMIN_PASSWORD to change).",
                username,
            )

    def create(self, username: str, password: str, role: str) -> bool:
        with self._lock:
            try:
                self._conn.execute(
                    "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                    (username, hash_password(password), role, time.time()),
                )
                self._conn.commit()
                return True
            except sqlite3.IntegrityError:
                return False

    def authenticate(self, username: str, password: str) -> Optional[str]:
        with self._lock:
            row = self._conn.execute(
                "SELECT password_hash, role FROM users WHERE username = ?", (username,)
            ).fetchone()
        if not row:
            return None
        if not verify_password(password, row[0]):
            return None
        return row[1]

    def get_role(self, username: str) -> Optional[str]:
        with self._lock:
            row = self._conn.execute(
                "SELECT role FROM users WHERE username = ?", (username,)
            ).fetchone()
        return row[0] if row else None

    def list_users(self) -> List[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT username, role FROM users ORDER BY username"
            ).fetchall()
        return [{"username": r[0], "role": r[1]} for r in rows]

    def close(self) -> None:
        with self._lock:
            self._conn.close()


# Session cookie: username.exp.signature — HMAC keyed off the auth token so no
# extra secret management is needed. Empty auth (dev) uses a fixed dev key.
def _signing_key() -> bytes:
    return (settings.auth_token or "scribe-dev-cookie-key").encode("utf-8")


def issue_session_cookie(username: str, role: str, ttl_seconds: int = 12 * 3600) -> str:
    exp = int(time.time()) + ttl_seconds
    payload = f"{username}.{exp}.{role}"
    sig = __import__("hmac").new(_signing_key(), payload.encode(), "sha256").hexdigest()
    return f"{payload}.{sig}"


def verify_session_cookie(value: Optional[str]) -> Optional[str]:
    """Returns the role if the cookie is valid & unexpired, else None."""
    if not value:
        return None
    try:
        username, exp_s, role, sig = value.rsplit(".", 3)
        payload = f"{username}.{exp_s}.{role}"
        expected = __import__("hmac").new(_signing_key(), payload.encode(), "sha256").hexdigest()
        if not compare_digest(sig, expected):
            return None
        if int(exp_s) < time.time():
            return None
        if role not in ROLE_ORDER:
            return None
        return role
    except Exception:
        return None


user_store = UserStore()
