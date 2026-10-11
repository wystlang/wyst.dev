---
title: Boot and exceptions
summary: Naked functions, the stack, code addresses, the exception vector table, sections, and semihosting.
---

## Naked functions

`#[naked] fn` has no prologue and no epilogue, so it can run before a
stack exists. The entry of a program is usually naked, because the CPU
starts without a stack.

A naked function has no parameters, and it returns `never`. It has no
frame, so it cannot have a local (`const`), a range or string loop, an
inline call, or a call to `semihost.test_exit`. No function can call it:

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
it. The compiler does not check that a naked function sets the stack
before its first call.

## Code addresses

`@name` of a naked function gives its address, a `u64`, so that a CPU or a
thread can start there. `@m.f` gives the address of the `pub` naked
function `f` of the imported module `m`. `@` of a function takes only a
naked function.

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
  parameters and returns `never`. It can be naked, but not inline.
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
