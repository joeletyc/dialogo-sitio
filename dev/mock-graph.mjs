// Minimal stand-in for the Graph API, for testing the pipeline offline.
// Usage: node dev/mock-graph.mjs dev/fixtures [port]
// Env: MOCK_NO_STATS=1 (reject reaction/comment fields), MOCK_DROP=<post id> (simulate a deleted post),
//      MOCK_EDIT=<post id> (simulate an edited message), MOCK_BAD_TOKEN=1
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'dev/fixtures';
const port = +(process.argv[3] || 8787);
const origin = `http://127.0.0.1:${port}`;

function load() {
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'posts.json'), 'utf8'));
  let posts = JSON.parse(JSON.stringify(data.posts).replaceAll('MOCK/', origin + '/'));
  const drop = process.env.MOCK_DROP && new Set(process.env.MOCK_DROP.split(','));
  if (drop) posts = posts.filter(p => !drop.has(p.id));
  if (process.env.MOCK_EDIT) {
    const p = posts.find(p => p.id === process.env.MOCK_EDIT);
    if (p) p.message = 'Titular corregido por la redacción\n\n' + p.message;
  }
  return { page: data.page, posts };
}

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

http.createServer((req, res) => {
  const url = new URL(req.url, origin);
  if (url.pathname.startsWith('/img/')) {
    const f = path.join(dir, 'img', path.basename(url.pathname));
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    return fs.createReadStream(f).pipe(res);
  }
  if (process.env.MOCK_BAD_TOKEN || url.searchParams.get('access_token') !== 'TEST_TOKEN') {
    return json(res, 400, { error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190 } });
  }
  const { page, posts } = load();
  const parts = url.pathname.split('/').filter(Boolean); // [version, node, edge?]
  const node = parts[1], edge = parts[2];
  if (process.env.MOCK_USER && (node === 'me' || node === '555')) {
    if (url.searchParams.get('fields') === 'category') return json(res, 400, { error: { message: '(#100) Tried accessing nonexisting field (category) on node type (User)', code: 100 } });
    return json(res, 200, { id: '555', name: 'Persona de prueba' });
  }
  if (node === 'me' || (node === page.id && !edge)) return json(res, 200, { ...page, category: 'Media/news company' });
  if (edge === 'posts') {
    const fields = url.searchParams.get('fields') || '';
    if (process.env.MOCK_NO_STATS && fields.includes('reactions')) {
      return json(res, 403, { error: { message: "(#10) This endpoint requires the 'pages_read_engagement' permission", type: 'OAuthException', code: 10 } });
    }
    const limit = +(url.searchParams.get('limit') || 25);
    const after = +(url.searchParams.get('after') || 0);
    const slice = posts.slice(after, after + limit).map(p => {
      const c = { ...p };
      if (!fields.includes('reactions')) { delete c.reactions; delete c.comments; delete c.shares; }
      return c;
    });
    const body = { data: slice, paging: {} };
    if (after + limit < posts.length) {
      const next = new URL(url); next.searchParams.set('after', String(after + limit));
      body.paging.next = next.toString().replace(origin, 'https://graph.facebook.com');
    }
    return json(res, 200, body);
  }
  if (node && !edge && url.searchParams.get('fields') === 'images') {
    const m = node.match(/^ph(\d+)$/);
    if (m && fs.existsSync(path.join(dir, 'img', `p${m[1]}-hi.jpg`))) {
      return json(res, 200, { id: node, images: [{ width: 1440, height: 1080, source: `${origin}/img/p${m[1]}-hi.jpg` }, { width: 720, height: 540, source: `${origin}/img/p${m[1]}.jpg` }] });
    }
    return json(res, 400, { error: { message: 'Unsupported get request', code: 100 } });
  }
  json(res, 404, { error: { message: 'Unknown path ' + url.pathname, code: 803 } });
}).listen(port, () => console.log(`mock graph on ${origin}`));
