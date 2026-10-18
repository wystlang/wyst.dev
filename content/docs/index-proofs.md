---
title: Index proofs
summary: How the compiler proves each array index before the program runs.
---

Each index of an array must be less than the length of the array. The
compiler proves this at compile time. When it cannot prove an index, the
build stops. There is no bounds check at run time, so a proved index costs
nothing.

The same rule applies to an index of an array of devices, as in
`redistributors[cpu]`. See [Registers and devices](/docs/registers/).

## What the checker knows

The checker knows the highest value of:

- a constant;
- `a & b`, which is at most the highest value of `a` or of `b`;
- `widen(x)`, which keeps the proof of `x`;
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

## Operators

These operators give a highest value from the highest values of their
operands:

- `x % n` is less than the constant `n`, for each `x`;
- `x / n` is at most the highest value of `x` divided by `n`, and `x >> k`
  is at most that value shifted right by `k`;
- `a << k` is at most the highest value of `a` shifted left by `k`, when
  no set bit moves out of the type. Else the value can wrap, and the
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
