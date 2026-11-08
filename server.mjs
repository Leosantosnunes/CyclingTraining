import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { createStravaIntegration } from './lib/strava.mjs';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const files = new Set(['index.html', 'app.js', 'styles.css', 'engine.js', 'storage.js', 'integrations.js','sensors.js']);
const strava = createStravaIntegration();
export const server = http.createServer(async (req, res) => {
  const headers = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
  };
  if (!['localhost', '127.0.0.1'].includes((req.headers.host || '').split(':')[0])) {
    res.writeHead(403, headers); return res.end('Local access only');
  }
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  try { if (await strava.handle(req, res)) return; }
  catch { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Connection request could not be completed. Please retry.' })); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, headers); return res.end(); }
  const name = (req.url || '').split('?')[0] === '/' ? 'index.html' : (req.url || '').split('?')[0].slice(1);
  if (!files.has(name)) { res.writeHead(404, headers); return res.end('Not found'); }
  try {
    const body = await readFile(path.join(root, name));
    res.writeHead(200, { ...headers, 'Content-Type': name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500, headers); res.end('Unable to load app'); }
});
server.on('close', () => strava.close());
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') { console.error('Unable to load local .env configuration. Check its format.'); process.exit(1); } }
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '127.0.0.1', () => console.log(`Cadence is ready at http://localhost:${port}`));
}
