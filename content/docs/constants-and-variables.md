---
title: Constants and variables
summary: Module constants, static_assert, module variables, and locals.
---

## Module constants

`const name: T = value` declares a constant of the module. The compiler
computes its value, so the value is a constant: a literal, `true` or
`false`, a constant before it in the module, a `pub` constant of a module
that the file imports, `size_of(T)`, `field_offset(T, f)`, `widen` or
`truncate` of a constant, or an operator on constants. A
[`#[bits]` struct](/docs/enums-and-bit-structs/#literals) literal and a
field read `x.F` of a constant `x` are also constants. A constant can
also have an [enum type](/docs/enums-and-bit-structs/#enum-constants),
with a value such as `.40Bits`. The type is optional when the value has a
type:

```wyst
const page_size: u64 = 16384
const page_shift: u64 = 14
const pages: u64 = 64
const heap_size = pages * page_size
```

A constant comes after the constants that its value uses:

```wyst fails
const heap_size: u64 = pages * 16384
const pages: u64 = 64
```

```text
main.wyst:1:24: error: `pages` is used before its declaration
```

A constant that wraps is an error, as a literal that does not fit is. See
[Operators](/docs/operators/).

## Shared constants

`pub const` exports a constant. In a file that imports module `m`,
`m.name` gives its value. It is a constant, so it can be the length of an
array or the mask of an index. Thus one module declares a fact, and the
other modules read it.

```wyst platform/cpus.wyst
pub const count: u64 = 4
```

```wyst
import platform.cpus

fn clear(stacks: @[cpus.count]u64, cpu: u64) {
  store(@stacks[cpu & (cpus.count - 1)], 0)
}
```

Two modules can import each other. When a value of module `a` uses a
constant of module `b`, the compiler computes the values of `b` at that
point, if it did not compute them before. A value of `b` can then use only
the constants of `a` above that value of `a`. Thus put such a constant of
`a` above the value that uses `b`.

## static_assert

`static_assert(cond)` is an item of a module. It checks a `bool` constant,
and a false condition is an error. It declares no name and makes no code.
Thus a module states a fact next to the declarations that it depends on.
The condition follows the rules of a constant value, so the item comes
after the declarations that it uses:

```wyst
const page_size: u64 = 16384
const page_shift: u64 = 14

static_assert(1 << page_shift == page_size)
```

`static_assert` is not a statement: a function body cannot have it.

## Module variables

`var name: T = value` declares a variable of the module. Its initial value
follows the rules of a constant value. Only the functions of its module can
read it or change it. `pub var` gives the variable a
[global ELF symbol](/docs/compiler/#symbols). Other modules still cannot
read it.

```wyst
var ticks: u64 = 0
var running: bool = true

pub fn tick() {
  ticks += 1
}

pub fn stop() {
  running = false
}
```

`name = value`, `name += value`, and `name -= value` change a module
variable. [Operators](/docs/operators/#assignment) gives their rules.

Each module variable is in the ELF file with its initial value, in the
section `.data`. The program does not need to clear memory before it
starts.

## Locals

`const name = value` in a function body declares a local. A local cannot
change, and neither can a parameter, because a local `var` and a `mut`
parameter are not implemented now:

```wyst fails
fn count(limit: u64) {
  limit = 0
}
```

```text
main.wyst:2:3: error: cannot assign to parameter `limit`
```

A block cannot have two locals with one name:

```wyst fails
fn total(a: u64, b: u64) -> u64 {
  const sum = a + b
  const sum = sum + 1
  return sum
}
```

```text
main.wyst:3:9: error: a second local `sum` in this block
```

A local of the body can hide a parameter, and a local of an inner block
or a loop variable can hide a local of an outer block:

```wyst
fn scaled(value: u64) -> u64 {
  const value = value * 2
  if value > 100 {
    const value = value - 100
    return value
  }

  return value
}
```

A local is not a constant, also when `const` declares it. The compiler
does not compute its value, so it cannot be the divisor of `/` or the
amount of a shift.

`const _ = value` computes the value and keeps nothing, and a loop
variable `_` counts the passes with no name:

```wyst
var sent: u64 = 0

fn send(byte: u8) -> u64 {
  sent += 1
  return sent
}

fn greet(count: u64) {
  const _ = send(72)

  for _ in 0 ..< count {
    const _ = send(33)
  }
}
```

`var` in a function body is not implemented now.
