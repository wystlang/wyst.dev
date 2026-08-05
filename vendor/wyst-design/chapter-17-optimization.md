---
title: "Chapter 17: Deterministic Optimization"
group: chapter
chapter: 17
order: 17
summary: "The universal target-aware optimizer and its proof, cost, provenance, and behavior boundaries."
---

# Chapter 17: Deterministic Optimization

Wyst has one production optimizer. It is always active, deterministic,
target-aware, and performance-first. There is no source, command-line,
manifest, interface, object, cache, report, or debug selector for choosing an
optimization mode. Compiler work may be hidden; runtime behavior may not be.

The current compiler has one optimizer. Given the canonical inputs in Chapter
1, every admitted transformation, tie, and emitted byte is reproduced exactly.
Optional per-category artifact safety diagnostics remain orthogonal to
optimization and are never code-generation inputs.

Explicit artifact hardening is a post-optimization transform governed by the
closed [`hardening-catalog.tsv`](hardening-catalog.tsv). The ordinary optimizer
may prove a catalog obligation before insertion; a proved obligation is
omitted. Once inserted, a generated check is an indivisible scheduling barrier
directly before its protected operation. It may not be eliminated, folded,
moved, coalesced, or deduplicated. Checked assembly is indivisible and never
receives instrumentation.

Hardening does not widen callable contracts. A generated failure edge is the
ordinary terminal `trap` effect, so the protected function and every retained
source caller contract must already admit `trap`. Unsupported checks,
unavailable operands, naked-function insertion, and incompatible target
requirements are compile-time errors rather than approximations.

## 1. Authority and phase boundary

An optimization proof is a typed compiler-owned fact derived from verified
semantic facts, typed IR, the selected Native or AAPCS64 ABI product, and the
authenticated A64 target catalogs. Diagnostic text, explain projections,
terminal reports, serialized inspection products, and unauthenticated safety
evidence are never proof inputs.

Each admitted transform records:

- the closed decision name;
- the proof predicate and its semantic subjects;
- the target cost and deterministic tie rule;
- source and definition provenance, including nested inlining parents; and
- the before/after dependency needed to reproduce the decision.

Unknown decision or proof names are invalid IR. Reports project these
authenticated records; they do not create or upgrade them.

Final A64 function text carries a corresponding instruction-selection record
for every body word. The record joins the final word to its active encoding,
authority, and semantic identities; its canonical mnemonic; an exact retained
source-form identity when the word came from checked or target-structural
assembly; its typed-IR subject and dependencies; source/definition/inline
provenance; the one-instruction/four-byte target cost; and the deterministic
catalog-identity/source-order tie rule. Text construction reauthenticates that
product against the active catalog. A stale word, identity, source form,
dependency, provenance, cost, or tie is invalid compiler output.

## 2. Preservation contract

Every transform preserves source-observable values, effects, effect order,
fault behavior, cleanup order, ownership transfers, access widths, address
provenance, and debug meaning. In particular it preserves:

- volatile and MMIO accesses;
- atomic operations and memory orders;
- barriers and cache/TLB maintenance;
- checked-assembly instruction and fixup contracts;
- suspension and context-stability boundaries;
- Native and AAPCS64 boundaries, exported symbols, address identity, and
  separate-compilation contracts;
- interactive identities, offered protocols, terminal payload movement,
  optional handler ceilings, recovery, and cleanup; and
- optional safety diagnostics, which remain outside transformation and machine
  output.

Optimization never inserts hidden allocation, synchronization, retry, I/O,
cleanup, traps, runtime fallbacks, or scalar-to-SIMD widening. It never treats
absence of compiler-exploitable undefined behavior as permission to invent a
value or erase an observable event.

## 3. Cost model and deterministic ties

Costs are computed from typed IR and the authenticated A64 target, never from
host timing, profile feedback, hash-table iteration, or report data. The
ordered objective is:

1. remove calls, frames, spills, loads/stores, and control scaffolding on the
   proved hot path;
2. reduce non-NOP instructions and text bytes;
3. avoid increased maximum stack and spill demand;
4. bound duplicated typed work and text growth; and
5. preserve source order on an exact tie.

A candidate is rejected when a required fact is absent or when a higher-priority
resource is made worse without a reviewed target-specific benefit. Stable
symbol identity, source position, case order, and canonical type identity are
the only tie inputs.

### 3.1 Reviewed Bounds

Compiler-selected internal inlining is limited to a Native, non-exported,
non-public, body-visible callable with an authenticated `effects(none)` bound.
The body cost is at most 24 recursively counted statements. Loops, cleanup,
checked assembly, progress reporting, schedule regions, nonlocal jumps, special
sections/alignment, exact-code or frame contracts, naked/noreturn entries,
result-register contracts, foreign calls, and progress operations reject the
candidate. Recursive expansion falls back to the ordinary call at the cycle
edge. A caller may carry at most 4096 authenticated expansion records, including
source-mandated expansion; exhaustion is a deterministic compiler resource
error.

Inlining may duplicate at most the admitted 24-statement body per expanded
call site. The ordinary ABI and register allocator still prove final frame,
spill, and exact-code constraints after transformation; a transform cannot
bypass them. Address-taken internal definitions retain an out-of-line body,
while direct calls may still be expanded. Exported, imported, and
separate-compilation definitions are not compiler-selected candidates.

For A64 switches, zero or one effective case uses linear source-shaped control.
Two or more effective cases use the typed dispatch terminator. The test-only
linear oracle is available for differential validation but is not part of the
production pipeline.

## 4. Typed transformation rules

### 4.1 Canonicalization and propagation

Pure constants, casts, comparisons, addressing components, and local bindings
may be canonicalized or propagated when their typed value, provenance, and
fault behavior are identical. Volatile, atomic, MMIO, barrier, checked-assembly,
suspension, cleanup, and semantic-operation records are not reconstructed from
instruction patterns and are not removed as pure values.

Current function-local canonicalization includes typed integer and boolean
constant folding, transparent same-type casts, unary and algebraic identities,
constant or identical-arm selects, and identical-input phis. Integer folds use
the language's width wrapping, defined divide/remainder-by-zero behavior, and
modulo shift counts. Runtime floating-point operations are not folded because
their `fp_state` effect remains observable. Distinct symbolic addresses are not
folded unequal because final linking may alias them.

Logical copy, transfer, exclusive-loan, terminal-obligation, and returned-view
facts remain authoritative even when their physical realization disappears.
The optimizer may keep copyable values in registers, coalesce homes, and elide
loads, stores, or argument copies only after proving identical storage identity,
alias behavior, last use, failure behavior, and left-to-right accounting. It may
not turn a copy into a source-invalidating move or resurrect a transferred
binding.

### 4.2 Scalar replacement

A compiler-created interactive outcome may be scalar-replaced only when every
incoming value is an authenticated construction of the same canonical outcome
type and the consumer is a compiler-origin tag or payload projection. Tag and
payload phis use the exact predecessor edges of the original value. A missing
payload, aggregate/cross-component projection, cleanup-bearing edge, explicit
source projection, or incompatible layout retains the ordinary aggregate.

The Native direct-result component rules remain those of Chapter 15. Narrow
components are zero-extended, absent components are zero, and layout offsets
remain authoritative. This is not an interactive-specific ABI.

### 4.3 Branch and interactive-tag fusion

When an internal interactive function is expanded into its sole typed
consumer, its terminal offer edge may feed the consumer arm directly. Fusion requires
the exact closed transition set, exact predecessor environment, exact payload
type, and no intervening observable effect or cleanup. Invalid-tag edges remain
unreachable facts. Interactive identity, terminal label, payload ownership, call
site, definition site, and nested expansion parent remain in authenticated IR
provenance even when no tag value or dispatch instruction remains.

### 4.4 Compiler-selected internal inlining

Arguments are evaluated once, left to right, before the expansion boundary.
Parameters bind those exact values. All returns and interactive terminals join
the caller with their original cleanup depth and predecessor environment.
Nested calls use the callee's qualified-name, semantic-type, effect-authority,
and interactive context. Cycles are detected by canonical symbol identity.

Source `#[inline]` remains a semantic mandatory-expansion contract and is
distinguished from `internal_inline` in the expansion record. Compiler-selected
inlining is never inferred from a function name.

### 4.5 Call, frame, and unreachable-work elimination

After complete semantic checking and generic materialization, the artifact path
builds the typed reference graph defined by Chapter 16 and retains exactly its
root closure. It removes unreachable declarations, generic concrete bodies,
foreign imports, interface records, object contributions, and archive members
before hardening, machine lowering, object emission, and final linking. Static
library companion files separately preserve public semantic API records without
turning `pub` into a native-code root. Reference execution and semantic/editor
inspection continue to consume the complete verified program.

After all direct uses of an internal body expand, the emitter also removes its
call, call-preservation work, frame, and out-of-line bytes unless the graph has
an authenticated retention reason. Work made unreachable by an admitted
expansion or fused terminal edge is removed in canonical block/value order.
Alignment and cache isolation apply only to retained declarations. Debug
records never create reachability. Counter reads, volatile/MMIO operations,
barriers, checked assembly, and other effects remain ordered under §2 and
source scheduling boundaries inside every retained function.

## 5. Debug and reports

Debug information attributes expanded instructions to the original definition
and call site and preserves nested parents. Explain output exposes the decision,
proof, cost, effects, and value range.

## 6. Relationship to scheduling and hardening

`schedule source` is a source-level compiler-ordering boundary, not an
optimizer selector. `schedule.standard` permits only transformations that meet
this chapter's proof and preservation contract. Hardened checks are selected
solely by the hardening catalog; they may be eliminated only by an authenticated
hardening-equivalent rule, never merely because ordinary optimized code would
be smaller or faster.
