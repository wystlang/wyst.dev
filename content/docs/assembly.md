---
title: Assembly
summary: Checked asm blocks, their inputs and outputs, Option outputs, and blocks that do not return.
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
- `add sp, x0, #0` for `mov sp, x0`

A barrier option is a number or its Arm name: `dsb sy` is `dsb #15`. A DC,
IC, or TLBI operation of the A64 tables can use its Arm name, such as
`tlbi vmalle1`. The tables have no other system operation, so a line such
as `at s1e1r` is an error.

The compiler checks each line for the kernel at EL1, or at EL2 in an
[`#[el2]` function](/docs/boot-and-exceptions/#el2-functions), on the QEMU
`virt` target: the base A64 instructions, the atomic instructions
(`FEAT_LSE`) and the VHE registers (`FEAT_VHE`) of the Cortex-A76, and the
GICv3 CPU interface (`FEAT_GICv3`). An
instruction or a system register that needs a higher exception level or
another feature is an error.

## Inputs

An input is `name = value`, or `name` alone, which is `name = name`. The
value has a value type. An untyped integer is a `u64`. An address type,
such as the type `@u64` of `@p.f`, is not a value type, so `@p.f` is not
an input. A block has at most 9 inputs. A typed input, `name: T in xN`, and a
`scratch` operand are not implemented now.

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
value of an integer constant:

```wyst
const call_send: u64 = 3

fn send() {
  asm {
    svc #call_send
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

## Outputs

`asm(inputs) -> out { lines }` is a value: the value of the output `out`
after the last line. As a call, it can be the value of a local `const` or
of `return`, an operand, or an argument. A line can read and write the
output. A block that does not write its output is an error.

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
`-> name in xN`, an output with a value, and a list of outputs,
`-> (a, b)`, are not implemented now.

## Option outputs

A block with the output type `Option<u64>` takes `x0` and `x1` after its
last line as the result of a call: `x0` is 1 for `.Some` and 0 for
`.None`, and `x1` is the value of `.Some`. A kernel call from EL0 gives its
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
`else`, `?`, and the value of `return` in a function with an `Option<u64>`
result. The block has an `svc`
line, or inputs in `x0` and `x1`. No line can name the output or `x0` and
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
