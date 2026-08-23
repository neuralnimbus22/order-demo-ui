# Testkube → GitHub commit status webhooks

These two `Webhook` CRDs close the loop for `.github/workflows/testkube-release-gate.yml`.

The Action fires the five release-gate workflows and exits without waiting. It leaves a
**pending** commit status per workflow on the head SHA. These webhooks resolve each of
those statuses when the corresponding execution finishes on the cluster.

## Why two webhooks and not one

A Testkube webhook fires per execution, and the payload template has no conditional access
to the event type in a form that is pleasant to write. Splitting success and failure into
two definitions with a hardcoded `state` avoids template branching entirely.

## Why the selector is `gate=release` and not `purpose=release-decision-demo`

The obvious selector is wrong, and it fails quietly.

`purpose=release-decision-demo` is carried by **nine** workflows in this environment:
the five gate checks plus `order-api-check`, `payments-service-check`,
`inventory-service-check` and `auth-service-check`. Worse, the five gate checks each run
on an hourly cron (`0/5/10/15/20 * * * *`).

Cron-triggered runs take their tags from `spec.execution.tags`, which sets `component`,
`env` and `trigger` but **never `sha`** — `sha` only exists because the pipeline passes
`--tag sha=...`. The webhook interpolates `sha` into the GitHub statuses URL, so every
scheduled run would POST to a URL with an empty SHA, be rejected, and land in the delivery
log. Five failures an hour, forever, burying the real deliveries.

**A selector cannot fix this on its own.** `selector` matches *workflow labels*, and a
cron run and a CI run of the same workflow have identical labels. There is no label that
distinguishes them because the distinction lives in execution tags, which the selector
cannot read.

**The Webhook CRD has no tag-level condition either.** Its full spec surface is `config`,
`disabled`, `events`, `headers`, `onStateChange`, `parameters`, `payloadObjectField`,
`payloadTemplate`, `payloadTemplateReference`, `selector`, `target`, `uri`,
`webhookTemplateRef`. Nothing filters on execution tags. `onStateChange` fires only when
the result *differs* from the previous execution, which is not the same thing and does not
help.

So the trigger distinction has to become a **workflow-identity** distinction, because
workflow identity is the only thing the selector can see. That is what
`testkube/workflows/` is: five CI-only copies labelled `gate=release`, with no
`spec.events`. The originals keep their cron and their old label and are untouched.

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

3. **The five CI-only workflows applied**: `kubectl apply -f testkube/workflows/`.
   Without these the pipeline has nothing to run — it invokes `*-gate`, not `*-check`.

4. **The webhooks applied**: `kubectl apply -f testkube/webhooks/`.

Both apply into `lakshmi-testkube`, which the agent watches
(`TESTKUBE_WATCHER_NAMESPACES=lakshmi-testkube`) with
`GITOPS_KUBERNETES_TO_CLOUD_ENABLED=true`, so they sync up to the control plane. Note that
`GITOPS_CLOUD_TO_KUBERNETES_ENABLED=false` — anything created in the UI never syncs back
down, which is why the pre-existing `trigger-jenkins-bdd` webhook has no CR anywhere.

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
