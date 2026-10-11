---
title: Status
summary: What the compiler implements now, and the grammar that waits for a user.
---

Wyst grows only when its one user, a new kernel, needs a feature. Thus the
grammar has forms that the compiler does not implement yet. The compiler
refuses such a form, and these pages say "not implemented now" for it.
This page lists both sides.

## Implemented now

- Modules, imports with aliases, `pub` functions and constants.
- The value types `bool`, `u8`, `u16`, `u32`, and `u64`, and `never`.
- Module constants, `static_assert`, module variables with `=`, `+=`, and
  `-=`,
  and local constants.
- The operators `+`, `-`, `*`, `/` by a constant, `&`, `|`, `<<` and `>>`
  by a constant, `~`, `!`, and the six comparisons.
- Functions with up to 8 parameters, value and `Option` results, `never`,
  and `#[inline]`.
- `if`, `for` in four forms, and `return`.
- `Option` results, `else` unwrap, and `?`.
- Plain structs, `size_of`, `field_offset`, address types, places, `load`,
  `store`, `bitcast`, `widen`, and `truncate`.
- Index proofs from constants, masks, range loops, conditions, calls, and
  writes.
- Enums of bit fields, `#[bits]` structs, register maps, devices, arrays of
  devices, and system registers.
- Checked `asm` blocks, with inputs, outputs, `Option` outputs, and blocks
  that do not return.
- Naked functions, code addresses, the exception vector table, function
  sections, and semihosting.
- `wync build` and `wync fmt`.

## Not implemented now

These forms are in the grammar or the design. Each one enters when the
kernel needs it:

| Form | Now |
| --- | --- |
| `else` after `if` | Use an early `return`. |
| `match`, `break`, `continue`, labels, and `goto` | Refused. |
| `if` and `match` as values | Refused. |
| `for i in a ..= b` | Use `..<`. |
| `%`, `^`, `&&`, `\|\|`, and unary `-` | Refused. |
| `*=`, `/=`, `%=`, `&=`, `\|=`, `^=`, `<<=`, and `>>=` | Use `x = x * y`. |
| `var` in a function body | Locals do not change. |
| A function result of an address type | Repeat the place in each function. |
| A call with a value result as an operand or an argument | Put the result in a local. |
| A string literal as a value | A string literal is only the head of a `for` loop. |
| `Result`, `i64`, `len`, and `align_of` | Refused. |
| Structs and enums of another module | A module uses only the functions and constants of another module. |
| A struct as a parameter, a local, or a variable | A struct is only the type of memory at an address. |
| A struct literal of a plain struct | Write each field with `store`. |
| `load` and `store` of a struct or an array | Load or store each field. |
| A local that holds a register snapshot | Read each field with its own `read`. |
| A `#[bits]` field value at run time | Field values are constants. |
| Methods, generics, and interfaces | Refused. |
| `mut`, `xfer`, `linear`, and `_ = v` | Refused. |
| Enum variants with values, such as `.Some(T)` in a user enum | Enums are only bit field types. |
| Slices `[]T` | Refused. |

## Waiting in the kernel

Some kernel code uses a simpler form until the compiler has a feature:

- A function result of type `@T`, so that one function gives the record of
  a domain or the end of a channel.
- `match` with integer patterns, so that the kernel call dispatch is one
  `match`.
- A string literal as a value, so that one function writes a line to the
  console.
