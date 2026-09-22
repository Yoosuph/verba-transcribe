"""SQLite-backed persistence for SessionState records (write-through cache)."""
import json
import logging
import os
import sqlite3
import threading
import time
from typing import Dict, List, Optional

from app.config import settings
from app.models.transcription import SessionState

logger = logging.getLogger(__name__)


class SessionStore:
    """Durable key/value store for sessions. The SessionManager keeps the hot cache;
    every mutation is written through here so a process restart loses nothing."""

    def __init__(self, db_path: Optional[str] = None):
        self._lock = threading.RLock()
        self._db_path = db_path or settings.db_path
        self._conn: Optional[sqlite3.Connection] = None
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        with self._lock:
            parent = os.path.dirname(os.path.abspath(self._db_path))
            os.makedirs(parent, exist_ok=True)
            self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
            self._conn.commit()

    def save(self, session: SessionState) -> None:
        now = time.time()
        payload = session.model_dump_json()
        with self._lock:
            assert self._conn is not None
            self._conn.execute(
                """
                INSERT INTO sessions (id, data, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
                """,
                (session.id, payload, now, now),
            )
            self._conn.commit()

    def load_all(self) -> Dict[str, SessionState]:
        with self._lock:
            assert self._conn is not None
            rows = self._conn.execute("SELECT id, data FROM sessions").fetchall()
        out: Dict[str, SessionState] = {}
        for sid, data in rows:
            try:
                out[sid] = SessionState.model_validate_json(data)
            except Exception as e:
                logger.warning("Skipping corrupt session record %s: %s", sid, e)
        return out

    def delete(self, session_id: str) -> None:
        with self._lock:
            assert self._conn is not None
            self._conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            self._conn.commit()

    def updated_at(self, session_id: str) -> Optional[float]:
        with self._lock:
            assert self._conn is not None
            row = self._conn.execute(
                "SELECT updated_at FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
        return float(row[0]) if row else None

    def all_ids_with_updated_at(self) -> List[tuple]:
        with self._lock:
            assert self._conn is not None
            rows = self._conn.execute("SELECT id, updated_at FROM sessions").fetchall()
        return [(r[0], float(r[1])) for r in rows]

    def search_ids(self, query: str, limit: int = 100) -> List[str]:
        """Case-insensitive substring match across the full session JSON blob
        (covers titles, summaries, transcripts, tags, and agendas)."""
        q = f"%{query}%"
        with self._lock:
            assert self._conn is not None
            rows = self._conn.execute(
                "SELECT id FROM sessions WHERE data LIKE ? COLLATE NOCASE ORDER BY updated_at DESC LIMIT ?",
                (q, limit),
            ).fetchall()
        return [r[0] for r in rows]

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None
