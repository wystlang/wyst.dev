---
title: Enums and bit structs
summary: Named values of a bit field, and named bits of an integer in memory.
---

## Enums

An enum gives names to the values of a bit field, in place of numbers. It
has a backing type `uN`, and each variant has a value that fits in it. An
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

A field of enum type takes `.Variant`, such as `TG0 = .16K`, or a
constant of the enum type. It does not take an integer, so a reserved
value that has no variant cannot be written. A read of an enum field gives
its backing `uN`, because the hardware can hold a value that is no
variant.

## Enum constants

An enum is the type of a bit field, of a register or of a `#[bits]`
struct, and the type of a module constant. A constant of an enum type
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

A parameter, a local, and a variable cannot have an enum type now.

## Bit structs

A `#[bits] struct` gives names to the bits of an integer in memory, such
as an entry of a translation table. The type after `:` is the backing
type, and the body has bit fields, as a register has:

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

A literal `{FIELD = value}` makes a value. A literal is only the value of a
constant or a local `const` of the struct type now. Each field that the
literal does not name is zero, or its fixed value. The literal cannot name
a fixed field, and an enum field takes only `.Variant`. When each field is
fixed, `{}` is the only literal.

The compiler computes the value of each literal. Thus each field value is
a value that it can compute, such as a literal or a module constant. A
field value that is a parameter or a local is not implemented now.

## Values

A value that is not a literal, such as `load(slot)`, has the backing type.
Each use of a constant or a local of the struct type, other than a field
read `x.F`, also gives the backing type. Thus a table of entries is an
array of `u64`, and `frame | data` makes an entry for the address `frame`:

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

`x.F` reads field `F` of `x`, a local or a constant of the struct type, as
from a register snapshot. `x` can also be `m.c`, a `pub` constant of an
imported module. When the compiler computes a value of the struct type,
each fixed field must have its fixed value. A value at run time, such as a
`load` of an entry, keeps its bits.

Only a module constant or a local `const` can have the struct type now. A
local `const` of the struct type that unwraps an
[`Option`](/docs/options/) with `else` or `?` is not implemented now.
