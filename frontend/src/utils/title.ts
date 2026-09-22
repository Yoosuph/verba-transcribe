import type { MeetingSummary } from '../types/transcription';

/**
 * Derives a short meeting title from a summary's executive summary:
 * first sentence, capped at ~80 characters. Mirrors the backend
 * `SessionManager._derive_title` so local and server titles agree.
 */
export function deriveTitleFromSummary(summary?: MeetingSummary): string {
  const text = (summary?.executive_summary || '').trim();
  if (!text) return '';

  let cut = text;
  for (const sep of ['. ', '? ', '! ']) {
    const idx = text.indexOf(sep);
    if (idx > 10) {
      cut = text.slice(0, idx + 1);
      break;
    }
  }
  cut = cut.replace(/[.!?;\s]+$/, '');

  if (cut.length > 80) {
    cut = cut.slice(0, 77).replace(/\s+\S*$/, '') + '…';
  }
  return cut;
}

/** Default meeting title before a summary exists: `Meeting · YYYY-MM-DD HH:MM`. */
export function defaultMeetingTitle(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Meeting · ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
