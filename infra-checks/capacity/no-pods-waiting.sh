#!/bin/sh
# No pod is waiting for a node.
# A pod that stays Pending with no node usually means the cluster ran out of
# CPU or memory. A pod that is only being scheduled clears within seconds, so
# the check looks a second time before it fails.
set -e

waiting() {
  kubectl get pods -A --no-headers --field-selector=status.phase=Pending,spec.nodeName=
}

WAITING=$(waiting)
if [ -n "$WAITING" ]; then
  echo "Pods without a node, looking again in 10 seconds:"
  echo "$WAITING"
  sleep 10
  WAITING=$(waiting)
fi
if [ -n "$WAITING" ]; then
  echo "FAIL - pods still waiting for a node, the cluster may be out of room:"
  echo "$WAITING"
  exit 1
fi
echo "OK - every pod has a node"
