
```markdown
# Прогулка по Пушкинской — Pushkinskaya Street Tourist Guide

A web app that helps tourists explore Pushkinskaya Street in Rostov-on-Don. Point a
phone camera at a historical building or monument and the app identifies it and shows
its history.

Covers the three assignment tasks:

1. **Collected tourist-site information** — historical buildings and monuments only.
   Military buildings are excluded by design (see `services/sites-service/src/sites.js`).
2. **Photos from various angles** — you capture these on-site with the calibration tool.
   The app never photographs or stores military buildings.
3. **Camera-based identification** — the app recognises a site from the camera image
   and loads its textual description.

On top of the three assignment tasks, the app now doubles as a devops project: it's
been split from a single monolithic server into three independent, containerized
microservices, deployable with either Docker Compose or Kubernetes. That split is
described below.

## Architecture

The app used to be one Node process doing everything — catalogue, calibration,
recognition math, and serving the frontend. It's now three separate services that
talk to each other over HTTP:

- **`sites-service`** — the system of record for the site catalogue: names,
  addresses, GPS coordinates, descriptions, and reference photos. Nobody else stores
  this data; everyone else asks `sites-service` for it.
- **`identify-service`** — owns the calibration signatures (the MobileNet embeddings
  built from your reference photos) and the GPS-distance half of the matching score.
  It doesn't keep its own copy of site data — every time it needs coordinates, or
  needs to check a site id is valid, it calls `sites-service` over HTTP. That call is
  the concrete example of "microservices talking to each other" in this project.
- **`gateway`** — the only service the browser ever talks to. It serves the frontend
  (`index.html`, `calibrate.html`, `embedding.js` — unchanged from the monolith) and
  reverse-proxies every `/api/*` request to whichever backend service owns that data.
  The frontend has no idea `sites-service` and `identify-service` even exist.

How they find each other depends on where they're running. Locally with `docker
compose`, each service is reachable by its service name as a hostname (`http://
sites-service:5001`) thanks to Compose's built-in DNS. On Kubernetes, the same thing
happens via a `Service` object per microservice, which gives each one a stable
cluster-internal DNS name — same URL pattern, same code, different orchestrator
underneath.

The original single-service app (`src/`, `public/`, and the root `Dockerfile`) is
still in this repo for reference, but `services/` is what actually runs now.

## Your photos serve TWO purposes (both now built in)

When you photograph the sites, the same photos are used two ways:

**1. Display photos (how the app looks).** Drop your photos into the folder for each
site and they show up automatically in the catalogue and in the identification result
— no code editing. These folders now live under `sites-service`, since that's the
service that owns and serves them:

```
services/sites-service/photos/pushkin-monument/
services/sites-service/photos/paramonov-mansion/
services/sites-service/photos/fine-arts-museum/
services/sites-service/photos/bakulin-house/
services/sites-service/photos/betani-house/
services/sites-service/photos/pushkin-spheres/
services/sites-service/photos/squirrel-sculpture/
services/sites-service/photos/four-lions/
```

Put 3–5 photos in each (`.jpg`, `.jpeg`, `.png`, or `.webp`). Name them `1.jpg`,
`2.jpg`, `3.jpg` — they display in filename order. `sites-service` scans these folders
on each request, so new photos appear after a page refresh. Empty folders just mean no
photos show yet — the app doesn't break.

**2. Recognition signatures (how it identifies buildings).** Open `/calibrate.html`,
pick a site, upload the same photos, and save. This sends them to `identify-service`,
which converts them into embeddings used to recognise the building from the camera.
(Details below.)

So the workflow on the street is: photograph a site → drop the files in its
`sites-service` photo folder for display → upload them in the calibration tool for
recognition. Same photos, both jobs, now handled by two different services.

## Recognition: how it works

The app identifies a site two ways, combined into one confidence score:

- **Image recognition via transfer learning.** Each camera frame is run through
  **MobileNet** (a neural network pre-trained on millions of images) using
  TensorFlow.js, entirely in the browser. Instead of classifying, we take the
  network's 1024-number *feature embedding* — a rich description of the shapes and
  textures in the image. During calibration, each site's photos are turned into
  embeddings and stored by `identify-service`. At identify time, the camera's
  embedding is compared to each stored one with cosine similarity. This is transfer
  learning by feature extraction: we reuse a trained network rather than training one
  from scratch, which is what makes it work with a modest number of photos. It's far
  more robust to lighting and angle than a color histogram, because it keys on
  structure, not color.
- **GPS narrowing.** Each site has real coordinates, served by `sites-service`; your
  phone's location filters to nearby sites and contributes to the score.

The blend weights image similarity at 0.65 and GPS at 0.35, so the camera — not GPS —
drives the result, with location as a tiebreaker. Three modes are selectable: GPS +
photo (on the street), photo only (for testing anywhere), and GPS only.

**Accuracy depends on your photos.** Transfer learning works with a modest dataset,
but more is better: aim for **10+ photos per site, from varied angles, distances and
lighting**. With only 3–5 photos the model has little to generalize from. The
calibration tool shows how many photos contributed to each signature.

Everything runs client-side — no GPU, no Python, no training step that can fail. The
MobileNet model (~16 MB) loads from a CDN the first time you identify or calibrate, so
the first action needs an internet connection; after that it's cached.

## What only YOU can do (on-site work)

Two assignment tasks require you to physically be on Pushkinskaya Street — no service
split changes this:

- **Task 2 — take the photos.** Walk the street, photograph each site from 3–5 angles.
  Do not photograph military buildings.
- **Calibrate.** Open `/calibrate.html`, pick each site, upload your photos, and save.
  This builds the recognition signatures from YOUR images, via `identify-service`.
  Until you do this, the app identifies sites by GPS only (still functional for a
  demo).

Task 1 is done: 8 real historical sites with addresses, dates, authors, coordinates,
and descriptions, all from open local-history sources, with no military objects — now
living in `services/sites-service/src/sites.js`.

## Run with Docker Compose

The whole three-service stack builds and runs with one command:

```bash
docker compose up --build
```

This builds `sites-service`, `identify-service`, and `gateway` from
`services/*/Dockerfile`, wires them together on a shared network with Compose's
built-in DNS, and starts all three. Open http://localhost:4000. Stop with `Ctrl+C`, or
`docker compose up -d` to run in the background.

Calibration data (`signatures.json`) is kept in a named Docker volume
(`identify-data`), so it survives container restarts and rebuilds — the container
answer to the "data resets on redeploy" problem you'd hit on a free hosting tier.
Reference photos live in a bind-mounted folder
(`services/sites-service/photos`), so new photos show up without rebuilding anything.

Note: Docker packages and runs the app; it does not by itself give you a public URL or
HTTPS. To expose it on the internet you still need to run the containers on a host (a
VPS, a Kubernetes cluster, etc.) behind a reverse proxy with a certificate.

## Run with Kubernetes

For a more production-shaped deployment, the same three services also run on
Kubernetes. Manifests are in `k8s/`:

- `00-namespace.yaml` — isolates everything under a `pushkinskaya` namespace.
- `configmap.yaml` — holds the internal service URLs (`SITES_SERVICE_URL`,
  `IDENTIFY_SERVICE_URL`), injected into pods as environment variables.
- `sites-service-deployment.yaml` / `-service.yaml` — internal-only (`ClusterIP`).
- `identify-service-deployment.yaml` / `-service.yaml` / `-pvc.yaml` — internal-only,
  plus a `PersistentVolumeClaim` so `signatures.json` survives pod restarts and
  rescheduling, same job the Docker volume does in Compose.
- `gateway-deployment.yaml` / `-service.yaml` — the externally-reachable one
  (`NodePort`).

Every Deployment defines `readinessProbe`/`livenessProbe` checks against each
service's `/health` endpoint, so Kubernetes automatically restarts a pod that stops
responding — something Compose doesn't do for you.

To try it locally with `kind`:

```bash
kind create cluster --name pushkinskaya
kind load docker-image sites-service:latest --name pushkinskaya
kind load docker-image identify-service:latest --name pushkinskaya
kind load docker-image gateway:latest --name pushkinskaya
kubectl apply -f k8s/
kubectl get pods -n pushkinskaya
kubectl port-forward svc/gateway -n pushkinskaya 4000:4000
```

Then open http://localhost:4000, same as with Compose.

## Run locally (without Docker)

Each service can also run as a plain Node process for quick debugging — you'll need
three terminals:

```bash
# terminal 1
cd services/sites-service && npm install && npm start        # :5001

# terminal 2
cd services/identify-service && npm install && npm start     # :5002

# terminal 3
cd services/gateway && npm install && npm start               # :4000
```

Open http://localhost:4000.

- Main app: the **Камера** tab (needs camera + location permission — works best on a
  phone, or any laptop with a webcam).
- Catalogue: **Все объекты** lists every site with full text.
- Calibration: http://localhost:4000/calibrate.html

**Camera + GPS need HTTPS on phones.** On localhost it works; once deployed, use an
https URL.

## Deploying publicly

The original single-service version of this app deployed easily to a free host like
Render (push to GitHub, connect the repo, `npm install` / `npm start`). With three
separate services, a single free-tier "web service" host doesn't map cleanly onto the
architecture anymore — you'd need either three separate deployed services wired
together with real URLs (not container-name DNS), or a host that runs Docker Compose
or Kubernetes directly, such as a small VPS. If you go the VPS route, `docker compose
up -d` on the server plus a reverse proxy (Nginx + Certbot) in front of `gateway` is
the most direct path.

## Sites included (Task 1)

Monument to Pushkin (1959) · Paramonov Mansion / ZNB SFU library (1914) · Regional Museum
of Fine Arts (1898) · Bakulin House (late 19th c.) · Betani House (1904) · Pushkin Spheres ·
Squirrel sculpture (2023) · Four Lions sculpture. All historical/cultural; no military.

## Project structure

```
pushkinskaya-app-test/
├── services/
│   ├── sites-service/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── photos/            # reference photos, one folder per site id
│   │   └── src/
│   │       ├── server.js      # GET /sites, /sites/:id, static /images
│   │       └── sites.js       # site data — real sites, no military
│   ├── identify-service/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── server.js      # /signatures, /calibrated, /calibrate, /distance
│   │       └── recognition.js # GPS distance math
│   └── gateway/
│       ├── Dockerfile
│       ├── package.json
│       ├── public/            # frontend: index.html, calibrate.html, embedding.js
│       └── src/
│           └── server.js      # serves the frontend, proxies /api/* and /images
├── k8s/                       # Kubernetes manifests for all three services
├── docker-compose.yml         # local multi-service orchestration
├── src/, public/, Dockerfile  # original single-service app, kept for reference
└── package.json
```

## API

The browser only ever calls the **gateway**, on port 4000. It proxies to whichever
backend service actually owns the data:

| Method | Path (via gateway) | Proxied to | Purpose |
|--------|---------------------|------------|---------|
| GET  | `/api/sites` | sites-service | List all sites |
| GET  | `/api/sites/:id` | sites-service | One site |
| GET  | `/images/:id/:file` | sites-service | A site's reference photo |
| GET  | `/api/signatures` | identify-service | Sites merged with stored embeddings |
| GET  | `/api/calibrated` | identify-service | Ids that already have a signature |
| POST | `/api/calibrate` | identify-service | Save a site's embeddings from your photos |
| POST | `/api/calibrate/clear` | identify-service | Clear a site's signature |
| POST | `/api/distance` | identify-service | `{lat,lng}` → distance in metres to every site |

Internally, `sites-service` and `identify-service` also expose `/health` (used by
Docker/Kubernetes health checks) and, in `identify-service`'s case, calls
`sites-service`'s `/sites` and `/sites/:id` directly to fetch coordinates and validate
site ids — the inter-service communication mentioned in Architecture, above.
```
