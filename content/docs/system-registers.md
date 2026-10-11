---
title: System registers
summary: Declare an AArch64 system register, then read and write its fields.
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

The name must be a system register of the A64 tables. The compiler checks
each access for EL1, also in a function that runs at EL0, such as a
function in the section `.el0`. Each access that the declaration gives
must be possible at EL1: a read for `readonly` and `readwrite`, and a
write for `writeonly` and `readwrite`. A register that needs a feature
that the target does not have is an error:

```wyst fails
#[sysreg]
const ICC_NMIAR1_EL1: readonly u64 {
  INTID: u16 at 0..=15
}
```

```text
main.wyst:2:23: error: `ICC_NMIAR1_EL1` cannot be read
```

The declaration is local to its module. `pub` does not export it, so
another module cannot read or write the register.

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

## Barriers

The compiler does not remove, combine, or move a system register access,
and it adds no barrier. A write that must take effect before the next
instruction needs an `isb`, which an `asm` block gives. See
[Assembly](/docs/assembly/).
