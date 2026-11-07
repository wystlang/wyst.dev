---
title: Functions
summary: Parameters, results, never, results that must be used, linear values and lending, and inline functions.
---

## Declaring a function

`fn name(parameters) -> Result { body }` declares a function. A parameter
is `name: Type`. A function has at most 8 parameters, and they take at
most 8 registers: an `Option`, an
[enum with values](/docs/enums-and-bit-structs/#enums-with-values), and
a [slice](/docs/addresses/#slices) take two, and a
[struct with no fields](/docs/structs/#structs-with-no-fields) takes
none, so it does not count. A function without `->` returns no value.

```wyst
fn max(a: u64, b: u64) -> u64 {
  if a > b {
    return a
  }
  return b
}
```

A parameter has a value type, an
[enum](/docs/enums-and-bit-structs/#enum-values), a
[`#[bits]` struct](/docs/enums-and-bit-structs/#values), a
[struct with no fields](/docs/structs/#structs-with-no-fields), an
address type, which [Addresses and memory](/docs/addresses/) describes, a
slice type `[]T`, which [Slices](/docs/addresses/#slices) describes,
`string`, which [Values and types](/docs/values/#strings) describes, or
an `Option`, which [Optional values](/docs/options/) describes. A
parameter of a linear type with `xfer` takes the value, and one without
`xfer` lends it, as [Linear values](#linear-values) gives. A function
cannot change its parameters, because a `mut` parameter is not
implemented now.
No call starts the entry or a naked function, so no
string literal gives their parameters, and a `string` parameter of one of
them is not implemented now.

A parameter `_` takes its argument and gives it no name, so the body
cannot read it:

```wyst
fn second(_: u64, b: u64) -> u64 {
  return b
}
```

Each other parameter has a name of its own. A second parameter with the
same name is an error:

```wyst fails
fn add(a: u64, a: u64) -> u64 {
  return a + a
}
```

```text
main.wyst:1:16: error: a second parameter `a`
```

## Results

A result is a value type, an enum, a `#[bits]` struct, an address type,
a [slice](/docs/addresses/#slices) type, `Option<T>`, or `never`. A
function with a result must not reach the end of its body.
Each path ends with `return`, with a call to a `never` function such as
`trap()`, with a `for {}` without a `break`, or with an
[`asm -> never` block](/docs/assembly/#blocks-that-do-not-return). A
function that returns `never` cannot use `return`.

```wyst fails
fn sign(x: u8) -> u8 {
  if x > 0 {
    return 1
  }
}
```

```text
main.wyst:1:4: error: function `sign` can reach its end without `return`
```

The checker infers the highest value of a value result from the value
of each `return`, and each call has it, so a call can be an index. Here
each result of `slot` is at most 3:

```wyst
fn slot(ticket: u64) -> u64 {
  return ticket % 4
}

fn mark(table: @[4]u64, ticket: u64) {
  store(@table[slot(ticket)], 1)
}
```

A function that calls itself, also through other functions, gives its
result no highest value. [Index proofs](/docs/index-proofs/#results)
gives the rules.

[Optional values](/docs/options/) describes `Option<T>`.

## Results must be used

A value result and an address result must be used. A call with a value
result is a value as each other value is: an operand, an argument, a
condition, or the value of `const`, an assignment, or `return`:

```wyst
var count: u8 = 0

fn above(x: u8, limit: u8) -> bool {
  return x > limit
}

fn next(x: u8) -> u8 {
  return x + 1
}

fn clamp(x: u8) -> u8 {
  if !above(x, 100) {
    count = next(count)
    return next(next(x)) + 1
  }
  return 100
}
```

The calls in a value run from left to right, and each load and each
register access stays before or after each call, as in the source. Thus
in `count + next(x)`, the value of `count` is the one before `next` runs.

A call statement that drops the result is an error:

```wyst fails
fn next(x: u8) -> u8 {
  return x + 1
}

fn skip(x: u8) {
  next(x)
}
```

```text
main.wyst:6:3: error: the `u8` result of this call is not used
```

`_ = next(x)` calls `next` and keeps nothing, so it drops the result:

```wyst
fn next(x: u8) -> u8 {
  return x + 1
}

fn skip(x: u8) {
  _ = next(x)
}
```

An `Option` result is must-use, so `_ = value` cannot drop it: `else`,
`?`, or `match` takes it, as [Optional values](/docs/options/#must-use)
shows.

## never

`never` is the result of a function that does not return. A call to a
`never` function ends its block, so a statement after it is an error, as a
statement after `return` is.

```wyst
fn halt() -> never {
  for {
    asm {
      wfe
    }
  }
}
```

`trap()` is a builtin `never` call. It stops the program with the
instruction `brk #0`, and the exception vectors decide what happens next.

```wyst fails
fn stop() {
  trap()
  stop()
}
```

```text
main.wyst:3:3: error: this statement is not reachable
```

## Linear values

`linear` before a [`#[bits]` struct](/docs/enums-and-bit-structs/#bit-structs)
or a [struct with no fields](/docs/structs/#structs-with-no-fields)
makes its type linear. A value of a linear type stands for a duty that the
program must do, such as the end of an interrupt that it acknowledged. No
path that returns can drop the value: each path gives it to an `xfer`
parameter or to `return`, or the module that declares the type consumes
it with `_ = v`. A path that calls a `never` function keeps it with no
error.

```wyst
#[bits]
linear struct Interrupt: u16 {
  NUMBER: u16 at 0..=15
}

#[sysreg]
const ICC_IAR1_EL1: readonly u64 {
  INTID: u16 at 0..=15
}

#[sysreg]
const ICC_EOIR1_EL1: writeonly u64 {
  INTID: u16 at 0..=15
}

var ticks: u64 = 0

fn acknowledge() -> Option<Interrupt> {
  const intid = ICC_IAR1_EL1.read().INTID
  if intid == 1023 {
    return .None
  }

  return .Some({ NUMBER = intid })
}

fn end(interrupt: xfer Interrupt) {
  ICC_EOIR1_EL1.write(INTID = interrupt.NUMBER)
  _ = interrupt
}

fn handle() {
  const interrupt = acknowledge() else { return }
  if interrupt.NUMBER == 30 {
    ticks += 1
  }

  end(xfer interrupt)
}
```

`p: xfer T` is a parameter that takes the value. `xfer v` at the call gives the linear local or
parameter `v` to it, so the reader sees each call that takes the value,
and no path after the call can use `v`. `xfer` is optional where `v` is
dead: in `return v` and `return .Some(v)`, at the end of a block of an
`if` or `match` value, and in `_ = v`. A call or a literal goes to an
`xfer` parameter without `xfer`. `v.F` reads a field and keeps `v`.

A path that keeps the value to a `return`, to a `break` or `continue`
that leaves its block, or to the end of its block or function, drops it,
which is an error:

```wyst fails
#[bits]
linear struct Interrupt: u16 {
  NUMBER: u16 at 0..=15
}

fn acknowledge() -> Option<Interrupt> {
  return .Some({ NUMBER = 30 })
}

fn end(interrupt: xfer Interrupt) {
  _ = interrupt
}

fn handle(stop: bool) {
  const interrupt = acknowledge() else { return }

  if stop {
    return
  }

  end(xfer interrupt)
}
```

```text
main.wyst:18:5: error: this path drops linear local `interrupt`
```

A use after `xfer` is an error, also when only one path gave the value
away:

```wyst fails
#[bits]
linear struct Interrupt: u16 {
  NUMBER: u16 at 0..=15
}

fn acknowledge() -> Option<Interrupt> {
  return .Some({ NUMBER = 30 })
}

fn end(interrupt: xfer Interrupt) {
  _ = interrupt
}

fn handle() {
  const interrupt = acknowledge() else { return }
  end(xfer interrupt)
  end(xfer interrupt)
}
```

```text
main.wyst:17:12: error: linear local `interrupt` is used after a path gave it away
```

`.Some(v)` gives the value away, as in `return .Some(v)`. Each other use
of a linear value copies it, which is an error. A linear value is not its
backing integer, and a second local cannot hold it:

```wyst fails
#[bits]
linear struct Interrupt: u16 {
  NUMBER: u16 at 0..=15
}

fn acknowledge() -> Option<Interrupt> {
  return .Some({ NUMBER = 30 })
}

fn end(interrupt: xfer Interrupt) {
  _ = interrupt
}

fn handle() -> u16 {
  const interrupt = acknowledge() else { return 0 }
  const number: u16 = interrupt
  end(xfer interrupt)

  return number
}
```

```text
main.wyst:16:23: error: linear local `interrupt` cannot be copied: only a field read, a lent argument, `xfer interrupt`, `return interrupt`, and `_ = interrupt` use it
```

Only the module that declares a linear type consumes its value, also when
the type is `pub`. Fields have no visibility, so another module reads the
fields of a value and makes a value with a literal, but it only gives a
value away:

```wyst irq/interrupts.wyst
#[bits]
pub linear struct Interrupt: u16 {
  NUMBER: u16 at 0..=15
}

pub fn end(interrupt: xfer Interrupt) {
  _ = interrupt
}
```

```wyst
import irq.interrupts

fn handle(interrupt: xfer interrupts.Interrupt) {
  interrupts.end(xfer interrupt)
}
```

```wyst fails
import irq.interrupts

fn handle(interrupt: xfer interrupts.Interrupt) {
  _ = interrupt
}
```

```text
main.wyst:4:7: error: only module `irq.interrupts`, which declares the linear type Interrupt, can consume its value
```

The body of a loop can run again, so a pass cannot give away a linear
local from outside the loop and then go to the next pass. A path that
gives it away and then leaves the loop is correct.

The statements `acknowledge() else { return }` and `acknowledge()?` drop
the value of `.Some`, so they are errors with a linear value. An `Option`
local or parameter of a linear type, a `match` on such an `Option`, a
local `var`, a module constant, and memory of a linear type, a `linear`
plain struct with fields, and a `linear` enum are not implemented now.

### Lending a linear value

A parameter of a linear type without `xfer`, such as `held: Held`, lends
the value for the call. The argument is a linear local or parameter
without `xfer`, and the caller keeps it, so a path after the call can use
it. The function can read the fields of the value and lend it again, but
it cannot consume it, give it to an `xfer` parameter, or return it, and
the end of the function does not drop it. A
[struct with no fields](/docs/structs/#structs-with-no-fields) has no
bytes, so a linear one is a proof that makes no code, such as the proof
that the CPU holds a lock:

```wyst
pub linear struct Held {}

var word: u64 = 0

pub fn lock() -> Held {
  word = 1
  return {}
}

pub fn unlock(held: xfer Held) {
  word = 0
  _ = held
}

fn change(held: Held, value: u64) {
  word = value
}

fn update(value: u64) {
  const held = lock()
  change(held, value)
  change(held, value + 1)
  unlock(xfer held)
}
```

Each function that needs the lock takes `held: Held`, so a call without
the lock is an error, as after `unlock`:

```wyst fails
pub linear struct Held {}

pub fn lock() -> Held {
  return {}
}

pub fn unlock(held: xfer Held) {
  _ = held
}

fn change(held: Held) {}

fn update() {
  const held = lock()
  unlock(xfer held)
  change(held)
}
```

```text
main.wyst:16:10: error: linear local `held` is used after a path gave it away
```

A function cannot release a lock that its caller lends:

```wyst fails
pub linear struct Held {}

pub fn unlock(held: xfer Held) {
  _ = held
}

fn change(held: Held) {
  unlock(xfer held)
}
```

```text
main.wyst:8:15: error: the caller lends linear parameter `held`, so the function cannot give it away or consume it, except in a call of a `never` function; `held: xfer Held` takes the value
```

A function that returns `never` does not give control back to its
caller, so the caller does not use the value again. Thus an `xfer`
parameter of such a function can take a value that the caller of the
function lends. The kernel uses this when a thread waits: the kernel
call lends the lock, and the function that runs the next thread
releases it:

```wyst
pub linear struct Held {}

pub fn unlock(held: xfer Held) {
  _ = held
}

fn run_next(held: xfer Held) -> never {
  unlock(xfer held)
  trap()
}

fn wait(held: Held, ready: bool) -> u64 {
  if !ready {
    run_next(xfer held)
  }
  return 1
}
```

## Inline functions

`#[inline] fn` is copied into each caller, and it has no code of its own.
A `return` in an inline function ends only the copied body.

```wyst
var total: u64 = 0

#[inline]
fn add(n: u64) {
  if n == 0 {
    return
  }

  total += n
}

fn add_two() {
  add(1)
  add(2)
}
```

An inline function cannot call itself, directly or through other inline
functions. It cannot be naked or the entry.

## Which functions get code

The compiler checks every function. It generates code only for the
functions that the entry or the exception vector table can reach, through
calls and `@`. Thus a module can keep a function that the program does not
use, at no cost.

These forms are not implemented now:

- methods (`fn T.f`) and generic functions;
- the parameter mode `mut`;
- a parameter in a register, such as `x: u64 in x0`;
- named arguments of a function.

Named arguments are only for register writes now.
