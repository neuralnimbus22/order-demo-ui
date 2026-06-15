# Container image scan (Trivy)

CVE scan of the order-demo-ui **container image** — the artifact half of the
security pair. It does **not** run the app and does **not** use `E2E_BASE_URL`.

| tool | when | what it scans |
|---|---|---|
| **Semgrep** (`semgrep/`) | source-time | the **source code** for vulnerable patterns |
| **Trivy** (this) | artifact-time | the built **image** for known CVEs in OS packages + node deps that actually ship |

Different question, different layer: Semgrep = "is my code written safely",
Trivy = "does my shipped image contain known-vulnerable packages / base layers".

## Run

```bash
npm run test:trivy        # build the image locally, then scan it (default)
TRIVY_IMAGE=ghcr.io/neuralnimbus22/order-demo-ui:latest npm run test:trivy   # scan the published image
```

Prereq: **Docker**. The Trivy image is **pinned** (`aquasec/trivy:0.58.1`) and
pulled — not vendored. Trivy's vulnerability DB is fetched at scan time (needs
network; cached under `trivy/.trivy-cache/`). Container-based and isolated under
`trivy/` — no effect on `npm run build`/`lint`.

## What it scans

- **Default (Option A): local build + scan.** `run.sh` builds the image from the
  repo Dockerfile (`order-demo-ui:scan`), `docker save`s it to a tar, and Trivy
  scans the tar via `--input`. Self-contained — no docker-socket mount, no
  registry auth, works offline (except the DB fetch), and scans exactly the
  current source's image.
- **Option B: published image** (`TRIVY_IMAGE=<ref>`). Scans the real published
  artifact directly (the GHCR image is public, so no auth).
- **Scanners:** `vuln` (OS packages + node deps) and `secret` (secrets baked
  into layers). Vulnerabilities are the primary story; any secret findings are
  surfaced in the summary.

## Severity gate

`GATED_SEVERITIES="HIGH,CRITICAL"` + `GATE_FIXABLE_ONLY=1` (constants at the top
of `run.sh`):

- The run exits non-zero **only on HIGH/CRITICAL — and only FIXABLE ones**
  (a CVE with an available fix). MEDIUM/LOW/UNKNOWN are reported, not gated.
- **`--ignore-unfixed` applies to the *gate*, not the *report*.** A HIGH with no
  available fix is noise you can't action — failing CI on it just trains people
  to ignore the gate. But hiding it would be dishonest, so **all** HIGH/CRITICAL
  are still listed (marked `NO FIX`); only the fixable ones fail the build.
  Flip `GATE_FIXABLE_ONLY=0` to gate on unfixed too; widen `GATED_SEVERITIES` to
  gate MEDIUM/LOW.

## Output & trust

- JSON → `trivy/results/trivy.json` (gitignored). Summary prints vulns by
  severity, then each gated finding as `[SEV] CVE  pkg installed -> fix/NO FIX`,
  plus any secrets.
- A scan that **can't complete** (image not built, tar missing, DB won't update,
  Trivy error, unparseable JSON) fails **loudly and exits 2** — it never
  masquerades as a clean (green) scan. (Distinct exit codes: `2` = scan didn't
  run, `1` = gated CVEs, `0` = clean.)

## Honesty

This setup **surfaces** CVEs; it does not fix them. A node base image + transitive
deps carry known vulns, so a red scan is the **expected** outcome — and a demo
asset (it proves the scan catches things). The gate is not loosened, the
Dockerfile/deps are not bumped, and no CVEs are blanket-ignored to force green;
fixing (bump base image / dependency) vs. documenting is a separate decision.
