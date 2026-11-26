---
title: Addresses and memory
summary: Address types, places, load, store, and bitcast.
---

A function reads and writes memory through an address. The type of the
address gives the type of the memory, so each access has a known size and
offset.

## Address types

`@T` is the type of a read-only address of memory of type `T`, and
`@var T` is the type of a writable address, as
[Read-only addresses](#read-only-addresses) gives. `T` is `u8` to
`u64`, `i8` to `i64`, an enum of `u8` to `u64`, an
[`Option`](/docs/options/#option-fields) of one of these that has no
values, a `bool`, a plain struct or a
[`#[bits]` struct](/docs/enums-and-bit-structs/#values) of the module, a
`pub` plain struct `m.S` of an imported module, an address of `u8` to
`u64`, of `i8` to `i64`, or of a plain struct, also in an `Option`, as
[Addresses in memory](#addresses-in-memory) gives, or an array `[N]T` of
one of these. `N` is a constant, such as a module constant. Another
target, such as an array of arrays, is not implemented now.

An address is not an integer. No operator takes an address, and `@u8` and
`@u32` are different types, and so are `@u8` and `@var u8`, but `@var`
converts to `@`:

```wyst fails
fn next(base: @u64) {
  const after: @u64 = base + 8
}
```

```text
main.wyst:2:28: error: `+` needs integers, found @u64
```

[`bitcast`](#bitcast) gives the `u64` of an `@var` address, and a
[view](#views) gives the same memory as another type.

`@M`, where `M` is a register map, is the address of a device, not of
memory, as
[Addresses of register maps](/docs/registers/#addresses-of-register-maps)
gives.

An address is the type of a parameter, a local, a result, a
[module constant](#address-constants), a module variable, and a field of
a plain struct, as [Addresses in memory](#addresses-in-memory) gives, and
`@c` gives the address of a [constant table](#read-only-addresses). A
[slice](#slices) is an address and a length, and it is never in memory or
in a module variable.

## bitcast

`bitcast(x)` gives the `u64` `x` as the address type that its position
expects, with its access: `@T` or `@var T`. It is the only way to make an
address from an integer, and it is correct only at a
[point of trust](#points-of-trust), such as a function of the module that
declares `T`:

```wyst
struct Table {
  entries: [512]u64
}

fn clear_at(frame: u64) {
  const table: @var Table = bitcast(frame)
  store(@table.entries[0], 0)
}
```

A string is read-only data, so `bitcast` of a `string` is an error, also
to a `u64`: the code could make the address again and write through it.
`len(s)`, `@s[i]`, and `@s[x ..]` read a string, as
[Values and types](/docs/values/#strings) gives:

```wyst
fn banner() -> @[]u8 {
  const name = "Wyst"
  return @name[0 ..]
}
```

`bitcast(a)` of an `@var` address of memory `a`, or of an `@var` slice
local or parameter `a`, gives the address as a `u64` where the position
expects a `u64` or gives no type, as an `asm` input or an operand. It
makes no code. Of a slice, it is the address of its first element:

```wyst
struct Message {
  count: u64
  bytes: [256]u8
}

fn end(block: @var Message) -> u64 {
  return bitcast(block) + size_of(Message)
}

fn clean(block: @var Message) {
  asm(start = bitcast(@block.bytes)) {
    dc civac, start
  }
}
```

The address of a register map, a `string`, and an `Option` give no
integer. An integer has no access, and `bitcast` of an integer gives an
`@var`, so `bitcast` of a read-only address to a `u64` is an error, as
[Read-only addresses](#read-only-addresses) gives. Where the position
expects an address or a slice, `bitcast` of an address or of a slice is a
[view](#views).

`bitcast` makes only an address from a `u64`, a `u64` or a view from an
address of memory or a slice, and an `iN` from the `uN` of the same width
and the reverse now, as
[Values and types](/docs/values/#no-implicit-conversions) gives for
`iN`. An integer literal has no type in `bitcast(...)` of an address.
Put the value in a typed constant, such as
`const uart: u64 = 0x0900_0000`, and use `bitcast(uart)`.

The code that makes an address with `bitcast` of a `u64` asserts that
memory of that type is at `x` while the address is in use. The compiler
does not check this. Thus each such `bitcast` marks a place where the
program trusts a fact that the compiler cannot prove.

## Points of trust

Each address comes from a typed source: a parameter, a result, a module
variable, an address constant, `@c` of a constant table, `@s[i]` of a
string, `@d` of a device, a place, a slice, a view, or a `load` of an
address. `bitcast` of an integer makes an address only at a point of trust,
which is one of these:

- The value of an [address constant](#address-constants), the first value
  of a module variable of an address, and an address in a constant table.
  It is `bitcast` of a `u64` constant, and the target can be each type.
- A function of the module that declares the target, or the element of an
  array target: a struct, an enum, or a register map. Thus the module that
  owns a kind of memory makes its addresses.
- In a module of EL0 code, which a line `functions m in .el0` of the
  [layout](/docs/layout-files/#function-sections) places, only a function
  that makes the address of a register map of the module.

A module makes the address of a word as the address of a struct of its own,
because no module declares `u64`:

```wyst
struct Word {
  value: u64
}

fn read(address: u64) -> u64 {
  const word: @Word = bitcast(address)
  return load(@word.value)
}
```

```wyst fails
fn read(address: u64) -> u64 {
  const word: @u64 = bitcast(address)
  return load(word)
}
```

```text
main.wyst:2:22: error: `bitcast` of an integer gives no @u64 in a function of this module, because no module declares `u64`; it gives only the address of a type that this module declares, or of an array of one
```

Another module gets the address from a function of the module that declares
the struct, or from a `pub` address constant. The module
`platform.records` makes the address of a `Record`:

```wyst platform/records.wyst
pub struct Record {
  value: u64
}

pub fn at(address: u64) -> @var Record {
  return bitcast(address)
}
```

```wyst fails
import platform.records

fn reset(address: u64) {
  const record: @var records.Record = bitcast(address)
  store(@record.value, 0)
}
```

```text
main.wyst:4:39: error: `bitcast` of an integer gives no @var Record in a function of this module, because module `platform.records` declares `Record`; it gives only the address of a type that this module declares, or of an array of one
```

EL0 code gets each address of memory from an address constant and from the
typed sources that start there. Its functions, also its inline functions,
make only the address of a register map of the module from an integer, as a
driver does with an offset that its device gives. In the module
`drivers.clock`, `now` is correct, because `Clock` is a register map, and
`own` is an address constant:

```wyst drivers/clock.wyst
struct State {
  registers: u64
}

#[register_map]
struct Clock {
  COUNT: readonly u32 at 0x00 { VALUE: u32 at 0..=31 }
}

const state: u64 = 0x0100_8000
const own: @State = bitcast(state)

pub fn now() -> u32 {
  const clock: @Clock = bitcast(load(@own.registers))
  return clock.COUNT.read().VALUE
}

pub fn read(address: u64) -> u64 {
  const other: @State = bitcast(address)
  return load(@other.registers)
}
```

With this layout, `drivers.clock` is a module of EL0 code, so `read` is an
error:

```layout check
entry main._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0001_0000
section .text: code in ram align 16
section .el0: code in ram after .text align 16
functions drivers in .el0
```

```wyst fails
import drivers.clock

#[naked]
pub fn _start() -> never {
  for {}
}
```

```text
drivers/clock.wyst:19:25: error: `bitcast` of an integer gives no @State in a function of this module, because the layout puts this module in `.el0`; it gives only the address of a register map of this module, and an address constant gives an address of memory
```

The check of the [access](#read-only-addresses) holds for each address that
does not come from a point of trust. The code of a point of trust asserts
that the memory is memory of its module and not read-only data. A `load` of
an address from memory is also an assertion, as
[Addresses in memory](#addresses-in-memory) gives.

## Address constants

A module constant can be an address when its value is `bitcast` of a
`u64` constant. Each use gives the address that `bitcast` gives there, as
each use of a `u64` constant gives its value. Thus the functions of a
module do not each make the same address:

```wyst
struct State {
  count: u64
  lines: [4]u32
}

const state: u64 = 0x0100_8000
const own: @var State = bitcast(state)

fn reset() {
  store(@own.count, 0)
  store(@own.lines[0], 0)
}

fn count() -> u64 {
  return load(@own.count)
}
```

Another value, such as `@own.lines` or the [view](#views)
`bitcast(@own.lines)`, is not implemented now.

An address constant names memory at a fixed address, which the program
maps. The build fails when that memory is in a region of the layout, as
[Layout files](/docs/layout-files/#address-constants) gives, so an address
constant is never code or read-only data of the image.

A `pub` address constant gives the address to each module that imports
its module. `m.c` of the `pub` address constant `c` of module `m` is the
address, so `@m.c.f` is the address of field `f`:

```wyst platform/memory.wyst
pub struct Shared {
  count: u64
  words: [2]u64
}

const base: u64 = 0x0100_8000

pub const shared: @Shared = bitcast(base)
pub const first: @u64 = bitcast(base)
```

```wyst
import platform.memory

fn total() -> u64 {
  return load(memory.first) + load(@memory.shared.words[0]) + load(@memory.shared.words[1])
}
```

The target of a `pub` address constant has the rule of an
[address result of a `pub` function](#pub-results).

## Addresses in memory

A field of a plain struct and a module variable can hold an address
`@T` or `@var T`, where `T` is `u8` to `u64`, `i8` to `i64`, or a plain
struct. The
address has 8 bytes, with the alignment 8. `store` writes it, also as a
field of a [struct literal](/docs/structs/#struct-literals), and `load`
gives it, so `@load(@link.record).value` is the address of a field of
the record:

```wyst
struct Record {
  value: u64
}

struct Link {
  count: u32
  record: @Record
}

fn attach(link: @var Link, record: @Record) {
  store(link, { count = 1, record = record })
}

fn value(link: @Link) -> u64 {
  return load(@load(@link.record).value)
}
```

Memory gives no proof of the address, because hostile code or a device
can write the memory. Thus the `load` asserts the address, as
[`bitcast`](#bitcast) of a `u64` does.

A module variable of type `@T` takes `bitcast` of a `u64` constant as its
first value, as an [address constant](#address-constants) does. Each read
gives its address, and an assignment gives it another address, so the
functions of the module use it with no `bitcast`:

```wyst
struct Records {
  count: u64
  lines: [8]u64
}

const unset: u64 = 0

var records: @var Records = bitcast(unset)

fn init(frame: u64) {
  records = bitcast(frame)
  store(@records.count, 0)
}

fn line(i: u64) -> u64 {
  return load(@records.lines[i & 7])
}
```

Only `bitcast` makes an address from an integer, also for a field:

```wyst fails
struct Record {
  value: u64
}

struct Link {
  record: @Record
}

fn put(link: @var Link, record: u64) {
  store(@link.record, record)
}
```

```text
main.wyst:10:23: error: expected @Record, found u64
```

Memory and a module variable of type `@T` can hold a read-only address,
such as the address of a constant table, and memory of type `@var T`
holds only an `@var`, as [Read-only addresses](#read-only-addresses)
gives.

A field and a module variable can also hold an `Option` of such an
address, for a link that can be empty. It is one word of 8 bytes: the
address of `.Some`, or 0 for `.None`, so memory of zeros is `.None`, and
so is a field that a literal does not name. `load` gives the `Option`,
and asserts the address of `.Some`, as for an address. `match`, `else`,
`?`, and a `return` of that result type take the `load`, as they take a
call, and the code loads the word one time. `store` and an assignment
write the address of `.Some(a)`, or 0 for `.None`, also for a call that
returns `.None`. The first value of a module variable is `.None`, and a
read of it is as a `load`:

```wyst
struct Record {
  value: u64
}

struct Link {
  count: u32
  next: Option<@Record>
}

static_assert(size_of(Option<@Record>) == 8)

var last: Option<@Record> = .None

fn attach(link: @var Link, record: @Record) {
  store(@link.next, .Some(record))
  last = .Some(record)
}

fn value(link: @Link) -> u64 {
  const record = load(@link.next) else { return 0 }
  return load(@record.value)
}

fn last_value() -> u64 {
  match last {
    .Some(record) { return load(@record.value) }
    .None { return 0 }
  }
}
```

No operator takes an address, so `==` and `!=` take an `Option` of an
address only with `.None`, as in `load(@link.next) == .None`, and read
only its word. A parameter and a local of an `Option` of an address are
not implemented now, also of a `load`, so `else`, `?`, or `match` takes
the `load`:

```wyst fails
struct Record {
  value: u64
}

struct Link {
  next: Option<@Record>
}

fn value(link: @Link) -> u64 {
  const next = load(@link.next)
  const record = next else { return 0 }
  return load(@record.value)
}
```

```text
main.wyst:10:16: error: an `Option` of an address as a parameter or a local is not implemented now: `else`, `?`, or `match` takes it at the call, the `load`, or the read of the variable
```

A local `var` and a module constant of an `Option` of an address, a
value other than `.None` in a constant table or as the first value of a
module variable, `#[big_endian]` and `#[below(n)]` before such a field,
and an `asm` input or output of it are not implemented now.

Memory and a module variable never hold a slice or the
[address of a register map](/docs/registers/#addresses-of-register-maps).
The address of another type in memory, such as `@bool` or `@[4]u64`, the
address of a struct in a field of that struct, such as `next: @Thread` in
`Thread`, also in an `Option`, and a
[struct value](/docs/structs/#struct-values) with an address field are
not implemented now. A link that holds the address of a record of its
own type, such as the next record of a list, stays a `u64`, which
`bitcast` makes an address at each use, in the module that declares the
type.

## Places

`@p.f` is the address of field `f` of the struct at address `p`. `@p[i]`
is the address of element `i` of the array at address `p`, or of the
[slice](#slices) `p`. The forms combine, as in `@table[i].kind`.

```wyst
struct Slot {
  object: u64
  generation: u32
  kind: u16
  rights: u16
}

const slots: u64 = 64

fn kind_of(base: u64, index: u64) -> u16 {
  const table: @[slots]Slot = bitcast(base)
  return load(@table[index & (slots - 1)].kind)
}
```

The compiler must prove that each index is less than the length of its
array or slice. [Index proofs](/docs/index-proofs/) gives the rules.

A place keeps the access of its base: `@p.f` and `@p[i]` are `@var` when
`p` is `@var`, and else read-only, as
[Read-only addresses](#read-only-addresses) gives.

An element is memory, not a value, so `load` reads it:

```wyst fails
fn first(table: @[4]u64) -> u64 {
  return table[0]
}
```

```text
main.wyst:2:10: error: an element at an address is not a value; `load(@a[i])` reads it
```

`@p`, where `p` is an address, also an address constant, is an error,
because `p` is already the address. `@` of a local, of a module variable,
or of a module constant that is not an address or a constant table is not
implemented now.

`@name` of a naked function or of the vector table gives a code address,
a `u64`. See [Code addresses](/docs/boot-and-exceptions/#code-addresses).

## Address results

A function can give an address, so one function names a place, and each
caller uses the call as an address:

```wyst
struct Domain {
  root: u64
  frames: u64
}

const count: u64 = 256

var records: u64 = 0

fn record(domain: u64) -> @var Domain {
  const all: @var [count]Domain = bitcast(records)
  return @all[domain & (count - 1)]
}

fn take(domain: u64) {
  const own = record(domain)
  store(@own.frames, load(@own.frames) - 1)
}

fn root_of(domain: u64) -> u64 {
  return load(@record(domain).root)
}
```

No address points to a local, because `@` of a local is not implemented
now. Thus the address that a function gives stays valid after the call:
it comes from a parameter, from `bitcast`, also as a [view](#views) of
another address, from `@c` of a constant table, from a `load`, or from a
module variable. A call statement that drops the address is an error, as
for a value result.

A result can also be an `Option` of an address, as memory can. A
parameter and a local of an `Option` of an address are not implemented
now. `else`, `?`, and `match` take it at the call, and give the address
of `Some` to a local:

```wyst
struct Domain {
  root: u64
  frames: u64
}

const count: u64 = 256

var records: u64 = 0

fn lookup(domain: u64) -> Option<@Domain> {
  if domain >= count {
    return .None
  }

  const all: @[count]Domain = bitcast(records)
  return .Some(@all[domain])
}

fn root_of(domain: u64) -> Option<u64> {
  const own = lookup(domain)?
  return .Some(load(@own.root))
}
```

A local of the `Option` is an error:

```wyst fails
struct Domain {
  root: u64
}

fn lookup(domain: u64) -> Option<@Domain> {
  return .None
}

fn keep(domain: u64) {
  const found = lookup(domain)
}
```

```text
main.wyst:10:17: error: an `Option` of an address as a parameter or a local is not implemented now: `else`, `?`, or `match` takes it at the call, the `load`, or the read of the variable
```

### Pub results

The result of a `pub` function can be an address, an `Option` of an
address, or a [slice](#slices). Another module uses the call as each
other address. The target is an integer, a `pub` struct, or an array of
one of these, so no module gets the fields of a struct that is not
`pub`:

```wyst
pub struct Slot {
  object: u64
  kind: u16
}

const base: u64 = 0x0100_8000

pub fn slot(i: u64) -> @Slot {
  const slots: @[4]Slot = bitcast(base)
  return @slots[i & 3]
}
```

Another target, such as an enum or a struct that is not `pub`, is not
implemented now:

```wyst fails
struct Point {
  x: u64
  y: u64
}

pub fn same(p: @Point) -> @Point {
  return p
}
```

```text
main.wyst:6:27: error: an address of `Point` as the result of a `pub` function is not implemented now: the target is an integer, a `pub` struct, or an array of one of these
```

The result type gives the access, so a `store` through the result of a
call needs an `@var` result, also in another module, as
[Read-only addresses](#read-only-addresses) gives.

## Slices

`@[]T` is the type of a read-only slice: the address of a number of
elements of type `T`, one after the other, and that number, its length.
`@var []T` is a writable slice, and a slice keeps the access of its base,
as a place does. `T` is a type that an address can have. A slice takes two registers: the address, and then
the length. `@` marks each address, as in `@[N]T`, the address of an
array, so the type shows that a slice holds an address. `[]T` alone is an
array with no length, which is never a value, so a type `[]T` without `@`
is an error.

`@a[x ..< y]` gives the slice of the elements of `a` from `x` up to, but
not including, `y`. `a` is the address of an array `[N]T`, a slice local
or parameter, or a [`string`](/docs/values/#strings) local, parameter, or
literal. `@a[..< y]` starts at 0, and `@a[x ..]` ends at the end of `a`:
`N`, or the length of the slice or of the string. `x` and `y` are `uN`
values, as an index is. `len(s)` gives the length of the slice local or
parameter `s`, a `u64`, and `@s[i]` is the address of element `i`:

```wyst
struct Buffer {
  count: u64
  bytes: [64]u8
}

fn used(buffer: @var Buffer) -> @var []u8 {
  const count = load(@buffer.count)
  if count > 64 { trap() }

  return @buffer.bytes[..< count]
}

fn clear(bytes: @var []u8) {
  for i in 0 ..< len(bytes) {
    store(@bytes[i], 0)
  }
}

fn reset(buffer: @var Buffer) {
  clear(used(buffer))
}
```

The compiler must prove that `x <= y`, that `y` is at most `N` or the
length of `a`, and that `i` is less than `len(s)`.
[Index proofs](/docs/index-proofs/#slices) gives the rules. `for x in s`
loads each element of `s`, as [Control flow](/docs/control-flow/#for)
shows.

A slice is an address, so it is the type of a parameter, a local `const`,
and a result, and never the type of memory, of a module constant, or of a
module variable:

```wyst fails
struct Text {
  bytes: @[]u8
}
```

```text
main.wyst:2:10: error: a slice is only the type of a parameter, a local, or a result, and never in memory
```

No operator takes a slice. A slice is not memory, so `@s` of a slice `s`
is an error.

An `if` value of a slice gives the slice of the block that runs, in two
registers, as a call does. It is `@var []T` only when each block gives an
`@var []T`, so a block of read-only data, such as the bytes of a string
literal, makes the value `@[]T`:

```wyst
struct Host {
  count: u64
  bytes: [64]u8
}

fn bytes(host: @Host) -> @[]u8 {
  const count = load(@host.count)
  if count > 64 { trap() }

  return @host.bytes[..< count]
}

fn shown(host: @Host, typed: bool) -> @[]u8 {
  return if typed { bytes(host) } else { @"no host"[0 ..] }
}
```

A `store` through an element of such a value is an error, as for each
read-only slice:

```wyst fails
fn clear(bytes: @var [4]u8, all: bool) {
  const part = if all { @bytes[0 ..] } else { @""[0 ..] }
  if len(part) > 0 {
    store(@part[0], 0)
  }
}
```

```text
main.wyst:4:11: error: `store` writes only through an `@var` address, and this is @u8
```

The address and the length of a slice each use its start `x`, so `x` is a
constant or a local. `len` and `@s[i]` take a slice local or parameter.
These forms are not implemented now:

- a start that is not a constant or a local, such as `@a[x + 1 ..]`;
- `len(f())` and `@f()[i]` of a call `f()`: `const s = f()` comes first;
- a local `var`, an `Option`, and a `match` value of a slice;
- a slice parameter of a naked function;
- a slice of arrays, such as `@[][4]u8`.

## Views

`bitcast(x)` of an address `@A`, or of a slice local or parameter `@[]E`,
where the position expects an address `@B` or a slice `@[]F`, is a view:
the same memory as another type. A view makes no code. Thus a note is a
view of the bytes of a message:

```wyst
struct Message {
  count: u64
  bytes: [256]u8
}

struct Note {
  kind: u32
  width: u32
  height: u32
}

fn width(block: @Message) -> u32 {
  const note: @Note = bitcast(@block.bytes)
  return load(@note.width)
}
```

`A`, `E`, `B`, and `F` hold no address and no `Option` of an address, in
a field or an element at each depth. Thus each bit pattern of the memory
is a value of each type, and no view writes other bytes over an address:

```wyst fails
struct Link {
  next: @u64
}

fn link(bytes: @[16]u8) -> @Link {
  return bitcast(bytes)
}
```

```text
main.wyst:6:10: error: `bitcast` gives no view of @[16]u8 as @Link, because Link holds an address or an `Option` of one: the view could write other bytes over the address
```

A view can write a value at or above the limit of a
[`#[below(n)]` field](/docs/structs/#fields-with-a-limit). Then the next
`load` of that field traps, as when hostile code writes the value.

A view `@B` of `@A` needs `size_of(B) <= size_of(A)`:

```wyst fails
fn third(pair: @[2]u64) -> u64 {
  const three: @[3]u64 = bitcast(pair)
  return load(@three[2])
}
```

```text
main.wyst:2:26: error: a view of @[2]u64 as @[3]u64 is larger than the memory at the address: 24 bytes, and 16
```

A view `@B` of a slice needs the proof of the index
`(size_of(B) - 1) / size_of(E)` of the slice, as `@s[i]` does, so that
`B` is in the elements. A test of the length gives it, as
[Index proofs](/docs/index-proofs/#slices) gives:

```wyst
struct Header {
  kind: u16
  size: u16
}

fn size(bytes: @[]u8) -> u16 {
  if len(bytes) < size_of(Header) {
    return 0
  }

  const header: @Header = bitcast(bytes)
  return load(@header.size)
}
```

A view `@[]F` of a slice `@[]E` has `len(x) * size_of(E) / size_of(F)`
elements, which one shift or one division of the length gives. Thus a
`@[]u64` of a `@[]u8` has `len(x) >> 3` elements:

```wyst
fn sum(bytes: @[]u8) -> u64 {
  const words: @[]u64 = bitcast(bytes)
  var total: u64 = 0

  for word in words {
    total += word
  }

  return total
}
```

A view keeps the access of `x`: a view of an `@var` address can be
`@var` or read-only, and a view of a read-only address is read-only, as
[Read-only addresses](#read-only-addresses) gives. A view has no rule of
alignment: on Normal memory it is as a field of a
[`#[packed]` struct](/docs/structs/#packed-structs). Thus code that runs
with the MMU off, or that uses an exclusive or atomic instruction, needs
a view at a multiple of the size of each access.

`bitcast(bitcast(a))` is not a view. The inner `bitcast` gives the
address `a` as a `u64`, and the outer `bitcast` makes an address from
that `u64`, only at a [point of trust](#points-of-trust): an assertion that
the compiler does not check, as [`bitcast`](#bitcast) gives. Thus the
compiler checks none of the rules of a view there.

These forms are not implemented now:

- a view as the value of an address constant or as the first value of a
  module variable, such as `bitcast(@own.lines)`: that value is `bitcast`
  of a `u64` constant, as [Address constants](#address-constants) gives;
- a view `@[]F` of an address, such as `@[]u8` of a `@Note`;
- `bitcast` of a slice that is not a local or a parameter, such as
  `bitcast(@a[4 ..])`: `const s = @a[4 ..]` comes first;
- a view `@[]F` of `@[]E` whose length needs more than one shift or one
  division, such as `@[]u16` of a slice of 3-byte structs;
- a view of a slice, or as a slice, of a struct with no fields.

## Read-only addresses

The type of an address gives its access. `@T` is read-only, and `@var T`
is writable: `store`, and an `asm` line that stores through an address
input, need an `@var`. A `load` takes each address. `var` comes directly
after the `@`: `@var T`, `@var [N]T`, `@var []T`, and `Option<@var T>`.
The signature gives the access of each parameter and result, so a
function that only reads through an address takes `@T`:

```wyst
fn copy(from: @u32, to: @var u32) {
  store(to, load(from))
}
```

A `store` through a read-only address is an error:

```wyst fails
fn clear(cell: @u16) {
  store(cell, 0)
}
```

```text
main.wyst:2:9: error: `store` writes only through an `@var` address, and this is @u16
```

`@var` converts to `@` where the position expects `@`, also in an
`Option` and in a slice: an argument, the value of a `store`, of an
assignment, of a `return`, of `.Some`, of a `const` with a type, and of a
field of a literal. An `if` or `match` value is `@var` only when each
block gives an `@var`. Where the position gives no type, `.None`,
`.Some(v)`, and `bitcast(n)` in a block take the read-only type of the
blocks before them, so the value is read-only. `@` never converts to
`@var`, so a function that stores through its parameter cannot take a
read-only address:

```wyst fails
fn reset(cell: @var u16) {
  store(cell, 0)
}

fn start(cell: @u16) {
  reset(cell)
}
```

```text
main.wyst:6:9: error: expected @var u16, found @u16
```

Read-only is transitive, as in Rust and D. Through a read-only address,
each address that the code loads or reaches is read-only too: a `load` of
a field `@var U` gives `@U`, and of a field `Option<@var U>` gives
`Option<@U>`, and a place, a [slice](#slices), and a [view](#views) of a
read-only address are read-only. Through an `@var` address, a `load`
gives the type of the field:

```wyst
struct Node {
  value: u64
}

struct Chain {
  node: @var Node
}

fn clear(chain: @var Chain) {
  const node = load(@chain.node)
  store(@node.value, 0)
}

fn sum(chain: @Chain) -> u64 {
  const node = load(@chain.node)
  return load(@node.value)
}
```

In `sum`, `node` is `@Node`, so a `store` through it is an error:

```wyst fails
struct Node {
  value: u64
}

struct Chain {
  node: @var Node
}

fn clear(chain: @Chain) {
  const node = load(@chain.node)
  store(@node.value, 0)
}
```

```text
main.wyst:11:9: error: `store` writes only through an `@var` address, and this is @u64
```

Writable memory stays writable for code that holds its own `@var`
address: `@T` limits only what the code can do through the address that
it got. This is not `&mut` of Rust: two `@var` addresses can name the
same memory, and the compiler checks no borrow. The conversion removes
only the first `var`, so `@var @var T` does not convert to `@var @T`:
else a store through that address could put a read-only address in
memory where other code loads an `@var T`.

`@c` gives the address of the
[constant table](/docs/constants-and-variables/#constant-tables) `c`, and
`@m.c` of a `pub` table of the imported module `m`. A table is read-only
data, so `@c` is a read-only address, and so is each place, slice, and
view of it. A function can take the address as `@T` and give it as its
result, as each other address:

```wyst
struct Palette {
  bar: u32
  text: u32
}

const light: Palette = { bar = 0x00f8_f9fc, text = 0x001b_2230 }
const dark: Palette = { bar = 0x0015_181f, text = 0x00e4_e8ef }

fn palette(night: bool) -> @Palette {
  if night {
    return @dark
  }
  return @light
}

fn copy(from: @u32, to: @var u32) {
  store(to, load(from))
}

fn paint(night: bool, pixel: @var u32) {
  copy(@palette(night).text, pixel)
}
```

A `store` through the address of a table is an error, and so is an
argument of an `@var` parameter:

```wyst fails
const steps: [2]u16 = [0, 0x1018]

fn clear() {
  store(@steps[1], 0)
}
```

```text
main.wyst:4:9: error: `store` writes only through an `@var` address, and this is @u16
```

```wyst fails
const steps: [4]u16 = [0, 0x1018, 0x204f, 0x308a]

fn clear(cells: @var []u16) {
  for i in 0 ..< len(cells) {
    store(@cells[i], 0)
  }
}

fn start() {
  clear(@steps[1 ..])
}
```

```text
main.wyst:10:9: error: expected @var []u16, found @[]u16
```

A byte of a [string](/docs/values/#strings) is read-only data in the same
way: `@s[i]` is a `@u8`, and `@s[x ..]` is a `@[]u8`.

Memory and a module variable of type `@T` can hold a read-only address,
and memory of type `@var T` holds only an `@var`:

```wyst
struct Palette {
  bar: u32
}

struct Theme {
  palette: @Palette
}

const light: Palette = { bar = 0x00f8_f9fc }

fn start(theme: @var Theme) {
  store(@theme.palette, @light)
}
```

```wyst fails
struct Palette {
  bar: u32
}

struct Theme {
  palette: @var Palette
}

const light: Palette = { bar = 0x00f8_f9fc }

fn start(theme: @var Theme) {
  store(@theme.palette, @light)
}
```

```text
main.wyst:12:25: error: expected @var Palette, found @Palette
```

An integer has no access, and `bitcast` of an integer gives an `@var`, so
`bitcast` of an address or of a slice to a `u64` needs an `@var`:

```wyst fails
const steps: [2]u16 = [0, 0x1018]

fn start() -> u64 {
  return bitcast(@steps[1])
}
```

```text
main.wyst:4:18: error: `bitcast` gives a `u64` only of an `@var` address or slice, because `bitcast` of an integer gives an `@var`, and this is @u16
```

An `asm` input can hold the address of a table, as an
[address input](/docs/assembly/#address-inputs). A line that loads
through it is correct, and a line that stores through it is an error.
The `asm` blocks of a naked function, and an `asm` block that does not
return, name physical registers, so they can read the parameters of the
function in their registers and store through them. Thus a naked
function, and a function with such a block, take each address and slice
parameter as `@var`, and a `string` parameter is an error.

## load and store

`load(a)` reads the `bool`, the integer, the enum value, or the
`#[bits]` struct value at address `a`, and `store(a, v)` writes `v`
there. `a` is `@bool`, `@u8`, `@u16`, `@u32`, `@u64`, or the address of
an enum or of a `#[bits]` struct. Each is one load or one store of the
size of the integer, of one byte for a
[`bool`](/docs/structs/#plain-structs), or of the backing type of the
enum or of the `#[bits]` struct, and two for an
[enum with values](/docs/enums-and-bit-structs/#enums-with-values): the
tag and the value. A value of an enum from memory can have a tag that no
variant has, as [Enum values](/docs/enums-and-bit-structs/#enum-values)
gives. At a
[big-endian field](/docs/structs/#big-endian-fields), `load` and `store`
also reverse the bytes.

```wyst
struct Slot {
  object: u64
  generation: u32
  kind: u16
  rights: u16
}

fn reuse(slot: @var Slot, object: u64) {
  const generation = load(@slot.generation)
  store(@slot.generation, generation + 1)
  store(@slot.object, object)
}
```

At the address of a plain struct, `store` takes a
[struct literal](/docs/structs/#struct-literals) and writes the full
struct: each named field, and 0 in each other byte.

```wyst
struct Descriptor {
  address: u64
  length: u32
  flags: u16
  next: u16
}

fn give(descriptor: @var Descriptor, buffer: u64) {
  store(descriptor, { address = buffer, length = 2048, flags = 2 })
}
```

`load` of a whole struct gives a [struct value](/docs/structs/#struct-values)
when each field is a `bool`, an integer, an enum without values, or a
`#[bits]` struct. `load` of another struct, and `load` and `store` of a
whole array, are not implemented now.

A register map is not memory, so `load` and `store` do not take the
[address of a register map](/docs/registers/#addresses-of-register-maps).
A register access uses it:

```wyst fails
#[register_map]
struct Pl011 {
  FR: readonly u32 at 0x18 { TXFF: bool at 5 }
}

fn busy(uart: @Pl011) -> bool {
  return load(uart) & 0x20 != 0
}
```

```text
main.wyst:7:15: error: a register map is not memory, so `load` does not take @Pl011; a register access, such as `p.R.read()`, uses the address `p`
```

Here `uart.FR.read().TXFF` reads the flag.
