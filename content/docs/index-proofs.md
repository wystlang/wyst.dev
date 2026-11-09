---
title: Index proofs
summary: How the compiler proves each array and slice index before the program runs.
---

Each index of an array must be less than the length of the array. The
compiler proves this at compile time. When it cannot prove an index, the
build stops. There is no bounds check at run time, so a proved index costs
nothing. Each index of a slice must be less than the length of the slice,
and the start and the end of a slice must be in order and in the array or
the slice that it comes from, as [Slices](#slices) gives.

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
- an `if` or `match` value, which is the largest of the highest values of
  its blocks, each with the bounds of its block;
- a call, which has the highest value of the result of its function, as
  [Results](#results) gives;
- a load of a `u8`, `u16`, or `u32`, which has only the highest value of
  its type;
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

Hostile code or a device can write the memory, so a load of a `u8`,
`u16`, or `u32` has only the highest value of its type. A `u8` from
memory is at most 255:

```wyst
fn mark(table: @[256]u64, cursor: @u8) {
  store(@table[widen(load(cursor))], 1)
}
```

The highest value of a `u64` proves nothing, so a load of a `u64` has no
highest value, as a parameter without a condition. Thus in `load(p) & n`
and after `x < load(p)`, the proof of a parameter `n` or `x` stays. See
[Parameters and variables](#parameters-and-variables). The number of a
load of a `u8`, `u16`, or `u32` replaces the proof of a parameter in `&`,
in a condition, and at the end of a range, as the number of a read of a
field does.

## Operators

These operators give a highest value from the highest values of their
operands:

- `a + b` and `a * b` are at most the sum and the product of the highest
  values of `a` and `b`, when it fits in the type. Else the value can
  wrap, and the checker knows no highest value;
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

Thus the bounds of loops prove an index into a grid: `row` is at most 2
and `column` at most 3, so `row * 4 + column` is at most 11:

```wyst
const rows: u64 = 3
const columns: u64 = 4

fn clear(table: @[12]u64) {
  for row in 0 ..< rows {
    for column in 0 ..< columns {
      store(@table[row * columns + column], 0)
    }
  }
}
```

`a - b` has no highest value, because it wraps when `b` is more than `a`.
Thus a division that rounds up is `(x + (n - 1)) / n`, where `n - 1` is a
constant. Here `count` is at most 32, so `(count + 7) / 8` is at most 4:

```wyst
fn mark(table: @[4]u64, count: u64) {
  if count > 32 {
    return
  }

  for i in 0 ..< (count + (8 - 1)) / 8 {
    store(@table[i], 1)
  }
}
```

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

A block of an `if` value has the bounds of its condition, and the value
has the largest of the highest values of its blocks, so it can be an
index:

```wyst
fn mark(table: @[4]u64, cursor: @u64) {
  const at = load(cursor)
  store(@table[if at < 4 { at } else { 0 }], 1)
}
```

For an index of an array, `e` must have a highest value that is a
number, such as a constant or a mask. A parameter or a module variable as
`e` gives no number. A condition gives no bound to a module variable. A
local `e` that is not a `var`, such as a parameter or `len(s)`, also
gives `x` a bound against `e`, which proves an index of a slice, as
[Slices](#slices) gives.

`x` can also be the sum `a + b` of two parameters, loop variables, or
`const` locals. The bound then holds for each `a + b` and `b + a` of the
same type, because `a` and `b` do not change. A sum in another type, such
as `widen(a) + widen(b)` of two `u8` values, wraps at another value, so
the bound of `a + b` is not its bound. Thus a range loop that ends at the
sum proves its variable:

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

Without the condition, a load of a `u64` has no highest value:

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

## Results

The checker infers the highest value of a function result: the largest
of the highest values of its `return` values, each with the bounds at its
`return`. Each call of the function has that number, so a call can be an
index, an operand of an operator, or an argument. Here the condition
gives the result of `current` the highest value 3, so
`current() * slots + slot` is at most 15:

```wyst
const cpus: u64 = 4
const slots: u64 = 4

#[sysreg]
const MPIDR_EL1: readonly u64 {
  Aff0: u8 at 0..=7
}

fn current() -> u64 {
  const n: u64 = widen(MPIDR_EL1.read().Aff0)
  if n >= cpus { trap() }

  return n
}

fn clear(table: @[cpus * slots]u64) {
  const first = current() * slots

  for slot in 0 ..< slots {
    store(@table[first + slot], 0)
  }
}
```

Each `return` value needs a highest value that is a number, as an operand
of `+` does. A module variable, or a parameter without a condition, gives
no number, so the result of `same` has no highest value:

```wyst fails
fn same(x: u64) -> u64 {
  return x
}

fn mark(table: @[4]u64) {
  store(@table[same(1)], 1)
}
```

```text
main.wyst:6:16: error: the checker cannot prove that the index is less than 4
```

The checker finds the result of each function after the functions that
it calls. A function that calls itself, also through other functions,
gives its result no highest value, although each `return` value of
`depth` is at most 3:

```wyst fails
fn depth(n: u64) -> u64 {
  if n == 0 { return 0 }
  return depth(n - 1) & 3
}

fn mark(table: @[4]u64) {
  store(@table[depth(5)], 1)
}
```

```text
main.wyst:7:16: error: the checker cannot prove that the index is less than 4
```

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

## Slices

The checker must prove that each index `i` of `@s[i]` is less than
`len(s)`. For a [slice](/docs/addresses/#slices) `@a[x ..< y]`, it must
prove that `x <= y`, and that `y` is at most `N` for an array `[N]T`, or
at most `len(a)` for a slice `a`.

The length of a slice is known only at run time, so the proof is a bound
against a local: a key is less than, or at most, the value of a local
that is not a `var`, such as `len(s)`. A key is a parameter, a loop
variable, a `const` local, the length of a slice, or the sum of two of
them. The key and the local do not change, so the bound holds while they
are in scope.

When `n` is such a local, `for i in a ..< n` gives `i < n`, and
`for i in a ..= n` gives `i <= n`. `i` also gets each bound of `n`. Thus
`for i in 0 ..< len(s)` proves `@s[i]`:

```wyst
fn clear(bytes: []u8) {
  for i in 0 ..< len(bytes) {
    store(@bytes[i], 0)
  }
}
```

A condition gives a bound as it gives a highest value: `x < e`, `x <= e`,
or `x == e`, with `x` on either side, also after an `if` whose body
cannot reach its end, and with `&&` and `||`, as [Conditions](#conditions)
gives:

```wyst
fn get(bytes: []u8, i: u64) -> u8 {
  if i >= len(bytes) { return 0 }
  return load(@bytes[i])
}
```

`x` also gets each bound of `e`. Here `len(from)` is at most `len(to)`, so
`i` is less than `len(to)`:

```wyst
fn copy(from: []u8, to: []u8) {
  if len(from) > len(to) { trap() }

  for i in 0 ..< len(from) {
    store(@to[i], load(@from[i]))
  }
}
```

In the same way, after `if end > len(s) { trap() }`, the variable of
`for i in start ..< end` is less than `len(s)`. A `const` local keeps the
bounds of its value, and the length of a slice local keeps the bounds of
the length of its value. Thus after `const head = @s[..< end]`,
`len(head)` is at most `len(s)`, and `i < len(head)` also proves `@s[i]`.

A copy of a slice is another slice. For `const other = bytes`,
`i < len(bytes)` does not prove `@other[i]`:

```wyst fails
fn mark(bytes: []u8, i: u64) {
  const other = bytes

  if i < len(bytes) {
    store(@other[i], 1)
  }
}
```

```text
main.wyst:5:18: error: the checker cannot prove that the index is less than the length of `other`
```

`x > c`, `x >= c`, or `x == c`, with `x` on either side, gives a local `x`
the lowest value `c + 1` or `c`, where `c` is a constant or a local with
a lowest value. An index or an end with a highest value that is a number
is correct when it is less than, or at most, the lowest value of the
length. Thus after `if len(s) < 4 { trap() }`, `@s[3]` and `@s[4 ..]` are
correct:

```wyst
fn header(bytes: []u8) -> u64 {
  if len(bytes) < 4 { trap() }

  const body = @bytes[4 ..]
  return widen(load(@bytes[3])) + len(body)
}
```

`x != c` gives no lowest value, so `if len(s) == 0 { return }` does not
prove `@s[0]`. `if len(s) < 1 { return }` proves it.

`x <= y` holds when `x` is 0, when `y` is a constant and `x` is at most
`y`, or when `x` has a bound against the local `y`, as after
`if x > y { return }`:

```wyst
fn part(bytes: []u8, from: u64, to: u64) -> []u8 {
  if to > len(bytes) || from > to { trap() }
  return @bytes[from ..< to]
}
```

Two highest values do not put a start and an end in order:

```wyst fails
fn part(table: @[4]u8, from: u64, to: u64) -> []u8 {
  if from > 4 || to > 4 { trap() }
  return @table[from ..< to]
}
```

```text
main.wyst:3:17: error: the checker cannot prove that the start of the slice is at most its end
```

An assignment can change a `var`, so a `var` gets no bound, and no bound
is against a `var`. Thus `@s[i]` with a `var` `i` is an error, also after
`i < len(s)`:

```wyst fails
fn clear(bytes: []u8) {
  var i: u64 = 0
  for i < len(bytes) {
    store(@bytes[i], 0)
    i += 1
  }
}
```

```text
main.wyst:4:18: error: the checker cannot prove that the index is less than the length of `bytes`
```
