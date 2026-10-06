#!/bin/sh
# In-cluster DNS resolves the Kubernetes API and the app's service names.
set -e

FAILED=""
for NAME in kubernetes.default.svc.cluster.local order.order-demo.svc.cluster.local order-demo-ui.order-demo.svc.cluster.local; do
  OUT=$(nslookup "$NAME." 2>&1 || true)
  IP=$(echo "$OUT" | awk '/^Name:/ { getline; print $2; exit }')
  if [ -n "$IP" ]; then
    echo "OK   $NAME -> $IP"
  else
    echo "FAIL $NAME did not resolve"
    echo "$OUT"
    FAILED=yes
  fi
done
if [ -n "$FAILED" ]; then
  exit 1
fi
echo "OK - in-cluster DNS resolves"
