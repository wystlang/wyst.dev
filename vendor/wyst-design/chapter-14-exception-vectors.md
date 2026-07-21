---
title: "Chapter 14: Wyst Alignment and Exception Vectors"
group: chapter
chapter: 14
order: 14
summary: "Alignment, target-defined vector tables, and target-checked trap-frame ABIs."
---

# Chapter 14: Wyst Alignment and Exception Vectors

This chapter specifies the selected snapshot alignment contract and the target-defined
`vector_table` and `trap_frame` declarations. A target profile, rather than
source annotations, owns the architectural section, alignment, slot or field
shape, state transitions, and legal execution levels of these declarations.

> **Canonical scope.** Section 10.1 owns ordinary source-requested alignment.
> Section 10.2 owns vector-table source shape and target-profile validation.
> Section 10.3 owns nominal trap-frame types and entry/restore label contracts.
> Qualified exception operations such as `exception.svc`, `exception.hvc`, and
> `exception.eret` live in
> [chapter-11-intrinsics.md](chapter-11-intrinsics.md). Checked assembly lives
> in Chapter 8 and Appendix B; this chapter adds no second instruction parser,
> encoder, register table, state table, or effect table.

---

## 10.1 The `#[align(N)]` Attribute

`#[align(N)]` requires the final address of an emitted declaration to be a
multiple of `N`. `N` is one positive, target-supported, power-of-two `u64`
constant. Natural alignment, selected-section alignment, target requirements,
and `#[cache_isolated]` combine with it by taking the maximum. Preceding
padding may satisfy the requirement; the attribute does not enlarge the
subject and does not retain a declaration that would otherwise be removed.

The generated declaration-attribute matrix admits `align` on body functions,
body labels, module variables, `per_cpu var` declarations, module constants
that also carry `section`, and fields of ordinary non-packed structs. It is
rejected on bodyless or foreign declarations, locals, whole types, packed
fields, target-owned or fixed placements, and `#[inline]` functions.

<!-- wyst-contract: check-pass -->
```wyst
module align_demo

#[align(16)]
fn entry() { }
```

<!-- wyst-contract: sketch -->
```wyst
#[align(64)]
var shared_state: u64 = 0

#[section(".tables"), align(32)]
const TABLE: [8]u64 = [0, 1, 4, 9, 16, 25, 36, 49]

struct Packet {
  tag: u8
  #[align(16)]
  payload: u8
}
```

On an ordinary struct field, `align` instead raises the field's required
alignment and therefore participates in field offsets, aggregate alignment,
ABI identity, and serialized layout facts. On `per_cpu var`, both the linked
template offset and every selected live-instance realization must satisfy the
combined requirement. See Chapter 8 for that realization contract.

`vector_table` placement and `trap_frame` representation are target-owned. In
particular, `#[align(...)]` and `#[section(...)]` cannot override either
selected profile.

---

## 10.2 Target-Defined Vector Tables

A vector table is a named code declaration with one explicit target selector:

<!-- wyst-contract: sketch -->
```wyst
vector_table el1_vectors: aarch64.el1 {
  current.sp0.sync     -> unexpected
  current.sp0.irq      -> unexpected
  current.sp0.fiq      -> unexpected
  current.sp0.serror   -> unexpected

  current.spx.sync     -> handle_sync
  current.spx.irq      -> handle_irq
  current.spx.fiq      -> unexpected
  current.spx.serror   -> handle_serror

  lower.aarch64.sync {
    goto handle_user_sync
  }
  lower.aarch64.irq    -> handle_user_irq
  lower.aarch64.fiq    -> unexpected
  lower.aarch64.serror -> unexpected

  lower.aarch32.sync   -> unexpected
  lower.aarch32.irq    -> unexpected
  lower.aarch32.fiq    -> unexpected
  lower.aarch32.serror -> unexpected
}
```

The current selectors are exactly `aarch64.el1`, `aarch64.el2`, and
`aarch64.el3`. The selected target must authenticate the selector and admit
its architecture, AArch64 execution state, and exception level. A selector is
part of source and build identity; it is not inferred from the declaration
name or from the label targets.

The current AArch64 target profile owns these facts:

| Fact | Required value |
| --- | --- |
| Output section | `.wyst.vectors.<declaration>` |
| Table alignment | `0x800` bytes |
| Table size | `0x800` bytes |
| Slot count | 16 |
| Slot size | `0x80` bytes |
| Execution state | AArch64 |
| Legal selectors | `aarch64.el1`, `aarch64.el2`, `aarch64.el3` |

Source cannot replace the target-owned section or alignment. The layout
solver may place the target-owned section only while preserving its section
identity, table alignment, exact extent, and every slot offset.

### Canonical slot names and order

Each required slot is written exactly once in target order. Dots are part of
the canonical source name; underscore aliases are not accepted.

| Index | Source name | Offset |
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

An unknown name, underscore alias, duplicate, omission, or order mismatch is a
compile error. The compiler never inserts an omitted role or changes source
order to repair a table. An unused architectural role still has an explicit
source entry, normally a transfer to a shared unexpected-exception label.

For each slot, the compiler retains the declaration and slot source spans,
canonical target identity, selected profile, source index, required offset,
unpadded body size, final extent, instruction identities, terminal edge, and
padding ranges. Emitted catalog records retain the target-owned section and
exact byte offset, which map each record back to one generated slot identity.
A structural diagnostic names the table and slot, reports the expected and
observed fact, and points to both the source contribution and the owning
target-profile fact when both exist.

### Slot bodies and terminal control flow

An arrow entry is shorthand for one terminal transfer to the named label. Its
target must resolve as an ordinary label, the edge must be legal at the slot's
profile-defined execution level, and the emitted transfer has the same
control-flow and provenance requirements as an explicit `goto`.

A block entry is an ordinary checked source block. Every reachable path must
terminate within the slot by a `goto`, a nonreturning call, an infinite loop,
or a checked target operation whose control-flow contract is `never`. A block
that falls through, returns, or relies on an implicit transfer is rejected.
The block form exists for checked setup before the terminal edge; it does not
create a vector-specific assembly language.

Every instruction in a slot—including direct transfers, veneers when the
target permits them, target state transitions, and padding—must have an active
authenticated instruction identity. Every edge must satisfy the normal
execution-level, state, effect, branch-range, and checked-assembly rules. The
vector-table declaration supplies only structural position and slot identity.

The active `aarch64.el1`--`aarch64.el3` profiles permit no vector-slot veneer
or relaxation. Their section is exactly `0x800` bytes and every byte already
belongs to one fixed `0x80` slot, so an out-of-range arrow or block terminal
transfer is a hard structural diagnostic. The compiler never appends a veneer
to `.wyst.vectors.*`, places one after a slot, or consumes authenticated NOP
padding as an implicit veneer pool.

### Exact slot extents and padding

The compiler lowers and expands a supplied slot before applying its target
budget:

| Lowered slot body | Result |
| --- | --- |
| Less than `0x80` bytes | Pad with the profile's canonical active `nop` instruction to exactly `0x80` bytes. |
| Exactly `0x80` bytes | Emit the body unchanged. |
| More than `0x80` bytes | Reject the declaration with the overflowing slot name, body size, and budget. |

Padding carries compiler-generated catalog provenance for the authenticated
`nop` identity. Its target-owned section and exact byte range, together with
the retained table profile and generated slot map, identify the table and
canonical slot without decoding the instruction bytes. The compiler cannot
use zero fill, an unauthenticated word, or a different instruction merely
because it has no intended source effect. Each supplied instruction and
terminal edge retains its ordinary source and catalog provenance as well.

The emitted table is valid only if all 16 slots end at their target-owned
offsets and the final extent is exactly `0x800` bytes. Fixed slot size is an
artifact contract, not permission for an overflowing body to overwrite the
next entry.

---

## 10.3 Target-Checked Trap Frames

`trap_frame` declares a specialized nominal type whose complete machine shape
is selected explicitly:

<!-- wyst-contract: sketch -->
```wyst
trap_frame TrapFrame: aarch64 {
  x: [31]u64
  elr: u64
  spsr: u64
  interrupted_sp: u64
}
```

The current selector is exactly `aarch64`. The selected target must admit the
profile at EL1, EL2, or EL3 in AArch64 execution state. `TrapFrame` is a new
nominal type, not an attribute applied to an ordinary struct. It is
non-generic, cannot be packed, and cannot carry an annotation that changes its
profile-owned representation.

The source field list is deliberately visible and must match the authenticated
profile exactly. For `aarch64`, the target owns this shape:

| Field | Type | Offset | Meaning |
| --- | --- | ---: | --- |
| `x` | `[31]u64` | `0x000` | Saved `x0` through `x30`, in register order. |
| `elr` | `u64` | `0x0f8` | The selected EL's `ELR_ELx` value. |
| `spsr` | `u64` | `0x100` | The selected EL's `SPSR_ELx` value. |
| `interrupted_sp` | `u64` | `0x108` | Stack pointer immediately before frame establishment. |

The frame extent is exactly `0x110` bytes and its stack base must be 16-byte
aligned. A missing, extra, reordered, renamed, or differently typed field; a
different offset or total extent; or an incompatible target is a compile
error. The compiler neither hides required fields nor silently adds target
state absent from source.

A target profile that includes SVE, SME, predicate, matrix/tile, or any other
extended architectural state must name and validate the entire required state
shape. An incomplete declaration is rejected; extended state is never treated
as an opaque clobber. A different frame layout or save policy requires a
separately authenticated profile name.

### Typed entry and restore labels

The frame type is attached to control flow through hard label clauses:

<!-- wyst-contract: sketch -->
```wyst
naked label trap_entry establishes TrapFrame {
  asm establishes stack {
    sub sp, sp, #0x110
    stp x0, x1, [sp, #0x000]
    stp x2, x3, [sp, #0x010]
    stp x4, x5, [sp, #0x020]
    stp x6, x7, [sp, #0x030]
    stp x8, x9, [sp, #0x040]
    stp x10, x11, [sp, #0x050]
    stp x12, x13, [sp, #0x060]
    stp x14, x15, [sp, #0x070]
    stp x16, x17, [sp, #0x080]
    stp x18, x19, [sp, #0x090]
    stp x20, x21, [sp, #0x0a0]
    stp x22, x23, [sp, #0x0b0]
    stp x24, x25, [sp, #0x0c0]
    stp x26, x27, [sp, #0x0d0]
    stp x28, x29, [sp, #0x0e0]
    str x30, [sp, #0x0f0]
    mrs x16, ELR_EL1
    str x16, [sp, #0x0f8]
    mrs x16, SPSR_EL1
    str x16, [sp, #0x100]
    add x16, sp, #0x110
    str x16, [sp, #0x108]
  }

  trap_halt()
}

naked label trap_restore restores TrapFrame {
  asm restores stack -> never {
    ldr x16, [sp, #0x0f8]
    msr ELR_EL1, x16
    ldr x16, [sp, #0x100]
    msr SPSR_EL1, x16
    ldp x0, x1, [sp, #0x000]
    ldp x2, x3, [sp, #0x010]
    ldp x4, x5, [sp, #0x020]
    ldp x6, x7, [sp, #0x030]
    ldp x8, x9, [sp, #0x040]
    ldp x10, x11, [sp, #0x050]
    ldp x12, x13, [sp, #0x060]
    ldp x14, x15, [sp, #0x070]
    ldp x16, x17, [sp, #0x080]
    ldp x18, x19, [sp, #0x090]
    ldp x20, x21, [sp, #0x0a0]
    ldp x22, x23, [sp, #0x0b0]
    ldp x24, x25, [sp, #0x0c0]
    ldp x26, x27, [sp, #0x0d0]
    ldp x28, x29, [sp, #0x0e0]
    ldr x30, [sp, #0x0f0]
    add sp, sp, #0x110
    eret
  }
}
```

The example shows the complete EL1 sequence. The `aarch64` profile selects
the matching canonical `ELR_ELx` and `SPSR_ELx` spellings for EL2 or EL3 from
the label's checked callable-entry execution-level fact, not merely the
module's initial entry level. It does not permit arbitrary substitution of a
semantically similar sequence.

`establishes T` and `restores T` are valid only after the name of a
`naked label`. `T` must resolve to one nominal `trap_frame` type admitted by
the selected target. Labels are inherently terminal entries, so these clauses
do not add or accept a redundant return-type marker.

The first statement of an establishing label must be a non-empty
`asm establishes stack` block. Its catalog-parsed instructions must be the
profile's complete canonical save sequence. After that transition, the stack
contains one live `T` at the established base and subsequent source must end
without falling through.

The first statement of a restoring label must be a non-empty
`asm restores stack -> never` block. Its catalog-parsed instructions must be
the complete canonical restore sequence, ending in the target's architectural
exception return. The block has no normal exit and no source statement may
stand in for the required terminal return.

An empty or comment-only assembly block is not a transition. A generic checked
assembly block, a later rather than first stack transition, the wrong
`establishes`/`restores` direction, an ordinary label, or a sequence with a
missing, extra, reordered, or substituted instruction is rejected.

Shape diagnostics identify the selected profile, field or instruction index,
canonical expected fact, observed source fact, and relevant source span. A
sequence diagnostic reports the first mismatch and the target-profile row
that supplied the expected instruction.

The label clause owns the typed trap-frame ABI; the assembly stack clause owns
the local stack-state transition. The compiler cross-checks both against the
same authenticated target profile and records both in typed IR. It does not
infer one contract from the other or accept a hand-written assertion in its
place. Every instruction, system-register access, stack-state fact, effect,
fault, and terminal edge comes from the ordinary generated target catalogs.

### Nested interrupts and DAIF policy

The `aarch64` profile keeps nested interrupts disabled while a frame is being
established or restored. Architectural exception entry supplies the initial
PSTATE/DAIF state in `SPSR_ELx`; the entry sequence preserves it but does not
clear DAIF or unmask IRQ, FIQ, SError, or debug exceptions while the frame is
live.

Any future nested-interrupt profile must allocate a distinct frame per nesting
level, define ownership of the interrupted stack, and state the exact DAIF
transition and barrier sequence before unmasking. The base `aarch64` profile
cannot be weakened locally to opt into nesting.

---

## 10.4 Historical v0.8 Removal Boundary

The released-v0.8 vector, vector-entry, and trap-frame directive spellings are
historical syntax only. Appendix B preserves them solely inside its explicitly
versioned v0.8 grammar snapshot, and the corresponding rows in
[`legacy-hash-removal-audit.tsv`](legacy-hash-removal-audit.tsv) record their
selected snapshot disposition. They are not aliases, migration forms, contextual tokens, or
inputs to current parser, formatter, diagnostic, editor, or code-generation
tables.

---
