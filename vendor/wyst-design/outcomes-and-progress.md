---
title: "Outcomes, Progress, and Terminal Control"
group: reference
section: language
order: 150
summary: "Stored outcomes, interactive functions, progress, cleanup, and recovery boundaries."
---

# Outcomes, Progress, and Terminal Control

Wyst separates stored outcome values from live interactive calls.
The compiler does not convert between these categories implicitly.

[Error-Handling Examples](error-handling-examples.md) shows sequential stored
failures, absence policy, local recovery, and retry with returned resources.

## Stored Values

The sealed `core.collections` module defines `Option<T>` and `Result<T, E>`.
These types are ordinary enum values.
Programs use exhaustive enum control flow for local policy or explicit postfix
`?` for lexical forwarding.

`Option<T>` represents presence or absence.
`Result<T, E>` stores a returned value or a nominal error value.

The sealed `core.outcomes` module defines `TerminalOutcome<T, F, C>`.
This type stores a returned, failed, cancelled, or abandoned terminal state.
It is ordinary data and does not represent a live call.

Postfix `?` on an authenticated `Result<T, E>` continues with the `.Ok` payload
or returns `.Error` from the lexical callable. The error type must match the
lexical Result error type or have one direct `Variant(from E)` relation into
it. The compiler performs at most one enum wrapping step and calls no
conversion code.

Postfix `?` on an authenticated `Option<T>` continues with the `.Some` payload
or returns `.None` from the lexical Option-returning function. The inner and
outer success payload types can differ for both forms. A same-shaped user enum
does not participate in stored forwarding.

<!-- wyst-contract: check-pass -->
```wyst
module outcomes.stored_forwarding

import core.collections { Option, Result }

enum ReadError { unavailable }

fn widen_result(pending: Result<u8, ReadError>) -> Result<u64, ReadError> {
  const value = pending?
  return .Ok(widen<u64>(value))
}

fn widen_option(pending: Option<u8>) -> Option<u64> {
  const value = pending?
  return .Some(widen<u64>(value))
}
```

The operand evaluates once. An error or absence uses ordinary lexical return
processing, including deferred cleanup, postconditions, storage outcomes,
returned views, concurrency state, and resource obligations. A stored affine
operand requires explicit transfer, such as `(xfer pending)?`. Stored forwarding
is invalid inside deferred cleanup or a resume-only handler. It does not
convert between Option, Result, and interactive offers. `TerminalOutcome` has
no postfix forwarding form.

[Functions and Control Flow](functions-and-control-flow.md#stored-result-forwarding)
and [Core Library](core-library.md#corecollections) define the complete stored
forwarding rules.

## Required Observation

A callable can declare a `must_observe` result.
The caller must consume or explicitly discard that result.

Binding, assignment, return, argument passing, aggregate construction, and exhaustive matching consume the observation requirement.
`discard(expression)` consumes the requirement only when the value can be abandoned.
The compiler rejects `discard` for a `must_resolve` value.

`must_observe` is a call-site rule.
It does not change the result ABI.

## Callable Contracts

A body-bearing Wyst function can declare `requires` and `ensures` clauses.
The contract expressions must use the compiler's restricted, effect-free expression set.
A reasonless `requires(condition)` clause is a compile-time call-entry proof
obligation. It emits no check, has no trap reason, and is permitted only on a
direct-call-only function. Constants, exact slice lengths, and dominating
immutable affine comparisons can establish the obligation.

Reason-bearing `requires` clauses run before body effects.
`ensures` clauses run on each returned path.
An `ensures` expression can use the compiler-owned `result` binding.
Every runtime clause has an exact `u16` trap reason.

A failed runtime contract enters the compiler's fatal-trap path.
It does not unwind into an interactive handler.

The compiler rejects contracts on naked functions, labels, and bodyless declarations.
The compiler also rejects effectful contract expressions.

## Interactive Functions

A function becomes interactive when its signature has an `offers` clause.
An interactive function is Wyst-native, non-naked, and direct-call only.
It is not a first-class function value.

An interactive signature has an ordinary return path.
It can also declare these offers:

- `progress(P)` for a synchronous notification;
- `failure(F)` for a terminal failure; and
- `cancelled(C)` for a terminal cancellation.

All labels occur directly in one `offers` block, in `progress`, `failure`,
`cancelled` order. Each label is optional, but the block must not be empty.
Handler arms also occur directly in one block. A progress arm must come first.

<!-- wyst-contract: check-pass -->
```wyst
module interactive_demo

fn pulse() -> u64 offers handler(none) {
  progress(u64)
  failure(u8)
} effects(none) {
  report 3
  return 4
}

fn handled() -> u64 effects(none) {
  return handle pulse() {
    progress(value) { discard(value) }
    failure(problem) { widen<u64>(problem) }
  }
}
```

An interactive call must be handled or exactly forwarded.
The ordinary return path is implicit in a `handle` expression.
Source cannot spell a returned handler arm.

A handler must cover every effective non-return offer exactly once.
Handler payload types must match the declared offer types.

The compiler supports explicit `forward progress`, `forward failure`, and `forward cancelled` arms.
Forwarding requires an exact matching offer in the enclosing interactive function.

## Direct Interactive Failure Forwarding

Postfix `?` on a direct interactive call forwards its exact failure offer.
This form takes precedence over stored forwarding and requires a call with
return and failure paths.

The enclosing function must declare the same failure payload type.
The compiler rejects `?` when the call also offers progress or cancellation.
It does not inspect a stored Result returned by that call. A second postfix
operation can forward the stored error, as in `(call()?)?`.

<!-- wyst-contract: check-pass -->
```wyst
module outcomes.interactive_forwarding

import core.collections { Result }

enum ReadError { unavailable }

fn child(value: u8) -> Result<u8, ReadError> offers {
  failure(u8)
} effects(none) {
  if value == 0 {
    fail 1
  }
  if value == 255 {
    return .Error(.unavailable)
  }
  return .Ok(value)
}

fn parent(value: u8) -> Result<u64, ReadError> offers {
  failure(u8)
} effects(none) {
  const returned = handle child(value) { forward failure }
  const payload = returned?
  return .Ok(widen<u64>(payload))
}
```

The explicit handler forwards the live call failure. The subsequent `?`
processes the stored returned Result and uses lexical return for its `.Error`
path. This form names each boundary when a call has both protocols. The compact
`(child(value)?)?` form remains valid and has the same behavior. Neither
operation converts one kind of failure into the other. The call and its
arguments evaluate once in left-to-right order. Forwarding adds no effect
beyond the call's effects.

## Progress

In this topic, progress is a synchronous nonterminal notification from the
current invocation. The source form `forward progress` forwards that
notification; it does not name a liveness property. Execution progress would
describe whether execution eventually reaches another work or terminal event;
the progress protocol supplies no such scheduling or liveness guarantee.

`report value` calls the progress handler synchronously.
The producer continues only after the handler returns.

Progress handlers are resume-only.
They cannot return, fail, cancel, or transfer control outside the handler.
They cannot change captured ownership or initialization state across repeated reports.

Progress is serial, same-strand, and unbuffered.
It provides no fairness, independent execution, or progress guarantee.

The `handler(...)` clause limits handler effects when it is present.
Without that clause, the compiler infers handler effects.
A handler with `execution_suspension` uses the boundary from [Scheduling and Suspension](scheduling-and-suspension.md).

## Terminal Control and Cleanup

Use `return`, `fail`, or `cancel` to select a terminal path.
Each statement requires a payload with the declared type.

`defer` registers explicit cleanup for the current lexical scope.
Cleanup blocks execute in reverse registration order.
They execute on fallthrough and structured exits.

A cleanup block cannot use these transfers:

- `return`;
- `report`;
- `fail`;
- `cancel`;
- `goto`; or
- `break` or `continue` to an outer loop.

Wyst does not add implicit destructors or hidden cleanup.
Path-sensitive terminal checks still require all live resource obligations to be accounted for.

## Recovery and Cancellation

A program can pass a typed, `noescape` recovery callback to a producer.
The producer calls the callback synchronously and handles the returned policy value explicitly.

Cancellation and deadlines are explicit input values.
They do not asynchronously unwind a producer.
Source code selects the winning terminal path.

Stored outcomes and causal records remain explicit program data.
They do not create a task, queue, scheduler, or exception runtime.

## C Boundaries

Interactive calls use the Wyst native convention.
Progress can add a hidden noescape callback and context to the native lowering.
Terminal offers use a compiler-created outcome layout.

C interoperability requires an explicit generated adapter.
The current adapter profiles use status/output or tag/output forms.
The adapter defines output initialization, alignment, aliasing, lifetime, and cleanup requirements.

Progress and recovery cross C boundaries only as synchronous noescape callback-and-context pairs.
The compiler does not use an ambient status value or hidden thread-local error state.

## Fatal Traps

The sealed `core.trap` operation `trap.fatal(reason)` returns `never` and has the `trap` effect.
Interactive handlers do not catch a fatal trap.
The compiler does not provide language exception unwinding.
