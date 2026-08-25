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

---

## 1. Can a TestWorkflow mount a volume?

Yes. Three separate fields, all present in
`kubeshop/testkube@3dd49e8` (`k8s/crd/testworkflows.testkube.io_testworkflows.yaml`).

**Pod level — `spec.pod.volumes`**, a full `[]corev1.Volume`:

```go
// api/testworkflows/v1/types.go:88
	// volumes to include in the pod
	// +kubebuilder:pruning:PreserveUnknownFields
	// +kubebuilder:validation:Schemaless
	Volumes []corev1.Volume `json:"volumes,omitempty" expr:"force"`
```

It is schemaless in the CRD (`x-kubernetes-preserve-unknown-fields: true`), so
every upstream volume source is accepted, `persistentVolumeClaim` included. It
is copied onto the pod verbatim at
`pkg/testworkflows/testworkflowprocessor/processor.go:574` (`Volumes: volumes`).

**Container level — `spec.container.volumeMounts`**, a typed
`[]corev1.VolumeMount`:

```go
// api/testworkflows/v1/types.go:40
	// volume mounts to append to the container
	VolumeMounts []corev1.VolumeMount `json:"volumeMounts,omitempty" expr:"force"`
```

`ContainerConfig` is the type behind `spec.container` **and** behind each
step's `steps[].container`, so the field exists at both levels.

**Claim level — `spec.pvcs`**:

```go
// api/testworkflows/v1/testworkflow_types.go:43
	// list of accompanying permanent volume claims
	Pvcs map[string]corev1.PersistentVolumeClaimSpec `json:"pvcs,omitempty" expr:"template,include"`
```

This one is a trap for this use case. It does not give you a cache — see §2.

## 2. Is there already a dependency-caching feature?

No. Searched `cache`, `volume`, `pvc`, `persistentVolumeClaim` across
`pkg/testworkflows/**` and `api/testworkflows/**`. The only things named "cache"
are the image-inspector metadata cache (`ImageInspectorPersistenceCacheKey` /
`CacheTTL` — image manifests, not artifacts), an LRU for namespace lookups, and
a `sync.Map` in the workflow fetcher. There is no workspace reuse either: the
grep for `workspace` returns nothing at all.

`spec.pvcs` looks like the feature and is not. The processor stamps a fresh
per-execution name onto every claim:

```go
// pkg/testworkflows/testworkflowprocessor/intermediate.go:131
func (s *intermediate) AppendPvcs(cfg map[string]corev1.PersistentVolumeClaimSpec) Intermediate {
	for name, spec := range cfg {
		s.Ps[name] = corev1.PersistentVolumeClaim{
			ObjectMeta: metav1.ObjectMeta{
				Name: fmt.Sprintf("{{resource.root}}-%s", s.NextRef()),
			},
```

and the execution worker deletes them when the run ends:

```go
// pkg/testworkflows/executionworker/controller/cleanup.go:60
func cleanupPvcs(labelName string) func(...) error {
	return func(ctx context.Context, clientSet kubernetes.Interface, namespace, id string) error {
		return clientSet.CoreV1().PersistentVolumeClaims(namespace).DeleteCollection(...)
```

`cleanupPvcs` is registered for both `testkube.io/root` and
`testkube.io/resource` in `Cleanup()`. So `spec.pvcs` is per-execution scratch —
useful for sharing a big volume between a parent and its parallel workers within
one run, useless for surviving between runs. A cache has to be a claim Testkube
does not own, created out of band and named from `spec.pod.volumes`. That is
what these manifests do.

## 3. Is the mount honoured for every step, or only the step that declares it?

Every step, if you declare it at `spec.container`. Container config is inherited
down the step tree by summation, not override:

```go
// pkg/testworkflows/testworkflowprocessor/stage/container.go:128
func (c *container) VolumeMounts() []corev1.VolumeMount {
	if c.parent == nil {
		return c.Cr.VolumeMounts
	}
	return sum(c.parent.VolumeMounts(), c.Cr.VolumeMounts)
}
```

The root of that chain is seeded from `spec.container`
(`processor.go:210`, `StepDefaults{Container: workflow.Spec.Container}`), each
nested step calls `container.CreateChild()`, and the resolved config each step
hands to the container builder is `c.ToContainerConfig()`
(`action/process.go:50`), which includes the summed mounts.

There is a stronger reason it works here, though: **a TestWorkflow is one pod.**
The steps are not separate pods that happen to share a claim —

```go
// pkg/testworkflows/testworkflowprocessor/processor.go:598
	podSpec.Spec.InitContainers = containers[:len(containers)-1]
	podSpec.Spec.Containers = containers[len(containers)-1:]
```

— each step becomes an init container, with the last one as the main container.
`Install dependencies` and `Run tests` see the same mount because they are
sequential containers in a single pod sharing a single volume. No concurrency at
all inside a serial run.

## 4. Concurrency, and whether this survives sharding

**It does not, as written.** This is the part that decides whether the pattern is
recommendable, so here is the exact shape of it.

Verified in code: a `parallel:` block does not fan out inside the pod. Each
worker is built into its own complete `TestWorkflowSpec` and deployed as its own
execution (`cmd/tcl/testworkflow-toolkit/commands/parallel.go`,
`WorkerSpec.Spec = *spec.NewTestWorkflowSpec()`, then `ExecuteWorker` →
`ExecutionWorker` deploy). Separate pods, scheduled independently, no affinity
tying them together. This cluster has 5 nodes, so shards land on different nodes
in the normal case.

Verified in code, and worth knowing before you write a sharded variant: workers
inherit the root **pod** config, volumes included —

```go
// pkg/tcl/testworkflowstcl/testworkflowprocessor/operations.go:132
	parallel := step.Parallel.DeepCopy()
	pod := layer.PodConfig()
	parallel.Pod = testworkflowresolver.MergePodConfig(pod.DeepCopy(), parallel.Pod)
```

(`MergePodConfig` appends: `dst.Volumes = append(dst.Volumes, include.Volumes...)`,
`testworkflowresolver/merge.go:29`) — but the inherited **container** config has
its mounts deliberately stripped, twelve lines earlier:

```go
// pkg/tcl/testworkflowstcl/testworkflowprocessor/operations.go:119
	inherited := common.Ptr(stage.Container().ToContainerConfig())
	inherited.VolumeMounts = nil
	step.Parallel.Container = testworkflowresolver.MergeContainerConfig(inherited, step.Parallel.Container)
```

So in a sharded workflow the volume arrives at the worker pods for free and the
`container.volumeMounts` must be re-declared inside the `parallel:` block. Easy
to get wrong, easy to miss, because the failure is a silent cache miss rather
than an error.

Inferred — this is Kubernetes behaviour, not Testkube's, and I have not run it:
`ReadWriteOnce` is scoped to a **node**, not a pod. Shards that land on the same
node would both mount the PVC happily; the first shard on a *second* node cannot,
because a GCE PD is attached to one node at a time. That pod sits in
`ContainerCreating` with a `Multi-Attach error for volume` until it times out.
So the answer to "does RWO serialise them or break them" is **neither, cleanly —
it breaks them nondeterministically**, depending on how the scheduler happened to
place the shards. That is the worst of the three outcomes, and it is why the
workflow manifest carries a do-not-shard warning. `ReadWriteOncePod` would at
least fail the same way every time.

Every StorageClass in this cluster is `pd.csi.storage.gke.io` (`dynamic-rwo`,
`premium-rwo`, `standard-rwo`, plus the legacy in-tree `standard`) — all block,
all RWO. There is no RWX class installed, so RWX here means adding Filestore or
an NFS provisioner first.

If you do want sharding, in rough order of preference:

1. **Don't share the cache.** Install once in the parent workflow (single pod,
   RWO cache) and use `parallel.transfer` to ship `node_modules` to the workers.
   Testkube already has the tarball machinery for this
   (`StepParallelTransfer`, with a `mount` flag). Unproven: whether the transfer
   of a ~500MB `node_modules` is actually cheaper than each shard installing.
2. **One PVC per shard**, named by shard index. Costs N volumes and each warms
   independently, but it is correct and needs no RWX.
3. **RWX, mounted read-only by the shards**, with a separate scheduled workflow
   that mounts it read-write to warm it. Untested caveat: npm does not deal well
   with a read-only cache directory — `--prefer-offline` will still try to write
   new entries on a miss.

Concurrent *writers* are the real hazard in all three, and it is worse for Maven
than for npm. npm's cacache is built for concurrent access on one machine. A
Maven local repository has no cross-JVM locking by default; two shards resolving
the same new artifact into one shared repository over NFS can leave a truncated
jar behind that then poisons every later run. Maven 3.9 added
`-Daether.syncContext.named.factory=file-lock` for exactly this — I have not
verified that flag against the resolver source, so treat it as a lead, not an
instruction.

## 5. Node: cache directory, not `node_modules`

Recommended, and what `playwright-chaos-demo.yaml` does: mount the volume at
`/cache/npm`, point `npm_config_cache` at it, and keep running
`npm ci --prefer-offline`.

The trade-off, named plainly: **mounting `node_modules` is faster and less
trustworthy.** It skips the extract-and-link phase as well as the download,
which the cache-directory approach still pays. But:

- `npm ci` deletes `node_modules` before installing, by design and by contract.
  Mounting a PVC there means either fighting the mountpoint or replacing
  `npm ci` with a hand-written "is this still valid?" guard.
- That guard is the actual cost. `node_modules` can drift from
  `package-lock.json` and nothing detects it for you; you end up hashing the
  lockfile into a stamp file on the volume and comparing. When it is wrong it is
  wrong *silently*, and the failure surfaces as a test failure, not a build
  failure. Trading a reproducible install for two minutes is a bad trade in a
  chaos-demo workflow whose whole purpose is that failures mean something.
- There is a Testkube-specific tax too. The git clone step is not a
  wipe-and-replace: `RunClone` clones into a temp dir, `copyRepositoryContents`
  copies over `/data/repo` (`clone.go:480` — a merge, which is incidentally why
  a `node_modules` mounted under `/data/repo` would survive the clone at all),
  and then `adjustFilePermissions` walks the whole destination:

  ```go
  // cmd/testworkflow-toolkit/commands/clone.go:500
  func adjustFilePermissions(path string, opts *CloneOptions) error {
  	return filepath.WalkDir(path, func(filePath string, d os.DirEntry, err error) error {
  ```

  A populated `node_modules` under `/data/repo` gets walked and `Info()`'d on
  every run. `/cache` is outside the repo and never touched. I have not measured
  what that walk costs over ~50k files on a PD — it is a reason to prefer the
  cache directory, not a proof that `node_modules` is unworkable.

### What invalidates the npm cache when `package.json` changes?

Nothing you have to handle. npm's cache is content-addressed — cacache keys on
the integrity hash and the resolved URL, not on your manifest. `npm ci` reads
`package-lock.json` and installs exactly what is pinned, so a lockfile change is
simply a set of misses that get fetched and added. `--prefer-offline` changes
only where npm looks first; it does not let a stale tarball satisfy a changed
lockfile. There is no staleness to detect and no invalidation step to write.

The one thing that *is* on you is growth: old entries are never evicted. Size
the PVC generously and run `npm cache verify` occasionally, or leave it — 10Gi
absorbs a long time.

(The invalidation question is entirely different for the `node_modules`
approach, which is the second reason to avoid it. There, a `package.json` change
*must* be detected by you, because `node_modules` is a materialised tree with no
integrity relationship to the lockfile.)

### Separate finding, bigger than the cache

`cypress` is a devDependency of this repo and this workflow never invokes it,
but `npm ci` runs its postinstall and downloads the ~180MB Cypress binary every
run. The execution's own resource aggregation for the install step reports
~391MB received. A 573-package tree is nowhere near 391MB of tarballs, and the
3-minute install is several times what 573 packages normally cost, so the
Cypress binary looks like a large share of the recurring cost — I am reading
that off the counters, not off a profile.

`playwright-chaos-demo.yaml` caches it (`CYPRESS_CACHE_FOLDER=/cache/cypress`),
which is the no-behaviour-change fix. Setting `CYPRESS_INSTALL_BINARY=0` would
skip the download entirely and is probably the better answer for a
Playwright-only workflow, but it changes what the install produces, so it is
your call rather than mine.

## 6. Maven: same shape, one real difference

Recommended, and what `maven-tests-cached.yaml` does: mount at `/cache/m2`, set
`-Dmaven.repo.local=/cache/m2/repository`, and keep running `mvn test` online.

Two things differ from the Node case:

**There is no cache-vs-install-dir fork.** npm has two candidates because it
materialises a second copy into the project. Maven has one: the local repository
*is* the resolution target. So the customer's question has a simpler answer —
there is only one thing to mount, and mounting it is the whole optimisation.
The fork that does exist is whether to add `mvn -o` on top, and the answer is
no: offline mode converts any cache miss into a hard failure instead of a
download, which turns a recurring 2 minutes into an occasional red build that
nobody can reproduce locally.

Mount at `-Dmaven.repo.local`, not over `~/.m2`. `~/.m2` also holds
`settings.xml` and `settings-security.xml`; a shared mount over the whole
directory puts CI credentials on a shared disk.

**Invalidation has one real edge that npm does not have.** The local repository
is addressed by `groupId:artifactId:version` and is append-only, so a `pom.xml`
change resolves the new coordinates and leaves everything else alone — same
answer as npm, nothing to handle. But:

- **SNAPSHOTs.** Maven's default update policy for SNAPSHOT dependencies is
  `daily`. With an ephemeral `~/.m2` every run was implicitly fresh; with a
  persistent one a stale SNAPSHOT can be served for up to 24 hours. If the
  customer depends on SNAPSHOTs, add `-U`. This is the one place where making
  the cache persistent genuinely changes behaviour, and it is worth leading
  with when you explain it to them.
- **Negative caching.** A failed resolution is recorded in the repository and
  not retried, so one transient registry blip gets pinned into the volume
  permanently. `-U` clears that too.

Both are noted inline in `maven-tests-cached.yaml`.

Maven also has no `npm cache verify`. The repository grows and never prunes;
plan on a scheduled cleanup workflow rather than expecting a plateau.

## 7. Unproven — only a real run will tell you

Everything above about the CRD, the inheritance, the pod topology, the
per-execution PVC lifecycle and the parallel-worker mount stripping is read
straight out of `kubeshop/testkube@3dd49e8`. These are not:

- **How much time this actually saves.** A warm cache removes the download but
  not the extract-and-link phase. I would expect the 2m44s install to land
  somewhere in the 45s–90s range and I would not defend a tighter number than
  that. Run it twice and read the step timing off execution #2.
- **What the PD attach costs on a cold run.** Every run lands on a different
  node, so the PD detaches from the previous node and attaches to the new one
  before the pod starts. That is real added latency on *every* run and it is
  subtracted from the saving. If it turns out to be large, pinning the workflow
  to one node with `spec.pod.nodeSelector` is the lever.
- **Whether `fsGroupChangePolicy: OnRootMismatch` actually takes.** The field is
  plumbed (`api/testworkflows/v1/security_context_types.go:42` through
  `ToKube()`), and Testkube defaults `fsGroup` to 1001 unless
  `disableFsGroupDefaulting` is set. If the recursive chown still happens on
  every mount, it will show as a slow pod start and it will eat the saving on a
  cache this file-dense.
- **Whether the Cypress binary is really the bulk of the 391MB.** Inferred from
  the step's network counters, not from a profile of the install.
- **Sharding.** Not attempted. The RWO multi-attach reasoning in §4 is standard
  Kubernetes behaviour, but I have not watched it fail here.
