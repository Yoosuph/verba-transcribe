"""Shared test setup.

Environment overrides MUST happen before `app.config` (and therefore `app.main`)
is imported by any test module, so this file configures isolated temp paths and
disables auth (tests exercise behavior, not the shared-secret gate).
"""
import os
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="verba_test_")

# Isolate persistence/audio away from the developer's real data directory.
os.environ["DATA_DIR"] = _tmpdir
os.environ["AUDIO_DIR"] = os.path.join(_tmpdir, "audio")
os.environ["DB_PATH"] = os.path.join(_tmpdir, "verba.db")
# Disable auth for the suite (explicit empty string beats .env values).
os.environ["AUTH_TOKEN"] = ""
# Never hit the network from tests — force the simulation path.
os.environ["GEMINI_API_KEY"] = ""
os.environ["RATE_LIMIT_LLM_PER_MINUTE"] = "0"

import pytest  # noqa: E402
