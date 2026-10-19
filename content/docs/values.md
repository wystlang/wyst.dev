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

The prefixes are lowercase, so `0X10` is an error that gives the prefix
`0x`.

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

A variant, such as `.Some(1)`, also takes the type that its position
expects, such as the result type of `return`. Where no type is expected,
it is an error, also with `?` and as a statement:

```wyst fails
fn start() {
  const frame = .Some(1)
}
```

```text
main.wyst:2:17: error: the type of `.Some` is not known here
```

## Booleans

`bool` has two values, `true` and `false`. `!` gives the other value. A
`bool` is not an integer, so `&`, `|`, `+`, `==`, and `!=` do not take it.
Use the `bool` itself, or `!`.

```wyst
var ready: bool = false

fn toggle() {
  ready = !ready
}
```

```wyst fails
fn done(ready: bool) -> bool {
  return ready == true
}
```

```text
main.wyst:2:16: error: `==` takes only integers and enums, found bool
```

## No implicit conversions

Wyst does not convert a value from one type to another by itself. `widen`
and `truncate` convert an integer to the integer type that their position
expects:

- `widen(x)` gives `x` in a type that is at least as wide. For a value
  of an enum, it gives the value of the enum value.
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

A string literal has the type `string`. `string` is only the type of a
parameter now, so a string literal is the argument of a `string` parameter
or the head of a `for` loop. A `for` loop on a `string` visits each byte
as a `u8`:

```wyst
var sum: u8 = 0

fn checksum(text: string) {
  for byte in text {
    sum += byte
  }
}

fn check() {
  checksum("Wyst\n")
}
```

A local, a variable, a field, and a result cannot have the type `string`
now. `string` takes no type arguments, and memory at an address is not a
`string` now, so `string<u8>` and `@string` are errors too:

```wyst fails
fn greet() {
  const text = "hello\n"
}
```

```text
main.wyst:2:16: error: `string` is only the type of a parameter now
```

## Discarding a value

`_` discards a value, and it is never a name. A parameter, a local, or a
loop variable `_` gets no name, so a read of `_` is an error:

```wyst fails
fn second(_: u64, b: u64) -> u64 {
  return _
}
```

```text
main.wyst:2:10: error: `_` discards a value, so it cannot be read
```

A declaration and an import cannot be `_`.
[Locals](/docs/constants-and-variables/#locals) and
[Functions](/docs/functions/#declaring-a-function) give the uses of `_`.

## never

`never` is the type of a function that does not return, such as a function
that loops forever or stops the machine. See [Functions](/docs/functions/).

## Bit field types

A bit field of a register or of a `#[bits]` struct can also have the type
`uN`, an unsigned value of N bits with N from 1 to 64, or an enum. When N
is not 8, 16, 32, or 64, `uN` is only for bit fields, so a parameter, a
local, a constant, a variable, a result, and a type argument cannot have
it:

```wyst fails
fn bit(core: u64) -> u4 {
  return 1
}
```

```text
main.wyst:1:22: error: `u4` is only the type of a bit field
```

An enum is also the type of a module constant, a parameter, a local, a
result, and a field of a plain struct. See
[Enums and bit structs](/docs/enums-and-bit-structs/#enum-values).

A read of a `uN` field gives a `uN` value, and a read of an enum field
gives a value of the enum. An operator, a comparison, and `widen` take a
`uN` value. When N is not 8, 16, 32, or 64, a local cannot hold the
value:

```wyst fails
#[bits]
struct Entry: u64 {
  Low: u5 at 0..=4
}

fn low(slot: @u64) {
  const entry: Entry = load(slot)
  const low = entry.Low
}
```

```text
main.wyst:8:15: error: a local cannot hold u5; `widen` gives a wider value
```

Use `widen`:

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
