---
title: Control flow
summary: if, match, the four forms of for, break and continue, and return.
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

## match

`match value {}` runs the arm that has a pattern equal to `value`, an
integer. A pattern is an integer or a constant of the module, of the type
of `value`. An arm can have more patterns, with `,` between them. `_`
matches each other value, so it is the only pattern of the last arm:

```wyst
const wait: u16 = 4
const send: u16 = 11

fn cost(call: u16) -> u64 {
  match call {
    0, 1 { return 1 }
    wait { return 2 }
    send { return 3 }
    _ { return 0 }
  }
}
```

Without `_`, no arm runs for a value that no pattern gives. When the
`match` has `_` and no arm can reach its end, the `match` cannot either.
Thus a function with a result can end with it, as `cost` does, and a
statement after it is an error. The code computes `value` one time, so a
`match` on a register read reads the register one time.

A value cannot be two patterns of the `match`, also in one arm:

```wyst fails
fn size(x: u8) -> u8 {
  match x {
    1, 2 { return 1 }
    2 { return 2 }
    _ { return 0 }
  }
}
```

```text
main.wyst:4:5: error: the value 2 is already a pattern of this `match`
```

## for

`for` is the one loop. The compiler implements four forms of it now.

`for {}` runs its body until a `break` or a `return` leaves the loop. A
`for {}` without a `break` does not end, so a statement after it is an
error, and a function with a result can end with it, as
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

`for i in a ..= b {}` also runs its body for `b`. It ends also when `b` is
the highest value of the type, such as 0xff for `u8`. When `a` is above
`b`, the loop runs no pass.

```wyst
var sum: u64 = 0

fn add_through(first: u64, last: u64) {
  for i in first ..= last {
    sum += i
  }
}
```

`for byte in text {}` runs its body one time for each byte of `text`, a
string literal or a `string` parameter, as
[Values and types](/docs/values/#strings) shows.

## break and continue

`break` leaves the innermost loop, and the statement after that loop runs
next. `continue` ends the pass of the innermost loop: a loop with a
condition tests it again, and a range loop or a string loop goes to its next
value.

```wyst
var total: u64 = 0

fn add_odd(limit: u64) {
  for i in 0 ..< limit {
    if (i & 1) == 0 { continue }
    if total > 1000 { break }

    total += i
  }
}
```

`break` and `continue` act only on a loop of their own function. Thus each
one is an error outside a loop, also in a function that a loop calls. A
statement after `break` or `continue` is an error.

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

- `match` on a value that is not an integer, and the variant patterns
  `.V` and `.V(p)`;
- labels (`name:`) and `goto`;
- `for x in e` over the elements of an array or a slice;
- `if` and `match` as values.
