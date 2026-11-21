---
title: Assembly
summary: Checked asm blocks, their inputs, outputs, and registers, Option outputs, blocks that do not return, and SIMD lines.
---

An `asm` block writes A64 instructions directly. The compiler checks each
line against tables from the Arm specification, gives the block typed
inputs and outputs, and keeps each line in order.

## asm blocks

`asm(inputs) { lines }` is a statement. Each line is one A64 instruction
in the canonical Arm form of its encoding. A block without inputs can
leave out the parentheses:

```wyst
fn sync() {
  asm {
    dsb ish
    isb
  }
}
```

An Arm alias, such as `mov`, `cmp`, or `lsl`, is an error. Write the
instruction that the alias names:

- `orr to.x, xzr, from.x` for `mov to.x, from.x`
- `subs xzr, from.x, #1` for `cmp from.x, #1`
- `ubfm to.x, from.x, #61, #60` for `lsl to.x, from.x, #3`
- `madd to.x, a.x, b.x, xzr` for `mul to.x, a.x, b.x`
- `csinc to.x, xzr, xzr, cs` for `cset to.x, cc`
- `add sp, x0, #0` for `mov sp, x0`

The conditions `hs` and `lo` are `cs` and `cc`.

A barrier option is a number or its Arm name: `dsb sy` is `dsb #15`. A DC,
IC, or TLBI operation of the A64 tables can use its Arm name, such as
`tlbi vmalle1`. The tables have no other system operation, so a line such
as `at s1e1r` is an error.

The compiler checks each line for the kernel at EL1, or at EL2 in an
[`#[el2]` function](/docs/boot-and-exceptions/#el2-functions), on the QEMU
`virt` target: the base A64 instructions, the SIMD registers (`FEAT_FP`
and `FEAT_AdvSIMD`), the lines of AES, of the polynomial multiplication
of 64-bit elements, and of SHA-256 (`FEAT_AES`, `FEAT_PMULL`, and
`FEAT_SHA256`), the atomic instructions (`FEAT_LSE`) and the VHE
registers (`FEAT_VHE`) of the Cortex-A76, the GICv3 CPU interface
(`FEAT_GICv3`), and the PMUv3 (`FEAT_PMUv3`). An instruction or a system
register that needs a higher exception level or another feature is an
error. [SIMD lines](#simd-lines) gives where a line can name a SIMD
register.

## Inputs

An input is `name = value`, or `name` alone, which is `name = name`. The
value has a value type. An untyped integer is a `u64`. An address type,
such as the type `@u64` of `@p.f`, is not a value type, so `@p.f` is not
an input. A block has at most 9 inputs. A typed input, `name: T in xN`, is
not implemented now.

Where an instruction takes a general register, a line names an input:
`name`, or `name.x` and `name.w` for the 64-bit and the 32-bit view. A line
can also name `xzr` or `wzr`. When a 32-bit form and a 64-bit form both
accept a line, the line must give the view:

```wyst
fn save(address: u64, value: u64) {
  asm(address, value) {
    str value.x, [address]
  }
}
```

A line cannot name a physical general register, such as `x3`, or `sp`. The
compiler chooses the registers, except as
[Physical registers](#physical-registers) gives.

An input, the output, or a `scratch` operand with the form of a register
name, such as `x0`, `d0`, or `x32`, is an error, because a line does not
read such a name as an operand:

```wyst fails
fn save(address: u64, value: u64) {
  asm(address, x1 = value) {
    str x1, [address]
  }
}
```

```text
main.wyst:2:16: error: `asm` operand `x1` has the form of a register name
```

## Inputs in fixed registers

`name in xN = value`, with N from 0 to 7, puts the input in `xN`. Two
inputs cannot use one register. Thus a block can give the arguments of a
call to firmware, such as the PSCI call `CPU_ON`:

```wyst
const cpu_on: u64 = 0xc400_0003

fn start_cpu(target: u64, entry: u64) {
  asm(function_id in x0 = cpu_on, cpu in x1 = target, address in x2 = entry, context in x3 = 0) {
    hvc #0
  }
}
```

An `hvc` or an `svc` can change `x0` to `x17`, as a call can. The compiler
keeps no value in these registers from one statement to the next in such a
function, so this is safe.

## Immediates

Where an instruction takes an immediate, `#name` or `#m.name` gives the
value of a `uN` or enum constant. `#E.V` or `#m.E.V` gives the value
of variant `V` of enum `E`. A line gives `.V` no type, so the line names
the enum:

```wyst
const wait: u64 = 4

enum Call: u16 {
  Send = 11
}

fn calls() {
  asm {
    svc #wait
    svc #Call.Send
  }
}
```

The value must fit the field, as a literal must. It is a name and not an
expression, so the line stays one instruction. A local is not a constant.

## What a line cannot do

A line cannot write an input, branch, or refer to a label. Thus control
leaves the block only after its last line, or by an exception, as with
`brk`, `svc`, or `hvc`.

```wyst fails
fn bump(count: u64) {
  asm(count) {
    add count.x, count.x, #1
  }
}
```

```text
main.wyst:3:5: error: the `asm` line writes input `count`
```

A line of the Arm branch class, such as `b`, `br`, or `ret`, is an error.
So is `eret`, except at the end of a block that does not return.

## Scratch registers

`scratch name` after the inputs gives the block a register of its own.
It holds no value when the block starts. A line can read it and write it,
and a block that does not write it is an error. Thus a block can copy 16
bytes with `ldp` and `stp`:

```wyst
fn copy(to: u64, from: u64) {
  asm(to, from, scratch low, scratch high) {
    ldp low, high, [from]
    stp low, high, [to]
  }
}
```

Each input comes before each `scratch` operand. A naked function and a
block that does not return name physical registers, so they have no
`scratch` operand.

```wyst fails
fn store_zero(address: u64) {
  asm(address, scratch zero) {
    str zero.x, [address]
  }
}
```

```text
main.wyst:2:24: error: no line of this `asm` block writes `scratch zero`
```

## Registers

A block has at most 24 registers for its inputs, its output, and its
`scratch` operands together. The largest block of the models of the
secure pages of the kernel, one step of AES-GCM, has 23 general registers
and the address of its work area.

Input `i` is in `x(9 + i)`, or in `xN` for `in xN`, and the output is in
the register after the inputs, so a block has at most 9 inputs, or 8 with
an output. The `scratch` operands take the registers after the output to
`x17`, then `x0` to `x8`, and then `x19` and the registers after it. A
`scratch` operand does not take the register of an `in xN` input, or `x0`
and `x1` of an `Option<u64>` output.

A call must keep `x19` to `x28`. The function of a block that uses them
saves them in its prologue, with the registers of its locals, and loads
them again in its epilogue, so the block needs no line to save them. This
block adds two numbers of 256 bits with 11 registers, so `m2` and `m3` are
in `x0` and `x1`:

```wyst
// z = x + y, for four limbs of 64 bits each, the low limb first.
fn add256(z: u64, x: u64, y: u64) {
  asm(z, x, y, scratch a0, scratch a1, scratch a2, scratch a3, scratch m0, scratch m1, scratch m2, scratch m3) {
    ldp a0, a1, [x]
    ldp a2, a3, [x, #16]
    ldp m0, m1, [y]
    ldp m2, m3, [y, #16]
    adds a0, a0, m0
    adcs a1, a1, m1
    adcs a2, a2, m2
    adc a3, a3, m3
    stp a0, a1, [z]
    stp a2, a3, [z, #16]
  }
}
```

## Outputs

`asm(inputs) -> out { lines }` is a value: the value of the output `out`
after the last line. As a call, it can be the value of a local `const`, of
a local `var`, of an assignment, or of `return`, an operand, or an
argument. A line can read and write the output. A block that does not
write its output is an error.

```wyst
fn try_lock(word: u64) -> u64 {
  return asm(word, one = 1) -> held {
    swpa one.x, held.x, [word]
  }
}

fn ticks_since(start: u64) -> u64 {
  return asm -> now { mrs now, cntvct_el0 } - start
}
```

`swpa` writes 1 to the lock word, and `held` gets the old word. The output
is a `u64`, because a register holds 64 bits. A local `const` of the block
can also have a `#[bits]` struct type with backing type `u64`. A block with
a `u64` output has at most 8 inputs. The inputs are in the scratch
registers, and an `svc` or an `hvc` can change `x0` to `x17`. Thus the
compiler keeps each value that it needs after the block in a home while
the block runs, as for a call. An output in a named register,
`-> name in xN`, an output with a value, a `scratch` output, and a list of
outputs, `-> (a, b)`, are not implemented now.

## Option outputs

A block with the output type `Option<u64>` takes `x0` and `x1` after its
last line as the result of a call: `x0` is 0 for `.None` and not 0 for
`.Some`, and `x1` is the value of `.Some`. A kernel call from EL0 gives its
result in this form, so the code uses it as it uses the result of a
function:

```wyst
const call_receive: u64 = 4

fn receive() -> Option<u64> {
  return asm -> result: Option<u64> {
    svc #call_receive
  }
}
```

The `Option` of a block has the uses of the `Option` result of a call:
`else`, `?`, `match`, an argument, the value of a local `const`, and the
value of `return` in a function with an `Option<u64>` result. The block
has an `svc` line, or inputs in `x0` and `x1`. No line can name the output or `x0` and
`x1`. The value of `.Some` is a `u64`, because a register holds 64 bits,
so an output with a type is an `Option<u64>`, and `-> out: u32` is an
error. An output with no type is a `u64`, so `else` and `?` do not take
it:

```wyst fails
fn midr() -> u64 {
  const id = asm -> id {
    mrs id, midr_el1
  } else {
    trap()
  }
  return id
}
```

```text
main.wyst:2:21: error: `else` takes an `Option`, and an `asm` output with no type is a `u64`
```

## Blocks that do not return

`asm(inputs) -> never { lines }` does not return. Its last line is `eret`,
and no other line can be `eret`. The block ends its own block, as a call to
a `never` function does. The kernel returns to EL0 with such a block:

```wyst
fn resume() -> never {
  asm -> never {
    eret
  }
}
```

## Physical registers

The lines of a naked function and of a block with output `never` name
physical general registers and `sp`, and no input names. No code of the
compiler needs a register after these blocks. Each input of these blocks
needs `in xN`, and these blocks have no output.

A naked function sets the stack with such a block, as
[Boot and exceptions](/docs/boot-and-exceptions/) shows.

## SIMD lines

A line that names a SIMD register, such as `v0.16b`, `d0`, or `q0`, is a
SIMD line. The language has no type for these registers, and the compiler
makes no SIMD line of its own. A line names a physical SIMD register, also
in a block with inputs, because the compiler does not allocate them. The
A64 tables have only the SIMD lines that the kernel uses: `ldr q` and
`str q`, `orr` and `ext` of two vectors, and `fmov` from `d` to a general
register, and the lines of AES, of GCM, and of SHA-256. These are `aese`
and `aesmc`, `pmull` and `pmull2` of 64-bit elements, `sha256h`,
`sha256h2`, `sha256su0`, and `sha256su1`, and the SIMD lines with them:
`eor`, `and`, and `add` of vectors, `rev32` and `rev64`, `tbl` of one
register, `shl`, `ushr`, and `sshr`, `movi` of bytes, `dup` and `ins` of
an element, `ldr q` and `str q` with a post-index, `ldur q` and `stur q`,
and `ld1` and `st1` of a list of registers. Floating point is not in the
language, so the tables have no floating-point line.

A list of registers, such as `{ v0.4s, v1.4s }`, is in one line, so its
`}` does not end the block. An element, such as `v1.d[1]`, has its index
after the arrangement.

A function in the section `.el0` can have each SIMD line, because EL0 code
uses the SIMD registers, and the kernel keeps them for each thread. This
function gives the OR of the four 64-bit halves of `v0` and `v1`:

```wyst
#[section(.el0)]
fn halves() -> u64 {
  return asm -> value {
    orr v0.16b, v0.16b, v1.16b
    ext v1.16b, v0.16b, v0.16b, #8
    orr v0.16b, v0.16b, v1.16b
    fmov value.x, d0
  }
}
```

Outside `.el0`, a SIMD line can only load or store a full SIMD register,
with `ldr q` or `str q`. Thus the kernel keeps the registers of a thread,
and changes none of them. An inline function has no section, so it is
outside `.el0`:

```wyst fails
fn mix() {
  asm {
    orr v0.16b, v0.16b, v1.16b
  }
}
```

```text
main.wyst:3:5: error: outside section `.el0`, an `asm` line can name a SIMD register only to load or store it whole, with `ldr q` or `str q`
```

A SIMD register holds no value of the language, and a call can change it,
so the code keeps such values in memory between two blocks. This function
does one round of AES on the 16 bytes at `block`:

```wyst
#[section(.el0)]
fn round(block: u64, key: u64) {
  asm(block, key) {
    ld1 { v0.16b }, [block]
    ld1 { v1.16b }, [key]
    aese v0.16b, v1.16b
    aesmc v0.16b, v0.16b
    st1 { v0.16b }, [block]
  }
}
```
