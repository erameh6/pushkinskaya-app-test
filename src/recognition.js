// src/recognition.js
// A lightweight, explainable image-recognition technique suitable for a practicum
// and easy to defend: each site is represented by a COLOR HISTOGRAM SIGNATURE
// computed from your reference photos. A query photo is reduced to the same kind
// of signature and compared. This runs anywhere (no GPU, no huge ML model) and is
// honest about what it does. GPS is used first to narrow candidates; the image
// signature then ranks them.
//
// This module is shared by the calibration tool (to BUILD signatures from your
// photos) and by the server (to MATCH a query signature against stored ones).

// Reduce a set of RGBA pixels to a normalized histogram over a small color grid.
// We quantize each channel into BINS levels -> BINS^3 buckets. Small + robust.
const BINS = 4; // 4*4*4 = 64 buckets

function histogramFromPixels(pixels) {
  const hist = new Array(BINS * BINS * BINS).fill(0);
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 16) continue; // skip transparent
    const r = pixels[i] >> 6;     // 256/4 = 64 -> shift 6 bits
    const g = pixels[i + 1] >> 6;
    const b = pixels[i + 2] >> 6;
    hist[r * BINS * BINS + g * BINS + b] += 1;
    count++;
  }
  if (count === 0) return hist;
  for (let i = 0; i < hist.length; i++) hist[i] /= count; // normalize
  return hist;
}

// Average several histograms into one signature (use multiple angles per site).
function averageHistograms(hists) {
  if (!hists.length) return null;
  const out = new Array(hists[0].length).fill(0);
  for (const h of hists) for (let i = 0; i < h.length; i++) out[i] += h[i];
  for (let i = 0; i < out.length; i++) out[i] /= hists.length;
  return out;
}

// Similarity between two histograms: 1 - (Bhattacharyya-style distance).
// Higher = more similar (range ~0..1).
function similarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let bc = 0;
  for (let i = 0; i < a.length; i++) bc += Math.sqrt(a[i] * b[i]);
  return bc; // Bhattacharyya coefficient: 1 = identical distributions
}

// Haversine distance in metres between two lat/lng points (for GPS narrowing).
function metersBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

module.exports = { histogramFromPixels, averageHistograms, similarity, metersBetween, BINS };
