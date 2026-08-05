---
title: "Wyst Language Reference Manual"
group: manual
order: 0
---

# Wyst Language Reference Manual

This is the current Wyst language and compiler design reference. It is organized
for lookup by topic, not as a tutorial or a sequence to read from front to back.

Wyst is a hobby language under active development. The compiler is whatever the
current source builds, and this manual describes that source. There is no
language or compiler version and no backwards-compatibility promise. Git keeps
history; the manual does not preserve superseded designs or migration paths.

Each topic describes the language or compiler contract at the design level.
[source-of-truth.md](source-of-truth.md) explains how conflicts between the
manual, grammar, catalogs, implementation, and tests are resolved. When the
language changes, update the affected implementation, documentation, and useful
regression tests together.

## Authority

[source-of-truth.md](source-of-truth.md) is the starting point for current
language semantics and conflict resolution.

Checked-in catalogs own closed vocabularies where the compiler benefits from a
single machine-readable definition:

- [syntax-words.tsv](syntax-words.tsv) owns source words.
- [attribute-catalog.tsv](attribute-catalog.tsv) owns declaration attributes.
- [builtin-type-members.tsv](builtin-type-members.tsv) owns contextual members
  and exact typed constants of builtin types.
- [meta-operation-catalog.tsv](meta-operation-catalog.tsv) owns compiler and
  meta operations.
- [hardening-catalog.tsv](hardening-catalog.tsv) owns explicit generated
  runtime checks. It is separate from source semantic operations because
  hardening is artifact-selected and absent from ordinary compilation.
- [c-interactive-adapter-catalog.tsv](c-interactive-adapter-catalog.tsv) owns C
  status/out and tagged/out adapter profiles.
- [generic-bounds.tsv](generic-bounds.tsv) owns generic capability bounds.
- [link-format-catalog.tsv](link-format-catalog.tsv) owns the versioned static
  link representations and their content bindings.
- [link-interface-schema.tsv](link-interface-schema.tsv) owns canonical
  semantic-interface record tags and required fields.
- [a64-link-relocations.tsv](a64-link-relocations.tsv) owns the exhaustive
  static LP64 AArch64 relocation encodings and failure behavior;
  [a64-link-veneers.tsv](a64-link-veneers.tsv) owns every permitted veneer.

Compiler-owned declaration roles are defined directly beside their
implementation and validated against the bundled source declaration.

The A64 catalogs and generated tables are compiler inputs for instruction
selection, encoding, decoding, checked assembly, and target behavior. Their
validators and tests protect behavior that can break the compiler.

## Table of Contents

| Chapter | File                                                                             | Purpose                                                                                                                            |
| ------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1       | [chapter-01-language-design.md](chapter-01-language-design.md)                   | Language principles, no compiler-exploitable UB, effect system, and compiler philosophy.                                 |
| 2       | [chapter-02-targets.md](chapter-02-targets.md)                                   | Target facts, execution environments, and why runnability is explicit.                                                             |
| 3       | [chapter-03-project-builds.md](chapter-03-project-builds.md)                     | Project layout, manifests, source discovery, target selection, and build modes.                                                    |
| 4       | [chapter-04-modules.md](chapter-04-modules.md)                                   | Modules, imports, visibility, source references, and layout/module boundaries.                                                     |
| 5       | [chapter-05-boot.md](chapter-05-boot.md)                                         | First runnable program shape, boot entry assumptions, and early runtime setup.                                                     |
| 6       | [chapter-06-types.md](chapter-06-types.md)                                       | Scalar values, constants, conversions, addresses, arrays, slices, structs, bitstructs, and enums.                                  |
| 7       | [chapter-07-operators.md](chapter-07-operators.md)                               | Expression syntax, arithmetic, comparison, casts, precedence, and branchless selection.                                            |
| 8       | [chapter-08-functions.md](chapter-08-functions.md)                               | Declarations, functions, parameters, returns, control flow, labels, inline helpers, register pinning, and assembly escape hatches. |
| 9       | [chapter-09-memory-model.md](chapter-09-memory-model.md)                         | Normal memory, volatile memory, atomics, barriers, ordering, agents, and happens-before.                                           |
| 10      | [chapter-10-runtime.md](chapter-10-runtime.md)                                   | Explicit allocation direction, arenas, storage contracts, dynamic arrays, handles, buffers, and runtime boundaries.                |
| 11      | [chapter-11-intrinsics.md](chapter-11-intrinsics.md)                             | Runtime primitives for atomics, sysregs, traps, cache/TLB maintenance, CPU hints, counters, and target hooks.                      |
| 12      | [chapter-12-simd.md](chapter-12-simd.md)                                         | Explicit vector types, lane operations, vector loads/stores, and non-autovectorization policy.                                     |
| 13      | [chapter-13-scheduling.md](chapter-13-scheduling.md)                             | The standard scheduling policy and explicit source-order compiler boundaries.                                                       |
| 14      | [chapter-14-exception-vectors.md](chapter-14-exception-vectors.md)               | Alignment, exception vectors, vector slots, and checked trap-frame ABI basics.                                                     |
| 15      | [chapter-15-abi-spec.md](chapter-15-abi-spec.md)                                 | Native ABI, AAPCS64 interop, argument/return classification, stack protocol, and register ownership.                               |
| 16      | [chapter-16-object-format.md](chapter-16-object-format.md)                       | Emitted artifacts, ELF sections, symbols, relocations, deterministic output, and object-format boundaries.                         |
| 17      | [chapter-17-optimization.md](chapter-17-optimization.md)                         | Universal deterministic optimization, proofs, costs, and the boundary between compiler work and runtime behavior.           |
| 18      | [chapter-18-check-format-diagnostics.md](chapter-18-check-format-diagnostics.md) | Check mode, formatter behavior, diagnostic formats, editor catalog, and syntax highlighting floor.                                 |
| 19      | [chapter-19-learning-diagnostics.md](chapter-19-learning-diagnostics.md)         | Diagnostic explanations, learning fields, source insights, and teachable compiler feedback.                                        |
| 20      | [chapter-20-editor-integration.md](chapter-20-editor-integration.md)             | Editor/LSP behavior, language-server capabilities, task templates, and debug launch boundaries.                                    |
| 21      | [chapter-21-explain.md](chapter-21-explain.md)                                   | Lowering, effects, storage, and reference-execution reports over current compiler semantics.                            |
| 23      | [chapter-23-debug-info.md](chapter-23-debug-info.md)                             | Debug information goals, DWARF sections, DIEs, locations, and determinism.                                                         |
| 25      | [chapter-25-compilation-phases.md](chapter-25-compilation-phases.md)             | Current compiler data flow, direct dependencies, diagnostics, reports, and timing instrumentation.                                 |
| 26      | [chapter-26-errors-and-progress.md](chapter-26-errors-and-progress.md)           | Materialized outcomes, lexical interactive functions, exact forwarding, progress, recovery, cancellation, cleanup, traps, and C adapters. |

## Appendices

| Appendix | File                                                                       | Purpose                                                                                                    |
| -------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A        | [appendix-a-ir.md](appendix-a-ir.md)                                       | Compiler IR, SSA, effect representation, verifier invariants, register allocation, and lowering internals. |
| B        | [appendix-b-grammar.md](appendix-b-grammar.md)                             | Formal grammar, lexical rules, parsing forms, and reserved syntax.                                         |
| C        | [appendix-c-doc-example-contracts.md](appendix-c-doc-example-contracts.md) | Documentation example categories and required example conventions.                                        |
