import logging
import os
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, JSONResponse, HTMLResponse, FileResponse
from app.config import settings
from app.api.sessions import router as sessions_router, search_router
from app.api.auth import router as auth_router
from app.websocket.transcription import router as websocket_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("scribe_transcribe")

app = FastAPI(
    title="Scribe Real-Time & Grounded Transcription Engine",
    description="Production-grade dual-pipeline speech transcription and grounded summarization with Gemini Live & Gemini Transcribe",
    version="1.0.0"
)

# CORS configuration
# Browsers reject `Access-Control-Allow-Origin: *` when credentials are allowed,
# so disable credentials for wildcard origins.
_cors_origins = settings.cors_origins if isinstance(settings.cors_origins, list) else ["*"]
_allow_credentials = "*" not in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_and_security_headers(request: Request, call_next):
    """Access log + baseline security headers on every HTTP response."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    if not request.url.path.startswith("/assets"):
        logger.info("%s %s -> %s (%.1fms)", request.method, request.url.path, response.status_code, duration_ms)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


# Include routers (sessions router carries its own auth dependency)
app.include_router(sessions_router)
app.include_router(search_router)
app.include_router(auth_router)
app.include_router(websocket_router)


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "Scribe Transcribe API",
        "models": {
            "live_model": settings.gemini_live_model,
            "final_model": settings.gemini_final_model,
            "summary_model": settings.gemini_summary_model
        },
        "has_api_key": bool(settings.gemini_api_key),
        "mock_mode_fallback": settings.mock_mode_if_no_key and not settings.gemini_api_key,
        "auth_required": bool(settings.auth_token),
        "persistence": {"db": settings.db_path, "audio_dir": settings.audio_dir},
    }


# Serve frontend build in production
candidate_dist_dirs = [
    os.environ.get("FRONTEND_DIST", ""),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend/dist")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend/dist")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "frontend/dist")),
    "/app/frontend/dist",
]
frontend_dist = next((d for d in candidate_dist_dirs if d and os.path.exists(d)), None)

_index_cache: dict = {}


def _serve_index() -> HTMLResponse:
    """Serves index.html with the auth token injected into the meta tag so the
    SPA (same-origin) can authenticate its API/WS calls without a login screen."""
    index_path = os.path.join(frontend_dist, "index.html")
    if "html" not in _index_cache:
        with open(index_path, "r", encoding="utf-8") as f:
            _index_cache["html"] = f.read()
    html = _index_cache["html"].replace("%%AUTH_TOKEN%%", settings.auth_token)
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


if frontend_dist and os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("openapi.json") or full_path.startswith("ws"):
            return JSONResponse(status_code=404, content={"error": "Not Found"})
        if full_path in ("", "index.html"):
            return _serve_index()
        dist_root = os.path.realpath(frontend_dist)
        candidate = os.path.realpath(os.path.join(dist_root, full_path))
        # Block path traversal: only serve files that resolve inside the dist directory
        if full_path and os.path.isfile(candidate) and candidate.startswith(dist_root + os.sep):
            return FileResponse(candidate)
        return _serve_index()
else:
    @app.get("/")
    async def root():
        return {
            "message": "Scribe Real-Time Transcription API is running.",
            "docs": "/docs",
            "health": "/api/health"
        }


if not settings.auth_token:
    logger.warning(
        "AUTH_TOKEN is not configured — API and WebSocket endpoints are UNAUTHENTICATED. "
        "Set AUTH_TOKEN in .env for any deployment beyond local development."
    )
if settings.gemini_api_key and settings.mock_mode_if_no_key:
    logger.info("GEMINI_API_KEY present: mock/simulation fallbacks are disabled (failures surface as errors).")
if not settings.gemini_api_key:
    if settings.mock_mode_if_no_key:
        logger.warning("No GEMINI_API_KEY: running in SIMULATION mode with fabricated sample output.")
    else:
        logger.error("No GEMINI_API_KEY and mock mode disabled: transcription calls will fail.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
