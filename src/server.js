// src/server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { SITES } = require('./sites');
const { metersBetween } = require('./recognition');

const app = express();
// Embeddings are 1024 floats (~15-20 KB JSON each); allow generous body size.
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Calibrated embedding signatures live here (written by the calibration tool).
const SIG_FILE = path.join(__dirname, '..', 'signatures.json');
let signatures = {};   // { siteId: { embedding: number[], count: number } }
function loadSignatures() {
  try {
    signatures = JSON.parse(fs.readFileSync(SIG_FILE, 'utf8'));
    console.log('[sig] Loaded embedding signatures for', Object.keys(signatures).length, 'sites.');
  } catch {
    signatures = {};
    console.log('[sig] No signatures.json yet — calibrate sites to enable image recognition.');
  }
}
loadSignatures();

// Scan public/sites/<id>/ for displayable photos.
function imagesForSite(id) {
  const dir = path.join(__dirname, '..', 'public', 'sites', id);
  try {
    return fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort()
      .map(f => `/sites/${id}/${encodeURIComponent(f)}`);
  } catch { return []; }
}

function sitePublic(s) {
  return {
    id: s.id, name: s.name, nameEn: s.nameEn, type: s.type,
    address: s.address, addressEn: s.addressEn, year: s.year,
    authors: s.authors, authorsEn: s.authorsEn, text: s.text, textEn: s.textEn,
    lat: s.lat, lng: s.lng,
    hasSignature: !!(signatures[s.id] && signatures[s.id].embedding),
    images: imagesForSite(s.id)
  };
}

// List all sites (catalogue)
app.get('/api/sites', (req, res) => res.json(SITES.map(sitePublic)));

// One site
app.get('/api/sites/:id', (req, res) => {
  const s = SITES.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Site not found.' });
  res.json(sitePublic(s));
});

// Give the client everything it needs to identify: each site's GPS coords plus
// its stored embedding signature (if calibrated). The client runs MobileNet on
// the camera frame and compares locally — the model lives in the browser.
app.get('/api/signatures', (req, res) => {
  res.json(SITES.map(s => {
    const sig = signatures[s.id];
    // New format stores an array of embeddings (one per calibration photo).
    // Old format stored a single averaged "embedding" — wrap it for compatibility.
    let embeddings = null;
    if (sig) {
      if (Array.isArray(sig.embeddings)) embeddings = sig.embeddings;
      else if (Array.isArray(sig.embedding)) embeddings = [sig.embedding];
    }
    return {
      id: s.id, name: s.name, nameEn: s.nameEn, type: s.type,
      address: s.address, addressEn: s.addressEn, year: s.year,
      authors: s.authors, authorsEn: s.authorsEn, text: s.text, textEn: s.textEn,
      lat: s.lat, lng: s.lng, images: imagesForSite(s.id),
      embeddings
    };
  }));
});

// GPS distance helper for the client (optional; client can also compute locally).
app.post('/api/distance', (req, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.json({ distances: {} });
  const distances = {};
  for (const s of SITES) distances[s.id] = Math.round(metersBetween(lat, lng, s.lat, s.lng));
  res.json({ distances });
});

// Save embedding signatures from the calibration tool. Now stores EACH photo's
// embedding separately (multiple signatures per site) so recognition can match
// the closest viewpoint instead of a blurred average.
app.post('/api/calibrate', (req, res) => {
  const { id, embeddings, count } = req.body || {};
  const s = SITES.find(x => x.id === id);
  if (!s) return res.status(404).json({ error: 'Site not found.' });
  if (!Array.isArray(embeddings) || embeddings.length === 0 ||
      !Array.isArray(embeddings[0]) || embeddings[0].length < 100) {
    return res.status(400).json({ error: 'Invalid embeddings.' });
  }
  signatures[id] = { embeddings, count: count || embeddings.length };
  fs.writeFileSync(SIG_FILE, JSON.stringify(signatures));
  res.json({ ok: true, calibrated: Object.keys(signatures).length });
});

// Clear one site's signature (handy when recalibrating).
app.post('/api/calibrate/clear', (req, res) => {
  const { id } = req.body || {};
  delete signatures[id];
  fs.writeFileSync(SIG_FILE, JSON.stringify(signatures));
  res.json({ ok: true, calibrated: Object.keys(signatures).length });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Pushkinskaya guide running on http://localhost:${PORT}`));
