---
title: Enums and bit structs
summary: Named values of a bit field, and named bits of an integer.
---

## Enums

An enum gives names to values, in place of numbers: the values of a bit
field, and kinds, such as the kinds of a kernel object. It has a backing
type `uN`, and each variant has a value that fits in it. An
enum without a backing type, a variant without a value, a variant value
that is not an integer literal, and a variant with values, such as
`Ok(u64)`, are not implemented now:

```wyst
enum Shareability: u2 {
  Non = 0
  Outer = 2
  Inner = 3
}
```

No two variants have the same name or the same value. A variant name can
start with a digit, such as `16K`. Such a name is valid only after `.` and
as a variant, so a reader does not take it for a number:

```wyst
enum Granule: u2 {
  4K = 0
  64K = 1
  16K = 2
}
```

A field of enum type takes `.Variant`, such as `TG0 = .16K`, or a value
of the enum type. It does not take an integer, so code cannot write a
reserved value that has no variant. A read of an enum field gives a value
of the enum.

`==` and `!=` compare two values of one enum. A variant takes the enum of
the other operand, on either side:

```wyst
enum Granule: u2 {
  4K = 0
  64K = 1
  16K = 2
}

#[sysreg]
const TCR_EL1: readwrite u64 {
  TG0: Granule at 14..=15
}

fn uses_16k() -> bool {
  return TCR_EL1.read().TG0 == .16K
}
```

No other operator takes an enum. `widen(e)` gives the value of `e` as an
integer of at least its width, such as `widen(TCR_EL1.read().TG0)`.

## Enum values

An enum is a type of values. A parameter, a local, a result, and a field
of a plain struct can have an enum type, as a bit field and a module
constant can. A field of a plain struct needs a backing type of 8, 16, 32,
or 64 bits, as memory holds:

```wyst
enum Kind: u16 {
  Free = 0
  Memory = 1
  Channel = 2
}

struct Slot {
  object: u64
  kind: Kind
}

fn take(slot: @Slot, kind: Kind) -> bool {
  if load(@slot.kind) != .Free {
    return false
  }

  store(@slot.kind, kind)

  return true
}

fn grant(slot: @Slot) -> bool {
  return take(slot, .Memory)
}
```

A value of an enum can be a value that no variant has. The hardware can
hold one in a field, and another domain can write one in a message. Thus
a `match` on an enum takes the variants as its patterns, and `_` takes
each other value:

```wyst
enum Call: u16 {
  Wait = 4
  Send = 11
}

#[sysreg]
const ESR_EL1: readonly u64 {
  imm16: Call at 0..=15
}

fn known() -> bool {
  match ESR_EL1.read().imm16 {
    .Wait, .Send { return true }
    _ { return false }
  }
}
```

An enum is also the type of the value of `Some` of an
[`Option`](/docs/options/), as in `Option<Call>`. A module variable of an
enum type is not implemented now.

## Enum constants

A constant of an enum type
takes `.Variant` or a constant of the same enum type. Thus one module
gives the value of a field that another module writes, such as a fact of
the target hardware.

A module that imports module `m` names the `pub` enum `E` of `m` as `m.E`:

```wyst platform/target.wyst
pub enum PhysicalBits: u3 {
  36Bits = 1
  40Bits = 2
  42Bits = 3
}

// The CPU of the target has 40-bit physical addresses.
pub const physical_bits: PhysicalBits = .40Bits
```

```wyst
import platform.target

#[sysreg]
const TCR_EL1: readwrite u64 {
  IPS: target.PhysicalBits at 32..=34
}

fn init() {
  TCR_EL1.write(IPS = target.physical_bits)
}
```

A constant of an enum type does not take an integer:

```wyst fails
enum Granule: u2 {
  4K = 0
  64K = 1
  16K = 2
}

const granule: Granule = 3
```

```text
main.wyst:7:26: error: expected Granule, found an integer
```

## Bit structs

A `#[bits] struct` gives names to the bits of an integer, such as an
entry of a translation table or the size of a display. The type after `:`
is the backing type, and the body has bit fields, as a register has:

```wyst
enum EntryType: u2 {
  Block = 1
  Page = 3
}

enum Shareability: u2 {
  Non = 0
  Outer = 2
  Inner = 3
}

#[bits]
struct Entry: u64 {
  Type: EntryType    at 0..=1
  SH:   Shareability at 8..=9
  AF:   bool         at 10    = true
  UXN:  bool         at 54
}

const code: Entry = { Type = .Page, SH = .Inner }
const data: Entry = { Type = .Page, SH = .Inner, UXN = true }

static_assert(code == 0x703)
static_assert(data.UXN)
```

- The backing type is `u8`, `u16`, `u32`, or `u64`. For another width,
  use the next of these types and leave the high bits without a field.
- The fields follow the rules of a register map, inside the backing type.
  A field with `= value` is fixed, and a bit position can be a
  [constant that the compiler computes](/docs/registers/#computed-positions).

The compiler gives a bit struct its fields in declaration order, as it
gives a constant its value. Thus a constant of the struct type comes after
the struct:

```wyst fails
const data: Entry = { UXN = true }

#[bits]
struct Entry: u64 {
  UXN: bool at 54
}
```

```text
main.wyst:1:13: error: `Entry` is used before its declaration
```

## Literals

A literal `{FIELD = value}` makes a value of the struct type. Each field
that the literal does not name is zero, or its fixed value. The literal
cannot name a fixed field, and an enum field takes only a value of its
enum. When each field is fixed, `{}` is the only literal.

A field value can be known only at run time, such as a parameter or a
`load`. A field of type `uN` takes an integer of at most N bits, or a
wider integer that the checker proves is less than 2^N, as it proves an
[index](/docs/index-proofs/). Else `truncate` gives the low N bits:

```wyst
#[bits]
struct Size: u64 {
  WIDTH:  u16 at 0..=15
  HEIGHT: u16 at 16..=31
}

fn size(width: u64, rows: @u64) -> Size {
  if width > 4096 {
    trap()
  }
  return { WIDTH = width, HEIGHT = truncate(load(rows)) }
}
```

The code puts each such value in its field with a shift and one `orr`,
and then adds the constant bits with one `orr`. A wider value without a
proof is an error. A load from memory has only the highest value of its
type:

```wyst fails
#[bits]
struct Size: u64 {
  WIDTH:  u16 at 0..=15
  HEIGHT: u16 at 16..=31
}

fn size(rows: @u64) -> Size {
  return { WIDTH = 640, HEIGHT = load(rows) }
}
```

```text
main.wyst:8:34: error: the checker cannot prove that the field value is less than 65536
```

Each field value of a module constant is a value that the compiler
computes, such as a literal or another constant.

## Values

A bit struct is a value of its backing type with names for its bits. A
parameter, a result, a local, a local `var`, and a field of a plain
struct can have the struct type, as a module constant can. A field of a
plain struct holds the backing integer, and `load` and `store` of the
field read and write it:

```wyst
#[bits]
struct Size: u64 {
  WIDTH:  u16 at 0..=15
  HEIGHT: u16 at 16..=31
}

struct Column {
  left: u64
  sheet: Size
}

fn half(size: Size) -> Size {
  return { WIDTH = size.WIDTH / 2, HEIGHT = size.HEIGHT }
}

fn shrink(column: @Column) {
  var size = load(@column.sheet)
  if size.WIDTH > 640 {
    size = half(size)
  }

  store(@column.sheet, size)
}
```

`x.F` reads field `F` of `x`, a value of the struct type, as from a
register snapshot: a local, a parameter, a constant, a call, or a `load`,
such as `load(@column.sheet).WIDTH`. `x` can also be `m.c`, a `pub`
constant of an imported module, or a call of a function of an imported
module that gives the struct type. A local without a type, such as
`var size` above, keeps the struct type of its value.

Each other use of a value of the struct type gives the backing type, and
a value that is not a literal, such as `load(slot)` of a `@u64`, has the
backing type. Thus a table of entries can be an array of `u64`, and
`frame | data` makes an entry for the address `frame`:

```wyst
#[bits]
struct Entry: u64 {
  Valid: bool at 0
  AF:    bool at 10 = true
  UXN:   bool at 54
}

const data: Entry = { Valid = true, UXN = true }

fn map(table: @[2048]u64, index: u64, frame: u64) {
  store(@table[index & 2047], frame | data)
}

fn executable(slot: @u64) -> bool {
  const entry: Entry = load(slot)
  return !entry.UXN
}
```

When the compiler computes a value of the struct type, each fixed field
must have its fixed value. A value at run time, such as a `load` of an
entry, keeps its bits.

The struct type is also the type of the value of `Some` of an
[`Option`](/docs/options/), and `const entry = f() else { trap() }` keeps
the struct type of the value. A module variable of the struct type is not
implemented now.
