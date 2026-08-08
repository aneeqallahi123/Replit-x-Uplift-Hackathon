/**
 * Dastak Voice Agent — Express server
 *
 * Serves all static files from the dastak-clone/ directory.
 * The root path (/) redirects to services.html — the active demo page.
 *
 * GET /api/config — stub endpoint for Track A.
 *   Track A will extend this to return Uplift AI endpoint configuration.
 *   Secrets (API keys) must come from environment variables, never hardcoded.
 */

const express = require('express');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT || 5000;
const STATIC   = path.join(__dirname, 'dastak-clone');

// Region is env-driven so it can be flipped from Replit Secrets alone.
// Default is the US endpoint (verified to resolve this assistant ID).
// Singapore (lower latency from Pakistan): ap-southeast-1.api.upliftai.org/v1
const UPLIFT_BASE    = process.env.UPLIFT_BASE || 'https://api.upliftai.org/v1';
const ASSISTANT_ID   = 'e9311394-097b-49c6-a206-fef2569dce2c';
const UPLIFT_API_KEY = process.env.UPLIFT_API_KEY;

app.use(express.json());

// Root → homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(STATIC, 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
// POST /api/session — creates an Uplift AI LiveKit session.
// The API key never leaves the server.
// ═══════════════════════════════════════════════════════════════
app.post('/api/session', async (req, res) => {
  if (!UPLIFT_API_KEY) {
    return res.status(500).json({ error: 'UPLIFT_API_KEY not configured on server.' });
  }
  try {
    const upstream = await fetch(
      `${UPLIFT_BASE}/realtime-assistants/${ASSISTANT_ID}/createSession`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${UPLIFT_API_KEY}`,
        },
        body: JSON.stringify({ participantName: req.body.participantName || 'Citizen' }),
      }
    );
    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('[server] Uplift session error:', upstream.status, data);
      return res.status(upstream.status).json(data);
    }
    res.json(data);
  } catch (err) {
    console.error('[server] /api/session fetch failed:', err.message);
    res.status(502).json({ error: 'Could not reach Uplift AI: ' + err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// TRACK A INTEGRATION POINT — API config endpoint
// ═══════════════════════════════════════════════════════════════
app.get('/api/config', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve all portal assets (HTML, JS, CSS, images) from dastak-clone/
app.use(express.static(STATIC));

app.listen(PORT, () => {
  console.log(`Dastak Voice Agent running on http://localhost:${PORT}`);
  console.log(`[server] Uplift base URL: ${UPLIFT_BASE}` +
    (process.env.UPLIFT_BASE ? ' (from UPLIFT_BASE env)' : ' (default)'));
});
