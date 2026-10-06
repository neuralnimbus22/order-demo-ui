#!/bin/sh
# The ingress controller (Traefik) answers HTTP inside the cluster.
# Any HTTP code counts as an answer. A 404 only means no route is set for the
# bare address, so the controller itself is up.
set -e
URL=${INGRESS_URL:-http://traefik.kube-system.svc.cluster.local/}

CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" || true)
echo "Ingress controller answered with HTTP $CODE"
if [ -z "$CODE" ] || [ "$CODE" = "000" ]; then
  echo "FAIL - ingress controller did not answer at $URL"
  exit 1
fi
if [ "$CODE" = "404" ]; then
  echo "404 only means no app is routed at this bare address, so the controller itself is up"
fi
echo "OK - ingress controller is serving requests"
