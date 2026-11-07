---
title: Operators
summary: Arithmetic that wraps, division, remainder, shifts, comparisons, precedence, and assignment.
---

The operators take two operands of the same type and give that type, or a
`bool` for a comparison. No operator has undefined behavior, and only a
division by 0 can fail at run time. An operand can be a call, as
[Functions](/docs/functions/#results-must-be-used) shows.

## Arithmetic

`+`, `-`, and `*` wrap modulo 2^N for a `uN` value, and modulo 2^64 for
an `i64`. For `x` equal to 255, this function gives 0:

```wyst
fn next(x: u8) -> u8 {
  return x + 1
}
```

`a / b` divides and drops the remainder, and `a % b` gives that
remainder. For a `uN`, it divides without sign. For an `i64`, it divides
with the sign and rounds toward 0, and the remainder has the sign of `a`:
`-7 / 2` is -3, and `-7 % 2` is -1. -2^63 / -1 wraps to -2^63. When `b` is
0 at run time, the code traps, as `trap()` does:

```wyst
const slots: u64 = 6

fn slot(ticket: u64) -> u64 {
  return ticket % slots
}

fn share(total: u64, parts: u64) -> u64 {
  return total / parts
}

fn scaled(moved: i64, strip: i64, track: i64) -> i64 {
  return moved * strip / track
}
```

A constant divisor of 0 is an error:

```wyst fails
fn none(total: u64) -> u64 {
  return total / 0
}
```

```text
main.wyst:2:16: error: the divisor of `/` is 0
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
out of the type, and `>>` puts zeros in the high bits of a `uN`. `>>` of an
`i64` keeps the sign: it copies the sign bit into the high bits, so
`-3 >> 1` is -2. The amount of a shift is not an `i64`, so the amount of
a shift of an `i64` is a constant.

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
and give a `bool`. `<`, `<=`, `>`, and `>=` compare a `uN` without sign,
and an `i64` with the sign. A `bool` is not an integer, so `==` and `!=`
do not take it: use the `bool` itself, or `!`. Comparisons do not chain:
`a < b < c` is an error.

```wyst
fn width(start: i64, moved: i64) -> u64 {
  const wanted = start + moved
  if wanted < 0 {
    return 0
  }

  return bitcast(wanted)
}
```

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

For an `i64`, a constant `+`, `-`, `*`, `<<`, or `-a` whose value is not
from -2^63 to 2^63 - 1 is an error:

```wyst fails
const below: i64 = -9223372036854775807 - 2
```

```text
main.wyst:1:41: error: -9223372036854775807 - 2 does not fit in i64
```

## Assignment

An assignment is a statement. It changes a local `var` or a module
variable. No other name can change, because a `mut` parameter is not
implemented now, and an assignment to a field or an element is an error:
only `store` changes memory.

| Form | Meaning |
| --- | --- |
| `name = value` | Gives `name` the value. |
| `name op= value` | `name = name op value`, for each `op` of `+`, `-`, `*`, `/`, `%`, `&`, `\|`, `^`, `<<`, and `>>`. |

`value` has the type of the variable, and a literal takes that type. A
compound assignment has the rules of its operator: `+=`, `-=`, and `*=`
wrap modulo 2^N, `/=` and `%=` trap on a divisor of 0 at run time, and an
amount of `<<=` or `>>=` that is not a constant needs a proof. For
`credits` equal to 0, `spend` gives it the value 255:

```wyst
var ticks: u64 = 0
var credits: u8 = 3
var ready: u64 = 0

pub fn tick(n: u64) {
  ticks += n
}

pub fn spend() {
  credits -= 1
}

pub fn mark(slot: u64) {
  ready |= 1 << slot % 64
}
```

The value of an assignment to a local `var` can read the local:

```wyst
fn grow(seed: u64) -> u64 {
  var x = seed
  x = x * 3 + x

  return x
}

fn ones(word: u64) -> u64 {
  var rest = word
  var count: u64 = 0

  for rest != 0 {
    count += rest & 1
    rest >>= 1
  }

  return count
}
```

`value` is one operand, so `x <<= 8 | b` is `x = x << (8 | b)`. To shift
`x` and then add the bits of `b`, write `x = x << 8 | b`:

```wyst
const width: u64 = 4

fn gather(bytes: @[width]u8) -> u64 {
  var value: u64 = 0

  for i in 0 ..< width {
    value = value << 8 | widen(load(@bytes[i]))
  }

  return value
}
```

A parameter and a `const` local cannot change, so an assignment to one is
an error:

```wyst fails
fn count(limit: u64) {
  limit -= 1
}
```

```text
main.wyst:2:3: error: cannot assign to parameter `limit`
```
