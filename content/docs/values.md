---
title: Values and types
summary: Integers, literals, bool, strings, conversions, and never.
---

## Integers

`u8`, `u16`, `u32`, and `u64` are unsigned integers of 8, 16, 32, and 64
bits. They are the integer types of values now. Signed integers are not
implemented now.

An integer literal is decimal, hexadecimal with `0x`, or binary with `0b`.
`_` can separate the digits:

```wyst
const mask: u8 = 0b1010_0101
const port: u16 = 0xffff
const rate: u32 = 115_200
const uart: u64 = 0x0900_0000
```

## Literals take their type

A literal has no type of its own. It takes the type that its position
expects, and it must fit in that type:

```wyst fails
const limit: u8 = 256
```

```text
main.wyst:1:19: error: 256 does not fit in u8
```

A literal with no expected type is an error, so a constant of a literal
needs a type:

```wyst fails
fn start() {
  const count = 4
}
```

```text
main.wyst:2:17: error: the type of this integer is not known
```

In an operator, a literal takes the type of the other operand:
`x + 1` has the type of `x`.

## Booleans

`bool` has two values, `true` and `false`. `!` gives the other value. A
`bool` is not an integer, so `&`, `|`, and `+` do not take it. `==` and
`!=` on a `bool` are not implemented now. Use the `bool` itself, or `!`.

```wyst
var ready: bool = false

fn toggle() {
  ready = !ready
}
```

## No implicit conversions

Wyst does not convert a value from one type to another by itself. `widen`
and `truncate` convert an integer to the integer type that their position
expects:

- `widen(x)` gives `x` in a type that is at least as wide.
- `truncate(x)` gives the low bits of `x` in a type that is at most as
  wide. The compiler does not check the bits that it removes.

```wyst
fn low_byte(x: u64) -> u8 {
  const low: u8 = truncate(x)
  return low
}

fn bits(count: u32) -> u64 {
  const total: u64 = widen(count)
  return total * 8
}
```

A value of the wrong type is an error:

```wyst fails
fn low_byte(x: u64) -> u8 {
  return x
}
```

```text
main.wyst:2:10: error: expected u8, found u64
```

## Strings

A string literal is a sequence of bytes. It has no zero byte at its end,
as a C string has. The escapes are `\n`, `\r`, `\t`, `\0`, `\\`, `\"`, and
`\x` with two hexadecimal digits.

A string literal can only be the head of a `for` loop now. The loop visits
each byte as a `u8`:

```wyst
var sum: u8 = 0

fn checksum() {
  for byte in "Wyst\n" {
    sum += byte
  }
}
```

## never

`never` is the type of a function that does not return, such as a function
that loops forever or stops the machine. See [Functions](/docs/functions/).

## Bit field types

A bit field of a register or of a `#[bits]` struct can also have the type
`uN`, an unsigned value of N bits with N from 1 to 64, or an enum. `uN`
is only for bit fields. An enum is also the type of a module constant.
See [Enums and bit structs](/docs/enums-and-bit-structs/).

A read of a `uN` field gives a `uN` value. A read of an enum field gives
the backing `uN` of the enum. An operator, a comparison, and `widen` take
a `uN` value. When N is not 8, 16, 32, or 64, a parameter, a local, or a
variable cannot hold the value. Use `widen`:

```wyst
#[bits]
struct Entry: u64 {
  Low: u5 at 0..=4
}

fn low(slot: @u64) -> u8 {
  const entry: Entry = load(slot)
  const low: u8 = widen(entry.Low)
  return low
}
```
