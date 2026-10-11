---
title: Code generation
summary: The machine code that each construct gives, and the registers that the compiler uses.
---

The compiler writes A64 instruction words directly. This page tells what
each construct costs, so that a reader can know the machine code from the
source.

## The rule

Compiler work may be hidden; runtime behavior may not. The compiler
removes the loads, stores, and temporary values that it makes itself. It
keeps each call, branch, and device or system register access that the
source has, in order.

## An example

This is `init` from [Hello, world!](/docs/hello-world/):

```wyst fragment
fn init() {
  uart.CR.write(UARTEN = false, TXE = false, RXE = false)
  for uart.FR.read().BUSY {}
  uart.LCR_H.write(FEN = false)
  uart.IBRD.write(DIVINT = 13)
  uart.FBRD.write(DIVFRAC = 1)
  uart.LCR_H.write(FEN = true, WLEN = 3)
  uart.CR.write(UARTEN = true, TXE = true, RXE = false)
}
```

`objdump -d hello.elf` shows its machine code:

```text
40080064: d2a1200b  mov   x11, #0x9000000
40080068: b900317f  str   wzr, [x11, #0x30]
4008006c: b9401969  ldr   w9, [x11, #0x18]
40080070: 371fffe9  tbnz  w9, #0x3, 0x4008006c
40080074: b9002d7f  str   wzr, [x11, #0x2c]
40080078: d28001a9  mov   x9, #0xd
4008007c: b9002569  str   w9, [x11, #0x24]
40080080: d2800029  mov   x9, #0x1
40080084: b9002969  str   w9, [x11, #0x28]
40080088: d2800e09  mov   x9, #0x70
4008008c: b9002d69  str   w9, [x11, #0x2c]
40080090: d2802029  mov   x9, #0x101
40080094: b9003169  str   w9, [x11, #0x30]
40080098: d65f03c0  ret
```

- The UART base goes in `x11` one time, because the function uses it more
  than one time.
- Each register write is one `str` with the offset of the register. A
  write of the constant 0 stores `wzr`.
- The loop on `BUSY` is one `ldr` and one `tbnz`, which tests bit 3.
- The compiler computes the value of each write from its fields:
  `FEN = true, WLEN = 3` is `0x70`.
- `init` makes no call and keeps no value, so it has no prologue. Its
  epilogue is `ret`.

## Registers

| Registers | Use |
| --- | --- |
| `x0` to `x7` | Parameters. |
| `x0` | A value result. |
| `x0`, `x1` | An `Option` result: `x0` is 1 for `.Some` and 0 for `.None`, and `x1` is the value of `.Some`. |
| `x9` to `x17` | Expression values: `x9` at depth 0, `x10` at depth 1, and so on. An expression deeper than `x17` is an error. |
| `x18` | Not used. |
| `x19` to `x28` | Homes of locals and loop values, which a callee saves. |
| `x29`, `x30` | The frame pointer and the return address. |

Each local has a home. In a function without a call and without an `asm`
block, the first homes take the scratch registers above the deepest
expression. The next homes take `x19` to `x28`, and the others are 8-byte
stack slots.

An operation on a `uN` value with N below 64 clears the bits above N after
`+`, `-`, `*`, `~`, and `<<`.

## Frames

A function that is not naked starts with this code, then moves each
parameter to its home:

```text
stp x29, x30, [sp, #-16]!
mov x29, sp
stp x19, x20, [sp, #-16]!
sub sp, sp, #size
```

There is one `stp` for each pair of home registers that the function uses,
and `size` is the stack slot area, rounded up to 16 bytes. The epilogue
undoes the prologue and ends with `ret`.

Two kinds of function save no registers:

- A function that returns `never`. Control does not come back to its
  caller. Its prologue is only the `sub`.
- A function without a call and without homes in `x19` to `x28` or on the
  stack. It has no prologue, and its epilogue is `ret`.

An inline function runs in the frame of its caller, with new homes for
each copy.

## Costs

| Source | Machine code |
| --- | --- |
| A constant | One `movz`, then one `movk` for each other halfword that is not 0. Or `movn` and `movk`, when more halfwords are `0xffff`. |
| A register `read` or `write` | One `ldr` or `str` with a base register and the offset. |
| A system register `read` or `write` | One `mrs` or `msr`. |
| A field write | One `lsl` or `orr` for each field, then one `orr` for the fixed bits. |
| `load`, `store` | One `ldrb`, `ldrh`, `ldr`, `strb`, `strh`, or `str`. |
| `widen`, `bitcast` | No code. |
| `truncate` | One `ubfx`. |
| `x * 2^k`, `x / 2^k` | One `lsl` or `lsr`. |
| `a == b` as a value | `cmp` and `cset`. |
| An `if` or `for` condition | One branch: `tbz` or `tbnz` for a one-bit field, `cmp` and `b.cond` for a comparison, and `cbz` or `cbnz` for another value. `!` adds no instruction. |
| A loop with a condition | The test is after the body, so each pass has one branch. |
| A range loop | Its variable and its end are in homes. The test is `cmp` and `b.lo`. |
| `const x = f() else {}` | The call, then `cbnz x0`. |
| `trap()` | `brk #0`. |
| A string, a function address, or a section symbol | `adrp` and `add`. |
| A module variable | `adrp` and one load or store. |
| `v += x`, `v -= x` | `adrp` and one load, `add` or `sub`, then `adrp` and one store. |

A constant operand goes in the instruction when it fits, such as a value
below 4096 for `add`, `sub`, and `cmp`. A `tbz` or a `tbnz` reaches only 32
KiB, so a longer function with one is an error.

## Linking

The linker puts each function in its section, in this order: the entry,
then each function of the vector table in entry order, then each function
in the order of its first call or `@`. It then writes the branch offsets
and the addresses. The ELF file has no relocations. See
[ELF output](/docs/elf-output/).
