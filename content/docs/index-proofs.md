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
- `x & m`, where `m` is a constant;
- the variable `i` of `for i in a ..< n`, which is `h - 1` when the checker
  knows the highest value `h` of `n`;
- a `const` local, which keeps the proof of its value.

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

## Conditions

The condition of an `if` gives a bound to a local `x` when it compares `x`
with an expression whose highest value the checker knows: `x < e`,
`x <= e`, or `x == e`, with `x` on either side, and `!` of a comparison.
The bound holds in the body of the `if`.

```wyst
fn mark(table: @[4]u64, cursor: @u64) {
  const at = load(cursor)
  if at < 4 {
    store(@table[at], 1)
  }
}
```

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

The entry is called by no code, so its parameters have no proof.
