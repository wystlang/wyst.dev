---
title: Control flow
summary: if, the four forms of for, and return.
---

## if

`if cond {}` runs its body when `cond`, a `bool`, is true. The condition
needs no parentheses.

`if cond {} else {}` runs the `else` block when `cond` is false. `else if`
starts the next `if` of a chain, so the chain runs the first block whose
condition is true, or the last `else` block:

```wyst
fn digits(x: u64) -> u64 {
  if x < 10 {
    return 1
  } else if x < 100 {
    return 2
  } else {
    return 3
  }
}
```

When the body and the `else` block cannot reach their ends, the `if` cannot
either. Thus a function with a result can end with it, and a statement
after it is an error.

A condition can join `bool` values with `&&` and `||`, as
[Operators](/docs/operators/#logical-operators) shows:

```wyst
fn inside(x: u64, low: u64, high: u64) -> bool {
  if low <= x && x < high {
    return true
  }
  return false
}
```

`else` after an `Option` value takes the value of `.Some`, as
[Optional values](/docs/options/#unwrap-with-else) shows.

A body with one statement can stay on one line:

```wyst
fn check(count: u64) {
  if count > 4 { trap() }
}
```

## for

`for` is the one loop. It has four forms.

`for {}` runs its body forever. `break` is not implemented now, so only a
`return` in the body leaves the loop. A statement after the loop is an
error. A function with a result can end with `for {}`, as
[Functions](/docs/functions/#results) shows:

```wyst
fn idle() -> never {
  for {
    asm {
      wfi
    }
  }
}
```

The checker does not read `for true {}` as a loop that does not end, so
`for true {}` cannot end a function with a result.

`for cond {}` runs its body while `cond` is true. It tests `cond` before
each pass:

```wyst
var count: u64 = 0

fn count_to(limit: u64) {
  for count < limit {
    count += 1
  }
}
```

A loop with an empty body waits for a condition, such as a device bit:
`for uart.FR.read().BUSY {}`.

`for i in a ..< b {}` runs its body one time for each value from `a` up
to, but not including, `b`. `a` and `b` have one type, `u8`, `u16`, `u32`,
or `u64`, which is the type of `i`. A literal bound takes the type of the
other bound, so one bound must have a type: `0 ..< count` is correct, and
`0 ..< 4` is an error. The loop computes `b` one time, before the first
pass. An empty range runs no pass.

```wyst
var sum: u64 = 0

fn add_range(first: u64, end: u64) {
  for i in first ..< end {
    sum += i
  }
}
```

`for byte in "text" {}` runs its body one time for each byte of a string
literal, as [Values and types](/docs/values/#strings) shows.

`for i in a ..= b`, `break`, and `continue` are not implemented now.

## return

`return` ends the function. In a function with a value or `Option` result,
`return` takes a value of that type. In a function without a result,
`return` has no value. A function that returns `never` cannot use
`return`. A statement after `return` is an error.

When `value` is `.None`, `value?` also returns `.None`, as
[Optional values](/docs/options/#the-operator) shows.

## Not implemented now

The grammar also has these forms. The compiler does not implement them
now:

- `match`, with variant patterns;
- labels (`name:`) and `goto`;
- `for x in e` over the elements of an array or a slice;
- `if` and `match` as values.
