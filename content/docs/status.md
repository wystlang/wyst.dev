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
- `string` parameters, local constants, results, and `if` and `match`
  values, and `len(s)` and `@s[i]` of a `string` local or parameter, with
  a proof of the index.
- Character literals, such as `'q'`, which are integer literals with the
  value of one byte.
- Module constants, `static_assert`, module variables, local constants,
  `=` and the compound assignments, such as `+=` and `<<=`, and `_ = v`,
  which drops a value.
- The operators `+`, `-`, `*`, `/` and `%` by a constant, `&`, `|`, `^`,
  `<<`, `>>`, unary `-`, `~`, `!`, `&&`, `||`, and the six comparisons.
  `==` and `!=` also compare two values of an enum, also with values, and
  two `Option` values.
- Functions with up to 8 parameters in 8 registers, value, struct, and
  `Option` results, `never`, and `#[inline]`. A struct value takes one
  register for each field, and a struct with no fields takes no
  register. A call result is an operand, an argument, or the value of an
  assignment.
- `if` with `else` and `else if`, `match` on an integer, an enum, or an
  enum with values, with `.V(v)` patterns, `if`
  and `match` as values, also of an `Option` and of an enum with values,
  `for` in five forms, with `..<` and `..=`
  ranges and over a slice, `break`, `continue`, and `return`.
- `Option` results, parameters, and local constants of a value type, an
  enum, or a `#[bits]` struct, `Option` results of an address, `Option`
  fields and other memory of an integer or an enum without values, with
  `load` and `store`, `else` unwrap, also as `return value else { ... }`,
  `?`, `match` with `.Some(v)` and `.None`, `==` and `!=`, and the check
  that each path reads an `Option`.
- Linear `#[bits]` structs and linear structs with no fields, `xfer`
  parameters, which take a linear value, and parameters that lend it.
- Plain structs, struct values and structs with no fields as the type of
  parameters, local constants, and results, struct literals, field reads,
  `load` of a struct value, `size_of`, `field_offset`, address types,
  address constants, also `pub`, address and slice results of `pub`
  functions, places, `load`, `store`, `store` of a struct literal with
  nested literals and array literals, `bitcast`, `widen`, and `truncate`.
- Constant tables of an array or a plain struct type, with array and
  struct literals, `@c` of a table, and the check that no `store` writes
  through the address of a table, also in a function that takes it.
- Slices `[]T` as the type of parameters, local constants, and results,
  `@a[x ..< y]`, `@a[..< y]`, and `@a[x ..]` of an array address or a
  slice, `len`, `@s[i]`, `for x in s`, and the check that no `store`
  writes through a slice of a table.
- `#[big_endian]` fields of plain structs and `#[big_endian]` registers.
- `#[below(n)]` fields of plain structs: a load traps on a value that is
  not below `n`, and a store needs a proof of its value.
- `bool` fields of plain structs and other memory of a `bool`: one byte,
  in which each value other than 0 is `true`.
- Index proofs from constants, masks and other operators, field widths,
  loads of fields with a limit, range loops, conditions, `match` arms,
  `if` and `match` values, calls, and writes, and the proofs of slices
  from bounds against a local and lowest values.
- Enums as the type of bit fields, constants, parameters, locals, local
  `var`s, results, and fields of plain structs, `pub` enums, enums with
  values as the type of parameters, locals, local `var`s, results, and
  memory, `#[bits]` structs as the type
  of constants, parameters, locals, local `var`s, results, and fields of
  plain structs, with field values at run time, register maps, `pub`
  register maps as the type of a device of another module, register banks, devices, arrays of devices,
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
| `match` on a value that is not a `uN`, an enum, or an `Option`, such as an `i64`, and a pattern in `.V(p)` other than a new local or `_`, such as `.Row(0)` | Refused. A `match` on a `uN`, an enum, also with values, or an `Option` works. Compare the value with `==`, as in `x == .Row(0)`, or give the value of `.V(v)` to a local, and compare it. |
| A range loop on `i64` values | Use a `for cond {}` loop on a local `var`. |
| A variant with a value as the left operand of `==` or `!=`, such as `.Some(v) == x` | Write `x == .Some(v)`. A variant without a value, such as `.None`, can be either operand. |
| An `if` or `match` value of a slice or of a plain struct with fields | `return` the value in each block of an `if` or `match` statement. |
| `for x in` an array | Use `for x in @a[0 ..]`. |
| `for x in` a slice of a type other than a `bool`, an integer, an enum without values, or a `#[bits]` struct, such as a plain struct | Use `for i in 0 ..< len(s)` and `@s[i]`. |
| A local `var` of a type other than `bool`, `u8` to `u64`, `i64`, a `#[bits]` struct, and an enum, such as an address or a slice | Use a `const`. |
| `var x = f() else { trap() }` | Use `const y = f() else { trap() }`, then `var x = y`. |
| A call in the index of a device, such as `redistributors[cpu() & 3]` | Put the result in a local. |
| `?` inside an expression, such as `return f()?` | Use `const x = f()?`, then use `x`. |
| `Option` as the type of a local `var`, a module variable, or a module constant, and an `Option` parameter of a naked function | Use a local `const` or a field of a plain struct, or unwrap the `Option` with `else`, `?`, or `match`. |
| An `Option` in memory of a type other than an integer or an enum without values, such as `Option<bool>`, and a value of an `Option` in a constant table | Refused. |
| `in xN` on a parameter or a local, such as `a: u64 in x0` | Use an `asm` input `name in xN = value`. |
| Named arguments of a function, such as `g(a = 1)` | Give the arguments in order. |
| `string` as the type of a local `var`, a module variable, a module constant, a field, or an `Option`, and a `string` parameter of the entry or of a naked function | Use a local `const`, a parameter of a function that a call starts, or a result. |
| A slice of a `string`, such as `@s[1 ..]`, and `len` and a byte of a `string` that is not a local or a parameter, such as `len(f())` | Use `@s[i]`, and put the string in a local first: `const s = f()`. |
| `Result` and `align_of` | Refused. |
| Methods, generics, and interfaces | Refused. |
| `mut`, a `linear` plain struct with fields, and a `linear` enum | Refused. |
| An `Option` local or parameter of a linear type, and a `match` on such an `Option` | Unwrap the `Option` at the call with `else` or `?`. |
| A local `var`, a module constant, and memory of a linear type | Keep the value in a local `const` or a parameter. |
| Devices and the vector table of another module, and `pub` on a device | A module uses only the `pub` functions, constants, plain structs, `#[bits]` structs, register maps, enums, and system registers, and `@m.f` of the `pub` functions of another module. |
| A plain struct with fields as a module variable, a local `var`, or an `Option`, a value of a struct with a field of another type, such as an array, a struct value in a naked function, `@` of a struct local or parameter, and the read of a field of the struct of a call, such as `f().x` | Use a local `const`, as `const v = f()`, and read `v.x`, or use the address of the struct. |
| A local `var` or an `Option` of a struct with no fields, and an argument of it that is a call or an `if` or `match` value | Use a local `const`. |
| A value of a plain struct or of a `#[bits]` struct that is not `pub`, also of a struct with no fields and in an `Option`, as a parameter or a result of a `pub` function, and a `pub` constant or constant table of such a struct | Make the struct `pub`. |
| A field of a `pub` struct whose type is a plain struct or a `#[bits]` struct that is not `pub`, or an array of one | Make the struct of the field `pub`. |
| A parameter of a struct with no fields or of a linear type in a naked function | Refused. |
| A field of a plain struct of another type, such as a slice | A field is `bool`, `u8`, `u16`, `u32`, `u64`, `i64`, an enum, an `Option` of an integer or an enum without values, a plain struct, a `#[bits]` struct, or an array of them. |
| A struct value literal with a call or a register read that names the fields in another order than the declaration, `store` of a struct value other than a literal, and a literal of `store` of a struct of more than 4096 bytes | Name the fields in the order of the declaration, and store a literal. |
| A constant table of more than 65536 bytes | Refused. |
| `load` of a struct with a field of another type, `load` of a struct at an address with a call or a register read, `load` of a struct with no fields, and `load` and `store` of an array | Load each field, or store each element. Put the address in a local first. `{}` is the value of a struct with no fields. |
| An address as a module variable or a field | An address is only the type of a parameter, a local, a result, or a constant. Keep a `u64`, and make the address with `bitcast`. |
| An address, a slice, or an `Option` of an address as the result of a `pub` function, and a `pub` address constant, of a target other than `u8`, `u16`, `u32`, `u64`, `i64`, a `pub` struct, or an array of one of these | Make the struct `pub`, or give the address from a function that is not `pub`. |
| An `Option` of an address as a parameter or a local | Refused. `else`, `?`, or `match` takes it at the call. |
| An address constant whose value is not `bitcast` of a `u64` constant, such as `@own.lines` | Refused. |
| `@` of a local, of a module variable, or of a module constant that is not an address or a constant table | Refused. |
| `@T` for another `T`, such as `@@u64` or `@[2][2]u8` | `T` is `bool`, `u8`, `u16`, `u32`, `u64`, `i64`, an enum, an `Option` of an integer or an enum without values, a plain struct, a `#[bits]` struct, or an array of them. |
| `bitcast` of a `u8`, `u16`, or `u32` | Make a `u64` with `widen` first. |
| Arrays as values: parameters, locals, and variables, and a literal such as `[1, 2]` other than the value of a constant table or of an array field in a literal of `store` | An array is only the target of an address, an array of devices, or a constant table. |
| A start of a slice that is not a constant or a local, such as `@a[x + 1 ..]` | Put the start in a local. |
| `len` and an element of a slice that is not a local or a parameter, such as `len(f())` and `@f()[0]` | Put the slice in a local first: `const s = f()`. |
| A slice parameter of a naked function, an `Option` of a slice, and a slice of arrays, such as `[][4]u8` | Refused. |
| A device as a parameter, such as `gic: Gic` | A function names the device of its module. |
| A limit on an `i64` field, and a big-endian field with a limit | Refused. A limit is on a field of `u8` to `u64`, or of an array of one. |
| A `#[bits]` struct as a module variable | Use the backing type, such as `u64`. To read a field, give the value to a local of the struct type. |
| A variant with two or more values, a module variable of an enum type, and an enum with values as a module constant, a value in a constant table, or the value of `Some` | Refused. A parameter, a local, a result, and a field of a plain struct can have an enum type, also with values, and the value of `Some` an enum without values. |
| `load` of an enum with values or of an `Option` at an address with a call or a register read, such as `load(@slot().shape)` | Put the address in a local first. |
| An enum without a backing type, a variant without a tag, and a tag other than an integer literal | Give the backing type `uN` and an integer literal tag for each variant. |
| A `scratch` output, operand types such as `a: u64 in x0 = v`, an output in a named register, and more than one output of an `asm` block | Refused. |
