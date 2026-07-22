---
title: "Chapter 21: Experimental Compiler Inspection Reports"
group: chapter
chapter: 21
order: 21
summary: "Authority-derived lowering, effects, and storage inspection reports with explicit evidence limits."
---

# Chapter 21: Experimental Compiler Inspection Reports

`wync explain lowering`, `wync explain effects`, and `wync explain storage`
are **experimental compiler inspection reports**. They expose current compiler
facts for debugging and review, but their schemas are not yet compatibility
promises. They are not performance insights, teaching diagnostics, or a
complete source-to-machine explanation facility.

The active schema identifiers are `wync.explain.lowering.v1`,
`wync.explain.effects.v1`, and `wync.explain.storage.v1`. The earlier `v0`
schemas are removed because they exposed synthetic authority, timing claims,
and ambiguous write/freshness fields that cannot be interpreted as the `v1`
truth contract. Their experimental status is part of every text and machine-
readable report. Promotion requires a separate schema-status change in
[source-of-truth.md](source-of-truth.md) and
[`semantic-db.json`](semantic-db.json).

## Authority And Input Products

An inspection report is a terminal view over immutable compiler products. A
typed constructor for each report kind obtains every material input from the
phase that owns the fact. The constructor, not a CLI caller or renderer,
creates the complete report input.

The following substitutions are forbidden when the owning product exists:

- caller-supplied generic payloads;
- raw or synthetic ASTs in place of the selected, instantiated current-build
  program;
- report-local semantic or target tables;
- synthetic concatenated source labels in place of the original source-map
  product;
- recomputed IR, ABI, allocation, frame, image, or artifact facts; and
- source text or snapshots supplied solely to make a report say an expected
  thing.

A report may compute presentation-only derivatives, such as deterministic
sorting, graph strongly connected components, path display, or aggregate row
counts. Such derivatives remain report-only facts and cannot affect accepted
programs, diagnostics, lowering, or emitted bytes.

Every text and machine-readable report records an authority envelope with:

- the producing phase identity, normally
  `phase.report_only_fact_computation`;
- the stable identity and owner phase of every input product;
- the report schema and experimental facility status; and
- an explicit `unknown` or `unavailable` value when an authoritative input is
  absent.

Missing facts are never guessed, reconstructed from a mnemonic switch, or
silently omitted.

## Epistemic Metadata

Every modeled or numeric report field carries the common epistemic schema
`wync.reportEpistemic.v0`. A containing object may supply metadata shared by all
of its fields, but the association must be unambiguous. The required fields
are:

- `evidence_kind`: `compiler-proved`, `target-provided`,
  `static-assumption`, `measured`, or `unknown`;
- `analysis_freshness`: `current_run`, `unknown`, or `unavailable`;
- `evidence_version`: the model, compiler evidence, target-catalog, or
  measurement-method version, or `null` when unavailable;
- `declared_assumptions`: a deterministic list, empty only when none are
  required;
- `unsupported_factors`: a deterministic list of material factors the model
  does not cover; and
- `measurement_status`: `not_measured` or `measured`.

Static compiler analysis always uses `measurement_status = not_measured`.
`current_run` says only that the compiler analysis was recomputed for this
invocation. It says nothing about hardware measurement, cache state, target
model validity, or runtime freshness.

Selected target identity and model identity are distinct. Two model names may
be distinct only when their underlying model facts differ. A report may name
the selected target while saying that no target-specific model is available.

## Project-Artifact Read-Only Contract

Inspection commands are project-artifact read-only on success and on every
failure path. They do not create, remove, rename, truncate, rewrite, chmod, or
change the timestamps of the manifest-selected output, its parent artifact
directory, or any other pre-existing project artifact.

Text reports state `project_artifact_writes = none`; JSON reports expose the
same fact as `projectArtifactWrites: "none"`. This claim is deliberately
narrow: an inspection command still writes its requested report to stdout and
may use process-private temporary state that is not a project artifact.

Conformance compares the complete recursive content and metadata of both an
absent artifact directory and a pre-existing artifact tree before and after
inspection. Parse, semantic, missing-function, report-construction, and output-
rendering failures receive the same check.

## Lowering Report

`wync explain lowering <project-dir|path/to/wyst.project> --function <name>`
uses schema `wync.explain.lowering.v1`. It consumes the current-build source
map, verified typed IR, callable ABI classification and obligations, machine
image, register-allocation facts, final frame/resource facts, relocation facts,
and artifact bytes.

For a selected snapshot function, the report's `callableIdentity` block exposes the calling
convention; each positional parameter's type, explicit register placement, and
`noescape` bit; and the result type, explicit result register, and `never`
state. Declaration parameter names are deliberately absent from that identity
block. The selected-target block also exposes the `perCpu` availability defined
by `language.callable-storage-contracts`, together with the
base mechanism, required alignment, reserved state, and realization kind; an
unselected contract remains explicitly unavailable rather than inferred.

For source-origin work, every row renders the normalized project-relative
path, byte span, line, and column mapped through the original source-map
product. Compiler-created ABI copies, prologue/epilogue work, frame setup,
spills, reloads, expansions, padding, veneers, or support instructions instead
carry `origin = generated` and a specific generated-origin reason. Generated
work never inherits the first or nearest source row merely for display.

An instruction decoder result is explicit. A recognized word reports
`decoded = true` and its decoded operation. An unrecognized word preserves its
exact bytes and word, reports `decoded = false`, and does not present `.inst`
or another placeholder as a decoded instruction.

Allocation facts expose public meanings rather than backend sentinels. A value
that can be recreated reports `home_kind = rematerialized`, `register = none`,
and a reason. Internal general-purpose pseudo-home 31 is never rendered as
architectural allocation facts. Missing allocation facts are `unavailable`.

Every `strand_suspension_boundary` has one lowering row even though it emits no
machine instruction. The row names the source call or
`core.execution.suspension_point`, exact or conservative callable-bound
provenance, ordered adjacent transfer, selected target and provider identity
when applicable, plus `machine_code_contribution = none` and
`synchronization = none`. The zero-contribution contract covers instructions,
calls, symbols, relocations, stack maps, runtime hooks, and runtime
dependencies. Current-context/`per_cpu` invalidations and subsequent
reacquisitions remain visible as typed boundary and current-instance rows; the
context section names each boundary's origin, trigger, and live-value
disposition. A report must not render the boundary as an architectural barrier,
safepoint, or scheduling event.

Values with compiler-visible context provenance expose their closed
`context_stability`, origin, conservative join path, storage/escape
eligibility, and boundary-liveness disposition. Spills, reloads, inlining, and
separate-interface origins retain the same classification rather than replacing
it with `unknown`. A raw-address trust boundary is reported without claiming
that it sanitized or upgraded the value.

### Hardware Access Operations

The lowering report consumes each verified `HardwareAccessIr` record and emits
exactly one public operation row labeled `hardware.scalar.read`,
`hardware.snapshot.read`, `hardware.raw.write`, `hardware.named.write`, or
`hardware.modify`. The row contains the stable hardware object identity, the
nominal snapshot identity or explicit `none` for scalar MMIO, ordered primitive
value IDs, exact transfer width, `full_compiler_fence = true`, and
`emitted_architecture_barrier = false`. A modify row identifies its one read and
one write in that order; it is not rendered as two unrelated source operations.

MMIO rows additionally report volatile/MMIO intent, required natural alignment,
the selected target's unaligned-access fact, and possible architectural fault.
System-register rows carry the authenticated generated register, encoding,
support, and semantic identities. A report never reconstructs a system-register
identity from source spelling, a raw tuple, or decoded bytes when the verified
catalog identity is available.

An emitted `dmb`, `dsb`, or `isb` appears as its own explicit barrier operation.
Compiler-only hardware ordering is never presented as an emitted instruction,
and an emitted barrier is never inferred merely because a hardware access is a
full compiler fence.

### Typed-IR Dependency Shape

The lowering report contains `typed_ir_dependency_shape`, an unweighted
structural view derived only from verified typed IR. It records:

- typed-IR nodes and their function/block membership;
- operand edges with stable operand indices;
- CFG predecessor and successor edges;
- loop membership and strongly connected components; and
- deterministic unweighted graph counts.

It assigns no latency, throughput, cache-hit, issue-rate, or target-cycle cost.
Calls, memory operations, atomics, barriers, assembly, phis, loops, spills, ABI
copies, and multi-instruction expansions may be identified structurally, but
none receives an invented machine cost. `critical_path`, `latencyCycles`,
throughput fields, `estimate = fixed`, unconditional cache-hit claims, and
store-issue timing are not part of this schema. Machine-cost models and measured
performance require a later performance schema.

## Effects Report

`wync explain effects <project-dir|path/to/wyst.project>` uses schema
`wync.explain.effects.v1`. An optional `--function <name>` filter narrows the
view without changing the authority source.

The report consumes the semantic analyzer's current-build per-function and
per-site effect-authority product. It does not infer effects by walking raw AST
or IR and does not own a mnemonic-to-effect switch. The product distinguishes:

- semantic operation kind, so `operation = call` remains separate from the
  callable's effect and authority bounds;
- direct, external, resolved-indirect, and unresolved-indirect call bounds;
- direct and transitive effects with their dependency paths;
- qualified DSB and DMB forms rather than a single unqualified barrier label;
- checked assembly bounds and explicitly conservative assembly bounds; and
- proven facts, programmer assertions, target-provided facts, and unavailable
  facts.

`execution_suspension` appears as the same closed effect for direct, indirect,
imported Wyst, foreign, marker, and `effects(all)` sites. Each site identifies
whether its bound is exact or conservative and links to the corresponding
typed boundary. A provider marker additionally records its owning provider,
authenticated leaf semantic declaration, ordered adjacent transfer identity,
selected target, zero-instruction lowering, and provenance. A rejected marker
or missing-provider transfer produces a diagnostic and no misleading lowered
row.

Target fact sections expose the normalized executable-environment class, exact
environment product identity/version/digest, migration/preemption/current-core
policies, and ordered execution/completion provider descriptors. An empty
provider list remains explicit; a report never infers a provider from the
environment class, target name, or presence of `execution_suspension`.

Each declared MMIO read or write reports both `volatile_access` and `mmio` at
its exact operation site. A complete modify reports its ordered read and write
events without inventing atomicity or synchronization. System-register effects,
faults, privilege, and implicit-state facts retain their generated semantic-row
identity; the effects report does not substitute a report-local register table
or generic `sysreg` guess when the catalog supplies more precise facts.

Effects reports do not present backend frame bytes, spills, register use, code
size, veneers, or caller-owned aggregate copies as semantic effects.

## Storage Report

`wync explain storage <project-dir|path/to/wyst.project>` uses schema
`wync.explain.storage.v1`. It consumes the selected, instantiated current-build
program and the sealed declaration-role registry. The report always publishes
the exact registry schema and digest, assignment authority, active roles,
reserved resource kinds and transition fields, and closed rejection
dispositions. Authenticated `DynamicArray<T>` descriptor annotations and
compiler-owned descriptor operations are compiler-proved facts tied to the
sealed role, its semantic identity, and its interface/body digests.

Ordinary arena, byte-storage, typed-handle, buffer, string, movement, runtime,
or generated-support function names create no storage fact. The same is true
for matching signatures and source comments or metadata. Such APIs remain
ordinary typed code and can be reported only when an authenticated body or
future interface summary supplies the evidence; absent that evidence the
authority-only report succeeds without guessing a contract.

The report does not introduce allocation semantics, implicit conversions,
hidden checks, cleanup, copying, retention, lowering, or report-local API
authority. Text and JSON distinguish compiler-proved sealed-role facts from
ordinary code and expose the unknown, duplicate, stale, unavailable,
mismatched, and unauthorized claim dispositions.

## Failure Behavior And Parity

Unknown functions and unavailable required products are diagnostics, never
empty success reports. Report-construction and rendering failures preserve the
project-artifact read-only contract.

Text and JSON forms carry the same material facts, authority envelope,
epistemic classification, generated/source origins, decoder status, allocation
meaning, and read-only claim. CLI diagnostics for report failures use the same
canonical diagnostic-kind registry and LSP-compatible data as other compiler
diagnostics.

Outcome-aware reports preserve the checked operation protocol record: nominal
identity, ordered effective transitions, exact payload layouts, operation
effects, progress ceiling, recovery-capability parameters, hidden callback and
result ABI, suspension authority, cleanup order, C profile obligations, and
semantic provenance. Large materialized sums report concrete copy/frame costs
as `terminal_copy_bytes` and `caller_frame_result_storage_bytes`, together with
the exact Native return placement, zero hidden-allocation count, and absence of
runtime support. These facts supplement the existing storage/lowering reports
rather than hiding the value behind a boxed abstraction.
