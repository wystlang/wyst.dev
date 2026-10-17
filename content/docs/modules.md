---
title: Modules and names
summary: Files, imports, pub, how a name resolves, comments, and lines.
---

## Files are modules

Each `.wyst` file is a module. The name of the file, without `.wyst`, is
the name of the module. A directory is not a module: it only groups
modules, and its name is a part of their module paths. The file
`drivers/serial.wyst` is the module `drivers.serial`.

Each module path starts at the root, the directory of the file that
`wync build` takes, or else at the target directory, the directory of the
layout file. Thus a module in `drivers/` also imports
`drivers.serial`, not `serial`. See
[Using the compiler](/docs/compiler/#module-paths).

This module is `drivers/serial.wyst`. It declares a UART and two `pub`
items:

```wyst drivers/serial.wyst
#[register_map]
struct Pl011 {
  DR: readwrite u32 at 0x00 { DATA: u8 at 0..=7 }
  FR: readonly  u32 at 0x18 { TXFF: bool at 5 }
}

pub const base: u64 = 0x0900_0000

#[mmio(base)]
const pl011: Pl011

pub fn put(byte: u8) {
  wait()
  pl011.DR.write(DATA = byte)
}

fn wait() {
  for pl011.FR.read().TXFF {}
}
```

The declarations of a module share one scope. Two declarations with the
same name are an error.

## Imports

`import drivers.serial` binds the last name of the path, `serial`. Imports
come first in a file.

```wyst
import drivers.serial

pub fn greet() {
  serial.put(0x48)
  serial.put(0x69)
}
```

`import console drivers.serial` binds the name `console` in place of
`serial`:

```wyst
import console drivers.serial

const page: u64 = console.base & ~0x3fff

fn greet() {
  console.put(0x21)
}
```

Two modules can import each other.

## pub

`pub` exports a name. Another module can use only these names of a module:

- `m.f(...)` calls the `pub` function `f` of module `m`.
- `m.name` gives the value of the `pub` constant `name`.
- `m.E` names the `pub` enum `E`. See
  [Enums and bit structs](/docs/enums-and-bit-structs/#enum-constants).
- `@m.f` gives the address of the `pub` naked function `f`. See
  [Boot and exceptions](/docs/boot-and-exceptions/).
- `m.R.read()` and `m.R.write(...)` access the `pub` system register `R`.
  See [System registers](/docs/system-registers/#sharing-a-register).

A module variable, a struct, a device, and the vector table are local to
their module now. A `pub` struct or device is not implemented now. A call
to a function that is not `pub` is an error:

```wyst fails
import drivers.serial

fn reach() {
  serial.wait()
}
```

```text
main.wyst:4:10: error: function `wait` of module `drivers.serial` is not `pub`
```

## How a name resolves

A name in a function body is, in this order: a local, a declaration of the
module, an import, a builtin name, or a layout symbol. The first match
hides the others.

The builtin names, such as `u8`, `load`, and `trap`, are not keywords. But
a declaration, an import, a parameter, and a local cannot take a builtin
name, so a builtin name always means the builtin:

```wyst fails
fn load(address: u64) {}
```

```text
main.wyst:1:4: error: `load` is a builtin name, so it cannot name a declaration
```

A field and a named argument can use a builtin name.
[Keywords and builtins](/docs/words/) lists the builtin names.

## Comments

`//` starts a comment, which ends at the end of the line. There is no
block comment. A comment can follow code on a line:

```wyst
// The next free slot.
var next: u64 = 0

fn advance() {
  next += 1 // Wraps after 2^64 - 1.
}
```

## Lines

There is no `;`. A newline ends a statement or a declaration, except after
a binary operator, `,`, `.`, `(`, `[`, or `{`. Thus a long expression
continues on the next line after its operator:

```wyst
fn align(address: u64) -> u64 {
  const aligned = (address + 0x3fff) &
    ~0x3fff
  return aligned
}
```

A newline directly inside `(...)` or `[...]` has no effect. In a body in
`{...}`, `,` also ends a statement or an entry, such as a field.
