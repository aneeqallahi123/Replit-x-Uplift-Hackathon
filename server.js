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

// Root → homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(STATIC, 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
// TRACK A INTEGRATION POINT — API config endpoint
// Currently returns { status: "ok" } only.
// Track A will extend this to return Uplift AI endpoint URLs and
// any non-secret config the STT / TTS layer needs at runtime.
// ═══════════════════════════════════════════════════════════════
app.get('/api/config', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve all portal assets (HTML, JS, CSS, images) from dastak-clone/
app.use(express.static(STATIC));

app.listen(PORT, () => {
  console.log(`Dastak Voice Agent running on http://localhost:${PORT}`);
});
