---
title: "Wyst Source Of Truth"
group: manual
order: 0
summary: "Authority, conflict resolution, feature states, and contract ownership."
---

# Wyst Source Of Truth

## Development Status

Wyst is unpublished and under active development. The language and compiler
make no compatibility promise for source, semantics, ABI behavior, object or
report schemas, compiler interfaces, names, identities, or digest algorithms.
Any of these may change when the design changes.

Content identities and digests reject accidentally mixed inputs and artifacts.
They do not make a design permanent or create a migration obligation.
[`release-identity.md`](release-identity.md) defines the identity inputs,
artifact binding, and publication gate.

## Authority Order

When required prose, grammar, IR documentation, ABI rules, object schemas, or
checked examples conflict, use this order:

1. Semantic clauses: this file, `design/semantic-db.json`, and the owning
   chapter for the specific rule.
2. Syntax grammar: Appendix B for lexical grammar, parseability,
   disambiguation, and reserved tokens. A grammar production does not activate
   a feature unless the semantic registry marks it active or planned.
3. ABI and object contracts: Chapter 15 for Wyst Native ABI and AAPCS64
   interoperation, and Chapter 16 for emitted artifacts.
4. Conformance evidence: checked examples, compiler tests, golden outputs, and
   fixtures. If evidence disagrees with a higher authority, update the
   evidence, implementation, and semantic rule together.
5. Explanatory examples: Appendix C governs example categories. Examples do
   not create language semantics.

Appendix A controls compiler-internal IR shape and verifier invariants. A
conflict with user-visible semantics, ABI rules, or object contracts must be
resolved in favor of the user-visible contract and corrected in Appendix A.

## Contract Owners

The machine-readable semantic registry is
[`design/semantic-db.json`](semantic-db.json). It owns enumerated semantic facts such
as feature states, operator spellings, effect names, public vocabularies, ABI
classifications, and schema names. The chapters and appendices own the detailed
rules.

Checked-in catalogs own closed vocabularies:

- [`syntax-words.tsv`](syntax-words.tsv) owns source words.
- [`meta-operation-catalog.tsv`](meta-operation-catalog.tsv) owns meta
  operations.
- [`attribute-catalog.tsv`](attribute-catalog.tsv) owns declaration
  attributes.
- [`semantic-operation-catalog.tsv`](semantic-operation-catalog.tsv) owns
  qualified semantic operations.
- [`generic-bounds.tsv`](generic-bounds.tsv) owns generic capabilities.
- [`atomic-matrix.json`](atomic-matrix.json) owns atomic storage, element,
  method, order, and lowering combinations.
- [`declaration-roles.tsv`](declaration-roles.tsv) owns sealed declaration
  roles.

The A64 authority, compiler-semantic catalogs, support policy, and conformance
evidence are owned by the checked-in A64 data files and
[`a64-compiler-semantics.md`](a64-compiler-semantics.md). Compiler builds use
those checked-in inputs without fetching architecture data.

Clause-to-test traceability is tracked in
[`design/conformance-index.md`](conformance-index.md). A semantic clause is complete
only when its prose, machine registry, implementation, and evidence agree.

## Active Contract Index

This table summarizes cross-chapter contracts. Owning chapters contain the
complete rules.

| Contract | State | Owner |
| -------- | ----- | ----- |
| Behavior taxonomy for Defined, Target-defined, Indeterminate bits, Architectural fault or trap, and Trusted-contract violation | Implemented | Chapter 1 |
| Compilation Phase Contract for phase products, semantic fact ownership, terminal report-only facts, and rendering adapters (`language.compilation-phase-contract`) | Implemented | [Chapter 25](chapter-25-compilation-phases.md) |
| IR/source semantic agreement for fixed arrays, slices, dynamic arrays, enums, aggregates, explicit address operations, raw addresses, and relocation origins (`language.ir-source-semantic-agreement`) | Implemented | Appendix A; Chapter 16 |
| Ordinary local reads require initialization on every incoming control-flow path; deliberate raw observation uses `MaybeUninit<T>.read_uninit()` | Implemented | Chapters 9 and 11 |
| Typed atomic storage and the closed method/order matrix (`language.opaque-atomic-storage-closed-orders`) | Implemented | [`atomic-matrix.json`](atomic-matrix.json) is the sole catalog authority |
| Enum representation: payload-less enums are transparent tags; payload enums contain the declared tag plus aligned inline storage | Implemented | Chapters 6, 15, 23, and 26; Appendix A |
| Generic instantiation termination over canonical declaration identity plus complete type and value arguments | Implemented | Chapter 6 |
| Canonical generic semantic home, authenticated body transport, deterministic demand order, identical-definition checking, and survivor selection (`artifacts.generic-instantiation-ownership`) | Implemented | Chapters 6 and 16; `wyst.objectInterface.v2` |
| Dynamic-array descriptor contract `wyst.dynamicArrayDescriptor.v0` with a public seven-field layout and authenticated operations | Implemented | Chapters 10 and 23 |
| Sealed declaration-role authority (`language.sealed-declaration-role-authority`) | Implemented | [`declaration-roles.tsv`](declaration-roles.tsv); `wyst.declaration-role-registry.v1`; `wyst.declaration-role-claim.v1`; `wyst.declaration-role-resource-capability.v1` |
| Deterministic layout placement solver for regions, sections, alignment, dependency constraints, overlap, overflow, fill, and diagnostics (`artifacts.layout-placement-solver`) | Implemented | Chapters 4 and 16 |
| `pub` is solely a Wyst source-visibility modifier; `import symbol` and `export` own directional linker boundaries | Implemented | Chapters 4 and 16; Appendix B |
| Canonical typed diagnostic-kind registry shared by text, JSON, LSP, editor rendering, suggestions, and checked code actions (`tooling.canonical-diagnostic-kind-registry`) | Implemented | Chapters 18–20; `wync.diagnostics.v1`; `wync.diagnostics.lsp.v1` |
| Authority-derived compiler inspection reports with typed phase inputs, explicit evidence limits, and no artifact mutation (`tooling.authority-derived-inspection-reports`) | Experimental | Chapter 21 |
| Execution strands and suspension boundaries (`language.execution-strands-suspension-boundaries`) | Implemented | Chapter 13 |
| Context-stability provenance (`language.context-stability-provenance`) | Implemented | Chapter 13; Appendix A |
| Execution-environment provider contracts (`targets.execution-environment-provider-contracts`) | Implemented | Chapters 2 and 13 |
| `#if` compile-time conditionals | Implemented | Chapter 6; Appendix B |
| `is` enum pattern tests | Implemented | Chapter 8 |
| Relocatable `ET_REL` object output | Planned | Chapter 16 |
| Debug build mode | Planned | Chapters 15 and 23 |

The focused A64 conformance authority is
[`a64-conformance-manifest.json`](a64-conformance-manifest.json), with
[`a64-conformance-evidence.tsv`](a64-conformance-evidence.tsv),
[`a64-conformance-targets.tsv`](a64-conformance-targets.tsv), and
[`a64-conformance-oracles.tsv`](a64-conformance-oracles.tsv). It accounts for
330 active and 8,625 `known_unsupported` rows. The ledger records
conformance-only `v9Ap7` unsupported precedence.
Every synthetic target includes `base`.

## Feature States

Active documentation uses these states:

| State | Meaning |
| ----- | ------- |
| Implemented | Accepted by the compiler or emitted by tooling, with evidence protecting the contract. |
| Planned | Selected for implementation but not necessarily accepted or emitted. |
| Experimental | Available for inspection or research and subject to redesign. |
| Reserved | Rejected syntax, names, encodings, or namespaces with no active meaning. |

The semantic registry owns feature-state assignments. Chapters describe only
the active design and planned or experimental work that affects its boundaries.

## Change Process

Make a design change atomically across every affected authority and consumer.
This can include the semantic registry, owning chapters, grammar, checked-in
catalogs, compiler phases, runtime or library code, artifact producers and
consumers, CLI and editor surfaces, fixtures, conformance rows, golden outputs,
and publication checks.

Remove replaced parsers, aliases, adapters, schema readers, ABI paths,
identities, fixtures, and migration diagnostics unless an explicit
compatibility promise requires them. Digests must change when governed content
or the digest algorithm changes.

Documentation checks compare the semantic registry, this file, checked
contract examples, and compiler-visible vocabulary. New compiler-visible
features must have a semantic-registry row before documentation describes them
as implemented, planned, experimental, or reserved.

## Conformance Completion Gate

Each documented semantic clause must have an applicable entry in
[`design/conformance-index.md`](conformance-index.md) covering:

- positive source behavior;
- negative diagnostics;
- execution behavior;
- IR shape;
- lowering or disassembly;
- ELF, object, or relocation output;
- explain-report output;
- reproducibility.

A missing evidence class uses `untested:` with a concrete reason. An
inapplicable class uses `not-applicable:` with a concrete reason. Covered
evidence links to a real test file, test symbol, or fixture.

Planned, reserved, unsupported, and experimental syntax or modes fail clearly
when compiler-visible. They are never accepted and ignored. If no spelling or
mode exists, the conformance index explains why negative diagnostic evidence
does not apply or is not yet available.
