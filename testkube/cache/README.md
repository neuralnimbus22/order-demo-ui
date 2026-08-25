# Persistent dependency caches for TestWorkflows

Every TestWorkflow run gets a fresh pod with an empty `/data`, so the package
manager re-downloads its whole dependency tree every time. On
`playwright-chaos-demo` that is `npm ci` at 2m44s out of a 4m26s run — 62% of
the wall clock, recurring forever. Nothing about it is a cold-cache artefact:
the same execution's log shows
`Container image "mcr.microsoft.com/playwright:v1.60.0-jammy" already present on
machine`, so the image pull had already stopped costing anything.

This directory holds the PVCs. The workflows that mount them are in
`testkube/workflows/`.

**Nothing here is applied.** Apply the PVC first, then the workflow:

```
kubectl apply -f testkube/cache/npm-cache-pvc.yaml
kubectl apply -f testkube/workflows/playwright-chaos-demo.yaml
```

To roll back, re-apply the previous workflow definition and delete the PVC. The
cache holds no state any run depends on.

Everything below is marked **Verified** (read out of source, cited by file and
line) or **Inferred** (reasoning I have not executed).

---

## Contents

1. [Can a TestWorkflow mount a volume?](#1-can-a-testworkflow-mount-a-volume)
2. [`spec.pvcs` is per-execution — the citations](#2-specpvcs-is-per-execution--the-citations)
3. [Does the mount reach every step?](#3-does-the-mount-reach-every-step)
4. [**Concurrency**](#4-concurrency) ← the one that decides customer-readiness
5. [Cold start: what the first run costs](#5-cold-start-what-the-first-run-costs)
6. [Node: cache directory, not `node_modules`](#6-node-cache-directory-not-node_modules)
7. [Maven and `~/.m2`](#7-maven-and-m2)
8. [Still unproven](#8-still-unproven)

---

## 1. Can a TestWorkflow mount a volume?

**Verified.** Three fields, in `kubeshop/testkube@3dd49e8`.

**Pod level — `spec.pod.volumes`**, a full `[]corev1.Volume`:

```go
// api/testworkflows/v1/types.go:88
	// volumes to include in the pod
	// +kubebuilder:pruning:PreserveUnknownFields
	// +kubebuilder:validation:Schemaless
	Volumes []corev1.Volume `json:"volumes,omitempty" expr:"force"`
```

Schemaless in the CRD, so every upstream volume source is accepted. Copied onto
the pod verbatim at `testworkflowprocessor/processor.go:574` (`Volumes: volumes`).

**Container level — `spec.container.volumeMounts`**, typed:

```go
// api/testworkflows/v1/types.go:40
	// volume mounts to append to the container
	VolumeMounts []corev1.VolumeMount `json:"volumeMounts,omitempty" expr:"force"`
```

`ContainerConfig` backs `spec.container` *and* `steps[].container`, so the field
exists at both levels.

**Claim level — `spec.pvcs`** (`api/testworkflows/v1/testworkflow_types.go:43`).
Do not use it for this — see §2.

Nothing gates any of it. The only field in the processor behind
`AllowLowSecurityFields` is `hostPID` (`processor.go:559`); volume sources are
not restricted.

**There is no existing caching feature.** Searched `cache`, `volume`, `pvc`,
`persistentVolumeClaim` across `pkg/testworkflows/**` and `api/testworkflows/**`:
the only "cache" hits are the image-inspector metadata cache
(`ImageInspectorPersistenceCacheKey`/`CacheTTL` — image manifests), an LRU for
namespace lookups, and a `sync.Map` in the workflow fetcher. `workspace` returns
nothing at all.

## 2. `spec.pvcs` is per-execution — the citations

**Verified.** This is the finding to have ready if someone pushes back. Two
halves, naming and deletion.

**Naming** — every claim gets a name scoped to the execution root, generated
fresh per run:

```go
// pkg/testworkflows/testworkflowprocessor/intermediate.go:131-141
func (s *intermediate) AppendPvcs(cfg map[string]corev1.PersistentVolumeClaimSpec) Intermediate {
	for name, spec := range cfg {
		s.Ps[name] = corev1.PersistentVolumeClaim{
			ObjectMeta: metav1.ObjectMeta{
				Name: fmt.Sprintf("{{resource.root}}-%s", s.NextRef()),
			},
			Spec: spec,
		}
	}
	return s
}
```

`NextRef()` is `fmt.Sprintf("r%s%s", rand.String(5), ...)`
(`testworkflowprocessor/refcounter.go:23`) — random per process, so the name
cannot be stable across runs even in principle. The key you write in YAML is
only a handle for the `{{ pvcs.<key>.name }}` expression
(`testworkflowconfig/expressions.go:132`); it never reaches the cluster.

**Deletion** — the execution worker deletes them when the run ends:

```go
// pkg/testworkflows/executionworker/controller/cleanup.go:60-68
func cleanupPvcs(labelName string) func(ctx context.Context, clientSet kubernetes.Interface, namespace, id string) error {
	return func(ctx context.Context, clientSet kubernetes.Interface, namespace, id string) error {
		return clientSet.CoreV1().PersistentVolumeClaims(namespace).DeleteCollection(ctx, metav1.DeleteOptions{
			GracePeriodSeconds: common.Ptr(int64(0)),
			PropagationPolicy:  common.Ptr(metav1.DeletePropagationBackground),
		}, metav1.ListOptions{
			LabelSelector: fmt.Sprintf("%s=%s", labelName, id),
		})
	}
}
```

registered for both label scopes in `Cleanup()`, same file, lines 80-81:

```go
		cleanupPvcs(constants.RootResourceIdLabelName),
		cleanupPvcs(constants.ResourceIdLabelName),
```

(`testkube.io/root` and `testkube.io/resource`, `constants/constants.go:22-23`.)
Creation is `bundle.go:97`.

So `spec.pvcs` is per-execution scratch — genuinely useful for handing a large
volume from a parent to its parallel workers *within* one run, and useless for
surviving between runs. A cache must be a claim Testkube does not own,
referenced by name from `spec.pod.volumes`. That is what these manifests do.

## 3. Does the mount reach every step?

**Verified: yes, if you declare it at `spec.container`.** Container config is
inherited down the step tree by *summation*, not override:

```go
// pkg/testworkflows/testworkflowprocessor/stage/container.go:128-133
func (c *container) VolumeMounts() []corev1.VolumeMount {
	if c.parent == nil {
		return c.Cr.VolumeMounts
	}
	return sum(c.parent.VolumeMounts(), c.Cr.VolumeMounts)
}
```

The chain for this workflow, end to end:

1. `processor.go:158-162` seeds the root container defaults and its four
   built-in emptyDirs (`/.tktw`, `/tmp`, `/data`, `/testkube`).
2. `processor.go:203-213` builds `rootStep` with
   `StepDefaults{Container: workflow.Spec.Container}` — this is where
   `spec.container.volumeMounts` enters.
3. `processor.go:215` calls `process(layer, layer.ContainerDefaults(), rootStep, ...)`,
   and `process` applies it with `container.ApplyCR(step.Container)`
   (`processor.go:65`) **onto the defaults object itself**.
4. `ProcessNestedSteps` gives each step `container.CreateChild()`
   (`operations.go:83`), so both `Install dependencies` and `Run tests` hang off
   that mutated parent.
5. Each stage emits its resolved config as `c.ToContainerConfig()`
   (`action/process.go:50`), which clones the *summed* mounts
   (`stage/container.go:322`).
6. `action/containerize.go:56` turns that into the real `corev1.Container`.

There is a stronger reason it works here, though: **a serial TestWorkflow is one
pod.**

```go
// pkg/testworkflows/testworkflowprocessor/processor.go:598-599
	podSpec.Spec.InitContainers = containers[:len(containers)-1]
	podSpec.Spec.Containers = containers[len(containers)-1:]
```

Each step becomes an init container, with the last as the main container. The
two steps see the same directory because they are sequential containers in a
single pod sharing a single volume. There is no concurrency inside a serial run
at all.

**One caveat worth knowing** (Verified, `action/containerize.go:26-62`):
`CreateContainer` may merge several steps into one container, and when it does
it picks a single "highest priority container configuration" for the whole
group rather than unioning them. Mounts declared at `spec.container` are present
in *every* candidate config, so they survive whichever one wins. A mount
declared on a single step could be dropped if that step loses the merge. Declare
cache mounts at `spec.container`.

## 4. Concurrency

### 4a. Do parallel/sharded workers inherit `spec.pod.volumes`?

**Verified: yes for `pod.volumes`, no for `container.volumeMounts`.** The two
are handled fourteen lines apart, and the asymmetry is deliberate.

Volume mounts are explicitly stripped from the inherited container config:

```go
// pkg/tcl/testworkflowstcl/testworkflowprocessor/operations.go:118-121
	// Inherit container defaults
	inherited := common.Ptr(stage.Container().ToContainerConfig())
	inherited.VolumeMounts = nil
	step.Parallel.Container = testworkflowresolver.MergeContainerConfig(inherited, step.Parallel.Container)
```

Pod config, including volumes, is inherited:

```go
// pkg/tcl/testworkflowstcl/testworkflowprocessor/operations.go:130-134
	// Parallel workers should inherit the resolved root pod config, while allowing
	// the parallel block to override any pod-level fields explicitly.
	parallel := step.Parallel.DeepCopy()
	pod := layer.PodConfig()
	parallel.Pod = testworkflowresolver.MergePodConfig(pod.DeepCopy(), parallel.Pod)
```

and `MergePodConfig` appends rather than replaces —
`dst.Volumes = append(dst.Volumes, include.Volumes...)`
(`testworkflowresolver/merge.go:29`).

The rest of the chain, verified end to end: the merged spec is base64-JSON'd into
the toolkit's args (`operations.go:139-145`); the toolkit rebuilds a full
`TestWorkflowSpec` per worker via `NewTestWorkflowSpec()`, which carries `Pod`
and `Pvcs` through (`api/testworkflows/v1/step_types.go:357-378`); each worker is
handed to `ExecutionWorker.Execute` as its own `TestWorkflow`
(`cmd/tcl/testworkflow-toolkit/commands/parallel.go:508-516`); and that runs the
*same* processor (`kubernetesworker/worker.go:156`, `w.processor.Bundle`), which
lands `Volumes: volumes` on the pod at `processor.go:574`.

**So: each worker gets a fresh pod config derived from the root's, not a shared
one and not a blank one.** Your PVC arrives at every shard pod for free. The
mount does not. That asymmetry is the sharp edge — a sharded workflow that
inherits the volume but not the mount does not error, it silently misses the
cache and quietly costs you the two minutes back.

Two more things that follow from this, both Verified:

- Volume *names* do not collide, because `NextRef()` includes `rand.String(5)`
  (`refcounter.go:23`). The worker pod carries the root's four inherited
  emptyDir definitions unmounted alongside its own — harmless, but it is why a
  shard pod's spec has more volumes than you wrote.
- `spec.concurrency.max` does **not** bound shards. Enforcement counts rows in
  `test_workflow_executions` (control-plane scheduler,
  `testkube-cloud-api internal/executor/mongo/scheduler.go:171-190`, backed by
  `CountOngoingExecutions`), and parallel workers are spawned by the toolkit
  inside an already-running execution — they never pass through that queue.

### 4b. Two shards, two nodes, one RWO PVC: what actually happens

**Neither serialisation nor a clean failure. The second pod hangs in
`ContainerCreating` indefinitely, and nothing in Testkube times it out.**

Four steps, each verified against source rather than recalled.

**Step 1 — the scheduler does not stop it.** The `VolumeRestrictions` plugin is
the only scheduler plugin that filters on access mode, and it covers exactly two
cases. `ReadWriteOncePod` PVCs:

```go
// pkg/scheduler/framework/plugins/volumerestrictions/volume_restrictions.go:270
		if !v1helper.ContainsAccessMode(pvc.Spec.AccessModes, v1.ReadWriteOncePod) {
			continue
		}
```

and legacy *in-tree inline* volume types — `isVolumeConflict` handles
`GCEPersistentDisk`, `AWSElasticBlockStore`, `ISCSI` and `RBD` declared directly
on the pod. It has no `PersistentVolumeClaim` case and no CSI case.

A plain-RWO CSI PVC matches neither branch. **The scheduler will place shard 2
on a different node without complaint.** The only node constraint that survives
is the `VolumeBinding` plugin's PV node affinity, which for a zonal PD is the
zone — and this is a single-zone cluster (`us-central1-c`), so all five nodes
qualify.

**Step 2 — the attach-detach controller stops it, and RWO is *node*-scoped:**

```go
// pkg/volume/util/util.go, IsMultiAttachAllowed
		for _, accessMode := range volumeSpec.PersistentVolume.Spec.AccessModes {
			if accessMode == v1.ReadWriteMany || accessMode == v1.ReadOnlyMany {
				return true
			}
		}
		return false
```

RWO → `false`. The reconciler then checks *which nodes* hold the volume, not
which pods:

```go
// pkg/controller/volume/attachdetach/reconciler/reconciler.go:349-357
		if !util.IsMultiAttachAllowed(volumeToAttach.VolumeSpec) {
			nodes := rc.actualStateOfWorld.GetNodesForAttachedVolume(volumeToAttach.VolumeName)
			if len(nodes) > 0 {
				if !volumeToAttach.MultiAttachErrorReported {
					rc.reportMultiAttachError(logger, volumeToAttach, nodes)
					rc.desiredStateOfWorld.SetMultiAttachError(volumeToAttach.VolumeName, volumeToAttach.NodeName)
				}
				continue
			}
		}
```

**`continue`.** Not an error return, not a pod failure — it skips this
attachment and comes round again on the next reconcile, forever. Two shards on
the *same* node hit the branch above it instead (`attachState == AttachStateAttached`
→ "Volume attached--touching") and both mount happily.

**Step 3 — what you see.** `reportMultiAttachError` emits a
`FailedAttachVolume` warning event per scheduled pod, built from
`GenerateMsg("Waiting for detach", "Volume is already used by pod(s) <name>")`,
which renders through `generateVolumeMsg` as:

```
Warning  FailedAttachVolume  Waiting for detach for volume "npm-cache" Volume is already used by pod(s) <other-shard-pod>
```

Older releases phrase the same event `Multi-Attach error for volume ...`; both
are the same code path. The pod sits in `ContainerCreating` the entire time.

That this cluster's driver works this way is confirmable without applying
anything: `pd.csi.storage.gke.io` is registered with `ATTACHREQUIRED: true`, and
`kubectl get volumeattachment` shows one `csi-<hash> → PV → NODE` row per
attached volume, each pinned to exactly one node.

**Step 4 — nothing rescues it.** This is the part that makes it customer-unsafe:

- `spec.timeouts.queue` and `spec.timeouts.initialization` exist in the CRD and
  read exactly like the fix. **They are not implemented.** Both carry
  `// TODO: Finish implementation` (`api/testworkflows/v1/base_types.go:41-49`)
  and a repo-wide grep for consumers of `Timeouts.` outside the type definition
  and generated deepcopy returns nothing.
- `DefaultWorkerTimeout = 30 * time.Minute`
  (`cmd/tcl/testworkflow-toolkit/commands/parallel.go:73`) wraps only the
  `Execute` *deploy* call at line 505. Creating the Job succeeds instantly; the
  hang happens afterwards, in `monitorWorkerExecution`, outside that context.
- `spec.job.activeDeadlineSeconds` and `spec.pod.activeDeadlineSeconds` are
  plumbed (`processor.go:571`, `processor.go:611`) but default to nil, and this
  workflow sets neither.

*Inferred:* the parent's `parallel` step timeout (`StepControl.Timeout`) would
eventually abort the whole run, because that clock ticks in the parent pod which
is running fine. So the practical outcome is a run that stalls for however long
that timeout is and then fails with a storage-attachment error rather than a
test result — and stalls *nondeterministically*, since shards that happen to
co-schedule on one node succeed. Nondeterministic is worse than broken. It is
why `playwright-chaos-demo.yaml` carries a do-not-shard warning.

`ReadWriteOncePod` would at least fail fast and identically every time, since
that is the one case the scheduler does filter (`Unschedulable`,
`ErrReasonReadWriteOncePodConflict`).

### 4c. Two overlapping runs of the *non-sharded* workflow — the demo case

**Same mechanism, and it applies to you today.** Two executions of
`playwright-chaos-demo` are two independent Jobs, two independent pods, two
independent scheduling decisions across five nodes. Everything in 4b applies
unchanged: land on different nodes and run 2 hangs; land on the same node and
both mount.

**The fix is a Testkube field, and it is real.** `spec.concurrency` is enforced
in the control-plane scheduler:

```go
// testkube-cloud-api internal/executor/mongo/scheduler.go:178-190
		if exe.ResolvedWorkflow == nil || ... || exe.ResolvedWorkflow.Spec.Concurrency.Max == 0 {
			continue
		}
		c := exe.ResolvedWorkflow.Spec.Concurrency
		ongoingCount, ok := ongoing.ByWorkflow[exe.ResolvedWorkflow.Name]
		if c.Group != "" {
			ongoingCount, ok = ongoing.ByGroup[c.Group]
		}
		if !ok || ongoingCount < int(c.Max) {
			continue
		}
		skipExecutions = append(skipExecutions, exe.Id)
```

Blocked executions go into `skipExecutions` and are passed over by
`scheduleExecution` — they **stay queued**, they are not failed. So:

```yaml
spec:
  concurrency:
    max: 1
```

turns "run 2 hangs on a volume it cannot attach" into "run 2 waits in the queue",
which is the behaviour you want anyway when two runs share a cache. Add it before
demoing. Use `concurrency.group` if several workflows share one cache PVC —
the count is by group when set, by workflow name otherwise.

*Inferred:* `spec.concurrency` is the cheapest correct answer here precisely
because it makes concurrent access impossible rather than safe. Everything in
4d is about making it *safe*, which is strictly harder.

### 4d. If concurrent access is genuinely required — ranked

**1. Don't share it. Install once, ship the result.** Install in the parent
workflow (one pod, RWO cache, no contention) and use `parallel.transfer` to send
`node_modules` to the workers. The machinery exists —
`StepParallelTransfer{From, Files, To, Mount}`
(`api/testworkflows/v1/step_types.go:407-420`), served over the toolkit's
transfer server. *Trade-off:* you pay a tarball of `node_modules` per shard
instead of a download per shard. **Unproven** whether that is actually cheaper
at this repo's size — it is the first thing I would measure.

**2. One PVC per shard.** N claims, each RWO, named by shard index. *Trade-off:*
correct with zero storage-class changes and zero locking questions, at N volumes
and N independent warm-ups — shard 3's cache is useless to shard 4. Cheap and
boring. This is what I would recommend to a customer who wants sharding next
week.

**3. RWX, read-only for shards, with a separate warming workflow.** *Trade-off:*
one shared cache, correct concurrency, and the highest bill and the most moving
parts. See the Filestore costing below. **Unproven caveat:** npm does not handle
a read-only cache directory gracefully — `--prefer-offline` still attempts to
write new entries on a miss, so a genuinely read-only mount may fail the install
rather than degrade to a download.

**4. RWX, read-write for all shards.** Only if the tool's cache is
concurrency-safe. *Trade-off:* simplest to write, riskiest to run — see 4e.

**What RWX costs on GKE.** There is no RWX StorageClass in this cluster —
every class is `pd.csi.storage.gke.io` (`dynamic-rwo`, `premium-rwo`,
`standard-rwo`, plus legacy in-tree `standard`), all block, all RWO. RWX means
adding the Filestore CSI driver (or an NFS provisioner). Per Google's docs, a
Basic HDD Filestore instance provisioned through the GKE CSI driver has a
100 GiB minimum, but **any instance under 1 TiB still consumes 1 TiB of
quota**; the Zonal tier starts at 10 TiB. So the floor is a ~1 TiB-class managed
NFS instance to cache what fits in 10 GiB — roughly two orders of magnitude of
over-provisioning, billed monthly whether or not a test is running, against a
10 GiB pd-balanced disk today. **Unverified:** I could not pull the current
per-GiB rate off the pricing page, so price it before quoting a customer; the
capacity floor is the argument, not the rate.
([tiers](https://docs.cloud.google.com/filestore/docs/service-tiers),
[pricing](https://cloud.google.com/filestore/pricing),
[GKE CSI driver](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/persistent-volumes/filestore-csi-driver))

### 4e. Do npm and Maven survive concurrent writers?

Assume the volume is shared successfully (same node, or RWX). Do the tools cope?

**npm: yes, by design.** cacache is content-addressed — content is written to a
temp path and `rename()`d into `content-v2/sha512/…`, and index entries are
append-only newline-delimited JSON under `index-v5/`. Concurrent writers
converge because they are writing identical bytes to identical paths. *Inferred*
— this is cacache's documented design, not something I read in npm's source
during this investigation. The failure reports that do exist cluster around NFS,
not block devices, which is another mark against option 3 above.

**Maven: no, not by default.** *Verified against Apache's own docs:* Maven
Resolver's `aether.syncContext.named.factory` defaults to **`rwlock-local`**,
which coordinates threads inside one JVM and does nothing across processes. Two
shards resolving the same new artifact into one shared local repository can
interleave and leave a truncated jar behind — which then poisons every later
run, because the repository has no integrity check to notice.

The supported fix, and it is a real one:

```
-Daether.syncContext.named.factory=file-lock
-Daether.syncContext.named.nameMapper=file-gav
```

`file-lock` uses filesystem advisory locking and is documented as letting
concurrently running Maven processes safely share one local repository. Two
caveats straight from the same docs: the `file-gav` name mapper is **mandatory**
with `file-lock` (no other mapper works), and on NFS advisory locking only
*may* work — NFSv4+ with the full RPC/portmapper setup. Which is exactly the
Filestore case, so option 3 for Maven is on documented-maybe footing, not
documented-yes. Default lock timeout is 30s, surfacing as
`Could not acquire write lock`.
([Named Locks](https://maven.apache.org/resolver/maven-resolver-named-locks/index.html),
[SyncContextFactory](https://maven.apache.org/resolver/maven-resolver-impl/synccontextfactory.html),
[MNG-7868](https://issues.apache.org/jira/browse/MNG-7868))

**So the Java customer's concurrency story is strictly worse than the Node one.**
Lead with `spec.concurrency.max` or per-shard repositories for them; treat a
shared writable `.m2` as something that needs two extra flags and still carries
an NFS asterisk.

## 5. Cold start: what the first run costs

**The first run is slower than today.** Say so before you demo it.

*Verified:* `standard-rwo` has `VOLUMEBINDINGMODE: WaitForFirstConsumer`, so
applying the PVC provisions nothing. It will sit in `Pending` with
`waiting for first consumer` until a pod actually claims it. That looks like a
failure and is not — do not let it derail a demo.

*Inferred* — the run-1 sequence, none of it measured:

| Stage | Happens on | Cost |
|---|---|---|
| PD provisioned (10 GiB pd-balanced) | run 1 only | seconds |
| `VolumeAttachment` → CSI `ControllerPublishVolume` → GCE attach | **every run** | tens of seconds |
| `mkfs.ext4` on a blank disk | run 1 only | seconds |
| fsGroup 1001 applied to an empty tree | run 1 only | negligible |
| `npm ci` with an empty cache | run 1 only | same as today |
| writing every tarball into the cache | run 1 only | extra write I/O |

So run 1 ≈ today's 4m26s plus provisioning, attach, format and cache-write, and
run 2 is where the payoff shows. The attach line is the one that does not go
away: every run lands on a different node, so the PD detaches from the previous
node and reattaches, on every single run. That is subtracted from the saving
forever. If it turns out to be large, `spec.pod.nodeSelector` pinning the
workflow to one node is the lever — at the cost of that node becoming a single
point of failure for the workflow.

## 6. Node: cache directory, not `node_modules`

Recommended, and what `playwright-chaos-demo.yaml` does: mount at `/cache/npm`,
point `npm_config_cache` at it, keep running `npm ci --prefer-offline`.

The trade-off, named: **mounting `node_modules` is faster and less trustworthy.**
It skips extract-and-link as well as download, which the cache approach still
pays. But:

- `npm ci` deletes `node_modules` before installing, by design and by contract.
  Mounting a PVC there means fighting the mountpoint or replacing `npm ci` with
  a hand-written staleness guard.
- That guard is the real cost. `node_modules` drifts from `package-lock.json`
  and nothing detects it for you, so you end up hashing the lockfile into a
  stamp file on the volume. When it is wrong it is wrong *silently*, surfacing
  as a test failure rather than a build failure. Bad trade in a chaos-demo
  workflow whose entire point is that failures mean something.
- Testkube-specific tax (*Verified*). The clone step is not wipe-and-replace:
  `RunClone` clones to a temp dir, `copyRepositoryContents` merge-copies over
  `/data/repo` (`clone.go:480` — incidentally why a `node_modules` under
  `/data/repo` survives the clone at all), then `adjustFilePermissions` walks
  the whole destination:

  ```go
  // cmd/testworkflow-toolkit/commands/clone.go:500-505
  func adjustFilePermissions(path string, opts *CloneOptions) error {
  	return filepath.WalkDir(path, func(filePath string, d os.DirEntry, err error) error {
  ```

  A populated `node_modules` under `/data/repo` gets walked and `Info()`'d every
  run. `/cache` is outside the repo and never touched. *Inferred:* I have not
  measured that walk over ~50k files on a PD — it is a reason to prefer the
  cache directory, not proof `node_modules` is unworkable.

### What invalidates the npm cache when `package.json` changes?

**Nothing you have to handle.** npm's cache is content-addressed — cacache keys
on integrity hash and resolved URL, not on your manifest. `npm ci` reads
`package-lock.json` and installs exactly what is pinned, so a lockfile change is
simply a set of misses that get fetched and added. `--prefer-offline` changes
only where npm looks first; it cannot let a stale tarball satisfy a changed
lockfile. No staleness detection, no invalidation step.

What *is* on you is growth: entries are never evicted. Size generously, run
`npm cache verify` occasionally, or leave it — 10Gi absorbs a long time.

(This question has a completely different answer for the `node_modules`
approach, which is the second reason to avoid it: there, a manifest change
*must* be detected by you, because `node_modules` is a materialised tree with no
integrity relationship to the lockfile.)

### Separate finding, possibly bigger than the cache

`cypress` is a devDependency of this repo and this workflow never invokes it,
but `npm ci` runs its postinstall and pulls the ~180MB Cypress binary every run.
The execution's own resource aggregation for the install step reports ~391MB
received. A 573-package tree is nowhere near 391MB of tarballs, and a 3-minute
install is several times what 573 packages normally cost — so the Cypress binary
looks like a large share of the recurring cost. *Inferred from the step's
network counters, not from a profile.*

`playwright-chaos-demo.yaml` caches it (`CYPRESS_CACHE_FOLDER=/cache/cypress`),
the no-behaviour-change fix. `CYPRESS_INSTALL_BINARY=0` would skip the download
entirely and is probably better for a Playwright-only workflow, but it changes
what the install produces, so that is your call rather than mine.

## 7. Maven and `~/.m2`

Recommended, and what `maven-tests-cached.yaml` does: mount at `/cache/m2`, set
`-Dmaven.repo.local=/cache/m2/repository`, keep running `mvn test` online.

**There is no cache-vs-install-dir fork.** npm has two candidates because it
materialises a second copy into the project. Maven has one: the local repository
*is* the resolution target. The customer's question therefore has a simpler
answer — there is only one thing to mount, and mounting it is the whole
optimisation. The fork that does exist is whether to add `mvn -o` on top, and
the answer is no: offline mode turns any cache miss into a hard failure instead
of a download, trading a recurring 2 minutes for an occasional red build nobody
can reproduce locally.

Mount at `-Dmaven.repo.local`, not over `~/.m2`, which also holds `settings.xml`
and `settings-security.xml` — a shared mount over the whole directory puts CI
credentials on a shared disk.

**Invalidation has one real edge npm does not have.** The repository is
addressed by `groupId:artifactId:version` and is append-only, so a `pom.xml`
change resolves the new coordinates and leaves the rest alone — same answer as
npm, nothing to handle. Except:

- **SNAPSHOTs.** Maven's default update policy for SNAPSHOT dependencies is
  `daily`. With an ephemeral `~/.m2` every run was implicitly fresh; with a
  persistent one a stale SNAPSHOT can be served for up to 24 hours. If they use
  SNAPSHOTs, add `-U`. This is the one place where making the cache persistent
  genuinely changes behaviour — lead with it.
- **Negative caching.** A failed resolution is recorded and not retried, so one
  transient registry blip gets pinned into the volume permanently. `-U` clears
  that too.

Plus concurrency, which is worse than npm's — see §4e.

No `npm cache verify` equivalent exists; the repository grows and never prunes.
Plan a scheduled cleanup workflow rather than expecting a plateau.

## 8. Still unproven

Everything cited above is read out of `kubeshop/testkube@3dd49e8`,
`testkube-cloud-api`, `kubernetes/kubernetes@master`, or Apache's resolver docs.
These are not:

- **How much time this actually saves.** A warm cache removes the download, not
  the extract-and-link phase. I would expect the 2m44s install to land somewhere
  in 45s–90s and would not defend a tighter number. Run it twice, read the step
  timing off execution #2.
- **The PD detach/reattach cost per run.** Real, recurring, subtracted from the
  saving, and unmeasured. §5.
- **Whether `fsGroupChangePolicy: OnRootMismatch` takes.** The field is plumbed
  (`api/testworkflows/v1/security_context_types.go:42` → `ToKube()`) and
  Testkube defaults `fsGroup` to 1001 (`constants.go:20`). If the recursive
  chown still runs every mount it will show as slow pod start and eat the
  saving on a cache this file-dense.
- **Whether Cypress is really the bulk of the 391MB.** Inferred from counters.
- **Sharding.** Not executed. The §4b analysis is read out of the Kubernetes
  scheduler and attach-detach controller, but I have not watched it fail here —
  and per the constraints, I did not create the PVC to try.
- **`parallel.transfer` economics** for a `node_modules` of this size (§4d
  option 1).
- **Filestore's current per-GiB rate.** The capacity floor is verified; the
  price is not.
