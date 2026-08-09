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

Three built-in profiles add an exact firmware schema.

| Profile | Initial EL | Required root | Firmware `x0` |
| --- | ---: | --- | --- |
| `qemu-virt-aarch64-el2` | 2 | `pub naked fn _start(dtb: u64 in x0) -> never` | preserved entry parameter |
| `qemu-virt-aarch64-el2-lse` | 2 | `pub naked fn _start(dtb: u64 in x0) -> never` | preserved entry parameter |
| `qemu-virt-aarch64-el3` | 3 | `pub naked fn _start() -> never` | not an entry parameter |

For these profiles, the initial stack state is uninitialized.
The selected root must contain exactly one compiler-authorized stack transition.

The transition has this exact source shape:

```text
asm establishes stack (stack: u64 in x1 = VALUE) { mov sp, stack }
```

The transition has one `u64` input named `stack` in `x1`.
The assembly body contains only `mov sp, stack`.
The transition does not return a value and does not terminate control flow.

The compiler rejects `asm establishes stack` when the selected profile provides no entry transition.
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

pub naked fn _start(dtb: u64 in x0) -> never {
  asm establishes stack (
    stack: u64 in x1 = STACK_TOP,
  ) {
    mov sp, stack
  }

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

## Secure EL3 Entry

The secure EL3 profile requires a zero-parameter entry.
It assigns no entry-parameter meaning to `x0`.

<!-- wyst-contract: fmt -->
```wyst
module boot.el3

#target(arch = arm64-v8a, cpu = generic, el = 3)

import core.arch { cpu }

const STACK_TOP: u64 = 0x4010_0000

pub naked fn _start() -> never {
  asm establishes stack (
    stack: u64 in x1 = STACK_TOP,
  ) {
    mov sp, stack
  }

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

If the stack source is a visible constant, it must be 16-byte aligned.
The compiler also verifies the lowered transition against the selected layout entry.

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
