---
title: Index proofs
summary: How the compiler proves each array index before the program runs.
---

Each index of an array must be less than the length of the array. The
compiler proves this at compile time. When it cannot prove an index, the
build stops. There is no bounds check at run time, so a proved index costs
nothing.

The same rule applies to an index of an array of devices, as in
`redistributors[cpu]`. See [Registers and devices](/docs/registers/). When
the amount `k` of `a << k` or `a >> k` is not a constant, the compiler
proves in the same way that `k` is less than the width of `a`. See
[Operators](/docs/operators/#bits).

## What the checker knows

The checker knows the highest value of:

- a constant;
- `a & b`, which is at most the highest value of `a` or of `b`;
- `widen(x)`, which keeps the proof of `x`;
- a read of a field of `N` bits, which is less than 2^N;
- `truncate(x)` to `uN`, which keeps the proof of `x` and is less than
  2^N;
- the variable `i` of `for i in a ..< n`, which is `h - 1` when the checker
  knows the highest value `h` of `n`, and of `for i in a ..= n`, which is
  `h`;
- a `const` local, which keeps the proof of its value;
- the operators in [Operators](#operators).

A mask is the simplest proof. For an array of 8, `i & 7` is at most 7:

```wyst
fn clear(table: @[8]u64, i: u64) {
  store(@table[i & 7], 0)
}
```

A range loop proves its variable:

```wyst
const slots: u64 = 8

fn clear_all(table: @[slots]u64) {
  for i in 0 ..< slots {
    store(@table[i], 0)
  }
}
```

A field of 2 bits is at most 3, so it proves an index into an array of 4:

```wyst
#[bits]
struct Slot: u8 {
  Way: u2 at 0..=1
}

fn clear(table: @[4]u64, cursor: @u8) {
  const slot: Slot = load(cursor)
  store(@table[slot.Way], 0)
}
```

## Operators

These operators give a highest value from the highest values of their
operands:

- `x % n` is less than `n` and at most `x`, so one of the two needs a
  highest value;
- `x / n` is at most the highest value of `x` divided by a constant `n`.
  When `n` is not a constant, it can be 1, so `x / n` is at most the
  highest value of `x`. A divisor of 0 traps;
- `x >> k` is at most the highest value of `x` shifted right by a
  constant `k`;
- `a << k` is at most the highest value of `a` shifted left by a constant
  `k`, when no set bit moves out of the type. Else the value can wrap, and the
  checker knows no highest value;
- `a | b` and `a ^ b` are at most the smallest number of all ones, such as
  7, that is at least the highest values of `a` and `b`.

`%` proves an index into an array of any length, also when the length is
not a power of two:

```wyst
const slots: u64 = 5

fn clear(table: @[slots]u64, ticket: u64) {
  store(@table[ticket % slots], 0)
}
```

Except for `%`, each operand needs a highest value that is a number, such
as a constant or a value that a condition bounds. Here the condition gives
`page` the highest value 15, so `page / 4` is at most 3:

```wyst
fn mark(table: @[4]u64, page: u64) {
  if page < 16 {
    store(@table[page / 4], 1)
  }
}
```

The checker proves the values of a parameter or a module variable from the
calls or the writes only after it has checked each body, so they give no
number:

```wyst fails
fn mark(table: @[4]u64, page: u64) {
  store(@table[page / 4], 1)
}
```

```text
main.wyst:2:21: error: the checker cannot prove that the index is less than 4
```

## Conditions

The condition of an `if` gives a bound to a parameter, a loop variable, or
a `const` local `x` when it compares `x` with an expression `e`: `x < e`,
`x <= e`, or `x == e`, with `x` on either side, and `!` of a comparison.
The bound holds in the body of the `if`, and the bound of the false
condition holds in its `else` block.

```wyst
fn mark(table: @[4]u64, cursor: @u64) {
  const at = load(cursor)
  if at < 4 {
    store(@table[at], 1)
  }
}
```

`e` must have a highest value that is a number, such as a constant or a
mask. A parameter or a module variable as `e` gives no bound now. A
condition gives no bound to a module variable.

`x` can also be the sum `a + b` of two parameters, loop variables, or
`const` locals. The bound then holds for each `a + b` and `b + a` of the
same type, because `a` and `b` do not change. A sum in another type, such
as `widen(a) + widen(b)` of two `u8` values, wraps at another value, so
it has no bound. Thus a range loop that ends at the sum proves
its variable:

```wyst
fn clear(table: @[8]u64, first: u64, count: u64) {
  if first + count > 8 { return }

  for i in first ..< first + count {
    store(@table[i], 0)
  }
}
```

The bound is of the value of the sum, so it holds also when `first +
count` wraps: `i` is less than that value.

When the body cannot reach its end, the condition is false after the
`if`. Thus after `if at >= 4 { return }`, `at` is at most 3 until the end
of the block:

```wyst
fn mark(table: @[4]u64, cursor: @u64) {
  const at = load(cursor)
  if at >= 4 { return }

  store(@table[at], 1)
}
```

A true `a && b` gives the bounds of `a` and of `b`, and a false `a || b`
gives the bounds of the false `a` and of the false `b`. The code computes
`b` only when `a` does not give the value, so the bound of `a` also holds
in `b`:

```wyst
fn mark(table: @[4]u64, cursor: @u64) {
  const at = load(cursor)
  if at < 4 && load(@table[at]) == 0 {
    store(@table[at], 1)
  }
}
```

A true `a || b` and a false `a && b` give no bound, because either operand
can give the value:

```wyst fails
fn mark(table: @[4]u64, cursor: @u64, all: bool) {
  const at = load(cursor)
  if at < 4 || all {
    store(@table[at], 1)
  }
}
```

```text
main.wyst:4:18: error: the checker cannot prove that the index is less than 4
```

Without the condition, the checker knows nothing about a value from
memory:

```wyst fails
fn mark(table: @[4]u64, cursor: @u64) {
  const at = load(cursor)
  store(@table[at], 1)
}
```

```text
main.wyst:3:16: error: the checker cannot prove that the index is less than 4
```

## match

In an arm of a `match` on a parameter, a loop variable, or a `const` local
`x`, `x` is at most the highest pattern of the arm, as under `if x == p`.
The arm `_` gives no bound:

```wyst
fn mark(table: @[4]u64, cursor: @u64) {
  const at = load(cursor)
  match at {
    0, 3 {
      store(@table[at], 1)
    }
    _ {}
  }
}
```

## Parameters and variables

An index can also be a parameter or a module variable. When the checker
has checked each body, it proves each value that the index can get: each
argument of each call of the function, or the first value and each write
of the variable. A value that is itself a parameter or a variable gets the
same proof. The error names the first argument or value that the checker
cannot prove.

```wyst fails
const slots: u64 = 8

fn clear(table: @[slots]u64, i: u64) {
  store(@table[i], 0)
}

fn reset(base: u64) {
  const table: @[slots]u64 = bitcast(base)

  for i in 0 ..< slots {
    clear(table, i)
  }

  clear(table, slots)
}
```

```text
main.wyst:14:16: error: the checker cannot prove that this argument is less than 8
```

The calls in the loop pass `i`, which is at most 7. The last call passes
8.

A module variable gets its proof from its first value and its writes. A
ring of 4 slots masks each new value:

```wyst
var next: u64 = 0

fn record(table: @[4]u64) {
  store(@table[next], 1)
  next = (next + 1) & 3
}
```

Without the mask, the checker knows no highest value of the write:

```wyst fails
var next: u64 = 0

fn record(table: @[4]u64) {
  store(@table[next], 1)
  next = next + 1
}
```

```text
main.wyst:5:15: error: the checker cannot prove that this value is less than 4
```

When the end `n` of `for i in a ..< n` is a parameter or a module
variable, the checker proves in the same way that `n` is at most the
length of the array. For an array of 8, a call that passes 9 as `n` gives
the error `the checker cannot prove that this argument is less than 9`.
For `for i in a ..= n`, `n` must be less than the length, so a call that
passes 8 gives the error
`the checker cannot prove that this argument is less than 8`.

No code calls the entry or a naked function, so their parameters have no
proof. When an index gets its value from such a parameter, the error is at
the index. For an array of 8, the error is
`the checker cannot prove that the index is less than 8`.

## Local variables

An assignment can change a local `var`, so the checker keeps no proof of
its highest value, and a condition or a `match` gives it no bound. An
index of a local `var` needs an operator that gives a highest value, such
as a mask:

```wyst
fn fill(table: @[8]u64, count: u64) {
  var i: u64 = 0
  for i != count {
    store(@table[i & 7], i)
    i += 1
  }
}
```

Without the mask, a condition does not prove the index, because an
assignment after the condition can change the local:

```wyst fails
fn mark(table: @[8]u64, start: u64) {
  var i = start
  if i < 7 {
    i += 2
    store(@table[i], 1)
  }
}
```

```text
main.wyst:5:18: error: the checker cannot prove that the index is less than 8
```

When a call passes a local `var`, the argument has no proof, so an index
that uses the parameter gives the error at the call, as
[Parameters and variables](#parameters-and-variables) gives.
