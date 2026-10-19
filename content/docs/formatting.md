---
title: Formatting
summary: wync fmt gives each file one standard form, with no style options and no configuration file.
---

`wync fmt` gives each file one standard form, as `gofmt` does. It has no
style options and no configuration file. It parses the file and prints the
tree with its comments. It does not change a file that does not parse.

## Commands

```sh
wync fmt < input.wyst            # format standard input to standard output
wync fmt src/                    # rewrite each .wyst file under src/
wync fmt --check boot.wyst src/  # list each file that would change
```

- With no path, `wync fmt` reads standard input and writes standard
  output. Editors use this form.
- With paths, it writes each file again. A directory gives each `.wyst`
  file under it. The walk does not go into a directory whose name starts
  with `.`, or through a symbolic link to a directory.
- `--check` changes no file. It writes the name of each file that it would
  change, and it exits with status 1 if there is one. `--check` must be the
  first argument, and at least one path must follow it. If not, `wync fmt`
  writes its usage and exits with status 2.
- A file that does not parse or that `wync fmt` cannot read gives an error,
  and `wync fmt` exits with status 1.

## An example

Before:

```wyst fragment
import runtime.semihost
import drivers.clock
#[register_map]
struct Pl011 {
  DR: readwrite u32 at 0x00 { DATA: u8 at 0..=7 }
  FR: readonly u32 at 0x18 { BUSY: bool at 3, TXFF: bool at 5 }
}
#[mmio(0x0900_0000)]
const uart: Pl011
fn put( byte:u8 ) {
    for uart.FR.read().TXFF {
    }
    uart.DR.write(DATA=byte)
}
fn start(base: u64, size: u64) {
    const end = base+size
    if end < base { trap() }
    clock.enable(base,
      end)
}
```

After `wync fmt`:

```wyst fragment
import drivers.clock
import runtime.semihost

#[register_map]
struct Pl011 {
  DR: readwrite u32 at 0x00 { DATA: u8 at 0..=7 }
  FR: readonly  u32 at 0x18 { BUSY: bool at 3, TXFF: bool at 5 }
}

#[mmio(0x0900_0000)]
const uart: Pl011

fn put(byte: u8) {
  for uart.FR.read().TXFF {}
  uart.DR.write(DATA = byte)
}

fn start(base: u64, size: u64) {
  const end = base + size
  if end < base { trap() }

  clock.enable(base,
    end,
  )
}
```

## Lines and indents

- Each indent level is 2 spaces. There are no tabs, no trailing spaces,
  and LF line ends. The file ends with one newline.
- There is no line length limit. The formatter does not wrap long lines or
  join short lines to fit a width. It keeps each line break that the
  grammar permits, and it sets the indent of the next line. A line that
  continues an expression is one more level in.
- In a list on more than one line, each next line is one level in, the
  closing `)` is on its own line, and the last element has a `,`. In a
  list on one line, the last element has no `,`. A bracket that opens on
  the line of another open bracket is one more level in.
- `{` is on the line of its statement, and `}` is on its own line. An
  empty block is `{}`. A block with one statement on one line stays on one
  line, such as `else { trap() }`.
- A body of fields, variants, or bits on one line is
  `{ a: bool at 1, b: bool at 4 }`. On more lines, each entry is on its own
  line, without `,`.

## Blank lines

- One blank line goes between two items. Between two one-line `const`,
  `var`, or `static_assert` items, and between the last import and one of
  them, the author chooses: no blank line or one. Thus assertions can stay
  directly below the constant that they check. An attribute and a comment
  directly above an item stay with it.
- Imports come first, in one group, sorted by path.
- In a block, one blank line goes between two statements when one of them
  has a body on more than one line, or when they are of different kinds.
  The kinds are a one-line guard, such as `if c { return }`; a jump, which
  is `return`, `break`, or `continue`; and each other one-line statement.
  `goto` is not implemented now. A jump in a block of two statements or
  less stays directly after the statement above it.
- A one-line `const` stays directly above the next statement when that
  statement uses its name on its first line.
- The author can add a blank line between other statements. A run of
  blank lines becomes one. There is no blank line after `{`, before `}`,
  in an `asm` body, or between a comment and the code below it.

These rules follow the `wsl` linter for Go.

## Spaces

- One space goes around a binary operator, an assignment, `=`, `->`, and
  `..<` or `..=` in a `for` range. A bit range has no spaces: `at 0..=7`.
- There is no space after a unary operator, before `?`, around `.`, inside
  `()` and `[]`, before the `(` of a call, or in `#[...]`, `Option<u64>`,
  `[N]T`, `@T`, and `.V`.
- `:` and `,` have no space before them and one space after them.

## Tables

Columns align only in tables. A table is the registers of a
`#[register_map]` struct, or the fields of a register, a `#[sysreg]`
constant, or a `#[bits]` struct, with each entry on its own line. Each
column is as wide as its widest entry. Nothing else aligns: not other
fields, not `=`, and not comments. A table is data from a datasheet that a
reader scans by column.

## What does not change

- The text of a comment does not change, and a comment does not move past
  code. The exception is a comment above an import: it moves with the
  import when the imports are sorted. A comment above the first import
  stays at the top of the file.
- Each line of an `asm` body is one level in, and its text does not
  change.
- Integers, characters, strings, and variant names keep their spelling,
  such as `0x0110_0000`, `'\n'`, and `16K`. Parentheses stay as written.
