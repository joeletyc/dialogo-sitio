// Pulls posts from the Facebook Page through the Graph API and stores them in data/posts.json.
// Images are downloaded and compressed into MEDIA_DIR so the site never depends on
// Facebook's expiring image links.
//
// Environment:
//   FB_PAGE_TOKEN   (required) Page access token
//   FB_PAGE_ID      (optional) defaults to config.facebook.page_id, then to the token's own page
//   GRAPH_API_BASE  (optional) defaults to https://graph.facebook.com (used for local testing)
//   FORCE_STATS=1   (optional) refresh reaction/comment counts on this run
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {
  loadConfig, readJSON, writeJSON, deriveTitle, slugify, formatDate, ymdParts, dirSize,
  POSTS_FILE, STATE_FILE, MEDIA_DIR,
} from './lib.mjs';

const config = loadConfig();
const fb = config.facebook;
const TZ = config.site.timezone;
const TOKEN = process.env.FB_PAGE_TOKEN;
const BASE = (process.env.GRAPH_API_BASE || 'https://graph.facebook.com').replace(/\/$/, '');
const VERSION = fb.graph_version || 'v26.0';
const MISSING_RUNS_BEFORE_DELETE = 3;
const STATS_REFRESH_HOURS = 6;
const HIRES_LOOKUPS_PER_RUN = 80;
const BACKFILL_PAGES_PER_RUN = +(process.env.BACKFILL_PAGES || 12);
const PAGE_SIZE = +(process.env.PAGE_SIZE || 50);

const log = (...a) => console.log('[facebook]', ...a);

if (!TOKEN) {
  console.error('Falta FB_PAGE_TOKEN. Agrega el token de la página en GitHub > Settings > Secrets and variables > Actions.');
  process.exit(1);
}

class GraphError extends Error {
  constructor(err, status) {
    super(err?.message || `HTTP ${status}`);
    this.code = err?.code; this.subcode = err?.error_subcode; this.status = status;
  }
  get isAuth() { return this.code === 190 || this.code === 102 || this.code === 463 || this.code === 467; }
  get isRateLimit() { return [4, 17, 32, 613, 80001].includes(this.code); }
  get isPermission() { return this.code === 10 || this.code === 200 || (this.code >= 200 && this.code < 300); }
}

async function graph(urlOrPath, params = {}) {
  let url;
  if (/^https?:/.test(urlOrPath)) {
    // Paging URLs from Facebook already carry the token. Rewrite host for local testing.
    url = new URL(urlOrPath);
    if (process.env.GRAPH_API_BASE) {
      const b = new URL(BASE);
      url.protocol = b.protocol; url.host = b.host;
    }
  } else {
    url = new URL(`${BASE}/${VERSION}/${urlOrPath.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('access_token', TOKEN);
  }
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    } catch (e) {
      if (attempt < 3) { await sleep(2000 * attempt); continue; }
      throw e;
    }
    const body = await res.json().catch(() => ({}));
    if (res.ok && !body.error) return body;
    const err = new GraphError(body.error, res.status);
    if (res.status >= 500 && attempt < 3) { await sleep(2000 * attempt); continue; }
    throw err;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const BASE_FIELDS = [
  'id', 'message', 'created_time', 'permalink_url', 'full_picture', 'status_type',
  'attachments{media_type,type,title,description,url,unshimmed_url,media{image{src,width,height}},target{id,url},subattachments.limit(30){media_type,type,url,media{image{src,width,height}},target{id,url}}}',
];
const STATS_FIELDS = ['shares', 'reactions.summary(total_count).limit(0)', 'comments.summary(total_count).limit(0)'];

function postsQuery(withStats, limit) {
  return {
    fields: [...BASE_FIELDS, ...(withStats ? STATS_FIELDS : [])].join(','),
    limit: String(limit),
  };
}

// ---------- normalization ----------

function classify(raw) {
  const att = raw.attachments?.data?.[0];
  const out = { type: 'text', media: [], video_url: null, link: null };
  if (!att) {
    if (raw.full_picture) { out.type = 'photo'; out.media.push({ src: raw.full_picture, id: null }); }
    return out;
  }
  const mt = (att.media_type || '').toLowerCase();
  const t = (att.type || '').toLowerCase();
  if (t === 'profile_media' || t === 'cover_photo' || raw.status_type === 'added_profile_picture') {
    out.skip = true; return out;
  }
  const subs = att.subattachments?.data || [];
  if (subs.length > 1 || mt === 'album') {
    out.type = 'album';
    for (const s of subs) {
      const src = s.media?.image?.src;
      if (src) out.media.push({ src, id: (s.media_type === 'photo' && s.target?.id) || null, w: s.media.image.width, h: s.media.image.height });
    }
    if (!out.media.length && att.media?.image?.src) out.media.push({ src: att.media.image.src, id: null });
    if (out.media.length === 1) out.type = 'photo';
    return out;
  }
  if (mt === 'video' || t.includes('video') || t === 'animated_image_video') {
    out.type = 'video';
    out.video_url = att.target?.url || att.url || raw.permalink_url;
    const src = att.media?.image?.src || raw.full_picture;
    if (src) out.media.push({ src, id: null });
    return out;
  }
  if (mt === 'photo' || t === 'photo') {
    out.type = 'photo';
    const src = att.media?.image?.src || raw.full_picture;
    if (src) out.media.push({ src, id: att.target?.id || null, w: att.media?.image?.width, h: att.media?.image?.height });
    return out;
  }
  if (mt === 'link' || t === 'share' || att.unshimmed_url || att.url) {
    out.type = 'link';
    const url = att.unshimmed_url || att.url || att.target?.url;
    out.link = { url, title: att.title || '', description: att.description || '' };
    try { out.link.domain = new URL(url).hostname.replace(/^www\./, ''); } catch { out.link.domain = ''; }
    const src = att.media?.image?.src || raw.full_picture;
    if (src) out.media.push({ src, id: null });
    return out;
  }
  if (att.media?.image?.src || raw.full_picture) {
    out.type = 'photo';
    out.media.push({ src: att.media?.image?.src || raw.full_picture, id: null });
  }
  return out;
}

function normalize(raw) {
  const c = classify(raw);
  if (c.skip) return null;
  const message = (raw.message || '').trim();
  if (!message && !c.media.length && !c.link) return null;
  const lower = message.toLowerCase();
  if ((fb.exclude_hashtags || []).some(h => lower.includes(h.toLowerCase()))) return null;

  const fallback = c.link?.title || `Publicación del ${formatDate(raw.created_time, TZ, false)}`;
  const { title, kicker, body } = deriveTitle(message, fallback);
  const stats = raw.reactions || raw.comments || raw.shares ? {
    reactions: raw.reactions?.summary?.total_count ?? 0,
    comments: raw.comments?.summary?.total_count ?? 0,
    shares: raw.shares?.count ?? 0,
  } : null;
  const mediaKey = c.media.map(m => m.id || 'x').join(',') + '|' + c.media.length;
  return {
    id: raw.id,
    created: new Date(raw.created_time).toISOString(),
    permalink: raw.permalink_url || `https://www.facebook.com/${raw.id}`,
    type: c.type,
    title, kicker, body, message,
    video_url: c.video_url,
    link: c.link,
    stats,
    _media: c.media,
    _hash: crypto.createHash('sha1').update(message + '\n' + c.type + '\n' + mediaKey + '\n' + JSON.stringify(c.link)).digest('hex').slice(0, 16),
    _mediaKey: crypto.createHash('sha1').update(mediaKey).digest('hex').slice(0, 12),
  };
}

// ---------- media ----------

let hiresLookups = 0;
async function bestImageUrl(m) {
  if (!m.id || hiresLookups >= HIRES_LOOKUPS_PER_RUN) return m.src;
  hiresLookups++;
  try {
    const r = await graph(m.id, { fields: 'images' });
    const imgs = (r.images || []).filter(i => i.source).sort((a, b) => b.width - a.width);
    const pick = imgs.find(i => i.width <= 1600) || imgs[imgs.length - 1];
    return pick?.source || m.src;
  } catch { return m.src; }
}

async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1500 * attempt);
    }
  }
}

function mediaBase(post, n) {
  const { y, m } = ymdParts(post.created, TZ);
  const safeId = post.id.replace(/[^0-9_]/g, '');
  return path.posix.join(y, m, `${safeId}-${n}`);
}

async function saveImage(buf, rel) {
  const full = path.join(MEDIA_DIR, rel + '.jpg');
  const thumb = path.join(MEDIA_DIR, rel + '-sm.webp');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const img = sharp(buf, { failOn: 'none' }).rotate();
  const info = await img.clone().resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 74, mozjpeg: true, progressive: true }).toFile(full);
  await img.clone().resize({ width: 560, height: 700, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 66 }).toFile(thumb);
  return { file: `media/${rel}.jpg`, thumb: `media/${rel}-sm.webp`, w: info.width, h: info.height };
}

async function downloadMedia(post, mediaList) {
  const images = [];
  const max = 12;
  for (let n = 0; n < Math.min(mediaList.length, max); n++) {
    const url = await bestImageUrl(mediaList[n]);
    const buf = await download(url);
    images.push(await saveImage(buf, mediaBase(post, n)));
  }
  return images;
}

function removeMedia(post) {
  for (const img of post.images || []) {
    for (const f of [img.file, img.thumb]) {
      if (f) fs.rmSync(path.join(MEDIA_DIR, f.replace(/^media\//, '')), { force: true });
    }
  }
}

// Keeps all photos under a size budget so the site stays below GitHub Pages' 1 GB limit.
// Newest posts keep full quality; when over budget, the oldest posts are reduced first:
// level 1 shrinks the large photo to 720 px, level 2 keeps only the small version.
async function enforceMediaBudget(posts) {
  const budget = (fb.media_budget_mb ?? 800) * 1048576;
  let total = dirSize(MEDIA_DIR);
  if (total <= budget) return 0;
  const oldestFirst = posts.slice().sort((a, b) => a.created.localeCompare(b.created));
  const abs = f => path.join(MEDIA_DIR, f.replace(/^media\//, ''));
  let n = 0;
  for (const level of [1, 2]) {
    for (const p of oldestFirst) {
      if (total <= budget) return n;
      if ((p.compacted || 0) >= level || !p.images?.length) continue;
      for (const img of p.images) {
        const full = abs(img.file);
        if (!fs.existsSync(full) || img.file === img.thumb) continue;
        const before = fs.statSync(full).size;
        if (level === 1) {
          const out = await sharp(fs.readFileSync(full)).resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 66, mozjpeg: true }).toBuffer({ resolveWithObject: true });
          fs.writeFileSync(full, out.data);
          img.w = out.info.width; img.h = out.info.height;
          total -= before - out.data.length;
        } else {
          const meta = await sharp(abs(img.thumb)).metadata();
          fs.rmSync(full, { force: true });
          img.file = img.thumb; img.w = meta.width; img.h = meta.height;
          total -= before;
        }
      }
      p.compacted = level; n++;
    }
  }
  if (total > budget) log(`Aviso: las imágenes ocupan ${(total / 1048576).toFixed(0)} MB, más que el límite configurado.`);
  return n;
}

// ---------- main ----------

async function fetchPosts(pageId, { limit, startUrl, withStats, maxPages = Infinity }) {
  const results = [];
  let next = startUrl || null;
  let first = !startUrl;
  let pages = 0;
  while ((first || next) && results.length < limit && pages < maxPages) {
    const r = first
      ? await graph(`${pageId}/posts`, postsQuery(withStats, Math.min(PAGE_SIZE, limit)))
      : await graph(next);
    first = false; pages++;
    results.push(...(r.data || []));
    next = r.paging?.next || null;
  }
  return { results: results.slice(0, limit), next };
}

async function main() {
  const store = readJSON(POSTS_FILE, { posts: [] });
  const state = readJSON(STATE_FILE, {});
  const byId = new Map(store.posts.map(p => [p.id, p]));
  const before = JSON.stringify(store.posts);
  let added = 0, edited = 0, removed = 0, failedMedia = 0, missingChanged = false;

  let pageId = process.env.FB_PAGE_ID || fb.page_id;
  let pageInfo;
  try {
    pageInfo = await graph(pageId ? pageId : 'me', { fields: 'id,name,link' });
  } catch (e) {
    if (e instanceof GraphError && e.isAuth) {
      console.error(`El token de Facebook no es válido o expiró (${e.message}). Genera uno nuevo siguiendo SETUP.md, paso 3.`);
      process.exit(1);
    }
    throw e;
  }
  pageId = pageInfo.id;
  log(`Página: ${pageInfo.name} (${pageId})`);

  const initial = store.posts.length === 0;
  const now = Date.now();
  const statsDue = process.env.FORCE_STATS === '1' || !state.stats_refreshed || now - Date.parse(state.stats_refreshed) > STATS_REFRESH_HOURS * 3600e3;
  let withStats = state.stats_supported !== false || !state.stats_checked || now - Date.parse(state.stats_checked) > 24 * 3600e3;

  const limit = initial ? fb.initial_import_limit || 600 : fb.recent_window || 50;
  let fetched;
  try {
    fetched = await fetchPosts(pageId, { limit, withStats, maxPages: initial ? BACKFILL_PAGES_PER_RUN : Infinity });
    if (withStats) { state.stats_supported = true; }
  } catch (e) {
    if (e instanceof GraphError && e.isPermission && withStats) {
      log(`Sin permiso para contar reacciones/comentarios (${e.message}). Se continúa sin esos datos.`);
      state.stats_supported = false; state.stats_checked = new Date().toISOString();
      withStats = false;
      fetched = await fetchPosts(pageId, { limit, withStats, maxPages: initial ? BACKFILL_PAGES_PER_RUN : Infinity });
    } else if (e instanceof GraphError && e.isAuth) {
      console.error(`El token de Facebook no es válido o expiró (${e.message}). Genera uno nuevo siguiendo SETUP.md, paso 3.`);
      process.exit(1);
    } else if (e instanceof GraphError && e.isRateLimit) {
      log(`Facebook limitó las solicitudes (${e.message}). Se intentará en la próxima ejecución.`);
      return finish(false);
    } else throw e;
  }
  if (initial) {
    state.backfill = fetched.next && fetched.results.length < limit ? { next: fetched.next, count: fetched.results.length } : { done: true };
  }

  // Continue an interrupted initial import a few pages per run.
  let backfillRaw = [];
  if (!initial && state.backfill?.next && !state.backfill.done) {
    try {
      const remaining = (fb.initial_import_limit || 600) - (state.backfill.count || 0);
      const r = await fetchPosts(pageId, { limit: remaining, startUrl: state.backfill.next, withStats, maxPages: BACKFILL_PAGES_PER_RUN });
      backfillRaw = r.results;
      state.backfill.count = (state.backfill.count || 0) + r.results.length;
      state.backfill.next = r.next;
      if (!r.next || state.backfill.count >= (fb.initial_import_limit || 600)) state.backfill = { done: true };
      log(`Importación inicial: +${r.results.length} publicaciones antiguas.`);
    } catch (e) {
      log(`Importación inicial pausada: ${e.message}`);
    }
  }

  const seen = new Set();

  async function ingest(raw) {
    const n = normalize(raw);
    seen.add(raw.id);
    if (!n) {
      // A post we kept earlier may have become non-publishable (e.g. text removed).
      return;
    }
    const existing = byId.get(n.id);
    const { _media, _hash, _mediaKey, stats, ...fields } = n;
    if (!existing) {
      const { y, m, d } = ymdParts(n.created, TZ);
      const post = { ...fields, slug: `${y}-${m}-${d}-${slugify(n.title)}-${n.id.split('_').pop().slice(-6)}`, images: [], hash: _hash, media_key: _mediaKey, stats: stats || null, missing: 0 };
      try {
        post.images = await downloadMedia(post, _media);
      } catch (e) {
        log(`No se pudo descargar la imagen de ${n.id}: ${e.message}. Se reintentará.`);
        removeMedia(post);
        post.images = []; post.pending_media = true; failedMedia++;
      }
      byId.set(post.id, post); added++;
      return;
    }
    if (existing.missing) { existing.missing = 0; missingChanged = true; }
    if (stats && statsDue) existing.stats = stats;
    if (existing.hash !== _hash || existing.pending_media) {
      const mediaChanged = existing.pending_media || existing.media_key !== _mediaKey;
      Object.assign(existing, fields);
      if (mediaChanged) {
        try {
          const imgs = await downloadMedia(existing, _media);
          // Files share names by index; remove leftovers if the post now has fewer images.
          for (const old of existing.images.slice(imgs.length)) removeMedia({ images: [old] });
          existing.images = imgs; delete existing.pending_media; delete existing.compacted;
        } catch (e) {
          log(`No se pudo actualizar la imagen de ${existing.id}: ${e.message}`);
          existing.pending_media = true; failedMedia++;
        }
      }
      existing.hash = _hash; existing.media_key = _mediaKey;
      edited++;
    }
  }

  for (const raw of [...fetched.results, ...backfillRaw]) await ingest(raw);

  // Posts deleted on Facebook: anything inside the fetched time window that did not come back.
  if (!initial && fb.remove_deleted !== false && fetched.results.length) {
    const oldest = Math.min(...fetched.results.map(r => Date.parse(r.created_time)));
    for (const p of byId.values()) {
      if (seen.has(p.id) || Date.parse(p.created) < oldest) continue;
      p.missing = (p.missing || 0) + 1; missingChanged = true;
      if (p.missing >= MISSING_RUNS_BEFORE_DELETE) {
        log(`Eliminada en Facebook, se quita del sitio: ${p.title}`);
        removeMedia(p); byId.delete(p.id); removed++;
      }
    }
  }

  const posts = [...byId.values()].sort((a, b) => b.created.localeCompare(a.created));
  const compacted = await enforceMediaBudget(posts);

  log(`Nuevas: ${added} · Editadas: ${edited} · Eliminadas: ${removed} · Imágenes reducidas: ${compacted} · Imágenes pendientes: ${failedMedia}`);

  const contentChanged = added || edited || removed || compacted;
  const after = JSON.stringify(posts);
  if (after !== before && (contentChanged || statsDue || missingChanged)) {
    if (statsDue && withStats) state.stats_refreshed = new Date().toISOString();
    writeJSON(POSTS_FILE, { updated: new Date().toISOString(), page: { id: pageId, name: pageInfo.name }, posts });
  }
  return finish(true);

  function finish(ok) {
    // Only persistent settings live in state.json so unchanged runs produce no commit.
    writeJSON(STATE_FILE, state);
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `### Facebook\n- Página: ${pageInfo?.name || '?'}\n- Nuevas: ${added}, editadas: ${edited}, eliminadas: ${removed}\n- Imágenes pendientes: ${failedMedia}\n- Total en el sitio: ${byId.size}\n- ${ok ? 'OK' : 'Pausado por límite de Facebook'}\n`);
    }
  }
}

main().catch(e => {
  console.error('[facebook] Error:', e.message);
  process.exit(1);
});
