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
| `x0` to `x7` | Parameters. A [slice](/docs/addresses/#slices) parameter takes two registers, as its argument does: its address, and then its length. A [struct value](/docs/structs/#struct-values) takes one register for each field, in the order of the declaration. A [struct with no fields](/docs/structs/#structs-with-no-fields) takes no register, so the next parameter takes its register. |
| `x0` | A value result or an address result. |
| `x0` to `x7` | A struct result: `xk` is field k, in the order of the declaration. |
| `x0`, `x1` | An `Option` result: `x0` is 0 for `.None` and not 0 for `.Some`, 1 for `.Some(v)`, and `x1` is the value of `.Some`. The result of an enum with values: `x0` is the tag, and `x1` is the value of the variant. A slice result: `x0` is the address, and `x1` is the length. |
| `x9` to `x17` | Expression values: `x9` at depth 0, `x10` at depth 1, and so on. An expression deeper than `x17` is an error. |
| `x18` | Not used. |
| `x19` to `x28` | Homes of locals, loop values, and values that wait while a call runs, which a callee saves. |
| `x29`, `x30` | The frame pointer and the return address. |

Each local has a home. In a function without a call, the homes can take
the scratch registers above the deepest expression and above the operands
of its `asm` blocks. An `asm` block with a line that can go to an
exception handler, such as `svc` or `hvc`, can change each scratch
register, so a function with one keeps no home there. Then they take `x19` to `x28`, and the others are 8-byte stack
slots. The homes that the code uses most get the registers first: each
read and each write of a home counts 8 to the power of the loops around
it. Thus the locals of an inner loop are in registers before a local that
the code uses one time.

A call can change `x0` to `x17`. Thus in `load(p) + f()`, the value of
`load(p)` waits in a home while `f` runs, and so does each argument before
the last argument with a call. A constant, a layout symbol, an operation
on constants and layout symbols with an integer value, a string literal,
or a local does not wait, because no call changes it: the code computes it
after the call. No scratch register holds a value while the code computes
an argument or a value that waits, so each starts at depth 0. An `asm`
block is a call for this rule, because its inputs are in the scratch
registers from `x9`, and an `svc` or an `hvc` can change `x0` to `x17`.

A naked function has no frame, so the home of its parameter N is `xN`. A
call in it takes these parameters in order, so each argument is already in
its register. A call of a naked function puts its arguments in `x0` to
`x7`, as each call does, and is then one `b`, because the callee does not
return.

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
and `size` is the stack slot area, rounded up to 16 bytes. A `sub` holds at
most 4095, so a slot area larger than 4095 bytes is an error. The epilogue
restores the pairs and ends with `ret`. Only a frame with a slot area
first moves `sp` back to the last pair.

Two kinds of function save no registers:

- A function that returns `never`. Control does not come back to its
  caller. Its prologue is only the `sub`.
- A function without a call and without homes in `x19` to `x28` or on the
  stack. It has no prologue, and its epilogue is `ret`.

An inline function runs in the frame of its caller. A parameter takes
the home of an argument that is a local, because no code changes a
parameter. A `const` in the top block of the body whose value is a
parameter, or a field that fills a parameter, takes the home of the
parameter too, so it makes no code. `widen` and `bitcast` of a parameter
make no code, so a `const` whose value is one of them, such as
`widen(color)` of a `u32` to a `u64`, also takes the home of the
parameter. A `var` keeps its own home, because an assignment can change
it. The other parameters and locals get
new homes in each copy. The homes of a copy are free after it, and so are
the homes of a loop after the loop, so the next copy takes them.

The value of a copy is in `x0`, or in `x0` to `x7`, as the result of a
call is, with one exception. When the last statement of the body is its one `return`, and
it gives a parameter whose argument is a local, or such a `const`, the
value of the copy is the home of that local, as the value of the local
is, and that `return` makes no code. Each other `return` puts its value
in `x0` and branches to the end of the copy, but a `return` at the end
of the copy needs no branch. Thus a copy of
`keep` makes no instruction:

```wyst
#[bits]
pub linear struct Frame: u64 {
  ADDRESS: u64 at 0..=63
}

var total: u64 = 0

#[inline]
pub fn keep(frame: xfer Frame) -> u64 {
  const address = frame.ADDRESS
  _ = frame

  return address
}

fn add(frame: xfer Frame) {
  total = keep(xfer frame) + total
}
```

In `add`, the `add` instruction reads the home of `frame`. A `return` of
the copy moves the home to `x0`, and an argument moves it to its
register.

## Costs

| Source | Machine code |
| --- | --- |
| A constant | One `movz`, then one `movk` for each other halfword that is not 0. Or `movn` and `movk`, when more halfwords are `0xffff`. |
| An operator on literals and module constants | No code of its own: the compiler computes the result, which is one constant. A constant condition keeps its branch: `mov`, then `cbz` or `cbnz`. |
| A register `read` or `write` | One `ldrb`, `ldrh`, `ldr`, `strb`, `strh`, or `str` with a base register and the offset. A device base that the function uses only one time adds the code of a constant. A device of an array adds one shifted `add` for the index, and a register of a bank adds one shifted `add` for its index. A big-endian register adds one `rev16` or `rev`, except in a write of a constant, which the compiler reverses itself. |
| A system register `read` or `write` | One `mrs` or `msr`. |
| A field read | One `ubfx`. A field at bit 0 that fills its value adds no code: a field of 64 bits, or `VALUE: u32 at 0..=31` in a `u32` register. |
| A field write | One `lsl` or `orr` for each field value that is not a constant. The fixed fields and the constant values make one constant. One `orr` adds it when it fits in the instruction. If it does not fit, the code of the constant and one `orr` add it. A write of only constants is one constant. |
| `load`, `store` | One `ldrb`, `ldrh`, `ldr`, `strb`, `strh`, or `str`, which takes a part of its address, as [Addresses of loads and stores](#addresses-of-loads-and-stores) gives. A big-endian field adds one `rev16` or `rev`, except in a store of a constant, which the compiler reverses itself. At an [address constant](/docs/addresses/#address-constants), the compiler adds the offset to the constant. An index of an element whose size is not a power of two adds `mov` and `mul`. |
| `widen`, `bitcast` | No code. |
| `truncate` | One `ubfx`. |
| `x * 2^k` | One `lsl`, and one `ubfx` for a type below 64 bits. |
| `x / 2^k` | One `lsr`. |
| `a << k`, `a >> k` | One `lsl` or `lsr` for a constant `k`, or one `lslv` or `lsrv` for another `k`. `<<` adds one `ubfx` for a type below 64 bits. |
| `x % 2^k`, for `k` above 0 | One `and`. |
| `x / c`, `x % c` for another constant `c` | The code of the constant `c`, then `udiv`, and `msub` for `%`. |
| `x / y`, `x % y` for a `y` that is not a constant | `cbnz` on `y` over a `brk #0`, which traps for 0, then `udiv`, and `msub` for `%`. |
| `-x` | One `sub` from `xzr`, and one `ubfx` for a type below 64 bits. |
| `~x` | One `mvn`, and one `ubfx` for a type below 64 bits. |
| `a == b` as a value | `cmp` and `cset`. |
| An `if` or `for` condition | One branch: `tbz` or `tbnz` for a one-bit field, `cmp` and `b.cond` for a comparison, and `cbz` or `cbnz` for another value. `x == 0` and `x != 0` are `cbz` or `cbnz` on `x`, and `tbz` or `tbnz` when `x` is `y & c` with one bit in the constant `c`. `!` adds no instruction. |
| An `if` or `match` value | The code of the statement, and each block puts its value in one register: the home of the local, x0 for `return`, or a scratch register. A `match` value without `_` has a `brk #0` for a value that no variant has. |
| A loop with a condition | The test is after the body, so each pass has one branch. |
| `break`, `continue` | One `b`. `if c { break }` and `if c { continue }` are one branch on `c`, as a condition is. A `continue` at the end of a loop body adds no code. |
| A range loop | Its variable and its end are in homes. The test is `cmp` and `b.lo`. A constant end that fits in the `cmp`, such as `0 ..< 512`, has no home. |
| A string loop | Its cursor and its end are in homes. One `ldr` reads the length before the loop, and each pass reads its byte with one `ldrb`. The test is `cmp` and `b.lo`. |
| A slice loop | A range loop over an index with no name, from 0 to the length. The address, the index, and the end are in homes. Each pass starts with the load of the element: one load at the address and the index, which the load shifts for an element of 2, 4, or 8 bytes. |
| `const x = f() else { trap() }` | The call, then `cbnz x0`. `else { break }` and `else { continue }` are one `cbz x0` to the target of the jump. |
| `trap()` | `brk #0`. |
| A string, a function address, or a section symbol | `adrp` and `add`. A `string` value is the address of the `u64` length of the string, which its bytes follow, so it is one register. `len(s)` is one `ldr` from the value of `s`, and `@s[i]` adds `i + 8` to it. A slice of a string takes two registers: `@s[x ..< y]` is the value of `s` plus `x + 8`, and `y - x`. |
| A module variable | `adrp` and one load or store. |
| `v += x`, `v -= x` | `adrp` and one load, `add` or `sub` (and a `ubfx` for a type below 64 bits), then `adrp` and one store. |

A constant operand goes in the instruction when it fits, such as a value
below 4096 for `add`, `sub`, and `cmp`. A `tbz` or a `tbnz` reaches only 32
KiB, so a condition on a one-bit field, or on one bit of a value, is an
error when its `if` body or loop body is longer than 32 KiB.

## Addresses of loads and stores

The address of a `load` or a `store` is a sum: of an address, the offset
of a field, and the index of an element times the element size. The load
or the store takes a part of the sum, so the compiler adds few `add`
instructions of its own:

- The constants of the sum are the offset of the instruction, when the
  offset is a multiple of the size below 4096 times the size. Thus the
  field of an address in a local is one load or store with no `add`.
- Two values with no constant are the base and the index of the
  instruction. An index of elements of the size of the load or the store
  has the shift of the instruction.
- Two values and a constant are one `add` and the offset. In straight
  code, the next load or store with the same two locals uses that `add`
  again. A label, a branch, a call, an `asm` block, and a write of one of
  the locals end the straight code.
- Another offset, such as that of a `u16` field of a `#[packed]` struct
  at an odd offset, keeps its `add`, and the offset is 0.

Each `load` and `store` is one load or store of its size, in the order of
the source, so the compiler joins no stores.

```wyst
struct Record {
  head: [11]u64
  asked: u64
  question: [38]u8
}

fn ask(record: @var Record, count: u64) {
  if count > 32 {
    return
  }

  store(@record.question[count + 1], 0)
  store(@record.question[count + 2], 0)
  store(@record.asked, count + 3)
}

fn element(table: @[8]u64, i: u64) -> u64 {
  if i < 8 {
    return load(@table[i])
  }
  return 0
}
```

With `record` in `x12` and `count` in `x11`, the stores of `ask` are:

```text
add   x9, x12, x11
strb  wzr, [x9, #0x61]
strb  wzr, [x9, #0x62]
add   x10, x11, #0x3
str   x10, [x12, #0x58]
```

The field `question` is at offset 96, so the first store has the offset
97. The second store uses the `add` of the first. With `table` in `x12`
and `i` in `x11`, the load of `element` is `ldr x0, [x12, x11, lsl #3]`.

## Linking

The linker puts each function in its section, in this order: the entry,
then each function of the vector table in entry order, then the other
functions breadth first. Each function adds its new callees and the new
functions that it takes with `@` to the end of the order, in the order of
their first use. A function that the entry and the vector table do not
reach gets no code. The linker then writes the branch offsets and the
addresses. The ELF file has no relocations. See
[ELF output](/docs/elf-output/).
