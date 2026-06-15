#!/usr/bin/env bash
#
# Container IMAGE scan — Trivy CVE scan of the order-demo-ui image.
#
# The artifact half of the security pair: Semgrep scans the SOURCE for
# vulnerable patterns (source-time); Trivy scans the built IMAGE for known CVEs
# in OS packages + node deps that actually ship (artifact-time). It does NOT run
# the app and does NOT use E2E_BASE_URL.
#
# Runs a PINNED Trivy CONTAINER (no install on the host; engine fixed in the tag;
# identical in any CI/TestKube). Default: build the image locally from the repo
# Dockerfile and scan it via a saved tar (--input) — self-contained, offline-
# capable, no registry auth. Set TRIVY_IMAGE=<ref> to scan a published image
# instead (e.g. the public GHCR image).
#
# GATING (mirrors axe + Semgrep): exit non-zero only on HIGH/CRITICAL — and only
# FIXABLE ones (a HIGH with no available fix is noise you can't action; failing
# on it just trains people to ignore the gate). Everything is still REPORTED,
# incl. unfixed HIGH/CRITICAL (marked "no fix") and MEDIUM/LOW counts — hiding
# them would be dishonest. Widen GATED_SEVERITIES / flip GATE_FIXABLE_ONLY below.
#
# A scan that can't complete (image not built, tar missing, DB won't update,
# Trivy error, unparseable JSON) fails LOUDLY and exits 2 — never silently green.
#
# Usage:  npm run test:trivy            # build locally + scan
#         TRIVY_IMAGE=ghcr.io/neuralnimbus22/order-demo-ui:latest npm run test:trivy
# Prereq: Docker. Image pinned + pulled, not vendored. Trivy's vuln DB is fetched
# at scan time (needs network); the engine is pinned.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
RESULTS_DIR="$DIR/results"
JSON="$RESULTS_DIR/trivy.json"
TAR="$RESULTS_DIR/image.tar"

TRIVY_IMAGE_REF="aquasec/trivy:0.58.1"
LOCAL_TAG="order-demo-ui:scan"
GATED_SEVERITIES="HIGH,CRITICAL"   # gate set
GATE_FIXABLE_ONLY=1                # 1 = only fixable gated CVEs fail the build

if ! command -v docker >/dev/null 2>&1; then
  echo "[run.sh] Docker not found on PATH — required to build/scan the image." >&2
  exit 2
fi

mkdir -p "$RESULTS_DIR"
rm -f "$JSON" "$TAR"

echo "=== Container image scan (Trivy ${TRIVY_IMAGE_REF#*:}) ==="

# Trivy cache dir (so the vuln DB isn't re-downloaded every run on repeat use).
CACHE_DIR="$DIR/.trivy-cache"
mkdir -p "$CACHE_DIR"

# --- choose target: published ref (TRIVY_IMAGE) or a locally-built tar --------
if [ -n "${TRIVY_IMAGE:-}" ]; then
  echo "scanning published image: ${TRIVY_IMAGE}"
  SCAN_ARGS=(image "${TRIVY_IMAGE}")
else
  echo "building image locally: ${LOCAL_TAG}"
  if ! docker build -t "$LOCAL_TAG" "$ROOT" > "$RESULTS_DIR/build.log" 2>&1; then
    echo "[FAIL] image build failed — see $RESULTS_DIR/build.log" >&2
    tail -15 "$RESULTS_DIR/build.log" >&2
    exit 2
  fi
  echo "saving image to tar for a self-contained scan (no docker socket)..."
  docker save "$LOCAL_TAG" -o "$TAR"
  SCAN_ARGS=(image --input /out/image.tar)
fi

echo "scanners: vuln,secret   gate: ${GATED_SEVERITIES}$([ "$GATE_FIXABLE_ONLY" -eq 1 ] && echo ' (fixable only)')"
echo

# Full visibility: capture ALL severities + fixed/unfixed in JSON; gate in the
# wrapper below. --scanners vuln,secret. The results dir is mounted at /out (the
# tar, when built locally, lives there too); the DB cache persists across runs.
set +e
docker run --rm \
  -v "$CACHE_DIR":/root/.cache/ \
  -v "$RESULTS_DIR":/out \
  "$TRIVY_IMAGE_REF" \
  "${SCAN_ARGS[@]}" \
  --scanners vuln,secret \
  --format json --output /out/trivy.json \
  --quiet
TRIVY_RC=$?
set -e

rm -f "$TAR"   # the saved image tar is large; drop it once scanned

# A non-completing scan must not look green (the Semgrep trust lesson).
if [ "$TRIVY_RC" -ne 0 ] || [ ! -s "$JSON" ]; then
  echo "[FAIL] Trivy did not complete (exit $TRIVY_RC) or wrote no results." >&2
  exit 2
fi

python3 - "$JSON" "$GATED_SEVERITIES" "$GATE_FIXABLE_ONLY" <<'PY'
import json, sys
path, gated_csv, fixable_only = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
gated = set(s.strip().upper() for s in gated_csv.split(","))
with open(path) as f:
    data = json.load(f)

results = data.get("Results", []) or []
vulns, secrets = [], []
for r in results:
    target = r.get("Target", "?")
    for v in (r.get("Vulnerabilities") or []):
        vulns.append((target, v))
    for s in (r.get("Secrets") or []):
        secrets.append((target, s))

order = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]
counts = {k: 0 for k in order}
for _, v in vulns:
    counts[(v.get("Severity") or "UNKNOWN").upper()] = counts.get((v.get("Severity") or "UNKNOWN").upper(), 0) + 1

print("=== vulnerabilities by severity ===")
for k in order:
    print(f"  {k}: {counts.get(k,0)}")
print(f"  (total: {len(vulns)})")

# List the gated-severity findings (all of them, fixable or not).
listed = [(t, v) for (t, v) in vulns if (v.get("Severity") or "").upper() in gated]
gating = []
if listed:
    print(f"\n=== {'/'.join(sorted(gated))} findings ===")
    for t, v in sorted(listed, key=lambda x: x[1].get("Severity", "")):
        fixed = v.get("FixedVersion") or ""
        fixable = bool(fixed)
        tag = f"fix: {fixed}" if fixable else "NO FIX"
        print(f"  [{v.get('Severity')}] {v.get('VulnerabilityID')}  "
              f"{v.get('PkgName')} {v.get('InstalledVersion')} -> {tag}")
        if fixable or not fixable_only:
            gating.append(v)

if secrets:
    print(f"\n=== secrets detected: {len(secrets)} ===")
    for t, s in secrets:
        print(f"  [{s.get('Severity')}] {s.get('RuleID')} in {t}:{s.get('StartLine')}")

print()
n = len(gating)
if n > 0:
    label = "fixable " if fixable_only else ""
    print(f"[FAIL] {n} {label}{'/'.join(sorted(gated))} vulnerabilit(y/ies) — gate breached")
    sys.exit(1)
note = " (fixable only; unfixed are reported above, not gated)" if fixable_only else ""
print(f"[PASS] no gated{note} — nothing in {'/'.join(sorted(gated))} fails the gate")
sys.exit(0)
PY
