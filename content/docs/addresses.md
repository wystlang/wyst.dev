---
title: Addresses and memory
summary: Address types, places, load, store, and bitcast.
---

A function reads and writes memory through an address. The type of the
address gives the type of the memory, so each access has a known size and
offset.

## Address types

`@T` is the type of an address of memory of type `T`. `T` is `u8`, `u16`,
`u32`, `u64`, a plain struct of the module, or an array `[N]T` of one of
these. `N` is a constant, such as a module constant. Another target, such
as `bool`, an address, or an array of arrays, is not implemented now.

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

An address is the type of a parameter, a local, or a result. A module
variable and memory cannot hold an address now. Thus a function cannot
keep an address after the call, except through its result.

## bitcast

`bitcast(x)` gives the `u64` `x` as the address type that its position
expects. It is the only way to make an address from an integer:

```wyst
fn table_at(frame: u64) {
  const table: @[2048]u64 = bitcast(frame)
  store(@table[0], 0)
}
```

`bitcast` makes only an address from a `u64` now. A literal has no type
in `bitcast(...)`. Put the value in a typed constant, such as
`const uart: u64 = 0x0900_0000`, and use `bitcast(uart)`.

The code that calls `bitcast` asserts that memory of that type is at `x`
while the address is in use. The compiler does not check this. Thus each
`bitcast` marks a place where the program trusts a fact that the compiler
cannot prove.

## Places

`@p.f` is the address of field `f` of the struct at address `p`. `@p[i]`
is the address of element `i` of the array at address `p`. The forms
combine, as in `@table[i].kind`.

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
array. [Index proofs](/docs/index-proofs/) gives the rules.

`@p`, where `p` is an address, is an error, because `p` is already the
address. `@` of a local, of a module variable, or of a module constant is
not implemented now.

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
it comes from a parameter or from `bitcast`. A call statement that drops
the address is an error, as for a value result.

The result of a `pub` function cannot be an address now. No kernel code
needs one, and the address of a struct would give another module the
fields of a struct that is local to its module. An `Option` of an address
is not implemented now.

## load and store

`load(a)` reads the integer at address `a`, and `store(a, v)` writes `v`
there. `a` is `@u8`, `@u16`, `@u32`, or `@u64`. Each is one load or one
store of the size of the integer.

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

`load` and `store` of a whole struct or array are not implemented now.
