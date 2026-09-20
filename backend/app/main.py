import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.config import settings
from app.api.sessions import router as sessions_router
from app.websocket.transcription import router as websocket_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("verba_transcribe")

app = FastAPI(
    title="Verba Real-Time & Grounded Transcription Engine",
    description="Production-grade dual-pipeline speech transcription and grounded summarization with Gemini Live & Gemini Transcribe",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins if isinstance(settings.cors_origins, list) else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(sessions_router)
app.include_router(websocket_router)

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "Verba Transcribe API",
        "models": {
            "live_model": settings.gemini_live_model,
            "final_model": settings.gemini_final_model,
            "summary_model": settings.gemini_summary_model
        },
        "has_api_key": bool(settings.gemini_api_key),
        "mock_mode_fallback": settings.mock_mode_if_no_key
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

if frontend_dist and os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            return {"error": "Not Found"}
        file_path = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
else:
    @app.get("/")
    async def root():
        return {
            "message": "Verba Real-Time Transcription API is running.",
            "docs": "/docs",
            "health": "/api/health"
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
