/**
 * Southwire Assistant — Node.js frontend server
 *
 *  - Serves the chatbot page and images from ./public
 *  - Proxies every /api/* request to the FastAPI backend (BACKEND_URL),
 *    adding the secret AUTH_TOKEN on the server side (never sent to the browser)
 *  - Streams answers straight through, so the chat still types out live
 *
 * Config (environment variables):
 *   Local      -> .env file in this folder (loaded below)
 *   Production -> Render dashboard environment variables (no .env file)
 *
 *   BACKEND_URL  FastAPI base URL        default http://127.0.0.1:8000
 *   AUTH_TOKEN   secret sent to FastAPI  default (none)
 *   PORT         port to listen on       default 3000 (Render sets this itself)
 */
const express = require('express');
const path = require('path');
const { Readable } = require('stream');

// Local: read .env  |  Render: there is no .env file, so variables come from the dashboard
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* no .env -> use real env vars */ }

const BACKEND_URL = (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const AUTH_TOKEN  = process.env.AUTH_TOKEN || '';
const PORT        = process.env.PORT || 3000;
const PUBLIC_DIR  = path.join(__dirname, 'public');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// ---- Static files: the chatbot page + images ----
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'southwire-chatbot.html')));
app.use(express.static(PUBLIC_DIR));

// ---- Health check (handy for Render) ----
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---- API proxy: /api/<path> -> BACKEND_URL/<path> (+ secret token) ----
app.use('/api', async (req, res) => {
  const target = BACKEND_URL + req.url;                 // req.url is the part after /api, incl. query string
  const hasBody = !['GET', 'HEAD'].includes(req.method);

  // If the browser leaves (closes tab / new question), stop the backend request too
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        accept: req.get('accept') || '*/*',
        ...(hasBody && { 'Content-Type': 'application/json' }),
        ...(AUTH_TOKEN && { Authorization: `Bearer ${AUTH_TOKEN}` }),
      },
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
      signal: controller.signal,
    });

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');          // don't let proxies buffer the stream
    res.flushHeaders();

    if (upstream.body) Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res);
    else res.end();
  } catch (err) {
    if (controller.signal.aborted) return;              // client went away — nothing to send
    console.error(`[proxy] ${req.method} ${target} failed:`, err.message);
    if (!res.headersSent) res.status(502).json({ error: 'Backend unreachable', detail: err.message });
    else res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Southwire Assistant running on http://localhost:${PORT}`);
  // console.log(`  -> proxying /api to ${BACKEND_URL}${AUTH_TOKEN ? ' (with AUTH_TOKEN)' : ' (no AUTH_TOKEN set)'}`);
});
