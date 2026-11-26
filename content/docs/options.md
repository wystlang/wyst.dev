---
title: Optional values
summary: Option results, parameters, locals, fields, and values, match, else blocks, and the ? operator.
---

## Option

`Option<T>` is a value of type `T`, or no value. `T` is a value type, an
enum without values, a `#[bits]` struct, or an address type. Its variants are
`.Some(value)` and `.None`. An `Option` is the type of a function result,
of a parameter, and of a local `const`, and memory holds an `Option` of an
integer, of an enum without values, or of an address, as
[Option fields](#option-fields) shows. A local `var` can hold an `Option`
of an address, so a loop goes along a list, as
[Lists](/docs/addresses/#lists) shows. The output `Option<u64>` of an
`asm` block is also an `Option`, as
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
an `Option` local or parameter of that type, a `load` of that type, or an
`if` or `match` value of that type, as [Option values](#option-values)
shows.

An `Option` takes two registers: the tag, 0 for `None` and not 0 for
`Some`, and the value of `Some`. `.Some(v)` gives the tag 1, and a `load`
gives the tag that memory holds. Thus an `Option` parameter takes two of
the 8 parameter registers. `else`, `?`, and `match` take its value, and
`==` and `!=` compare two of them, as [Compare options](#compare-options)
shows. No other operator takes an `Option`.

## Unwrap with else

A call statement cannot drop an `Option`. `else` takes the value of
`.Some` of a call, of an `asm` block, of an `Option` local or parameter,
of a `load` of an `Option` in memory, or of an `if` or `match` value:

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

`return value else { ... }` returns the value of `.Some`, so the function
has the result type of that value, or a `#[bits]` struct of that backing
type, as `const x: T = value else { ... }` has:

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

fn index(table: @[slots]u64, key: u64) -> u64 {
  return find(table, key) else { trap() }
}
```

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
a `load`, and an `if` or `match` value.

## Compare options

`==` and `!=` compare two `Option` values of one type. `.None` is equal
only to `.None`, and `.Some(a)` is equal to `.Some(b)` when `a == b`. A
variant takes its type from the other operand, as in
`find(table, key) != .None`. `.None` can be either operand, and
`.Some(v)` only the right operand, as the end of this section gives:

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

fn present(table: @[slots]u64, key: u64) -> bool {
  return find(table, key) != .None
}

fn first(table: @[slots]u64, key: u64) -> bool {
  return find(table, key) == .Some(0)
}

fn together(table: @[slots]u64, a: u64, b: u64) -> bool {
  return find(table, a) == find(table, b)
}
```

`==` and `!=` take an `Option` of an integer, an enum without values, an
address, or a `#[bits]` struct that is not linear. Two addresses are
equal when they are the same address. Each tag that is not 0 is `.Some`,
also a tag from memory, and `x == .None` reads only the tag of `x`. Else
the code computes the tag and the value of each operand, from left to
right, also the value `v` of `.Some(v)` when the other operand gives
`.None`. The word of an `Option` of an address in memory is its tag and
its address, so the code reads it one time:

```wyst
struct Record {
  value: u64
  next: Option<@Record>
}

fn before(record: @Record, other: @Record) -> bool {
  return load(@record.next) == .Some(other)
}

fn last(record: @Record) -> bool {
  return load(@record.next) == .None
}
```

An `Option` of another type, such as `Option<bool>`, is an error:

```wyst fails
fn same(a: Option<bool>, b: Option<bool>) -> bool {
  return a == b
}
```

```text
main.wyst:2:12: error: `==` takes an `Option` only of an integer, an enum, an address, or a `#[bits]` struct that is not linear, found Option<bool>
```

Operands of two types are an error:

```wyst fails
fn wide() -> Option<u64> {
  return .None
}

fn narrow() -> Option<u8> {
  return .None
}

fn same() -> bool {
  return wide() == narrow()
}
```

```text
main.wyst:10:20: error: expected Option<u64>, found Option<u8>
```

A variant takes its type from the other operand, so the checker checks
the right operand first, but the code computes the left operand first.
Thus `.Some(v)` as the left operand of `==` or `!=` is not implemented
now:

```wyst fails
fn first(found: Option<u64>) -> bool {
  return .Some(0) == found
}
```

```text
main.wyst:2:10: error: a variant with a value as the left operand of `==` is not implemented now; write `x == .Some(v)`
```

## Must-use

An `Option` must be used. A path from an `Option` local `const` or
parameter to the end of its block, or to a `return`, a `?`, a `break`, or
a `continue` that leaves its block, must read it: with `else`, `?`,
`match`, `==`, or `!=`, as an argument, as the value of `return`, or as
the value of another local. An assignment changes a local `var`, so this
rule does not take it. A path that calls a `never` function, such as
`trap()`, needs no read. A loop body can run no time, and the code can
skip the right operand of `&&` and `||`, so a read there does not count
for a local outside it. `_ = value` and a parameter `_` cannot drop an
`Option`.

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

`?` is only the whole value of a statement, of `const`, or of `_ =` now.
`?` gives the value of `.Some`, not an `Option`, so `else` or a second `?`
cannot follow it. Thus `return value?` is an error: `?` needs an `Option`
result, and the value of `.Some` is not an `Option`. A `?` in a block of
an `if` or `match` value returns `.None` from the function, as
[Option values](#option-values) shows.

## Undo

`const x = value undo { ... }` in a function with an `Option` result
gives `x` a block that runs before each later return of `.None` in the
scope of `x`: a `return .None`, a `?`, an `else` block that returns
`.None`, and a return of an `Option` value that is `.None`. Thus a
function that takes several things, and then fails at a later step,
gives back each thing that it took in one place, and each later step is
one `?`:

```wyst
const slots: u64 = 8

// The slots that `take` gave out, one bit for each slot.
var used: u64 = 0

// Takes the lowest free slot.
fn take() -> Option<u64> {
  for slot in 0 ..< slots {
    if used & (1 << slot) == 0 {
      used |= 1 << slot
      return .Some(slot)
    }
  }
  return .None
}

fn give(slot: u64) {
  used &= ~(1 << (slot & 63))
}

// Takes three slots, and gives them in bytes 0 to 2 of the result. When
// no third slot is free, gives back the first two.
fn three() -> Option<u64> {
  const a = take()? undo { give(a) }
  const b = take()? undo { give(b) }

  const c = take()?
  return .Some(a | b << 8 | c << 16)
}
```

When the third `take` gives `.None`, its `?` runs the block of `b` and
then the block of `a`: the blocks of a scope run from the last to the
first. The `?` of the value of `a` runs no block, because the block of
`a` comes after it. A return of `.Some` runs no block, and neither does
`trap()`: the function then keeps what it took.

`undo` comes after the value on its line, as `else` does, and the value
can end with `?`. The block can use `x`. It is a clause and not a
statement, so no step that can fail comes between a value and its block.
The block is in scope to the end of the block that declares `x`, so the
block of a name in a loop ends with the pass. A loop that takes one
thing in each pass keeps its `else` block, because one block after the
loop does not know the number of the passes.

The block runs before a return, so it cannot exit. It has no `return`,
`break`, `continue`, or `?`, also in a loop in the block:

```wyst fails
fn take() -> Option<u64> {
  return .Some(1)
}

fn give(slot: u64) {}

fn two() -> Option<u64> {
  const a = take()? undo {
    give(a)
    return .Some(a)
  }

  const b = take()?
  return .Some(a + b)
}
```

```text
main.wyst:10:5: error: an `undo` block cannot exit, so it cannot have `return`
```

A function without an `Option` result has no `undo`.

The block can give away a [linear value](/docs/functions/#linear-values)
with `xfer`. It gives the value away on each path that runs the block, so
a `?` after the clause does not drop the value. The path that returns
`.Some` gives the value away as each other path does, after its last step
that can fail:

```wyst
#[bits]
linear struct Frame: u64 {
  ADDRESS: u64 at 0..=63
}

fn alloc() -> Option<Frame> {
  return .Some({ ADDRESS = 0x4000_0000 })
}

fn free(frame: xfer Frame) {
  _ = frame
}

// Puts the frame in a table, which then holds it.
fn keep(frame: xfer Frame) {
  _ = frame
}

fn find() -> Option<u64> {
  return .Some(1)
}

fn map() -> Option<u64> {
  const frame = alloc()? undo { free(xfer frame) }
  const n = find()?
  keep(xfer frame)

  return .Some(n)
}
```

A return of `.None` after a path gave the value away is an error, because
the block would use the value again:

```wyst fails
#[bits]
linear struct Frame: u64 {
  ADDRESS: u64 at 0..=63
}

fn alloc() -> Option<Frame> {
  return .Some({ ADDRESS = 0x4000_0000 })
}

fn free(frame: xfer Frame) {
  _ = frame
}

fn keep(frame: xfer Frame) {
  _ = frame
}

fn find() -> Option<u64> {
  return .Some(1)
}

fn map() -> Option<u64> {
  const frame = alloc()? undo { free(xfer frame) }
  keep(xfer frame)

  const n = find()?
  return .Some(n)
}
```

```text
main.wyst:26:13: error: the `undo` block that this return of `.None` runs uses linear local `frame`, which this path gave away
```

A block that only lends the value or reads a field of it gives the same
error when a path gave the value away before the return. So do two
blocks that each give the value away: the blocks run from the last to the
first, so the earlier block uses the value after the later block gave it
away:

```wyst fails
#[bits]
linear struct Frame: u64 {
  ADDRESS: u64 at 0..=63
}

fn alloc() -> Option<Frame> {
  return .Some({ ADDRESS = 0x4000_0000 })
}

fn free(frame: xfer Frame) {
  _ = frame
}

fn find() -> Option<u64> {
  return .Some(1)
}

fn map() -> Option<u64> {
  const frame = alloc()? undo { free(xfer frame) }
  const n = find()? undo { free(xfer frame) }

  const m = find()?
  free(xfer frame)

  return .Some(n + m)
}
```

```text
main.wyst:22:13: error: the `undo` block that this return of `.None` runs uses linear local `frame`, which this path gave away
```

`undo` in a block of an `if` or `match` value is not implemented now.
The value of the block can be the `.None` of a `return` after the end of
the block, and the scope of the name ends with the block, so no block
would run. Declare the name in a block of an `if` or `match` statement,
and `return` there.

## Option values

An `if` or `match` value can be an `Option`. Its value takes two
registers, as the result of a call does, so it goes where such a result
goes: `return`, a local, an argument, a `store`, and the value of `else`,
`?`, and `match`. A variant takes its type from its position, so a value
of `return` gives `.Some` and `.None` the result type. Thus a call that
tries a second source when the first gives `.None`, and a call that puts
a key in a free slot when it does not find the key, are each one value.
The `?` in the block returns `.None` when no slot is free:

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

fn either(first: @[slots]u64, second: @[slots]u64, key: u64) -> Option<u64> {
  return match find(first, key) {
    .Some(i) { .Some(i) }
    .None { find(second, key) }
  }
}

fn slot(table: @var [slots]u64, key: u64) -> Option<u64> {
  return match find(table, key) {
    .Some(i) { .Some(i) }
    .None {
      const i = find(table, 0)?
      store(@table[i & (slots - 1)], key)
      .Some(i)
    }
  }
}
```

Each block gives an `Option` of one type, so `Option<u64>` and
`Option<u8>` in two arms are an error:

```wyst fails
fn wide() -> Option<u64> {
  return .None
}

fn narrow() -> Option<u8> {
  return .None
}

fn pick(k: u64) -> Option<u64> {
  return match k {
    0 { wide() }
    _ { narrow() }
  }
}
```

```text
main.wyst:12:9: error: expected Option<u64>, found Option<u8>
```

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
const own: @var State = bitcast(state)

fn enter(slot: u64) {
  store(@own.hover, .Some(slot))
}

fn outlined(slot: u64) -> bool {
  return load(@own.hover) == .Some(slot)
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

`load` gives the `Option` in memory, and `match`, `else`, `?`, `==`, `!=`,
a local, an argument, and `return` take it. `match`, `else`, and `?` test
the tag, and load the value only for `.Some`. `store` writes the tag and
the value, each in its full word: `.Some(v)` writes 1 and `v`, and
`.None` writes 0 in each byte. A value from a `load`, a call, an `asm`
block, a local, or a parameter also writes 1 and the value for `.Some`,
and 0 in each byte for `.None`. Thus a message that another domain reads
keeps no old byte. A [struct literal](/docs/structs/#struct-literals) can
name an `Option` field, as in
`store(own, { count = 1, hover = .Some(3) })`.

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

An `Option` of an address in memory is one word, the address of `.Some`
or 0 for `.None`, as
[Addresses in memory](/docs/addresses/#addresses-in-memory) shows. Its
`load` is one load, so its address can have a call, and a module variable
can also hold it, with the first value `.None`. `Option<@var T>` holds a
writable address, and `.Some` of an `@var T` converts to `Option<@T>`.
Through a read-only address, a `load` of `Option<@var T>` gives
`Option<@T>`, as
[Read-only addresses](/docs/addresses/#read-only-addresses) gives.

## Not implemented now

`Result<T, E>`, with `.Ok` and `.Error`, is not implemented now. The `?`
of a `Result` returns its error from a function with a `Result` result of
the same error type. An `Option` as a module constant, a local `var` and
a module variable of an `Option` other than an `Option` of an address, an
`Option` in memory of another type, such as `Option<bool>`, a value of an
`Option` in a constant table, other than `.None` of an `Option` of an
address, and an `Option` parameter of a naked function are not
implemented now.
