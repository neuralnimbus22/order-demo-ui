# Load testing (Gatling)

The **second load tool** for order-demo-ui — a showroom sibling to the JMeter
plan in [`../jmeter/`](../jmeter/README.md). Both load the same thing; the point
is the contrast in *how they're authored*: JMeter is XML, Gatling is **Scala
code**. "Here's the same load, in both."

Batch only — Gatling's native end-of-run **HTML report** is the artifact. No
live streaming / InfluxDB this tool (that's JMeter's `--influx`).

## What it loads

The BFF entry points (not the backend directly), same as JMeter:

- `GET /api/products` — fans out to product-catalog through the BFF (the
  representative read load).
- `GET /api/health` — cheap no-fan-out baseline.

`POST /api/auth/login` is an **opt-in** scenario (`--include-auth`, off by
default — mints real JWTs, needs user-session). `POST /api/checkout` is
**intentionally not loaded** — it places real correlation-id orders and would
pollute the system the functional suites and the live demo run against.

## Build tool: Maven + `gatling-maven-plugin`

Chosen over the brew bundle so the **Gatling version is pinned** in `pom.xml` —
CI/TestKube get the exact tool, not whatever a floating install ships (the same
portability lesson as Selenium Manager). And `mvn gatling:test` **fails the
build natively** on a breached assertion, so the gate is the tool's own exit
code — no results-parsing wrapper (unlike JMeter, whose CLI exits 0 regardless).

Pinned versions: `gatling-maven-plugin 4.16.3`, `gatling-charts-highcharts
3.13.5`, `scala-maven-plugin 4.9.2` (compiles the Scala simulation).

## Prerequisites

A **JDK (17+)** and **Maven** on `PATH`:

```bash
brew install maven      # brings a JDK too
```

Gatling itself is pulled by Maven (pinned in `pom.xml`) — **not vendored** here.
First run downloads dependencies into `~/.m2` (cached thereafter).

## Run

Same `E2E_BASE_URL` convention as every suite (default `http://localhost:3000`);
Gatling takes the base URL directly. The app is assumed **already running** —
this never starts it.

```bash
npm run test:load:gatling                 # or: bash gatling/run.sh
USERS=50 DURATION=60 npm run test:load:gatling
bash gatling/run.sh --include-auth        # + POST /api/auth/login load
E2E_BASE_URL=https://shop.example.com npm run test:load:gatling   # deployed UI
```

The read scenario needs product-catalog reachable behind the BFF (port-forward
it, or run against the deployed stack).

## Profile (env → `-D`, JMeter-matched defaults)

| env | default | `-D` | meaning |
|---|---|---|---|
| `USERS` | 20 | `users` | concurrent virtual users (closed model) |
| `RAMP` | 10 | `ramp` | ramp-up seconds |
| `DURATION` | 30 | `duration` | steady-hold seconds |
| `MAXMS` | 1500 | `maxms` | p95 response-time threshold (assertion) |

`run.sh` maps the env vars to `-D` system properties, which `pom.xml` propagates
into the forked Gatling JVM. The injection is a **closed model** (ramp to
`USERS` concurrent users, then hold for `DURATION`) — comparable to, not
byte-identical to, JMeter's thread ramp + scheduler hold.

## Pass/fail (assertions)

`OrderDemoUiLoadSimulation` asserts, globally:

- **zero failed requests**, and
- **p95 response time < `MAXMS`**.

A breach fails the Gatling run, which fails the Maven build → **`mvn
gatling:test` exits non-zero**. That exit code is the gate (verified: a tiny
`MAXMS` forces the p95 assertion false and the run exits 1).

## Report

Native HTML at `gatling/results/<simulation>-<timestamp>/index.html` (the
`results/` dir is gitignored). `run.sh` prints the exact path at the end.

## Layout

| path | what |
|---|---|
| `pom.xml` | Maven project; pins the Gatling + plugin versions |
| `src/test/scala/orderdemo/OrderDemoUiLoadSimulation.scala` | the simulation |
| `run.sh` | env → `-D` wrapper around `mvn gatling:test`; propagates the exit code |
| `results/`, `target/` | run output — gitignored |
