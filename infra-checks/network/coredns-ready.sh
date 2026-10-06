#!/bin/sh
# CoreDNS, the cluster's DNS server, has at least one ready replica.
set -e

kubectl get deploy coredns -n kube-system
READY=$(kubectl get deploy coredns -n kube-system -o jsonpath='{.status.readyReplicas}')
if [ -z "$READY" ] || [ "$READY" -lt 1 ]; then
  echo "FAIL - CoreDNS has no ready replicas"
  exit 1
fi
echo "OK - CoreDNS has $READY ready replica(s)"
