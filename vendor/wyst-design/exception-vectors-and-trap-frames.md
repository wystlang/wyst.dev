---
title: "AArch64 Exception Vectors and Trap Frames"
group: reference
section: binary-interfaces
order: 400
summary: "Target-defined vector tables and target-checked trap-frame ABIs."
---

# AArch64 Exception Vectors and Trap Frames

This reference defines AArch64 vector tables and AArch64 trap frames.
The selected target owns each vector-table and trap-frame layout.

Exception operations are in
[Semantic Operations and Hardware Declarations](semantic-operations.md).
Checked assembly uses [Checked Assembly](checked-assembly.md) and
[Formal Grammar](formal-grammar.md).


## AArch64 Vector Tables

`vector_table` declares one target-owned exception vector table.
The declaration must have one of these selectors:

- `aarch64.el1`
- `aarch64.el2`
- `aarch64.el3`

The selected target must admit the selector.
The compiler does not infer the selector from the declaration name.

```text
vector_table el1_vectors: aarch64.el1 {
  current.sp0.sync     -> unexpected
  current.sp0.irq      -> unexpected
  current.sp0.fiq      -> unexpected
  current.sp0.serror   -> unexpected

  current.spx.sync     -> handle_sync
  current.spx.irq      -> handle_irq
  current.spx.fiq      -> unexpected
  current.spx.serror   -> unexpected

  lower.aarch64.sync   -> handle_user_sync
  lower.aarch64.irq    -> handle_user_irq
  lower.aarch64.fiq    -> unexpected
  lower.aarch64.serror -> unexpected

  lower.aarch32.sync   -> unexpected
  lower.aarch32.irq    -> unexpected
  lower.aarch32.fiq    -> unexpected
  lower.aarch32.serror -> unexpected
}
```

### Table layout

The current AArch64 profile defines this layout:

| Property | Value |
| --- | --- |
| Section | `.wyst.vectors.<declaration>` |
| Table alignment | `0x800` bytes |
| Table size | `0x800` bytes |
| Slot count | 16 |
| Slot size | `0x80` bytes |
| Execution state | AArch64 |

Source cannot change the section, alignment, slot size, or table size.

Each slot name must occur once in this order:

| Index | Slot name | Offset |
| ---: | --- | ---: |
| 0 | `current.sp0.sync` | `0x000` |
| 1 | `current.sp0.irq` | `0x080` |
| 2 | `current.sp0.fiq` | `0x100` |
| 3 | `current.sp0.serror` | `0x180` |
| 4 | `current.spx.sync` | `0x200` |
| 5 | `current.spx.irq` | `0x280` |
| 6 | `current.spx.fiq` | `0x300` |
| 7 | `current.spx.serror` | `0x380` |
| 8 | `lower.aarch64.sync` | `0x400` |
| 9 | `lower.aarch64.irq` | `0x480` |
| 10 | `lower.aarch64.fiq` | `0x500` |
| 11 | `lower.aarch64.serror` | `0x580` |
| 12 | `lower.aarch32.sync` | `0x600` |
| 13 | `lower.aarch32.irq` | `0x680` |
| 14 | `lower.aarch32.fiq` | `0x700` |
| 15 | `lower.aarch32.serror` | `0x780` |

The compiler rejects an unknown name, an alias, a duplicate, an omission, or
an order mismatch.
The compiler does not insert missing slots.

### Slot control flow

An arrow slot makes one terminal transfer to a label.
The label must exist.
The transfer must be valid at the selected exception level.

A block slot can perform checked setup before its terminal edge.
Each reachable path must end in one of these ways:

- a `goto`;
- a call that does not return;
- an infinite loop;
- a checked target operation that does not return.

The compiler rejects fallthrough and `return` in a slot.
Normal effect, execution-level, and checked-assembly rules apply to slot code.

The current profiles do not permit veneers in vector slots.
The compiler rejects an out-of-range slot transfer.

### Slot size

The compiler lowers a slot before it checks the slot size.

| Lowered size | Compiler action |
| --- | --- |
| Less than `0x80` bytes | Add authenticated `nop` instructions to `0x80` bytes. |
| Exactly `0x80` bytes | Emit the body without padding. |
| More than `0x80` bytes | Reject the vector table. |

All 16 slots must end at their required offsets.
The final table size must be exactly `0x800` bytes.

## AArch64 Trap Frames

`trap_frame` declares a nominal type with a target-owned layout.
The current selector is `aarch64`.
The selected target must run AArch64 at EL1, EL2, or EL3.

```text
trap_frame TrapFrame: aarch64 {
  x: [31]u64
  elr: u64
  spsr: u64
  interrupted_sp: u64
}
```

The declaration must contain these fields in this order:

| Field | Type | Offset | Saved value |
| --- | --- | ---: | --- |
| `x` | `[31]u64` | `0x000` | `x0` through `x30` |
| `elr` | `u64` | `0x0f8` | `ELR_ELx` |
| `spsr` | `u64` | `0x100` | `SPSR_ELx` |
| `interrupted_sp` | `u64` | `0x108` | Stack pointer before frame creation |

The frame size is `0x110` bytes.
The frame alignment is 16 bytes.

The compiler rejects a missing, extra, reordered, renamed, or mistyped field.
The compiler also rejects a changed offset, alignment, or total size.

This frame does not save FP or SIMD registers.
It does not save FPCR, FPSR, DAIF, or other system state.
It does not define interrupt nesting or scheduling policy.

### Entry labels

An entry label uses this clause:

```text
naked label trap_entry establishes frame: @TrapFrame {
  asm establishes stack {
    // The exact profile-owned save sequence is required here.
  }

  handle_trap(frame)
  goto trap_restore
}
```

`establishes frame: @T` is valid only on a `naked label`.
`T` must be an admitted `trap_frame` type.
The clause creates one immutable `noescape @T` binding.

The first statement must be a nonempty `asm establishes stack` block.
The block must equal the complete target-owned save sequence.
The sequence saves `x0` through `x30`, `ELR_ELx`, `SPSR_ELx`, and the interrupted
stack pointer.
The selected entry level determines the `ELR_ELx` and `SPSR_ELx` registers.

After the transition, source can access the frame binding.
Source can pass the binding to a `noescape @T` parameter.
Source cannot return the binding or store it in longer-lived storage.
The label must not fall through.

### Restore labels

A restore label uses this clause:

```text
naked label trap_restore restores TrapFrame {
  asm restores stack -> never {
    // The exact profile-owned restore sequence is required here.
  }
}
```

`restores T` is valid only on a `naked label`.
The first statement must be a nonempty `asm restores stack -> never` block.
The block must equal the complete target-owned restore sequence.
The sequence restores the saved state and ends with `eret`.
The block has no normal exit.

The compiler compares structural assembly instruction by instruction.
It rejects missing, extra, reordered, or substituted instructions.
It also rejects a wrong frame direction or a wrong exception level.
