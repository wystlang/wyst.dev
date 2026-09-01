---
title: "Wyst Language and Compiler Reference"
group: manual
order: 0
---

# Wyst Language and Compiler Reference

This reference describes the source language, target contracts, artifact formats,
compiler behavior, and developer tools supported by Wyst. It is organized by
subject for direct lookup. It is not a tutorial, tour, or sequential course, and
readers do not need to read the topics from beginning to end.

Each topic owns one compiler-facing contract and links to adjacent contracts when
needed. [Source of Truth](source-of-truth.md) explains how conflicts among the
reference, grammar, catalogs, implementation, and tests are resolved.

## Language

- [Wyst Cheat Sheet](cheat-sheet.md) gives a quick, task-oriented guide to
  source, types, control flow, projects, and compiler tools.
- [Language Overview](language-overview.md) maps the source language and compiler.
- [Modules and Symbol Boundaries](modules-and-symbol-boundaries.md) defines module
  identity, imports, visibility, and native symbol boundaries.
- [Type System](type-system.md) defines values, storage types, aggregates, generics,
  abilities, and conversions.
- [Bundled Core Library](core-library.md) defines the current sealed modules and
  their public API.
- [Interfaces and Implementations](interfaces-and-implementations.md) defines
  nominal compile-time operation constraints, explicit conformance, and erasure.
- [Operators and Evaluation](operators-and-evaluation.md) defines expression order,
  operator typing, precedence, and arithmetic results.
- [Functions and Control Flow](functions-and-control-flow.md) defines callable forms,
  statements, labels, register placement, and inline helpers.
- [Outcomes, Progress, and Terminal Control](outcomes-and-progress.md) defines stored
  outcomes, interactive calls, progress, forwarding, and cleanup.

## Memory and Machine Programming

- [Memory Model](memory-model.md) defines typed memory proof, volatile and MMIO
  access, atomics, ordering, and barriers.
- [Storage and Allocation](storage-and-allocation.md) defines caller-owned storage
  and sealed storage transitions.
- [Semantic Operations and Hardware Declarations](semantic-operations.md) defines
  compiler-authenticated operations, hardware declarations, and target services.
- [SIMD](simd.md) defines admitted vector shapes and vector operations.
- [Scheduling and Suspension](scheduling-and-suspension.md) defines compiler
  scheduling regions and suspension boundaries.
- [Checked Assembly](checked-assembly.md) defines typed assembly binders, admitted
  AArch64 source forms, inferred machine behavior, retention, alignment, and
  control transfer.

## Projects and Targets

- [Target Profiles and Requirements](target-profiles.md) defines built-in profiles,
  source requirements, capabilities, and execution-environment facts.
- [Project Builds](project-builds.md) defines manifests, source closure, artifacts,
  and output paths.
- [Named Layouts and Placement](named-layouts-and-placement.md) defines regions,
  sections, placement attributes, layout symbols, and per-CPU templates.
- [Entry Contracts](entry-contracts.md) defines compiler-validated entry selection,
  firmware parameter schemas, and stack transitions.

## Binary Interfaces

- [AArch64 Exception Vectors and Trap Frames](exception-vectors-and-trap-frames.md)
  defines the target-owned vector-table and trap-frame contracts.
- [ABI Specification](abi.md) defines Native and supported AAPCS64 callable
  boundaries.
- [Artifact and Object Formats](artifact-and-object-formats.md) defines static ELF
  executables, static libraries, sections, symbols, and relocations.

## Compiler

- [Compiler Pipeline](compiler-pipeline.md) defines the source-to-artifact and
  source-to-report flows.
- [Optimization](optimization.md) defines admitted IR transformations, required
  expansion, and scheduling.
- [Debug and Unwind Information](debug-and-unwind.md) defines debug policies, DWARF
  output, value locations, line tables, and unwind metadata.

## Tools

- [Check, Format, and Diagnostics](check-format-and-diagnostics.md) defines command
  behavior, diagnostic formats, warnings, and exit status.
- [Diagnostic Explanations and Source Actions](diagnostic-explanations.md) defines
  diagnostic metadata, explanations, suggestions, and source insights.
- [Editor Integration](editor-integration.md) defines the language server,
  Tree-sitter assets, and Zed integration.
- [Compiler Inspection Reports](inspection-reports.md) defines lowering, effects,
  storage, layout, resource, and reference-execution reports.

## Appendices

- [Formal Grammar](formal-grammar.md) provides the lexical and grammar summary.
- [Intermediate Representation](intermediate-representation.md) describes typed IR,
  semantic records, verifier invariants, and rendering.
- [Storage-Preservation Examples](storage-preservation-examples.md) provides
  executable accepted and rejected proof examples.

## Reference Maintenance

The top-level Markdown files above form the reader-facing reference.
[Documentation Example Contracts](documentation-examples.md) is a contributor guide
for checked code blocks and is not part of the reader sequence.

Machine-readable vocabularies belong under [`catalogs/`](catalogs/README.md).
[A64 Compiler-Semantic Catalog](a64-compiler-semantics.md) and
[Generated Atomic Matrix](generated-atomic-matrix.md) are readable views of
compiler-owned data. Pinned third-party inputs and provenance notes live under
[`upstream/`](upstream/).

When the language changes, update the owning compiler behavior, reference topic,
catalog when applicable, and regression tests together.
