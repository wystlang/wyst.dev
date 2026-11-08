---
title: Constants and variables
summary: Module constants, constant tables, static_assert, module variables, and locals.
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

A constant can also be an address, when its value is `bitcast` of a
`u64` constant. Each use gives the address, as
[Address constants](/docs/addresses/#address-constants) gives:

```wyst
struct Counter {
  ticks: u64
}

const counter: u64 = 0x0100_8000
const own: @Counter = bitcast(counter)

fn tick() {
  store(@own.ticks, load(@own.ticks) + 1)
}
```

## Constant tables

A module constant of an array type `[N]T` or of a plain struct type is a
constant table: read-only data, such as a table of colors. Its value is
an array literal of N elements, or a struct literal. An element or a
field of an array type takes an array literal, and one of a plain struct
type takes a struct literal. Each other value is a constant of its type.
A field that the literal does not name is 0, and so is each byte of
padding. A `#[bits]` value that the compiler computes gives each fixed
field its fixed value, so the literal names each field in which 0 gives
a fixed field another value, as in `flags = {}`:

```wyst
struct Palette {
  bar: u32
  text: u32
  favicons: [3]u32
  lit: u8
}

const light: Palette = { bar = 0x00f8_f9fc, favicons = [0x002f_5fe0, 0x00b9_5918, 0x001a_835a], lit = 179 }
const steps: [4]u16 = [0, 0x1018, 0x204f, 0x308a]

fn favicon(sum: u64) -> u32 {
  return load(@light.favicons[sum % 3])
}

fn step(i: u64) -> u16 {
  if i >= 4 {
    return 0
  }
  return load(@steps[i])
}
```

`@name` gives the address of the table, and `@m.name` of a `pub` table
of an imported module, so `load` reads it, as
[Read-only addresses](/docs/addresses/#read-only-addresses) gives. The
name alone is not a value:

```wyst fails
const steps: [2]u16 = [0, 0x1018]

fn first() -> u16 {
  return steps[0]
}
```

```text
main.wyst:4:10: error: `steps` is a constant table, not a value; `@steps` gives its address, and `load(@steps[i])` reads an element
```

The literal has the length of the array:

```wyst fails
const steps: [4]u16 = [0, 0x1018, 0x204f]
```

```text
main.wyst:1:23: error: expected 4 elements, found 3
```

An array literal has no type of its own, so it is only the value of a
constant table, and the table needs its type. A table is in the section
`.rodata`, after the string literals, and it has at most 65536 bytes now.

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
constant or a struct of module `b`, the compiler computes the values of
`b` up to that item at that point, if it did not compute them before. A
value of `b` up to that item can then use only the constants and structs
of `a` above that value of `a`. Thus put such a constant of `a` above the
value that uses `b`. The values of `b` below that item come later, so
they can also use the items of `a` below the value. Here the length of
`colors` is `site.samples`, and `site.Column`, below `samples`, holds a
`Shade`, which is below `colors`:

```wyst ui/site.wyst
import main

pub const samples: u64 = 3

pub struct Column {
  sample: u64
  shade: main.Shade
}
```

```wyst
import ui.site

const colors: [site.samples]u32 = [0x00fd_e3d3, 0x00d4_efdc, 0x00f8_ebbf]

pub struct Shade {
  color: u32
}

fn paint(column: @site.Column) {
  const sample = load(@column.sample)
  if sample < site.samples {
    store(@column.shade.color, load(@colors[sample]))
  }
}
```

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

`name = value` and the compound assignments, such as `name += value` and
`name |= value`, change a module variable or a [local `var`](#locals).
[Operators](/docs/operators/#assignment) gives their rules.

Each module variable is in the ELF file with its initial value, in the
section `.data`. The program does not need to clear memory before it
starts.

## Locals

`const name = value` in a function body declares a local that cannot
change. `var name: T = value` declares a local `var`, which an assignment
can change while its name is in scope. As a module variable, a local `var`
has the type `bool`, `u8`, `u16`, `u32`, `u64`, or `i64`, and it can also
have a [`#[bits]` struct](/docs/enums-and-bit-structs/#values) type or an
[enum](/docs/enums-and-bit-structs/#enum-values) type, also with values.
The type is optional when the value has a type:

```wyst
fn sum(limit: u64) -> u64 {
  var total: u64 = 0

  var i = limit
  for i != 0 {
    total += i
    i -= 1
  }

  return total
}
```

An assignment gives an enum with values a new tag and value, and the value
of the variant can read the `var`: it reads the value before the
assignment:

```wyst
enum Shape: u8 {
  Empty = 0
  Line(u64) = 1
}

fn length(shape: Shape) -> u64 {
  match shape {
    .Line(n) { return n }
    _ { return 0 }
  }
}

fn grown(n: u64) -> u64 {
  var shape: Shape = .Empty
  shape = .Line(n)
  shape = .Line(length(shape) + 1)

  return length(shape)
}
```

The value of a `const` can be an
[`if` or `match` value](/docs/control-flow/#if-and-match-values), so a
local that a condition selects needs no `var`:

```wyst
fn edge(left: u64, width: u64, right: bool) -> u64 {
  const x = if right { left + width } else { left }
  return x
}
```

A local `var` of another type, such as an address, is not implemented
now:

```wyst fails
fn first(table: @[4]u64) {
  var cursor = table
}
```

```text
main.wyst:2:16: error: a local `var` that holds @[4]u64 is not implemented now
```

The checker keeps no proof of the highest value of a local `var`, as
[Index proofs](/docs/index-proofs/#local-variables) gives.

A parameter cannot change, because a `mut` parameter is not implemented
now:

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

A local is not a constant, also when `const` declares it, because the
compiler does not compute its value.

`_ = value` computes the value and keeps nothing, and a loop variable `_`
counts the passes with no name:

```wyst
var sent: u64 = 0

fn send(byte: u8) -> u64 {
  sent += 1
  return sent
}

fn greet(count: u64) {
  _ = send(72)

  for _ in 0 ..< count {
    _ = send(33)
  }
}
```

In the module that declares a linear type, `_ = value` consumes a value
of that type, as [Linear values](/docs/functions/#linear-values) gives. A
local cannot be `_`, so `_ = value` is the one statement that drops a
value:

```wyst fails
fn next(x: u8) -> u8 {
  return x + 1
}

fn skip(x: u8) {
  const _ = next(x)
}
```

```text
main.wyst:6:9: error: a local cannot be `_`; `_ = value` drops a value
```
