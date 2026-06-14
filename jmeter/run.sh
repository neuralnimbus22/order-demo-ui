#!/usr/bin/env bash
#
# Run the order-demo-ui BFF load test headless and GATE on the results.
#
# Targets the SAME E2E_BASE_URL convention the functional suites use (default
# http://localhost:3000), parsed into the scheme/host/port JMeter expects. The
# app is assumed ALREADY RUNNING — this never starts it.
#
# Why this wrapper does the pass/fail: JMeter's CLI (`-n`) exits 0 even when
# assertions fail — it doesn't fail the process on a breached assertion. So we
# run JMeter, then inspect the .jtl `success` column and exit non-zero if ANY
# sample failed (assertion failure or error) or if zero samples were taken.
# That is what makes this a gate-able TEST rather than a benchmark.
#
# Usage:
#   E2E_BASE_URL=http://localhost:3000 jmeter/run.sh            # default GET load
#   THREADS=50 DURATION=60 jmeter/run.sh                        # override profile
#   jmeter/run.sh --include-auth                                # + POST /login load
#   jmeter/run.sh --report                                     # also write HTML report
#
# Prereqs: Java + Apache JMeter on PATH (`brew install jmeter`, or download from
# https://jmeter.apache.org/download_jmeter.cgi). The JMeter binary is NOT
# vendored into this repo.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JMX="$DIR/order-demo-load.jmx"
RESULTS_DIR="$DIR/results"
JTL="$RESULTS_DIR/results.jtl"
LOG="$RESULTS_DIR/jmeter.log"

# --- options ---------------------------------------------------------------
INCLUDE_AUTH=0
WRITE_REPORT=0
for arg in "$@"; do
  case "$arg" in
    --include-auth) INCLUDE_AUTH=1 ;;
    --report) WRITE_REPORT=1 ;;
    *) echo "[run.sh] unknown option: $arg" >&2; exit 2 ;;
  esac
done

# --- prerequisite check ----------------------------------------------------
if ! command -v jmeter >/dev/null 2>&1; then
  echo "[run.sh] JMeter not found on PATH." >&2
  echo "         Install it (needs Java): brew install jmeter" >&2
  echo "         or download: https://jmeter.apache.org/download_jmeter.cgi" >&2
  exit 2
fi

# --- parse E2E_BASE_URL into scheme/host/port ------------------------------
E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3000}"
scheme="${E2E_BASE_URL%%://*}"
rest="${E2E_BASE_URL#*://}"
hostport="${rest%%/*}"
host="${hostport%%:*}"
if [[ "$hostport" == *:* ]]; then
  port="${hostport##*:}"
elif [ "$scheme" = "https" ]; then
  port=443
else
  port=80
fi

# --- load profile (env-overridable; demo defaults) -------------------------
THREADS="${THREADS:-20}"
RAMPUP="${RAMPUP:-10}"
DURATION="${DURATION:-30}"
MAXMS="${MAXMS:-1500}"
# Auth group stays at 0 threads (off) unless explicitly opted in.
AUTHTHREADS=0
if [ "$INCLUDE_AUTH" -eq 1 ]; then
  AUTHTHREADS="${AUTHTHREADS_N:-$THREADS}"
fi

mkdir -p "$RESULTS_DIR"
rm -f "$JTL" "$LOG"

echo "=== order-demo-ui BFF load test ==="
echo "target:   ${scheme}://${host}:${port}  (from E2E_BASE_URL=${E2E_BASE_URL})"
echo "profile:  threads=${THREADS} rampup=${RAMPUP}s duration=${DURATION}s maxms=${MAXMS}"
echo "auth load: $([ "$INCLUDE_AUTH" -eq 1 ] && echo "ON (auththreads=${AUTHTHREADS})" || echo "off")"
echo

REPORT_ARGS=()
if [ "$WRITE_REPORT" -eq 1 ]; then
  rm -rf "$RESULTS_DIR/report"
  REPORT_ARGS=(-e -o "$RESULTS_DIR/report")
fi

# Force CSV results with a header row so the gate below can find the `success`
# column by name regardless of the user's global JMeter config.
jmeter -n -t "$JMX" -l "$JTL" -j "$LOG" \
  -Jjmeter.save.saveservice.output_format=csv \
  -Jjmeter.save.saveservice.print_field_names=true \
  -Jscheme="$scheme" -Jhost="$host" -Jport="$port" \
  -Jthreads="$THREADS" -Jrampup="$RAMPUP" -Jduration="$DURATION" \
  -Jmaxms="$MAXMS" -Jauththreads="$AUTHTHREADS" \
  ${REPORT_ARGS[@]+"${REPORT_ARGS[@]}"}

# --- gate on the .jtl ------------------------------------------------------
if [ ! -s "$JTL" ]; then
  echo "[run.sh] no results written — treating as failure" >&2
  exit 1
fi

# Summarize from the JTL columns (success + elapsed), located by header name so
# column order doesn't matter. Kept portable (no gawk-only asort): totals/avg in
# one awk pass, p95 via `sort -n` on the elapsed column.
read -r TOTAL FAILS SUM < <(awk -F',' '
  NR==1 { for (i = 1; i <= NF; i++) { if ($i == "success") sc = i; if ($i == "elapsed") ec = i } next }
  { total++; if ($sc == "false") fails++; sum += $ec + 0 }
  END { printf "%d %d %d\n", total + 0, fails + 0, sum + 0 }
' "$JTL")

AVG=0
[ "$TOTAL" -gt 0 ] && AVG=$(awk -v s="$SUM" -v t="$TOTAL" 'BEGIN { printf "%.1f", s / t }')

P95=0
if [ "$TOTAL" -gt 0 ]; then
  EC=$(awk -F',' 'NR==1 { for (i = 1; i <= NF; i++) if ($i == "elapsed") { print i; exit } }' "$JTL")
  P95=$(awk -F',' -v c="$EC" 'NR>1 { print $c + 0 }' "$JTL" | sort -n | \
    awk -v t="$TOTAL" '{ a[NR] = $1 } END { idx = int(0.95 * t); if (idx < 1) idx = 1; if (idx > t) idx = t; print a[idx] }')
fi

ERR_PCT="0.0"
if [ "$TOTAL" -gt 0 ]; then
  ERR_PCT=$(awk -v f="$FAILS" -v t="$TOTAL" 'BEGIN { printf "%.2f", (f / t) * 100 }')
fi

echo
echo "=== summary ==="
echo "requests:   $TOTAL"
echo "failures:   $FAILS  (error ${ERR_PCT}%)"
echo "avg:        ${AVG} ms"
echo "p95:        ${P95} ms"
echo "results:    $JTL"
[ "$WRITE_REPORT" -eq 1 ] && echo "report:     $RESULTS_DIR/report/index.html"
echo

if [ "$TOTAL" -eq 0 ]; then
  echo "[FAIL] no samples taken"
  exit 1
fi
if [ "$FAILS" -gt 0 ]; then
  echo "[FAIL] $FAILS/$TOTAL samples failed an assertion or errored"
  exit 1
fi
echo "[PASS] all $TOTAL samples passed (200 + under ${MAXMS}ms)"
exit 0
