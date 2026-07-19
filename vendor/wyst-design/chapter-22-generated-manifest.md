---
title: "Chapter 22: Generated Manifest"
group: chapter
chapter: 22
order: 22
summary: "Generated/build manifest provenance, declared inputs, host/tool facts, and artifact facts."
---

# Chapter 22: Generated Manifest

`wync generated-manifest <project-dir|path/to/wyst.project> --out
<manifest.json>` emits a deterministic JSON manifest for the resolved project
build configuration and the already-emitted project artifact, if present.

The generated manifest records build provenance: what source and conditional
layout inputs were declared, what host/tool facts were observed, and what
artifact facts were available after the build.

The schema is `wync.generatedManifest.v0` in the `wync.reports.v1` report
schema bundle. It covers one
build-configuration artifact: the resolved project build described by
`wyst.project`. The command is a reporting step, not a build step. It writes only
the requested manifest file and does not rebuild or rewrite the project output.

The manifest records:

- declared inputs: `wyst.project`, the source layout only for an
  artifact-owned layout choice, source roots in manifest order, and discovered
  source modules in canonical import-closure traversal order with byte counts
  and FNV one-a fingerprints;
- source-map status for compiler source spans;
- provenance and freshness for the generated build-configuration artifact;
- target fact provenance, including a target-sensitive `buildIdentity`,
  explicit profile/custom project facts, the complete target-profile policy
  tuple, normalized layout owner and choice, target-contract and extension-set
  schemas/digests, the static platform-counter provider identity/version/role,
  source-descriptor binding, product/record/identity/universe-evidence schemas,
  normalized executable-environment class and environment-product
  identity/version/digest, retained-strand migration, asynchronous-preemption,
  current-core/`per_cpu` policies, and complete execution/completion provider
  descriptor lists,
  source requirements, selected scheduling policies, permitted analysis
  defaults, and unverified assumptions;
- cache-purity/freshness status, including `not-used` and `current-run`;
- observed host/tool facts: `wync` version, host OS, host architecture, host
  family, target profile, and optimization mode;
- emitted artifact facts for the selected manifest product, including artifact
  name and kind, normalized output and optional companion identity, existence,
  object class/machine/entry when applicable, source-map status, provenance,
  and freshness.

The command intentionally avoids timestamps, absolute host paths, command-line
output paths, environment-dependent discovery, path-sensitive debug-data hashes,
retained cache state, and per-run platform-counter instance records. A runtime
record's counter domain, configuration epoch, realized frequency,
comparability, serialization, platform-state evidence, mutable controls,
evidence identities, authenticated universe-authority contract identity and
scope-bound content, record identity, and content digest are launch/measurement
facts, not build-configuration facts.
The independently selected platform-environment universe contract and its exact
authority digest likewise never enter `buildIdentity` or a reusable compilation-
cache key. Only the provider's static universe-evidence schema does. Two
identical project builds followed by two generated-manifest runs must produce
byte-identical manifests even when they are later launched under different
valid counter-instance records or authorities.

The `buildIdentity` value is a deterministic local fingerprint over the
resolved target display, optimization mode, ordered target facts, and selected
artifact/layout choice and scheduling policies, including implicit
`schedule.standard`. The ordered target facts include every policy field and
the authenticated contract/extension identities. For a counter-capable built-
in target this includes static provider
`a64-generic-virtual-counter-instance-provider-v1` version 1, product schema
`wyst.platform-counter-instance-provider.v1`, source descriptor
`a64-generic-virtual-counter-v1`, role
`platform_counter_instance_provider`, record schema
`wyst.platform-counter-instance-record.v1`, identity schema
`wyst.platform-counter-instance-identity.v1`, universe-evidence schema
`wyst.platform-counter-universe-evidence.v1`, and the authenticated product/set
digests. The five-field product digest is
`sha256:ab1c41697aac01bea2961dd676ea33f980712a4471ea70ed226adcf4ed3659b1`.
No consumer can omit a static field without changing the identity.
The same rule includes the selected
`wyst.execution-environment-contract.v1` product. Current built-ins record
`wyst-execution-environment-freestanding-privileged-v1` version 1, class
`freestanding_privileged`, migration `forbidden`, asynchronous preemption
`same_core`, unavailable current-core/`per_cpu` provider policy, and explicit
empty execution/completion provider lists. An empty list is an authenticated
fact, not an omitted field, and neither `execution_suspension` nor an unused
descriptor changes it by implication.
It is not a cryptographic hash, but changing an explicit target fact or selected
scheduling policy changes this identity so reports cannot hide byte-affecting
build selection changes.
