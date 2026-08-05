---
title: "Chapter 21: Compiler Inspection Reports"
group: chapter
chapter: 21
order: 21
summary: "Current lowering, effects, storage, structure-layout, resource, and reference-execution reports with explicit limits."
---

# Chapter 21: Compiler Inspection Reports

`wync explain lowering`, `wync explain effects`, `wync explain storage`,
`wync explain layout`, `wync explain resources`, and `wync explain execution`
expose current compiler facts or execute verified typed IR for debugging and review. They are not
teaching diagnostics or a complete source-to-machine explanation facility.
Their output describes the current compilation or one deterministic reference
execution. The resources report includes exact structural compiler/backend
facts; its separate host-qualified benchmark evidence is measured performance,
not a target performance estimate.

Text and JSON reports identify themselves only by the current report kind:
`lowering`, `effects`, `storage`, `layout`, the versioned
`wync.explain.resources.v1` schema, or the versioned `Wyst reference execution`
schema. Tests may change with intentional language or compiler changes.

Each project report accepts `--artifact NAME`. With no explicit selection it
uses the manifest default; with one, it consumes the same validated named
artifact build plan as `build` and `check`.

## Current Compiler Facts

An inspection report is a terminal view over the current compilation. A typed
constructor for each report kind obtains every material input from the compiler
stage that owns the fact. The constructor, not a CLI caller or renderer,
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

Missing facts are never guessed, reconstructed from a mnemonic switch, or
silently omitted. Reports use `unknown` or `unavailable` when a current fact
cannot be supplied.

Each report has one concise `limits` field instead of repeated evidence
envelopes. Lowering does not cover hardware timing, cache state, branch
prediction, or measured performance. Effects does not cover runtime frequency,
target timing, or cache state. Storage does not cover runtime allocation
behavior, machine cost, or ordinary library contracts without a compiler role.
Resources does not cover hardware timing, cache state, branch prediction, or a
counterfactual non-expanded machine product. Reference execution does not model
target timing, cache state, weak-memory outcome enumeration, scheduling choices,
or machine instruction behavior.

## Project-Artifact Read-Only Contract

Inspection commands are project-artifact read-only on success and on every
failure path. They do not create, remove, rename, truncate, rewrite, chmod, or
change the timestamps of the manifest-selected output, its parent artifact
directory, or any other pre-existing project artifact.

Text reports state `project_artifact_writes = none`; JSON reports expose the
same fact as `projectArtifactWrites: "none"`. This claim is deliberately
narrow: an inspection command still writes its requested report to stdout and
may use process-private temporary state that is not a project artifact.

Regression tests compare the complete recursive content and metadata of both an
absent artifact directory and a pre-existing artifact tree before and after
inspection. Parse, semantic, missing-function, report-construction, and output-
rendering failures receive the same check.

## Lowering Report

`wync explain lowering <project-dir|path/to/wyst.project> [--artifact NAME] --function <name>`
emits the current lowering report. It consumes the source map, verified typed
IR, callable ABI classification and obligations, machine
image, register-allocation facts, final frame/resource facts, relocation facts,
and artifact bytes.

For a final linked artifact, machine bytes and symbols come from the selected
linked ELF and instruction and relocation addresses report final placement.
For `static_library`, they come from the exact emitted `ET_REL` object owned by
the function's module. The report names that object module and section and
retains exact object-local bytes, function offsets, instructions, relocations,
ABI, allocation, and frame facts. Final text addresses, instruction addresses,
and resolved relocation targets are explicitly `unavailable` in text and
`null` in JSON; the report never presents an object-relative zero as final
placement. A relocatable relocation row comes from the emitted object's `RELA`
record and includes its object-local offset, cataloged AArch64 relocation name
and numeric code, symbol target, and addend.

The lowering report's direct-call list uses canonical module-qualified semantic
declaration identities. Import aliases, colliding source-local names, linker
spellings, and object-local bridge names do not replace that identity.
Relocation rows and direct-call summaries therefore describe the same callee
in whole-project and static-library reports.

For a Wyst function, the report's `callableIdentity` block exposes the calling
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

Instruction origin is recorded at emission and retained through final text
layout; it is never inferred from byte position. Each final word is exactly one
of a source-operation instruction, a written checked-assembly instruction, or
generated support. Generated support has one primary kind from the closed
compiler taxonomy and stable causal roots such as value/component IDs,
allocation boundary, call, frame component, checked-assembly group, hardening
catalog row, or relocation. A multi-instruction support sequence additionally
carries one group identity and a dense ordered step. Multiple roots do not
create an ambiguous multi-kind cause. Final artifact verification rejects an
unclassified word, a missing or duplicated group step, or evidence that no
longer matches the final bytes.

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
store-issue timing are not part of this report. Machine-cost models and measured
performance require separate performance work.

## Effects Report

`wync explain effects <project-dir|path/to/wyst.project> [--artifact NAME]` emits the current
effects report. An optional `--function <name>` filter narrows the view without
changing the underlying compiler facts.

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

Target fact sections expose the normalized executable-environment class,
migration/preemption/current-core policies, and ordered execution/completion
provider descriptors. An empty provider list remains explicit; a report never
infers a provider from the environment class, target name, or presence of
`execution_suspension`.

Each declared MMIO read or write reports both `volatile_access` and `mmio` at
its exact operation site. A complete modify reports its ordered read and write
events without inventing atomicity or synchronization. System-register effects,
faults, privilege, and implicit-state facts retain their generated semantic-row
identity; the effects report does not substitute a report-local register table
or generic `sysreg` guess when the catalog supplies more precise facts.

Effects reports do not present backend frame bytes, spills, register use, code
size, veneers, or caller-owned aggregate copies as semantic effects.

## Storage Report

`wync explain storage <project-dir|path/to/wyst.project> [--artifact NAME]` emits the current
storage report. It consumes the selected, instantiated program and the
declaration-role and sealed-core registries. The report publishes active roles
and authenticated ordinary-library operations with their current semantics.
Authenticated `DynamicArray<T>` descriptor annotations and compiler-owned
descriptor operations are compiler-proved facts tied to the sealed role and
its semantic identity. Calls to the ordinary-Wyst `core.storage` implementation
are separate semantic-identity facts: they report the exact operation,
stability boundary, initialization evidence, reclamation contract, and the
capacity, cursor, live, consumed, alignment-padding, abandoned, high-water,
reserved, committed, backing-metadata, and control-metadata vocabulary.

An ordinary arena, byte-storage, typed-handle, buffer, string, movement,
runtime, or generated-support function name creates no storage fact merely by
matching a spelling. The same is true for matching signatures and source
comments or metadata. A `core.storage` fact requires the compiler-authenticated
sealed semantic identity; a source lookalike remains ordinary unreported code.
The report also states that allocation, cleanup, fallback, and synchronization
are not hidden and that allocator/provider selection remains caller-visible.

The report does not introduce allocation semantics, implicit conversions,
hidden checks, cleanup, copying, retention, lowering, or report-local API
authority. Text and JSON distinguish compiler-proved sealed-role facts from
ordinary code and expose the unknown, duplicate, stale, unavailable,
mismatched, and unauthorized claim dispositions.

## Structure Layout Report

`wync explain layout <project-dir|path/to/wyst.project> [--artifact NAME]
[--format text|json]` emits the selected artifact frontend's structure-layout
report without lowering or writing project artifacts. Both renderings directly
project the canonical semantic layout product after target selection and
generic materialization; the renderer does not recompute offsets or candidate
orders.

For every concrete structure the report gives total size and alignment,
useful-data extent, structure array stride, internal and trailing padding, and
each field's type, source-order offset, size, effective alignment,
preceding-padding bytes, and fixed-array element stride when applicable. It
marks public ABI sensitivity and lists the exact constraints that make reorder
advice unavailable.

An unconstrained structure also reports the deterministic alignment-descending
candidate, its complete field order and layout facts, and the exact byte
reduction. A zero reduction remains a factual candidate with no recommendation.
A positive reduction is a size opportunity only; text states that it is not a
guaranteed runtime speedup and JSON exposes `performanceGuarantee: false`.
Packed, trap-frame, public, `#[fixed_layout]`, explicit-field-alignment,
foreign-ABI, hardware-owned, and generic cases receive no reorder
recommendation. Generic definitions without concrete type arguments have no
fabricated layout row.

## Compiler And Backend Resources Report

`wync explain resources <project-dir|path/to/wyst.project> [--artifact NAME]
[--format text|json]` emits one project-wide read-only resource report. The
versioned JSON schema is `wync.explain.resources.v1`; text and JSON are two
renderings of the same typed report product. Construction consumes the selected
artifact's serialized semantic interfaces, semantic affine-verifier telemetry,
verified typed IR, optimizer records, ABI/frame and allocation products, final
machine functions and instruction origins, relocation/layout results, and the
selected artifact plan. It does not scrape disassembly, infer a cause from a
mnemonic, rebuild an owning product, or write the selected artifact.

For each serialized semantic interface the report gives its exact byte length,
record count, resource-contract count, and concrete resumable-frame record
count, plus their project total. Each checked callable with affine values gives
the number of distinct values created, state observations, exact-CFG joins,
revisits, maximum worklist, maximum simultaneously active states, its source
declaration, and the source operation that established the maximum. This
telemetry observes the semantic verifier's actual work; collecting it cannot
add verifier scans or alter acceptance.

For each emitted function the report gives exact final text bytes and words,
veneer count and bytes, frame and maximum stack bytes, alignment, outgoing-call
area, spill slots, and typed frame components. Register-class pressure reports
the maximum live values, register and stack homes, architectural capacity,
allocation position, and all tied source spans. Counts identify hardening
operations and checked-assembly blocks. Generated support is grouped by its
recorded closed cause, group/word/byte count, causal roots, and source spans;
checked-assembly support therefore comes from emission-time checked-block
records rather than decoded or printed assembly.

Retained source, checked-assembly, and generated instructions carry exact
retention reasons. Optimizer records give the source-attributed decision and
proof, subject, parent expansion, before/after instruction and byte costs, and
signed deltas. Mandatory and optimizer-selected expansions give exact
exclusive and inclusive emitted text bytes and their source/definition paths.
Expansion *growth* remains `unknown` because the compiler does not produce a
counterfactual non-expanded machine product; the report must not relabel an
expansion's emitted bytes as estimated growth. Definition retention is
the source-attributed closed reason path from the selected artifact's typed
reference graph. The report exposes that graph's schema and canonical identity,
node/root/edge counts, retained subjects, and typed reasons; it never reconstructs
dependencies from machine code, relocations, symbols, debug information, or
archive extraction and never upgrades the graph into semantic authority.

Stack roots are selected from the semantic entry, exports, module initializers,
section contributions, and exception-vector slots owned by the current artifact
plan. A root with only typed finite direct, tail, and checked-assembly transfer
edges has an exact maximum frame bound and one deterministic maximizing path.
Tail transfer replaces rather than nests the caller frame. An unresolved
indirect call, exception return, target structural terminal, or checked-assembly
control/target fact produces `unknown`, an exact known-prefix byte count, the
maximizing known path, and source-attributed causes. The selected semantic root
is marked explicitly; absence of one is an explicit unavailable cause. An
unknown path is never printed as an exact bound.

The current language and ABI define no concrete stackless callable/resumable
frame. Accordingly, the project and every callable report `not_applicable` with
cause `current_language_has_no_stackless_callable_abi` for resumable verifier
facts, frame layout, state/generation header, payload, padding,
cancellation-only bytes, per-field source/live states, mutually exclusive
overlay savings, nested-helper paths, entry/resume/cancel/result code sizes,
and lifecycle checks/copies/indirect-call/publication operations and reasons.
Zero is not a substitute for this semantic boundary. Encountering a concrete
resumable semantic-interface record while this boundary is active is a hard
report-construction failure rather than a partially fabricated report.

### Scaling evidence

Repeatable generated fixtures independently vary provenance chains, affine
typestate populations, generic substitutions, and separate-compilation module
interfaces at scale 8 and 16. The portable Rust gate checks exact source and
serialized-interface bytes, interface modules, functions, verifier values,
states, joins, maximum active states, and emitted text bytes; doubling any
structural metric may grow it by at most 2.2x. Exact checked-in rows make an
unexplained frame, code, interface, or verifier-work delta visible.

Wall-clock and peak-RSS evidence is deliberately host-qualified and manual.
The named reference host runs five alternating small/large pairs, preserves all
observations, uses medians, applies the same 2.2x doubling ceiling, and retains
raw samples plus budgets with exactly 10% headroom. Missing measurements,
non-reference hosts, changed pairing, unexplained budget failures, and
superlinear growth fail validation. The protocol and retained evidence live in
`wync/tools/compiler-resources`; timing values never affect compiler output or
portable correctness tests.

## Reference Execution Report

`wync explain execution <project-dir|path/to/wyst.project> [--artifact NAME]
--function <name> [--input <scenario.json>] [--format text|json]` executes one
ordinary function from the selected artifact's verified typed IR. The public
Rust entry point is `wync::reference_execution::execute_project`; it returns the
same structured report used by both renderers. The command and API run the
ordinary project selection, compile-time selection, shared generic
instantiation, semantic checking, IR construction, verification, and artifact
hardening path. They stop before ABI classification or machine lowering and do
not create the selected artifact.

Callers that execute more than one function or scenario from the same artifact
use `wync::reference_execution::prepare_project` to produce one
`PreparedExecutionProject`, then call `execute` repeatedly. Preparation performs
the same complete authenticated compilation once; every execution starts with
fresh deterministic runtime state and cannot observe state from an earlier
execution.

An interactive function cannot be the execution root. It is executable only
when called through ordinary source code whose lexical handlers, recovery
arms, terminal commitment, and cleanup have already been lowered and verified.
The engine executes values, aggregate and materialized-sum operations, CFG
edges and phis, calls, memory, faults, atomics, effects, hardening checks,
resource transfers and explicit discards, notifications, and interactive
outcomes directly from that IR. Per-function cleanup ranges and authenticated
resource-transition records make those source semantics visible without
reconstructing them in the report engine.

Reference execution uses one deterministic strand. Atomic operations retain
their order, observed value, and one per-location modification order; the
engine does not enumerate weak-memory outcomes or create additional strands.
Storage uses a deterministic synthetic 64-bit address space. Function, global,
string, stack, and scenario-memory ranges have labeled `reference_address`
identities and collision-checked, overflow-checked extents. These addresses are
report identities, not target virtual addresses.

### Version 1 scenario

The optional input is a closed JSON object with required `version: 1`. Omitted
collections are empty and omitted limits use the documented defaults. Its
fields are:

- `arguments`: positional JSON values checked against the verified function
  parameter types. Integers accept decimal or hexadecimal integer strings;
  pointers accept synthetic addresses; strings are allocated read-only;
  arrays/vectors use arrays; structs use field objects; tuples use arrays or
  field objects; and materialized sums use `{ "tag": "Variant", "payload":
  ... }` with the active variant's authenticated payload type.
- `memory`: raw regions containing `address`, hexadecimal `bytes`, optional
  `writable`, and optional `name`.
- `indeterminateSeed` and `indeterminate`: the deterministic seed and optional
  ordinal-to-byte overrides for explicit indeterminate observations.
- `environment`: an ordered transcript. Every entry gives the exact
  `operation` and typed `arguments`, then either a typed `result` or a
  `completion`; optional `memory` mutations occur at that interaction. Calls
  consume entries strictly in order, and any operation, argument, result,
  count, or leftover-entry mismatch is `environment_unavailable`.
- `limits`: positive `steps`, `callDepth`, `memoryBytes`, and `traceEvents`.
  Defaults are respectively 1,000,000; 256; 67,108,864; and 1,000,000.

Absent environment behavior is never guessed. Explicit indeterminate reads
produce fresh deterministic concrete bits by seed and ordinal (or an override),
record that provenance, and immediately become ordinary typed values. They are
never poison or `undef`.

### Trace and completion

Text and JSON carry the same complete ordered event stream and summary. Each
event has a sequence, kind, semantic function identity, block, optional value,
operation, optional typed result, source span, and operation-specific detail.
The summary includes the selected shared generic instantiations, synthetic
reference-address map, environment consumption, execution-step count, return value,
and `machineLowering = false`. Both forms state
`projectArtifactWrites = none`.

Runtime execution always produces exactly one closed completion:
`returned`, `terminal_transfer`, `fatal_trap`, `architectural_fault`,
`trusted_contract_violation`, `resource_exhausted`,
`environment_unavailable`, or `unsupported`. All are successful report
production and therefore exit zero in the CLI. Invalid command arguments,
scenario schemas, project/compiler diagnostics, ambiguous or missing roots,
and reference-address collisions remain diagnostics and exit nonzero. Checked
A64 currently completes as `unsupported` with
`target_instruction_semantics_unavailable`; recognizing or lowering a checked
instruction is not executable reference semantics.

## Failure Behavior And Parity

Unknown functions and unavailable required products are diagnostics, never
empty success reports. Report-construction and rendering failures preserve the
project-artifact read-only contract.

Text and JSON forms carry the same material facts, limits, generated/source
origins, decoder status, allocation meaning, and read-only claim. CLI
diagnostics for report failures use the same diagnostic-kind registry and
LSP-compatible data as other compiler diagnostics.

Outcome-aware reports preserve the checked interactive protocol record:
nominal identity, ordinary return, ordered effective offers, exact payload
layouts, producer effects, optional uniform handler ceiling, per-arm inferred
effects/captures/leases/control in `interactiveHandlers`, recovery-capability
parameters, hidden callback/context and result ABI, suspension authority,
cleanup order, C profile obligations, and semantic provenance. Large
materialized sums report concrete copy/frame costs as `terminal_copy_bytes` and
`caller_frame_result_storage_bytes`, together with
the exact Native return placement, zero hidden-allocation count, and absence of
runtime support. These facts supplement the existing storage/lowering reports
rather than hiding the value behind a boxed abstraction.
