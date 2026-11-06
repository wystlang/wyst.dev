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

- Modules, imports with aliases, `pub` functions, constants, plain
  structs, and system registers.
- The value types `bool`, `u8`, `u16`, `u32`, `u64`, and `i64`, and
  `never`.
- `string` parameters, with a string literal as the argument.
- Character literals, such as `'q'`, which are integer literals with the
  value of one byte.
- Module constants, `static_assert`, module variables, local constants,
  `=` and the compound assignments, such as `+=` and `<<=`, and `_ = v`,
  which drops a value.
- The operators `+`, `-`, `*`, `/` and `%` by a constant, `&`, `|`, `^`,
  `<<`, `>>`, unary `-`, `~`, `!`, `&&`, `||`, and the six comparisons.
- Functions with up to 8 parameters in 8 registers, value and `Option`
  results, `never`, and `#[inline]`. A call result is an operand, an argument, or the value
  of an assignment.
- `if` with `else` and `else if`, `match` on an integer or an enum, `if`
  and `match` as values, `for` in four forms, with `..<` and `..=`
  ranges, `break`, `continue`, and `return`.
- `Option` results, parameters, and local constants of a value type, an
  enum, or a `#[bits]` struct, `Option` results of an address, `else`
  unwrap, `?`, `match` with `.Some(v)` and `.None`, and the check that
  each path reads an `Option`.
- Plain structs, `size_of`, `field_offset`, address types, address
  constants, places, `load`, `store`, `store` of a struct literal with
  nested literals, `bitcast`, `widen`, and `truncate`.
- `#[big_endian]` fields of plain structs and `#[big_endian]` registers.
- Index proofs from constants, masks and other operators, field widths,
  range loops, conditions, `match` arms, `if` and `match` values, calls,
  and writes.
- Enums as the type of bit fields, constants, parameters, locals, results,
  and fields of plain structs, `pub` enums, `#[bits]` structs as the type
  of constants, parameters, locals, local `var`s, results, and fields of
  plain structs, with field values at run time, register maps, register banks, devices, arrays of devices,
  system registers, offsets and bit positions that the compiler computes,
  locals that keep a register snapshot, and `modify` of a register.
- Checked `asm` blocks, with inputs, outputs as values, `Option` outputs,
  and blocks that do not return.
- Naked functions with parameters, the check that a function that runs
  with no stack uses none, the check that each function that starts on a
  new stack fits in the `stack` of the layout, `#[el2]` functions, code
  addresses, the exception vector table, function sections, and
  semihosting.
- Implementation-defined system registers, by their encoding.
- `wync build` and `wync fmt`.

## Not implemented now

These forms are in the grammar or the design. Each one enters mainly when the
kernel needs it:

| Form | Now |
| --- | --- |
| Labels and `goto` | Refused. |
| `match` on a value that is not a `uN`, an enum, or an `Option`, such as an `i64`, and the variant pattern `.V(p)` of an enum | Refused. A `match` on a `uN`, an enum, or an `Option` works. |
| A range loop on `i64` values | Use a `for cond {}` loop on a local `var`. |
| An `if` or `match` value of an `Option` | `return` the `Option` in each block of an `if` or `match` statement. |
| `for x in` an array or a slice | Use `for i in a ..< b` and the index `i`. |
| A local `var` of a type other than `bool`, `u8` to `u64`, `i64`, and a `#[bits]` struct, such as an address | Use a `const`. |
| `var x = f() else { trap() }` | Use `const y = f() else { trap() }`, then `var x = y`. |
| A call in the index of a device, such as `redistributors[cpu() & 3]` | Put the result in a local. |
| `?` inside an expression, such as `return f()?` | Use `const x = f()?`, then use `x`. |
| `Option` as the type of a local `var`, a module variable, a module constant, or a field, and an `Option` parameter of a naked function | Use a local `const`, or unwrap the `Option` with `else`, `?`, or `match`. |
| `in xN` on a parameter or a local, such as `a: u64 in x0` | Use an `asm` input `name in xN = value`. |
| Named arguments of a function, such as `g(a = 1)` | Give the arguments in order. |
| `string` as the type of a local, a variable, a field, or a result, and a `string` parameter of the entry or of a naked function | `string` is only the type of a parameter of a function that a call starts. Give the string literal as the argument. |
| An index of a `string`, such as `text[0]` | A `for` loop on the `string` visits each byte. |
| `Result`, `len`, and `align_of` | Refused. |
| Methods, generics, and interfaces | Refused. |
| `mut`, `xfer`, and `linear` | Refused. |
| Register maps, `#[bits]` structs, devices, and the vector table of another module, and `pub` on a register map, a `#[bits]` struct, or a device | A module uses only the `pub` functions, constants, plain structs, enums, and system registers, and `@m.f` of the `pub` functions of another module. |
| A plain struct as a parameter, a local, or a variable | A plain struct is only the type of memory at an address. |
| A field of a plain struct of another type, such as `bool` | A field is `u8`, `u16`, `u32`, `u64`, `i64`, an enum, a plain struct, a `#[bits]` struct, or an array of them. |
| A struct literal of a plain struct other than the value of `store`, a value of an array field in a literal, and a literal of a struct of more than 4096 bytes | Store the elements of an array field after the literal. |
| `load` of a struct, and `load` and `store` of an array | Load each field, or store each element. |
| An address as a module variable or a field | An address is only the type of a parameter, a local, a result, or a constant. Keep a `u64`, and make the address with `bitcast`. |
| An address or an `Option` of an address as the result of a `pub` function, and a `pub` address constant | Refused. A function that is not `pub` can give an address, and each module declares its own address constant. |
| An `Option` of an address as a parameter or a local | Refused. `else`, `?`, or `match` takes it at the call. |
| An address constant whose value is not `bitcast` of a `u64` constant, such as `@own.lines` | Refused. |
| `@` of a local, of a module variable, or of a module constant that is not an address | Refused. |
| `@T` for another `T`, such as `@bool`, `@@u64`, or `@[2][2]u8` | `T` is `u8`, `u16`, `u32`, `u64`, `i64`, an enum, a plain struct, a `#[bits]` struct, or an array of them. |
| `bitcast` of a `u8`, `u16`, or `u32` | Make a `u64` with `widen` first. |
| Arrays as values: parameters, locals, variables, constants, and literals such as `[1, 2]` | An array is only the target of an address or an array of devices. |
| Slices `[]T` and slice expressions `a[i ..< j]` and `a[i ..]` | Refused. |
| A device as a parameter, such as `gic: Gic` | A function names the device of its module. |
| A `#[bits]` struct as a module variable | Use the backing type, such as `u64`. To read a field, give the value to a local of the struct type. |
| Enum variants with payloads, such as `Some(u64)`, and a module variable of an enum type | Refused. A parameter, a local, a result, a field of a plain struct, and the value of `Some` can have an enum type. |
| An enum without a backing type, a variant without a value, and a variant value other than an integer literal | Give the backing type `uN` and an integer literal for each variant. |
| A `scratch` output, operand types such as `a: u64 in x0 = v`, an output in a named register, and more than one output of an `asm` block | Refused. |
