#!/bin/sh
# The certificate the Kubernetes API server presents is valid for at least
# 30 more days.
set -e
DAYS=${DAYS:-30}

echo | openssl s_client -connect kubernetes.default.svc:443 -servername kubernetes.default.svc 2> /dev/null \
  | openssl x509 -out /tmp/apiserver.pem
openssl x509 -in /tmp/apiserver.pem -noout -subject -enddate
if openssl x509 -in /tmp/apiserver.pem -noout -checkend $((DAYS * 86400)) > /dev/null; then
  echo "OK - API server certificate has more than $DAYS days left"
else
  echo "FAIL - API server certificate expires within $DAYS days"
  exit 1
fi
