# printcast

An HTTP→ESC/POS bridge for a homelab thermal printer. `printcast` is a fan-in
surface: many notification sources (n8n, Home Assistant, ntfy, `curl`) POST JSON
to one HTTP API, and the service prints to a single network thermal printer.

- **Printer:** Qian T80UL-RI-02, 80mm thermal, ESC/POS, reached over LAN on raw
  TCP port 9100 (JetDirect). 72mm print area = 48 characters per line.
- **Stack:** Python 3.12, FastAPI + uvicorn, `python-escpos`, Pillow, requests.
- **Frontend:** React + Vite + shadcn/ui, bundled into the same container.
  First-run setup wizard, supervision dashboard, analytics, and a job-history
  viewer all live at `/` once the service is reachable.

## How it works

The printer cannot multiplex jobs and drops idle sockets, so `printcast`:

- opens a **fresh connection per job**, wrapped in retry with exponential
  backoff (2s → 4s → 8s);
- **serializes** every job behind a single lock;
- selects codepage **CP858** on each connection so French accents render,
  falling back to MagicEncode `AUTO` if the printer rejects that name;
- exposes structured (JSON) logs and Prometheus metrics.

## Configuration

All configuration is through environment variables (see `.env.example`):

| Variable             | Required | Default          | Purpose                                                       |
|----------------------|----------|------------------|---------------------------------------------------------------|
| `PRINTER_HOST`       | no¹      | —                | Printer IP / hostname                                         |
| `PRINTER_PORT`       | no       | `9100`           | Raw TCP / JetDirect port                                      |
| `PRINTER_AUTODETECT` | no       | `true`           | When `PRINTER_HOST` is empty, discover at startup (mDNS+scan) |
| `PRINTER_CODEPAGE`   | no       | `CP858`          | Codepage for accents                                          |
| `PRINTER_TOKEN`      | yes      | —                | Bearer token for `/print*` endpoints                          |
| `PRINTER_TIMEOUT`    | no       | `20`             | Per-job socket timeout (seconds)                              |
| `PRINTER_RETRIES`    | no       | `3`              | Attempts per job                                              |
| `PRINTER_QUEUE_ENABLED` | no    | `true`           | Queue jobs while the printer is offline (see Offline queue)  |
| `PRINTER_QUEUE_POLL_SECONDS` | no | `30`            | Worker probe interval between flushes (min 5)                |
| `PRINTER_QUEUE_MAX`  | no       | `500`            | Max pending jobs before submissions get HTTP 503 (min 1)     |
| `TZ`                 | no       | `Europe/Paris`   | Timezone for printed timestamps                               |

¹ If `PRINTER_HOST` is unset, the service auto-detects on startup: mDNS first
(`_pdl-datastream._tcp`, `_printer._tcp`, `_ipp._tcp`) then a parallel TCP scan
of the local /24 on `PRINTER_PORT`. Startup fails if nothing is found — set
`PRINTER_HOST` explicitly to skip discovery.

The service listens on `0.0.0.0:8080`.

## Deployment

```sh
docker compose up -d --build
```

On the first deployment you do **not** need to pre-fill `.env`: open the web UI
at `https://printcast.battistella.ovh/` and walk through the setup wizard —
printer host + port, a generated or pasted bearer token, a TCP probe, and
you're done. Settings are persisted to the named volume `printcast-data` as
`/app/data/config.json`, applied immediately, and survive container rebuilds.

`.env` is still respected as the initial seed for `PRINTER_HOST`,
`PRINTER_PORT`, `PRINTER_TOKEN`, etc. — useful for unattended deploys.

The compose file joins the external `lan` network and exposes the service
through Traefik at `https://printcast.battistella.ovh`. The container runs as a
non-root user with `no-new-privileges`, a 256M memory limit, capped JSON-file
logs, and a healthcheck that probes `/health`.

## Web UI

The same container that serves the API also serves the bundled React UI on
`/`. Endpoints:

| Route          | Purpose                                                |
|----------------|--------------------------------------------------------|
| `/setup`       | First-run wizard (only shown until setup is complete). |
| `/` (root)     | Supervision dashboard — printer health, last job, KPIs.|
| `/analytics`   | Throughput charts, success rate, type breakdown.       |
| `/jobs`        | Last 200 jobs with status, duration, source.           |
| `/test`        | Compose ad-hoc text/receipt prints from the browser.   |
| `/draw`        | Finger-paint a dessert on mobile and print it.         |
| `/settings`    | Edit printer config and rotate the webhook token.      |

Authentication is split in two:
- **The web UI** uses email/password through a [better-auth](https://better-auth.com)
  sidecar. The first user created via the setup wizard becomes the `admin`
  and is the only one who can reach `/settings`, `/analytics`, and `/test`.
  Sessions live in an HTTP-only cookie; no `localStorage`.
- **Webhook callers** (`/print/text`, `/print/receipt`, `/print/image`,
  `/print`) keep using the shared bearer token from the setup wizard — so
  existing n8n / Home Assistant / ntfy / curl integrations don't break.

Required env vars when deploying:

| variable                | what it does                                                                |
|-------------------------|-----------------------------------------------------------------------------|
| `AUTH_SECRET`           | 32+ byte random string used to sign better-auth session cookies.            |
| `AUTH_TRUSTED_ORIGINS`  | Comma-separated list of public URLs (e.g. `https://printcast.example.com`). |

### Frontend dev loop

```sh
cd frontend
npm install
npm run dev          # vite on :5173, proxies /api, /print, /health to :8080
```

Run the Python backend separately (`python app.py`) and Vite will proxy API
calls to it during development.

## Offline queue

When a print job is submitted while the printer is unreachable, printcast
persists it to a durable SQLite queue instead of failing. The endpoint returns
**HTTP 202** with `{"status":"queued","job":...,"queue_depth":N}` rather than a
`502`. A background worker probes the printer every `PRINTER_QUEUE_POLL_SECONDS`
and, once it is reachable, flushes the queue in **FIFO** order, printing every
pending job. A flushed job lands in the normal job history as a `success`.

- **Bad input is never queued.** Validation errors (`422`) and unloadable images
  (`400`) are rejected before any queue decision.
- **Genuine errors are never queued.** If the printer is reachable but the job
  fails, it is recorded as an error and returns `502` — only connectivity
  failures are queued, which avoids poison-requeue.
- **`/print/test` and `/print/selftest` are not queued** (diagnostics/canary must
  not pile up); they behave as before when the printer is offline.
- **Cap.** At most `PRINTER_QUEUE_MAX` jobs are held; further submissions get
  HTTP `503 print queue is full`.
- **Image jobs** are stored as a self-contained base64 PNG data URL at enqueue
  time, so they stay printable even if the original URL stops resolving.
- Set `PRINTER_QUEUE_ENABLED=false` to disable queueing (offline submissions
  then fail with `502` as before).

Admin endpoints (same auth as the other `/api/*` routes):

| Method   | Path                | Purpose                                |
|----------|---------------------|----------------------------------------|
| `GET`    | `/api/queue`        | List pending jobs and the queue depth. |
| `POST`   | `/api/queue/flush`  | Trigger an immediate flush attempt.    |
| `DELETE` | `/api/queue`        | Clear the whole queue.                 |
| `DELETE` | `/api/queue/{id}`   | Remove one queued job.                 |

`queue_depth` is also reported on `/health` and the analytics summary.

## API

All `/print*` and `/api/*` (except `/api/setup/status`) endpoints require a
bearer token:

```
Authorization: Bearer <PRINTER_TOKEN>
```

`/health`, `/metrics`, and `/api/setup/status` are unauthenticated. Before the
setup wizard is completed, `/api/setup/*` is also unauthenticated so the UI can
bootstrap. On a printer failure the `/print*` endpoints return HTTP `502`; bad
input returns `400`; a missing/invalid token returns `401`.

### Admin & analytics API

These power the React frontend but are usable from anywhere:

| Method & path                       | Purpose                                       |
|-------------------------------------|-----------------------------------------------|
| `GET  /api/setup/status`            | Has the wizard been completed?                |
| `POST /api/setup/generate-token`    | Generate a 64-char hex bearer token.          |
| `POST /api/setup/test-connection`   | TCP-probe a host/port before saving.          |
| `POST /api/setup/complete`          | Persist initial config and mark setup done.   |
| `GET  /api/config`                  | Current effective configuration (no token).   |
| `PUT  /api/config`                  | Update one or more configuration fields.      |
| `GET  /api/jobs?limit=&status=`     | Last N rows of the SQLite job history.        |
| `GET  /api/analytics/summary`       | Totals, KPIs, recent errors, last job.        |
| `GET  /api/analytics/timeseries?hours=` | Bucketed success/error counts for charts. |

### `GET /health` — no auth

TCP-connect probe of the printer (no ESC/POS status read).

```sh
curl https://printcast.battistella.ovh/health
```

```json
{"status":"ok","service":"printcast",
 "printer":{"host":"192.168.30.40","port":9100,"reachable":true}}
```

### `GET /metrics` — no auth

Prometheus text exposition:

```sh
curl https://printcast.battistella.ovh/metrics
```

```
printer_jobs_total{status="success"} 12
printer_jobs_total{status="error"} 1
printer_last_job_timestamp_seconds 1747000000.0
```

### `GET /discover` — bearer token required

List printer candidates reachable on the LAN right now. Useful when the IoT
VLAN changes or to confirm what auto-detection would pick.

```sh
curl https://printcast.battistella.ovh/discover \
  -H "Authorization: Bearer $PRINTER_TOKEN"
```

```json
{"port":9100,
 "candidates":[
   {"host":"192.168.30.40","port":9100,"name":"T80UL","service":"_pdl-datastream._tcp","method":"mdns","reachable":true}
 ]}
```

### `POST /print/text`

`{text, align?, bold?, underline?, cut?}` — `align` is `left|center|right`.

```sh
curl -X POST https://printcast.battistella.ovh/print/text \
  -H "Authorization: Bearer $PRINTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Le café est prêt à la cuisine ☕","align":"center","bold":true}'
```

### `POST /print/receipt`

`{title?, subtitle?, lines[], qr?, barcode?, barcode_type?, footer?, timestamp?, cut?}`

```sh
curl -X POST https://printcast.battistella.ovh/print/receipt \
  -H "Authorization: Bearer $PRINTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "COURSES",
    "subtitle": "Marché du samedi",
    "lines": ["- Pain", "- Café", "- Œufs x6", "- Crème fraîche"],
    "qr": "https://printcast.battistella.ovh/health",
    "footer": "Bon appétit !",
    "timestamp": true
  }'
```

`barcode_type` defaults to `CODE128` (also supports `EAN13`, `CODE39`, …).

### `POST /print/image`

`{image, align?, caption?, cut?}` — `image` is an `http(s)` URL **or** base64
(plain or a `data:` URL). Images wider than 512 dots are downscaled.

```sh
curl -X POST https://printcast.battistella.ovh/print/image \
  -H "Authorization: Bearer $PRINTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"image":"https://example.com/logo.png","caption":"Logo"}'
```

### `POST /print`

Generic job — `{text?, title?, qr?, barcode?, image?, cut?}`. At least one field
must be set.

```sh
curl -X POST https://printcast.battistella.ovh/print \
  -H "Authorization: Bearer $PRINTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"RAPPEL","text":"Sortir les poubelles ce soir","qr":"https://ha.battistella.ovh"}'
```

### `POST /print/test`

Prints a test receipt (accents + QR + timestamp). Used by the daily cron to
validate the end-to-end path and catch paper-out.

```sh
curl -X POST https://printcast.battistella.ovh/print/test \
  -H "Authorization: Bearer $PRINTER_TOKEN"
```

Daily 09:00 cron entry on the Docker host:

```cron
0 9 * * * curl -fsS -X POST https://printcast.battistella.ovh/print/test \
  -H "Authorization: Bearer $PRINTER_TOKEN" >/dev/null
```

## Integrations

### n8n

Import `integrations/n8n-print-receipt.workflow.json` — an **Execute Workflow
Trigger → HTTP Request** sub-workflow that POSTs to `/print/receipt`. After
import, edit the HTTP Request node and replace `YOUR_PRINTCAST_TOKEN` in the
`Authorization` header with your real token (or wire an n8n Header Auth
credential).

Call it from any workflow with an **Execute Workflow** node; the JSON you pass
becomes the receipt body:

```json
{
  "title": "COMMANDE",
  "lines": ["Réf 4815 — 2 articles", "Total : 42,00 €"],
  "footer": "Merci !",
  "timestamp": true
}
```

### Home Assistant

Add a REST notifier to `configuration.yaml`. It creates a `notify.printer`
service:

```yaml
notify:
  - name: printer
    platform: rest
    resource: https://printcast.battistella.ovh/print/text
    method: POST_JSON
    message_param_name: text
    headers:
      Authorization: !secret printcast_token   # value: "Bearer <token>"
```

In `secrets.yaml`:

```yaml
printcast_token: "Bearer your-real-token-here"
```

Then call it from an automation or script:

```yaml
service: notify.printer
data:
  message: "Lave-linge terminé — pense à étendre 🧺"
```

### ntfy

`integrations/ntfy-bridge.sh` subscribes to an ntfy topic and prints every
message via `/print/text`. Run it as a long-lived process:

```sh
NTFY_TOPIC=homelab-alerts \
PRINTCAST_TOKEN=your-real-token-here \
./integrations/ntfy-bridge.sh
```

Anything published to that topic then prints:

```sh
ntfy publish homelab-alerts "Sauvegarde nocturne terminée ✅"
```

Override `NTFY_URL` / `PRINTCAST_URL` if you self-host ntfy or use a different
printcast hostname. Requires the `ntfy` CLI, `curl`, and `jq`.

## Ops notes

- **Paper:** 80mm-wide BPA-free thermal roll. The 72mm print area gives 48
  characters per line — keep `lines[]` entries within that to avoid wrapping.
- **Daily test print:** the 09:00 `/print/test` cron is a paper-out canary — a
  blank or missing printout in the morning means the roll is empty or jammed.
- **Head cleaning:** wipe the thermal head with a lint-free swab and isopropyl
  alcohol every few rolls (and whenever print looks faint or streaky); let it
  dry fully before printing again.
- **Faint output** that cleaning doesn't fix usually means an old roll or one
  loaded upside down — thermal paper only prints on the coated side.
- **Connectivity:** the printer sits on the IoT VLAN at a fixed IP. If `/health`
  reports `reachable:false`, check the VLAN/firewall path to TCP `9100` before
  suspecting the service.
