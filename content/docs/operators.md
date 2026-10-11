---
title: Operators
summary: Arithmetic that wraps, division and shifts by constants, comparisons, precedence, and assignment.
---

The operators take two operands of the same type and give that type, or a
`bool` for a comparison. No operator has undefined behavior, and no
operator can fail at run time.

A call with a value result cannot be an operand now. Put its result in a
local first, as [Functions](/docs/functions/#results-must-be-used) shows.

## Arithmetic

`+`, `-`, and `*` wrap modulo 2^N for a `uN` value. For `x` equal to 255,
this function gives 0:

```wyst
fn next(x: u8) -> u8 {
  return x + 1
}
```

`a / b` divides without sign and drops the remainder. `b` must be a
constant other than 0, so a division cannot fail:

```wyst fails
fn share(total: u64, parts: u64) -> u64 {
  return total / parts
}
```

```text
main.wyst:2:16: error: the divisor of `/` must be a literal or a module constant
```

`%` and unary `-` are not implemented now.

## Bits

`&` and `|` are bitwise AND and OR. `~a` is the bitwise complement, in the
bits of the type of `a`. `^` is not implemented now.

`a << k` and `a >> k` shift `a` by `k` bits. `k` has the type of `a`, and
it must be a constant less than the width of that type. `<<` drops the
bits that move out of the type, and `>>` puts zeros in the high bits.

```wyst
const page_shift: u64 = 14

fn page(address: u64) -> u64 {
  return address >> page_shift
}

fn offset(address: u64) -> u64 {
  return address & ((1 << page_shift) - 1)
}
```

## Comparisons

`==`, `!=`, `<`, `<=`, `>`, and `>=` compare two integers of the same type
and give a `bool`. `<`, `<=`, `>`, and `>=` are unsigned. `==` and `!=`
on a `bool` are not implemented now. Comparisons do not chain:
`a < b < c` is an error.

`!` gives the other `bool`. `&&` and `||` are not implemented now. Use
nested `if` statements, or an early `return`.

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
field, an index, or a call binds tightest. Unlike C, `&` binds tighter than
`==`, so `x & 1 == 1` tests the low bit of `x`:

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

## Assignment

An assignment is a statement. It changes a module variable, and nothing
else can change:

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

A parameter and a local cannot change, so an assignment to one is an
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
