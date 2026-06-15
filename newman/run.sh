#!/usr/bin/env bash
#
# BFF API CONTRACT tests — Newman (Postman CLI) against the Next.js BFF /api/*.
#
# This is the BFF LAYER (the /api/* routes that front + orchestrate the
# order-demo-enterprise services), NOT the backend repo's service-level
# tests/<service>/. Same tool family (Newman/Postman), different layer.
#
# Asserts each route's status AND response SCHEMA (the shape the browser depends
# on) — that's what makes it a contract test, not "did it 200". Targets the same
# E2E_BASE_URL convention (default http://localhost:3000); the app is assumed
# ALREADY RUNNING, with the backend services reachable behind the BFF (login →
# user-session, products → catalog, orders → inventory).
#
# Runs a PINNED Newman container (postman/newman:6.1.3-alpine) — no local node
# tooling, version fixed in the tag, CI/TestKube-portable. Newman exits non-zero
# on any failed assertion (native gate) AND on a run error (app unreachable /
# bad collection) — so a broken run can't masquerade as green.
#
# Checkout posture: only the guard/validation contracts are tested (logged-out
# → 401, empty cart → 400). NO successful order is placed by default — that
# would pollute inventory with real orders, same posture as the load tests.
#
# Usage:  npm run test:bff-contract       (or: bash newman/run.sh)
#         E2E_BASE_URL=https://shop.example.com npm run test:bff-contract
# Prereq: Docker. Image pulled (pinned), not vendored.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$DIR/results"
COLLECTION="order-demo-bff.postman_collection.json"
IMAGE="postman/newman:6.1.3-alpine"

if ! command -v docker >/dev/null 2>&1; then
  echo "[run.sh] Docker not found on PATH — required to run the pinned Newman image." >&2
  exit 2
fi
if [ ! -f "$DIR/$COLLECTION" ]; then
  echo "[run.sh] collection not found: $DIR/$COLLECTION" >&2
  exit 2
fi

# --- resolve target from E2E_BASE_URL --------------------------------------
# Newman runs in a container, so when the target is the HOST's localhost we
# rewrite to host.docker.internal (+ host-gateway) so the container can reach
# the host app. A real hostname (deployed / in-cluster / TestKube) passes
# through UNTOUCHED — the rewrite is strictly conditional on localhost/127.0.0.1.
E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3000}"
scheme="${E2E_BASE_URL%%://*}"
rest="${E2E_BASE_URL#*://}"
hostport="${rest%%/*}"
host="${hostport%%:*}"
port=""
[[ "$hostport" == *:* ]] && port="${hostport##*:}"

ADD_HOST=()
if [ "$host" = "localhost" ] || [ "$host" = "127.0.0.1" ]; then
  hostport="host.docker.internal${port:+:$port}"
  ADD_HOST=(--add-host=host.docker.internal:host-gateway)
fi
TARGET="${scheme}://${hostport}"

mkdir -p "$RESULTS_DIR"
rm -f "$RESULTS_DIR/report.json"

echo "=== BFF API contract (Newman ${IMAGE#*:}) ==="
echo "target:  ${TARGET}  (from E2E_BASE_URL=${E2E_BASE_URL})"
echo "scope:   BFF /api/* contract — status + response schema (NOT the backend's service-level tests)"
echo

# The image WORKDIR is /etc/newman; mount the suite there so the collection is
# read and results are written on the host (gitignored). Newman's exit code is
# the gate; propagate it.
set +e
docker run --rm \
  ${ADD_HOST[@]+"${ADD_HOST[@]}"} \
  -v "$DIR":/etc/newman \
  "$IMAGE" \
  run "$COLLECTION" \
  --env-var "baseUrl=${TARGET}" \
  --reporters cli,json \
  --reporter-json-export "results/report.json"
NEWMAN_RC=$?
set -e

echo
if [ "$NEWMAN_RC" -eq 0 ]; then
  echo "[PASS] all BFF contract assertions passed"
else
  echo "[FAIL] Newman exited $NEWMAN_RC — contract assertion failure or run error (see above)"
fi
exit "$NEWMAN_RC"
