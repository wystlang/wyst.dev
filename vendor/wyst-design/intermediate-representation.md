---
title: "Intermediate Representation"
group: appendix
order: 710
summary: "Current typed IR structures, verification rules, rendering, and backend boundary."
---

# Intermediate Representation

This appendix describes the typed intermediate representation (IR) in
`wync`. The IR is an internal compiler product. It is not a source language or
an input format.

For the compiler pipeline, see [Compiler Pipeline](compiler-pipeline.md).
For source types and memory rules, see [Type System](type-system.md) and
[Memory Model](memory-model.md).

Static interfaces are frontend constraints, not IR entities. Concrete generic
materialization selects each implementation and rewrites every qualified
operation call to an ordinary direct call before IR construction. `ModuleIr`
therefore has no static-interface type, value, witness, metadata argument, or
call operation. See [Interfaces and Implementations](interfaces-and-implementations.md).

## IR lifecycle

The compiler builds IR from one instantiated source tree and its checked
semantic facts. It can also use one checked layout and selected target facts.

The production path is:

```text
checked source + checked layout + target facts
    -> ModuleIr
    -> structural verification + memory analysis
    -> VerifiedIr
    -> artifact reachability
    -> type-layout facts + callable ABI facts
    -> AArch64TextImage
    -> native objects and ELF artifact
```

Artifact reachability verifies the IR again after it changes the module.
It also recomputes the memory-safety report.

## Stable identifiers

The IR uses small typed identifiers:

| Identifier | Use |
|---|---|
| `SymbolId` | A declaration in the module symbol table |
| `BlockId` | A basic block in one function |
| `ValueId` | A value definition in one function |
| `StringId` | An interned string literal |

Block and value identifiers are zero-based indexes. Their order in the owning
vector must match their numeric value. A function-local identifier is not
valid in another function.

## Module IR

`ModuleIr` is the top-level typed product. It contains these groups of data:

| Group | Contents |
|---|---|
| Source identity | Source path, size, line count, module name, and source-section ownership |
| Target facts | Authenticated AArch64 target, target features, cache-line width, entry contract, measurement counter, execution environment, device-memory ranges, and per-CPU contract |
| Layout facts | Selected layout identity, entry, image base, regions, sections, and layout constants |
| Type facts | Structure and bitstructure layouts, nominal carrier layouts, enum representations, and materialized sum facts |
| Linkage | Internal and external functions, external globals, imports, exports, and symbol resolutions |
| Code and data | Functions, globals, strings, exception vectors, and init calls |
| Callable facts | Checked signatures, attributes, effect-bound authority, context summaries, and inline identities |
| Artifact facts | Verification roots, required services, and retained generic instances |
| Semantic records | Terminal-type, hardware-object, suspension, handler, and operation records |

The symbol table stores the source name, the module-qualified semantic name,
the symbol kind, and the source span. Symbol kinds include functions,
constants, globals, structures, enums, bitstructures, labels, exception-vector
entries, and init calls.

Globals have a symbol, an IR type, an optional initializer, attributes, and a
storage class. The active storage classes are ordinary module storage and
per-CPU storage.

## IR types

Each value has one `IrType`. The active type forms are:

| Type form | Stored information |
|---|---|
| `Void`, `Bool`, `String` | Scalar identity |
| `Int` | Signedness and bit width |
| `Float` | Bit width |
| `Pointer` | Pointee type plus volatile and MMIO qualifiers |
| `FunctionPointer` | Calling convention, parameter contracts, result contract, effect bound, trust bound, and concurrency contract |
| `Array` | Element type and known or symbolic length |
| `Vector` | Element type and known or symbolic lane count |
| `Slice` | Element type |
| `MaybeUninit` | Contained type |
| `Atomic` | Atomic element type |
| `Tuple` | Named fields and their types |
| `Enum` | Nominal name, variants, tag type, and payload layout |
| `Bitfield` | Nominal name and backing type |
| `Named` | A retained nominal type name |

`Int` retains every source value width from `u1` through `u64` and `i2` through
`i64`; it does not round the width to a native type. Layout queries separately
select the smallest 8-, 16-, 32-, or 64-bit storage carrier. A typed bitfield
integer carrier must have exactly the field width, so `BitfieldInsert` requires
ordinary IR type identity rather than a separate low-bit range proof.

An array length is `Known(u64)` or `Symbolic(String)`. A function-pointer type
also stores parameter modes, `noescape` flags, register pins, and indirect-read
flags. The callable result distinguishes void, never, and a value result.

`IrType::Atomic` represents the source type `atomic<T>`. Ordinary loads and stores cannot remove
the atomic wrapper. Atomic value operations use one of these memory orders:
`Relaxed`, `Acquire`, `Release`, `AcqRel`, or `SeqCst`.

## Constants

`ConstIr` has these forms:

- Integer and Boolean values.
- An interned string reference.
- A symbol address with an addend.
- A per-instance offset with an addend.
- A slice constant with data and length.
- Array and structure aggregates.
- An enum tag with an optional payload.

The verifier checks a structured constant against its declared IR type and its
retained layout facts.

## Functions

`FunctionIr` contains a symbol, semantic name, display name, code kind,
signature, blocks, values, regions, effects, attributes, register pins, and a
source span.

The code kind is one of:

- `Function`
- `Label`
- `ExceptionVectorSlot`

The signature stores parameters, the callable result, permitted entry levels,
the effect bound, the trust bound, an optional interactive protocol, and the
concurrency contract. Each parameter stores its name, type, mode, optional
register pin, `noescape` flag, indirect-read flag, and source span.

Function attributes include visibility, export state, calling convention,
naked state, inline state, schedule mode, cold state, section, alignment, frame
constraints, and exact-code constraints. These records are inputs to later
checks. They do not contain generated instructions.

`FunctionEffects` records whether a function contains assembly, whether it has
a volatile access, the direct callees, and whether it has indirect calls.

## Regions and schedule mode

A `RegionIr` names a group of blocks and values. Its schedule mode is
`Standard` or `Source`.

Each value also stores its schedule mode. The verifier checks that function,
region, block, and value schedule facts agree. A source-scheduled region keeps
the required value order for the backend scheduler.

## Blocks and values

A `BlockIr` contains:

- Its `BlockId` and name.
- An ordered list of `ValueId` definitions.
- One optional terminator during construction.
- A source span.

Verification requires every retained block to have a terminator.

A `ValueIr` contains:

- Its `ValueId`.
- Its owning `BlockId`.
- Its `IrType`.
- Its `ValueKind`.
- Its schedule mode.
- Its source span.

The active value operations are grouped below.

| Group | Operations |
|---|---|
| Definitions and scalar work | Parameters, local binds, constants, symbol references, unary operations, binary operations, select, phi, casts, and bit truncation |
| Initialization | Indeterminate reads, typed writes to `MaybeUninit` storage, and zero initialization |
| Memory | Load, store, endian load, endian store, address-of, stack address, trap-frame address, per-instance address or offset, and typed address calculation |
| Descriptors and aggregates | Slice construction, slice fields, tuple, array, vector, and structure construction, and field projection |
| Nominal values | Bitfield extract or insert, enum construction or projection, and field offsets |
| Calls and boundaries | Direct calls, indirect calls, intrinsics, and strand-suspension boundaries |
| Target operations | System-register reads and writes, checked assembly, and checked-assembly result projection |
| Atomics | Load, store, compare-exchange, fetch arithmetic, fetch bitwise work, exchange, bit set, and bit clear |

`Noop` is an ordinary zero-work value. `Unsupported` is a construction marker
for an unsupported operation. The verifier rejects it before code generation.

A general element-address operation stores the base, byte offset, operation
origin, and offset unit. The verifier rejects an element-scaled offset at this
stage because lowering must supply a byte offset.

An endian memory operation stores little-endian or big-endian selection. It
also stores the required alignment, the target unaligned-access rule, and the
possible architectural-fault flag.

## Structural SSA

The function value graph uses structural SSA rules.

- Each `ValueId` has one definition.
- Each value is listed once in its owning block.
- An ordinary operand definition must dominate its use.
- A definition earlier in the same block can be used by a later value.
- Phi values must occur before ordinary values in a block.
- Each phi input names one predecessor block and one value.
- Phi predecessor sets and control-flow predecessor sets must agree.
- Each phi input type must equal the phi result type.
- A terminator operand must be available at the end of its block.

The verifier computes reachability, successors, predecessors, edge counts, and
dominators from the block terminators. It uses these facts only for IR checks.

## Terminators

The active terminators are:

| Terminator | Meaning |
|---|---|
| `Jump` | Transfer to one block |
| `Branch` | Select one of two blocks with a Boolean value |
| `Switch` | Select a case or the default block with an integer-like value |
| `GotoSymbol` | Transfer to a label symbol |
| `Return` | Return no value or one value |
| `Unreachable` | End a path that cannot continue |

Lowering an exhaustive enum match uses one covered arm as the default
destination, so an `N`-variant enum needs at most `N - 1` tag tests. A no-op arm
whose outer binding environment is unchanged transfers directly to the join;
it does not retain a jump-only runtime block. Branch lowering represents a
logical negation by exchanging its successor edges instead of materializing an
intermediate boolean. Source exhaustiveness remains a semantic-checking rule
and is not weakened by these representation choices.

The verifier checks all block and symbol targets. It also checks the branch
condition, switch selector, return type, code kind, and never-returning
contract.

## Semantic authority records

Executable values do not contain all checked program meaning. The IR therefore
keeps typed records beside the value graph.

Module records include:

- Target, execution-environment, layout, and per-CPU contracts.
- Nominal carrier, enum-layout, and materialized-sum records.
- Terminal-type and hardware-object authority maps.
- Callable effect-bound authority and context-stability summaries.
- Linkage resolutions, generic-instance identities, and artifact verify roots.
- Execution-suspension markers, required services, and interactive-handler
  summaries.

Function records include:

- Hardware accesses and semantic operations.
- Checked operations and retained checked-result authority.
- Trusted external slices and indexing obligations.
- Resource transitions, explicit discards, and cleanup execution ranges.
- Interactive terminal commitments and callable contract checks.
- Inline expansion, concurrency guard, and suspension-boundary records.
- Authenticated optimizer transformation records for changes already made to
  the value graph.

The verifier joins each record to its exact symbol, value, type, source span,
or target contract. Backend consumers use these records directly. They do not
infer them from an instruction sequence.

## Verification

`ModuleIr::verify_with_memory_safety` performs two operations:

1. It runs the typed structural verifier.
2. It builds a `MemorySafetyReport` and checks that the report is complete.

The structural verifier checks these areas:

- Stable symbol, block, and value identity.
- Linkage, callable signatures, entry rules, effects, and context summaries.
- Type layouts, storage contracts, atomics, target operations, and assembly.
- Value operands, result types, aggregate fields, calls, and terminators.
- Structural SSA, source schedule facts, register-pin conflicts, and naked
  function restrictions.
- Semantic operation, checked operation, hardware access, suspension, and
  concurrency records.
- Exception vectors, init calls, required services, and artifact roots.

The memory report classifies each typed memory obligation. A classification
contains facts for bounds, extent, alignment, initialization, and lifetime.
It can also contain a range-bounds result for one indexing obligation.

Report completeness requires one classification for each obligation. It also
requires each stored range-bounds result to name exactly one range obligation.
The production build then rejects an index or range when its required bounds
are not proved.

`VerifiedIr` owns the verified module, its memory report, and an optional
artifact-reference graph. Backend entry points accept `VerifiedIr` or products
that were derived from it.

## IR rendering

Run this command to print the verified IR:

```sh
wync --emit-ir path/to/module.wyst
```

Use `--target <target-profile>` after the input when the source requires a
target selection.

The command parses and checks the Wyst source, builds `VerifiedIr`, and writes
`ModuleIr::render()` to standard output. The renderer includes module facts,
declarations, functions, blocks, values, semantic records, and memory
classifications.

The rendered text is output only. `wync` has no command that parses rendered
IR. The compiler does not use this text as a build input, and it does not
provide a render-and-parse round trip.

`render_function(SymbolId)` is the internal function-level form. It renders an
internal or external function when the symbol exists.

## Backend boundary

The backend derives `CurrentTypeLayoutFacts` from `VerifiedIr`. It then derives
`CallableAbiFacts` from the verified module and those layout facts.

Machine lowering receives:

- The verified module.
- Current type-layout facts.
- Callable ABI facts.
- Selected build-target facts.
- Source and layout source files.
- Artifact policies.

Machine lowering checks that the authenticated AArch64 target in the IR equals
the selected build target. It then produces `Aarch64TextImage`.
`Aarch64MachineCode` wraps that image with the authenticated target and the
artifact policies.

Native-object and ELF assembly occur after this boundary. These products can
use the verified IR, machine image, layout, placement, semantic module
interface, and artifact policy products. They do not change the meaning of the
typed IR.
