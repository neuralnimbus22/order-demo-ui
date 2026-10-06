# Infra checks

Checks that the Kubernetes cluster and the order-demo services are healthy.
Each folder is one Testkube workflow, and each script is one step in it.
The checks only read the cluster. They change nothing.

| folder | Testkube workflow | what it checks |
|---|---|---|
| `cluster-health/` | `infra-cluster-health` | every node Ready, one Kubernetes version on all nodes, control plane ready, no crashlooping pods |
| `capacity/` | `infra-capacity-check` | no pods waiting for a node, room for new pods, no memory, disk or PID pressure |
| `network/` | `infra-network-check` | DNS resolves, ingress answers, CoreDNS ready, every service has ready endpoints |
| `cert-expiry/` | `infra-cert-expiry` | cluster CA and API server certificate valid for 30 more days |
| `smoke/` | `infra-postdeploy-smoke` | every order-demo service answers its health check |

The workflow `infra-health-suite` runs all five at the same time.

## When they run

- After every Argo CD sync of the staging app: the PostSync hook
  `k8s/infra-checks-after-sync.yaml` runs `infra-health-suite`, and the sync
  fails if any check fails.
- Every night: `infra-capacity-check` runs on a schedule.
- Any time: from the Testkube dashboard, the CLI or the API.

## How a check reports

Each script prints what it read, then one line that starts with `OK` or `FAIL`.
A check that cannot read the cluster exits non-zero, so it never shows green by
mistake.

## Access

The checks run as the runner's execution service account. It needs read-only
access to nodes, pods, events, services, deployments and endpoint slices.
`rbac.yaml` grants exactly that, with get and list only and no Secrets.
