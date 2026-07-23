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

The optimizer is part of the compiler build identity. Given the canonical
inputs in Chapter 1, every admitted transformation, tie, and emitted byte is
reproduced exactly. `machine`, `verified`, and `hardened` are explicit safety
policies and remain orthogonal to optimization.

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
- the compiler/optimizer schema identity;
- source and definition provenance, including nested inlining parents; and
- the before/after dependency needed to reproduce the decision.

The current optimizer schema is `wync.optimizer.a64.v1`. Unknown decision,
proof, or schema names are invalid IR. Reports project these authenticated
records; they do not create or upgrade them.

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
- operation identities, transition sets, terminal payload movement, progress
  ceilings, recovery, and cleanup; and
- explicit safety and hardened instrumentation selected by their catalogs.

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

### 3.1 Current reviewed bounds

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
linear oracle is available for differential validation but is not a production
pipeline or artifact identity.

## 4. Typed transformation rules

### 4.1 Canonicalization and propagation

Pure constants, casts, comparisons, addressing components, and local bindings
may be canonicalized or propagated when their typed value, provenance, and
fault behavior are identical. Volatile, atomic, MMIO, barrier, checked-assembly,
suspension, cleanup, and semantic-operation records are not reconstructed from
instruction patterns and are not removed as pure values.

### 4.2 Scalar replacement

A compiler-created operation outcome may be scalar-replaced only when every
incoming value is an authenticated construction of the same canonical outcome
type and the consumer is a compiler-origin tag or payload projection. Tag and
payload phis use the exact predecessor edges of the original value. A missing
payload, aggregate/cross-component projection, cleanup-bearing edge, explicit
source projection, or incompatible layout retains the ordinary aggregate.

The Native direct-result component rules remain those of Chapter 15. Narrow
components are zero-extended, absent components are zero, and layout offsets
remain authoritative. This is not an operation-specific ABI.

### 4.3 Branch and operation-tag fusion

When an internal operation is expanded into its sole typed consumer, its
terminal transition edge may feed the consumer arm directly. Fusion requires
the exact closed transition set, exact predecessor environment, exact payload
type, and no intervening observable effect or cleanup. Invalid-tag edges remain
unreachable facts. Operation identity, terminal label, payload ownership, call
site, definition site, and nested expansion parent remain in authenticated IR
provenance even when no tag value or dispatch instruction remains.

### 4.4 Compiler-selected internal inlining

Arguments are evaluated once, left to right, before the expansion boundary.
Parameters bind those exact values. All returns and operation terminals join
the caller with their original cleanup depth and predecessor environment.
Nested calls use the callee's qualified-name, semantic-type, effect-authority,
and operation context. Cycles are detected by canonical symbol identity.

Source `#[inline]` remains a semantic mandatory-expansion contract and is
distinguished from `internal_inline` in the expansion record. Compiler-selected
inlining is never inferred from a function name.

### 4.5 Call, frame, and unreachable-work elimination

After all direct uses of an internal body expand, the emitter removes its call,
call-preservation work, frame, and out-of-line bytes unless the symbol is
exported, address-taken, an entry/init/verification root, or otherwise has an
authenticated retention reason. Work made unreachable by the admitted
expansion or fused terminal edge is removed in canonical block/value order.
This rule does not authorize program-wide or cross-object dead stripping.

## 5. Debug, reports, and artifacts

Debug information attributes expanded instructions to the original definition
and call site and preserves nested parents. Explain output exposes the decision,
proof, cost, optimizer schema, effects, and value range. Semantic interfaces and
final-image records preserve operation and callable identities needed by their
current schemas, but contain no optimization selector or mode identity.

Generated manifests, benchmark reports, release evidence, cache keys, and final
artifact identities contain the effective safety/debug/unwind/frame and target
inputs they actually own. They do not serialize a fixed or user-selected
optimization policy.

## 6. Typed-operation kernel control

The checked comparison at
`wync/tests/fixtures/compiler-efficiency/typed-operation-kernel-control/` runs
typed operations and retained modernization through this same production
pipeline. Its generator-owned authority is
[`typed-operation-kernel-control-budget-v1.json`](typed-operation-kernel-control-budget-v1.json).

On both observed success and failure paths, the typed variant may have no
positive delta in text bytes, non-NOP instructions, calls, branches, stack
loads, stack stores, or frame bytes. The fixture also authenticates operation
identity, transitions, effects, cleanup, debug provenance, explanations,
build-twice bytes, and QEMU output.

## 7. Withdrawn spellings

There is no optimization command option or manifest clause. Stale options and
clauses are ordinary unknown input and are rejected without aliases or ignored
fallback. The abandoned dotted size policy has no reserved, deprecated, or
audited spelling. The undotted word `size` remains an ordinary identifier and
retains its existing contextual uses in layout syntax.

## 8. Relationship to scheduling and hardening

`schedule source` is a source-level compiler-ordering boundary, not an
optimizer selector. `schedule.standard` permits only transformations that meet
this chapter's proof and preservation contract. Hardened checks are selected
solely by the hardening catalog; they may be eliminated only by an authenticated
hardening-equivalent rule, never merely because ordinary optimized code would
be smaller or faster.
