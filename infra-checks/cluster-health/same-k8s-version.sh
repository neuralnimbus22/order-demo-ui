#!/bin/sh
# Every node runs the same Kubernetes version.
# Two versions at the same time means an upgrade started and did not finish.
set -e

VERSIONS=$(kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.nodeInfo.kubeletVersion}{"\n"}{end}')
echo "$VERSIONS"

COUNT=$(echo "$VERSIONS" | awk 'NF { print $2 }' | sort -u | wc -l)
if [ "$COUNT" -eq 0 ]; then
  echo "FAIL - no nodes found"
  exit 1
fi
if [ "$COUNT" -gt 1 ]; then
  echo "FAIL - nodes run different versions, an upgrade did not finish"
  exit 1
fi
echo "OK - every node runs $(echo "$VERSIONS" | awk 'NF { print $2; exit }')"
