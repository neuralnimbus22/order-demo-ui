# Testkube → GitHub commit status webhooks

These two `Webhook` CRDs close the loop for `.github/workflows/testkube-release-gate.yml`.

The Action fires the five release-gate workflows and exits without waiting. It leaves a
**pending** commit status per workflow on the head SHA. These webhooks resolve each of
those statuses when the corresponding execution finishes on the cluster.

## Why two webhooks and not one

A Testkube webhook fires per execution, and the payload template has no conditional access
to the event type in a form that is pleasant to write. Splitting success and failure into
two definitions with a hardcoded `state` avoids template branching entirely.

## Why five statuses and not one aggregate

Each of the five executions finishes independently, and a webhook delivery carries only
that one execution. Producing a single aggregate status would require the webhook to know
whether the other four had finished — which means state that neither the webhook nor the
payload template has. Five contexts need no coordination: one delivery maps to exactly one
`context`. It also names the failing component directly in the PR checks list.

If you want a single required check for branch protection, add all five contexts as
required rather than trying to aggregate them webhook-side.

## What has to exist before these work

1. **A GitHub token with `repo:status` scope.** Fine-grained token scoped to this repo with
   *Commit statuses: read and write* is enough. It does not need code read access.
2. **That token stored as a Testkube credential named `github-status-token`.** The webhook
   references it as `{{credential("github-status-token")}}` and it is resolved at delivery
   time through the agent. The token value never appears in this repo or in the webhook
   spec.

   The alternative is a Kubernetes Secret plus `--config token="secret=ns;name;key"`,
   referenced as `{{ .Config.token }}`. Use that if you would rather the secret live in the
   cluster than in the Testkube control plane.

3. **The webhooks applied.** Either `kubectl apply -f testkube/webhooks/` against the
   cluster running the agent, or created through the control plane UI.

## The tag contract

The webhooks depend on tags the Action sets on every execution:

| tag | example | used for |
|---|---|---|
| `sha` | `37bedcf…` (40 chars) | the commit status URL |
| `commit` | `37bedcf` | human-readable, not used by the webhook |
| `release` | `2026.08.23-4` | status description |
| `trigger` | `pr-37` / `main` | filtering executions in Testkube |
| `env` | `staging` | filtering |

`sha` is separate from `commit` on purpose: the GitHub statuses API wants the full SHA, and
`commit` was already established as the short form.

Note that every execution *also* carries a `component` tag inherited from
`spec.execution.tags` in each workflow definition. Nothing here sets it and nothing
overrides it.
