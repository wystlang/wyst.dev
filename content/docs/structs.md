---
title: Structs
summary: Plain structs, their layout in memory, size_of, and field_offset.
---

## Plain structs

`struct Name { fields }` declares a plain struct: the shape of a record in
memory. Each field is `name: Type`. A newline or `,` ends a field.

```wyst
struct Slot {
  object: u64
  generation: u32
  kind: u16
  rights: u16
}
```

A field type is `u8`, `u16`, `u32`, `u64`, a plain struct, or an array
`[N]T` of one of these. Other field types are not implemented now:

```wyst fails
struct Flag {
  set: bool
}
```

```text
main.wyst:2:8: error: a field of a plain struct is only `u8`, `u16`, `u32`, `u64`, a plain struct, or an array of them now
```

A field is visible wherever its type is. Wyst has no private fields.

## pub structs

A struct is local to its module. `pub struct` lets each module that
imports the module name the struct as `m.S`, as the target of an address,
the type of a field, and the type of `size_of` and `field_offset`:

```wyst ipc/channels.wyst
pub struct Message {
  count: u64
  handles: [4]u64
  bytes: [256]u8
}
```

```wyst
import ipc.channels

static_assert(field_offset(channels.Message, bytes) == 40)

fn clear(block: @channels.Message) {
  store(@block.count, 0)
}
```

In another module, the name of a struct that is not `pub` gives the error
``struct `Slot` of module `table` is not `pub` ``. A `pub` register map or
`#[bits]` struct is not implemented now.

A struct with `#[register_map]` declares the registers of a device, and a
struct with `#[bits]` names the bits of an integer. They are not plain
structs. See [Registers and devices](/docs/registers/) and
[Enums and bit structs](/docs/enums-and-bit-structs/).

## Layout

A plain struct lays out its fields as C does:

- The fields are in declaration order.
- Each field starts at the next multiple of its alignment. The alignment
  of `uN` is its size, the alignment of an array is the alignment of its
  element, and the alignment of a struct is the largest alignment of its
  fields.
- The size of a struct is a multiple of its alignment.

Thus `Slot` above is 16 bytes. In `Table` below, `marks` starts at byte 2,
`entries` at byte 8, and `last` at byte 40. The size is 48, a multiple of
8:

```wyst
struct Entry {
  tag: u16
  value: u64
}

struct Table {
  count: u8
  marks: [3]u16
  entries: [2]Entry
  last: u8
}
```

A struct comes after the structs and the constants that its fields use.
Thus a struct cannot hold itself. The structs and the constants of an
imported module come first.

## size_of and field_offset

`size_of(T)` gives the size of `T` in bytes, and `field_offset(T, f)`
gives the offset of field `f` in the plain struct `T`. Both are `u64`
constants. The argument `T` is a type: `u8`, `u16`, `u32`, `u64`, a plain
struct, or, for `size_of`, an array of them, such as
`[4]Slot`. A module constant or a `static_assert` that uses them comes
after the declaration of `T`. A function that uses them can come before
it.

Code that depends on a layout states it with `static_assert`, directly
below the struct:

```wyst
struct Slot {
  object: u64
  generation: u32
  kind: u16
  rights: u16
}

static_assert(size_of(Slot) == 16)
static_assert(size_of([4]Slot) == 64)
static_assert(field_offset(Slot, kind) == 12)
```

An `asm` block that reads a struct at fixed offsets is an example. If a
change moves a field, the assertion stops the build.

## What a struct can do now

A plain struct is only the type of memory at an address now. A parameter,
a local, and a variable cannot hold a struct, and a struct literal is not
implemented now. Code reads and writes each field through the address of
the struct, such as `load(@slot.kind)`, as
[Addresses and memory](/docs/addresses/) shows. `load` and `store` of a
whole struct are not implemented now.
