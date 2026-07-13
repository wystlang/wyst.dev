---
title: "Chapter 14: Wyst Alignment and Exception Vectors"
group: chapter
chapter: 14
order: 14
summary: "Alignment, exception vectors, vector slots, and checked trap-frame ABI basics."
---

# Chapter 14: Wyst Alignment and Exception Vectors

This chapter specifies `#align`, the exception-vector table shape, and
trap-frame layout. The trap-frame ABI depends on `#naked`, `%eret`, and
register ownership.

> **Canonical scope.** The `#align(n)` directive (§10.1) and the
> `#exception_vector` / `#ventry` construct (§10.2): the 16-slot
> architectural layout, 128-byte per-slot budget, 2 KB table alignment,
> and the `__ventry_<vector>_<slot>_size` static-assertion contract.
> Trap intrinsics (`%svc`, `%hvc`, `%eret`) live in
> [chapter-11-intrinsics.md §1.3.4](chapter-11-intrinsics.md); the worked boot-entry example
> using these vectors lives in [chapter-05-boot.md](chapter-05-boot.md).

---

### Alignment and Exception Vectors

---

## 10.1 The `#align` Directive

`#align(n)` constrains the assembler to place the annotated symbol at an
address that is a multiple of `n` bytes. `n` must be a power of two and a
compile-time constant.

`#align` applies to:

- labels
- functions
- constants placed in `.rodata`
- section declarations (via the layout module — see [chapter-04-modules.md](chapter-04-modules.md))

<!-- wyst-contract: check-pass -->
```wyst
#module align_demo

#align(16)
entry :: () {
  return
}
```

<!-- wyst-contract: sketch -->
```wyst
// align a label to a 64-byte cacheline boundary
hot_path :: label #align(64) {
    ...
}

// align a function to a 16-byte instruction boundary
process :: (data : @u8, len : u64) #align(16) {
    ...
}

// align a constant table to a 32-byte boundary
TABLE :: #align(32) { 0, 1, 4, 9, 16, 25, 36, 49 }
```

`#align` is a placement constraint only. It does not pad the symbol itself —
it only guarantees the start address satisfies the alignment requirement.
The assembler emits `nop` padding before the symbol as needed to satisfy it.

---

## 10.2 Exception Vectors

ARM64 exception vectors have strict hardware requirements:

- the entire table must be aligned to a 2KB (`0x800`) boundary
- the table contains exactly 16 slots, in a fixed architectural order
- each slot is exactly 128 bytes (32 instructions)
- slots that run short are padded; slots that run over are a hardware error

Wyst provides a `#exception_vector` block that encodes this contract directly.

---

### Syntax

<!-- wyst-contract: sketch -->
```wyst
name :: #exception_vector #align(0x800) {
  current_el_sp0_sync : #ventry(label = "project-specific description") {
    body
  }
  current_el_sp0_irq : #ventry {
    body
  }
  // ... exactly 16 entries
}
```

Each `#ventry` slot:

- has a canonical architectural identifier before `: #ventry`
- may carry an optional non-semantic project label with
  `#ventry(label = "...")`
- is exactly 128 bytes in the output
- is padded with `nop` if the body compiles to fewer than 32 instructions
- is a **compile error** if the body exceeds 32 instructions
- is a bare code region — no prologue, no epilogue, no return

The `#exception_vector` block itself:

- must contain exactly 16 `#ventry` slots — compile error if more or fewer
- the slots must be declared once each in the canonical ARM64 order below
- the whole block is aligned to `0x800` (may be specified explicitly or
  defaults to `0x800` when `#exception_vector` is used)

---

### The 16 ARM64 Vector Slots

ARM64 defines the 16 slots in a fixed order across four groups of four.
Wyst uses that order as the source and emission contract. The source identifier
for each slot must be exactly the canonical identifier in the table; descriptive
project labels live only in the optional `#ventry(label = "...")` metadata and
do not affect ordering, symbol names, or code generation.

| Index | Canonical identifier       | Group              | Slot             |
| ----- | -------------------------- | ------------------ | ---------------- |
| 0     | `current_el_sp0_sync`      | Current EL, SP_EL0 | Synchronous      |
| 1     | `current_el_sp0_irq`       | Current EL, SP_EL0 | IRQ / vIRQ       |
| 2     | `current_el_sp0_fiq`       | Current EL, SP_EL0 | FIQ / vFIQ       |
| 3     | `current_el_sp0_serror`    | Current EL, SP_EL0 | SError / vSError |
| 4     | `current_el_spx_sync`      | Current EL, SP_ELx | Synchronous      |
| 5     | `current_el_spx_irq`       | Current EL, SP_ELx | IRQ / vIRQ       |
| 6     | `current_el_spx_fiq`       | Current EL, SP_ELx | FIQ / vFIQ       |
| 7     | `current_el_spx_serror`    | Current EL, SP_ELx | SError / vSError |
| 8     | `lower_el_aarch64_sync`    | Lower EL, AArch64  | Synchronous      |
| 9     | `lower_el_aarch64_irq`     | Lower EL, AArch64  | IRQ / vIRQ       |
| 10    | `lower_el_aarch64_fiq`     | Lower EL, AArch64  | FIQ / vFIQ       |
| 11    | `lower_el_aarch64_serror`  | Lower EL, AArch64  | SError / vSError |
| 12    | `lower_el_aarch32_sync`    | Lower EL, AArch32  | Synchronous      |
| 13    | `lower_el_aarch32_irq`     | Lower EL, AArch32  | IRQ / vIRQ       |
| 14    | `lower_el_aarch32_fiq`     | Lower EL, AArch32  | FIQ / vFIQ       |
| 15    | `lower_el_aarch32_serror`  | Lower EL, AArch32  | SError / vSError |

Using an unknown identifier such as `sp0_sync`, declaring a canonical
identifier twice, omitting any canonical identifier, or declaring a canonical
identifier at the wrong source index is a compile error. There is no implicit
unused-slot fill. An unused architectural role still declares its canonical
slot and supplies an explicit body, usually a branch to a shared unexpected
handler or a spin loop.

---

### Complete Example

A minimal EL1 exception vector table for a QEMU `virt` kernel. Most slots
branch immediately to a handler; unhandled slots spin.

<!-- wyst-contract: sketch -->
```wyst
el1_vectors :: #exception_vector {

  // Current EL, SP_EL0 (unexpected in normal kernel operation)
  current_el_sp0_sync : #ventry(label = "sp0_sync") {
    goto unexpected
  }
  current_el_sp0_irq : #ventry(label = "sp0_irq") {
    goto unexpected
  }
  current_el_sp0_fiq : #ventry(label = "sp0_fiq") {
    goto unexpected
  }
  current_el_sp0_serror : #ventry(label = "sp0_serror") {
    goto unexpected
  }

  // Current EL, SP_EL1 (normal kernel exception entry)
  current_el_spx_sync : #ventry(label = "kernel_sync") {
    goto handle_sync
  }
  current_el_spx_irq : #ventry(label = "kernel_irq") {
    goto handle_irq
  }
  current_el_spx_fiq : #ventry(label = "kernel_fiq") {
    goto unexpected
  }
  current_el_spx_serror : #ventry(label = "kernel_serror") {
    goto handle_serror
  }

  // Lower EL, AArch64 (exceptions from EL0 userspace)
  lower_el_aarch64_sync : #ventry(label = "el0_sync") {
    goto handle_el0_sync
  }
  lower_el_aarch64_irq : #ventry(label = "el0_irq") {
    goto handle_el0_irq
  }
  lower_el_aarch64_fiq : #ventry(label = "el0_fiq") {
    goto unexpected
  }
  lower_el_aarch64_serror : #ventry(label = "el0_serror") {
    goto unexpected
  }

  // Lower EL, AArch32 (not used — spin)
  lower_el_aarch32_sync : #ventry(label = "el0_32_sync") {
    loop {
      %wfe()
    }
  }
  lower_el_aarch32_irq : #ventry(label = "el0_32_irq") {
    loop {
      %wfe()
    }
  }
  lower_el_aarch32_fiq : #ventry(label = "el0_32_fiq") {
    loop {
      %wfe()
    }
  }
  lower_el_aarch32_serror : #ventry(label = "el0_32_serror") {
    loop {
      %wfe()
    }
  }
}
```

Installing the table into `VBAR_EL1`:

<!-- wyst-contract: sketch -->
```wyst
install_vectors :: () {
  %msr(VBAR_EL1, #addr_of(el1_vectors) as.address u64)
  %isb()
}
```

`#addr_of(symbol)` materializes the runtime address of a symbol. The
integrated linker resolves the address at final placement and the compiler
emits the correct `adrp xN, sym` + `add xN, xN, :lo12:sym` sequence. The
programmer does not write relocation annotations directly.

---

### Slot Size Enforcement

| Situation                              | Result                                      |
| -------------------------------------- | ------------------------------------------- |
| slot body < 128 bytes                  | padded with `nop` to exactly 128 bytes      |
| slot body == 128 bytes                 | emitted as-is                               |
| slot body > 128 bytes                  | **compile error** — slot overflow           |
| fewer than 16 `#ventry` slots declared | **compile error** — incomplete vector table |
| more than 16 `#ventry` slots declared  | **compile error** — too many entries        |
| unknown slot identifier                | **compile error** — noncanonical role name  |
| duplicate canonical slot identifier    | **compile error** — duplicated vector role  |
| canonical slot omitted                 | **compile error** — missing vector role     |
| canonical slot at wrong source index   | **compile error** — wrong architectural position |
| `#exception_vector` block not aligned  | assembler pads to nearest `0x800` boundary  |

Overflow is always a hard error. A slot that exceeds 128 bytes would silently
overwrite the next slot's handler — this is never a recoverable situation.

The backend records each slot's canonical role in IR and verifies that the
slot is emitted at `index * 128` bytes from the table base. The emitted symbol
`__ventry_<vector>_<slot>_size` records the unpadded body size; the slot's
artifact extent remains exactly 128 bytes after padding.

---

### Relationship to `#exact`

`#ventry` slots are already exact-code regions in the architectural sense:
their table position and final size are fixed by ARM64, and their body size is
checked against the 128-byte slot budget after lowering and inline expansion.
Wyst therefore does not accept `#exact` metadata on `#ventry`. Use `#exact` on
ordinary functions or labels when a non-vector code item needs a post-lowering
artifact contract. Inside an exception vector, a helper reached by a slot may
still have its own ordinary `#exact` contract if it is an emitted callable; an
inlined helper contributes to the slot's 128-byte budget.

---

### Relationship to `#align`

`#exception_vector` uses `#align` internally. The default alignment is
`0x800`. An explicit `#align` on an `#exception_vector` block overrides the
default:

<!-- wyst-contract: sketch -->
```wyst
// explicit — same as default
el1_vectors :: #exception_vector #align(0x800) { ... }

// default — #align(0x800) is implied
el1_vectors :: #exception_vector { ... }
```

Specifying an alignment smaller than `0x800` on an `#exception_vector` block
is a compile error — the hardware requirement cannot be relaxed.

---

### Design Rationale

| Choice                              | Reason                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `#exception_vector` over bare label | encodes the 16-slot ARM64 contract; enables size enforcement           |
| auto-pad short slots with `nop`     | normal — most slots are one branch; manual padding is busy-work        |
| hard error on slot overflow         | overflow silently corrupts the next handler — never acceptable         |
| hard error on wrong slot count      | a partial vector table is always a hardware bug                        |
| canonical slot identifiers          | binds each source body to one architectural role and byte offset       |
| optional `#ventry(label = "...")`   | keeps project-specific names available without changing architecture   |
| `#ventry` for slots                 | distinguishes vector entries from ordinary labels; enables enforcement |
| `#align` is the primitive           | `#exception_vector` builds on it; `#align` remains general-purpose     |

---

## 10.3 Trap Frame ABI

An exception vector slot should tail-transfer to a `#naked #noreturn` label
when it needs a full handler frame. The entry label performs the save before
ordinary Wyst code runs; the compiler does not synthesize hidden handler
prologues or register spills for this ABI.

The trap frame is 16-byte aligned and exactly `0x110` bytes:

| Offset            | Contents                                                                    |
| ----------------- | --------------------------------------------------------------------------- |
| `0x000` - `0x0ef` | `x0` through `x29`, in register order, two 64-bit registers per 16-byte row |
| `0x0f0`           | `x30` / link register                                                       |
| `0x0f8`           | `ELR_ELx` captured at exception entry                                       |
| `0x100`           | `SPSR_ELx` captured at exception entry                                      |
| `0x108`           | interrupted `sp` value, equal to trap-frame base + `0x110`                  |

Wyst exposes this ABI through `#trap_frame`, not through an unchecked comment
convention. The canonical ARM64 frame type is:

<!-- wyst-contract: sketch -->
```wyst
TrapFrame :: #trap_frame(arm64) struct {
  x : [31]u64 // saved x0 through x30
  elr : u64 // offset 0x0f8
  spsr : u64 // offset 0x100
  interrupted_sp : u64 // offset 0x108
}
```

`#trap_frame(arm64)` is valid only on a non-generic, non-`#packed` struct with
exactly those four fields in that order. The compiler verifies that the type is
`0x110` bytes and that `elr`, `spsr`, and `interrupted_sp` have the offsets
shown above. The type's natural Wyst alignment is still the maximum alignment
of its fields; the 16-byte trap-frame base alignment is enforced by the
entry/restore stack sequence.

Entry and restore labels opt in explicitly:

<!-- wyst-contract: sketch -->
```wyst
trap_entry :: label #naked #noreturn #trap_frame(entry, TrapFrame) { ... }
trap_restore :: label #naked #noreturn #trap_frame(restore, TrapFrame) { ... }
```

The label marker is valid only on `#naked #noreturn` labels. It is a
compile-time verifier contract and adds no runtime checks. The named type must
be a `#trap_frame(arm64)` struct, and the module target must run at EL1, EL2,
or EL3 so the matching `ELR_ELx` and `SPSR_ELx` registers exist.

For `#trap_frame(entry, T)`, the first statement in the label must be a
checked `#asm` block containing exactly the canonical save sequence:

- subtract `0x110` from `sp`;
- store `x0`-`x29` as ordered pairs at offsets `0x000` through `0x0e0`;
- store `x30` at `0x0f0`;
- after `x16`/`x17` have been saved, use `x16` or `x17` to store the
  target-EL `ELR_ELx`, target-EL `SPSR_ELx`, and interrupted `sp` slots.

For `#trap_frame(restore, T)`, the first statement in the label must be a
checked `#asm` block containing exactly the canonical restore sequence:

- reload `ELR_ELx` and `SPSR_ELx` for the module target EL;
- restore `x0`-`x29` as ordered pairs and `x30` from `0x0f0`;
- add `0x110` back to `sp`;
- execute `eret`.

The verifier intentionally recognizes this canonical source shape rather than
proving arbitrary equivalent assembly. If a kernel needs a different frame
shape, nested-frame discipline, SIMD extension frame, or lazy-save policy, it
must use a future named `#trap_frame` profile instead of weakening
`#trap_frame(arm64)`.

The halt path is also explicit: once the frame is complete, the entry label may
switch to a known handler stack and call a `#noreturn` panic or exit routine.
That direct call is a terminal source statement and does not need a defensive
fallback loop in the caller. The path does not claim to resume the interrupted
context. Restore labels that end in checked `eret` assembly may still call an
imported `#[inline, noreturn]` idle helper after the assembly block if the
assembly unexpectedly returns control to source.

### Nested Interrupt And DAIF Policy

The checked ARM64 trap-frame profile keeps nested interrupts disabled while a
trap frame is being populated or restored. Hardware exception entry supplies
the initial PSTATE/DAIF state in `SPSR_ELx`; the entry code preserves it but
does not clear DAIF or unmask IRQ, FIQ, SError, or debug exceptions while the
frame is live.

Any nested-interrupt policy must allocate a distinct frame per nesting
level, define ownership of the interrupted stack, and state the exact `DAIF`
transition and barrier sequence before unmasking. Until that exists, Wyst
examples treat nested interrupts as disabled by convention, even on halt-only
handlers.

---
