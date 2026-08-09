---
title: "Functions and Control Flow"
group: reference
section: language
order: 140
summary: "Declarations, functions, parameters, returns, control flow, labels, inline helpers, and explicit register placement."
---

# Functions and Control Flow

This reference describes callable declarations and control flow.

[Type System](type-system.md) defines value types and resource abilities.
[Memory Model](memory-model.md) defines storage and concurrency contracts.
[ABI Specification](abi.md) defines boundary placement.
[Outcomes, Progress, and Terminal Control](outcomes-and-progress.md) defines interactive outcomes.
[Checked Assembly](checked-assembly.md) defines typed assembly blocks.

## Functions

A native function has a body.

<!-- wyst-contract: check-pass -->
```wyst
module functions.basic

fn add(left: u64, right: u64) -> u64 {
  return left + right
}

fn use_add() -> u64 {
  return add(right = 2, left = 1)
}
```

Use `extern "C" fn` for the C calling convention.
An `extern "C" fn` declaration can omit its body.
A bodyless native `fn` is an error.

A function can have type parameters.
Each type parameter can have one active built-in bound.
[Type System](type-system.md) defines these bounds.

A declaration parameter has this order:

```text
mut|var? name: noescape? Type in Register?
```

The unmarked parameter mode is read access.
`mut` gives an exclusive mutable loan.
`var` passes an owned mutable value.
`noescape` applies to the parameter type after the colon.

A function can return no value, one value, `never`, or named multiple values.
A named result tuple has at least two fields.

```text
fn split(value: u64) -> (high: u64, low: u64) { ... }
```

Use `must_observe` before a value result to require observation.
`must_observe` is invalid for void and `never` results.

Use `mut` before a result type for a mutable returned view.
Use `from parameter_name` after the result to identify returned-view sources.
Callable types use `from parameter(index)` instead.

Function contracts use `requires(condition, reason = u16_expression)` and
`ensures(condition, reason = u16_expression)`.
The reason expression must have exactly type `u16`.
All `requires` clauses must precede all `ensures` clauses.
These clauses require a body-bearing, non-`naked` Wyst function.

Callable concurrency, storage, effect, and trust clauses follow the result.
Their canonical rules are in [Memory Model](memory-model.md).

### Calls

The compiler evaluates the callee first.
It then evaluates arguments from left to right.

A direct Wyst call can use parameter names as labels.
Positional arguments must precede labeled arguments.
Each required parameter must receive exactly one argument.
An indirect call accepts positional arguments only.

Use `xfer value` to transfer an owned value.
Resource transfer rules are in [Type System](type-system.md).

## Bindings and assignment

`const` creates an immutable binding.
`var` creates a mutable binding.
Every binding requires an initializer.

A local binding can omit its type when inference is unambiguous.
A module initializer must be a static constant or relocation.
The compiler does not create module startup code.

Destructuring requires at least two bindings.
Use `_` to discard a result position.

```text
const (quotient, remainder) = divide(value, divisor)
var (left, _) = split(value)
(left, right) = split(other)
```

A tuple assignment requires existing mutable targets.
The compiler evaluates the right side once.
The assignment updates all targets as one simultaneous assignment.

## Structured control flow

Wyst provides these runtime control statements:

- `if condition { ... } else { ... }`
- `while condition { ... }`
- `loop { ... }`
- `for index in start ..< end { ... }`
- `match value { ... }`
- `break`
- `continue`
- `return expression`
- `defer { ... }`

An `else` statement body must use braces.
Write `else { if ... }` for a nested conditional.

An `if` expression requires both branches.
The branches must produce compatible values.

An integer `for` loop uses the end-exclusive `..<` spelling.
Its index is immutable.
Its bounds must have one compatible integer type.

Direct array or slice iteration requires `#[unroll]`.
Loop expansion rules are in [Optimization and Hardening](optimization-and-hardening.md).

`break` and `continue` apply to the nearest enclosing loop.
A `for` loop can execute zero times.
Therefore, its body cannot prove that later code is unreachable.

### Enum matching

`match` uses dot-prefixed enum variants.
The compiler requires exhaustive arms.
An ordinary enum match does not accept `else`.

<!-- wyst-contract: check-pass -->
```wyst
module functions.matching

enum Message {
  idle
  value(u64)
}

fn read(message: Message) -> u64 {
  return match message {
    .idle {
      0
    }
    .value(value) {
      value
    }
  }
}
```

One arm can list multiple variants before its body.
All listed variants must bind compatible payloads.

Use `value is .variant(binding)` for one variant test.
An `if` condition can use this form directly.

## `never`, labels, and `naked`

`never` states that a callable does not return normally.
Every reachable path in a `never` function must terminate or diverge.

A `label` is a top-level architectural control entry.
A label has no parameters and no result.
A label must not fall through.
`return` is invalid in a label.

`goto name` transfers control to a label.
`goto` is valid only in labels and exception-vector entries.
Call a function with ordinary call syntax.

`naked` is valid only on `fn` and `label` declarations.
A `naked` body has no compiler-generated entry or return sequence.
Every reachable path must perform an explicit terminal transfer.
`return` is invalid in naked code.

Before stack establishment, naked code cannot use stack storage.
It also cannot make a returning call.
Checked assembly provides explicit stack transition clauses.

Trap-frame label clauses and vector entries are in
[AArch64 Exception Vectors and Trap Frames](exception-vectors-and-trap-frames.md).

## Mandatory `#[inline]`

`#[inline]` requires static expansion at every resolved direct call.
The compiler rejects a residual direct call to an inline function.

The function must have an available Wyst body.
The function cannot be `naked`, foreign, or recursively inline.
The attribute conflicts with `align`, `frame`, and `init`.

An address-taken inline function keeps an out-of-line definition.
Indirect calls use that definition.
The compiler does not treat an indirect call as a direct inline call.

The compiler checks supported value types and control flow before expansion.
It preserves explicit register placement through expansion.

## `per_cpu var`

`per_cpu var` declares mutable module storage in the `.percpu` template.
The declaration uses the ordinary `var` initializer rules.

<!-- wyst-contract: check-pass -->
```wyst
module functions.percpu

#target(arch = arm64-v8a, cpu = generic, el = 2, per_cpu = single_instance_tpidr_el1)

per_cpu var current_id: u64 = 0

fn read_id() -> u64 {
  return current_id
}
```

Direct access requires `single_instance_tpidr_el1` target selection.
This realization uses `TPIDR_EL1` as the `per_cpu` live base.

`per_cpu` is invalid on `const` and local bindings.
`#[section]` is invalid on `per_cpu` storage.
`#addr_of` cannot take a `per_cpu` symbol address.
Use `#percpu_offset_of` for its template offset.

An artifact layout with `per_cpu` storage must define `.percpu`.
Placement rules are in [Named Layouts and Placement](named-layouts-and-placement.md).
Access operations are in [Semantic Operations and Hardware Declarations](semantic-operations.md).

## Explicit register placement

Use `in register` on these source positions:

- a `var` local with an explicit type and initializer;
- a function parameter;
- one scalar function result;
- the corresponding parameter or result in a callable type;
- a checked-assembly input, scratch value, or result.

<!-- wyst-contract: check-pass -->
```wyst
module functions.registers

fn placed(value: u64 in x7) -> u64 in x6 {
  var temporary: u64 in x19 = value
  return temporary
}
```

The source accepts `xN` and `wN` for general registers.
It accepts `vN`, `bN`, `hN`, `sN`, `dN`, and `qN` for FP/SIMD registers.
The compiler canonicalizes general-register views to `xN`.
It canonicalizes FP/SIMD views to `vN`.

The register must match the value class.
The value must fit one register.
Fixed placement is invalid for a whole callable value.
A `mut` parameter cannot have fixed placement.

The compiler rejects `x18`, `x29`, and `x30` as target-reserved placements.
The aliases `fp` and `lr` name `x29` and `x30` and are also rejected.
Stack-pointer and zero-register spellings are not placement registers.

A pinned value cannot require a stable stack address.
A caller-saved pin cannot remain live across a clobbering returning call.
Callee-saved pins receive the required frame preservation in ordinary functions.

Two simultaneously live values cannot claim the same incompatible placement.
`naked` does not remove register conflicts or target reservations.
Detailed boundary placement is in [ABI Specification](abi.md).

## Interactive calls

An interactive function adds an `offers` protocol after its callable clauses.
The protocol can contain `progress`, `failure`, and `cancelled` payload types.

Use `handle call() { ... }` to handle all offered outcomes.
Use `forward progress`, `forward failure`, or `forward cancelled` for exact forwarding.

The postfix `?` form is active exact failure forwarding.
Its operand must be a direct interactive call.
The enclosing interactive function must offer the exact same failure type.
The form cannot forward progress or cancellation.

<!-- wyst-contract: check-pass -->
```wyst
module functions.forwarding

fn child(value: u64) -> u64 offers {
  terminal {
    failure(u8)
  }
} effects(none) {
  if value == 0 {
    fail 1
  }

  return value
}

fn parent(value: u64) -> u64 offers {
  terminal {
    failure(u8)
  }
} effects(none) {
  return child(value)?
}
```

[Outcomes, Progress, and Terminal Control](outcomes-and-progress.md) defines complete interactive semantics.
