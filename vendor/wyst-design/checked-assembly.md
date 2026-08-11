---
title: "Checked Assembly"
group: reference
section: memory-machine
order: 250
summary: "Typed assembly binders, inferred machine effects, retention, alignment, and control transfer."
---

# Checked Assembly

Checked `asm` uses typed signature binders and a physical instruction body.
The selected AArch64 source catalog defines accepted instruction lines.

[Functions and Control Flow](functions-and-control-flow.md) defines naked functions,
labels, and explicit register placement. [ABI Specification](abi.md) defines
boundary placement and register ownership.

<!-- wyst-contract: check-pass -->
```wyst
module functions.checked_asm

#target(arch = arm64-v8a, cpu = generic, el = 2)

fn identity(input: u64) -> u64 {
  return asm (
    value: u64 in x9 = input,
  ) -> value {
    nop
  }
}
```

The compiler derives effects, clobbers, and ordinary stack preservation from
the selected, typed instruction rows. This keeps source claims from disagreeing
with the machine operations the compiler will actually emit.

An `asm` expression with normally returned values is treated as effect-free only
when every reachable instruction is cataloged as eligible, the local control
flow is normally returning and acyclic, and the block has no terminal or
machine-state effect. Otherwise it remains an effectful assembly expression.

An effect-free `asm` statement with no result would have no observable purpose,
so it is rejected. Write `asm retained` when the occurrence itself must remain:

<!-- wyst-contract: check-pass -->
```wyst
module functions.retained_asm

fn instruction_boundary() {
  asm retained {
    nop
  }
}
```

`retained` is a retention requirement, not an effect assertion. It prevents
elimination and preserves the source occurrence even when the instruction rows
are otherwise effect-free. It must appear immediately after `asm`.

Use `#[align(N)]` after optional `retained` to align the first emitted
instruction of the block:

```text
asm retained #[align(16)] (parameters...) -> results... {
  instructions
}
```

`N` must be a supported positive power-of-two constant. Alignment does not
retain an otherwise removable computation. The spelling is the same attribute
syntax used on declarations, but its subject here is the first instruction in
this assembly block. It is unrelated to `#align_of(T)`, which is a compile-time
query for a type's ABI alignment.

An assembly signature can contain these parameter forms:

```text
name: Type in Register? = expression
name in Register? = expression
name: imm = constant_expression
name: symbol = declaration.path
scratch name: Type in Register?
```

Omit an empty parameter list.
The body uses binder names instead of surrounding source names.
A direct branch or call uses a `symbol` binder.
The compiler derives register and state effects from instruction rows.
There is no manual clobber list.

Callable `effects(...)` are function contracts and follow the complete return
clause without a comma:

```text
fn sample() -> u64 effects(none)
```

Inferred assembly effects contribute to the enclosing function and must fit any
explicit callable effect bound.

A bare result name ties the result to an ordinary input binder.
A typed result creates a fresh value.
Parenthesized results require at least two values.
Use `-> never` when the body has no normal exit.

A statement-only block must have a reachable normal exit.
A statement-only block whose reachable instructions are effect-free must use
`retained`.
A value block must establish each result on every normal exit.
An `asm -> never` block must not have a reachable normal exit.

Ordinary checked assembly must preserve `sp`; the compiler verifies this from
the authenticated instruction semantics. Stack and trap-frame transitions use
first-class statements:

```text
establish stack from VALUE
establish frame
restore frame
```

`establish stack from VALUE` is the compiler-owned entry transition authorized
by a target profile. `establish frame` and terminal `restore frame` are valid
only in their matching target-checked trap-frame labels. Source never spells
the generated physical save, restore, or `mov sp` sequence.

An external `b` is a typed tail transfer. Its symbol binder must name a
function that returns `never`. The assembly signature must bind every target
parameter to its exact ABI register. The branch does not create call-clobber
writes and has no normal successor.

A tail transfer before stack establishment can target only a naked function.
This rule lets an image-header entry branch to the real naked entry without
inventing a usable incoming stack. A returning target, data symbol, code label,
missing register binder, nonzero addend, or non-naked pre-stack target is an
error.

The final instruction or local-label line must end with a newline before `}`.
The checker validates local branches, register use, instruction effects, and control transfer.
