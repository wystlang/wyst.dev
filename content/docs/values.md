---
title: Values and types
summary: Integers, characters, literals, bool, strings, conversions, and never.
---

## Integers

`u8`, `u16`, `u32`, and `u64` are unsigned integers of 8, 16, 32, and 64
bits. `i64` is a signed integer of 64 bits in two's complement, from
-2^63 to 2^63 - 1. These are the integer types of values. There is no
`i8`, `i16`, or `i32`.

An `i64` holds a value that can be less than 0, such as the move of the
pointer from a press. It is the type of a parameter, a local, a constant,
a variable, a result, and a field of a plain struct, as `u64` is. An
index, the amount of a shift, and an address are not an `i64`, and a range
loop and a `match` on an `i64` are not implemented now.

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

A literal is at least 0. `-` before it gives a value less than 0, as in
`-3`, so an `i64` constant can be negative:

```wyst
const back: i64 = -3
const least: i64 = -9223372036854775807 - 1
```

The largest literal of an `i64` is 2^63 - 1, so the constant -2^63
needs an operator, as `least` shows.

## Characters

A character literal, such as `'q'`, is an integer literal. Its value is
one byte: the byte of the character, or of an escape. The escapes are
those of a string, with `\'` in place of `\"`. A character literal takes
its type as each literal does, and it is also a pattern of `match`:

```wyst
fn kind(key: u8) -> u64 {
  match key {
    'n', '\t' {
      return 1
    }
    'q' {
      return 2
    }
  }
  return 0
}
```

A character literal holds one byte, so a character that is two or more
bytes in UTF-8, such as `'é'`, is an error.

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

In memory, as a [field of a plain struct](/docs/structs/#plain-structs)
or at an address `@bool`, a `bool` is one byte. 0 is `false`, and each
other value is `true`. `load` gives `true` or `false`, and `store` writes
1 or 0:

```wyst
struct Card {
  counting: bool
}

fn stop(card: @Card) {
  if load(@card.counting) {
    store(@card.counting, false)
  }
}
```

## No implicit conversions

Wyst does not convert a value from one type to another by itself. `widen`
and `truncate` convert a `uN` to the `uN` type that their position
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

`widen` and `truncate` do not take or give an `i64`. `bitcast` gives the
`i64` with the bits of a `u64`, and the reverse, so a `u64` of 2^63 or more
gives an `i64` less than 0. To get a value less than 0 from `u64` values,
give the operands to `bitcast`. Where the position expects an `i64`, an
operand without a type of its own is a `u64`, so `bitcast(widen(x))` is
the `i64` of a `u32` `x`. Here `signed` gives the `i64` of a 32-bit count
with its sign in bit 31, because `>>` of an `i64` keeps the sign:

```wyst
fn moved(x: u64, press: u64) -> i64 {
  return bitcast(x) - bitcast(press)
}

fn signed(value: u32) -> i64 {
  return bitcast(widen(value) << 32) >> 32
}
```

```wyst fails
fn wide(value: u32) -> i64 {
  return widen(value)
}
```

```text
main.wyst:2:10: error: `widen` cannot make i64 from u32
```

## Strings

A string literal is a sequence of bytes. It has no zero byte at its end,
as a C string has. The escapes are `\n`, `\r`, `\t`, `\0`, `\\`, `\"`, and
`\x` with two hexadecimal digits.

A string literal has the type `string`, and so does a parameter, a local
`const`, a result, and an `if` or `match` value. A `string` value is one
register: the address of its length, which its bytes follow, as
[Code generation](/docs/code-generation/) gives. It is an argument, the
head of a `for` loop, or the operand of `bitcast`, which gives its address
as a `u64`, as [Addresses and memory](/docs/addresses/#bitcast)
describes. A `for` loop on a `string` visits each byte as a `u8`:

```wyst
fn checksum(text: string) -> u8 {
  var sum: u8 = 0

  for byte in text {
    sum += byte
  }

  return sum
}

fn greeting(night: bool) -> string {
  return if night { "Good night\n" } else { "Hello\n" }
}

fn check() -> u8 {
  const text = greeting(false)
  return checksum(text)
}
```

`len(s)` gives the length of the `string` local or parameter `s`, a `u64`,
and `@s[i]` gives the address of its byte `i`, a `@u8`. The compiler must
prove that `i` is less than `len(s)`, as for an index of a slice, which
[Index proofs](/docs/index-proofs/#strings) describes:

```wyst
fn first(text: string) -> u8 {
  if len(text) < 1 {
    return 0
  }
  return load(@text[0])
}
```

A string is read-only data, as a
[constant table](/docs/addresses/#read-only-addresses) is, so a `store`
through the address of one of its bytes is an error:

```wyst fails
fn shout(text: string) {
  if len(text) < 1 {
    return
  }

  store(@text[0], 'A')
}
```

```text
main.wyst:6:9: error: `store` cannot write through this address: it can be the address of a byte of a string, which is read-only data
```

A local `var`, a module variable, a module constant, a field, and an
`Option` cannot be a `string` now, and neither can a slice of a string,
such as `@s[1 ..]`. `string` takes no type arguments, and memory at an
address is not a `string` now, so `string<u8>` and `@string` are errors
too:

```wyst fails
fn greet() {
  var text = "hello\n"
}
```

```text
main.wyst:2:14: error: a local `var` that holds string is not implemented now
```

## Discarding a value

`_` discards a value, and it is never a name. A parameter or a loop
variable `_` gets no name, so a read of `_` is an error:

```wyst fails
fn second(_: u64, b: u64) -> u64 {
  return _
}
```

```text
main.wyst:2:10: error: `_` discards a value, so it cannot be read
```

`_ = value` computes a value and keeps nothing. A declaration, an import,
and a local cannot be `_`. [Locals](/docs/constants-and-variables/#locals)
and [Functions](/docs/functions/#declaring-a-function) give the uses of
`_`.

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
