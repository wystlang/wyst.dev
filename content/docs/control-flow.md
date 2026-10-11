---
title: Control flow
summary: if, the four forms of for, and return.
---

## if

`if cond {}` runs its body when `cond`, a `bool`, is true. The condition
has no parentheses.

`else` after `if` is not implemented now. Use an early `return` in its
place:

```wyst
fn max(a: u64, b: u64) -> u64 {
  if a > b {
    return a
  }
  return b
}
```

A body with one statement can stay on one line:

```wyst
fn check(count: u64) {
  if count > 4 { trap() }
}
```

## for

`for` is the one loop. It has four forms.

`for {}` runs its body forever. `break` is not implemented now, so the loop
does not end, and a statement after it is an error. A function that
returns `never` can end with it:

```wyst
fn idle() -> never {
  for {
    asm {
      wfi
    }
  }
}
```

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
to, but not including, `b`. `a` and `b` have one integer type, which is the
type of `i`. The loop computes `b` one time, before the first pass. An
empty range runs no pass.

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

`..=`, `break`, and `continue` are not implemented now.

## return

`return` ends the function. In a function with a result, `return` takes a
value of the result type. In a function without a result, `return` has no
value. A statement after `return` is an error.

## Not implemented now

The grammar also has these forms. The compiler does not implement them
now:

- `match`, with variant patterns;
- labels (`name:`) and `goto`;
- `if` and `match` as values.
