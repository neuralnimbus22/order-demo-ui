#!/bin/sh
# No node reports memory, disk or PID pressure.
set -e

CONDITIONS=$(kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{":"}{range .status.conditions[?(@.status=="True")]}{" "}{.type}{end}{"\n"}{end}')
if [ -z "$CONDITIONS" ]; then
  echo "FAIL - no nodes found"
  exit 1
fi
echo "$CONDITIONS"

PRESSURE=$(echo "$CONDITIONS" | grep -E 'MemoryPressure|DiskPressure|PIDPressure' || true)
if [ -n "$PRESSURE" ]; then
  echo "FAIL - node under pressure:"
  echo "$PRESSURE"
  exit 1
fi
echo "OK - no node under memory, disk or PID pressure"
