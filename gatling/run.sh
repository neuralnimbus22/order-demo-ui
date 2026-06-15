#!/usr/bin/env bash
#
# Run the Gatling load test headless and let its exit code GATE pass/fail.
#
# Unlike JMeter (whose CLI exits 0 even on assertion failure, so jmeter/run.sh
# parses the .jtl), Gatling fails the build natively when an assertion breaches —
# so `mvn gatling:test` returns non-zero on its own and this wrapper just maps
# env -> -D and propagates that exit code.
#
# Targets the SAME E2E_BASE_URL convention as every other suite (default
# http://localhost:3000). The app is assumed ALREADY RUNNING — this never
# starts it.
#
# Usage:
#   E2E_BASE_URL=http://localhost:3000 gatling/run.sh        # default GET load
#   USERS=50 DURATION=60 gatling/run.sh                      # override profile
#   gatling/run.sh --include-auth                            # + POST /login load
#
# Profile env (mapped to -D system properties, JMeter-matched defaults):
#   USERS (20)  RAMP (10)  DURATION (30)  MAXMS (1500)
#
# Prereqs: a JDK (17+) and Maven on PATH (`brew install maven` brings both).
# Gatling itself is pulled by Maven (pinned in pom.xml) — NOT vendored here.
# The native HTML report lands in gatling/results/<sim>-<timestamp>/index.html.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INCLUDE_AUTH=0
for arg in "$@"; do
  case "$arg" in
    --include-auth) INCLUDE_AUTH=1 ;;
    *) echo "[run.sh] unknown option: $arg" >&2; exit 2 ;;
  esac
done

if ! command -v mvn >/dev/null 2>&1; then
  echo "[run.sh] Maven not found on PATH." >&2
  echo "         Install it (brings a JDK): brew install maven" >&2
  exit 2
fi

E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3000}"
USERS="${USERS:-20}"
RAMP="${RAMP:-10}"
DURATION="${DURATION:-30}"
MAXMS="${MAXMS:-1500}"

echo "=== order-demo-ui BFF load test (Gatling) ==="
echo "target:   ${E2E_BASE_URL}"
echo "profile:  users=${USERS} ramp=${RAMP}s duration=${DURATION}s maxms=${MAXMS}"
echo "auth load: $([ "$INCLUDE_AUTH" -eq 1 ] && echo "ON" || echo "off")"
echo "report:   ${DIR}/results/<simulation>-<timestamp>/index.html"
echo

MVN_ARGS=(
  -q -f "$DIR/pom.xml" test-compile gatling:test
  "-Dgatling.simulationClass=orderdemo.OrderDemoUiLoadSimulation"
  "-DE2E_BASE_URL=${E2E_BASE_URL}"
  "-Dusers=${USERS}" "-Dramp=${RAMP}" "-Dduration=${DURATION}" "-Dmaxms=${MAXMS}"
)
[ "$INCLUDE_AUTH" -eq 1 ] && MVN_ARGS+=("-Dauth=true")

# `mvn gatling:test` exits non-zero if a Gatling assertion fails — that exit
# code IS the gate; propagate it.
exec mvn "${MVN_ARGS[@]}"
