# Stage 1: Build the React/Vite frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# NOTE: index.html keeps the %%AUTH_TOKEN%% placeholder — the backend replaces
# it with the real AUTH_TOKEN at serve time (single-container deploys).
RUN npm run build

# Stage 2: Production Python runtime
FROM python:3.13-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY backend/app ./app
COPY backend/pytest.ini .

# Copy compiled frontend from builder
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Persistent data (SQLite + recorded audio) lives under /app/data
ENV PYTHONPATH=/app
ENV FRONTEND_DIST=/app/frontend/dist
ENV DATA_DIR=/app/data
ENV PORT=8000

RUN mkdir -p /app/data/audio
VOLUME ["/app/data"]

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
