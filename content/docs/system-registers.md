---
title: System registers
summary: Declare an AArch64 system register, by its name or by its encoding, then read and write its fields.
---

## Declaring a system register

`#[sysreg] const NAME: access u64 { fields }` declares the system register
`NAME`, such as `SCTLR_EL1`. The access kind and the fields follow the
rules of a register map. The type is `u64`, and the register has no
offset.

```wyst
#[sysreg]
const SCTLR_EL1: readwrite u64 {
  M:      bool at 0
  C:      bool at 2
  EOS:    bool at 11 = true
  I:      bool at 12
  TSCXT:  bool at 20 = true
  EIS:    bool at 22 = true
  SPAN:   bool at 23 = true
  nTLSMD: bool at 28 = true
  LSMAOE: bool at 29 = true
}
```

A bit position can be a
[constant that the compiler computes](/docs/registers/#computed-positions),
as in a register map:

```wyst
// An INTID has 24 bits. With no LPIs, each INTID is below 1024, so the
// low 16 bits hold it.
const intid_bits: u8 = 16

#[sysreg]
const ICC_IAR1_EL1: readonly u64 {
  INTID: u16 at 0..=intid_bits - 1
}
```

The name must be a system register of the A64 tables. Each access that
the declaration gives must be possible at EL2, the highest EL of the code:
a read for `readonly` and `readwrite`, and a write for `writeonly` and
`readwrite`. Else the error gives the reason of the A64 tables. A
register that needs a feature that the target does not have gives the
features:

```wyst fails
#[sysreg]
const ICC_NMIAR1_EL1: readonly u64 {
  INTID: u16 at 0..=15
}
```

```text
main.wyst:2:23: error: `ICC_NMIAR1_EL1` needs FEAT_GCIE_LEGACY or FEAT_GICv3_NMI, which the target does not have
```

A register that only EL3 can access gives the EL:

```wyst fails
#[sysreg]
const SCR_EL3: readwrite u64 {
  NS: bool at 0
}
```

```text
main.wyst:2:16: error: `SCR_EL3` can be read only at EL3 or higher
```

Each read and each write must be possible at the EL of its function: EL1,
or EL2 in an [`#[el2]` function](/docs/boot-and-exceptions/#el2-functions).
The compiler checks a function that runs at EL0, such as a function in the
section `.el0`, for EL1. Thus a function without `#[el2]` cannot read
`VBAR_EL2`:

```wyst fails
#[sysreg]
const VBAR_EL2: readonly u64 {
  VBA: u53 at 11..=63
}

fn installed() -> bool {
  return VBAR_EL2.read().VBA != 0
}
```

```text
main.wyst:7:19: error: `VBAR_EL2` can be read only at EL2, in an `#[el2]` function
```

## Sharing a register

`pub` lets each module that imports the module of a system register use
the register: `m.NAME.read()` and `m.NAME.write(F = v, ...)` access the
`pub` register `NAME` of module `m`. The EL rules apply at the function
that accesses it. Thus a register that two modules use has one
declaration. This module declares the control register of the EL1
physical timer:

```wyst cpu/timer.wyst
// The timer signals its interrupt while ENABLE is 1, IMASK is 0, and
// ISTATUS is 1.
#[sysreg]
pub const CNTP_CTL_EL0: readwrite u64 {
  ENABLE:  bool at 0
  IMASK:   bool at 1
  ISTATUS: bool at 2
}

#[sysreg]
const CNTP_TVAL_EL0: readwrite u64 {
  TimerValue: u32 at 0..=31
}

pub fn start(ticks: u32) {
  CNTP_TVAL_EL0.write(TimerValue = ticks)
  CNTP_CTL_EL0.write(ENABLE = true)
}
```

Another module reads the status of the same register:

```wyst
import cpu.timer

fn pending() -> bool {
  return timer.CNTP_CTL_EL0.read().ISTATUS
}
```

A register that is not `pub` is local to its module:

```wyst fails
import cpu.timer

fn ticks() -> u32 {
  return timer.CNTP_TVAL_EL0.read().TimerValue
}
```

```text
main.wyst:4:16: error: system register `CNTP_TVAL_EL0` of module `cpu.timer` is not `pub`
```

An enum field of a `pub` register takes `.Variant` in each module, also
when the enum is not `pub`, because the field gives the enum.

## Implementation-defined registers

`#[sysreg(S3_5_C15_C1_3)] const NAME: access u64 { fields }` declares, by
its encoding, an implementation-defined system register, which the A64
tables do not name. The Apple cores have such registers for their FIQ
sources and for the per-core setup of m1n1.

```wyst
// IMODE 0 turns off the FIQ of the performance counters.
#[sysreg(S3_1_C15_C0_0)]
const PMCR0_EL1: writeonly u64 {
  IMODE: u3 at 8..=10
}

fn mask_counters() {
  PMCR0_EL1.write(IMODE = 0)
}
```

- The encoding is `S<op0>_<op1>_C<CRn>_C<CRm>_<op2>`, as the Arm
  architecture writes it, in decimal with no leading zero. The error for
  a wrong encoding names the wrong part:

```wyst fails
#[sysreg(S3_8_C15_C1_3)]
const VM_TMR_FIQ_ENA_EL2: readwrite u64 {
  P: bool at 1
}
```

```text
main.wyst:1:10: error: op1 is at most 7, found 8
```

- The architecture keeps op0 = 3 with CRn = 11 or 15 for
  implementation-defined registers, so each other encoding is an error,
  also the encoding of a register that the tables name:

```wyst fails
#[sysreg(S3_0_C1_C0_0)]
const SCTLR: readwrite u64 {
  M: bool at 0
}
```

```text
main.wyst:1:10: error: `S3_0_C1_C0_0` is not implementation-defined: op0 must be 3, and CRn 11 or 15
```

- The name is free. The other rules of a system register apply, but not
  the EL rules.
- The tables do not give the EL of such a register, so a function at each
  EL can access it, as its access kind lets. The declaration asserts that
  the code accesses the register only at an EL that can.

## Reading and writing

`NAME.read()` is one `mrs` instruction, and `NAME.write(F = v, ...)` is one
`msr`. They follow the rules of register access: a read gives a snapshot,
and a write makes one value from the named fields.

A write sets each bit that it does not name to zero, except a fixed field.
Thus the declaration gives each RES1 bit as a fixed field, as `SCTLR_EL1`
above does.

```wyst
enum Granule: u2 {
  4K = 0
  64K = 1
  16K = 2
}

#[sysreg]
const TCR_EL1: readwrite u64 {
  T0SZ: u6      at 0..=5
  TG0:  Granule at 14..=15
  EPD1: bool    at 23
}

fn configure() {
  TCR_EL1.write(T0SZ = 16, TG0 = .16K, EPD1 = true)

  asm {
    isb
  }
}

fn granule() -> u64 {
  if TCR_EL1.read().TG0 == 2 {
    return 16384
  }
  return 4096
}
```

A read of the enum field `TG0` gives its backing `u2` value, so
`TCR_EL1.read().TG0 == 2` compares it with the value of `.16K`.

`const s = NAME.read()` keeps the snapshot of one `mrs` in the local `s`,
and each `s.F` reads field `F` from it, as for a device register. The
number of a CPU of the Mac Studio uses four fields of one read of
`MPIDR_EL1`:

```wyst
#[sysreg]
const MPIDR_EL1: readonly u64 {
  Core:    u8 at 0..=7
  Cluster: u3 at 8..=10
  Die:     u4 at 11..=14
  P:       u1 at 16..=16
}

fn current() -> u64 {
  const mpidr = MPIDR_EL1.read()
  return 10 * widen(mpidr.Die) + 4 * widen(mpidr.Cluster) + widen(mpidr.Core) -
    2 * widen(mpidr.P)
}
```

A system register is not a value, not a type, and not memory, so it has
no address. A register of another module gives the same error as a
register of the module:

```wyst fails
#[sysreg]
const TPIDR_EL1: readwrite u64 {
  Thread: u64 at 0..=63
}

fn save(thread: TPIDR_EL1) {}
```

```text
main.wyst:6:17: error: `TPIDR_EL1` is a system register, not a type
```

A constant cannot read a register, before or after its declaration,
because the compiler cannot compute the value.

## Barriers

The compiler does not remove, combine, or move a system register access,
and it adds no barrier. A write that must take effect before the next
instruction needs an `isb`, which an `asm` block gives. See
[Assembly](/docs/assembly/).
