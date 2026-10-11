---
title: Constants and variables
summary: Module constants, static_assert, module variables, and locals.
---

## Module constants

`const name: T = value` declares a constant of the module. The compiler
computes its value, so the value can use only literals, operators, the
constants before it in the module, and the `pub` constants of the modules
that the file imports. The type is optional when the value has a type:

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

Two modules can import each other. The compiler then checks the constants
of the other module first. A constant that needs itself, through the
constants of the two modules, is an error.

## static_assert

`static_assert(cond)` is an item of a module. It checks a `bool` constant,
and a false condition is an error. It declares no name and makes no code.
Thus a module states a fact next to the declarations that it depends on:

```wyst
const page_size: u64 = 16384
const page_shift: u64 = 14

static_assert(1 << page_shift == page_size)
```

`static_assert` is not a statement: a function body cannot have it.

## Module variables

`var name: T = value` declares a variable of the module. Its initial value
follows the rules of a constant value. Only the functions of its module can
read it or change it.

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
change, and neither can a parameter:

```wyst fails
fn count(limit: u64) {
  limit = 0
}
```

```text
main.wyst:2:3: error: cannot assign to parameter `limit`
```

`var` in a function body is not implemented now.
