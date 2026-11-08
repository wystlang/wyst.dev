---
title: Optional values
summary: Option results, parameters, locals, and fields, match, else blocks, and the ? operator.
---

## Option

`Option<T>` is a value of type `T`, or no value. `T` is a value type, an
enum without values, a `#[bits]` struct, or an address type. Its variants are
`.Some(value)` and `.None`. An `Option` is the type of a function result,
of a parameter, and of a local `const`, and memory holds an `Option` of an
integer or of an enum without values, as [Option fields](#option-fields)
shows. An `Option` of an address is only a result, as
[Addresses and memory](/docs/addresses/#address-results) shows. The
output `Option<u64>` of an `asm` block is also an `Option`, as
[Assembly](/docs/assembly/#option-outputs) shows.

```wyst
const slots: u64 = 8

fn find(table: @[slots]u64, key: u64) -> Option<u64> {
  for i in 0 ..< slots {
    if load(@table[i]) == key {
      return .Some(i)
    }
  }
  return .None
}
```

`return` takes `.Some(value)`, `.None`, a call with the same result type,
an `Option` local or parameter of that type, or a `load` of that type.

An `Option` takes two registers: the tag, 0 for `None` and not 0 for
`Some`, and the value of `Some`. `.Some(v)` gives the tag 1, and a `load`
gives the tag that memory holds. Thus an `Option` parameter takes two of
the 8 parameter registers. No operator takes an `Option`: `else`, `?`, and
`match` take its value.

## Unwrap with else

A call statement cannot drop an `Option`. `else` takes the value of
`.Some` of a call, of an `asm` block, of an `Option` local or parameter,
or of a `load` of an `Option` in memory:

```wyst
const slots: u64 = 8

fn find(table: @[slots]u64, key: u64) -> Option<u64> {
  for i in 0 ..< slots {
    if load(@table[i]) == key {
      return .Some(i)
    }
  }
  return .None
}

var total: u64 = 0

fn add(table: @[slots]u64, key: u64) {
  const index = find(table, key) else { return }
  total += index

  find(table, 0) else { trap() }
}
```

`const index = find(table, key) else { return }` gives the value of
`.Some` to `index`. When the result is `.None`, the `else` block runs. That
block cannot use `index`, and it must not reach its end. As a path of a
[function](/docs/functions/#results) does, it ends with `return`, a call to
a `never` function such as `trap()`, `for {}`, or an `asm -> never` block.

`find(table, 0) else { trap() }` drops the value of `.Some`. It states that
the key must be in the table.

## match

`const x = f()` keeps the `Option` of the call in the local `x`. `match`
runs the arm of its variant. The pattern `.Some(v)` gives the value of
`Some` to the new local `v`, and `.Some(_)` gives it to no local. `_` is
the arm of each variant that no arm above it names:

```wyst
fn pick(x: u8) -> Option<u8> {
  if x > 4 {
    return .Some(x)
  }
  return .None
}

var count: u8 = 0

fn note(found: Option<u8>) {
  match found {
    .Some(v) { count += v }
    .None {}
  }
}

fn twice(x: u8) -> u8 {
  const found = pick(x)
  note(found)

  return match pick(x + 1) {
    .Some(v) { v }
    _ { 0 }
  }
}
```

An arm has one pattern. A `match` statement can omit an arm, and then no
arm runs for that variant. A `match` value has an arm for each variant,
or `_`. `match` also takes a call directly, as `match pick(x + 1)` does,
and a `load`.

## Must-use

An `Option` must be used. A path from an `Option` local or parameter to
the end of its block, or to a `return`, a `?`, a `break`, or a `continue`
that leaves its block, must read it: with `else`, `?`, or `match`, as an
argument, as the value of `return`, or as the value of another local. A
path that calls a `never` function, such as `trap()`, needs no read. A
loop body can run no time, and the code can skip the right operand of
`&&` and `||`, so a read there does not count for a local outside it.
`_ = value` and a parameter `_` cannot drop an `Option`.

```wyst fails
fn pick(x: u8) -> Option<u8> {
  return .None
}

fn use_pick() {
  const result = pick(1)
}
```

```text
main.wyst:6:9: error: local `result` is an `Option` that a path to the end of its block does not read
```

## The ? operator

`value?` is `value else { return .None }`, so it is valid only in a
function with an `Option` result. `const x = value?` keeps the value, and
the statement `value?` drops it:

```wyst
const slots: u64 = 8

fn find(table: @[slots]u64, key: u64) -> Option<u64> {
  for i in 0 ..< slots {
    if load(@table[i]) == key {
      return .Some(i)
    }
  }
  return .None
}

fn distance(table: @[slots]u64, a: u64, b: u64) -> Option<u64> {
  const i = find(table, a)?

  const j = find(table, b)?
  return .Some(j - i)
}
```

`?` is only the whole value of a statement or of `const` now. `?` gives
the value of `.Some`, not an `Option`, so `else` or a second `?` cannot
follow it.

## Option fields

Memory holds an `Option<T>` with `T` an integer or an enum without
values: a field of a [plain struct](/docs/structs/), an element of an
array, and the target of an address. Its layout is that of an
[enum with values](/docs/enums-and-bit-structs/#enums-with-values) of
`u8`: the tag, a `u8`, and then the value of `.Some`, each in a word of
the width of `T`. Thus an `Option<u64>` has 16 bytes, and an
`Option<u8>` has 2. The tag 0 is `.None`, and each other tag is `.Some`,
so each byte in memory gives a value, and memory of zeros is `.None`.

```wyst
struct State {
  count: u64
  hover: Option<u64>
  keys: [4]Option<u8>
}

static_assert(size_of(State) == 32 && field_offset(State, keys) == 24)

const state: u64 = 0x4008_8000
const own: @State = bitcast(state)

fn enter(slot: u64) {
  store(@own.hover, .Some(slot))
}

fn outlined(slot: u64) -> bool {
  return match load(@own.hover) {
    .Some(hover) { hover == slot }
    .None { false }
  }
}

fn release(key: u64) -> Option<u8> {
  if key >= 4 {
    return .None
  }

  const holder = load(@own.keys[key])
  store(@own.keys[key], .None)

  return holder
}
```

`load` gives the `Option` in memory, and `match`, `else`, `?`, a local, an
argument, and `return` take it. `match`, `else`, and `?` test the tag, and
load the value only for `.Some`. `store` writes the tag and the value,
each in its full word: `.Some(v)` writes 1 and `v`, and `.None` writes 0
in each byte. A value from a `load`, a call, an `asm` block, a local, or
a parameter also writes 1 and the value for `.Some`, and 0 in each byte
for `.None`. Thus a message that another domain reads keeps no old byte. A
[struct literal](/docs/structs/#struct-literals) can name an `Option`
field, as in `store(own, { count = 1, hover = .Some(3) })`.

`load` reads the tag and then the value, and computes the address for
each read, so an address with a call or a register read is not
implemented now:

```wyst fails
struct Column {
  back: Option<u64>
}

fn column(slot: u64) -> @Column {
  return bitcast(0x4008_8000 + slot * 16)
}

fn back_of(slot: u64) -> Option<u64> {
  return load(@column(slot).back)
}
```

```text
main.wyst:10:15: error: `load` of an `Option` at an address with a call is not implemented now
```

Put the address in a local first, as in `const record = column(slot)` and
then `load(@record.back)`.

## Not implemented now

`Result<T, E>`, with `.Ok` and `.Error`, is not implemented now. The `?`
of a `Result` returns its error from a function with a `Result` result of
the same error type. An `Option` as a local `var`, a module variable, or
a module constant, an `Option` in memory of another type, such as
`Option<bool>`, a value of an `Option` in a constant table, an `Option`
parameter of a naked function, and an `if` or `match` value of an
`Option` are not implemented now.
