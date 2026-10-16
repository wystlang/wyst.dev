---
title: Functions
summary: Parameters, results, never, results that must be used, and inline functions.
---

## Declaring a function

`fn name(parameters) -> Result { body }` declares a function. A parameter
is `name: Type`. A function has at most 8 parameters. A function without
`->` returns no value.

```wyst
fn max(a: u64, b: u64) -> u64 {
  if a > b {
    return a
  }
  return b
}
```

A parameter has a value type or an address type, which
[Addresses and memory](/docs/addresses/) describes. A function cannot
change its parameters.

## Results

A result is a value type, `Option<T>`, or `never`. A function with a
result must not reach the end of its body. Each path ends with `return`,
with a call to a `never` function such as `trap()`, with `for {}`, or with
an [`asm -> never` block](/docs/assembly/#blocks-that-do-not-return). A
function that returns `never` cannot use `return`.

```wyst fails
fn sign(x: u8) -> u8 {
  if x > 0 {
    return 1
  }
}
```

```text
main.wyst:1:4: error: function `sign` can reach its end without `return`
```

[Optional values](/docs/options/) describes `Option<T>`.

## Results must be used

A value result must be used. A call with a value result is a value as each
other value is: an operand, an argument, a condition, or the value of
`const`, an assignment, or `return`:

```wyst
var count: u8 = 0

fn above(x: u8, limit: u8) -> bool {
  return x > limit
}

fn next(x: u8) -> u8 {
  return x + 1
}

fn clamp(x: u8) -> u8 {
  if !above(x, 100) {
    count = next(count)
    return next(next(x)) + 1
  }
  return 100
}
```

The calls in a value run from left to right, and each load and each
register access stays before or after each call, as in the source. Thus
in `count + next(x)`, the value of `count` is the one before `next` runs.

A call statement that drops the result is an error:

```wyst fails
fn next(x: u8) -> u8 {
  return x + 1
}

fn skip(x: u8) {
  next(x)
}
```

```text
main.wyst:6:3: error: the `u8` result of this call is not used
```

`_ = next(x)`, which drops the result, is not implemented now.

## never

`never` is the result of a function that does not return. A call to a
`never` function ends its block, so a statement after it is an error, as a
statement after `return` is.

```wyst
fn halt() -> never {
  for {
    asm {
      wfe
    }
  }
}
```

`trap()` is a builtin `never` call. It stops the program with the
instruction `brk #0`, and the exception vectors decide what happens next.

```wyst fails
fn stop() {
  trap()
  stop()
}
```

```text
main.wyst:3:3: error: this statement is not reachable
```

## Inline functions

`#[inline] fn` is copied into each caller, and it has no code of its own.
A `return` in an inline function ends only the copied body.

```wyst
var total: u64 = 0

#[inline]
fn add(n: u64) {
  if n == 0 {
    return
  }

  total += n
}

fn add_two() {
  add(1)
  add(2)
}
```

An inline function cannot call itself, directly or through other inline
functions. It cannot be naked or the entry.

## Which functions get code

The compiler checks every function. It generates code only for the
functions that the entry or the exception vector table can reach, through
calls and `@`. Thus a module can keep a function that the program does not
use, at no cost.

These forms are not implemented now:

- methods (`fn T.f`) and generic functions;
- the parameter modes `mut` and `xfer`;
- a parameter in a register, such as `x: u64 in x0`;
- named arguments of a function.

Named arguments are only for register writes.
