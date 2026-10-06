#!/bin/sh
# No running pod in any namespace is crashlooping or failing to start.
set -e

PODS=$(kubectl get pods -A --no-headers --field-selector=status.phase!=Succeeded,status.phase!=Failed)
BAD=$(echo "$PODS" | grep -E 'CrashLoopBackOff|ImagePullBackOff|ErrImagePull|CreateContainerConfigError|Error' || true)
if [ -n "$BAD" ]; then
  echo "FAIL - pods crashlooping or failing to start:"
  echo "$BAD"
  exit 1
fi
echo "OK - no running pod is crashlooping ($(echo "$PODS" | grep -c .) pods checked)"
