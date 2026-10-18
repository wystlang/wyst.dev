---
title: Code generation
summary: The machine code that each construct gives, and the registers that the compiler uses.
---

The compiler writes A64 instruction words directly. This page tells what
each construct costs, so that a reader can know the machine code from the
source.

## The rule

Compiler work may be hidden; runtime behavior may not. The compiler keeps
values in registers when it can, so it adds few loads, stores, and copies
of its own. It keeps each call, branch, and device or system register
access that the source has, in order.

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
- `init` makes no call and has no home in `x19` to `x28` or on the stack,
  so it has no prologue. Its epilogue is `ret`.

## Registers

| Registers | Use |
| --- | --- |
| `x0` to `x7` | Parameters. |
| `x0` | A value result or an address result. |
| `x0`, `x1` | An `Option` result: `x0` is 1 for `.Some` and 0 for `.None`, and `x1` is the value of `.Some`. |
| `x9` to `x17` | Expression values: `x9` at depth 0, `x10` at depth 1, and so on. An expression deeper than `x17` is an error. |
| `x18` | Not used. |
| `x19` to `x28` | Homes of locals, loop values, and values that wait while a call runs, which a callee saves. |
| `x29`, `x30` | The frame pointer and the return address. |

Each local has a home. In a function without a call and without an `asm`
block, the first homes take the scratch registers above the deepest
expression. The next homes take `x19` to `x28`, and the others are 8-byte
stack slots.

A call can change `x0` to `x17`. Thus in `load(p) + f()`, the value of
`load(p)` waits in a home while `f` runs, and so does each argument before
the last argument with a call. A constant, a layout symbol, an operation
on constants and layout symbols with an integer value, a string literal,
or a local does not wait, because no call changes it: the code computes it
after the call. No scratch register holds a value while the code computes
an argument or a value that waits, so each starts at depth 0.

A naked function has no frame, so the home of its parameter N is `xN`. A
call in it takes these parameters in order, so each argument is already in
its register.

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
| An operator on literals and module constants | No code of its own: the compiler computes the result, which is one constant. A constant condition keeps its branch: `mov`, then `cbz` or `cbnz`. |
| A register `read` or `write` | One `ldrb`, `ldrh`, `ldr`, `strb`, `strh`, or `str` with a base register and the offset. A device base that the function uses only one time adds the code of a constant. A device of an array adds one shifted `add` for the index, and a register of a bank adds one shifted `add` for its index. |
| A system register `read` or `write` | One `mrs` or `msr`. |
| A field write | One `lsl` or `orr` for each field value that is not a constant. The fixed fields and the constant values make one constant. One `orr` adds it when it fits in the instruction. If it does not fit, the code of the constant and one `orr` add it. A write of only constants is one constant. |
| `load`, `store` | One `ldrb`, `ldrh`, `ldr`, `strb`, `strh`, or `str`. The address of a field, or of an element at a constant index, adds one `add` for the offset. An index adds one shifted `add`, or `mov`, `mul`, and `add` when the element size is not a power of two. |
| `widen`, `bitcast` | No code. |
| `truncate` | One `ubfx`. |
| `x * 2^k` | One `lsl`, and one `ubfx` for a type below 64 bits. |
| `x / 2^k` | One `lsr`. |
| `a << k`, `a >> k` | One `lsl` or `lsr` for a constant `k`, or one `lslv` or `lsrv` for another `k`. `<<` adds one `ubfx` for a type below 64 bits. |
| `x % 2^k`, for `k` above 0 | One `and`. |
| `x % c` for another constant `c` | The code of the constant `c`, then `udiv` and `msub`. |
| `-x` | One `sub` from `xzr`, and one `ubfx` for a type below 64 bits. |
| `a == b` as a value | `cmp` and `cset`. |
| An `if` or `for` condition | One branch: `tbz` or `tbnz` for a one-bit field, `cmp` and `b.cond` for a comparison, and `cbz` or `cbnz` for another value. `!` adds no instruction. |
| A loop with a condition | The test is after the body, so each pass has one branch. |
| A range loop | Its variable and its end are in homes. The test is `cmp` and `b.lo`. |
| A string loop | Its cursor and its end are in homes. One `ldr` reads the length before the loop, and each pass reads its byte with one `ldrb`. The test is `cmp` and `b.lo`. |
| `const x = f() else {}` | The call, then `cbnz x0`. |
| `trap()` | `brk #0`. |
| A string, a function address, or a section symbol | `adrp` and `add`. A `string` value is the address of the `u64` length of the string, which its bytes follow, so it is one register. |
| A module variable | `adrp` and one load or store. |
| `v += x`, `v -= x` | `adrp` and one load, `add` or `sub` (and a `ubfx` for a type below 64 bits), then `adrp` and one store. |

A constant operand goes in the instruction when it fits, such as a value
below 4096 for `add`, `sub`, and `cmp`. A `tbz` or a `tbnz` reaches only 32
KiB, so a condition on a one-bit field is an error when its `if` body or
loop body is longer than 32 KiB.

## Linking

The linker puts each function in its section, in this order: the entry,
then each function of the vector table in entry order, then the other
functions breadth first. Each function adds its new callees and the new
functions that it takes with `@` to the end of the order, in the order of
their first use. A function that the entry and the vector table do not
reach gets no code. The linker then writes the branch offsets and the
addresses. The ELF file has no relocations. See
[ELF output](/docs/elf-output/).
