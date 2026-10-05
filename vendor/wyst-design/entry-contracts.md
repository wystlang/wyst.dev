---
title: "Entry Contracts"
group: reference
section: projects-targets
order: 330
summary: "Compiler-validated layout entry and firmware entry contracts."
---

# Entry Contracts

A named layout selects the first code declaration for an executable artifact.
The compiler validates that declaration before backend emission.

This reference defines only compiler-validated entry rules.
It does not define firmware setup or platform initialization procedures.

## Common Layout Entry Rules

Every selected layout entry must meet these rules:

- The entry must name a function or label with a body.
- The entry must use the Wyst Native calling convention.
- The entry must return `never`.
- The entry must not declare a result register.
- The entry must admit the target profile entry level.

If the profile has no firmware schema, the entry must have no parameters.
The generic entry rules do not require a specific name, visibility, or `naked` attribute.

These profiles use only the generic entry rules:

- `qemu-virt-aarch64-el1`
- `qemu-raspi4b-aarch64-el2`

The selected layout syntax is defined in
[Named Layouts and Placement](named-layouts-and-placement.md).
Project layout selection is defined in [Project Builds](project-builds.md).

## Compiler-Owned Firmware Schemas

Four built-in profiles add an exact firmware schema.

| Profile | Initial EL | Required root | Firmware `x0` |
| --- | ---: | --- | --- |
| `qemu-virt-aarch64-el2` | 2 | `naked fn _start(dtb: u64 in x0) -> never` | preserved entry parameter |
| `qemu-virt-aarch64-el2-lse` | 2 | `naked fn _start(dtb: u64 in x0) -> never` | preserved entry parameter |
| `qemu-virt-aarch64-el3` | 3 | `naked fn _start() -> never` | not an entry parameter |
| `apple-m1-ultra-m1n1-el2` | 2 | `naked fn _start(dtb: u64 in x0, arg1: u64 in x1, arg2: u64 in x2, arg3: u64 in x3) -> never` | preserved entry parameter |

Entry selection makes the declaration an artifact root. Source visibility is
not part of the firmware contract. An entry can be private or public without
changing its target ABI or native linker identity.

For these profiles, the initial stack state is uninitialized.
The selected root must contain exactly one compiler-authorized stack transition.

The transition has this exact source shape:

```text
establish stack from VALUE
```

`VALUE` must have type `u64`. The compiler lowers it through the profile-owned
input placement and exact stack-pointer write. The transition does not return a
value and does not terminate control flow.

The compiler rejects `establish stack from VALUE` when the selected profile
provides no entry transition.
Other body-bearing naked functions can use the same profile-owned transition
for source-managed entries. Each transition retains the exact input placement,
stack write, and stackless-prefix checks. Source owns the runtime stack extent,
identity checks, and entry publication. This does not add a firmware ABI or
make an ordinary function a stack owner.
Trap-frame entry clauses use separate rules.
See [AArch64 Exception Vectors and Trap Frames](exception-vectors-and-trap-frames.md).

## EL2 DTB Entry

The EL2 and EL2 LSE profiles require the same entry shape.
Only their available feature sets differ.

<!-- wyst-contract: fmt -->
```wyst
module boot.el2

#target(arch = arm64-v8a, cpu = generic, el = 2)

import core.arch { cpu }

const STACK_TOP: u64 = 0x4010_0000

naked fn _start(dtb: u64 in x0) -> never {
  establish stack from STACK_TOP

  loop {
    cpu.wfe()
  }
}
```

The parameter name, type, and register placement are exact.
The stack transition preserves the firmware value in `x0`.
The compiler does not interpret the DTB contents.

The source can use `dtb` after the stack transition.
Later code must preserve any value that it still needs.

## Apple m1n1 Entry

The Apple profile exposes the four raw handoff words as the exact parameters
listed above. It does not assume that `x1`, `x2`, and `x3` contain zero; a
contract witness can observe those values. The stack transition uses `x9`
instead of the QEMU transition's `x1`, preserving all four live parameters.

Before stack establishment, this profile permits a `u64` local with an explicit
register pin whose initializer is `cpu.read_stack_pointer()` or the `.raw`
result of an authenticated `system_register` read from a `readonly` or
`readwrite` declaration. These operations retain scalar entry facts without
using the incoming stack. Other local initializers, pointer-based memory, calls, and
register spills remain invalid in this state. Normal register-conflict checks
still apply.

```text
var entry_sp: u64 in x19 = cpu.read_stack_pointer()
var entry_spsel: u64 in x20 = SPSel.read().raw
var entry_daif: u64 in x21 = DAIF.read().raw
establish stack from __stack_top
```

The transition writes SP through the profile's scratch register. It does not
write SPSel, DAIF, or translation controls. A witness must retain incoming SP
before this transition. It can read unchanged control registers afterward,
before source writes those controls.

## Secure EL3 Entry

The secure EL3 profile requires a zero-parameter entry.
It assigns no entry-parameter meaning to `x0`.

<!-- wyst-contract: fmt -->
```wyst
module boot.el3

#target(arch = arm64-v8a, cpu = generic, el = 3)

import core.arch { cpu }

const STACK_TOP: u64 = 0x4010_0000

naked fn _start() -> never {
  establish stack from STACK_TOP

  loop {
    cpu.wfe()
  }
}
```

Adding a parameter violates this profile entry schema.
Using the EL2 DTB entry shape also violates the schema.

## Stack Transition Checks

Before the stack transition, a `naked` function has unknown stack state.
The compiler rejects ordinary calls and stack-dependent statements in that state.

The exact transition changes the checked stack state to aligned.
The compiler can then check ordinary statements under the established stack contract.

A later nonreturning path can use `relocate stack alias by VALUE` to move an
established AArch64 stack once to an authenticated virtual alias. `VALUE` must
be a nonzero, 16-byte-aligned constant in the lower 42-bit range. This
operation also accepts a direct named layout `u64` symbol, with its bounds
checked after final placement. It is not a firmware-entry transition. The platform must prove that the
addition does not wrap and that the old and new canonical ranges name the same
storage while the compiler adjusts `sp` and clears the frame pointer.

If the stack source is a visible constant, it must be 16-byte aligned.
The compiler also verifies each lowered transition against its naked owner and
the selected profile. The layout entry still requires exactly one transition.

Checked assembly syntax is in [Checked Assembly](checked-assembly.md).
Naked-code rules are in [Functions and Control Flow](functions-and-control-flow.md).
Calling-convention stack rules are in [ABI Specification](abi.md).

## Contract Boundary

The compiler entry contract does not define these platform tasks:

- reset-register contents beyond the selected entry schema;
- exception-vector installation;
- Exception Level transitions after entry;
- BSS initialization;
- cache or TLB maintenance;
- UART or other device initialization; or
- secondary-CPU startup.

Source must implement required platform tasks with supported language operations.
See [Semantic Operations and Hardware Declarations](semantic-operations.md) for current machine operations.
