---
title: Structs
summary: Plain structs, their layout in memory, struct literals, big-endian fields, size_of, field_offset, struct values, and structs with no fields.
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

A field type is `u8`, `u16`, `u32`, `u64`, `i64`, an
[enum](/docs/enums-and-bit-structs/#enum-values) of `u8` to `u64`, also
[with values](/docs/enums-and-bit-structs/#enums-with-values), an
[`Option`](/docs/options/#option-fields) of one of these that has no
values, a plain struct, a
[`#[bits]` struct](/docs/enums-and-bit-structs/#values), which holds its
backing integer, or an array `[N]T` of one of these. Other field types
are not implemented now:

```wyst fails
struct Flag {
  set: bool
}
```

```text
main.wyst:2:8: error: a field of a plain struct is only `u8`, `u16`, `u32`, `u64`, `i64`, an enum, an `Option`, a plain struct, a `#[bits]` struct, or an array of them now
```

A field is visible wherever its type is. Wyst has no private fields.

## pub structs

A struct is local to its module. `pub struct` lets each module that
imports the module name the struct as `m.S`, as the target of an address,
the type of a field, the type of a [value](#struct-values), and the type
of `size_of` and `field_offset`:

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
``struct `Slot` of module `table` is not `pub` ``. A `pub` register map is
not implemented now.

Each module that imports the module uses each field of a `pub` struct, so
a field of a plain struct or of a `#[bits]` struct that is not `pub`, or
of an array of one, would give it the fields of that struct. Such a field
is not implemented now:

```wyst fails
struct Hidden {
  secret: u64
}

pub struct Record {
  count: u64
  hidden: [2]Hidden
}
```

```text
main.wyst:7:11: error: struct `Hidden`, which is not `pub`, as a field of a `pub` struct is not implemented now
```

For the same reason, these uses of a plain struct or a `#[bits]` struct
that is not `pub` are not implemented now: a value of it in a `pub`
function, as [Struct values](#struct-values) gives; a `pub` constant
table of it, or of an array of it; and a `pub` constant of a `#[bits]`
one.

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
  fields. An `Option<T>` is the tag and the value, each in a word of the
  width of `T`, so an `Option<u64>` has 16 bytes, with the alignment 8.
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
Thus a struct cannot hold itself. The items of an imported module up to
the struct or the constant that a field uses come first.

## Big-endian fields

`#[big_endian]` before a field of type `u16`, `u32`, or `u64` makes the
field big-endian. Its bytes are in the reverse order of the bytes of the
CPU, as in a network header or a record that a device reads. `load` of
the field reverses the bytes after the load and gives a normal integer,
and `store` reverses the bytes of the value before the store. Thus there
is no big-endian type, and the attribute does not change the layout.

```wyst
// An ARP packet, after the Ethernet header.
struct Arp {
  #[big_endian] htype: u16
  #[big_endian] ptype: u16
  hlen: u8
  plen: u8
  #[big_endian] oper: u16
}

fn request(arp: @Arp) {
  store(arp, { htype = 1, ptype = 0x0800, hlen = 6, plen = 4, oper = 1 })
}

fn is_reply(arp: @Arp) -> bool {
  return load(@arp.oper) == 2
}
```

The address `@p.f` of a big-endian field keeps the byte order, also in a
local. It is not a `@u16`, `@u32`, or `@u64`, because a load through such
an address would not reverse the bytes. The attribute before a field of
another type, such as `u8`, an enum, or an array, is an error:

```wyst fails
struct Header {
  #[big_endian] length: u8
}
```

```text
main.wyst:2:5: error: a big-endian field is `u16`, `u32`, or `u64`, not u8
```

## Struct literals

`store(p, { f = v, ... })` writes the full struct at the address `p`.
Each named field gets its value, with the rules of a `store` of that
field. A field that is a plain struct takes a nested literal. Each other
byte is 0, padding included, so a message or a frame keeps no old byte.

```wyst
struct Header {
  kind: u32
  flags: u32
  fence: u64
}

struct Rect {
  x: u32
  y: u32
  width: u32
  height: u32
}

struct Flush {
  header: Header
  rect: Rect
  resource: u32
  padding: u32
}

fn flush(request: @Flush, width: u32, height: u32) {
  store(request, { header = { kind = 0x0104 }, rect = { width = width, height = height }, resource = 1 })
}
```

Here the store writes the kind, the width, the height, and the resource,
and 0 in each other byte of the request. The code computes the address,
writes the zero bytes, and then computes and writes each field value in
the order of the literal. Thus a field value that reads the struct, also
through a call, reads the bytes that the store wrote before it.

A field of an array type takes no value in a literal now, so it is 0.
Store its elements after the literal:

```wyst fails
struct Ethernet {
  destination: [6]u8
  #[big_endian] type: u16
}

fn broadcast(frame: @Ethernet) {
  store(frame, { destination = 0xff, type = 0x0800 })
}
```

```text
main.wyst:7:18: error: a value of array field `destination` in a literal is not implemented now; store its elements after the literal
```

A literal of a struct of more than 4096 bytes is not implemented now.

A struct literal is also the value of a
[constant table](/docs/constants-and-variables/#constant-tables) of a
plain struct type. There, a field of an array type takes an array
literal:

```wyst
struct Ethernet {
  destination: [6]u8
  #[big_endian] type: u16
}

const broadcast: Ethernet = { destination = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff], type = 0x0800 }
```

## size_of and field_offset

`size_of(T)` gives the size of `T` in bytes, and `field_offset(T, f)`
gives the offset of field `f` in the plain struct `T`. Both are `u64`
constants. The argument `T` is a type: `u8`, `u16`, `u32`, `u64`, an
enum of one of these, a plain struct, or, for `size_of`, a `#[bits]`
struct, an `Option` in memory, such as `Option<u64>`, or an array of them,
such as `[4]Slot`. A module constant or a `static_assert` that uses them comes
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

## Structs with no fields

A plain struct with no fields, such as `struct Mark {}`, is a value with
no bytes: the type of a parameter, a local `const`, and a result. `{}` is
its value. It takes no register, so a literal or a local of it makes no
code, and it does not count in the limit of 8 parameters of a
[function](/docs/functions/#declaring-a-function).

```wyst
struct Mark {}

fn mark() -> Mark {
  return {}
}

fn both(first: Mark, second: Mark) -> Mark {
  _ = second
  return first
}

fn use_marks() {
  const first = mark()
  _ = both(first, {})
}
```

`linear` before such a struct makes a value that stands for a duty or a
proof, such as the lock that the CPU holds, as
[Lending a linear value](/docs/functions/#lending-a-linear-value) gives.
A local `var` and an `Option` of a struct with no fields are not
implemented now, and neither is an argument of it that is a call or an
`if` or `match` value. `load` of a struct with no fields is not
implemented now either, because it would make no code, and the code of
its address, which can trap, would not run. `{}` gives the value.
`const x = f()` keeps the value of a call:

```wyst fails
struct Mark {}

fn mark() -> Mark {
  return {}
}

fn take(mark: Mark) {}

fn use_mark() {
  take(mark())
}
```

```text
main.wyst:10:8: error: a call or an `if` or `match` value as an argument of Mark, a struct with no fields, is not implemented now; `const x = value` keeps it
```

## Struct values

A plain struct whose fields are integers, enums without values, or
`#[bits]` structs is also a value: the type of a parameter, a local
`const`, and a result. The value takes one register for each field, in
the order of the declaration, as an `Option` takes two. Thus a struct
value has at most 8 fields, and a parameter of it counts its fields in
the 8 registers of the parameters of a
[function](/docs/functions/#declaring-a-function).

A struct literal gives the value where its position gives the type, and
each field that it does not name is 0. `v.f` reads field `f` of a local
or a parameter `v`. `load` of the struct gives the value, with one load
for each field, and `load(p).f` loads one field:

```wyst
struct Answer {
  address: u32
  option: u32
}

fn answer(address: u32, option: u32) -> Answer {
  if option == 0 {
    return {}
  }
  return { address = address, option = option }
}

fn gateway(kept: @Answer) -> u32 {
  const copy = load(kept)
  const leased = answer(copy.address, load(kept).option)
  return leased.option
}
```

A field of a local has the highest value of the value of the field, as a
local has, so it can be an index, as [Index proofs](/docs/index-proofs/)
gives. A field of a load, as `load(p).f` or a field of a local that
holds a load, has the highest value of its type. The checker knows no
highest value of a field of a parameter or of a call now, so such a
field needs a mask or a condition before it is an index:

```wyst fails
struct Slot {
  index: u64
}

fn clear(table: @[8]u64, slot: Slot) {
  store(@table[slot.index], 0)
}
```

```text
main.wyst:6:16: error: the checker cannot prove that the index is less than 8
```

`slot.index & 7` is at most 7, so it proves the index. A field that is
big-endian in memory holds the normal integer.

These forms are not implemented now: a value of a struct with a field of
another type, such as an array, a local `var` of a struct, an `Option` of
a struct, an `if` or `match` value of a struct, a struct value in a naked
function, `@` of a struct local or parameter, and the read of a field of
the struct of a call. `const x = f()` keeps the struct of a call:

```wyst fails
struct Point {
  x: u64
  y: u64
}

fn origin() -> Point {
  return {}
}

fn height() -> u64 {
  return origin().y
}
```

```text
main.wyst:11:19: error: the read of a field of the struct of a call is not implemented now; `const x = value` keeps the struct
```

A literal names the fields in any order, but the value has them in the
order of the declaration. Thus a literal in another order with a call or
a register read is not implemented now, because the calls and the reads
would not run in the order of the source. A module variable cannot hold
a struct, and `store` writes a struct only from a literal now.

A parameter or a result of a `pub` function that is a value of a plain
struct or of a `#[bits]` struct that is not `pub`, also in an `Option`,
is not implemented now, because it would give another module the fields
of that struct. Make the struct `pub`, as [pub structs](#pub-structs)
gives:

```wyst fails
struct Point {
  x: u64
  y: u64
}

pub fn moved(by: u64, p: Point) -> u64 {
  return p.x + by
}
```

```text
main.wyst:6:26: error: a value of struct `Point`, which is not `pub`, in a `pub` function is not implemented now
```
