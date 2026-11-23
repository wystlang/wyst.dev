---
title: Structs
summary: Plain structs, their layout in memory, packed structs, struct literals, big-endian fields, fields with a limit, size_of, field_offset, struct values, and structs with no fields.
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

A field type is `u8` to `u64`, `i8` to `i64`, an
[enum](/docs/enums-and-bit-structs/#enum-values) of `u8` to `u64`, also
[with values](/docs/enums-and-bit-structs/#enums-with-values), an
[`Option`](/docs/options/#option-fields) of one of these that has no
values, a `bool`, a plain struct, a
[`#[bits]` struct](/docs/enums-and-bit-structs/#values), which holds its
backing integer, an [address](/docs/addresses/#addresses-in-memory) of
`u8` to `u64`, of `i8` to `i64`, or of a plain struct, also in an
`Option`, or an array `[N]T` of one of these:

```wyst
struct Record {
  value: u64
}

struct Link {
  count: u32
  record: @Record
}
```

A slice is never in memory, so it is not a field type, and other field
types, such as `@bool`, are not implemented now:

```wyst fails
struct Text {
  bytes: @[]u8
}
```

```text
main.wyst:2:10: error: a slice is only the type of a parameter, a local, or a result, and never in memory
```

A `bool` field is one byte. 0 is `false`, and each other value is
`true`, so each byte in memory gives a value, and memory of zeros is
`false`. `load` gives `true` or `false`, and `store` writes 1 for `true`
and 0 for `false`. Thus the test of a field that tells if a state is on
is the `load` of the field, or `!` of the `load`:

```wyst
struct Shell {
  saving: bool
  count: u64
}

fn start_save(shell: @var Shell) -> bool {
  if load(@shell.saving) {
    return false
  }

  store(@shell.saving, true)

  return true
}
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

fn clear(block: @var channels.Message) {
  store(@block.count, 0)
}
```

In another module, the name of a struct that is not `pub` gives the error
``struct `Slot` of module `table` is not `pub` ``. A `pub` register map is
the type of a device of another module, as
[Sharing a register map](/docs/registers/#sharing-a-register-map) gives.

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

A plain struct lays out its fields as C does, unless it is
[`#[packed]`](#packed-structs):

- The fields are in declaration order.
- Each field starts at the next multiple of its alignment. The alignment
  of `uN` is its size, the alignment of an array is the alignment of its
  element, and the alignment of a struct is the largest alignment of its
  fields. An `Option<T>` is the tag and the value, each in a word of the
  width of `T`, so an `Option<u64>` has 16 bytes, with the alignment 8.
  An address, also in an `Option`, has 8 bytes, with the alignment 8.
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

## Packed structs

`#[packed]` before a plain struct puts each field directly after the
field before it. The struct has no padding, and its alignment is 1. A
field keeps its own layout, so a field of a struct or of an `Option`
keeps the padding in it.
[`#[big_endian]`](#big-endian-fields) and
[`#[below(n)]`](#fields-with-a-limit) before a field work as in each
other plain struct. Thus a header of a network protocol starts directly
after the header before it in a frame:

```wyst
struct Ethernet {
  destination: [6]u8
  source: [6]u8
  #[big_endian] type: u16
}

// An IPv4 header with no options.
#[packed]
struct Ipv4 {
  version: u8
  service: u8
  #[big_endian] length: u16
  #[big_endian] identification: u16
  #[big_endian] fragment: u16
  ttl: u8
  protocol: u8
  #[big_endian] checksum: u16
  #[big_endian] source: u32
  #[big_endian] destination: u32
}

struct Frame {
  ethernet: Ethernet
  ip: Ipv4
}

static_assert(field_offset(Frame, ip) == 14)
static_assert(size_of(Frame) == 34)

fn sender(frame: @Frame) -> u32 {
  return load(@frame.ip.source)
}
```

Without `#[packed]`, `Ipv4` has the alignment 4, and `ip` starts at
byte 16.

A `load` or a `store` of a field is one access at the address of the
field, also when that address is not a multiple of the size of the
field, as for `source` at byte 26 of the frame. AArch64 permits such an
access to Normal memory when bit A of `SCTLR_EL1`, the alignment check,
is 0. Device memory refuses it with an alignment fault, and with the MMU
off, each data access is to Device memory. Thus code that runs with the
MMU off must not use such a field, and a register map, which is the type
of a device, cannot be `#[packed]`:

```wyst fails
#[packed]
#[register_map]
struct Uart {
  DR: readwrite u32 at 0x00 { DATA: u8 at 0..=7 }
}
```

```text
main.wyst:1:3: error: a `#[packed]` struct is not the type of a device, because a device needs aligned accesses
```

The address `@p.f` of a field of a packed struct has the type of the
address of each other field, such as `@u32`, so a function that takes a
`@u32` can get an address that is not a multiple of 4. An exclusive,
atomic, load-acquire, or store-release instruction, such as `ldxr`,
`stxr`, `cas`, `ldar`, or `stlr`, can take an alignment fault at such an
address also when bit A is 0. Thus an `asm` block with one of these
instructions must not get the address of a field of a packed struct.

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

fn request(arp: @var Arp) {
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

## Fields with a limit

`#[below(n)]` before a field of type `u8`, `u16`, `u32`, or `u64`, or of
an array of one of these, gives each value of the field the limit `n`, a
constant from 1 to the highest value of the type. A `load` of the field
traps when the value is not below `n`, as `trap()` does, so the value of
the load is below `n`, and it proves an index, as
[What the checker knows](/docs/index-proofs/#what-the-checker-knows)
gives. Thus the code needs no test of its own after the load:

```wyst
const slots: u64 = 16

// The strip of a shell. Only this module writes it.
struct Strip {
  #[below(slots)] focus: u64
  #[below(slots)] order: [slots]u8
}

fn focused(strip: @Strip, names: @[slots]u64) -> u64 {
  return load(@names[load(@strip.focus)])
}

fn follow(strip: @var Strip, place: u64) {
  store(@strip.focus, widen(load(@strip.order[place & (slots - 1)])))
}
```

Hostile code or a device can write the memory, so the load tests the
value: one compare and one branch, as `/` tests its divisor. A field
whose bad value must not stop the code, such as a count in a message of
another domain, has no limit, and the code tests its value. The
attribute does not change the layout.

The value of the field in a `store`, in a struct literal, and in a
constant table needs a proof that it is below `n`, as an index does. A
`u64` from memory has no such proof:

```wyst fails
struct Strip {
  #[below(16)] focus: u64
}

fn choose(strip: @var Strip, chosen: @u64) {
  store(@strip.focus, load(chosen))
}
```

```text
main.wyst:6:23: error: the checker cannot prove that the value of a field with a limit is less than 16
```

The address `@p.f` of a field with a limit keeps the limit, as the
address of a big-endian field keeps the byte order. It is not a `@u64`,
because a store through such an address would need no proof. A limit on
a signed field, such as an `i64` field, and a big-endian field with a
limit, are not implemented now.

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

fn flush(request: @var Flush, width: u32, height: u32) {
  store(request, { header = { kind = 0x0104 }, rect = { width = width, height = height }, resource = 1 })
}
```

Here the store writes the kind, the width, the height, and the resource,
and 0 in each other byte of the request. The code computes the address,
writes the zero bytes, and then computes and writes each field value in
the order of the literal. Thus a field value that reads the struct, also
through a call, reads the bytes that the store wrote before it.

A field of an array type `[N]T` takes an array literal of N elements.
Each element has the rules of a `store` of a `T`, at the offset of the
element, and the code writes the elements in their order:

```wyst
struct Ethernet {
  destination: [6]u8
  source: [6]u8
  #[big_endian] type: u16
}

fn broadcast(frame: @var Ethernet, own: @[6]u8) {
  store(
    frame,
    {
      destination = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
      source = [load(@own[0]), load(@own[1]), load(@own[2]), load(@own[3]), load(@own[4]), load(@own[5])]
      type = 0x0806
    },
  )
}
```

An array literal of another number of elements is an error, as in a
constant table, so the literal gives each element, also each 0:

```wyst fails
struct Ethernet {
  destination: [6]u8
  #[big_endian] type: u16
}

fn broadcast(frame: @var Ethernet) {
  store(frame, { destination = [0xff, 0xff], type = 0x0800 })
}
```

```text
main.wyst:7:32: error: expected 6 elements, found 2
```

A field that the literal does not name is 0. But a `#[bits]` value that
the compiler computes gives each
[fixed field](/docs/enums-and-bit-structs/#bit-structs) its fixed value,
so the literal names each field in which 0 gives a fixed field another
value, also in a struct or an array that the field holds, as a
[constant table](/docs/constants-and-variables/#constant-tables) does. A
nested literal and each element of an array field have the same rule:

```wyst fails
#[bits]
struct Flags: u32 {
  ON:   bool at 0     = true
  MODE: u4   at 4..=7
}

struct Record {
  count: u64
  flags: Flags
}

fn reset(record: @var Record) {
  store(record, { count = 1 })
}
```

```text
main.wyst:13:17: error: the literal does not name field `flags`, so it is 0, which gives fixed field `ON` the value false, not true
```

`flags = {}` names the field and gives each fixed field its fixed value:

```wyst
#[bits]
struct Flags: u32 {
  ON:   bool at 0     = true
  MODE: u4   at 4..=7
}

struct Record {
  count: u64
  flags: Flags
}

struct Log {
  records: [2]Record
}

fn reset(log: @var Log) {
  store(log, { records = [{ count = 1, flags = {} }, { flags = { MODE = 2 } }] })
}
```

A literal of a struct of more than 4096 bytes is not implemented now.

A struct literal is also the value of a
[constant table](/docs/constants-and-variables/#constant-tables) of a
plain struct type. There, a field of an array type also takes an array
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
struct, an `Option` in memory, such as `Option<u64>` or
`Option<@Slot>`, or an array of them, such as `[4]Slot`. A module
constant or a `static_assert` that uses them comes after the declaration
of `T`. A function that uses them can come before it.

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

A plain struct whose fields are `bool` values, integers, enums without
values, or `#[bits]` structs is also a value: the type of a parameter, a
local `const`, and a result. The value takes one register for each
field, in the order of the declaration, as an `Option` takes two. Thus a
struct value has at most 8 fields, and a parameter of it counts its
fields in the 8 registers of the parameters of a
[function](/docs/functions/#declaring-a-function).

A struct literal gives the value where its position gives the type, and
each field that it does not name is 0. Thus the literal names each
`#[bits]` field in which 0 gives a fixed field another value, as in
`flags = {}`, as a [literal of `store`](#struct-literals) does. `v.f`
reads field `f` of a local or a parameter `v`. `load` of the struct gives
the value, with one load for each field, and `load(p).f` loads one field:

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
another type, such as an array or an address, a local `var` of a struct, an `Option` of
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
of that struct. This is also true for a
[struct with no fields](#structs-with-no-fields). It has no fields to
give, but a struct that is not `pub` is local to its module, and a value
of it would take the struct to another module. Make the struct `pub`, as
[pub structs](#pub-structs) gives:

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
