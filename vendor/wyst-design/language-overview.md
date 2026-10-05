---
title: "Language Overview"
group: reference
section: language
order: 100
summary: "A concise map of the Wyst language and compiler."
---

# Language Overview

Wyst is a compiled systems language for AArch64.

Wyst source can describe ordinary computation and target-specific machine operations.
The compiler checks the source, builds typed IR, and creates the selected artifact.

This topic is a map of the language.
The linked reference topics define each subject.

## Source Structure

A project manifest selects source roots, an artifact, and a target profile.
See [Project Builds](project-builds.md).

A source file can contain one or more named module sections.
Project builds require exactly one module section in each source file.
Each following declaration belongs to the current module section.
Multiple files can contribute sections with the same module name.
Imports connect modules through explicit names.
See [Modules and Symbol Boundaries](modules-and-symbol-boundaries.md).

The formal lexical and grammar rules are in [Formal Grammar](formal-grammar.md).

## Declarations and Values

Wyst provides these main declaration groups:

| Group | Forms | Owning reference |
| --- | --- | --- |
| Values and storage | `const`, `var`, arrays, slices, addresses, and aggregates | [Type System](type-system.md) |
| Named types | nominal carriers, `struct`, `bitstruct`, and `enum` | [Type System](type-system.md) |
| Static abstractions | `interface`, `impl`, and interface-constrained generics | [Interfaces and Implementations](interfaces-and-implementations.md) |
| Code | `fn`, `label`, `inline fn`, and external declarations | [Functions and Control Flow](functions-and-control-flow.md) |
| Hardware | `system_register`, `register_map`, and `mmio` | [Semantic Operations and Hardware Declarations](semantic-operations.md) |
| Target structures | `vector_table` and `trap_frame` | [AArch64 Exception Vectors and Trap Frames](exception-vectors-and-trap-frames.md) |
| Placement | named `layout`, regions, sections, entries, and symbols | [Named Layouts and Placement](named-layouts-and-placement.md) |

Expressions include literals, names, calls, field access, indexing, conversion operations, and operators.
See [Operators and Evaluation](operators-and-evaluation.md).

## Functions and Control Flow

Functions use typed parameters and results.
Parameters can use explicit register placement where the language permits it.

Statements include conditionals, loops, `switch`, transfers, local bindings, and expression statements.
Some declarations use `never` to state that control does not return.

Checked assembly validates cataloged AArch64 instruction forms and declared operands.
See [Checked Assembly](checked-assembly.md).

## Effect System

An effect is a compiler-known category for an observable or target-sensitive operation.
The compiler infers effects through function and label bodies.
Calls add the effects of their possible targets.

`#[deny_effects(...)]` can apply to a module section, function, or label.
The compiler rejects a body when its inferred effects include a denied effect.

Checked assembly gets its effects from the validated instruction rows.
Effect names and operation mappings are in [Semantic Operations and Hardware Declarations](semantic-operations.md).
Typed IR effect representation is in [Intermediate Representation](intermediate-representation.md).

## Memory and Storage

Address types distinguish normal, volatile, MMIO, and atomic storage uses.
The compiler applies the checks for each address type and operation.

[Memory Model](memory-model.md) defines memory access and ordering rules.
[Storage and Allocation](storage-and-allocation.md) defines runtime storage and resource constructs.

These topics state the exact checks and limitations.
This overview makes no additional memory-safety or undefined-behavior guarantee.

## Machine Operations

Sealed core modules provide compiler-known operations.
These operations cover atomics, barriers, CPU operations, cache operations, traps, and system registers.

The selected target profile controls operation availability.
See [Semantic Operations and Hardware Declarations](semantic-operations.md) and [Target Profiles and Requirements](target-profiles.md).

Explicit SIMD types and operations are in [SIMD](simd.md).
Scheduling constructs are in [Scheduling and Suspension](scheduling-and-suspension.md).

## ABI and Artifacts

Wyst Native and AAPCS64 are the calling-convention families.
See [ABI Specification](abi.md).

Project builds select an artifact kind and layout.
Executable, benchmark, and fixture builds emit static AArch64 ELF files.
Static-library builds emit archives and semantic-module-interface companion files.
See [Artifact and Object Formats](artifact-and-object-formats.md).

Built-in target profiles are a closed compiler-owned set.
Their facts are in [Target Profiles and Requirements](target-profiles.md).
Compiler-validated boot entry rules are in [Entry Contracts](entry-contracts.md).

## Compiler Processing

The compiler processes source through parsing, semantic analysis, typed IR, verification, and backend emission.
[Compiler Pipeline](compiler-pipeline.md) describes this flow.

[Intermediate Representation](intermediate-representation.md) defines typed IR structures.
[Optimization](optimization.md) defines optimization behavior.

Compiler inspection reports expose selected lowering and semantic facts.
See [Compiler Inspection Reports](inspection-reports.md).

## Tools

The compiler provides checking, formatting, diagnostics, and editor services.

- See [Check, Format, and Diagnostics](check-format-and-diagnostics.md) for check and format behavior.
- See [Diagnostic Explanations and Source Actions](diagnostic-explanations.md) for diagnostic explanations.
- See [Editor Integration](editor-integration.md) for editor integration.
- See [Debug and Unwind Information](debug-and-unwind.md) for debug information.
