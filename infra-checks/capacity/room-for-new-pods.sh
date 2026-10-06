#!/bin/sh
# Every node has room for new pods.
# Fails when CPU or memory requests pass 90 percent of what a node can give,
# because new pods may then fail to schedule.
set -e
THRESHOLD=90

DESC=$(kubectl describe nodes)

# One line per node and resource, from each node's "Allocated resources" table.
TABLE=$(echo "$DESC" | awk '
  /^Name:/                { node = $2 }
  /^Allocated resources:/ { in_table = 1 }
  /^Events:/              { in_table = 0 }
  in_table && ($1 == "cpu" || $1 == "memory") {
    print node, $1, "requests", $2, $3, "limits", $4, $5
  }')
if [ -z "$TABLE" ]; then
  echo "FAIL - could not read the node allocation table"
  exit 1
fi
echo "$TABLE"

OVER=$(echo "$TABLE" | awk -v threshold="$THRESHOLD" '{
  pct = $5; gsub(/[()%]/, "", pct)
  if (pct + 0 > threshold) print $1, $2, pct "%"
}')
if [ -n "$OVER" ]; then
  echo "FAIL - requests above $THRESHOLD percent of what the node can give, new pods may not fit:"
  echo "$OVER"
  exit 1
fi
echo "OK - every node has room for new pods (requests under $THRESHOLD percent)"
