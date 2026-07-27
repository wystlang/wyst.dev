---
title: "Chapter 2: Wyst Target Descriptors"
group: chapter
chapter: 2
order: 2
summary: "Target facts, execution environments, and why runnability is explicit."
---

# Chapter 2: Wyst Target Descriptors

Wyst uses a layered target model for project builds and hardware/runtime work.
A named ISA is not a complete description of a runnable program: ABI, entry
state, privilege, layout, environment services, and device facts also affect
what the compiler may accept and emit.

The compiler source defines the target profiles described by these docs.

## Layers

| Layer | Owns | Examples |
| ----- | ---- | -------- |
| Host/tool | Facts about the current tool invocation. | Host OS, helper tools, SDK discovery. |
| ISA | Instruction legality and target-specific lowering facts. | `arm64-v8a`, CPU class, `lse`, cache-line width. |
| Execution environment | How a binary is entered and which runtime services exist. | Entry ABI, layout owner, privilege, unwind, panic/exit, environment services. |
| Platform/device | Declared hardware and protocol surfaces. | MMIO ranges, timers, interrupt controllers, board memory maps. |

These layers remain separate so that architecture support does not silently
claim firmware, OS, loader, or device support.

## Source Boundary

`#requires` is the reusable source-level declaration for target capabilities a
module needs. It states minimum requirements, not a complete machine
selection.

<!-- wyst-contract: check-pass -->
```wyst
module source_requirement_demo

import core.arch { cpu }

#requires(arch = arm64-v8a, el = 1, abi = ( aapcs64 ))

fn spin_once() {
  cpu.nop()
}
```

`#requires` accepts:

| Field | Meaning |
| ----- | ------- |
| `arch` | Minimum architecture revision. |
| `features` | Required ISA features such as `lse` or `pmu`. |
| `el` | Minimum ARM Exception Level. |
| `abi` | Required ABI capabilities, currently `wyst-native` and `aapcs64`. |

Build-selection facts such as CPU tuning, object format, loader, device map,
environment services, and artifact handoff do not belong in `#requires`.

`#target` supplies exact source-level target facts for target-bound
boot/runtime modules. Reusable source may omit it; project builds then obtain
the target facts from the selected project profile.

<!-- wyst-contract: check-pass -->
```wyst
module target_demo

#target(arch = arm64-v8a, cpu = generic, el = 1)
```

Compact source-level device-memory facts may also be stated:

<!-- wyst-contract: check-pass -->
```wyst
module target_memory_demo

#target(arch = arm64-v8a, device_memory = (0x0900_0000..0x0900_1000))
```

`device_memory` says the selected platform/runtime configures the range as
Device memory. Address qualifiers such as `@volatile T` and `@mmio T` describe
compiler-visible access semantics; they do not create page-table facts.

A module has one normalized `#target` declaration and one normalized
`#requires` declaration. Multi-file modules may repeat either declaration only
when every repetition is identical. Wyst does not merge partial declarations.

## Project Profiles

A project target profile is the sole manifest selection for target facts. The
selected profile directly supplies:

- architecture, CPU, features, ABI, and entry level;
- layout ownership and entry/root rules;
- privilege, import, TLS, unwind, panic, and exit policies;
- the executable environment and its offered services;
- measurement-counter source selection; and
- any target entry shape required by the selected profile.

These definitions are ordinary compiler-owned data. Validation, semantic
analysis, typed IR, lowering, diagnostics, and reports all consume the same
resolved profile. There is no second extension registry or authenticated
packaging layer to keep in sync.

If source declares `#requires`, the selected profile must provide every
required capability. If source declares `#target`, it must agree with the
profile, except that feature tuples are subset-checked. If source omits
`#target`, the profile supplies the exact target facts.

The layout owner is not a Boolean. Executable, benchmark, and fixture artifacts
use exactly one of:

- `layout NAME from "PATH"` when layout belongs to the artifact; or
- `layout .environment` when layout belongs to the environment.

Static libraries have no entry or layout selection.

### Current built-in profiles

The current profiles are:

```text
qemu-virt-aarch64-el1
qemu-virt-aarch64-el2
qemu-virt-aarch64-el2-lse
qemu-virt-aarch64-el3
qemu-raspi4b-aarch64-el2
```

The QEMU `virt` profiles target static AArch64 ELF at their named entry level
and offer the semihost service used by `core.environment.semihost`.
`qemu-virt-aarch64-el2-lse` additionally selects `lse`; the baseline EL2
profile does not acquire LSE merely because the compiler can encode it.

The EL2 profiles require a never-returning Wyst Native entry with exactly
`dtb: @u8 in x0`, an initially uninitialized stack, and the checked
`mov sp, stack` transition using `x1`.

The EL3 profile requires a secure, zero-parameter, never-returning entry and the
same checked stack transition. It does not provide a DTB parameter in `x0`.

The `raspi4b` profile targets QEMU board emulation with a `cortex-a72`, EL2
entry, and runner-owned `kernel8.img`-style handoff. It offers no semihost
service and does not claim physical Raspberry Pi hardware support.

## Execution Environment

The resolved execution environment is typed current compiler data:

- an environment class;
- zero or more execution-provider descriptors;
- zero or more completion-provider descriptors;
- retained-strand migration policy;
- asynchronous-preemption resume policy;
- current-core policy; and
- `per_cpu` policy.

The current classes are:

| Class | Meaning |
| ----- | ------- |
| `freestanding_privileged` | Privileged kernels and bare-metal images. |
| `hosted_systems` | Programs using an existing hosted execution system. |

Current built-in profiles select `freestanding_privileged`, have no execution
or completion provider, forbid retained-strand migration, resume asynchronous
preemption on the same core, and invalidate/reacquire current-core and
`per_cpu` state after a suspension boundary.

The compiler's synthetic provider test target selects `hosted_systems` plus:

- execution provider `synthetic.execution-provider`;
- completion provider `synthetic.completion-provider`;
- provider leaf `synthetic.execution.provider_leaf`; and
- adjacent transfer operation `synthetic.checked_context_switch`.

`execution.suspension_point()` is legal only in that selected provider leaf and
must immediately precede the selected transfer. Typed IR retains the target,
environment class, provider, leaf, and transfer identities so the verifier can
detect accidental or fabricated marker changes. No product version or digest
is needed to prove those relationships.

The source-local
`#target(per_cpu = single_instance_tpidr_el1)` realization is separate from the
environment selection. When present, it must agree with the selected
environment's `per_cpu` policy.

## Environment Services

An environment has a closed set of service descriptors. Importing a sealed
`core.environment` module records the descriptor it requires; project builds
reject the import when the selected environment does not offer it. Merely
supporting an architecture instruction does not imply the corresponding
environment service.

The QEMU `virt` profiles select environment `qemu-aarch64-semihost`, which
offers `a64-semihost-hlt-f000`. The `raspi4b` profile selects
`bare-aarch64`, whose offer set is empty.

## Measurement Counter Selection

Every current built-in profile explicitly selects measurement-counter source
`a64-generic-virtual-counter` for `cpu.read_counter()`. Architecture,
CPU, and `pmu` feature facts do not imply this selection.

The source descriptor defines:

- the semantic read and exact lowering;
- result width and wrapping behavior;
- the frequency-acquisition path;
- minimum EL and enablement requirements;
- failure behavior.

This descriptor selection is compile-time capability data only. The compiler
does not model launch records, measurement epochs, runtime evidence universes,
trust anchors, lifecycle state machines, or numeric elapsed-time claims.
Two counter reads are simply two raw samples. Width-aware subtraction produces
a modular tick delta; it is not automatically elapsed time, latency, or
seconds.

## Uses

Target descriptors drive:

- feature gating for intrinsics and instruction forms;
- ABI, entry, exception-level, and privilege checks;
- object-format and layout selection;
- environment-service availability;
- device/MMIO diagnostics;
- counter-source legality; and
- current lowering and explain-report facts.

Microarchitectural estimates are report inputs by default. They do not change
emitted code unless an explicit optimization or scheduling policy consumes
them.

## Non-Goals

- Do not make UEFI, Linux, QEMU, or a board model core language semantics.
- Do not treat firmware, OS, or device protocols as portable source facts.
- Do not let target-specific counters become portable time semantics.
- Do not infer runtime services from ISA support.
- Do not let profile data or measurements silently rewrite source or emitted
  code.

The project manifest surface is described in
[chapter-03-project-builds.md](chapter-03-project-builds.md).
