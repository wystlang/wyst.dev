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
Each type parameter can have one active built-in bound or static-interface
constraint. [Type System](type-system.md) defines built-in bounds.
[Interfaces and Implementations](interfaces-and-implementations.md) defines
static-interface requirements and qualified calls.

A declaration parameter has this order:

```text
comptime? mut|var? name: noescape? Type ...? in Register?
```

The unmarked parameter mode is read access.
`mut` gives an exclusive mutable loan.
`var` passes an owned mutable value.
`noescape` applies to the parameter type after the colon.
It accepts address, slice, and callable-capability parameters.
The callee cannot retain that authority, and can forward it only to another
matching `noescape` parameter of a direct call. Returning it requires an
explicit `from parameter_name` result contract, which transfers the source
lifetime to the caller-visible result.

`comptime` marks a read-only parameter that must be a closed compile-time
value. It has no runtime representation or ABI position. A final `...` marks a
value parameter pack. A pack is read-only and expands to fixed runtime
parameters during staged specialization.

A function can return no value, one value, `never`, or named multiple values.
A named result tuple has at least two fields.

A value result constrains every normal return to supply that value type. It
does not guarantee that the function returns normally. A value-returning
function can diverge or use another terminal transfer on some or all paths.
The compiler warns when a body-bearing value-returning function has no normal
value-return path.

```text
fn split(value: u64) -> (high: u64, low: u64) { ... }
```

Use `must_observe` before a value result to require observation.
`must_observe` is invalid for void and `never` results.

Use `mut` before a result type for a mutable returned view.
Use `from parameter_name` after the result to identify returned-view sources.
Callable types use `from parameter(index)` instead.

Append `on .Variant` to make the returned-view relation conditional on one
nominal enum outcome. The variant must have exactly one direct payload. That
payload receives the declared storage relation:

<!-- wyst-contract: check-pass -->
```wyst
module returned_payload_lease

import core.collections { Result }
import core.storage { Arena, ArenaFailure }

fn allocate(mut arena: Arena) -> Result<@u64, ArenaFailure>
  from arena on .Ok
{
  loop { }
}
```

The relation exists only after control flow refines the result to `.Ok`. The
`.Error` value carries no view from `arena`. Stored `?` forwarding preserves
this distinction: it returns `.Error` without a view and unwraps the qualified
payload on success. A callable type spells the same relation as
`from parameter(0) on .Ok`.

Function contracts use proof-required `requires(condition)`, runtime-checked
`requires(condition, reason = u16_expression)`, and runtime-checked
`ensures(condition, reason = u16_expression)`. A reasonless precondition must be
proved at every direct call, contributes no runtime work or trap effect, and
makes the function direct-call only. The compiler can discharge it from
constants, exact slice lengths, and dominating affine comparisons over
immutable call arguments. A reason-bearing clause retains the existing runtime
fatal-trap behavior, and its reason expression must have exactly type `u16`.
All `requires` clauses must precede all `ensures` clauses.
These clauses require a body-bearing, non-`naked` Wyst function.

Callable concurrency, storage, effect, and trust clauses follow the result.
Their canonical rules are in [Memory Model](memory-model.md).

### Calls

The compiler evaluates the callee first.
It then evaluates arguments from left to right.

A direct Wyst call can use parameter names as labels.
For an ordinary call, positional arguments must precede labeled arguments.
The call checker enforces this rule. A call to a function with a final value
pack can put pack labels and unlabeled pack arguments in either order.
Each required parameter must receive exactly one argument.
An indirect call accepts positional arguments only.

A static-interface call uses the positional
`Interface.operation(subject, arguments...)` form. It is authenticated against
the interface requirement inside the generic body and becomes an ordinary
direct call during concrete materialization. Static interfaces do not add
receiver-dot lookup or an indirect-call form.

A nominal operation declaration uses `fn Owner.operation(...)`. Its identity
contains the declaring module, the exact local nominal owner, and the operation
leaf. The owner must be concrete, nongeneric, and declared in the same module.
An operation with an explicit parameter-zero `self: Owner` is receiver-enabled.
An operation without `self` is associated only.

For an exact nominal receiver, `value.operation(arguments...)` elaborates to
`Owner.operation(value, arguments...)` before typed IR. The receiver is
evaluated once and before the remaining arguments. `mut self` needs an
addressable mutable place. `var self` needs explicit transfer with
`(xfer value).operation(...)`. Transfer is invalid for a retained `mut self`
receiver. Lookup does not apply autoref, autoderef, conversion, reborrow,
interface search, extension lookup, or overload resolution.

A direct generic function call can omit its complete type-argument list when
the declared parameter shapes and statically known argument types determine
every argument uniquely. Generic type constructors remain explicit, and
inference never works backward from the expected result type.

### Staged scan materialization

A call to the exact authenticated `core.scan.read` declaration is a closed
staged materialization. The compiler evaluates the named-tuple type and
template during specialization, validates their scan schema, and replaces the
call with one fixed typed function. This mechanism does not apply to a user
function with the same name and does not create a general reflection, macro,
or return-pack facility.

The call keeps ordinary evaluation order. Its input expression is evaluated
exactly once. The compile-time template has no runtime evaluation or ABI
position. The specialized body processes literals and captures from left to
right. It reports the first failure, does not advance a cursor on a failed
operation, requires complete input consumption, and constructs the result
tuple only after every step succeeds.

One materialization identity contains the authenticated declaration identity,
complete concrete tuple type, exact template bytes, and materializer version.
The current scan grammar has no target-dependent behavior beyond the concrete
field types, so no additional target property changes this identity. WYSTIF
records the same concrete type and value arguments for source-less checking.
The runtime body has no template parser, field-name table, capture descriptor,
allocation, or indirect parser dispatch.

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
Each live branch must end with one compatible value.
A branch can instead end with a `never` expression or a valid `return`, `fail`,
`cancel`, `break`, `continue`, or `goto` transfer. `goto` remains valid only in
a label or exception-vector entry.
The terminal branch supplies no stored value and does not enter the live join.

A bare final boolean `if` or final `match` is the value of its containing
expression branch.
Before the final value, an expression branch can contain declarations, calls,
directives, static assertions, non-local assignments, and acyclic statement
`if` or `match` control. It cannot contain a loop or `defer`, and it cannot
reassign a local from outside the expression branch.
Nested setup control can update a local declared in the expression branch.

Resource, loan, typed-storage, and terminal-obligation checks apply to each
path. Only live paths supply state and values to the expression join.

## Stored Result forwarding

Postfix `?` on an authentic `core.collections.Result<T, InnerError>` creates
two checked paths. `.Ok(value)` continues the expression with `value`. An
`.Error` returns from the lexical callable as
`Result<U, OuterError>.Error(...)`.

The inner error passes unchanged when both error types are equal. Otherwise,
`OuterError` must be an enum with exactly one direct
`Variant(from InnerError)` declaration. The compiler performs one enum wrapping
step. It does not search transitively or call conversion code. `embed<T>(value)`
uses the same direct relation and rejects equal source and target types.

The error path uses ordinary lexical return processing. It runs deferred
cleanup and checks postconditions, storage outcomes, returned views, stack
addresses, concurrency state, and resource obligations. A stored
resource-bearing local requires `xfer`, for example `(xfer pending)?`. A `?`
inside deferred cleanup or a resume-only handler is invalid.

## Stored Option forwarding

Postfix `?` on an authentic `core.collections.Option<T>` creates two checked
paths. `.Some(value)` continues the expression with `value`. `.None` returns
`core.collections.Option<U>.None` from the lexical function. `T` and `U` can
be different. The compiler authenticates the exact bundled Option declaration
and variants. A same-shaped enum does not participate.

The operand is evaluated once. The absence path uses ordinary lexical return
processing, including cleanup, postconditions, storage outcomes, returned
views, concurrency state, and resource obligations. A stored affine Option
requires explicit transfer, for example `(xfer pending)?`. The form is invalid
inside deferred cleanup or a resume-only handler. Wyst does not define general
`Try`, Option `else`, `orelse`, or an implicit conversion between Option and
Result.

## Forwarding checked subscripts

An inner `?` in `values[?index]` checks the captured array or slice length and
forwards `core.checked.IndexFailure` through the same lexical Result path as a
stored postfix `?`. Checked slice forms forward `core.checked.SliceFailure`:

<!-- wyst-contract: check-pass -->
```wyst
module functions.forward_checked_slices

import core.checked
import core.collections { Result }

fn combined_length(values: []u64, lower: u64, upper: u64)
    -> Result<u64, checked.SliceFailure> {
  const middle = values[?lower..<upper]
  const tail = values[?lower..]
  const head = values[?..<upper]
  return .Ok(middle.len + tail.len + head.len)
}
```

The lexical Result error type must be exact or declare one direct
`Variant(from E)` wrapper. Cleanup, postconditions, storage outcomes, returned
views, concurrency state, and resource obligations use the stored Result
forwarding rules. On success, an index denotes the ordinary element place and
a range denotes an ordinary slice. `results[?index]?` first forwards the bounds
failure and then forwards the selected stored Result error.

Use `core.checked.index` or `core.checked.slice_range` when the caller must
recover locally or retain a reusable proof.

An integer `for` loop uses the end-exclusive `..<` spelling.
Its index is immutable.
Its bounds must have one compatible integer type.

Direct array or slice iteration requires `#[unroll]`.
Loop expansion rules are in [Optimization](optimization.md).

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
A statement-match arm with no work lists only its variant patterns. This is an
explicit no-op arm; do not add an empty block.

<!-- wyst-contract: check-pass -->
```wyst
module functions.no_op_match

enum State { idle ready }

fn begin() { }

fn observe(state: State) {
  match state {
    .idle
    .ready { begin() }
  }
}
```

Use `value is .variant(binding)` for one variant test.
An `if` condition can use this form directly.

## `never`, labels, and `naked`

`never` states that a callable does not return normally.
Every reachable path in a `never` function must terminate or diverge.
Use `never` instead of a value result when normal return is intentionally
impossible. This declaration lets callers treat the call as terminal.

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

The postfix `?` form on a direct interactive call has precedence and is exact
failure forwarding.
The enclosing interactive function must offer the exact same failure type.
The form cannot forward progress or cancellation.
This path does not convert to or from a stored `Result.Error` value. If the
returned payload is a stored `Result`, a second `?` can process it, as in
`(call()?)?`.

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
