#!/bin/sh
# Every service in the app namespace has at least one ready pod behind it.
set -e
NAMESPACE=${NAMESPACE:-order-demo}

SERVICES=$(kubectl get svc -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}')
if [ -z "$SERVICES" ]; then
  echo "FAIL - no services found in $NAMESPACE"
  exit 1
fi

FAILED=""
for SVC in $SERVICES; do
  ADDR=$(kubectl get endpointslices -n "$NAMESPACE" -l kubernetes.io/service-name="$SVC" -o jsonpath='{range .items[*].endpoints[?(@.conditions.ready==true)]}{.addresses[0]}{" "}{end}')
  if [ -z "$ADDR" ]; then
    echo "FAIL $SVC has no ready endpoints"
    FAILED=yes
  else
    echo "OK   $SVC -> $ADDR"
  fi
done
if [ -n "$FAILED" ]; then
  echo "One or more services have no ready pods behind them"
  exit 1
fi
echo "OK - every $NAMESPACE service has ready endpoints"
