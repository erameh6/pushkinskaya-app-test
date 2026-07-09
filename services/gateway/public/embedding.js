// public/embedding.js
// Transfer-learning recognition using MobileNet feature embeddings.
//
// Instead of a color histogram, we run each image through MobileNet (a neural
// network pre-trained on millions of images) and take its 1024-number feature
// vector — a rich description of shapes, textures and structures in the image.
// Two photos of the same building produce similar vectors even under different
// lighting or angle, which is exactly what the color histogram could not do.
//
// This is "transfer learning" via feature extraction: we reuse a trained network
// and compare its output features, rather than training a model from scratch
// (which would need far more data). Everything runs in the browser — no server
// GPU, no Python, no training step.
//
// Loaded from CDN: TensorFlow.js + the MobileNet model.

const Embed = (function () {
  let model = null;
  let loading = null;

  // Lazy-load TF.js and MobileNet the first time we need them.
  function ensureScripts() {
    if (window.mobilenet && window.tf) return Promise.resolve();
    return new Promise((resolve, reject) => {
      function add(src) {
        return new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = src; s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      add('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js')
        .then(() => add('https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js'))
        .then(resolve).catch(reject);
    });
  }

  async function load(onStatus) {
    if (model) return model;
    if (loading) return loading;
    loading = (async () => {
      if (onStatus) onStatus('loading-scripts');
      await ensureScripts();
      if (onStatus) onStatus('loading-model');
      // version 2, alpha 1.0 = the accurate variant; fine for a few sites.
      model = await window.mobilenet.load({ version: 2, alpha: 1.0 });
      if (onStatus) onStatus('ready');
      return model;
    })();
    return loading;
  }

  // Produce a normalized 1024-d embedding from a <canvas>, <img>, or <video>.
  // We use mobilenet.infer(x, true) to get the internal feature vector
  // (the "embedding"), not the 1000-class ImageNet prediction.
  async function embed(el) {
    const m = await load();
    const logits = m.infer(el, true);          // true => return embedding
    const data = await logits.data();          // Float32Array length 1024
    logits.dispose();
    // L2-normalize so we can compare with a plain dot product (cosine similarity).
    let norm = 0;
    for (let i = 0; i < data.length; i++) norm += data[i] * data[i];
    norm = Math.sqrt(norm) || 1;
    const out = new Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data[i] / norm;
    return out;
  }

  // Cosine similarity between two normalized embeddings (0..1, higher = closer).
  function similarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return Math.max(0, dot); // normalized vectors => dot product is cosine
  }

  // Average several embeddings into one site signature, then re-normalize.
  function average(list) {
    if (!list.length) return null;
    const out = new Array(list[0].length).fill(0);
    for (const v of list) for (let i = 0; i < v.length; i++) out[i] += v[i];
    let norm = 0;
    for (let i = 0; i < out.length; i++) { out[i] /= list.length; norm += out[i] * out[i]; }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    return out;
  }

  return { load, embed, similarity, average };
})();
