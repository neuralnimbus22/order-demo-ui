# SAST (Semgrep)

Static analysis of the order-demo-ui **app source** for vulnerable patterns —
a distinct **security** test type. It reads the code; it does **not** run the
app and does **not** use `E2E_BASE_URL` (source-time security, independent of
the test-target convention).

This is one half of the security story:

| tool | when | what it scans |
|---|---|---|
| **Semgrep** (this) | source-time | the **source code** for vulnerable patterns, before build/run |
| **Trivy** (next chunk) | artifact-time | the built **image** for known CVEs in dependencies/OS packages |

### Why Semgrep (not CodeQL)

Semgrep is a self-contained CLI/container that drops into **any** CI (Jenkins,
GitLab, GitHub) and into TestKube — preserving the CI-agnostic story. CodeQL is
GitHub-Actions-native and would undercut that portability.

## Run

```bash
npm run test:sast      # or: bash semgrep/run.sh
```

Prereq: **Docker**. The Semgrep image is **pinned** (`semgrep/semgrep:1.97.0`)
and pulled — not vendored. Rule *content* is fetched from the Semgrep registry
at scan time (needs network); the engine version is pinned. The Python/container
toolchain is fully isolated under `semgrep/` — no effect on `npm run build`/`lint`.

## What it scans

- **Scope (explicit target paths):** `app/` (incl. the BFF routes under
  `app/api/**`), `lib/`, `components/` — the app you actually ship.
- **Excluded** (never visited): the test suites (`e2e/`, `cypress/`, `selenium/`,
  `jmeter/`, `gatling/`), `node_modules/`, `.next/`, `out/`, `public/`, and
  `k8s/` (deployment YAML — an infra-scan concern, not app SAST).

## Rulesets

Semgrep registry curated packs for this stack, declared in `run.sh`:

```
p/typescript  p/javascript  p/react  p/nextjs  p/security-audit  p/secrets
```

## Severity gate

`GATED_SEVERITY=ERROR` (a constant at the top of `run.sh`): the run exits
non-zero **only** on `ERROR`-severity findings. `WARNING`/`INFO` are printed in
the per-rule summary but do **not** fail the gate — same posture as the axe
serious+critical gate.

> **Note:** many security rules (`p/security-audit`) are `WARNING` severity, so
> they are **reported, not gated**. To make security findings fail the gate, add
> `WARNING` to `GATED_SEVERITY`.

## Output & trust

- JSON results → `semgrep/results/semgrep.json` (gitignored); stderr →
  `semgrep/results/semgrep.stderr.log`. The summary prints each finding as
  `[SEVERITY] rule-id  path:line`.
- A scan that **could not complete** (a config that won't resolve, no registry
  network, unparseable output, or a fatal Semgrep error) is reported **loudly
  and exits 2** — it never masquerades as green. The runner surfaces how many
  rules loaded/ran so a silently-reduced rule set is visible.

## Honesty

This setup **surfaces** findings; it does not fix them. A real `ERROR` finding
lands `test:sast` red — that's the signal. The gate is not loosened and no
blanket `nosemgrep` suppressions are added to force green; fixing vs.
documenting a finding is a separate decision.
