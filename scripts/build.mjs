// Generates the static site in dist/ from data/posts.json and config.json.
//
// Environment:
//   BASE_PATH  path prefix when the site is not served from the domain root (e.g. /dialogo-sitio)
//   SITE_URL   absolute site URL used in feeds, sitemaps and share links
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, POSTS_FILE, MEDIA_DIR, loadConfig, readJSON, stripEmoji, formatDate, ymdParts, MONTHS, rmrf, dirSize,
} from './lib.mjs';

const config = loadConfig();
const S = config.site;
const TZ = S.timezone;
const DIST = path.join(ROOT, 'dist');
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');
const SITE_URL = (process.env.SITE_URL || S.url).replace(/\/$/, '');
const YEAR = new Date().getFullYear();
const BUILD_ID = Date.now().toString(36);

const store = readJSON(POSTS_FILE, { posts: [] });
const posts = store.posts.slice().sort((a, b) => b.created.localeCompare(a.created));

// ---------- helpers ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const u = p => BASE + p;
const abs = p => SITE_URL + p;
const postPath = p => `/noticia/${p.slug}/`;
const imgUrl = f => u('/' + f);

function clock(iso) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))
    .replace(/\s?a\.\s?m\./, ' a. m.').replace(/\s?p\.\s?m\./, ' p. m.');
}

function shortDate(iso) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace('.', '');
  const time = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
    .replace(/\s?a\.\s?m\./, ' a. m.').replace(/\s?p\.\s?m\./, ' p. m.');
  return `${date}, ${time}`;
}

function excerpt(p, max = 170) {
  let t = stripEmoji((p.body || p.message || '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/https?:\/\/\S+/g, ''))
    .replace(/\s+/g, ' ').trim();
  if (!t && p.link?.description) t = p.link.description;
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function richText(text) {
  if (!text) return '';
  const paras = text.trim().split(/\n\s*\n/);
  return paras.map(par => {
    let h = esc(par.trim());
    h = h.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, m => `<a href="${m}" rel="nofollow noopener" target="_blank">${m.length > 60 ? m.slice(0, 57) + '…' : m}</a>`);
    h = h.replace(/(^|\s)(#[\p{L}\p{N}_]+)/gu, '$1<span class="tag">$2</span>');
    h = h.replace(/\n/g, '<br>');
    return `<p>${h}</p>`;
  }).join('\n');
}

function picture(img, { sizes = '100vw', eager = false, alt = '', cls = '' } = {}) {
  if (!img) return '';
  const srcset = img.thumb && img.thumb !== img.file ? ` srcset="${imgUrl(img.thumb)} 560w, ${imgUrl(img.file)} ${img.w}w" sizes="${sizes}"` : '';
  return `<img class="${cls}" src="${imgUrl(img.file)}"${srcset} width="${img.w}" height="${img.h}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

function adSlot(name, size) {
  const code = config.ads.slots?.[name];
  if (code) return `<div class="ad ad--${size}" data-slot="${name}">${code}</div>`;
  if (!config.ads.show_placeholders) return '';
  return `<div class="ad ad--${size} ad--empty" data-slot="${name}">
  <span>${esc(config.ads.placeholder_text)}</span>
  <a href="${u('/contacto/')}">${esc(config.ads.placeholder_cta)}</a>
</div>`;
}

const ICONS = {
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.6 21.5l4.9-1.3A9.4 9.4 0 1 0 12 2.5zm0 17.2c-1.5 0-2.9-.4-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3a7.8 7.8 0 1 1 6.7 3.6zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.4 6.4 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3.9 2.4c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1l-.5-.3z"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 3h3l-6.6 7.6L21.7 21h-6.1l-4.8-6.2L5.3 21h-3l7.1-8.1L2 3h6.2l4.3 5.7L17.5 3zm-1 16.2h1.7L7.6 4.7H5.8l10.7 14.5z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0zM21 8.1c-.1-1.5-.4-2.8-1.5-3.9S17.4 2.8 15.9 2.7C14.4 2.6 9.6 2.6 8.1 2.7 6.6 2.8 5.3 3.1 4.2 4.2S2.8 6.6 2.7 8.1c-.1 1.5-.1 6.3 0 7.8.1 1.5.4 2.8 1.5 3.9s2.4 1.4 3.9 1.5c1.5.1 6.3.1 7.8 0 1.5-.1 2.8-.4 3.9-1.5s1.4-2.4 1.5-3.9c.1-1.5.1-6.3 0-7.8zm-2 9.4a3.1 3.1 0 0 1-1.7 1.7c-1.2.5-4.1.4-5.3.4s-4.1.1-5.3-.4a3.1 3.1 0 0 1-1.7-1.7c-.5-1.2-.4-4.1-.4-5.5s-.1-4.1.4-5.3a3.1 3.1 0 0 1 1.7-1.7c1.2-.5 4.1-.4 5.3-.4s4.1-.1 5.3.4a3.1 3.1 0 0 1 1.7 1.7c.5 1.2.4 4.1.4 5.3s.1 4.1-.4 5.5z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3L10 15z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-1.8-2.5V9.8a5.7 5.7 0 1 0 4.9 5.6V9.1a7.3 7.3 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 6 12l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0zM8.5 19.5a4 4 0 0 1-2.8-6.8l2.1-2.1a1 1 0 0 1 1.4 1.4L7.1 14a2 2 0 0 0 2.8 2.8l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1a4 4 0 0 1-2.8 1.3zm7.4-6.2a1 1 0 0 1-.7-1.7l2.1-2.1a2 2 0 1 0-2.8-2.8l-2.1 2.1a1 1 0 0 1-1.4-1.4l2.1-2.1a4 4 0 0 1 5.6 5.6l-2.1 2.1a1 1 0 0 1-.7.3z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
};

const SOCIAL_LABEL = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', youtube: 'YouTube', tiktok: 'TikTok' };
const socialLinks = Object.entries(config.social).filter(([, v]) => v)
  .map(([k, v]) => `<a class="social" href="${esc(v)}" target="_blank" rel="noopener" aria-label="${SOCIAL_LABEL[k]}">${ICONS[k]}</a>`).join('');

function brand(tag = 'span') {
  if (S.logo) return `<${tag} class="brand brand--img"><img src="${u('/' + S.logo.replace(/^\//, ''))}" alt="${esc(S.name)}" width="220" height="64"></${tag}>`;
  return `<${tag} class="brand">${esc(S.name)}</${tag}>`;
}

// ---------- layout ----------

function layout({ title, description, pathname, body, image, type = 'website', jsonld, extraHead = '', current = '' }) {
  const fullTitle = title ? `${title} | ${S.name}` : `${S.name}: ${S.tagline}`;
  const desc = description || S.description;
  const ogImage = image ? abs('/' + image.file) : abs('/assets/img/og-default.png');
  const nav = [
    ['inicio', '/', 'Inicio'],
    ['noticias', '/noticias/', 'Noticias'],
    ['archivo', '/archivo/', 'Archivo'],
    ['nosotros', '/nosotros/', 'Nosotros'],
    ['contacto', '/contacto/', 'Contacto'],
  ].map(([k, href, label]) => `<li><a href="${u(href)}"${k === current ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  const ticker = posts.slice(0, config.layout.ticker_count).map(p => `<li><a href="${u(postPath(p))}">${esc(p.title)}</a></li>`).join('');

  return `<!doctype html>
<html lang="${S.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${abs(pathname)}">
<meta name="theme-color" content="#d2101a">
<meta property="og:site_name" content="${esc(S.name)}">
<meta property="og:locale" content="es_MX">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title || S.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${abs(pathname)}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${u('/assets/img/favicon.svg')}" type="image/svg+xml">
<link rel="icon" href="${u('/assets/img/favicon-32.png')}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${u('/assets/img/apple-touch-icon.png')}">
<link rel="alternate" type="application/rss+xml" title="${esc(S.name)}" href="${u('/feed.xml')}">
<link rel="preload" href="${u('/assets/fonts/archivo-latin-wdth-normal.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${u('/assets/css/style.css')}?v=${BUILD_ID}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
${extraHead}
${config.analytics?.head_html || ''}
</head>
<body data-base="${BASE}">
<a class="skip" href="#contenido">Saltar al contenido</a>
<div class="topbar">
  <div class="wrap topbar__in">
    <span class="topbar__date"><span id="hoy"></span><span>${esc(S.city)}</span></span>
    <span class="topbar__social">${socialLinks}</span>
  </div>
</div>
<header class="masthead">
  <div class="wrap masthead__in">
    <a class="masthead__home" href="${u('/')}" aria-label="${esc(S.name)}, ir al inicio">${brand()}</a>
    <p class="masthead__tagline">${esc(S.tagline)}</p>
    ${adSlot('header', 'leader')}
  </div>
</header>
<nav class="mainnav" aria-label="Principal">
  <div class="wrap mainnav__in">
    <ul>${nav}</ul>
    <a class="mainnav__search" href="${u('/buscar/')}"${current === 'buscar' ? ' aria-current="page"' : ''}>${ICONS.search}<span>Buscar</span></a>
  </div>
</nav>
${ticker ? `<div class="ticker"><div class="wrap ticker__in"><span class="bubble-tag">Lo último</span><ul>${ticker}</ul></div></div>` : ''}
<main id="contenido">
${body}
</main>
<footer class="footer">
  <div class="wrap footer__in">
    <div class="footer__brand">
      <a href="${u('/')}" aria-label="${esc(S.name)}">${brand()}</a>
      <p>${esc(S.tagline)}</p>
      <p class="footer__social">${socialLinks}</p>
    </div>
    <nav class="footer__nav" aria-label="Pie de página">
      <ul>
        <li><a href="${u('/noticias/')}">Noticias</a></li>
        <li><a href="${u('/archivo/')}">Archivo</a></li>
        <li><a href="${u('/buscar/')}">Buscar</a></li>
        <li><a href="${u('/nosotros/')}">Nosotros</a></li>
        <li><a href="${u('/contacto/')}">Contacto</a></li>
        <li><a href="${u('/aviso-de-privacidad/')}">Aviso de privacidad</a></li>
        <li><a href="${u('/feed.xml')}">RSS</a></li>
      </ul>
    </nav>
    <p class="footer__legal">© ${YEAR} ${esc(S.name)}. ${esc(S.city)}. Todas las notas se publican primero en nuestra <a href="${esc(config.facebook.page_url)}" target="_blank" rel="noopener">página de Facebook</a>.</p>
  </div>
</footer>
<script src="${u('/assets/js/main.js')}?v=${BUILD_ID}" defer></script>
</body>
</html>
`;
}

// ---------- components ----------

function meta(p) {
  return `<time datetime="${p.created}">${shortDate(p.created)}</time>`;
}

function kicker(p) {
  if (p.type === 'video') return '<span class="kicker kicker--video">Video</span>';
  if (p.kicker) return `<span class="kicker">${esc(p.kicker)}</span>`;
  return '';
}

function card(p, { sizes = '(min-width: 1100px) 340px, (min-width: 700px) 45vw, 100vw' } = {}) {
  const img = p.images?.[0];
  if (!img) {
    return `<article class="card card--text">
  <a class="card__bubble" href="${u(postPath(p))}">
    ${kicker(p)}
    <h3 class="card__title">${esc(p.title)}</h3>
    ${excerpt(p, 140) ? `<p class="card__quote">${esc(excerpt(p, 140))}</p>` : ''}
  </a>
  <p class="card__meta">${meta(p)}</p>
</article>`;
  }
  return `<article class="card">
  <a class="card__media${p.type === 'video' ? ' is-video' : ''}" href="${u(postPath(p))}" tabindex="-1" aria-hidden="true">${picture(img, { sizes })}${p.type === 'video' ? `<span class="play">${ICONS.play}</span>` : ''}${p.images.length > 1 ? `<span class="count">${p.images.length} fotos</span>` : ''}</a>
  ${kicker(p)}
  <h3 class="card__title"><a href="${u(postPath(p))}">${esc(p.title)}</a></h3>
  <p class="card__meta">${meta(p)}</p>
</article>`;
}

function row(p) {
  const img = p.images?.[0];
  return `<article class="row${img ? '' : ' row--noimg'}">
  ${img ? `<a class="row__media${p.type === 'video' ? ' is-video' : ''}" href="${u(postPath(p))}" tabindex="-1" aria-hidden="true">${picture(img, { sizes: '120px' })}${p.type === 'video' ? `<span class="play">${ICONS.play}</span>` : ''}</a>` : ''}
  <div>
    <h3 class="row__title"><a href="${u(postPath(p))}">${esc(p.title)}</a></h3>
    <p class="card__meta">${meta(p)}</p>
  </div>
</article>`;
}

function sectionTitle(text, id) {
  return `<h2 class="section-title"${id ? ` id="${id}"` : ''}>${esc(text)}</h2>`;
}

function trending() {
  const since = Date.now() - config.layout.trending_days * 86400e3;
  const score = p => (p.stats?.reactions || 0) + 2 * (p.stats?.comments || 0) + 3 * (p.stats?.shares || 0);
  const list = posts.filter(p => p.stats && Date.parse(p.created) >= since && score(p) > 0)
    .sort((a, b) => score(b) - score(a)).slice(0, config.layout.trending_count);
  if (list.length < 3) return '';
  return `<section class="trending" aria-labelledby="mas-comentadas">
  ${sectionTitle('Lo más comentado de la semana', 'mas-comentadas')}
  <ol>${list.map(p => `<li><a href="${u(postPath(p))}">${esc(p.title)}</a></li>`).join('')}</ol>
</section>`;
}

function followBox() {
  return `<section class="follow">
  <p class="follow__title">Síguenos en Facebook</p>
  <p>Publicamos ahí primero, en cuanto pasa.</p>
  <a class="btn btn--red" href="${esc(config.facebook.page_url)}" target="_blank" rel="noopener">${ICONS.facebook}<span>Seguir a ${esc(S.name)}</span></a>
</section>`;
}

function sidebar() {
  return `<aside class="sidebar" aria-label="Más de ${esc(S.name)}">
  ${trending()}
  ${adSlot('sidebar', 'box')}
  ${followBox()}
</aside>`;
}

function pager(page, total, prefix) {
  if (total <= 1) return '';
  const href = n => u(n === 1 ? prefix : `${prefix}pagina/${n}/`);
  const nums = [];
  for (let n = 1; n <= total; n++) {
    if (n === 1 || n === total || Math.abs(n - page) <= 2) nums.push(n);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return `<nav class="pager" aria-label="Páginas">
  ${page > 1 ? `<a class="pager__step" href="${href(page - 1)}" rel="prev">Anteriores</a>` : ''}
  <ul>${nums.map(n => n === '…' ? '<li><span>…</span></li>' : `<li>${n === page ? `<span aria-current="page">${n}</span>` : `<a href="${href(n)}">${n}</a>`}</li>`).join('')}</ul>
  ${page < total ? `<a class="pager__step" href="${href(page + 1)}" rel="next">Siguientes</a>` : ''}
</nav>`;
}

function emptyState() {
  return `<section class="wrap empty">
  <h1>Las noticias aparecerán aquí</h1>
  <p>Este sitio se llena solo con lo que publicamos en Facebook. Mientras tanto, puedes leernos ahí.</p>
  <a class="btn btn--red" href="${esc(config.facebook.page_url)}" target="_blank" rel="noopener">${ICONS.facebook}<span>Ir a Facebook</span></a>
</section>`;
}

// ---------- pages ----------

function writePage(rel, html) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

function homePage() {
  if (!posts.length) return layout({ pathname: '/', body: emptyState(), current: 'inicio' });
  const withImg = posts.filter(p => p.images?.length);
  const lead = withImg[0] || posts[0];
  const rest = posts.filter(p => p !== lead);
  const secondary = rest.slice(0, 4);
  const grid = rest.slice(4, 4 + config.layout.posts_per_page);
  const leadImg = lead.images?.[0];
  const hero = `<section class="hero wrap" aria-label="Principal">
  <article class="lead${leadImg ? '' : ' lead--noimg'}">
    ${leadImg ? `<a class="lead__media${lead.type === 'video' ? ' is-video' : ''}" href="${u(postPath(lead))}" tabindex="-1" aria-hidden="true">${picture(leadImg, { sizes: '(min-width: 1100px) 720px, 100vw', eager: true })}${lead.type === 'video' ? `<span class="play">${ICONS.play}</span>` : ''}</a>` : ''}
    <div class="lead__panel">
      ${kicker(lead)}
      <h1 class="lead__title"><a href="${u(postPath(lead))}">${esc(lead.title)}</a></h1>
      ${excerpt(lead, 220) ? `<p class="lead__dek">${esc(excerpt(lead, 220))}</p>` : ''}
      <p class="card__meta">${meta(lead)}</p>
    </div>
  </article>
  <div class="hero__side">${secondary.map(row).join('')}</div>
</section>`;
  const body = `${hero}
<div class="wrap">${adSlot('home_mid', 'wide')}</div>
<div class="wrap columns">
  <section class="latest" aria-labelledby="recientes">
    ${sectionTitle('Noticias recientes', 'recientes')}
    <div class="grid">${grid.map(p => card(p)).join('')}</div>
    ${posts.length > 5 + grid.length ? `<p class="more"><a class="btn btn--outline" href="${u('/noticias/pagina/2/')}">Ver más noticias</a></p>` : ''}
  </section>
  ${sidebar()}
</div>`;
  return layout({
    pathname: '/', body, current: 'inicio',
    jsonld: {
      '@context': 'https://schema.org', '@type': 'NewsMediaOrganization', name: S.name, url: SITE_URL,
      logo: abs('/assets/img/apple-touch-icon.png'), sameAs: Object.values(config.social).filter(Boolean),
      address: { '@type': 'PostalAddress', addressLocality: 'Apatzingán', addressRegion: 'Michoacán', addressCountry: 'MX' },
    },
  });
}

function listingPages() {
  const per = config.layout.posts_per_page;
  const total = Math.max(1, Math.ceil(posts.length / per));
  for (let page = 1; page <= total; page++) {
    const slice = posts.slice((page - 1) * per, page * per);
    const pathname = page === 1 ? '/noticias/' : `/noticias/pagina/${page}/`;
    const body = posts.length ? `<div class="wrap columns">
  <section class="latest">
    <h1 class="page-title">Noticias${page > 1 ? ` <span>página ${page} de ${total}</span>` : ''}</h1>
    <div class="grid">${slice.map(p => card(p)).join('')}</div>
    ${pager(page, total, '/noticias/')}
  </section>
  ${sidebar()}
</div>` : emptyState();
    writePage(pathname.slice(1) + 'index.html', layout({ title: page > 1 ? `Noticias, página ${page}` : 'Noticias', pathname, body, current: 'noticias' }));
  }
  // Redirect stub so /noticias/pagina/1/ works.
  writePage('noticias/pagina/1/index.html', redirect('/noticias/'));
}

function redirect(to) {
  return `<!doctype html><meta charset="utf-8"><title>Redirigiendo…</title><link rel="canonical" href="${abs(to)}"><meta http-equiv="refresh" content="0; url=${u(to)}"><a href="${u(to)}">Continuar</a>`;
}

function related(p) {
  const words = new Set(p.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\W+/).filter(w => w.length > 4));
  const scored = posts.filter(o => o !== p).slice(0, 300).map(o => {
    const ow = o.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\W+/);
    return { o, s: ow.filter(w => words.has(w)).length };
  });
  const byScore = scored.filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.o);
  const idx = posts.indexOf(p);
  const nearby = [...posts.slice(idx + 1, idx + 6), ...posts.slice(Math.max(0, idx - 3), idx)];
  const out = [];
  for (const o of [...byScore, ...nearby]) if (!out.includes(o) && out.length < config.layout.related_count) out.push(o);
  return out;
}

function articlePage(p) {
  const pathname = postPath(p);
  const url = abs(pathname);
  const first = p.images?.[0];
  let media = '';
  if (p.type === 'video') {
    const vertical = first && first.h > first.w;
    const embed = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(p.video_url || p.permalink)}&show_text=false&autoplay=true`;
    media = `<figure class="article__video${vertical ? ' is-vertical' : ''}">
  <a class="video-facade" href="${esc(p.video_url || p.permalink)}" target="_blank" rel="noopener" data-embed="${esc(embed)}" data-title="${esc(p.title)}">
    ${first ? picture(first, { sizes: '(min-width: 900px) 760px, 100vw', eager: true, alt: '' }) : ''}
    <span class="play play--big">${ICONS.play}</span>
    <span class="visually-hidden">Reproducir video: ${esc(p.title)}</span>
  </a>
  <figcaption>Video publicado en Facebook. Si no se reproduce aquí, <a href="${esc(p.permalink)}" target="_blank" rel="noopener">míralo en nuestra página</a>.</figcaption>
</figure>`;
  } else if (p.images?.length === 1) {
    media = `<figure class="article__media">${picture(first, { sizes: '(min-width: 900px) 760px, 100vw', eager: true, alt: p.title })}</figure>`;
  } else if (p.images?.length > 1) {
    const rest = p.images.length - 1;
    const cols = rest === 1 ? 1 : rest % 3 === 0 ? 3 : rest % 2 === 0 ? 2 : 3;
    media = `<div class="gallery" data-count="${p.images.length}" style="--cols:${cols}">${p.images.map((img, i) => `<a href="${imgUrl(img.file)}" target="_blank" rel="noopener">${picture(img, { sizes: i === 0 ? '(min-width: 900px) 760px, 100vw' : '(min-width: 900px) 250px, 50vw', eager: i === 0, alt: `${p.title}, foto ${i + 1} de ${p.images.length}` })}</a>`).join('')}</div>`;
  }
  const linkCard = p.link?.url ? `<a class="linkcard" href="${esc(p.link.url)}" target="_blank" rel="nofollow noopener">
  <span class="linkcard__domain">${esc(p.link.domain || 'Enlace')}</span>
  ${p.link.title ? `<span class="linkcard__title">${esc(p.link.title)}</span>` : ''}
  ${p.link.description ? `<span class="linkcard__desc">${esc(p.link.description.slice(0, 200))}</span>` : ''}
</a>` : '';
  const shareText = encodeURIComponent(p.title);
  const share = `<div class="share" role="group" aria-label="Compartir">
  <span class="share__label">Compartir</span>
  <a class="share__btn share__btn--wa" href="https://wa.me/?text=${shareText}%20${encodeURIComponent(url)}" target="_blank" rel="noopener">${ICONS.whatsapp}<span>WhatsApp</span></a>
  <a class="share__btn share__btn--fb" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener">${ICONS.facebook}<span>Facebook</span></a>
  <a class="share__btn" href="https://x.com/intent/post?text=${shareText}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener">${ICONS.x}<span>X</span></a>
  <button class="share__btn" type="button" data-copy="${esc(url)}">${ICONS.link}<span>Copiar enlace</span></button>
</div>`;
  const rel = related(p);
  const bodyText = p.body && p.body.trim() !== p.title ? richText(p.body) : '';
  const body = `<div class="wrap columns columns--article">
  <article class="article">
    <header class="article__head">
      ${kicker(p)}
      <h1 class="article__title">${esc(p.title)}</h1>
      <p class="article__meta">
        <span>Por la redacción de ${esc(S.name)}</span>
        <time datetime="${p.created}">${formatDate(p.created, TZ)}</time>
      </p>
    </header>
    ${adSlot('article_top', 'wide')}
    ${media}
    <div class="article__body">
      ${bodyText}
      ${linkCard}
    </div>
    <p class="article__source">Publicado originalmente en <a href="${esc(p.permalink)}" target="_blank" rel="noopener">nuestra página de Facebook</a>, donde puedes comentar y ver las reacciones.</p>
    ${share}
    ${adSlot('article_bottom', 'wide')}
  </article>
  ${sidebar()}
</div>
${rel.length ? `<section class="wrap related" aria-labelledby="relacionadas">
  ${sectionTitle('También te puede interesar', 'relacionadas')}
  <div class="grid grid--4">${rel.map(o => card(o, { sizes: '(min-width: 1100px) 260px, (min-width: 700px) 45vw, 100vw' })).join('')}</div>
</section>` : ''}`;
  return layout({
    title: p.title, description: excerpt(p, 160) || p.title, pathname, body, image: first, type: 'article',
    extraHead: `<meta property="article:published_time" content="${p.created}">`,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'NewsArticle', headline: p.title.slice(0, 110),
      datePublished: p.created, dateModified: p.created, mainEntityOfPage: url,
      image: (p.images || []).map(i => abs('/' + i.file)),
      author: { '@type': 'Organization', name: S.name, url: SITE_URL },
      publisher: { '@type': 'Organization', name: S.name, logo: { '@type': 'ImageObject', url: abs('/assets/img/apple-touch-icon.png') } },
      isBasedOn: p.permalink,
    },
  });
}

function archivePages() {
  const groups = new Map();
  for (const p of posts) {
    const { y, m } = ymdParts(p.created, TZ);
    const key = `${y}/${m}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const years = new Map();
  for (const [key, list] of groups) {
    const [y, m] = key.split('/');
    if (!years.has(y)) years.set(y, []);
    years.get(y).push({ m, list });
  }
  const index = `<div class="wrap narrow">
  <h1 class="page-title">Archivo</h1>
  <p class="lede">Todas las notas publicadas por ${esc(S.name)}, ordenadas por mes. ${posts.length.toLocaleString('es-MX')} publicaciones en total.</p>
  ${[...years].map(([y, months]) => `<section class="archive-year">
    <h2>${y}</h2>
    <ul class="months">${months.map(({ m, list }) => `<li><a href="${u(`/archivo/${y}/${m}/`)}"><span>${MONTHS[+m - 1]}</span><span class="months__n">${list.length}</span></a></li>`).join('')}</ul>
  </section>`).join('') || '<p>Aún no hay publicaciones.</p>'}
</div>`;
  writePage('archivo/index.html', layout({ title: 'Archivo', pathname: '/archivo/', body: index, current: 'archivo' }));

  for (const [key, list] of groups) {
    const [y, m] = key.split('/');
    const days = new Map();
    for (const p of list) {
      const d = ymdParts(p.created, TZ).d;
      if (!days.has(d)) days.set(d, []);
      days.get(d).push(p);
    }
    const label = `${MONTHS[+m - 1]} de ${y}`;
    const body = `<div class="wrap narrow">
  <p class="crumbs"><a href="${u('/archivo/')}">Archivo</a> / ${y}</p>
  <h1 class="page-title">${label.charAt(0).toUpperCase() + label.slice(1)}</h1>
  ${[...days].map(([d, ps]) => `<section class="archive-day">
    <h2>${+d} de ${MONTHS[+m - 1]}</h2>
    <ul>${ps.map(p => `<li><time datetime="${p.created}">${clock(p.created)}</time><a href="${u(postPath(p))}">${esc(p.title)}</a></li>`).join('')}</ul>
  </section>`).join('')}
</div>`;
    writePage(`archivo/${y}/${m}/index.html`, layout({ title: `Archivo: ${label}`, pathname: `/archivo/${y}/${m}/`, body, current: 'archivo' }));
  }
}

function searchPage() {
  const body = `<div class="wrap narrow">
  <h1 class="page-title">Buscar</h1>
  <form class="search" role="search" action="${u('/buscar/')}" method="get">
    <label for="q" class="visually-hidden">Buscar noticias</label>
    <input id="q" name="q" type="search" placeholder="Busca por palabra, colonia, nombre…" autocomplete="off">
    <button class="btn btn--red" type="submit">${ICONS.search}<span>Buscar</span></button>
  </form>
  <p class="search__status" id="search-status" aria-live="polite"></p>
  <div id="search-results" class="search__results"></div>
</div>`;
  writePage('buscar/index.html', layout({ title: 'Buscar', pathname: '/buscar/', body, current: 'buscar' }));
  const index = posts.map(p => ({
    t: p.title, u: postPath(p), d: p.created.slice(0, 10), x: excerpt(p, 140),
    s: stripEmoji(p.message || '').slice(0, 600),
    i: p.images?.[0]?.thumb || '',
  }));
  writePage('search-index.json', JSON.stringify(index));
}

function staticPages() {
  const c = config.contact;
  const contactItems = [
    c.whatsapp && `<li><span>WhatsApp</span><a href="https://wa.me/${c.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">${esc(c.whatsapp)}</a></li>`,
    c.phone && `<li><span>Teléfono</span><a href="tel:${c.phone.replace(/[^\d+]/g, '')}">${esc(c.phone)}</a></li>`,
    c.email && `<li><span>Correo</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`,
    `<li><span>Facebook</span><a href="${esc(config.facebook.page_url)}" target="_blank" rel="noopener">${esc(config.facebook.page_url.replace(/^https?:\/\/(www\.)?/, ''))}</a></li>`,
    c.address && `<li><span>Ubicación</span>${esc(c.address)}</li>`,
  ].filter(Boolean).join('');

  writePage('nosotros/index.html', layout({
    title: 'Nosotros', pathname: '/nosotros/', current: 'nosotros',
    body: `<div class="wrap narrow prose">
  <h1 class="page-title">Nosotros</h1>
  ${config.about.map(t => `<p>${esc(t)}</p>`).join('')}
  <p><a class="btn btn--red" href="${u('/contacto/')}">Contáctanos</a></p>
</div>`,
  }));

  writePage('contacto/index.html', layout({
    title: 'Contacto', pathname: '/contacto/', current: 'contacto',
    body: `<div class="wrap narrow prose">
  <h1 class="page-title">Contacto</h1>
  <p>¿Tienes una denuncia, un aviso para la comunidad o quieres anunciarte con nosotros? Escríbenos.</p>
  <ul class="contact">${contactItems}</ul>
  <p class="small">La forma más rápida de reportar algo es por mensaje directo a nuestra página de Facebook.</p>
</div>`,
  }));

  writePage('aviso-de-privacidad/index.html', layout({
    title: 'Aviso de privacidad', pathname: '/aviso-de-privacidad/',
    body: `<div class="wrap narrow prose">
  <h1 class="page-title">Aviso de privacidad</h1>
  <p>${esc(S.name)}, con domicilio en ${esc(c.address || S.city)}, es responsable del uso de los datos personales que nos compartas.</p>
  <p>Este sitio no tiene formularios ni cuentas de usuario y no recopila datos personales por sí mismo. Si nos contactas por correo, teléfono, WhatsApp o Facebook, usaremos tus datos solo para responderte y no los compartiremos con terceros, salvo obligación legal.</p>
  <p>Los videos insertados desde Facebook y los botones para compartir pueden permitir que esa red social registre tu visita conforme a sus propias políticas.</p>
  <p>Para ejercer tus derechos de acceso, rectificación, cancelación u oposición, escríbenos a través de los medios de la página de <a href="${u('/contacto/')}">contacto</a>.</p>
  <p class="small">Última actualización: ${formatDate(new Date().toISOString(), TZ, false)}.</p>
</div>`,
  }));

  writePage('404.html', layout({
    title: 'Página no encontrada', pathname: '/404.html',
    body: `<div class="wrap narrow empty">
  <h1>No encontramos esta página</h1>
  <p>Puede que la nota se haya movido o que el enlace esté incompleto. Prueba buscándola.</p>
  <form class="search" role="search" action="${u('/buscar/')}" method="get">
    <label for="q404" class="visually-hidden">Buscar noticias</label>
    <input id="q404" name="q" type="search" placeholder="Buscar noticias">
    <button class="btn btn--red" type="submit">${ICONS.search}<span>Buscar</span></button>
  </form>
  <p><a href="${u('/')}">Volver al inicio</a></p>
</div>`,
  }));
}

function feeds() {
  const xmlEsc = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  const items = posts.slice(0, 40).map(p => `<item>
<title>${xmlEsc(p.title)}</title>
<link>${abs(postPath(p))}</link>
<guid isPermaLink="true">${abs(postPath(p))}</guid>
<pubDate>${new Date(p.created).toUTCString()}</pubDate>
<description>${xmlEsc(excerpt(p, 400))}</description>
${p.images?.[0] ? `<enclosure url="${abs('/' + p.images[0].file)}" type="${p.images[0].file.endsWith('.webp') ? 'image/webp' : 'image/jpeg'}" length="${fileSize(p.images[0].file)}"/>` : ''}
</item>`).join('\n');
  writePage('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${xmlEsc(S.name)}</title>
<link>${SITE_URL}/</link>
<description>${xmlEsc(S.description)}</description>
<language>es-mx</language>
<atom:link href="${abs('/feed.xml')}" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>
`);
  const urls = [
    ['/', posts[0]?.created], ['/noticias/'], ['/archivo/'], ['/nosotros/'], ['/contacto/'],
    ...posts.map(p => [postPath(p), p.created]),
  ];
  writePage('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([p, d]) => `<url><loc>${abs(p)}</loc>${d ? `<lastmod>${d.slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);
  writePage('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${abs('/sitemap.xml')}\n`);
}

function fileSize(rel) {
  try { return fs.statSync(path.join(MEDIA_DIR, rel.replace(/^media\//, ''))).size; } catch { return 0; }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

// ---------- run ----------

rmrf(DIST);
fs.mkdirSync(DIST, { recursive: true });
copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
copyDir(MEDIA_DIR, path.join(DIST, 'media'));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
fs.renameSync(path.join(DIST, 'assets', 'favicon.ico'), path.join(DIST, 'favicon.ico'));

writePage('index.html', homePage());
listingPages();
for (const p of posts) writePage(`noticia/${p.slug}/index.html`, articlePage(p));
archivePages();
searchPage();
staticPages();
feeds();

const size = dirSize(DIST);
const mb = (size / 1048576).toFixed(1);
console.log(`[build] ${posts.length} publicaciones, sitio de ${mb} MB en dist/`);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Sitio\n- Publicaciones: ${posts.length}\n- Tamaño: ${mb} MB de 1024 MB permitidos\n`);
}
if (size > 900 * 1048576) {
  console.log(`::warning::El sitio pesa ${mb} MB y GitHub Pages permite 1 GB. Baja "media_budget_mb" en config.json.`);
}
