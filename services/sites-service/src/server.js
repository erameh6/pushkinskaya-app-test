// services/sites-service/src/server.js
//
// sites-service — owns the site catalogue: names, addresses, GPS coordinates,
// descriptions, and reference photos. Every other service asks this one for
// site data instead of holding its own copy — that boundary is what makes
// this a "service" instead of just a shared module.

const express = require('express');
const path = require('path');
const fs = require('fs');
const { SITES } = require('./sites');

const app = express();
const PORT = process.env.PORT || 5001;

// Photos will live on a mounted volume later (see Docker/K8s steps). For now,
// this just points at a local folder that doesn't need to exist yet.
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, '..', 'photos');

function imagesForSite(id) {
  const dir = path.join(PHOTOS_DIR, id);
  try {
    return fs.readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort()
      .map((f) => `/images/${id}/${encodeURIComponent(f)}`);
  } catch {
    return []; // no photos yet — fine, the app still works
  }
}

function sitePublic(s) {
  return {
    id: s.id, name: s.name, nameEn: s.nameEn, type: s.type,
    address: s.address, addressEn: s.addressEn, year: s.year,
    authors: s.authors, authorsEn: s.authorsEn, text: s.text, textEn: s.textEn,
    lat: s.lat, lng: s.lng,
    images: imagesForSite(s.id)
  };
}

// Used by Docker/Kubernetes to check "is this service alive and ready?"
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'sites-service' }));

app.get('/sites', (req, res) => res.json(SITES.map(sitePublic)));

app.get('/sites/:id', (req, res) => {
  const s = SITES.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Site not found.' });
  res.json(sitePublic(s));
});

app.use('/images', express.static(PHOTOS_DIR));

app.listen(PORT, () => console.log(`[sites-service] listening on :${PORT}`));