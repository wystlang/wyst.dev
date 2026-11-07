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
  results, `never`, and `#[inline]`. A struct with no fields takes no
  register. A call result is an operand, an argument, or the value
  of an assignment.
- `if` with `else` and `else if`, `match` on an integer, an enum, or an
  enum with values, with `.V(v)` patterns, `if`
  and `match` as values, `for` in five forms, with `..<` and `..=`
  ranges and over a slice, `break`, `continue`, and `return`.
- `Option` results, parameters, and local constants of a value type, an
  enum, or a `#[bits]` struct, `Option` results of an address, `else`
  unwrap, `?`, `match` with `.Some(v)` and `.None`, and the check that
  each path reads an `Option`.
- Linear `#[bits]` structs and linear structs with no fields, `xfer`
  parameters, which take a linear value, and parameters that lend it.
- Plain structs, structs with no fields as the type of parameters, local
  constants, and results, `size_of`, `field_offset`, address types,
  address constants, places, `load`, `store`, `store` of a struct literal
  with nested literals, `bitcast`, `widen`, and `truncate`.
- Constant tables of an array or a plain struct type, with array and
  struct literals, `@c` of a table, and the check that no `store` writes
  through the address of a table, also in a function that takes it.
- Slices `[]T` as the type of parameters, local constants, and results,
  `@a[x ..< y]`, `@a[..< y]`, and `@a[x ..]` of an array address or a
  slice, `len`, `@s[i]`, `for x in s`, and the check that no `store`
  writes through a slice of a table.
- `#[big_endian]` fields of plain structs and `#[big_endian]` registers.
- Index proofs from constants, masks and other operators, field widths,
  range loops, conditions, `match` arms, `if` and `match` values, calls,
  and writes, and the proofs of slices from bounds against a local and
  lowest values.
- Enums as the type of bit fields, constants, parameters, locals, local
  `var`s, results, and fields of plain structs, `pub` enums, enums with
  values as the type of parameters, locals, local `var`s, results, and
  memory, `#[bits]` structs as the type
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
| `match` on a value that is not a `uN`, an enum, or an `Option`, such as an `i64`, and a pattern in `.V(p)` other than a new local or `_`, such as `.Row(0)` | Refused. A `match` on a `uN`, an enum, also with values, or an `Option` works. Give the value of `.V(v)` to a local, and compare it. |
| A range loop on `i64` values | Use a `for cond {}` loop on a local `var`. |
| An `if` or `match` value of an `Option`, of an enum with values, or of a slice | `return` the value in each block of an `if` or `match` statement, or assign an enum with values to a local `var`. |
| `for x in` an array | Use `for x in @a[0 ..]`. |
| `for x in` a slice of a type other than an integer, an enum without values, or a `#[bits]` struct, such as a plain struct | Use `for i in 0 ..< len(s)` and `@s[i]`. |
| A local `var` of a type other than `bool`, `u8` to `u64`, `i64`, a `#[bits]` struct, and an enum, such as an address or a slice | Use a `const`. |
| `var x = f() else { trap() }` | Use `const y = f() else { trap() }`, then `var x = y`. |
| A call in the index of a device, such as `redistributors[cpu() & 3]` | Put the result in a local. |
| `?` inside an expression, such as `return f()?` | Use `const x = f()?`, then use `x`. |
| `Option` as the type of a local `var`, a module variable, a module constant, or a field, and an `Option` parameter of a naked function | Use a local `const`, or unwrap the `Option` with `else`, `?`, or `match`. |
| `in xN` on a parameter or a local, such as `a: u64 in x0` | Use an `asm` input `name in xN = value`. |
| Named arguments of a function, such as `g(a = 1)` | Give the arguments in order. |
| `string` as the type of a local, a variable, a field, or a result, and a `string` parameter of the entry or of a naked function | `string` is only the type of a parameter of a function that a call starts. Give the string literal as the argument. |
| An index of a `string`, such as `text[0]` | A `for` loop on the `string` visits each byte. |
| `Result` and `align_of` | Refused. |
| Methods, generics, and interfaces | Refused. |
| `mut`, a `linear` plain struct with fields, and a `linear` enum | Refused. |
| An `Option` local or parameter of a linear type, and a `match` on such an `Option` | Unwrap the `Option` at the call with `else` or `?`. |
| A local `var`, a module constant, and memory of a linear type | Keep the value in a local `const` or a parameter. |
| Register maps, devices, and the vector table of another module, and `pub` on a register map or a device | A module uses only the `pub` functions, constants, plain structs, `#[bits]` structs, enums, and system registers, and `@m.f` of the `pub` functions of another module. |
| A plain struct with fields as a parameter, a local, or a variable | A plain struct with fields is only the type of memory at an address. |
| A local `var` or an `Option` of a struct with no fields, and an argument of it that is a call or an `if` or `match` value | Use a local `const`. |
| A parameter of a struct with no fields or of a linear type in a naked function | Refused. |
| A field of a plain struct of another type, such as `bool` | A field is `u8`, `u16`, `u32`, `u64`, `i64`, an enum, a plain struct, a `#[bits]` struct, or an array of them. |
| A struct literal of a plain struct other than the value of `store` or of a constant table, a value of an array field in a literal of `store`, and a literal of `store` of a struct of more than 4096 bytes | Store the elements of an array field after the literal. |
| A constant table of more than 65536 bytes, and a `pub` constant table of a plain struct that is not `pub` | Refused. |
| `load` of a struct, and `load` and `store` of an array | Load each field, or store each element. |
| An address as a module variable or a field | An address is only the type of a parameter, a local, a result, or a constant. Keep a `u64`, and make the address with `bitcast`. |
| An address, a slice, or an `Option` of an address as the result of a `pub` function, and a `pub` address constant | Refused. A function that is not `pub` can give an address or a slice, and each module declares its own address constant. |
| An `Option` of an address as a parameter or a local | Refused. `else`, `?`, or `match` takes it at the call. |
| An address constant whose value is not `bitcast` of a `u64` constant, such as `@own.lines` | Refused. |
| `@` of a local, of a module variable, or of a module constant that is not an address or a constant table | Refused. |
| `@T` for another `T`, such as `@bool`, `@@u64`, or `@[2][2]u8` | `T` is `u8`, `u16`, `u32`, `u64`, `i64`, an enum, a plain struct, a `#[bits]` struct, or an array of them. |
| `bitcast` of a `u8`, `u16`, or `u32` | Make a `u64` with `widen` first. |
| Arrays as values: parameters, locals, and variables, and a literal such as `[1, 2]` other than the value of a constant table | An array is only the target of an address, an array of devices, or a constant table. |
| A start of a slice that is not a constant or a local, such as `@a[x + 1 ..]` | Put the start in a local. |
| `len` and an element of a slice that is not a local or a parameter, such as `len(f())` and `@f()[0]` | Put the slice in a local first: `const s = f()`. |
| A slice parameter of a naked function, an `Option` of a slice, and a slice of arrays, such as `[][4]u8` | Refused. |
| A device as a parameter, such as `gic: Gic` | A function names the device of its module. |
| A `#[bits]` struct as a module variable | Use the backing type, such as `u64`. To read a field, give the value to a local of the struct type. |
| A variant with two or more values, a module variable of an enum type, and an enum with values as a module constant, a value in a constant table, or the value of `Some` | Refused. A parameter, a local, a result, and a field of a plain struct can have an enum type, also with values, and the value of `Some` an enum without values. |
| `load` of an enum with values at an address with a call or a register read, such as `load(@slot().shape)` | Put the address in a local first. |
| An enum without a backing type, a variant without a tag, and a tag other than an integer literal | Give the backing type `uN` and an integer literal tag for each variant. |
| A `scratch` output, operand types such as `a: u64 in x0 = v`, an output in a named register, and more than one output of an `asm` block | Refused. |
