---
title: "Wyst Best Practices"
group: guide
order: 20
summary: "Practical guidance for failure handling, bounds, storage, effects, hardware, and validation."
---

# Wyst Best Practices

Use Wyst's explicit contracts to make each boundary easy to inspect: input,
failure, storage, hardware, and external code.

This document applies the [Style Guide](style-guide.md) to common systems
programming decisions. The recommendations depend on the task. The linked
reference topics define the exact language rules and compiler limits.

[Effective Wyst](effective-wyst.md) introduces the language patterns used here
with complete examples.

Each Wyst code block is a complete module. It shows one pattern and must be
checked in a project with the required target configuration; it is not a
standalone executable.

## Choose the failure policy at the boundary

Use a result form that tells the caller what it must decide.

| Situation | Starting point |
| --- | --- |
| A value can be absent without an error | `core.collections.Option<T>` |
| A completed operation returns a value or a recoverable failure | `core.collections.Result<T, E>` |
| A call has a declared progress or terminal outcome protocol | Interactive `offers` and `handle` |
| Continuing would violate an invariant and the caller cannot recover | An explicit terminal policy, such as a fatal trap |

Do not use a sentinel integer when it makes a valid value indistinguishable
from failure. Use an enum payload to retain information the caller needs for
recovery. Avoid a new error wrapper when it adds no useful domain meaning.

### Forward when the caller owns the decision

Use stored `?` to return a `Result` error to the enclosing caller. It continues
with `.Ok` and returns `.Error`. The outer error type must be the same type or
declare one direct `Variant(from E)` relation.

```wyst
module packet.decode

import core.checked
import core.collections { Result }

enum DecodeFailure {
  Bounds(from checked.IndexFailure)
}

fn tag(bytes: []u8, index: u64) -> Result<u8, DecodeFailure> {
  return .Ok(bytes[?index])
}
```

Here the inner `?` checks the index and forwards a bounds failure as
`DecodeFailure.Bounds`. The successful path reads the selected byte.

Use `match` when the current layer must retry, translate a failure, or choose a
fallback. Make loss of information deliberate. If a failed read is supposed
to produce zero, give that policy a name:

```wyst
module packet.defaults

import core.checked
import core.collections { Result }

fn read_byte(bytes: []u8, index: u64) -> Result<u8, checked.IndexFailure> {
  return .Ok(bytes[?index])
}

fn byte_or_zero(bytes: []u8, index: u64) -> u8 {
  return match read_byte(bytes, index) {
    .Ok(value) { value }
    .Error(_) { 0 }
  }
}
```

This fallback is suitable only when the protocol defines zero as the default.
It would hide malformed input in a parser that requires the byte to exist.

Stored `Option` also supports `?` for absence forwarding. An interactive call's
`?` is a separate exact failure-forwarding form; it does not turn the outcome
into a stored `Result`. Use `handle` when the offered protocol requires local
handling of progress, failure, or cancellation. See
[Functions and Control Flow](functions-and-control-flow.md) and
[Outcomes, Progress, and Terminal Control](outcomes-and-progress.md).

### Keep fatal policy explicit

Do not turn routine input, capacity, or device-readiness failures into traps
just to shorten the success path. Use `expect_or_trap` only where fatal
extraction is the intended policy. State the invariant that makes failure
terminal. `must_observe` can require a caller to observe a value, but the API
still needs to explain how to handle it.

## Treat arithmetic and bounds as separate obligations

Fixed-width addition, subtraction, and multiplication wrap. Division by zero
returns zero. These language rules do not establish that an operation is valid
for your application. Check a divisor when zero is invalid, and use checked
operations when overflow must become a failure.

For a range, avoid an unguarded `offset + length <= capacity` test: the sum can
wrap. First establish `offset <= capacity`, then compare `length` with
`capacity - offset`, as in the [Style Guide example](style-guide.md#functions-and-control-flow).

Use ordinary indexing when the compiler can prove the bound. Use a forwarding
checked subscript when a dynamic bound failure belongs to the caller:

```wyst
module packet.window

import core.checked
import core.collections { Result }

fn window(bytes: []u8, lower: u64, upper: u64) -> Result<[]u8, checked.SliceFailure>
  from bytes on .Ok {
  return .Ok(bytes[?lower..<upper])
}
```

The returned slice uses the original storage. `from bytes on .Ok` describes
that relation on success. It does not allocate or extend the backing storage's
lifetime.

Use `core.checked.element` or `core.checked.subslice` when the current layer
must handle a bounds failure and retain the selected place or view. Use
`core.checked.index` or `core.checked.slice_range` when it needs a reusable
scalar proof.

A checked subscript proves bounds only. Usable extent, alignment,
initialization, lifetime, access authority, and concurrency still require their
own evidence. See [Operators and Evaluation](operators-and-evaluation.md),
[Memory Model](memory-model.md), and
[Semantic Operations and Hardware Declarations](semantic-operations.md).

## Preserve types across boundaries

Keep quantities, addresses, and resource identities distinct for as long as
possible. Use the bundled quantity types when they fit the domain. Convert to
a machine representation at the boundary that requires it.

Choose narrowing policy explicitly. `truncate<T>` discards high bits;
`saturate<T>` clamps a supported same-signedness integer narrowing. Use a checked
conversion if out-of-range input must be rejected. A conversion should express
the requirement, not silence a diagnostic.

Use `[]u8` for arbitrary bytes and `string` for validated UTF-8. Validate
external bytes through `core.text.from_bytes` before using them as text. Its
successful string remains a view of the original bytes. Do not reset or reuse
the backing storage while a dependent view is needed.

Use `core.scan` for the supported integer, Boolean, cursor, or fixed-record
parsing tasks. Choose a parser whose accepted input matches the protocol.
For example, scalar integer scanning requires complete input and rejects
whitespace and radix prefixes. Do not assume a parser silently trims input.
See [Bundled Core Library](core-library.md).

## Keep storage ownership visible

Wyst does not supply an implicit heap, garbage collector, or growing container
runtime. Start with storage whose owner and capacity are clear. Pass a caller
buffer when that is sufficient. Use `FixedBuffer` or `Arena` when their explicit
transition and accounting rules solve the problem.

Before choosing an allocation pattern, identify:

- who supplies the backing bytes;
- the required extent and alignment;
- who initializes the value;
- which operation invalidates its views;
- how capacity failure returns control and resource authority.

Use `noescape` when an address, slice, or callable capability must not be
retained by the callee. Use the applicable returned-view contract when a
result depends on parameter storage. Do not describe an address as owned
merely because its numeric bits are available.

### Match the allocation form to the lifetime

`Arena.allocate_value<T>` returns a direct typed address with a compiler-tracked
storage relation. A recorded `ArenaRegion<T>` uses explicit validation when a
durable handle is required. Choose the form for its lifetime contract and
required validation; do not add records by default.

A successful reset invalidates dependent direct views. A successful rewind
invalidates views allocated after the selected checkpoint. A failed reset or
rewind preserves them. End dependent uses before the transition that
invalidates their storage. Checkpoints are last-in, first-out.

Do not use integer conversion or `relens` to recover authority after a storage
transition. Keep typed regions typed, and use byte-region operations for byte
regions. See [Storage and Allocation](storage-and-allocation.md).

### Account for resources on every path

Use `xfer` at an ownership transfer. For a stored resource-bearing `Result`,
forwarding can require `(xfer pending)?`. Handle resource authority returned
inside a rejection value before retrying or leaving the scope.

`no_copy` prevents implicit copying. `must_account` requires an explicit
terminal action for each live value. `must_resolve` also forbids `discard`.
These are different contracts; choose the one that matches the resource.

Put lexical cleanup near acquisition with `defer` when that fits the resource
protocol. Stored `?` uses ordinary return processing, including deferred
cleanup and resource checks. Do not assume a value has a hidden destructor, or
that lexical cleanup covers every architectural terminal transfer.

## Make effects and trust boundaries easy to review

Keep parsing and value computation separate from hardware access and external
storage assertions. Use `#[deny_effects(...)]` to enforce a forbidden-effect
policy at a module section, function, or label. Use callable effect contracts
where the API needs them. The compiler propagates inferred effects through
calls, so a helper must not conceal a forbidden operation.

Split nested effectful expressions into named steps when their order matters.
Wyst evaluates calls and arguments in a defined order, but a reader should not
need to reconstruct a device transaction from one dense expression.
`--warn-effectful-nesting` can identify candidates for this review.

An effect-free declaration is not a claim that no ordinary memory changes or
storage obligations exist. Review effects, storage, and concurrency contracts
separately. Likewise, a raw-address assertion is evidence supplied by the
programmer, not a compiler proof of the external world.

Keep raw address construction, foreign assertions, and other trust boundaries
in small operations with specific contracts. Use artifact safety policy to
surface those boundaries. Resolve a diagnostic by supplying the required
evidence or correcting the operation; do not weaken the policy to make a build
pass. See [Project Builds](project-builds.md#artifact-safety-policy).

## Describe hardware access with hardware declarations

Prefer `register_map`, placed `mmio`, `system_register`, and semantic core
operations when they describe the required behavior. Keep target and layout
facts in their declared configuration. A helper should take the appropriate
register-map instance instead of reconstructing it from integer address bits.

Read a register once when several decisions must use one observation. A
register `.read()` returns a snapshot; reading fields of that snapshot does
not read the device again. If the device requires a fresh observation, perform
another explicit read.

Choose write forms from the device protocol. `.modify(...)` performs a read
and a write, and is not atomic. A read can have a device side effect; an action
field can interpret written bits as commands. Do not replace a prescribed
write with a read-modify-write sequence because it looks shorter.

MMIO mapping checks do not prove the complete device protocol. They do not
establish clock, reset, interrupt, DMA, or exclusive ownership state. Put those
requirements in the device API and test its sequence on the selected target.

### Keep synchronization explicit

Volatile and MMIO accesses provide neither atomicity nor synchronization.
Use `atomic<T>` and its supported operations for atomic storage. Do not mix
ordinary loads and stores with atomic accesses to the same object.

Choose memory orders from a written sharing protocol: which operation
publishes state, which operation observes it, and which other accesses must be
ordered. Do not choose `relaxed` only for speed or assume `seq_cst` inserts an
architectural barrier. Wyst's A64 `seq_cst` loads and stores use acquire and
release forms without an implicit `dmb`.

Barriers have separate compiler and architectural roles. Use the barrier
option required by the device or sharing protocol. The compiler does not add
barriers around MMIO. See [Memory Model](memory-model.md#barriers-and-ordering).

### Isolate checked assembly

Use checked assembly when a semantic operation does not express the required
instruction sequence. Keep the block small, state its operands and memory or
stack contracts, and explain the architectural reason it exists.

Use explicit register placement, `naked`, and mandatory `#[inline]` only when
the boundary requires them. They impose real constraints; they are not general
performance hints. A `naked` entry must establish the required machine state
without relying on an ordinary function's entry sequence. See
[Checked Assembly](checked-assembly.md) and [Entry Contracts](entry-contracts.md).

## Keep interfaces small

Expose the operations a caller needs to preserve the domain invariant. Use
`opaque` when callers must not construct or inspect the representation. A
public field becomes a dependency for every caller that uses it.

Use a static interface when code needs a shared contract across concrete
subjects. Keep requirements narrow. Static interfaces select implementations
at compile time; they do not introduce an implicit dynamic dispatch model.
Avoid creating an interface solely for a possible future implementation.

At a foreign boundary, declare the ABI, effects, and storage behavior explicitly.
`pub` alone does not create a native symbol, and an address from foreign code
does not establish ownership or lifetime. See
[Interfaces and Implementations](interfaces-and-implementations.md) and
[ABI Specification](abi.md).

## Validate the selected artifact

From a project directory, use the project manifest to select the target and
artifact:

```sh
wync fmt . --check
wync check .
wync build .
```

For a nondefault artifact, pass `--artifact NAME` to both `check` and `build`.
Project mode gets its target from the manifest; it does not accept `--target`.

These steps provide different evidence. Formatting checks source form. `check`
checks the selected source graph without machine lowering. `build` also
constructs the artifact, including checks that require lowering and final
placement. A successful check is not proof that a target image boots.

Use the project's runner or harness for execution tests. For hardware work,
exercise the relevant emulator or board configuration. Keep these tests
focused on observable behavior and the contracts that changed.

For a defect, retain a test that fails before the fix and passes after it.
Useful cases include:

- empty input, exact capacity, and one element beyond capacity;
- arithmetic boundaries and malformed encoded input;
- success and failure paths that retain or transfer resource authority;
- reset or rewind while a dependent view would otherwise remain in use;
- rejected target, effect, layout, and ABI combinations;
- the required order and count of hardware accesses.

Use negative compile tests for operations that must be rejected. Use runtime
tests for observable results and device sequences. Inspect compiler reports or
disassembly when instruction choice, placement, or effects are part of the
requirement. See [Compiler Inspection Reports](inspection-reports.md).

Measure on the relevant target before adding inlining, unrolling, register
pins, or a more complex storage scheme for performance. Record the input,
compiler configuration, and result so the claim can be checked again. Keep an
optimization only when it improves a stated requirement while preserving the
contracts above.
