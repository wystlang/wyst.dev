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

## Stored Values

The sealed `core.collections` module defines `Option<T>` and `Result<T, E>`.
These types are ordinary enum values.
Programs inspect them with exhaustive enum control flow.

`Option<T>` represents presence or absence.
`Result<T, E>` stores a returned value or a nominal error value.

The sealed `core.outcomes` module defines `TerminalOutcome<T, F, C>`.
This type stores a returned, failed, cancelled, or abandoned terminal state.
It is ordinary data and does not represent a live call.

The compiler does not provide automatic unwrapping or implicit propagation for these values.
Postfix `?` does not apply to `Result`.

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

`failure` and `cancelled` occur inside the `terminal` group.
Each label is optional.

<!-- wyst-contract: check-pass -->
```wyst
module interactive_demo

fn pulse() -> u64 offers handler(none) {
  progress(u64)
  terminal {
    failure(u8)
  }
} effects(none) {
  report 3
  return 4
}

fn handled() -> u64 effects(none) {
  return handle pulse() {
    progress(value) { discard(value) }
    terminal {
      failure(problem) { widen<u64>(problem) }
    }
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

## Exact Failure Forwarding

Postfix `?` is an exact interactive failure-forwarding operation.
It is valid only on a direct interactive call with return and failure paths.

The enclosing function must declare the same failure payload type.
The compiler rejects `?` when the call also offers progress or cancellation.
It also rejects `?` on stored `Result` values.

The call and its arguments evaluate once in left-to-right order.
The operation adds no effect beyond the call's effects.

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
