---
title: Status
summary: What the compiler implements now, and the grammar that waits for a user.
---

Wyst grows mainly when its one user, a new kernel, needs a feature. Thus the
grammar has forms that the compiler does not implement now. The compiler
refuses such a form with an error that names the form and says "not
implemented now", such as ``error: `goto` is not implemented now``, and
these pages say "not implemented now" for it.
This page lists both sides.

## Implemented now

- Modules, imports with aliases, `pub` functions, constants, and system
  registers.
- The value types `bool`, `u8`, `u16`, `u32`, and `u64`, and `never`.
- `string` parameters, with a string literal as the argument.
- Module constants, `static_assert`, module variables with `=`, `+=`, and
  `-=`,
  and local constants.
- The operators `+`, `-`, `*`, `/` and `%` by a constant, `&`, `|`, `^`,
  `<<` and `>>` by a constant, unary `-`, `~`, `!`, `&&`, `||`, and the six
  comparisons.
- Functions with up to 8 parameters, value and `Option` results, `never`,
  and `#[inline]`. A call result is an operand, an argument, or the value
  of an assignment.
- `if` with `else` and `else if`, `match` on an integer, `for` in four
  forms, with `..<` and `..=` ranges, `break`, `continue`, and `return`.
- `Option` results, `else` unwrap, and `?`.
- Plain structs, `size_of`, `field_offset`, address types, places, `load`,
  `store`, `bitcast`, `widen`, and `truncate`.
- Index proofs from constants, masks and other operators, range loops,
  conditions, calls, and writes.
- Enums of bit fields and of module constants, `pub` enums, `#[bits]`
  structs, register maps, devices, arrays of devices, system registers,
  offsets and bit positions that the compiler computes, and locals that
  keep a register snapshot.
- Checked `asm` blocks, with inputs, outputs, `Option` outputs, and blocks
  that do not return.
- Naked functions with parameters, `#[el2]` functions, code addresses, the
  exception vector table, function sections, and semihosting.
- Implementation-defined system registers, by their encoding.
- `wync build` and `wync fmt`.

## Not implemented now

These forms are in the grammar or the design. Each one enters mainly when the
kernel needs it:

| Form | Now |
| --- | --- |
| Labels and `goto` | Refused. |
| `match` on a value that is not an integer, and the variant patterns `.V` and `.V(p)` | Refused. A `match` on an integer works. |
| `if` and `match` as values | Refused. |
| `for x in` an array or a slice | Use `for i in a ..< b` and the index `i`. |
| `*=`, `/=`, `%=`, `&=`, `\|=`, `^=`, `<<=`, and `>>=` | Use `x = x * y`. |
| `var` in a function body | Locals do not change. |
| A call in the index of a device, such as `redistributors[cpu() & 3]` | Put the result in a local. |
| `?` inside an expression, such as `return f()?` | Use `const x = f()?`, then use `x`. |
| `Option` as the type of a parameter or a variable | Unwrap the `Option` with `else` or `?`. |
| `in xN` on a parameter or a local, such as `a: u64 in x0` | Use an `asm` input `name in xN = value`. |
| Named arguments of a function, such as `g(a = 1)` | Give the arguments in order. |
| `string` as the type of a local, a variable, a field, or a result, and a `string` parameter of the entry or of a naked function | `string` is only the type of a parameter of a function that a call starts. Give the string literal as the argument. |
| An index of a `string`, such as `text[0]` | A `for` loop on the `string` visits each byte. |
| `Result`, `i64`, `len`, and `align_of` | Refused. |
| Methods, generics, and interfaces | Refused. |
| `mut`, `xfer`, `linear`, and `_ = v` | Refused. |
| Structs, devices, and the vector table of another module, and `pub` on a struct or a device | A module uses only the `pub` functions, constants, enums, and system registers, and `@m.f` of the `pub` naked functions of another module. |
| A plain struct as a parameter, a local, or a variable | A plain struct is only the type of memory at an address. |
| A field of a plain struct of another type, such as `bool` | A field is `u8`, `u16`, `u32`, `u64`, a plain struct, or an array of them. |
| A struct literal of a plain struct | Write each field with `store`. |
| `load` and `store` of a struct or an array | Load or store each field. |
| An address as a module variable or a field | An address is only the type of a parameter, a local, or a result. Keep a `u64`, and make the address with `bitcast`. |
| An address as the result of a `pub` function, and an `Option` of an address | Refused. A function that is not `pub` can give an address. |
| `@` of a local, of a module variable, or of a module constant | Refused. |
| `@T` for another `T`, such as `@bool`, `@@u64`, `@[2][2]u8`, or a `#[bits]` struct | `T` is `u8`, `u16`, `u32`, `u64`, a plain struct of the module, or an array of them. |
| `bitcast` of a `u8`, `u16`, or `u32` | Make a `u64` with `widen` first. |
| Arrays as values: parameters, locals, variables, constants, and literals such as `[1, 2]` | An array is only the target of an address or an array of devices. |
| Slices `[]T` and slice expressions `a[i ..< j]` and `a[i ..]` | Refused. |
| A device as a parameter, such as `gic: Gic` | A function names the device of its module. |
| A `#[bits]` struct as a parameter, a variable, or a result, and a `#[bits]` local that unwraps an `Option` | Use the backing type, such as `u64`. To read a field, give the value to a local `const` of the struct type. |
| A `#[bits]` literal other than the value of a constant or a local `const`, such as an argument of `store` | Put the literal in a local `const` first. |
| A `#[bits]` field value at run time | Field values are constants. |
| Enum variants with payloads, such as `Some(u64)`, and an enum as the type of a parameter, a local, or a variable | An enum is only the type of a bit field or of a module constant. |
| An enum without a backing type, a variant without a value, and a variant value other than an integer literal | Give the backing type `uN` and an integer literal for each variant. |
| `scratch` operands, operand types such as `a: u64 in x0 = v`, an output in a named register, and more than one output of an `asm` block | Refused. |
| An `asm` block with an output in an expression, such as `1 + asm -> v {...}` | Give the block to a local `const`, then use the local. |
