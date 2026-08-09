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
optimization mode. Compiler-created realization work may disappear; authored
call, control-flow, and effect boundaries may not.

The current compiler has one optimizer. Given the canonical inputs in Chapter
1, every admitted transformation, tie, and emitted byte is reproduced exactly.
Optional per-category artifact safety diagnostics remain orthogonal to
optimization and are never code-generation inputs.

Explicit artifact hardening is a post-optimization transform governed by the
closed [`hardening-catalog.tsv`](catalogs/language/hardening-catalog.tsv). The ordinary optimizer
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
- canonical storage projections and every authenticated `preserves` or
  `unchanged` postcondition, including generation, lifetime, usable extent,
  access authority, observable representation, and raw-storage epochs;
- interactive identities, offered protocols, terminal payload movement,
  optional handler ceilings, recovery, and cleanup; and
- optional safety diagnostics, which remain outside transformation and machine
  output.

Optimization never inserts hidden allocation, synchronization, retry, I/O,
cleanup, traps, runtime fallbacks, or scalar-to-SIMD widening. It never treats
absence of compiler-exploitable undefined behavior as permission to invent a
value or erase an observable event. It also never turns an ordinary call,
branch, result variant, or storage postcondition into communication,
serialization, buffering, publication, or protocol progress.

For example, optimization must retain the same accepted storage proof without
adding a runtime representation for that proof:

<!-- wyst-contract: check-pass -->
```wyst
module optimizer_storage_preservation

struct Buffer { bytes: [2]u8 }

fn bytes(buffer: Buffer) -> []u8 from buffer {
  return buffer.bytes[..]
}

extern "C" fn inspect(buffer: Buffer)
accesses(mut buffer)
preserves(buffer)

fn first(buffer: Buffer) -> u8 {
  const view = bytes(buffer)
  inspect(buffer)
  return view[0]
}
```

## 3. Cost model and deterministic ties

Costs are computed from typed IR and the authenticated A64 target, never from
host timing, profile feedback, hash-table iteration, or report data. The
ordered objective is:

1. remove compiler-created temporaries, copies, spills, loads/stores, and
   control scaffolding while retaining authored calls and control flow;
2. reduce non-NOP instructions and text bytes;
3. avoid increased maximum stack and spill demand;
4. bound duplicated typed work and text growth; and
5. preserve source order on an exact tie.

A candidate is rejected when a required fact is absent or when a higher-priority
resource is made worse without a reviewed target-specific benefit. Stable
symbol identity, source position, case order, and canonical type identity are
the only tie inputs.

### 3.1 Source-directed expansion bound

Inlining occurs only for a function explicitly marked `#[inline]`. The marker
is a mandatory source contract, not a cost hint. An unmarked call remains a
call regardless of linkage, visibility, body size, effect bound, or estimated
machine cost. A caller may carry at most 4096 authenticated source-mandated
expansion records; exhaustion is a deterministic compiler resource error.

The ordinary ABI and register allocator still prove final frame, spill, and
exact-code constraints after expansion; the source contract cannot bypass
them. Address-taken inline definitions retain an out-of-line body when their
identity is needed. Exported, imported, and separate-compilation boundaries
retain the callable body and ABI required by their contracts.

For A64 switches, zero or one effective case uses linear source-shaped control.
Two or more effective cases use the typed dispatch terminator. The test-only
linear oracle is available for differential validation but is not part of the
production pipeline.

### 3.2 Mandatory source-directed unrolling

`#[unroll]` is a mandatory statement contract, not a profitability hint and
not an optimizer mode. The bare spelling requests complete expansion of the
authenticated iteration space:

<!-- wyst-contract: sketch -->
```wyst
const msg: [_]u8 = "Hello, World!\n"

#[unroll]
for byte in msg {
  uart_write(byte)
}
```

The iterable may be a fixed array, including one whose element values exist
only at runtime, or a slice whose exact length is authenticated at compile
time. The body is expanded exactly once per element, in order, and each
expansion receives the loaded element as its immutable binding. A fixed-array
constructor may feed those bindings directly when that preserves the same
value behavior. A slice descriptor with only a runtime length is rejected.

A constant end-exclusive integer range is also eligible:

<!-- wyst-contract: sketch -->
```wyst
#[unroll]
for index in 2 ..< 5 {
  visit(index)
}
```

Both bounds retain their left-to-right source evaluation and must resolve to
compile-time integer values. The expansion binds `2`, `3`, and `4` in order.
An ordinary range with no attribute remains an ordinary runtime loop.

The optional `iterations` and `max_iterations` arguments are proof constraints,
not heuristic controls:

<!-- wyst-contract: sketch -->
```wyst
#[unroll(iterations = 3, max_iterations = 4)]
for index in 2 ..< 5 {
  visit(index)
}
```

- `iterations = N` requires the authenticated iteration count to equal `N`.
- `max_iterations = N` requires that count to be no greater than `N`.
- The arguments may appear separately or together and must be constant `u64`
  values.

Neither argument supplies a missing proof. In particular,
`iterations = N` does not assert that a runtime slice has length `N` or that a
runtime range executes `N` times.

`break` and `continue` are rejected because they would weaken the
complete-expansion contract.

An explicit factor requests partial unrolling without asking the compiler to
choose a factor or remainder strategy:

<!-- wyst-contract: sketch -->
```wyst
#[unroll(factor = 4, remainder = .guarded)]
for byte in view {
  uart_write(byte)
}
```

`factor = N` requires a constant `u64` value of at least 2. It is valid on
fixed-array and slice value iteration, integer ranges, `while`, and `loop`.
The body appears exactly `N` times in the factor-wide lowering. `break` exits
the source loop from any lane. `continue` advances to the next logical
iteration: the next duplicated lane, or the next factor group after the last
lane. These targets preserve source control flow rather than treating the
duplicated bodies as independent loops.

Finite iteration forms use one of three explicit remainder contracts:

- With no `remainder` argument, the compiler must prove the trip count is
  divisible by `factor`; otherwise compilation fails. The grouped loop tests
  once before each complete factor-wide group.
- `remainder = .reject` requests the same lowering and makes the required
  compile-time divisibility proof explicit. An unknown or nondivisible count
  is an error.
- `remainder = .guarded` reevaluates the source continuation condition before
  every duplicated lane. A false lane condition exits without executing that
  lane or any later lane in the group.
- `remainder = .scalar` emits a factor-wide main loop followed by a one-at-a-
  time tail. The main loop first proves that a complete group remains; it does
  not speculatively execute body effects.

An explicit `.guarded` or `.scalar` policy is retained even when a statically
known count happens to be divisible. A runtime range or runtime-length slice
therefore requires one of those two policies. `iterations` and
`max_iterations` may accompany `factor` only when the finite count is actually
known and authenticated; they never insert an assumption or runtime check.

A condition-controlled `while` accepts `factor` with the implicit or explicit
`.guarded` policy. It reevaluates the original condition before every lane;
`.scalar` and `.reject` are inapplicable because there is no separate finite
iteration extent. An unbounded `loop` accepts `factor` but no remainder or
finite-count arguments. Bare `#[unroll]` remains invalid on both forms because
complete expansion is not defined for them. Unmarked loops are never inferred
or heuristically unrolled.

The deterministic compiler-resource ceiling is 4096 complete iterations or
duplicated factor lanes. Exceeding it is a compile-time error, not permission
to select a smaller expansion. A local constant
fixed array has no stable-address promise. If mandatory expansion consumes its
elements and leaves its compiler-created aggregate binding and constructor
without runtime observers, the optimizer records the
`elide_dead_fixed_array` decision and its
`fixed_array_representation+pure+no_runtime_uses` proof before removing that
runtime realization.

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

When a source-marked interactive function is expanded into its sole typed
consumer, its terminal offer edge may feed the consumer arm directly. Fusion requires
the exact closed transition set, exact predecessor environment, exact payload
type, and no intervening observable effect or cleanup. Invalid-tag edges remain
unreachable facts. Interactive identity, terminal label, payload ownership, call
site, definition site, and nested expansion parent remain in authenticated IR
provenance even when no tag value or dispatch instruction remains.

### 4.4 Source-mandated inlining

Arguments are evaluated once, left to right, before the expansion boundary.
Parameters bind those exact values. All returns and interactive terminals join
the caller with their original cleanup depth and predecessor environment.
Nested calls use the callee's qualified-name, semantic-type, effect-authority,
and interactive context. Cycles are detected by canonical symbol identity.

Source `#[inline]` is the sole semantic mandatory-expansion contract. Every
expansion record is `source_mandated`; the compiler never infers permission to
inline from a name, linkage, body size, effect bound, or cost estimate.

### 4.5 Call, frame, and unreachable-work elimination

After complete semantic checking and generic materialization, the artifact path
builds the typed reference graph defined by Chapter 16 and retains exactly its
root closure. It removes unreachable declarations, generic concrete bodies,
foreign imports, interface records, object contributions, and archive members
before hardening, machine lowering, object emission, and final linking. Static
library companion files separately preserve public semantic API records without
turning `pub` into a native-code root. Reference execution and semantic/editor
inspection continue to consume the complete verified program.

After all direct uses of a source-marked body expand, the emitter also removes
its call, call-preservation work, frame, and out-of-line bytes unless the graph
has an authenticated retention reason. Work made unreachable by a mandated
expansion or fused terminal edge is removed in canonical block/value order.
Alignment and cache isolation apply only to retained declarations. Debug
records never create reachability. Counter reads, volatile/MMIO operations,
barriers, checked assembly, and other effects remain ordered under §2 and
source scheduling boundaries inside every retained function.

### 4.6 Source-shaped machine lowering

Machine lowering may choose a more direct instruction recipe for the same
typed operation without changing the function's authored call or control-flow
graph. Current A64 rules include:

- coalescing a loop backedge increment with its phi home so the authored
  increment updates the loop-carried register directly;
- retaining a compiler-created fixed-array stack base across a loop and an
  authored call when all uses are dynamic byte loads, then selecting the
  authenticated `LDRB [base, index]` register-offset encoding;
- pairing adjacent compiler-owned callee-register saves and restores when the
  A64 scaled pair offset is encodable and no checked-assembly preservation
  record requires a distinct instruction;
- folding compiler-owned frame allocation into the frame-record `STP`
  pre-index and frame release into the matching `LDP` post-index only when
  both directions encode, otherwise retaining the matched explicit
  `SUB`/`ADD` sequence;
- feeding a canonical exact-width unsigned load directly to a same-width
  bit-zero named register-map write when the field policies require no other
  preserved, masked, or forced bits;
- using a later explicitly pinned address as the base of an earlier
  nonvolatile same-block store when both globals have proved offsets in the
  same standard `.data` section, the store offset is encodable, and no call,
  intrinsic, assembly, or allocated register use intervenes; and
- materializing an absolute layout symbol with the minimum deterministic
  `MOVZ`/`MOVN`/`MOVK` sequence instead of retaining unresolved relocation
  placeholders;
- laying out compiler-created blocks from a source-mandated inline expansion
  in deterministic fallthrough traces, removing only branch instructions that
  would otherwise jump between expansion scaffolding blocks; and
- materializing a retained register-map base from a source-mandated expansion
  at its first actual access, then reusing it until an ordinary register write
  or call invalidates it.

These are representation choices for compiler-created address and frame work.
They do not infer unrolling for an unmarked loop, merge, unswitch, or delete a
source loop; move an MMIO or volatile access; remove an authored call; or infer
source-level inlining. Only the separate source-mandated `#[unroll]` contract
in §3.2 performs complete value expansion. A missing range, layout, section,
register-liveness, or target-encoding proof retains the ordinary lowering.

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
