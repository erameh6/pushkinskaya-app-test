// services/identify-service/src/server.js
//
// identify-service — owns calibration signatures (embeddings collected from
// reference photos) and GPS-distance scoring. It does NOT know site names,
// addresses, or coordinates itself — it asks sites-service for those over
// plain HTTP every time. That call is the concrete "microservices talking
// to each other" example: identify-service -> sites-service.

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { metersBetween } = require('./recognition');

const app = express();
const PORT = process.env.PORT || 5002;

// Where to find sites-service. Locally/standalone this defaults to localhost;
// in Docker Compose and Kubernetes we'll override it via an env var to the
// service's container/DNS name instead.
const SITES_SERVICE_URL = process.env.SITES_SERVICE_URL || 'http://localhost:5001';

app.use(express.json({ limit: '25mb' })); // embeddings are ~15-20 KB JSON each

const SIG_FILE = process.env.SIG_FILE || path.join(__dirname, '..', 'data', 'signatures.json');
let signatures = {};

function loadSignatures() {
  try {
    signatures = JSON.parse(fs.readFileSync(SIG_FILE, 'utf8'));
    console.log(`[identify-service] loaded signatures for ${Object.keys(signatures).length} site(s)`);
  } catch {
    signatures = {};
    console.log('[identify-service] no signatures.json yet — calibrate sites to enable recognition');
  }
}
function saveSignatures() {
  fs.mkdirSync(path.dirname(SIG_FILE), { recursive: true });
  fs.writeFileSync(SIG_FILE, JSON.stringify(signatures));
}
loadSignatures();

// The actual inter-service HTTP calls.
async function fetchSites() {
  const r = await fetch(`${SITES_SERVICE_URL}/sites`);
  if (!r.ok) throw new Error(`sites-service responded ${r.status}`);
  return r.json();
}
async function fetchSite(id) {
  const r = await fetch(`${SITES_SERVICE_URL}/sites/${encodeURIComponent(id)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`sites-service responded ${r.status}`);
  return r.json();
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'identify-service' }));

// The key endpoint: merges sites-service's data with our own embeddings.
app.get('/signatures', async (req, res) => {
  try {
    const sites = await fetchSites();
    res.json(sites.map((s) => {
      const sig = signatures[s.id];
      const embeddings = sig && Array.isArray(sig.embeddings) ? sig.embeddings : null;
      return { ...s, embeddings };
    }));
  } catch (err) {
    console.error('[identify-service] failed to reach sites-service:', err.message);
    res.status(502).json({ error: 'sites-service unavailable', detail: err.message });
  }
});

app.get('/calibrated', (req, res) => res.json({ ids: Object.keys(signatures) }));

app.post('/distance', async (req, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.json({ distances: {} });
  try {
    const sites = await fetchSites();
    const distances = {};
    for (const s of sites) distances[s.id] = Math.round(metersBetween(lat, lng, s.lat, s.lng));
    res.json({ distances });
  } catch (err) {
    res.status(502).json({ error: 'sites-service unavailable', detail: err.message });
  }
});

app.post('/calibrate', async (req, res) => {
  const { id, embeddings, count } = req.body || {};
  const site = await fetchSite(id).catch(() => null);
  if (!site) return res.status(404).json({ error: 'Site not found.' });
  if (!Array.isArray(embeddings) || embeddings.length === 0 ||
      !Array.isArray(embeddings[0]) || embeddings[0].length < 100) {
    return res.status(400).json({ error: 'Invalid embeddings.' });
  }
  signatures[id] = { embeddings, count: count || embeddings.length };
  saveSignatures();
  res.json({ ok: true, calibrated: Object.keys(signatures).length });
});

app.post('/calibrate/clear', (req, res) => {
  const { id } = req.body || {};
  delete signatures[id];
  saveSignatures();
  res.json({ ok: true, calibrated: Object.keys(signatures).length });
});

app.listen(PORT, () => console.log(`[identify-service] listening on :${PORT}, sites-service at ${SITES_SERVICE_URL}`));