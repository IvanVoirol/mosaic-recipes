'use strict';

// ============================================================================
//  Palette Editor — tiny zero-dependency server
//
//  - Serves index.html
//  - Stores each palette as one JSON file in ./palettes/
//  - Scans that folder on GET /api/palettes
//  - Detects conflicting saves via a per-palette version number
//
//  Runs on the port Infomaniak provides via process.env.PORT.
// ============================================================================

const http = require('node:http');
const fs   = require('node:fs');
const fsp  = require('node:fs/promises');
const path = require('node:path');

const PORT      = process.env.PORT || 8080;
const ROOT      = __dirname;
const DATA_DIR  = path.join(ROOT, 'palettes');
const INDEX     = path.join(ROOT, 'index.html');

// Ensure the data folder exists on first run.
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---- helpers ---------------------------------------------------------------

// A safe on-disk filename derived from a palette id (no path traversal).
function safeFile(id) {
  const clean = String(id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  if (!clean) return null;
  return path.join(DATA_DIR, clean + '.json');
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) { reject(new Error('Payload too large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ---- API -------------------------------------------------------------------

// GET /api/palettes  → { palettes: [ {id, ...paletteData, _version, _updated} ] }
async function listPalettes(res) {
  const files = (await fsp.readdir(DATA_DIR)).filter(f => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    try {
      const raw = await fsp.readFile(path.join(DATA_DIR, f), 'utf8');
      const obj = JSON.parse(raw);
      obj.id = f.replace(/\.json$/, '');
      out.push(obj);
    } catch (e) { /* skip unreadable file */ }
  }
  out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  sendJSON(res, 200, { palettes: out });
}

// PUT /api/palettes/:id  body = palette JSON (may include _version for conflict check)
// → 200 { ok, palette } | 409 { conflict, current }  when version is stale
async function savePalette(res, id, bodyStr) {
  const file = safeFile(id);
  if (!file) return sendJSON(res, 400, { error: 'Bad palette id' });

  let incoming;
  try { incoming = JSON.parse(bodyStr); }
  catch { return sendJSON(res, 400, { error: 'Invalid JSON' }); }

  // Conflict check: compare the version the client last saw with what's on disk.
  let current = null;
  try { current = JSON.parse(await fsp.readFile(file, 'utf8')); } catch {}
  if (current && typeof incoming._version === 'number' && incoming._version !== current._version) {
    return sendJSON(res, 409, { conflict: true, current: { ...current, id } });
  }

  const next = { ...incoming };
  next._version = (current && current._version ? current._version : 0) + 1;
  next._updated = new Date().toISOString();
  delete next.id; // id is the filename, not stored inside

  // Atomic write: temp file then rename.
  const tmp = file + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await fsp.rename(tmp, file);

  sendJSON(res, 200, { ok: true, palette: { ...next, id } });
}

// DELETE /api/palettes/:id
async function deletePalette(res, id) {
  const file = safeFile(id);
  if (!file) return sendJSON(res, 400, { error: 'Bad palette id' });
  try { await fsp.unlink(file); } catch {}
  sendJSON(res, 200, { ok: true });
}

// ---- static index ----------------------------------------------------------

function serveIndex(res) {
  fs.readFile(INDEX, (err, buf) => {
    if (err) { res.writeHead(500); res.end('index.html missing'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
}

// ---- router ----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api','palettes','rock']

    if (parts[0] === 'api' && parts[1] === 'palettes') {
      const id = parts[2] ? decodeURIComponent(parts[2]) : null;
      if (req.method === 'GET'  && !id) return await listPalettes(res);
      if (req.method === 'PUT'  &&  id) return await savePalette(res, id, await readBody(req));
      if (req.method === 'DELETE' && id) return await deletePalette(res, id);
      return sendJSON(res, 405, { error: 'Method not allowed' });
    }

    // Everything else serves the app (single-page).
    if (req.method === 'GET') return serveIndex(res);
    res.writeHead(404); res.end('Not found');
  } catch (e) {
    sendJSON(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`Palette Editor running on port ${PORT}`);
  console.log(`Palettes stored in: ${DATA_DIR}`);
});
