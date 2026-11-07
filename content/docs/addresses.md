---
title: Addresses and memory
summary: Address types, places, load, store, and bitcast.
---

A function reads and writes memory through an address. The type of the
address gives the type of the memory, so each access has a known size and
offset.

## Address types

`@T` is the type of an address of memory of type `T`. `T` is `u8`, `u16`,
`u32`, `u64`, `i64`, an enum of `u8` to `u64`, a plain struct or a
[`#[bits]` struct](/docs/enums-and-bit-structs/#values) of the module, a
`pub` plain struct `m.S` of an imported module, or an array `[N]T` of one
of these. `N` is a constant, such as a module constant. Another target,
such as `bool`, an address, or an array of arrays, is not implemented
now.

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

An address is the type of a parameter, a local, a result, or a
[module constant](#address-constants), and `@c` gives the address of a
[constant table](#read-only-addresses). A module variable and memory
cannot hold an address now. Thus a function cannot keep an address after
the call, except through its result. A [slice](#slices) is an address and
a length, with the same rule.

## bitcast

`bitcast(x)` gives the `u64` `x` as the address type that its position
expects. It is the only way to make an address from an integer:

```wyst
fn table_at(frame: u64) {
  const table: @[2048]u64 = bitcast(frame)
  store(@table[0], 0)
}
```

`bitcast(s)` of a `string` `s`, a string literal or a `string` parameter,
gives the `u64` that is the value of `s`: the address of its length, which
its bytes follow, as [Code generation](/docs/code-generation/) gives. Thus
code can read a string by address, and a function can give the address of
a string as its result:

```wyst
fn first(text: string) -> u8 {
  const head: u64 = bitcast(text)
  const length: @u64 = bitcast(head)
  if load(length) == 0 {
    return 0
  }

  const byte: @u8 = bitcast(head + 8)
  return load(byte)
}

fn banner() -> u64 {
  return bitcast("Wyst")
}
```

`bitcast` makes only an address from a `u64`, a `u64` from a `string`,
and an `i64` from a `u64` and the reverse now, as
[Values and types](/docs/values/#no-implicit-conversions) gives for
`i64`. An integer literal has no type in `bitcast(...)` of an address.
Put the value in a typed constant, such as
`const uart: u64 = 0x0900_0000`, and use `bitcast(uart)`.

The code that calls `bitcast` asserts that memory of that type is at `x`
while the address is in use. The compiler does not check this. Thus each
`bitcast` marks a place where the program trusts a fact that the compiler
cannot prove.

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

Another value, such as `@own.lines`, is not implemented now. A `pub`
address constant is not implemented now, as an address result of a `pub`
function is not:

```wyst fails
const state: u64 = 0x0100_8000
pub const own: @u64 = bitcast(state)
```

```text
main.wyst:2:16: error: a `pub` address constant is not implemented now
```

Thus a module that needs the address of a `pub` `u64` constant of another
module declares its own address constant:

```wyst platform/memory.wyst
pub const shared: u64 = 0x0100_8000
```

```wyst
import platform.memory

const words: @[2]u64 = bitcast(memory.shared)

fn total() -> u64 {
  return load(@words[0]) + load(@words[1])
}
```

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
it comes from a parameter, from `bitcast`, or from `@c` of a constant
table. A call statement that drops
the address is an error, as for a value result.

The result of a `pub` function cannot be an address now. No kernel code
needs one, and the address of a struct that is not `pub` would give
another module the fields of that struct.

A result can also be an `Option` of an address. An address is never in
memory or in a module variable, and a parameter and a local cannot hold
an `Option` of an address. `else`, `?`, and `match` take it at the call,
and give the address of `Some` to a local:

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
main.wyst:10:17: error: an `Option` of an address is only a result, which `else`, `?`, or `match` takes at the call
```

As for an address result, the result of a `pub` function cannot be an
`Option` of an address now.

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
- a slice result of a `pub` function, as for an address result, and a
  slice parameter of a naked function;
- a slice of arrays, such as `[][4]u8`.

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

An `asm` input cannot hold the address of a table, as it cannot hold
another address. The `asm` blocks of a naked function, and an `asm`
block that does not return, name physical registers, so they can read
the parameters of the function in their registers. Thus a naked
function, and a function with such a block, stores through each of its
address parameters.

## load and store

`load(a)` reads the integer, the enum value, or the `#[bits]` struct
value at address `a`, and `store(a, v)` writes `v` there. `a` is `@u8`,
`@u16`, `@u32`, `@u64`, or the address of an enum or of a `#[bits]`
struct. Each is one load or one store of the size of the integer, or of
the backing type of the enum or of the `#[bits]` struct, and two for an
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

`load` of a whole struct, and `load` and `store` of a whole array, are
not implemented now.
