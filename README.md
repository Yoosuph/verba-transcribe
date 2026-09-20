# Judiciary Jigawa — Real-Time Transcription & Grounded Summarization

A production-quality MVP web application for **real-time audio transcription, speaker-aware final transcription, and transcript-grounded meeting summarization** powered by Google Gemini.

Designed to operate on **lightweight CPU-only infrastructure** (VPS/Docker) without GPU hosting, local Whisper, or heavy PyTorch models.

---

## 🌟 Key Features

1. **Dual-Pipeline Transcription**:
   - **Path A (Real-Time Live)**: Browser microphone audio is streamed in ~32ms chunks as 16kHz mono signed 16-bit PCM over WebSockets directly to **Gemini Live API** (`gemini-3.5-transcribe-live` / fallback `gemini-2.0-flash`). Users see words appear in near real-time while speaking.
   - **Path B (Final Authoritative)**: When recording stops, the complete audio is transcribed using **Gemini Transcribe** (`gemini-3.5-transcribe` / fallback `gemini-2.5-flash`), providing **speaker diarization (up to 8 speakers)** and precise **word/utterance timestamps**.
2. **Strictly Grounded Meeting Summaries**:
   - Summaries are synthesized using **ONLY** facts contained in the finalized transcript.
   - Every decision and action item contains clickable **grounding evidence badges** (e.g., `[seg_4]`) that instantly jump and highlight the exact supporting transcript segment.
3. **Bilingual & Code-Switching Support**:
   - Native support for **English**, **Hausa**, and **mixed English/Hausa code-switching**.
   - Original spoken language is strictly preserved without forced translation into English.
   - Optional one-click **Translate to English** feature available post-recording.
4. **Speaker Renaming & Management**:
   - Speakers initially labeled as `Speaker 1`, `Speaker 2`, etc., can be renamed to human identities (e.g., `Speaker 1` → `Hon. Justice Yusuf`).
   - Renaming updates across the entire transcript, action items assignees, and speaker contributions dynamically.
5. **Modern Audio Pipeline & SaaS Interface**:
   - Web Audio API + `AudioWorklet` (`16kHz`, mono, `Int16` little endian).
   - Real-time 60fps canvas audio frequency visualizer and recording timer.
   - Multi-format export: **Markdown Report**, **Plain Text**, and **Structured JSON**.

---

## 🏗️ Architecture

```
                                  BROWSER
                       ┌────────────────────────────┐
                       │  getUserMedia (Mic)        │
                       │           ↓                │
                       │  AudioContext + Worklet    │
                       │  16kHz Mono Int16 PCM      │
                       └─────────────┬──────────────┘
                                     │ WebSocket (/ws/transcribe/{session_id})
                                     ▼
                                FASTAPI
                       ┌────────────────────────────┐
                       │  AudioAccumulator (WAV)    │
                       │  SessionManager (State)    │
                       └──────┬──────────────┬──────┘
                              │              │
        PATH A: LIVE STREAM   │              │ PATH B: POST-RECORDING
                              ▼              ▼
                    Gemini Live API       Gemini Transcribe & Summarizer
                    gemini-3.5-transcribe-live  gemini-3.5-transcribe / 2.5-flash
                              │              │
                   (Interim / Final text) (Diarization, Timestamps & Summary)
                              │              │
                              └──────┬───────┘
                                     ▼
                               UI PANELS
             ┌───────────────────────────────────────────────┐
             │ Live Stream │ Final Transcript │ Grounded     │
             │             │ (Diarized)       │ Summary      │
             └───────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+ and npm
- Python 3.10+ (tested on Python 3.13)
- (Optional) Docker and Docker Compose

### 2. Configure Environment
Copy `.env.example` to `.env` in the root (or `backend/.env`):
```bash
cp .env.example backend/.env
```
Edit `backend/.env` and add your Google Gemini API key:
```env
GEMINI_API_KEY=your_google_gemini_api_key_here
GEMINI_LIVE_MODEL=gemini-3.5-transcribe-live
GEMINI_FINAL_MODEL=gemini-3.5-transcribe
GEMINI_SUMMARY_MODEL=gemini-2.5-flash
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```
> **Note**: If `GEMINI_API_KEY` is omitted, the application operates in resilient simulation mode with bilingual Hausa/English judicial scenarios for local testing.

---

### 3. Local Development

#### Start Backend (FastAPI)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be available at `http://localhost:8000/docs`.

#### Start Frontend (React + Vite)
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

### 4. Docker Deployment (Production CPU VPS)

Run the full stack with Docker Compose:
```bash
docker-compose up --build -d
```
- Frontend: `http://<server-ip>:5173`
- Backend API: `http://<server-ip>:8000`

---

## 🧪 Testing

### Backend Unit & Integration Tests
```bash
cd backend
PYTHONPATH=backend pytest tests/ -v
```

### Frontend Unit Tests
```bash
cd frontend
npm test
```

---

## 📋 Manual Verification Checklist

1. **Microphone Setup**: Click "Start Recording", grant microphone permission, verify audio visualizer bars react to voice.
2. **Live English Speech**: Speak in English; verify interim text pulses and commits to the live transcript.
3. **Live Hausa Speech**: Speak in Hausa (*"Barkan ku da warhaka, yau zamu tattauna batun tsarin aiki na kotu"*); verify orthography is preserved without English translation.
4. **Code-Switching**: Mix English and Hausa in the same sentence; verify both languages appear faithfully.
5. **Stop & Finalize**: Click "Stop & Finalize"; verify the 3 processing stages:
   - `Final audio transcription`
   - `Speaker diarization & timestamp alignment`
   - `Grounded summarization`
6. **Authoritative Reconciliation**: Verify that the final transcript with speaker labels replaces the live transcript view.
7. **Speaker Renaming**: Click "Rename Speakers" or the edit icon next to `Speaker 1`, rename to a human name, and confirm updates across transcript segments, action item assignees, and speaker contributions.
8. **Evidence Navigation**: Click any `[seg_X]` badge in Decisions or Action Items; confirm the view smoothly scrolls to that transcript segment and pulses with a highlight ring.
9. **Export**: Click the "Export" button in the top header and download as Markdown, Plain Text, or JSON.
