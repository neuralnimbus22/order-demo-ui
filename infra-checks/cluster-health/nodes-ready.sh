#!/bin/sh
# Every node reports Ready.
# A node that is NotReady, Unknown or cordoned (Ready,SchedulingDisabled) fails
# the check. That is what an upgrade that stopped halfway looks like.
set -e

NODES=$(kubectl get nodes -o wide)
echo "$NODES"

NOT_READY=$(echo "$NODES" | awk 'NR > 1 && $2 != "Ready"')
if [ -n "$NOT_READY" ]; then
  echo "FAIL - nodes not Ready or not schedulable:"
  echo "$NOT_READY"
  exit 1
fi
echo "OK - every node is Ready"
