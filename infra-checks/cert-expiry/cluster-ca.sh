#!/bin/sh
# The cluster CA certificate is valid for at least 30 more days.
# It is read from the service account mount every pod gets.
set -e
DAYS=${DAYS:-30}
CA=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt

openssl x509 -in "$CA" -noout -subject -enddate
if openssl x509 -in "$CA" -noout -checkend $((DAYS * 86400)) > /dev/null; then
  echo "OK - cluster CA has more than $DAYS days left"
else
  echo "FAIL - cluster CA expires within $DAYS days"
  exit 1
fi
