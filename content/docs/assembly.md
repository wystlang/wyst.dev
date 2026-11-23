---
title: Assembly
summary: Checked asm blocks, their inputs, address inputs, outputs, and registers, Option outputs, blocks that do not return, and SIMD lines.
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

The compiler checks each line for the kernel at EL1, at EL2 in an
[`#[el2]` function](/docs/boot-and-exceptions/#el2-functions), or at EL0
in another function in the section `.el0`, on the QEMU `virt` target: the
base A64 instructions, the SIMD registers (`FEAT_FP` and `FEAT_AdvSIMD`),
the lines of AES, of the polynomial multiplication of 64-bit elements, and
of SHA-256 (`FEAT_AES`, `FEAT_PMULL`, and `FEAT_SHA256`), the atomic
instructions (`FEAT_LSE`) and the VHE registers (`FEAT_VHE`) of the
Cortex-A76, the GICv3 CPU interface (`FEAT_GICv3`), and the PMUv3
(`FEAT_PMUv3`). An instruction or a system register that needs a higher
exception level or another feature is an error. An inline function has no
section, so the compiler checks it at EL1 when it does not have `#[el2]`.
A function in `.el0` can read `cntvct_el0`, but not `ttbr0_el1`:

```wyst fails
#[section(.el0)]
fn table() -> u64 {
  return asm -> value {
    mrs value.x, ttbr0_el1
  }
}
```

```text
main.wyst:4:5: error: system register `TTBR0_EL1` requires EL1 or higher
```

[SIMD lines](#simd-lines) gives where a line can name a SIMD register.

## Inputs

An input is `name = value`, or `name` alone, which is `name = name`. The
value has a value type, or it is an address of memory, as
[Address inputs](#address-inputs) gives. An untyped integer is a `u64`. A
slice, a `string`, an `Option`, and the address of a register map are not
inputs. A block has at most 9 inputs. A typed input, `name: T in xN`, is
not implemented now.

[`bitcast`](/docs/addresses/#bitcast) of an address of memory, or of a
slice local or parameter, gives the address as a `u64`, so it is an
input. A line that uses that `u64` as an address asserts that each access
stays in the memory of the address, which the compiler does not check.
The function keeps the address, so the input cannot be the address of a
constant table or of a byte of a string, which are read-only data:

```wyst
struct Message {
  count: u64
  bytes: [256]u8
}

fn clean(block: @Message) {
  asm(start = bitcast(@block.bytes)) {
    dc civac, start
  }
}
```

```wyst fails
const steps: [2]u16 = [0, 0x1018]

fn clear() {
  asm(cell = bitcast(@steps[0])) {
    strh wzr, [cell]
  }
}
```

```text
main.wyst:4:22: error: `bitcast` gives no integer of this address: it can be the address of constant table `main.steps`, which is read-only data
```

Where an instruction takes a general register, a line names an input
that is not an address: `name`, or `name.x` and `name.w` for the 64-bit
and the 32-bit view. A line can also name `xzr` or `wzr`. When a 32-bit
form and a 64-bit form both accept a line, the line must give the view:

```wyst
fn save(address: @u64, value: u64) {
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

## Address inputs

An input can be an address of memory `@T`: `name = a`, as in
`asm(simd = @before.simd)`, or `name` alone for a local, a parameter, or
a module variable of type `@T`, also with `in xN`. Its register holds the
address for the block, and the compiler proves each access through it.

A memory operand of a line names the input with a path of fields and an
optional immediate: `[work]`, `[work.state]`, and `[work.state, #16]`.
The compiler adds the offset of the path to the immediate, and the sum
must fit the field of the encoding. The input has no `.x` or `.w` view,
so `.f` after it always names a field:

```wyst
struct Work {
  count: u64
  state: [4]u64
}

fn second(work: @Work) -> u64 {
  return asm(work) -> value {
    ldr value.x, [work.state, #8]
  }
}
```

The line is `ldr value.x, [work, #16]`, because `state` is at offset 8.
The A64 tables give the bytes of each access, also of a pair, such as
`ldp`, and of a list of SIMD registers. The compiler proves that each
byte of the access is in the field that the path names, or in `T` when
the path names no field:

```wyst fails
struct Work {
  count: u64
  state: [4]u64
}

fn after(work: @Work) -> u64 {
  return asm(work) -> value {
    ldr value.x, [work.state, #32]
  }
}
```

```text
main.wyst:8:5: error: the `asm` line accesses 8 bytes at offset 32 of `work.state`, which has 32 bytes
```

A post-index form, such as `ld1 { v0.4s }, [keys], #16`, accesses the
memory at the register, and then adds its step to the register. The
compiler checks each later access at the new offset. A block has no
branch, so each offset is a number, and the proof is exact. A pre-index
form, such as `ldr value.x, [keys, #16]!`, is an error.

Each other use of the register is an error: a line that writes it, a
copy, a register offset form, such as `ldr value.x, [keys, index.x]`, and
a store of its value. Thus the address does not go out of the block:

```wyst fails
fn copy(record: @[2]u64) -> u64 {
  return asm(record) -> address {
    orr address.x, xzr, record.x
  }
}
```

```text
main.wyst:3:5: error: input `record` is an address, so a line names it only as the base of the memory operand of a load or a store
```

A line that stores through the input stores through the address, as
[`store`](/docs/addresses/#load-and-store) does. Thus a store through the
address of a constant table or of a byte of a string, which are
read-only data, is an error, also in a function that takes the address,
and a load through it is correct. This function loads 32 bytes of a
table:

```wyst
const keys: [8]u32 = [1, 2, 3, 4, 5, 6, 7, 8]

#[section(.el0)]
fn load_keys() {
  asm(table = @keys) {
    ld1 { v0.4s }, [table], #16
    ld1 { v1.4s }, [table], #16
  }
}
```

```wyst fails
const steps: [2]u16 = [0, 0x1018]

fn clear() {
  asm(cell = @steps) {
    strh wzr, [cell]
  }
}
```

```text
main.wyst:5:5: error: the `asm` line cannot store through this input: it can be the address of constant table `main.steps`, which is read-only data
```

The lines of a naked function and of a block that does not return name
physical registers, and a line can write the register of an input, so
these blocks have no address input. They take the `u64` of an address
from `bitcast`, as above, and the compiler does not check those accesses.

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

A line cannot write an input, except with the post-index form of an
[address input](#address-inputs). A line cannot branch or refer to a
label. Thus control
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
fn copy(to: @[2]u64, from: @[2]u64) {
  asm(to, from, scratch low, scratch high) {
    ldp low, high, [from]
    stp low, high, [to]
  }
}
```

A line that reads a `scratch` operand before a line writes it is an error,
because its register can be one of `x0` to `x8`, which can hold a
parameter or the result of a call when the block starts. A line such as
`add t.x, t.x, #1` reads `t` before it writes it. After an exception
line, a line that reads a `scratch` operand in `x0` to `x17` is an error
until a line writes it again, as [Exception lines](#exception-lines)
gives.

Each input comes before each `scratch` operand. A naked function and a
block that does not return name physical registers, so they have no
`scratch` operand.

```wyst fails
fn store_zero(address: @u64) {
  asm(address, scratch zero) {
    str xzr, [address]
  }
}
```

```text
main.wyst:2:24: error: no line of this `asm` block writes `scratch zero`
```

## Registers

A block has at most 24 registers for its inputs, a `u64` output, and its
`scratch` operands together. The largest block of the models of the
secure pages of the kernel, one step of AES-GCM, has 23 general registers
and the address of its work area.

Input `i` is in `x(9 + i)`, or in `xN` for `in xN`, and the output is in
the register after the inputs, so a block has at most 9 inputs, or 8 with
an output. The `scratch` operands take the registers after the output to
`x17`, then `x0` to `x8`, and then `x19` and the registers after it. A
`scratch` operand does not take the register of an `in xN` input, or `x0`
and `x1` of an `Option<u64>` output. An `in xN` input also takes its place
`x(9 + i)`. Thus a block has at most 28 registers, less one for each
`in xN` input and, with an `Option<u64>` output, less each of `x0` and
`x1` that no input holds, and never more than 24. An `Option<u64>` output
is in `x0` and `x1`, which are not in this count. When this limit is less
than 24, the error for the first `scratch` operand after the limit says
that no register is free for it.

A call must keep `x19` to `x28`. The function of a block that uses them
saves them in its prologue, with the registers of its locals, and loads
them again in its epilogue, so the block needs no line to save them. This
block adds two numbers of 256 bits with 11 registers, so `m2` and `m3` are
in `x0` and `x1`:

```wyst
// z = x + y, for four limbs of 64 bits each, the low limb first.
fn add256(z: @[4]u64, x: @[4]u64, y: @[4]u64) {
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
fn try_lock(word: @u64) -> u64 {
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

The output is in the register after the inputs. When the block starts,
the code before the block, or the code of an input, can leave a value in
that register, such as an address that it computed. Thus a line that
reads the output before a line writes it is an error:

```wyst fails
fn next(count: u64) -> u64 {
  return asm(count) -> out {
    add out.x, out.x, count.x
  }
}
```

```text
main.wyst:3:5: error: the `asm` line reads output `out` before a line writes it
```

## Exception lines

A line of `svc`, `hvc`, `smc`, `brk`, `hlt`, or `udf` is an exception
line. It goes to the handler of an exception, which can change `x0` to
`x17`, and the block continues after the line when the handler returns.
Thus a line after an exception line cannot read a value that the handler
left in a register:

- Each input is in `x0` to `x17`, and a line writes an input only with
  the post-index form of an address input, so a line after an exception
  line that reads an input, also in a memory operand, is an error.
- The output is in `x9` to `x17`, so after an exception line, a line that
  reads it is an error until a line writes it again. The value of the
  block is a read of the output after its last line, so a line after the
  last exception line must write the output.
- After an exception line, a line that reads a `scratch` operand in `x0`
  to `x17` is an error until a line writes it again. A `scratch` operand
  from `x19` keeps its value.
- After an exception line, only the handler of an `svc` gives an
  `Option<u64>` output its value in `x0` and `x1`, so the last exception
  line of a block with such an output must be `svc`, as
  [Option outputs](#option-outputs) gives.

```wyst fails
const call_send: u64 = 11

fn send(message: u64) -> u64 {
  return asm(message) -> sent {
    svc #call_send
    orr sent.x, xzr, message.x
  }
}
```

```text
main.wyst:6:5: error: the `asm` line reads input `message`, which the handler of an exception of a line before it can change
```

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

The handler of an exception line other than `svc`, such as `hvc` or
`brk`, can change `x0` and `x1`. Thus when the block has an exception
line, its last exception line must be `svc`:

```wyst fails
fn query(function: u64, argument: u64) -> Option<u64> {
  return asm(function in x0, argument in x1) -> result: Option<u64> {
    hvc #0
  }
}
```

```text
main.wyst:2:49: error: the handler of an exception of a line of this `asm` block can change its output `result` in x0 and x1, so its last exception line must be `svc`
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
needs `in xN`, these blocks have no address input, and they have no
output.

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
`}` does not end the block. A list holds only registers, so a `{` in a
list is an error. An element, such as `v1.d[1]`, has its index after the
arrangement.

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
fn round(block: @[16]u8, key: @[16]u8) {
  asm(block, key) {
    ld1 { v0.16b }, [block]
    ld1 { v1.16b }, [key]
    aese v0.16b, v1.16b
    aesmc v0.16b, v0.16b
    st1 { v0.16b }, [block]
  }
}
```
