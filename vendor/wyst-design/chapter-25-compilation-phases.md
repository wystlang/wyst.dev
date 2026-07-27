---
title: "Chapter 25: Compiler Pipeline"
group: chapter
chapter: 25
order: 25
summary: "The current compiler data flow from source input to reports and artifacts."
---

# Chapter 25: Compiler Pipeline

The compiler is an ordinary Rust data pipeline. Function parameters and return
types describe which results a computation consumes; there is no separate phase
registry, dependency ledger, or fact-ownership metadata to keep synchronized.

This chapter adds no source syntax, CLI mode, ABI rule, object format, or report
kind. It describes the current implementation shape so contributors can find
the relevant code.

## Current Data Flow

The main build path is:

```text
build inputs and source files
  -> parsing and project source graph
  -> compile-time selection and generic instantiation
  -> semantic checking and layout evaluation
  -> IR construction and verification
  -> ABI and AArch64 lowering
  -> register allocation and placement
  -> ELF artifact
```

The concrete build functions live in `wync/src/compiler.rs` and are called
directly by the CLI and test helpers. There is no mutable compiler object because
the pipeline carries no shared state. Small state types are used where they
prevent mixing different representations, such as parsed and instantiated
ASTs, unverified and verified IR, machine images, placement results, and final
artifacts. The compiler alone constructs instantiated ASTs, so downstream code
cannot bypass compile-time selection or generic expansion. A state type should
remain only while that distinction makes the implementation safer or clearer.
These states are concrete compiler-owned types rather than generic product
wrappers; their names and accessors state exactly which representation they
contain.
Checked source and layout states keep each instantiated tree together with the
semantic facts derived from it, so IR construction cannot mix results from
different frontend inputs. A mapped source similarly owns the compiler input
and its original-file spans together; build orchestration does not keep a
second copy of that source beside the map.

## Data Dependencies

A computation receives the values it needs directly. Adding or changing a
language rule therefore requires updating the affected Rust calls and types,
not a parallel dependency table.

Some ordering rules are language semantics rather than pipeline bookkeeping.
For example, compile-time selection and ordinary constant evaluation cannot use
final section addresses because placement has not happened and source meaning
must not depend on backend placement. Those rules are checked where the
language construct is evaluated and diagnosed in terms of that construct.

## Diagnostics

The code that detects an error creates the diagnostic. Text, JSON, and LSP
renderers only present that diagnostic and do not change whether the program is
accepted. Shared rendering helpers exist to keep the formats consistent; they
are not a second semantic authority.

## Reports

Lowering, effects, and storage reports are views over completed compiler
results. Their constructors receive the specific values needed by the current
report. Report data is never passed back into parsing, semantic checking,
lowering, or artifact construction.

This one-way flow follows naturally from the call graph. It does not require a
report-only phase ID, provenance envelope, or runtime dependency check.

## Timing Instrumentation

Timing events are optional observations of host work. Their labels are for
performance investigation only and do not define compiler semantics or a
stable public phase model.
