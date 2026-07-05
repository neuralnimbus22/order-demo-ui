# Operations

Deployment, configuration, observability, and CI. Deploy actions are performed by the
maintainer, not the agent — see [`CLAUDE.md` → Deployment / ops](../CLAUDE.md).

## Kubernetes

`k8s/order-demo-ui.yaml` — three objects in namespace `order-demo`, labeled
`app: order-demo-ui`:

- **Secret** `order-demo-ui` (`:14-23`) — `stringData.session-secret`, a demo
  placeholder (rotate via kubectl / a secret manager; not for production).
- **Deployment** (`:25-101`) — `replicas: 1`; image
  `ghcr.io/neuralnimbus22/order-demo-ui:latest` (`:44`), `imagePullPolicy: IfNotPresent`
  (`:45`); container port `http`/3000 (`:46-48`). Env (`:49-75`): `PORT=3000`, the five
  backend `*_URL`s as in-cluster FQDNs (`http://<svc>.order-demo.svc.cluster.local:<port>`),
  `SESSION_SECRET` via `secretKeyRef`, and **`COOKIE_INSECURE="true"`** (`:74-75`) because
  this is a no-TLS HTTP deployment. **No `AUTH_URL`** (the UI never calls auth-service).
  Resources: requests 100m/128Mi, limits 500m/256Mi (`:76-84`). Readiness (`:88-94`) and
  liveness (`:95-101`) probes both `httpGet /api/health` on 3000 —
  [liveness-only by design](api.md) so a degraded backend can't kill the pod.
- **Service** (`:103-117`) — `ClusterIP`, port 3000 → 3000. ClusterIP on purpose; reach
  it via `kubectl -n order-demo port-forward svc/order-demo-ui 3000:3000`.

**Cookie caveat:** the `session` cookie is `secure`, so reach the UI via **localhost**
(port-forward — a secure context) or HTTPS. A bare-IP `http://` LoadBalancer would
silently drop the cookie and break login. Manifests are validated with
`kubectl --dry-run=client` and applied by the maintainer.

## Docker image

`Dockerfile` — two stages, both `node:20-alpine`:

- **build** (`AS build`) — `npm ci` + `npm run build` with Next's `output: "standalone"`
  (`next.config.ts:6`), which prunes to `server.js` + minimal `node_modules`.
- **runtime** — `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000`; copies
  `.next/standalone` + `.next/static` + `public` (chown `node`); `EXPOSE 3000`;
  `USER node`; `CMD ["node","server.js"]` so `node` is PID 1 and takes SIGTERM directly.

## Observability (live load dashboard)

`k8s/observability/` (namespace `order-demo`, all ClusterIP) — an optional live dashboard
for the JMeter load test:

- `influxdb.yaml` — InfluxDB **1.8** + Service `:8086`; `INFLUXDB_DB=jmeter` auto-creates
  the DB; `emptyDir` (ephemeral). Pinned to 1.x because JMeter's
  `InfluxdbBackendListenerClient` speaks the 1.x line protocol; 2.x breaks it.
- `grafana.yaml` — Grafana **10.4.3** + Service `:3000`; admin creds from a Secret.
- `grafana-provisioning.yaml` — ConfigMaps for the InfluxQL datasource (uid
  `jmeter_influxdb`), a dashboard provider, and the JMeter dashboard JSON.
- `grafana-secret.yaml` — Grafana admin creds (demo placeholder).
- `README.md` — rationale (push→InfluxDB vs Prometheus pull), version pins, apply order.

JMeter pushes metrics here only when `bash jmeter/run.sh --influx` is used (additive, off
by default); reach the dashboard via
`kubectl -n order-demo port-forward svc/grafana 3000:3000`. See
[testing/suites.md → JMeter](testing/suites.md#jmeter--load).

## Configuration

`.env.example` (local-dev defaults; consumed only by the BFF via `lib/backend.ts`):

| Var | Meaning |
|---|---|
| `ORDER_URL` | order-service base URL (`:3002`) |
| `PAYMENT_URL` | payment-service (`:3004`) |
| `INVENTORY_URL` | inventory-service (`:3003`) |
| `PRODUCT_CATALOG_URL` | product-catalog (`:3005`) |
| `USER_SESSION_URL` | user-session (`:3006`) |
| `SESSION_SECRET` | cookie-signing secret (placeholder in the example) |

`auth-service` (`:3001`) is intentionally absent. `COOKIE_INSECURE` is not in
`.env.example`; it is set only in the in-cluster manifest and read at runtime
([architecture.md → Session & cookie model](architecture.md#session--cookie-model)).
Other config: `next.config.ts` (`output: "standalone"`); `tsconfig.json` excludes
`cypress`, `cypress.config.ts`, `selenium`; `eslint.config.mjs` ignores `cypress/**` +
`selenium/**` (isolation — [testing/overview.md](testing/overview.md#buildlint-isolation)).

## CI — `.github/workflows/`

- **`build-images.yml`** ("Build & Push Image (multi-arch)") — builds the UI image for
  `linux/amd64,linux/arm64` and pushes `ghcr.io/neuralnimbus22/order-demo-ui:latest` via
  buildx/QEMU. Triggers: push to `main` and `v*` tags, path-filtered to
  `app`/`components`/`lib`/`public` + build config.
- **`pr-sentinel.yml`** ("PR Sentinel Trigger") — on `pull_request`
  (opened/synchronize/reopened), POSTs to the TestKube cloud API to run the `pr-sentinel`
  workflow (auth via `secrets.TESTKUBE_API_TOKEN`), passing the PR number/title as running
  context. This is the entry point of the AI-driven test-selection ("sentinel") demo: a
  no-op sentinel workflow completing triggers a TestKube AI agent that reads the PR diff
  and routes to `ui-full-regression` (app changes) or `ui-quick-check` (test-only
  changes), or skips (docs only).

## Deploy

A push to `main` touching app code builds and pushes the image automatically. Then:

```bash
kubectl apply -f k8s/order-demo-ui.yaml
kubectl -n order-demo wait --for=condition=available --timeout=120s deploy/order-demo-ui
kubectl -n order-demo port-forward svc/order-demo-ui 3000:3000   # http://localhost:3000
```
