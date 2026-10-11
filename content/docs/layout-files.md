---
title: Layout files
summary: The file that puts the entry, the sections, and the symbols at addresses in memory.
---

A layout file tells the build where each section goes in memory. It is not
Wyst source. `wync build` reads it with the `--layout` option. The layout
is a separate file, as `go.mod` is, because the target and not the source
decides the addresses.

## Format

Each line has one declaration. `//` starts a comment. An integer is decimal
or hexadecimal with `0x`, and `_` can separate its digits.

```layout
// The QEMU virt board loads the program at the start of RAM.
entry hello._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0008_0000
section .text:   code   in ram align 16
section .rodata: rodata in ram after .text align 16
section .data:   data   in ram after .rodata align 8
section .bss:    bss    in ram after .data align 16
symbol __stack_top: u64 = 0x4010_0000
symbol __bss_start: u64 = start(.bss)
symbol __bss_end:   u64 = end(.bss)
```

| Declaration | Meaning |
| --- | --- |
| `entry m.f at A` | Function `f` of module `m` is the ELF entry. It must be at address `A`. There is one entry. |
| `region r: readwrite at A size N` | Memory from `A` to `A + N`. A region is `readonly` or `readwrite`. |
| `section s: k in r align N` | A section of kind `code`, `rodata`, `data`, or `bss` in region `r`. `N` is a power of two. |
| `section s: k in r after t align N` | The section starts at the end of the earlier section `t`, in the same region. |
| `symbol n: u64 = v` | A `u64` name that each function can read. `v` is an integer, `start(s)`, or `end(s)`. |

## Placement

- A section without `after` starts at the start of its region. The build
  aligns the start of each section up to its alignment.
- Each section must fit in its region and must not overlap another
  section. A `data` or `bss` section must be in a `readwrite` region.
- The entry function is first in its section, so that section must start
  at the entry address.

## Which section holds what

| Section | Holds | Rule |
| --- | --- | --- |
| `.text` | Functions | A `code` section. |
| `.rodata` | String literals | A `rodata` section. |
| `.data` | Module variables | A `data` section, with an alignment of at least the largest variable. |
| `.vectors` | The exception vector table | A `code` section, with an alignment of at least 0x800. |
| `.name` | The functions with `#[section(.name)]` | A `code` section other than `.vectors`. |

The other sections stay empty. A layout needs a section only when the
program puts something in it.

## Symbols

Each layout symbol becomes an absolute global symbol of the ELF file. A
function reads a symbol by its name, as `__stack_top` in
[Hello, world!](/docs/hello-world/). The compiler computes each operation
on a symbol with an integer value. A symbol of the start or the end of a
section uses an address that the code computes when it runs.

Instructions are always 4-byte aligned.
