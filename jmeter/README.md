# Load testing (JMeter)

A **load test** of the order-demo-ui BFF — a different test *type* from the
functional suites (Playwright / Cypress / Selenium). It drives concurrent HTTP
traffic at the BFF's API routes to show the app holds up under load.

It loads the **BFF entry points**, not the backend services directly:
`GET /api/products` fans out to product-catalog through the BFF (the primary,
representative target — product browsing is the dominant real traffic), and
`GET /api/health` is a cheap no-fan-out baseline.

## Files

| path | what |
|---|---|
| `order-demo-load.jmx` | the JMeter test plan (parameterized; readable) |
| `run.sh` | headless runner — parses `E2E_BASE_URL`, runs JMeter, gates pass/fail |
| `results/` | `.jtl` + log (+ optional HTML report) — gitignored |

## Prerequisites

Java + Apache JMeter on your `PATH` (the JMeter binary is **not** vendored here):

```bash
brew install jmeter      # pulls a JRE too
# or download: https://jmeter.apache.org/download_jmeter.cgi
```

## Run

Same `E2E_BASE_URL` convention as every other suite — the app is assumed
**already running**; this never starts it. `run.sh` parses `E2E_BASE_URL`
(default `http://localhost:3000`) into the `scheme/host/port` JMeter needs.

```bash
# default profile (20 threads, 10s ramp, 30s), local app
npm run test:load
#   or: bash jmeter/run.sh

# against a deployed UI (TestKube sets E2E_BASE_URL the same way)
E2E_BASE_URL=https://shop.example.com npm run test:load
```

The read-load group needs product-catalog reachable behind the BFF
(port-forward it, or run against the deployed stack).

## Profile (env-overridable, with demo defaults)

| var | default | meaning |
|---|---|---|
| `THREADS` | 20 | concurrent users on the read group |
| `RAMPUP` | 10 | ramp-up seconds |
| `DURATION` | 30 | run seconds (scheduler-driven) |
| `MAXMS` | 1500 | per-request response-time threshold (Duration Assertion) |

```bash
THREADS=50 DURATION=60 npm run test:load
```

These map to JMeter properties (`-Jthreads` etc.), so TestKube can override them
the same way.

## Assertions & pass/fail gating

Every sampler has a **Response Code = 200** assertion and a **Duration <
`MAXMS`** assertion — that's what makes this a *test*, not a benchmark.

**Important:** JMeter's CLI exits `0` even when assertions fail — it does not
fail the process on a breached assertion. So `run.sh` does the gating: after the
run it inspects the `.jtl` `success` column and **exits non-zero if any sample
failed an assertion or errored** (or if zero samples were taken). That makes it
safe to gate a pipeline on `npm run test:load`.

`run.sh` prints a summary: requests, failures, error %, avg, and p95.

Optional HTML report: `bash jmeter/run.sh --report` → `results/report/index.html`.

## Live streaming to a dashboard (InfluxDB + Grafana)

For real-time graphs during a run, JMeter's Backend Listener can push metrics to
InfluxDB 1.x, visualized in Grafana. The observability stack lives in
[`k8s/observability/`](../k8s/observability/README.md).

```bash
# stream to the in-cluster InfluxDB (run from inside the cluster / TestKube)
bash jmeter/run.sh --influx

# or point at any InfluxDB 1.x explicitly
INFLUX_URL=http://influxdb.order-demo.svc.cluster.local:8086/write?db=jmeter npm run test:load
```

**Additive and off by default — chunk 10 is unaffected.** The Backend Listener
is `enabled="false"` in `order-demo-load.jmx`; `run.sh` enables it (in a temp
copy of the plan, under `results/`) **only** when an InfluxDB URL is given, and
supplies it via `-Jinflux_url`. With streaming off the listener never loads, so
the `.jtl` write and the pass/fail gate above run exactly as before. (An *empty*
`influxdbUrl` would make the listener's `setupTest` throw and abort the run —
which is why "skip" is "listener disabled", not "empty URL".) The listener never
affects pass/fail; that stays driven by the assertions + the `.jtl` gate.

## POST endpoints — deliberately limited

- **`POST /api/auth/login`** — an authenticated-flow load group exists but is
  **OFF by default** (`auththreads=0`). Opt in with `bash jmeter/run.sh
  --include-auth` (set the count with `AUTHTHREADS_N=…`). It mints real JWTs and
  needs user-session reachable, so it's noisier than the GETs.
- **`POST /api/checkout`** is intentionally **NOT loaded** — every call places a
  real correlation-id order (publishes to Kafka, writes inventory state), so
  load-testing it would pollute the very system the functional suites and the
  live demo run against. If you ever truly need to, add a thread group hitting
  it against a throwaway environment only.
