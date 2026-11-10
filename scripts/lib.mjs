// Shared helpers for the fetch and build scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
export const STATE_FILE = path.join(DATA_DIR, 'state.json');
export const MEDIA_DIR = process.env.MEDIA_DIR ? path.resolve(process.env.MEDIA_DIR) : path.join(ROOT, 'media');

export function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
}

export function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = JSON.stringify(value, null, 1) + '\n';
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu;

export function stripEmoji(s) {
  return s.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').trim();
}

export function slugify(s, maxWords = 9) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(EMOJI, ' ')
    .replace(/#\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim().split(/[\s-]+/).filter(Boolean).slice(0, maxWords).join('-') || 'publicacion';
}

function humanizeTag(tag) {
  let t = tag.replace(/^#/, '').replace(/_/g, ' ');
  if (t === t.toUpperCase()) return t.charAt(0) + t.slice(1).toLowerCase();
  t = t.replace(/([a-záéíóúñü])([A-ZÁÉÍÓÚÑÜ])/g, '$1 $2');
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

const TITLE_MAX = 150;

// Facebook posts have no headline field. Derive one from the text:
// skip lead lines that are only hashtags/emoji (use the first hashtag as a kicker),
// take the next line as the headline, and keep the full text as the body.
export function deriveTitle(message, fallback) {
  const lines = (message || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let kicker = '';
  let i = 0;
  for (; i < lines.length; i++) {
    const clean = stripEmoji(lines[i]);
    const withoutTags = clean.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[|•·:\-–—]+/g, ' ').trim();
    if (withoutTags.length >= 12) break;
    if (!kicker) {
      const tag = clean.match(/#[\p{L}\p{N}_]+/u);
      if (tag) kicker = humanizeTag(tag[0]);
      else if (withoutTags.length >= 3) kicker = withoutTags === withoutTags.toUpperCase() ? withoutTags.charAt(0) + withoutTags.slice(1).toLowerCase() : withoutTags;
    }
  }
  if (i >= lines.length) {
    return { title: fallback, kicker, body: message || '', truncated: false };
  }
  let line = stripEmoji(lines[i]).replace(/\s+#[\p{L}\p{N}_]+$/gu, '').trim();
  let title = line;
  let truncated = false;
  if (title.length > TITLE_MAX) {
    const sentence = title.slice(0, TITLE_MAX).match(/^(.{40,}?)([.!?;:])\s/u);
    if (sentence) title = sentence[2] === ';' || sentence[2] === ':' ? sentence[1] : sentence[1] + sentence[2];
    else title = title.slice(0, TITLE_MAX - 10).replace(/\s+\S*$/, '') + '…';
    truncated = true;
  }
  // Body: everything after the headline line, or the full text when the headline was shortened.
  const rawLines = (message || '').split(/\r?\n/);
  let body;
  if (truncated) body = message;
  else {
    const idx = rawLines.findIndex(l => l.trim() === lines[i]);
    body = rawLines.slice(idx + 1).join('\n').replace(/^\s+/, '');
  }
  return { title, kicker, body, truncated };
}

export function formatDate(iso, tz, withTime = true) {
  const d = new Date(iso);
  const opts = { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: 'numeric', minute: '2-digit', hour12: true });
  return new Intl.DateTimeFormat('es-MX', opts).format(d).replace(/\s?a\.\s?m\./, ' a. m.').replace(/\s?p\.\s?m\./, ' p. m.');
}

export function ymdParts(iso, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = t => parts.find(p => p.type === t).value;
  return { y: get('year'), m: get('month'), d: get('day') };
}

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

export function dirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}
