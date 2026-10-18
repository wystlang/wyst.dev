---
title: Boot and exceptions
summary: Naked functions, the stack, code addresses, EL2 functions, the exception vector table, sections, and semihosting.
---

## Naked functions

`#[naked] fn` has no prologue and no epilogue, so it can run before a
stack exists. The entry of a program is usually naked, because the CPU
starts without a stack.

A naked function returns `never`. It has no frame, so it cannot have a
local (`const`), a range or string loop, an inline call, or a call to
`semihost.test_exit`. No function can call it:

```wyst fails
#[naked]
fn entry() -> never {
  for {}
}

fn restart() {
  entry()
}
```

```text
main.wyst:7:3: error: a naked function cannot be called
```

## Parameters

A naked function can take parameters in `x0` to `x7`, as a call gives
them. The parameters stay in these registers, so the function gives them
to the call or the `eret` that ends it:

- Each call in the function takes the parameters, in order, as its
  arguments, and returns `never`. A call that returns can change `x0` to
  `x17`.
- A parameter can be only such an argument.
- No `asm` line or input writes the register of a parameter, and no line
  takes an exception, such as `hvc` or `svc`, because the handler can
  change `x0` to `x17`.

```wyst
#[naked]
pub fn _start(boot_args: u64) -> never {
  asm(top in x1 = __stack_top) {
    add sp, x1, #0
  }

  main(boot_args)
}

fn main(boot_args: u64) -> never {
  for {}
}
```

A naked function has no frame, so a value cannot wait in it while a call
runs. A constant, a layout symbol, a string literal, and a parameter do
not wait, because the code computes them after the call. A module
variable does:

```wyst fails
var count: u64 = 0

#[naked]
pub fn _start() -> never {
  run(count, next())
}

fn next() -> u64 {
  return 1
}

fn run(a: u64, b: u64) -> never {
  for {}
}
```

```text
main.wyst:5:3: error: a naked function has no frame for a value that waits while a call runs
```

An `eret` keeps `x0` to `x7`, so a naked function that ends with `eret`
gives its parameters to the naked function at which `eret` goes. The
statement directly before the `asm` block of the `eret` gives this
function `f` when it writes `@f`, and nothing else, to ELR_EL2 or ELR_EL1,
such as `ELR_EL2.write(ADDRESS = @f)`. The compiler checks that `f` takes
the same parameter types in the same order. A naked function with
parameters needs this write, and its `asm` lines cannot write ELR_EL2 or
ELR_EL1. On the Mac Studio, m1n1 gives the address of `boot_args` in
`x0`, and the entry gives it to EL1 in this way, as
[EL2 functions](#el2-functions) shows.

Here `next` takes only one of the two parameters:

```wyst fails
#[sysreg]
const ELR_EL1: writeonly u64 {
  ADDRESS: u64 at 0..=63
}

#[naked]
pub fn _start(a: u64, b: u64) -> never {
  ELR_EL1.write(ADDRESS = @next)

  asm -> never {
    eret
  }
}

#[naked]
fn next(a: u64) -> never {
  run(a)
}

fn run(a: u64) -> never {
  for {}
}
```

```text
main.wyst:10:3: error: `eret` goes to `next`, which does not take the parameter types of `_start` in the same order
```

## The stack

A naked function sets the stack pointer with an `asm` block before its
first call. Its lines can name `sp` and physical registers, and each input
needs `in xN`:

```wyst
#[naked]
pub fn _start() -> never {
  asm(top in x0 = __stack_top) {
    add sp, x0, #0
  }

  main()
}

fn main() -> never {
  for {}
}
```

`__stack_top` is a symbol of the layout file. The stack grows down from
it.

The CPU starts the entry and each naked function with no stack. A naked
function has no stack until an `asm` block of its body, not of an inner
block, writes `sp`. A function that it calls before then, also in the
inputs of that block, runs with no stack, and so does a function at which
its `eret` goes and an entry that is not naked. The compiler makes sure
that such a function, and each function that it calls, uses no stack: it
saves no register, has no stack slot, and does not call `test_exit`. A
function that returns `never` saves no register, and a function keeps ten
values in registers before it puts one on the stack. Thus a naked function
can compute its stack with a call:

```wyst
#[sysreg]
const MPIDR_EL1: readonly u64 {
  Aff0: u8 at 0..=7
}

#[naked]
pub fn _start() -> never {
  asm(top in x0 = __stack_top - cpu() * 0x4000) {
    add sp, x0, #0
  }

  main()
}

fn cpu() -> u64 {
  const mpidr = MPIDR_EL1.read()
  return widen(mpidr.Aff0)
}

fn main() -> never {
  for {}
}
```

A call of a function that uses the stack, before the stack is set, is an
error:

```wyst fails
var ticks: u64 = 0

#[naked]
pub fn _start() -> never {
  count()

  asm(top in x0 = __stack_top) {
    add sp, x0, #0
  }

  for {}
}

fn count() {
  tick()
}

fn tick() {
  ticks += 1
}
```

```text
main.wyst:5:3: error: naked function `main._start` has no stack here, because no `asm` block of its body has written `sp`, but `main.count` uses the stack
```

`count` returns and calls a function, so its prologue saves `x29` and
`x30` on the stack.

## Code addresses

`@name` of a function gives its address, a `u64`, so that a CPU or a
thread can start there. `@m.f` gives the address of the `pub` function `f`
of the imported module `m`. No call starts the function, so it is naked,
or it has no parameters and returns `never`. A CPU starts with no stack,
and a thread of EL0 starts with the stack that the kernel gives it, so the
function of a thread need not be naked.

This code starts another CPU at `secondary` with the PSCI call `CPU_ON`:

```wyst
const cpu_on: u64 = 0xc400_0003

#[naked]
fn secondary() -> never {
  asm(top in x0 = __stack_top - 0x4000) {
    add sp, x0, #0
  }

  idle()
}

fn idle() -> never {
  for {
    asm {
      wfi
    }
  }
}

fn start(cpu: u64) {
  asm(function_id in x0 = cpu_on, target in x1 = cpu, entry in x2 = @secondary, context in x3 = 0) {
    hvc #0
  }
}
```

The value of a constant cannot be the address of code, because only the
linker places code.

## EL2 functions

`#[el2] fn` runs at EL2. m1n1 starts a kernel on the Mac Studio at EL2.
The boot code and the per-core setup run at EL2, and then go to EL1 with
`eret`.

- The compiler checks the `asm` lines and the system register accesses of
  an `#[el2]` function for EL2, and those of each other function for EL1.
- An `#[el2]` function can call only `#[el2]` functions, and only an
  `#[el2]` function can call one, because a callee runs at the EL of its
  caller. A function of the vector table runs at EL1, so it cannot have
  `#[el2]`.
- An `#[el2]` function accesses the EL1 registers through the `_EL12` and
  `_EL02` names while `HCR_EL2.E2H` is 1, as
  [EL1 registers at EL2](/docs/system-registers/#el1-registers-at-el2)
  gives.
- `@f` of a naked function without `#[el2]` gives the address at which
  `eret` goes to EL1.
- `_start` reads CurrentEL, because it starts at EL1 when the m1n1
  hypervisor runs the kernel as a guest. At EL1, it writes no EL2
  register, and its `eret` stays at EL1.

```wyst
// EL is the exception level that runs.
#[sysreg]
const CurrentEL: readonly u64 {
  EL: u2 at 2..=3
}

// RW makes EL1 AArch64. m1n1 sets E2H, and the write keeps it, so that
// each register name keeps its meaning at EL2.
#[sysreg]
const HCR_EL2: writeonly u64 {
  RW:  bool at 31
  E2H: bool at 34
}

enum Mode: u4 {
  EL1h = 0b0101
}

#[sysreg]
const SPSR_EL2: writeonly u64 {
  M: Mode at 0..=3
  F: bool at 6
  I: bool at 7
  A: bool at 8
  D: bool at 9
}

#[sysreg]
const ELR_EL2: writeonly u64 {
  ADDRESS: u64 at 0..=63
}

#[sysreg]
const SPSR_EL1: writeonly u64 {
  M: Mode at 0..=3
  F: bool at 6
  I: bool at 7
  A: bool at 8
  D: bool at 9
}

#[sysreg]
const ELR_EL1: writeonly u64 {
  ADDRESS: u64 at 0..=63
}

#[naked]
#[el2]
pub fn _start(boot_args: u64) -> never {
  if CurrentEL.read().EL == 2 {
    HCR_EL2.write(RW = true, E2H = true)
    SPSR_EL2.write(M = .EL1h, F = true, I = true, A = true, D = true)
    ELR_EL2.write(ADDRESS = @el1)

    asm -> never {
      eret
    }
  }

  SPSR_EL1.write(M = .EL1h, F = true, I = true, A = true, D = true)
  ELR_EL1.write(ADDRESS = @el1)

  asm -> never {
    eret
  }
}

#[naked]
fn el1(boot_args: u64) -> never {
  asm(top in x1 = __stack_top) {
    add sp, x1, #0
  }

  main(boot_args)
}

fn main(boot_args: u64) -> never {
  for {}
}
```

## The exception vector table

`#[vector_table] const name = { entry = function }` declares the EL1
exception vector table. A program has at most one.

```wyst
import runtime.semihost

#[vector_table]
const vectors = {
  current_sp0_sync = stop
  current_sp0_irq = stop
  current_sp0_fiq = stop
  current_sp0_serror = stop
  current_spx_sync = fault
  current_spx_irq = stop
  current_spx_fiq = stop
  current_spx_serror = stop
  lower_aarch64_sync = stop
  lower_aarch64_irq = stop
  lower_aarch64_fiq = stop
  lower_aarch64_serror = stop
  lower_aarch32_sync = stop
  lower_aarch32_irq = stop
  lower_aarch32_fiq = stop
  lower_aarch32_serror = stop
}

pub fn install() {
  asm(base = @vectors) {
    msr vbar_el1, base
    isb
  }
}

fn fault() -> never {
  semihost.test_exit(2)
}

fn stop() -> never {
  semihost.test_exit(1)
}
```

- The table has the 16 entries of the Arm architecture, in the order of
  the architecture: `current_sp0`, `current_spx`, `lower_aarch64`, and
  `lower_aarch32`, each with `_sync`, `_irq`, `_fiq`, and `_serror`. Each
  entry is necessary. There is no default.
- Each entry names a function of its module. The function has no
  parameters and returns `never`. It can be naked, but not inline, and it
  cannot have `#[el2]`.
- The table is 0x800 bytes: 16 slots of 0x80 bytes. Each slot is one `b`
  to the function of its entry.
- The table goes in the section `.vectors` of the layout, which must have
  an alignment of at least 0x800.
- In its module, `@name` gives the address of the table, a `u64`, so that
  the code can write it to `VBAR_EL1`.

`trap()` is the instruction `brk #0`. At EL1 on `SP_EL1`, it takes the
entry `current_spx_sync`.

An entry that is not naked saves no register. Thus an entry that returns
to the interrupted code is naked: an `asm` block saves the registers
first, and an `asm -> never` block restores them and ends with `eret`.
See [Blocks that do not return](/docs/assembly/#blocks-that-do-not-return).

## Sections

`#[section(.name)]` puts the code of a function in the section `.name` of
the layout, in place of `.text`. `.name` must be a code section other than
`.vectors`. An inline function has no code of its own, so it cannot have a
section.

```wyst
#[section(.el0)]
pub fn spin() -> never {
  for {}
}
```

The kernel puts the code of its EL0 modules in `.el0`, so that its page
tables let EL0 execute only these pages.

## Semihosting

`import runtime.semihost` gives a module that the compiler supplies for
tests on QEMU. It has no source file and one function:
`semihost.test_exit(code: u8) -> never`. It stops QEMU with exit status
`code`, through the semihosting call `SYS_EXIT` (`hlt #0xf000`). If the
call returns, the CPU waits in a `wfe` loop.

QEMU must run with `-semihosting-config enable=on`. See
[Running on QEMU](/docs/qemu/).
