---
title: "Chapter 24: Wyst Scale And Measurement"
group: chapter
chapter: 24
order: 24
summary: "Scale measurement, deterministic rebuild benchmarking, and the host compiler-efficiency release gate."
---

# Chapter 24: Wyst Scale And Measurement

Wyst measures compiler-process cost before introducing incremental behavior.
The compiler-efficiency contract is a host-tooling and release-evidence
contract: it measures project rebuilds, requires repeated whole-project output
to be byte-for-byte stable, and applies reviewed latency and memory budgets on
the named release runner. It makes no claim about the performance of emitted
programs.

The only compiler-efficiency measurement path is `wync rebuild-benchmark`
driven by `wync/tools/bench/`. The policy, samples, aggregates, and verdict are
versioned independently so the harness cannot silently change a budget or
reinterpret old evidence.

## Versioned Contracts

The five produced v1 payloads have non-overlapping ownership:

| Schema | Responsibility |
| ------ | -------------- |
| `wync.rebuildBenchmark.v1` | One compiler invocation's deterministic whole-project rebuild result and its canonical project, artifact, target, input, iteration, compiler-profile, and output identities. |
| `wync.timingTrace.v1` | Out-of-band host timing attribution, including a root interval, versioned host-only interval IDs, canonical `phase.*` mappings, trace bookkeeping, residual reconciliation, and no semantic facts. |
| `wync.compilerEfficiencyPolicy.v1` | The checked-in workload, runner-eligibility, measurement-protocol, aggregation, pinned-baseline, evidence-preservation, and numeric-budget release-gate input. |
| `wync.compilerEfficiencyEvidence.v1` | Raw baseline and candidate samples, aggregates and dispersion, status axes, attribution completeness, and the sole budget/regression verdict derived under one exact policy. |
| `wync.localBench.v1` | The harness/run envelope. It embeds or references the exact canonical policy and evidence and may render their aggregates, but owns no second baseline, aggregation, budget calculation, or verdict. |

Three governance schemas sit beside those payloads:
`wync.compilerEfficiencyPreservationRecord.v1` freezes the seven-role semantic
ledger, `wync.compilerEfficiencyPolicyTransition.v1` binds the reviewed P0→P1
bootstrap transition, and `wync.compilerEfficiencyTerminalEvidenceRegistry.v1`
accepts exactly one P0 bootstrap and one P1 passing verdict. None is a compiler
input.

Every `wync.compilerEfficiencyEvidence.v1` record carries the exact policy
schema, policy version, policy identity, and policy content digest. The digest
covers the workloads, measurement protocol, runner eligibility, budgets,
pinned-baseline identity, reviewed preservation record/store contract, and
aggregation rules. Raw rebuild and timing reports become gate evidence only as
samples under that binding. A missing or mismatched binding invalidates the
evidence and produces no verdict.
`wync.localBench.v1` must preserve that binding rather than replacing it with
envelope-local fields.

The v0 dispositions are closed:

| Schema | Disposition |
| ------ | ----------- |
| `wync.rebuildBenchmark.v0` | Read-only historical payload envelope with the withdrawn optimizer field erased; superseded for all current production by `wync.rebuildBenchmark.v1`. |
| `wync.localBench.v0` | Retained unchanged as a read-only historical payload contract; superseded for all current production by `wync.localBench.v1`. |
| `wync.timingTrace.v0` | Retained unchanged as a read-only historical payload contract; superseded for all current production by `wync.timingTrace.v1`. |

The historical `wync.rebuildBenchmark.v0` payload remains defined by this exact
shape; it is not a v1 example:

```json
{
	"schema": "wync.rebuildBenchmark.v0",
	"compilerVersion": "0.3.0",
	"workload": "project",
	"target": "qemu-virt-aarch64-el2",
	"buildIdentity": "fnv1a64:0000000000000000",
	"targetFacts": {
		"buildIdentity": "fnv1a64:0000000000000000",
		"facts": [
			{
				"name": "arch",
				"value": "arm64-v8a",
				"provenance": "explicit-profile",
				"source": "profile:qemu-virt-aarch64-el2"
			}
		],
		"sourceRequirements": [],
		"analysisDefaults": [],
		"unverifiedAssumptions": []
	},
	"output": "build/kernel.elf",
	"sourceCount": 2,
	"layout": {
		"path": "layout.wyst",
		"fingerprint": "fnv1a64:0000000000000000"
	},
	"modules": [
		{
			"name": "boot",
			"path": "src/boot.wyst",
			"fingerprint": "fnv1a64:0000000000000000",
			"imports": ["drivers.uart"]
		},
		{
			"name": "drivers.uart",
			"path": "src/drivers/uart.wyst",
			"fingerprint": "fnv1a64:0000000000000000",
			"imports": []
		}
	],
	"iterations": [
		{ "index": 1, "elapsedMicros": 1000, "outputBytes": 4096 },
		{ "index": 2, "elapsedMicros": 900, "outputBytes": 4096 }
	],
	"byteIdentical": true
}
```

`elapsedMicros` is observation-only; byte identity is its sole pass/fail
contract. Its module, layout, and `buildIdentity` values with the `fnv1a64:`
prefix are stable non-cryptographic local build-unit identifiers, not v1
content digests.

No current producer emits a v0 payload, and no v0 payload can satisfy the v1
release gate. The historical envelope erases the withdrawn optimizer selector
instead of carrying it as a compatibility axis. The exact read-only files are
`schemas/rebuild-benchmark-v0.schema.json`, `schemas/local-bench-v0.schema.json`,
and `schemas/timing-trace-v0.schema.json` under `wync/tools/bench/`; checked-in
examples pin the rebuild and timing shapes.

## Host-Only Input And Terminal Evidence

The canonical `wync.compilerEfficiencyPolicy.v1` document is a checked-in host
release-gate input. It is not source, manifest, target-profile, layout, or
compiler phase input. `wync.compilerEfficiencyEvidence.v1`,
`wync.rebuildBenchmark.v1`, `wync.timingTrace.v1`, and the
`wync.localBench.v1` envelope are terminal host evidence.

Neither the policy nor any evidence may affect:

- source acceptance or diagnostic kind and precedence;
- compiler phase selection, dependencies, or scheduling;
- reusable compilation-cache keys;
- interface, object, archive, link, or final-artifact identity; or
- emitted bytes.

They may fail only this compiler-efficiency gate or a release gate for an
explicitly nominated snapshot.
Samples use host clocks and process telemetry. They neither consume nor extend
the platform counter-instance records defined in Chapter 11. Later stage-
identity and freshness work may incorporate report identities, but this
contract defines neither a competing identity graph nor a freshness taxonomy.

For identical canonical Wyst inputs, debug and optimized-release compiler
binaries must agree on source acceptance, diagnostic kind and precedence,
the SHA-256 identity of the canonical verified-IR rendering, and emitted bytes.
Telemetry and tracing must likewise alter only terminal evidence, never compiler
ordering, cache semantics, accepted programs, diagnostics, semantic products,
or artifact bytes.

## Workloads And Comparison Identity

The checked-in policy covers at least:

- a tiny project with no checked assembly;
- a tiny project whose first checked-assembly use activates the A64 catalogs;
- the `language.exact-code-contracts` `kernel` named artifact;
- the `language.exact-code-contracts` `kernel-benchmark` named artifact; and
- deterministic module-count and function-count scale projects.

A baseline/candidate verdict comparison requires identical source bytes,
manifest bytes, selected artifact, target facts, layout, profile,
debug/unwind/frame policies, compiler build profile, and workload content. The
pinned baseline and candidate run on the same privacy-preserving physical
gate-runner instance, in one run-session UUID, under one eligible
runner-configuration identity, with samples interleaved in the order frozen by
the policy. Each workload also binds its owning Wyst or kernel repository's
clean revision and committed-tree identity before and after the sample set.

Runner eligibility freezes the hardware or VM identity, CPU, memory, firmware,
OS and kernel, Rust toolchain, clock source and resolution, power and thermal
policy, affinity, isolation, priority, bounded background load, and filesystem-
cache state. The raw physical machine UUID is never evidence; only a
domain-separated SHA-256 digest is retained. Mutable firmware, power/thermal,
priority/isolation, load, competing-work, and cache-procedure controls are
re-observed for every sample set. Recording a host class without an identical
eligible physical instance and run session is not comparability evidence.

Evidence has two independent status axes:

```text
sample_set_status = eligible | ineligible | incomplete | protocol_mismatch
comparison_status = comparable | not_comparable | not_attempted
```

If either sample set is not `eligible`, comparison is `not_attempted`. Two
eligible sample sets are `comparable` only when they share the required runner
configuration and canonical workload inputs; otherwise they are
`not_comparable`. Only `comparable` may produce a compiler-regression verdict.
A non-eligible set retains its raw samples and exact reason but produces neither
an aggregate budget verdict nor a regression verdict.

Different physical runners require a separately versioned calibration and
host-class contract. Cross-version results that require different source or
artifact contracts may be retained as product-evolution context, but they are
`not_comparable` and never drive a regression verdict.

## Measurement Protocol

Uninstrumented verdict sampling measures:

- externally observed `fresh_process` end-to-end latency;
- `process_tree_peak_rss` for that complete command execution;
- project, selected-artifact, and target resolution;
- `first_in_process` whole-build latency; and
- `repeat_in_process` whole-build latency.

`fresh_process` means a new compiler process for the complete externally
observed command. `first_in_process` means the first complete build within a
specific already-started compiler process. `repeat_in_process` means a later
complete build in that same process with unchanged canonical inputs. A run is
not called `cold` or `warm` unless every relevant filesystem, operating-system,
and compiler cache state is separately controlled and recorded.

`process_tree_peak_rss` is the stable metric name, but v1 admits only a single
spawned compiler process with no descendants. Its value is the operating
system's root-process maximum-resident-set high-water mark obtained after
process close. A Darwin sandbox denies `process-fork`; a 2 ms process monitor
independently rejects an observed descendant, multiple roots, an unobserved
root, or a monitoring failure, rather than undercounting a tree as root RSS.
Because the OS high-water mark is not reset between
in-process iterations, no first or repeat iteration may claim it as an
iteration-local peak. An in-process iteration may instead report an explicitly
named resettable metric such as allocator live bytes.

The policy freezes all protocol choices needed to reproduce an aggregate:
fixed warmup and measured-sample counts, baseline/candidate order, interleaving,
timeout and incomplete-run handling, median and p95 algorithms, rounding,
outlier handling with no silent discard, and the exact process tree used for
memory accounting. Evidence preserves every raw sample and identifies every
excluded or incomplete observation with its policy-authorized reason.

## Timing Attribution

Hard latency and peak-memory verdict samples run with timing tracing disabled.
Separate paired attribution samples enable `wync.timingTrace.v1`. Evidence
records the externally measured tracing overhead beside the traced
reconciliation; it never subtracts that overhead from a hard verdict.

The timing trace uses existing canonical semantic-database `phase.*` IDs. Each
versioned host-only interval ID maps explicitly either to the canonical phase
IDs it observes or to compiler initialization or teardown. A host interval
owns no semantic fact and cannot redefine phase order, ownership, or
dependencies. The policy's `requiredHostIntervalMappings` object is the frozen
v1 table: attribution rejects an ID whose `kind` or exact ordered
`canonicalPhaseIds` differs, even when the trace still contains the same global
sets of host and phase IDs. The trace clock, inclusive/exclusive/elapsed
relationships, and exact `reconciledMicros` sum are likewise checked rather
than trusted as self-claims.

Required mappings distinguish project, artifact, and target resolution;
source discovery and reads; every canonical phase exercised by the workload;
and each first-use A64 bundle component. The trace records exclusive canonical-
phase intervals, host-only initialization and teardown, named trace-bookkeeping
time, and residual time. Those components must reconcile to the instrumented
root interval within the policy's frozen tolerance.

Ordinary startup measures the compact A64 release-seal authentication once.
The frozen natural first-use owner is `host.build.frontend`; naming any other
canonical interval (not only the root) is incomplete attribution.
Authority, decoder, semantics, system-operation, instruction, support, and
conformance components each retain a distinct host interval ID and explicit
zero-time `identity_authenticated_exhaustive_replay_skipped` disposition: that
means their identities were authenticated by the seal but their exhaustive
release validators were deliberately not replayed. Those zero-time rows are
not observed canonical-phase time and remain distinct from the measured seal
interval and root reconciliation. Cache telemetry records empty/populated
state and request, hit, and miss deltas for the complete two-build command.

Every successful rebuild report independently carries the exact ordered
91-field `wyst.a64-compiler-identity.v1` record. The harness recomputes its
name/value digest, requires the compiler-fixed field order, and compares the
result with the release-sealed digest in the checked-in expectation object.
Neither a self-claimed digest nor an unordered subset authenticates A64 work.

An unexplained residual above tolerance, a missing required mapping, or a
missing exercised phase fails attribution completeness. An uninstrumented hard-
verdict sample is not expected to contain phase events.

## Aggregation, Budgets, And Verdicts

The evidence records every raw sample, median and p95 plus policy-selected
dispersion, compiler revision, compiler binary digest and build profile, Rust
toolchain, runner-configuration identity, workload and content digests, the
A64 authority/support/conformance identities, and the complete artifact
policy tuple.

Debug and optimized-release compiler binaries have separate performance
samples, aggregates, baselines, and budgets; performance values are never
compared across profiles. Acceptance, diagnostic precedence, canonical
verified-IR identity, artifact identity, bytes, traced phase mapping/order, and
cache semantics must nevertheless be equivalent across profiles. The optimized
build supplies the measured publication build and hard release verdict when its
exact snapshot is nominated; the debug build remains a separately budgeted
developer-throughput product and cannot substitute for the publication build.

For each named gate-runner workload and required metric, the checked-in policy
contains an absolute ceiling and a permitted regression from the pinned
baseline. Those numbers are non-authoritative until a human review record
binds the exact canonical budget-object digest, reviewer, time, and reason.
The current compiler-efficiency release-gate policy carries that approval over
its exact budget digest;
changing any budget bytes invalidates the binding and requires a new review.
Only the policy's frozen median and p95 algorithms may compute aggregates.
Absolute candidate ceilings are assessed independently even when a baseline
comparison is unavailable; a regression check still requires comparable
pinned sets. The gate fails when:

- required attribution is incomplete;
- an eligible candidate aggregate exceeds an absolute ceiling; or
- a comparable candidate regression exceeds its permitted bound.

A baseline never changes automatically. A reviewed baseline update preserves
the old and new compiler binaries, all raw samples, runner configuration,
reason, and every accepted regressing metric. Later changes rerun each named
workload whose compiler path they exercise, even when emitted bytes do not
change.

The policy enforces that preservation structurally and semantically. A pending
bootstrap has `baselineReview: null` and cannot produce a verdict. Explicit
`bootstrap_review` mode can produce only a reviewed null-verdict result, and
only after budget approval, physical-runner pinning, clean Wyst/kernel pins,
eligible controls, absolute budgets, attribution, and equivalence all pass.
The policy's `releaseReadiness` field derives only from those checked-in
policy-side prerequisites (budget approval, runner pin, repository pins, and
reviewed baselines). Final measurement acceptance is deliberately absent from
that field and is owned out of band by the terminal evidence registry, avoiding
a policy/evidence self-reference.
Every pinned baseline has
one `reviewed` record containing the previous baseline (or explicit `null` only
for the initial v1 bootstrap), the new identity/revision and content-addressed
compiler object plus compressed-object and uncompressed-binary SHA-256 digests,
at least one verbatim raw-evidence object with both digests, its deterministic
complete-run archive object with both digests, the exact named-runner
configuration identity, the review reason, and the complete list of accepted
regressing metrics. These objects are checked in under
`wync/tools/bench/evidence/v1/objects/sha256/`; Git also contains the reviewed
ledger under `wync/tools/bench/evidence/v1/records/`. The policy hashes that
ledger, and the loader authenticates deterministic gzip and ustar bytes and
proves it covers the old binary when present, new binary, every raw sample, and
complete run. The review also preserves the exact P0 policy object and its
canonical binding; this avoids a self-digesting P1 policy and makes the
pending-to-pinned transition independently reproducible. It rejects unreviewed
object descriptors; the archived
`evidence.json` must be byte-identical to the reviewed verbatim object, the
archived local-report envelope must bind that evidence, and every raw
stdout/stderr string must match its exact archived `commands/` file. Scratch
paths and mutable CI artifacts do not satisfy
preservation. External release assets are optional non-authoritative mirrors
and never affect local eligibility. The new identity, revision, and
uncompressed binary digest must exactly repeat the outer pinned baseline
fields. A later update may not erase its previous baseline object. The harness
never synthesizes this record or changes the policy; release engineering adds
it only after preserving and reviewing the checked-in objects. Final
acceptance is external to the self-referential policy: the checked-in terminal
registry binds distinct P0/P1 policy digests, the reviewed transition, exactly
one bootstrap record, and exactly one eligible P1 passing record. A
byte-complete record whose statuses, compiler roles, run-session/physical
identity, repositories, absolute checks, equivalence, or verdict are not
semantically supported is rejected.

## Measurement-Preserving Acceleration

Compiler tuning is permitted only behind semantic, diagnostic, and artifact
equivalence tests. Repeated catalog scans, parsing, allocation, hashing, or
reconstruction may be replaced by generated indexes, direct maps, compact
authenticated products, or process-global caches only when the input is an
immutable compiler-owned product and the cache key covers its complete
versioned identity. Each accelerated view is mechanically derived and
non-authoritative; it adds no semantic field.

An accelerated A64 index declares its exact authenticated authority source
domain. Conformance
proves a complete one-to-one correspondence with that domain, with no omitted,
duplicated, or invented key, and reruns the A64 conformance gate unchanged.
Attribution evidence
records empty/populated state and hit/miss counts whenever cache state
distinguishes a workload. A process-global cache does not satisfy the fresh-
process gate, and this milestone adds no on-disk semantic, object, or
incremental-build cache.

Exhaustive A64 conformance accounting may move to the owning generator,
conformance
tests, and release-evidence gate; ordinary compiler startup must not replay
thousands of witness proofs. Before use, every generated bundle or accelerated
index authenticates its schema, release, generator/input, policy, content, and
reference-domain identities against compiler-fixed expectations rooted in the
candidate binary. Compiler-embedded immutable products authenticate their
sealed identities during construction and release evidence. Runtime-loadable
or replaceable products recompute content identity before use. No acceleration
may weaken a rejection or diagnostic-precedence rule, trust only a self-claimed
digest, reduce A64 conformance coverage, or create a parallel authority or
conformance catalog.

## Deterministic Rebuild Benchmark

Command:

```text
wync rebuild-benchmark <project-dir|path/to/wyst.project> [--artifact <name>]
```

The command accepts the same project input forms as `wync build`; `--artifact`
selects the exact named artifact fixed by the harness policy. It performs repeated
whole-project builds using the same canonical source, manifest, target, layout,
artifact policy, and compiler build profile, reads the generated artifact after
each iteration, and fails if the bytes differ. Successful stdout is one
`wync.rebuildBenchmark.v1` JSON payload.

The report identifies the selected artifact rather than treating the project
default as implicit. It binds the complete target facts and artifact policy
tuple, compiler build identity/profile, canonical workload/content digests,
source and layout identities, the canonical verified-IR content digest and its
same-process stability result, iteration kind, elapsed host time, eligible
resettable per-iteration memory metrics, output size and digest, and the byte-
identical result. The harness evidence adds the compiler revision and binary
digest. Timing observations become release evidence only when the harness binds
them to an exact policy, eligible runner, and complete
`wync.compilerEfficiencyEvidence.v1` sample set.

The Markdown and HTML envelopes render every produced aggregate (count,
median, P95, MAD, minimum, maximum), independent absolute-budget check, and
produced baseline-regression check. They remain renderings of the embedded
evidence and cannot create or modify a verdict.

Source and layout fingerprints remain deterministic local build-unit
identifiers; a non-cryptographic fingerprint is never substituted for the
cryptographic content digests required by policy, workload, compiler, evidence,
and artifact identities.

## Non-Goals

- No persistent build cache or incremental code generation; the persistent
  incremental-build-cache contract owns immutable snapshots, invalidation, and
  reuse.
- No user-selected optimizer policy; compiler-efficiency evidence compares
  Rust compiler build profiles without changing the universal Wyst optimizer.
- No target-runtime, emitted-code performance, backend-cost, PMU/TMA, or
  platform-counter claim; the platform-counter contract and later backend
  contracts own those.
- No cross-machine verdict without a later versioned calibration contract.
