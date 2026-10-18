---
title: Operators
summary: Arithmetic that wraps, division, remainder, shifts, comparisons, precedence, and assignment.
---

The operators take two operands of the same type and give that type, or a
`bool` for a comparison. No operator has undefined behavior, and no
operator can fail at run time. An operand can be a call, as
[Functions](/docs/functions/#results-must-be-used) shows.

## Arithmetic

`+`, `-`, and `*` wrap modulo 2^N for a `uN` value. For `x` equal to 255,
this function gives 0:

```wyst
fn next(x: u8) -> u8 {
  return x + 1
}
```

`a / b` divides without sign and drops the remainder, and `a % b` gives
that remainder. `b` must be a constant other than 0, so a division cannot
fail:

```wyst
const slots: u64 = 6

fn slot(ticket: u64) -> u64 {
  return ticket % slots
}
```

```wyst fails
fn share(total: u64, parts: u64) -> u64 {
  return total / parts
}
```

```text
main.wyst:2:16: error: the divisor of `/` must be a literal or a module constant
```

`-a` is `0 - a`, so it wraps as `-` does: for `x` equal to 1, `-x` in a
`u8` is 255. It is also `~a + 1`, so `x & -x` keeps only the lowest set
bit of `x`:

```wyst
fn lowest_bit(x: u64) -> u64 {
  return x & -x
}
```

## Bits

`&`, `|`, and `^` are bitwise AND, OR, and exclusive OR. `~a` is the
bitwise complement, in the bits of the type of `a`. `x ^ 1` changes only
the low bit, so it gives the other entry of a pair:

```wyst
fn partner(entry: u64) -> u64 {
  return entry ^ 1
}
```

`a << k` and `a >> k` shift `a` by `k` bits. `k` has the type of `a`, and
it must be less than the width of that type. `<<` drops the bits that move
out of the type, and `>>` puts zeros in the high bits.

```wyst
const page_shift: u64 = 14

fn page(address: u64) -> u64 {
  return address >> page_shift
}

fn offset(address: u64) -> u64 {
  return address & ((1 << page_shift) - 1)
}
```

When `k` is not a constant, the compiler must prove that it is less than
the width, as it proves an index: see
[Index proofs](/docs/index-proofs/). Here the loop gives `core` the highest
value 3, so `1 << core` is a correct shift of a `u64`:

```wyst
const cores: u64 = 4

fn mark_all(masks: @[cores]u64) {
  for core in 0 ..< cores {
    store(@masks[core], 1 << core)
  }
}
```

```wyst fails
fn bit(cursor: @u64) -> u64 {
  return 1 << load(cursor)
}
```

```text
main.wyst:2:12: error: the checker cannot prove that the amount of `<<` is less than 64
```

## Comparisons

`==`, `!=`, `<`, `<=`, `>`, and `>=` compare two integers of the same type
and give a `bool`. `<`, `<=`, `>`, and `>=` are unsigned. A `bool` is
not an integer, so `==` and `!=` do not take it: use the `bool` itself,
or `!`. Comparisons do not chain: `a < b < c` is an error.

`==` and `!=` also compare two values of one
[enum](/docs/enums-and-bit-structs/#enums). A variant takes the enum of
the other operand, such as a field of enum type:

```wyst
enum MemoryType: u3 {
  Normal = 0
  Device = 1
}

#[bits]
struct Entry: u64 {
  AttrIndx: MemoryType at 2..=4
}

fn normal(value: u64) -> bool {
  const entry: Entry = value
  return entry.AttrIndx == .Normal
}
```

## Logical operators

`!` gives the other `bool`. `a && b` is true when `a` and `b` are true, and
`a || b` is true when `a` or `b` is true. They take two `bool` values and
give a `bool`.

The code computes `b` only when `a` does not give the value: when `a` is
true for `&&`, or false for `||`. Thus `a` can guard `b`. Here the load
runs only when the index is less than 4, and the checker uses that bound,
as [Index proofs](/docs/index-proofs/#conditions) shows:

```wyst
fn ready(table: @[4]u64, i: u64) -> bool {
  return i < 4 && load(@table[i]) != 0
}
```

An operand of `&&` or `||` can be a call with a `bool` result, as an
operand of `!` can. Here `idle` runs only when `count` is 0:

```wyst
fn idle() -> bool {
  return true
}

fn busy(count: u64) -> bool {
  return count != 0 || !idle()
}
```

## Precedence

From the lowest to the highest precedence:

| Level | Operators |
| --- | --- |
| 1 | `\|\|` |
| 2 | `&&` |
| 3 | `==` `!=` `<` `<=` `>` `>=` |
| 4 | `\|` |
| 5 | `^` |
| 6 | `&` |
| 7 | `<<` `>>` |
| 8 | `+` `-` |
| 9 | `*` `/` `%` |

Each level groups from the left. Unary operators bind tighter, and a
field, an index, or a call binds tightest. `&&` and `||` bind more loosely
than the comparisons, so `a < 4 || b == 0 && c` is
`(a < 4) || ((b == 0) && c)`. Unlike C, `&` binds tighter than `==`, so
`x & 1 == 1` tests the low bit of `x`:

```wyst
fn odd(x: u64) -> bool {
  return x & 1 == 1
}
```

## Constants

The compiler computes an operator on constants. A constant `+`, `-`, or
`*` that wraps, or a constant `<<` that moves a set bit out of the type, is
an error. Such a constant is almost always a mistake:

```wyst fails
const top: u8 = 0xff + 1
```

```text
main.wyst:1:22: error: 255 + 1 does not fit in u8
```

At run time, the same operation wraps.

A constant `-a` is `0 - a`, so it is an error unless `a` is 0:

```wyst fails
const all: u8 = -1
```

```text
main.wyst:1:17: error: -1 does not fit in u8
```

For a value with each bit of its type set, write `~0`:

```wyst
const all: u8 = ~0
```

## Assignment

An assignment is a statement. It changes a module variable, and nothing
else can change, because a local `var` and a `mut` parameter are not
implemented now:

| Form | Meaning |
| --- | --- |
| `name = value` | Gives `name` the value. |
| `name += value` | `name = name + value` |
| `name -= value` | `name = name - value` |

`value` has the type of the variable, and a literal takes that type. `+=`
and `-=` wrap modulo 2^N, as `+` and `-` do. For `credits` equal to 0,
`spend` gives it the value 255:

```wyst
var ticks: u64 = 0
var credits: u8 = 3

pub fn tick(n: u64) {
  ticks += n
}

pub fn spend() {
  credits -= 1
}
```

A parameter and a local cannot change now, so an assignment to one is an
error:

```wyst fails
fn count(limit: u64) {
  limit -= 1
}
```

```text
main.wyst:2:3: error: cannot assign to parameter `limit`
```

The grammar also has `*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `<<=`, and `>>=`.
They are not implemented now. Write `name = name * value` in their place.
