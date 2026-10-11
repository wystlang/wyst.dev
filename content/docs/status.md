---
title: Status
summary: What the compiler implements now, and the grammar that waits for a user.
---

Wyst grows mainly when its one user, a new kernel, needs a feature. Thus the
grammar has forms that the compiler does not implement now. The compiler
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

These forms are in the grammar or the design. Each one enters mainly when the
kernel needs it:

| Form | Now |
| --- | --- |
| `else` after `if` | Use an early `return`. |
| `match`, `break`, `continue`, labels, and `goto` | Refused. |
| `if` and `match` as values | Refused. |
| `for i in a ..= b` | Use `..<`. |
| `for x in` an array or a slice | Use `for i in a ..< b` and the index `i`. |
| `%`, `^`, `&&`, `\|\|`, and unary `-` | Refused. |
| `==` and `!=` on a `bool` | Use the `bool` itself, or `!`. |
| `*=`, `/=`, `%=`, `&=`, `\|=`, `^=`, `<<=`, and `>>=` | Use `x = x * y`. |
| `var` in a function body | Locals do not change. |
| A call with a value result as an operand, an argument, or the value of an assignment | Put the result in a local. |
| `?` inside an expression, such as `return f()?` | Use `const x = f()?`, then use `x`. |
| `Option` as the type of a parameter or a variable | Unwrap the `Option` with `else` or `?`. |
| `in xN` on a parameter or a local, such as `a: u64 in x0` | Use an `asm` input `name in xN = value`. |
| Named arguments of a function, such as `g(a = 1)` | Give the arguments in order. |
| A string literal as a value | A string literal is only the head of a `for` loop. |
| `Result`, `i64`, `len`, and `align_of` | Refused. |
| Methods, generics, and interfaces | Refused. |
| `mut`, `xfer`, `linear`, and `_ = v` | Refused. |
| Structs, enums, devices, system registers, and the vector table of another module | A module uses only the `pub` functions, the `pub` constants, and `@m.f` of the `pub` naked functions of another module. |
| A plain struct as a parameter, a local, or a variable | A plain struct is only the type of memory at an address. |
| A field of a plain struct of another type, such as `bool` | A field is `u8`, `u16`, `u32`, `u64`, a plain struct, or an array of them. |
| A struct literal of a plain struct | Write each field with `store`. |
| `load` and `store` of a struct or an array | Load or store each field. |
| An address as a function result, a module variable, or a field | An address is only the type of a parameter or a local. Repeat the place in each function. |
| `@` of a local or of a module variable | Refused. |
| `@T` for another `T`, such as `@bool`, `@@u64`, `@[2][2]u8`, or a `#[bits]` struct | `T` is `u8`, `u16`, `u32`, `u64`, a plain struct of the module, or an array of them. |
| `bitcast` of a `u8`, `u16`, or `u32` | Make a `u64` with `widen` first. |
| Arrays as values: parameters, locals, variables, constants, and literals such as `[1, 2]` | An array is only the target of an address or an array of devices. |
| Slices `[]T` and slice expressions `a[i ..< j]` | Refused. |
| A local that holds a register snapshot | Read each field with its own `read`. |
| A device as a parameter, such as `gic: Gic` | A function names the device of its module. |
| A register offset or a bit position other than an integer literal | Write an integer literal. |
| A `#[bits]` struct as a parameter, a variable, or a result, and a `#[bits]` local that unwraps an `Option` | Use the backing type, such as `u64`. To read a field, give the value to a local `const` of the struct type. |
| A `#[bits]` literal other than the value of a constant or a local `const`, such as an argument of `store` | Put the literal in a local `const` first. |
| A `#[bits]` field value at run time | Field values are constants. |
| Enum variants with payloads, such as `Some(u64)`, and enums outside bit fields | Enums are only bit field types. |
| `scratch` operands, operand types such as `a: u64 in x0 = v`, an output in a named register, and more than one output of an `asm` block | Refused. |
| An `asm` output of a type other than `u64` or `Option<u64>` | Use a `u64` output and `truncate`. |

## Waiting in the kernel

Some kernel code uses a simpler form until the compiler has a feature:

- A function result of type `@T`, so that one function gives the record of
  a domain or the end of a channel.
- `match` with integer patterns, so that the kernel call dispatch is one
  `match`.
- A string literal as a value, so that one function writes a line to the
  console.
