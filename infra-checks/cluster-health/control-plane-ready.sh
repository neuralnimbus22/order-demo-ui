#!/bin/sh
# The Kubernetes API server reports ready, including etcd and its controllers.
# kubectl exits non-zero when any of these internal checks fails.
set -e

kubectl get --raw='/readyz?verbose'
echo
echo "OK - control plane reports ready"
