---
title: "Wyst Language Reference Manual"
group: manual
order: 0
---

# Wyst Language Reference Manual

This is the canonical Wyst language and compiler design reference. It is
organized for lookup by topic, not as a tutorial or a sequence to read from
front to back. Use the contents and appendices to go directly to the contract
you need.

Each topic describes the language or compiler contract at the design level.
Feature state, schema versions, and conflict authority are defined in
[source-of-truth.md](source-of-truth.md). If any chapter, appendix, example, IR
note, or ABI rule conflicts with that file, the source of truth wins and the
lower-authority document must be updated.

## Authority

[source-of-truth.md](source-of-truth.md) is the versioned registry for:

- the current language, Native ABI, report, and interface schema versions;
- which document wins when prose, grammar, IR documentation, ABI rules,
  and examples conflict;
- feature status: implemented, future-version normative, experimental,
  reserved, deprecated, or removed.
- compilation phase products and semantic fact ownership boundaries.

[conformance-index.md](conformance-index.md) is the clause-to-test
traceability index. It records the positive, negative, execution, IR, lowering,
artifact, explain-report, and reproducibility evidence for each semantic
database feature row, and it names untested evidence explicitly.

## Table of Contents

| Chapter | File                                                                             | Purpose                                                                                                                            |
| ------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1       | [chapter-01-language-design.md](chapter-01-language-design.md)                   | Language identity, principles, no compiler-exploitable UB, effect system, and compiler philosophy.                                 |
| 2       | [chapter-02-targets.md](chapter-02-targets.md)                                   | Target facts, execution environments, and why runnability is explicit.                                                             |
| 3       | [chapter-03-project-builds.md](chapter-03-project-builds.md)                     | Project layout, manifests, source discovery, target selection, and build modes.                                                    |
| 4       | [chapter-04-modules.md](chapter-04-modules.md)                                   | Modules, imports, visibility, source references, and layout/module boundaries.                                                     |
| 5       | [chapter-05-boot.md](chapter-05-boot.md)                                         | First runnable program shape, boot entry assumptions, and early runtime setup.                                                     |
| 6       | [chapter-06-types.md](chapter-06-types.md)                                       | Scalar values, constants, conversions, addresses, arrays, slices, structs, bitfields, and enums.                                   |
| 7       | [chapter-07-operators.md](chapter-07-operators.md)                               | Expression syntax, arithmetic, comparison, casts, precedence, and branchless selection.                                            |
| 8       | [chapter-08-functions.md](chapter-08-functions.md)                               | Declarations, functions, parameters, returns, control flow, labels, inline helpers, register pinning, and assembly escape hatches. |
| 9       | [chapter-09-memory-model.md](chapter-09-memory-model.md)                         | Normal memory, volatile memory, atomics, barriers, ordering, agents, and happens-before.                                           |
| 10      | [chapter-10-runtime.md](chapter-10-runtime.md)                                   | Explicit allocation direction, arenas, storage contracts, dynamic arrays, handles, buffers, and runtime boundaries.                |
| 11      | [chapter-11-intrinsics.md](chapter-11-intrinsics.md)                             | Runtime primitives for atomics, sysregs, traps, cache/TLB maintenance, CPU hints, counters, and target hooks.                      |
| 12      | [chapter-12-simd.md](chapter-12-simd.md)                                         | Explicit vector types, lane operations, vector loads/stores, and non-autovectorization policy.                                     |
| 13      | [chapter-13-scheduling.md](chapter-13-scheduling.md)                             | Scheduling regions, deterministic reordering boundaries, and target-aware scheduling modes.                                        |
| 14      | [chapter-14-exception-vectors.md](chapter-14-exception-vectors.md)               | Alignment, exception vectors, vector slots, and checked trap-frame ABI basics.                                                     |
| 15      | [chapter-15-abi-spec.md](chapter-15-abi-spec.md)                                 | Native ABI, AAPCS64 interop, argument/return classification, stack protocol, and register ownership.                               |
| 16      | [chapter-16-object-format.md](chapter-16-object-format.md)                       | Emitted artifacts, ELF sections, symbols, relocations, deterministic output, and object-format boundaries.                         |
| 17      | [chapter-17-optimization-modes.md](chapter-17-optimization-modes.md)             | Optimization modes and the boundary between explicit source behavior and compiler choices.                                         |
| 18      | [chapter-18-check-format-diagnostics.md](chapter-18-check-format-diagnostics.md) | Check mode, formatter behavior, diagnostic formats, editor catalog, and syntax highlighting floor.                                 |
| 19      | [chapter-19-learning-diagnostics.md](chapter-19-learning-diagnostics.md)         | Diagnostic explanations, learning fields, source insights, and teachable compiler feedback.                                        |
| 20      | [chapter-20-editor-integration.md](chapter-20-editor-integration.md)             | Editor/LSP behavior, language-server capabilities, task templates, and debug launch boundaries.                                    |
| 21      | [chapter-21-explain.md](chapter-21-explain.md)                                   | Lowering, effects, storage, and provenance reports that connect source to machine behavior.                                        |
| 22      | [chapter-22-generated-manifest.md](chapter-22-generated-manifest.md)             | Generated/build manifest provenance, declared inputs, host/tool facts, and artifact facts.                                         |
| 23      | [chapter-23-debug-info.md](chapter-23-debug-info.md)                             | Debug information goals, DWARF sections, DIEs, locations, and determinism.                                                         |
| 24      | [chapter-24-scale.md](chapter-24-scale.md)                                       | Scale measurement, deterministic rebuild benchmarking, and non-goals.                                                              |
| 25      | [chapter-25-compilation-phases.md](chapter-25-compilation-phases.md)             | Compilation phase products, semantic fact ownership, dependency rules, and rendering compatibility adapters.                       |

## Appendices

| Appendix | File                                                                       | Purpose                                                                                                    |
| -------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A        | [appendix-a-ir.md](appendix-a-ir.md)                                       | Compiler IR, SSA, effect representation, verifier invariants, register allocation, and lowering internals. |
| B        | [appendix-b-grammar.md](appendix-b-grammar.md)                             | Formal grammar, lexical rules, parsing forms, reserved syntax, and conformance.                            |
| C        | [appendix-c-doc-example-contracts.md](appendix-c-doc-example-contracts.md) | Documentation example categories and normative example conventions.                                        |
