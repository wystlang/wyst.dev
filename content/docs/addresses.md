---
title: Addresses and memory
summary: Address types, places, load, store, and bitcast.
---

A function reads and writes memory through an address. The type of the
address gives the type of the memory, so each access has a known size and
offset.

## Address types

`@T` is the type of an address of memory of type `T`. `T` is `u8` to
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
`@u32` are different types:

```wyst fails
fn next(base: @u64) {
  const after: @u64 = base + 8
}
```

```text
main.wyst:2:28: error: `+` needs integers, found @u64
```

[`bitcast`](#bitcast) gives the address as a `u64`, and a
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
expects. It is the only way to make an address from an integer:

```wyst
fn table_at(frame: u64) {
  const table: @[2048]u64 = bitcast(frame)
  store(@table[0], 0)
}
```

A string is read-only data, so `bitcast` of a `string` is an error, also
to a `u64`: the code could make the address again and write through it.
`len(s)`, `@s[i]`, and `@s[x ..]` read a string, as
[Values and types](/docs/values/#strings) gives:

```wyst
fn banner() -> []u8 {
  const name = "Wyst"
  return @name[0 ..]
}
```

`bitcast(a)` of an address of memory `a`, or of a slice local or
parameter `a`, gives the address as a `u64` where the position expects a
`u64` or gives no type, as an `asm` input or an operand. It makes no code.
Of a slice, it is the address of its first element:

```wyst
struct Message {
  count: u64
  bytes: [256]u8
}

fn end(block: @Message) -> u64 {
  return bitcast(block) + size_of(Message)
}

fn clean(block: @Message) {
  asm(start = bitcast(@block.bytes)) {
    dc civac, start
  }
}
```

The address of a register map, a `string`, and an `Option` give no
integer. An integer is not an address, so a function that gives an
address parameter to `bitcast` as a `u64` keeps it, as a `store` of it in
memory does, and the address cannot be read-only data, as
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
const own: @State = bitcast(state)

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
`@T`, where `T` is `u8` to `u64`, `i8` to `i64`, or a plain struct. The
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

fn attach(link: @Link, record: @Record) {
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

var records: @Records = bitcast(unset)

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

fn put(link: @Link, record: u64) {
  store(@link.record, record)
}
```

```text
main.wyst:10:23: error: expected @Record, found u64
```

A function that stores an address parameter in memory, or that assigns
it to a module variable, keeps it after the call. The compiler infers
that, also in the functions that it calls, and the signature does not say
it. Memory cannot keep the address of read-only data, as
[Read-only addresses](#read-only-addresses) gives.

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

fn attach(link: @Link, record: @Record) {
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
`bitcast` makes an address at each use.

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

fn record(domain: u64) -> @Domain {
  const all: @[count]Domain = bitcast(records)
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

The compiler infers what the result of a `pub` function can come from, as
for each other result, so a `store` through the result of a call is an
error when the result can be the address of a
[constant table](#read-only-addresses), also in another module.

## Slices

`[]T` is the type of a slice: the address of a number of elements of type
`T`, one after the other, and that number, its length. `T` is a type that
an address can have. A slice takes two registers: the address, and then
the length.

`@a[x ..< y]` gives the slice of the elements of `a` from `x` up to, but
not including, `y`. `a` is the address of an array `[N]T`, or a slice
local or parameter. `@a[..< y]` starts at 0, and `@a[x ..]` ends at the
end of `a`: `N`, or the length of the slice. `x` and `y` are `uN` values,
as an index is. `len(s)` gives the length of the slice local or
parameter `s`, a `u64`, and `@s[i]` is the address of element `i`:

```wyst
struct Buffer {
  count: u64
  bytes: [64]u8
}

fn used(buffer: @Buffer) -> []u8 {
  const count = load(@buffer.count)
  if count > 64 { trap() }

  return @buffer.bytes[..< count]
}

fn clear(bytes: []u8) {
  for i in 0 ..< len(bytes) {
    store(@bytes[i], 0)
  }
}

fn reset(buffer: @Buffer) {
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
  bytes: []u8
}
```

```text
main.wyst:2:10: error: a slice is only the type of a parameter, a local, or a result, and never in memory
```

No operator takes a slice. A slice is not memory, so `@s` of a slice `s`
is an error.

The address and the length of a slice each use its start `x`, so `x` is a
constant or a local. `len` and `@s[i]` take a slice local or parameter.
These forms are not implemented now:

- a start that is not a constant or a local, such as `@a[x + 1 ..]`;
- `len(f())` and `@f()[i]` of a call `f()`: `const s = f()` comes first;
- a local `var`, an `Option`, and an `if` or `match` value of a slice;
- a slice parameter of a naked function;
- a slice of arrays, such as `[][4]u8`.

## Views

`bitcast(x)` of an address `@A`, or of a slice local or parameter `[]E`,
where the position expects an address `@B` or a slice `[]F`, is a view:
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

fn size(bytes: []u8) -> u16 {
  if len(bytes) < size_of(Header) {
    return 0
  }

  const header: @Header = bitcast(bytes)
  return load(@header.size)
}
```

A view `[]F` of a slice `[]E` has `len(x) * size_of(E) / size_of(F)`
elements, which one shift or one division of the length gives. Thus a
`[]u64` of a `[]u8` has `len(x) >> 3` elements:

```wyst
fn sum(bytes: []u8) -> u64 {
  const words: []u64 = bitcast(bytes)
  var total: u64 = 0

  for word in words {
    total += word
  }

  return total
}
```

A view has the origin of `x`, so a view of read-only data is read-only
data, as [Read-only addresses](#read-only-addresses) gives. A view has no
rule of alignment: on Normal memory it is as a field of a
[`#[packed]` struct](/docs/structs/#packed-structs). Thus code that runs
with the MMU off, or that uses an exclusive or atomic instruction, needs
a view at a multiple of the size of each access.

`bitcast(bitcast(a))` is not a view. The inner `bitcast` gives the
address `a` as a `u64`, and the outer `bitcast` makes an address from
that `u64`: an assertion that the compiler does not check, as
[`bitcast`](#bitcast) gives. Thus the compiler checks none of the rules
of a view there.

These forms are not implemented now:

- a view as the value of an address constant or as the first value of a
  module variable, such as `bitcast(@own.lines)`: that value is `bitcast`
  of a `u64` constant, as [Address constants](#address-constants) gives;
- a view `[]F` of an address, such as `[]u8` of a `@Note`;
- `bitcast` of a slice that is not a local or a parameter, such as
  `bitcast(@a[4 ..])`: `const s = @a[4 ..]` comes first;
- a view `[]F` of `[]E` whose length needs more than one shift or one
  division, such as `[]u16` of a slice of 3-byte structs;
- a view of a slice, or as a slice, of a struct with no fields.

## Read-only addresses

`@c` gives the address of the
[constant table](/docs/constants-and-variables/#constant-tables) `c`, and
`@m.c` of a `pub` table of the imported module `m`. A function can take
the address and give it as its result, as each other address:

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

fn copy(from: @u32, to: @u32) {
  store(to, load(from))
}

fn paint(night: bool, pixel: @u32) {
  copy(@palette(night).text, pixel)
}
```

A table is read-only, so a `store` through its address is an error:

```wyst fails
const steps: [2]u16 = [0, 0x1018]

fn clear() {
  store(@steps[1], 0)
}
```

```text
main.wyst:4:9: error: `store` cannot write through this address: it can be the address of constant table `main.steps`, which is read-only data
```

The signature does not say which parameters a function writes through.
The compiler infers, for each function, the address parameters that it
stores through, also in the functions that it calls, and the parameters
and the tables that its result can come from. Thus `copy` above can take
the address of a table as `from`, but not as `to`:

```wyst fails
const steps: [2]u16 = [0, 0x1018]

fn reset(cell: @u16) {
  clear(cell)
}

fn clear(at: @u16) {
  store(at, 0)
}

fn start() {
  reset(@steps[0])
}
```

```text
main.wyst:12:9: error: function `main.reset` stores through parameter `cell`, so it cannot take this address: it can be the address of constant table `main.steps`, which is read-only data
```

A [slice](#slices) of a table is read-only data in the same way. `clear`
stores through its slice parameter, so it cannot take a slice of
`steps`:

```wyst fails
const steps: [4]u16 = [0, 0x1018, 0x204f, 0x308a]

fn clear(cells: []u16) {
  for i in 0 ..< len(cells) {
    store(@cells[i], 0)
  }
}

fn start() {
  clear(@steps[1 ..])
}
```

```text
main.wyst:10:9: error: function `main.clear` stores through parameter `cells`, so it cannot take this address: it can be the address of constant table `main.steps`, which is read-only data
```

A byte of a [string](/docs/values/#strings), and a slice of its bytes, is
read-only data in the same way, so a `store` through `@s[i]` or through
an element of `@s[x ..]` is an error, also in a function that takes the
address or the slice.

A `load` of an [address in memory](#addresses-in-memory) gives no
origin, so a `store` through it would not find the table. Thus memory
and a module variable cannot keep the address of a table or of a byte of
a string, also through a parameter that a function keeps:

```wyst fails
struct Palette {
  bar: u32
}

struct Theme {
  palette: @Palette
}

const light: Palette = { bar = 0x00f8_f9fc }

fn choose(theme: @Theme, palette: @Palette) {
  store(@theme.palette, palette)
}

fn start(theme: @Theme) {
  choose(theme, @light)
}
```

```text
main.wyst:16:17: error: function `main.choose` keeps parameter `palette`, so it cannot take this address: it can be the address of constant table `main.light`, which is read-only data
```

`bitcast` of an address to a `u64` keeps the address in the same way, so
it cannot be the address of a table or of a byte of a string, also
through a local, a result, a [view](#views), or a parameter that a
function gives to `bitcast`:

```wyst fails
const steps: [2]u16 = [0, 0x1018]

fn number(cell: @u16) -> u64 {
  return bitcast(cell)
}

fn start() -> u64 {
  return number(@steps[1])
}
```

```text
main.wyst:8:17: error: function `main.number` keeps parameter `cell`, so it cannot take this address: it can be the address of constant table `main.steps`, which is read-only data
```

A view of a table is read-only data, as the table is, so a `store`
through it is an error.

An `asm` input cannot hold the address of a table, as it cannot hold
another address, also as the `u64` that `bitcast` gives. The `asm`
blocks of a naked function, and an `asm` block that does not return,
name physical registers, so they can read the parameters of the function
in their registers. Thus a naked function, and a function with such a
block, stores through each of its address and `string` parameters. A
byte of a string is read-only data, so a string argument of such a
function is an error.

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

fn reuse(slot: @Slot, object: u64) {
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

fn give(descriptor: @Descriptor, buffer: u64) {
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
