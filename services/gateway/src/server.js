// services/gateway/src/server.js
//
// gateway — serves the frontend and reverse-proxies API calls to the two
// backend services. The browser only ever talks to the gateway; it has no
// idea sites-service and identify-service even exist. This is the "API
// gateway" pattern: one public entry point fronting several internal services.

const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 4000;

const SITES_SERVICE_URL = process.env.SITES_SERVICE_URL || 'http://localhost:5001';
const IDENTIFY_SERVICE_URL = process.env.IDENTIFY_SERVICE_URL || 'http://localhost:5002';

// /api/sites, /api/sites/:id  ->  sites-service /sites, /sites/:id
app.use('/api/sites', createProxyMiddleware({
  target: SITES_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/sites': '/sites' }
}));

// /api/signatures, /api/calibrated, /api/calibrate, /api/calibrate/clear, /api/distance -> identify-service
app.use(['/api/signatures', '/api/calibrated', '/api/calibrate', '/api/distance'], createProxyMiddleware({
  target: IDENTIFY_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: (path) => path.replace(/^\/api/, '')
}));

// Site photos, served by sites-service
app.use('/images', createProxyMiddleware({
  target: SITES_SERVICE_URL,
  changeOrigin: true
}));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gateway' }));

// Everything else: the static frontend (index.html, calibrate.html, embedding.js)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => console.log(`[gateway] listening on :${PORT} (sites=${SITES_SERVICE_URL}, identify=${IDENTIFY_SERVICE_URL})`));