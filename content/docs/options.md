---
title: Optional values
summary: Option results, parameters, and locals, match, else blocks, and the ? operator.
---

## Option

`Option<T>` is a value of type `T`, or no value. `T` is a value type, an
enum without values, a `#[bits]` struct, or an address type. Its variants are
`.Some(value)` and `.None`. An `Option` is the type of a function result,
of a parameter, and of a local `const`. An `Option` of an address is only
a result, as [Addresses and memory](/docs/addresses/#address-results) shows. The
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
or an `Option` local or parameter of that type.

An `Option` takes two registers: the tag, 1 for `Some` and 0 for `None`,
and the value of `Some`. Thus an `Option` parameter takes two of the 8
parameter registers. No operator takes an `Option`: `else`, `?`, and
`match` take its value.

## Unwrap with else

A call statement cannot drop an `Option`. `else` takes the value of
`.Some` of a call, of an `asm` block, or of an `Option` local or
parameter:

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
or `_`. `match` also takes a call directly, as `match pick(x + 1)` does.

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

## Not implemented now

`Result<T, E>`, with `.Ok` and `.Error`, is not implemented now. The `?`
of a `Result` returns its error from a function with a `Result` result of
the same error type. An `Option` as a local `var`, a module variable, a
module constant, or a field of a plain struct, an `Option` parameter of a
naked function, and an `if` or `match` value of an `Option` are not
implemented now.
