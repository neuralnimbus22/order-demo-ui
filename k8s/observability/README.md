# Observability — live JMeter dashboard (InfluxDB 1.x + Grafana)

Turns the JMeter load test (`jmeter/`) from an after-the-fact `.jtl` into **live
graphs**: JMeter's Backend Listener pushes metrics during the run to InfluxDB,
and Grafana renders them on a provisioned dashboard you watch move in real time.

All in namespace `order-demo`, alongside the app.

## Why InfluxDB + Grafana (and not Prometheus)

JMeter's Backend Listener **pushes** metrics out. Prometheus **pulls/scrapes**
targets — the wrong model for a short-lived push source (you'd need a
pushgateway shim, and it still wouldn't match JMeter's built-in listener). The
built-in `InfluxdbBackendListenerClient` speaks the **InfluxDB 1.x** line
protocol directly, so InfluxDB 1.x + Grafana is the native fit.

## Version pin that matters

**InfluxDB is pinned to `1.8` (the 1.x line) on purpose.** The built-in JMeter
listener speaks the 1.x `/write` API. InfluxDB **2.x** changed everything (Flux,
`/api/v2/write`, tokens/orgs/buckets) and **breaks the built-in listener** — do
not bump to 2.x.

Correspondingly, the Grafana datasource is configured as **InfluxQL** (not
Flux). A Flux datasource against a 1.x server connects but returns no data.

## What's here

| file | what |
|---|---|
| `influxdb.yaml` | InfluxDB 1.8 Deployment + ClusterIP Service `:8086`; `INFLUXDB_DB=jmeter` auto-creates the DB. `emptyDir` storage — **demo metrics are ephemeral**. |
| `grafana.yaml` | Grafana 10.4.3 Deployment + ClusterIP Service `:3000`; admin creds from the Secret; provisioning ConfigMaps mounted. |
| `grafana-secret.yaml` | Grafana admin creds — **demo placeholder** (same posture as `SESSION_SECRET`); rotate for real use. |
| `grafana-provisioning.yaml` | three ConfigMaps: the InfluxQL datasource, the dashboard provider, and the JMeter dashboard JSON. |

The dashboard queries are aligned to the **exact schema**
`InfluxdbBackendListenerClient` writes — measurement `jmeter`; tags
`application`/`statut`/`transaction`; fields `count`/`avg`/`pct95.0`/`meanAT`/
`countError`. Aggregate panels use `transaction='all'` with `statut='all'`;
per-endpoint panels match the sampler names. (Verified against a live InfluxDB
1.8 + Grafana, not guessed.) Panels reference the datasource by its provisioned
uid `jmeter_influxdb`.

## Apply

```bash
kubectl apply -f k8s/observability/grafana-secret.yaml
kubectl apply -f k8s/observability/influxdb.yaml
kubectl apply -f k8s/observability/grafana-provisioning.yaml
kubectl apply -f k8s/observability/grafana.yaml
kubectl -n order-demo rollout status deploy/influxdb deploy/grafana
```

(Order isn't strict — Grafana re-reads provisioning on start; apply the Secret
and provisioning before Grafana so they're present on first boot.)

## Demo flow — watch the graphs move

```bash
# 1. reach Grafana (same port-forward pattern as the UI)
kubectl -n order-demo port-forward svc/grafana 3000:3000
#    open http://localhost:3000  (admin / the Secret password)
#    dashboard: "JMeter — order-demo-ui BFF load (live)"

# 2. in another terminal, run the load against the DEPLOYED UI, streaming to InfluxDB
E2E_BASE_URL=http://localhost:3001 INFLUX_URL=http://influxdb.order-demo.svc.cluster.local:8086/write?db=jmeter \
  THREADS=50 DURATION=120 npm run test:load
#    (port-forward svc/order-demo-ui 3001:3000 for E2E_BASE_URL; or use the in-cluster URL
#     if you run JMeter from inside the cluster, e.g. via TestKube)
```

Watch active threads, throughput, response time (avg/p95), and errors update
live as the run ramps. `--influx` uses the in-cluster FQDN automatically when
JMeter runs inside the cluster; `INFLUX_URL` overrides it for any target.

## Notes

- ClusterIP only (no LoadBalancer/Ingress) — reach Grafana by port-forward, same
  as the UI.
- Storage is `emptyDir`; restarting InfluxDB clears history. Swap to a PVC if you
  want metrics to persist across restarts.
- The Backend Listener is **additive** to the JMeter plan and **off by default** —
  the `.jtl` write + the wrapper's pass/fail gate (chunk 10) are unchanged when
  streaming is off. See `jmeter/README.md`.
