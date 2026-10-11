---
title: Keywords and builtins
summary: Each reserved word, builtin name, attribute, and positional word, and what exists now.
---

The 20 keywords are reserved. No other word is reserved, but a
declaration, an import, a parameter, and a local cannot take a builtin
name. A field and an argument can.

## Keywords

| Keyword | Meaning | Now |
| --- | --- | --- |
| `import` | Imports a module. | yes |
| `pub` | Exports a declaration. | functions and constants |
| `fn` | Declares a function. | yes, without methods and type parameters |
| `struct` | Declares a struct. | plain, `#[register_map]`, and `#[bits]` structs |
| `enum` | Declares an enum. | only as the type of a bit field |
| `interface` | Declares an interface: a set of methods. A type implements it by having the methods. | no |
| `const` | Declares a constant or a local. | yes |
| `var` | Declares a variable. | module variables only |
| `if` | Runs a block when a condition is true. | yes, without `else` |
| `else` | The other block of `if`, or the block of an unwrap. | unwrap only |
| `for` | The one loop. | `for {}`, `for c {}`, `for i in a ..< b {}`, and `for x in "text" {}`; not `..=`, and not `for x in` an array or a slice |
| `break` | Leaves a loop. | no |
| `continue` | Starts the next pass of a loop. | no |
| `return` | Leaves a function. | yes |
| `match` | Selects a block by the variant of a value. | no |
| `goto` | Jumps to a label. | no |
| `mut` | A parameter mode, also marked at the call site. | no |
| `xfer` | A parameter mode that takes ownership, also marked at the call site. | no |
| `linear` | A type whose values the declaring module must consume. | no |
| `asm` | An assembly block. | yes |

## Builtin names

| Name | Meaning | Now |
| --- | --- | --- |
| `bool`, `u8`, `u16`, `u32`, `u64` | Value types. | yes |
| `i64` | The signed 64-bit integer. | no |
| `string` | A string value. | no: a string literal is only the head of a `for` loop |
| `never` | The type of a function that does not return. | yes |
| `Option` | A value or no value: `.Some(v)` and `.None`. | as a function result and an `asm` output |
| `Result` | A value or an error: `.Ok(v)` and `.Error(e)`. | no |
| `true`, `false` | The values of `bool`. | yes |
| `len` | The length of an array or a slice. | no |
| `size_of` | The size of a type in bytes. | only for the name of `u8`, `u16`, `u32`, `u64`, or a plain struct of the module |
| `align_of` | The alignment of a type in bytes. | no |
| `field_offset` | The offset of a field of a plain struct. | yes |
| `static_assert` | Checks a constant condition. | yes |
| `trap` | Stops the program with `brk #0`. | yes |
| `load`, `store` | Read and write the integer at an address. | yes |
| `widen`, `truncate` | Convert an integer to a wider or a narrower type. | yes |
| `bitcast` | Makes an address from a `u64`. | yes |

## Attributes

| Attribute | On | Meaning |
| --- | --- | --- |
| `#[naked]` | `fn` | No prologue and no epilogue. |
| `#[inline]` | `fn` | Copied into each caller. |
| `#[section(.name)]` | `fn` | Puts the code in a section of the layout. |
| `#[register_map]` | `struct` | The registers of a device. |
| `#[bits]` | `struct` | The named bits of an integer. |
| `#[mmio(address)]` | `const` | A device at a physical address. |
| `#[mmio(address, stride)]` | `const` | An array of devices. |
| `#[sysreg]` | `const` | A system register. |
| `#[vector_table]` | `const` | The EL1 exception vector table. |

Attribute names are not reserved.

## Positional words

These words have a meaning only in one position, and they are ordinary
names elsewhere:

- `in`: in `for x in`, in `name in xN` of an `asm` input, and in
  `name: T in xN` of a parameter or a local, which is not implemented now;
- `at`: the offset of a register or the bits of a field;
- `readonly`, `writeonly`, `readwrite`: the access kind of a register;
- `scratch`: an `asm` argument form that is not implemented now.

The layout file has its own words: `entry`, `region`, `section`, `symbol`,
`at`, `size`, `in`, `after`, `align`, `start`, `end`, `readonly`,
`readwrite`, `code`, `rodata`, `data`, `bss`, and `u64`. See
[Layout files](/docs/layout-files/).
