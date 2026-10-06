#!/bin/sh
# Every order-demo service answers its health endpoint after a deploy.
# Each service gets a few retries, so a pod that is still starting does not
# fail the check.
set -e
NAMESPACE=${NAMESPACE:-order-demo}

for TARGET in order-demo-ui:3000/api/health auth:3001/health order:3002/health inventory:3003/health payment:3004/health product-catalog:3005/health user-session:3006/health; do
  NAME="${TARGET%%:*}"
  URL="http://${NAME}.${NAMESPACE}.svc.cluster.local:${TARGET#*:}"
  if curl -sf --retry 5 --retry-delay 3 --retry-all-errors -o /dev/null "$URL"; then
    echo "ready      $NAME"
  else
    echo "NOT READY  $NAME  $URL"
    exit 1
  fi
done
echo "OK - all order-demo services healthy"
