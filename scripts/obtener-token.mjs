// Turns a short-lived user token from the Graph API Explorer into a Page token that does not expire.
// Usage: npm run token
// It asks for: App ID, App Secret (Meta app > App settings > Basic) and the user token.
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const VERSION = 'v26.0';
const rl = readline.createInterface({ input: stdin, output: stdout });
const ask = async q => (await rl.question(q)).trim();

async function call(path, params) {
  const url = new URL(`https://graph.facebook.com/${VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url);
  const body = await r.json();
  if (body.error) throw new Error(body.error.message);
  return body;
}

try {
  const appId = await ask('App ID: ');
  const appSecret = await ask('App Secret: ');
  const shortToken = await ask('Token de usuario (del Graph API Explorer): ');

  const long = await call('oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken,
  });
  const pages = await call('me/accounts', { access_token: long.access_token, fields: 'id,name,access_token,tasks' });
  if (!pages.data?.length) throw new Error('Tu usuario no administra ninguna página o no diste permiso a la app para verla.');

  let page = pages.data[0];
  if (pages.data.length > 1) {
    pages.data.forEach((p, i) => console.log(`${i + 1}. ${p.name} (${p.id})`));
    const n = +(await ask('Número de la página de Diálogo: '));
    page = pages.data[n - 1] || page;
  }
  const debug = await call('debug_token', { input_token: page.access_token, access_token: `${appId}|${appSecret}` });
  const exp = debug.data?.expires_at;
  console.log(`\nPágina: ${page.name}`);
  console.log(`ID de la página: ${page.id}`);
  console.log(`Vence: ${!exp ? 'nunca' : new Date(exp * 1000).toLocaleString('es-MX')}`);
  console.log(`Permisos: ${(debug.data?.scopes || []).join(', ')}`);
  console.log('\nCopia este token completo en GitHub como el secreto FB_PAGE_TOKEN:\n');
  console.log(page.access_token + '\n');
} catch (e) {
  console.error('\nError:', e.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
