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
these. `N` is a constant, such as a module constant.

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

An address is only the type of a parameter or a local now. A result, a
module variable, and memory cannot hold an address. Thus a function cannot
keep an address after the call.

## bitcast

`bitcast(x)` gives the `u64` `x` as the address type that its position
expects. It is the only way to make an address:

```wyst
fn table_at(frame: u64) {
  const table: @[2048]u64 = bitcast(frame)
  store(@table[0], 0)
}
```

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
address. `@` of a local or of a module variable is not implemented now.

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
