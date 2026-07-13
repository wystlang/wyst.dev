---
title: "Chapter 25: Compilation Phases"
group: chapter
chapter: 25
order: 25
summary: "Compilation phase products, semantic fact ownership, dependency rules, and rendering compatibility adapters."
---

# Chapter 25: Compilation Phases

The compilation phase contract defines which compiler phase owns each
semantic fact, which products later phases may consume, and which terminal
products are reports only. The machine-readable registry is
[`semantic-db.json`](semantic-db.json), under `compilationPhases` and
`semanticFactOwners`.

This chapter adds no source syntax, CLI mode, ABI rule, object format, or
report schema. It constrains compiler architecture and documentation authority
for existing language and tool contracts.

## Compilation Phase Contract

Each phase has one stable `phase.*` identifier in the semantic database.
Phase identifiers are sorted lexicographically in JSON so diffs are stable;
the dependency graph below defines the compilation order.

A phase may consume only the immutable products named by its
`immutableInputs` and the phase products allowed by `permittedDependencies`.
A phase must not consume products named in `forbiddenDependencies`.

The target phase set is:

| Phase ID | Contract role |
| --- | --- |
| `phase.build_inputs` | Freeze the declared build input set. |
| `phase.source_acquisition` | Read and fingerprint declared source text. |
| `phase.parsing` | Produce tokens and module ASTs. |
| `phase.source_graph` | Own module identity and the import graph. |
| `phase.declaration_collection` | Own declaration identity. |
| `phase.name_resolution` | Own resolved symbols. |
| `phase.type_checking` | Produce checked declarations and bodies. |
| `phase.definite_initialization` | Prove ordinary reads are initialized. |
| `phase.ordinary_constant_evaluation` | Own ordinary constant values. |
| `phase.compile_time_selection` | Select active compile-time branches. |
| `phase.generic_canonicalization` | Produce canonical generic instantiation keys and substitutions. |
| `phase.generic_instantiation` | Produce concrete generic declarations. |
| `phase.layout_time_evaluation` | Own layout-time values. |
| `phase.type_layout` | Own type layout. |
| `phase.placement_constraints` | Collect placement obligations. |
| `phase.placement_solving` | Own concrete placement addresses. |
| `phase.effect_authority_analysis` | Own effect and authority summaries. |
| `phase.execution_level_analysis` | Own execution-level facts. |
| `phase.callable_abi_classification` | Own callable ABI classification. |
| `phase.ir_construction` | Own the IR module. |
| `phase.semantic_verification` | Verify cross-phase semantic products. |
| `phase.abi_lowering` | Lower verified call boundaries to ABI obligations. |
| `phase.machine_lowering` | Lower IR and ABI products to machine operations. |
| `phase.register_allocation` | Assign registers and backend stack resources. |
| `phase.final_resource_computation` | Own final resource summaries. |
| `phase.relocation_artifact_preparation` | Prepare artifact sections, symbols, and relocations. |
| `phase.report_only_fact_computation` | Own terminal report-only summaries. |
| `phase.diagnostic_rendering` | Render phase-owned diagnostics. |
| `phase.manifest_provenance_generation` | Render terminal provenance payloads. |

## Phase Product Model

Phase products are immutable after their owner phase completes. A later phase
may refine its own product using earlier products, but it must not rewrite the
earlier product or become a second owner for the same semantic fact.

The product model separates:

- source products: frozen build inputs, source documents, tokens, ASTs, and
  source graph products;
- semantic products: symbol, type, constant, layout, placement, effect,
  execution-level, ABI-classification, and IR facts;
- backend products: ABI obligations, machine operations, register assignments,
  final resource summaries, sections, symbols, and relocations;
- terminal products: report-only summaries, diagnostic renderings, generated
  manifest provenance, benchmark metadata, and release evidence.

The semantic database names the authoritative output of each phase. If a
compiler implementation stores the same fact in a broader carrier object for
today, that carrier is an adapter and does not own the fact.

## Partial Order

The target dependency order is:

```text
build_inputs
  -> source_acquisition
  -> parsing
  -> source_graph
  -> declaration_collection
  -> name_resolution
  -> type_checking
  -> definite_initialization
  -> ordinary_constant_evaluation
  -> compile_time_selection
  -> generic_canonicalization
  -> generic_instantiation
  -> layout_time_evaluation
  -> type_layout
  -> placement_constraints
  -> placement_solving
  -> effect_authority_analysis
  -> execution_level_analysis
  -> callable_abi_classification
  -> ir_construction
  -> semantic_verification
  -> abi_lowering
  -> machine_lowering
  -> register_allocation
  -> final_resource_computation
  -> relocation_artifact_preparation
```

Terminal products branch after their required inputs are complete:

```text
relocation_artifact_preparation -> report_only_fact_computation
build_inputs -> manifest_provenance_generation
source_graph -> manifest_provenance_generation
any phase diagnostic record -> diagnostic_rendering
```

This is a partial order, not a required implementation loop shape. Independent
work inside one phase may be parallelized if the observable products use the
phase's deterministic ordering rule.

## Semantic Fact Ownership

Every semantic fact listed below has exactly one owner. Consumers may read the
fact after the owner phase completes; consumers must not recompute it as a
new authority.

| Semantic fact | Owner phase |
| --- | --- |
| `fact.target_fact` | `phase.build_inputs` |
| `fact.module_identity` | `phase.source_graph` |
| `fact.declaration_identity` | `phase.declaration_collection` |
| `fact.resolved_symbol` | `phase.name_resolution` |
| `fact.type` | `phase.type_checking` |
| `fact.ordinary_constant_value` | `phase.ordinary_constant_evaluation` |
| `fact.layout_time_value` | `phase.layout_time_evaluation` |
| `fact.type_layout` | `phase.type_layout` |
| `fact.placement_address` | `phase.placement_solving` |
| `fact.effect_authority_summary` | `phase.effect_authority_analysis` |
| `fact.execution_level` | `phase.execution_level_analysis` |
| `fact.callable_abi_classification` | `phase.callable_abi_classification` |
| `fact.ir_module` | `phase.ir_construction` |
| `fact.machine_code` | `phase.machine_lowering` |
| `fact.final_resource_summary` | `phase.final_resource_computation` |
| `fact.artifact_bytes` | `phase.relocation_artifact_preparation` |
| `fact.report_only_summary` | `phase.report_only_fact_computation` |

Current declaration, resolved-symbol, checked-type, and ordinary-constant
products carry immutable rows copied from checked semantic fact snapshots, with
row counts derived from the same product data. This keeps product ownership
explicit and prevents `sema::Program` from acting as an authoritative fact
carrier. Current semantic diagnostic and cycle-trace products also carry an
internal origin phase so diagnostic rendering and future cycle reports can
preserve ownership metadata without changing public diagnostic output.

## Dependency Rules And Cycles

The `cycleOwner` field names the phase responsible for detecting and reporting
cycles in that phase's dependency domain. `none` means the phase must not
create a cyclic dependency domain of its own.

Dependency rules:

- A phase may read an earlier product only through an explicit permitted
  dependency.
- A phase must fail closed if a required product is absent, stale, or owned by
  a different phase than the semantic database says.
- A later phase may add diagnostics about its own product, but it must not
  reinterpret an earlier phase's accepted or rejected status.
- Backend resource facts are not semantic effects. They are owned by
  `phase.final_resource_computation`.
- Cycles are reported by the nearest owner phase for the cyclic product, not
  by an arbitrary later consumer.

## Report-Only Facts Are Terminal

`phase.report_only_fact_computation` is terminal. Its outputs have
`reportOnly: true`, `mayAffectAcceptedPrograms: false`, and
`mayAffectEmittedBytes: false`.

Report-only facts may describe compiler products for humans and tools, but
they must not feed back into parsing, semantic checking, IR construction, ABI
classification, lowering, register allocation, artifact preparation,
diagnostic rendering, or build acceptance. Adding a report-only fact does not
change source meaning or emitted bytes.

## Diagnostic Rendering

Diagnostic ownership belongs to the phase that detects the condition.
`phase.diagnostic_rendering` only renders already produced diagnostic records
into text, JSON, and LSP payloads.

Diagnostic rendering must not:

- change whether a program is accepted;
- change emitted artifact bytes;
- invent a semantic fact;
- consume report-only summaries as evidence;
- define a new diagnostic or report schema.

If rendering reveals that a diagnostic needs more structured data, the owning
phase must add that data to its diagnostic record before rendering.

## Non-Semantic Rendering Compatibility Adapters

The adapters below preserve public text/report compatibility only. They must
not own or feed module identity, declaration identity, semantic caches, IR
identity, or artifact bytes.

| Adapter ID | Current carrier | Allowed consumers | Forbidden consumers | Enforcement evidence | Removal condition |
| --- | --- | --- | --- | --- | --- |
| `adapter.synthetic_build_inputs_span` | Synthetic `<build inputs>` display identity for concatenated sources. | Diagnostic rendering and manifest/report provenance display through `SourceMapProduct` segments. | Module identity, declaration identity, semantic caches, IR identity, or artifact bytes. | Source graph/design contract tests and pre-23 characterization. | Public diagnostic/span snapshots migrate from synthetic display labels to original-file source spans. |
