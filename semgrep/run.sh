#!/usr/bin/env bash
#
# SAST — Semgrep static analysis of the order-demo-ui APP SOURCE.
#
# Reads the source for vulnerable patterns; it does NOT run the app and does
# NOT need E2E_BASE_URL (source-time security, independent of the test-target
# convention). Pairs with Trivy (next) which scans the built image for CVEs.
#
# Runs a PINNED Semgrep CONTAINER (no Python on the host; the engine version is
# fixed in the image tag; identical in any CI/TestKube). Scans only the shipped
# app source (app/ lib/ components/) via explicit target paths, so the test
# suites, node_modules, .next, public, and k8s are never visited.
#
# GATING: exit non-zero only on ERROR-severity findings (GATED_SEVERITY below).
# WARNING/INFO are printed but do not fail — same posture as the axe gate.
# NOTE: many security rules (p/security-audit) are WARNING severity, so they are
# reported, not gated; widen GATED_SEVERITY to gate them.
#
# A scan that could not complete (a config that won't resolve, no registry
# network) is reported LOUDLY and exits 2 — it must never masquerade as green.
#
# Usage:  npm run test:sast    (or: bash semgrep/run.sh)
# Prereq: Docker. The image is pulled (pinned), not vendored. Rule CONTENT is
# fetched from the Semgrep registry at scan time (needs network); the engine is
# pinned.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
RESULTS_DIR="$DIR/results"
JSON="$RESULTS_DIR/semgrep.json"
STDERR_LOG="$RESULTS_DIR/semgrep.stderr.log"

IMAGE="semgrep/semgrep:1.97.0"
GATED_SEVERITY="ERROR"   # widen (e.g. add WARNING) to gate on more
CONFIGS=(p/typescript p/javascript p/react p/nextjs p/security-audit p/secrets)
TARGETS=(app lib components)

if ! command -v docker >/dev/null 2>&1; then
  echo "[run.sh] Docker not found on PATH — required to run the pinned Semgrep image." >&2
  exit 2
fi

mkdir -p "$RESULTS_DIR"
rm -f "$JSON" "$STDERR_LOG"

CONFIG_ARGS=()
for c in "${CONFIGS[@]}"; do CONFIG_ARGS+=(--config "$c"); done

echo "=== SAST (Semgrep ${IMAGE#*:}) ==="
echo "scope:   ${TARGETS[*]}  (app source only; test suites / node_modules / .next / public / k8s excluded)"
echo "rules:   ${CONFIGS[*]}"
echo "gate:    fail on ${GATED_SEVERITY} (WARNING/INFO reported, not gated)"
echo

# Repo mounted read-only; JSON captured on the host via stdout redirect so the
# container never writes into the source tree. Progress/errors go to stderr.
set +e
docker run --rm -v "$ROOT":/src:ro -w /src "$IMAGE" \
  semgrep scan "${CONFIG_ARGS[@]}" --json --metrics=off --disable-version-check \
  "${TARGETS[@]}" > "$JSON" 2> "$STDERR_LOG"
SEMGREP_RC=$?
set -e

# Surface how many rules ran / config-fetch problems (so a half-run scan that
# silently dropped a ruleset is VISIBLE, not mistaken for clean).
grep -iE "rules?|config|registry|download|not found|failed" "$STDERR_LOG" \
  | grep -ivE "metrics|version check" | tail -8 || true
echo

# A non-completing scan (bad config, no network, invalid JSON) must not look
# green. Semgrep exits >=2 on operational errors; also treat unparseable JSON or
# a populated `errors` array as a hard failure.
if [ "$SEMGREP_RC" -ge 2 ] || [ ! -s "$JSON" ]; then
  echo "[FAIL] Semgrep did not complete (exit $SEMGREP_RC). Last stderr:" >&2
  tail -15 "$STDERR_LOG" >&2
  exit 2
fi

python3 - "$JSON" "$GATED_SEVERITY" <<'PY'
import json, sys
path, gated = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)

errors = data.get("errors", [])
fatal = [e for e in errors if str(e.get("level", "")).lower() in ("error", "fatal")]
results = data.get("results", [])

by_sev = {"ERROR": [], "WARNING": [], "INFO": []}
for r in results:
    sev = (r.get("extra", {}) or {}).get("severity", "INFO")
    by_sev.setdefault(sev, []).append(r)

def line(r):
    sev = (r.get("extra", {}) or {}).get("severity", "INFO")
    return f"      [{sev}] {r.get('check_id','?')}  {r.get('path','?')}:{(r.get('start',{}) or {}).get('line','?')}"

print("=== findings ===")
for sev in ("ERROR", "WARNING", "INFO"):
    items = by_sev.get(sev, [])
    print(f"  {sev}: {len(items)}")
    for r in items:
        print(line(r))

if fatal:
    print("\n[FAIL] Semgrep reported fatal errors (config/parse) — scan not trustworthy:", file=sys.stderr)
    for e in fatal[:10]:
        print("      " + str(e.get("message", e))[:200], file=sys.stderr)
    sys.exit(2)

gated_count = len(by_sev.get(gated, []))
total = len(results)
print()
if gated_count > 0:
    print(f"[FAIL] {gated_count} {gated}-severity finding(s) — gate breached "
          f"(total findings: {total})")
    sys.exit(1)
print(f"[PASS] no {gated}-severity findings (total findings: {total}; "
      f"WARNING/INFO reported above, not gated)")
sys.exit(0)
PY
