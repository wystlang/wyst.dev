---
title: Optional values
summary: Option results, else blocks, and the ? operator.
---

## Option

`Option<T>` is a value of type `T`, or no value. `T` is a value type. Its
variants are `.Some(value)` and `.None`. `Option<T>` is a function result
now.

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

`return` takes `.Some(value)`, `.None`, or a call with the same result
type.

## Unwrap with else

A local cannot hold an `Option`, and a call statement cannot drop it.
`else` takes the value of `.Some`:

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
block cannot use `index`, and it must not reach its end: it ends with
`return`, `trap()`, or another `never` call.

`find(table, 0) else { trap() }` drops the value of `.Some`. It states that
the key must be in the table.

A local of an `Option` is an error:

```wyst fails
fn pick(x: u8) -> Option<u8> {
  return .None
}

fn use_pick() {
  const result = pick(1)
}
```

```text
main.wyst:6:18: error: a local cannot hold Option<u8>
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

`?` is only the whole value of a statement or of `const` now.

## Not implemented now

`Result<T, E>`, with `.Ok` and `.Error`, is not implemented now. The `?`
of a `Result` returns its error from a function with a `Result` result of
the same error type.
