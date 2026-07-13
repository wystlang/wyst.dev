---
title: "Chapter 2: Wyst Target Descriptors"
group: chapter
chapter: 2
order: 2
summary: "Target facts, execution environments, and why runnability is explicit."
---

# Chapter 2: Wyst Target Descriptors

Wyst uses a layered target model for project builds and hardware/runtime work.

Runnable code depends on more than an ISA name. This chapter distinguishes
source-level `#requires` declarations, exact `#target` facts for target-bound
modules, project profiles, and full target descriptors.

## Thesis

A named ISA is not a complete machine contract. AArch64 code may share
instructions while differing in ABI, exception level, binary format, loader
rules, firmware or OS services, MMIO ranges, device protocols, signing, and
run/copy policy. Wyst target descriptors therefore separate target facts into
layers instead of flattening everything into one target string.

## Layers

| Layer                 | Owns                                                                      | Examples                                                                                            |
| --------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Host/tool             | Facts about the tool invocation and host-side providers.                  | Host OS, compiler version, helper tools, SDK discovery, generated-artifact provenance.              |
| ISA                   | Facts about instruction legality and microarchitectural estimates.        | `arm64-v8a`, CPU class, exact CPU when known, `lse`, cache-line width, scheduling/estimate table.   |
| Execution environment | Facts about how the binary is entered and what privileged services exist. | ABI, exception level, ELF/static image, loader contract, firmware calls, syscalls, privilege gates. |
| Platform/device       | Facts about declared hardware and protocol surfaces.                      | MMIO ranges, timers, interrupt controller, framebuffer, board memory map, generated bindings.       |

## Source Boundary

`#requires` is the reusable source-level declaration for target requirements a
module depends on. It states minimum or required capabilities, not a complete
machine selection. A reusable library should use `#requires(...)` when it needs
an ISA baseline, ISA feature, minimum exception level, or ABI capability.

<!-- wyst-contract: check-pass -->
```wyst
#module source_requirement_demo

#requires(arch = arm64-v8a, el = 1, abi = ( aapcs64 ))

spin_once :: () {
  %nop()
}
```

`#requires` accepts these source requirement fields:

| Field | Meaning |
| ----- | ------- |
| `arch` | Minimum architecture revision. `arm64-v8a` is the current implemented baseline. |
| `features` | Required ISA feature set, such as `lse` or `pmu`. |
| `el` | Minimum ARM Exception Level required by the module. A higher selected entry level is compatible. |
| `abi` | Required ABI capability set, currently `wyst-native` and `aapcs64`. |

Build-selection fields such as `cpu`, tuning model, object format, loader,
device map, platform services, and artifact handoff do not belong in
`#requires`. They are selected by a project profile, project manifest, or
future artifact configuration.

`#target` remains accepted for exact source-level target facts in target-bound
boot/runtime modules and compatibility source. It is optional for reusable
source: if a module omits exact target facts, project artifact builds must
supply artifact-affecting facts from `wyst.project`, while source-only and
loose-file checks may use compiler analysis defaults.

<!-- wyst-contract: check-pass -->
```wyst
#module target_demo

#target(arch = arm64-v8a, cpu = generic, el = 1)
```

The source declaration should stay compact. Larger platform and device facts
belong in target profiles, generated artifacts, standard-library modules, or
project manifests with stable provenance.

Compact source-level mapping facts may be stated when a module needs to expose
known architectural memory type ranges to diagnostics or reports:

<!-- wyst-contract: check-pass -->
```wyst
#module target_memory_demo

#target(arch = arm64-v8a, device_memory = (0x0900_0000..0x0900_1000))
```

`device_memory` records a target-provided fact that the named numeric range is
configured as Device memory by the selected platform/runtime. It does not come
from `@volatile T`, `@mmio T`, or any cast in source code; address qualifiers
describe compiler-visible access semantics and programmer intent, not the
page-table property.

A module has one exact target contract and one source requirement contract.
Multi-file modules may repeat `#target(...)` or `#requires(...)`, but repeated
declarations of the same construct must describe the same normalized
named-argument set; Wyst does not merge partial declarations.

## Project Profile Floor

Project builds bind source requirements and exact source target facts to named
target profiles, explicit project target facts, or both. If both profile and
explicit project facts are present, they must agree. If a module declares
`#requires(...)`, the selected project target must provide every required
capability. If a module declares `#target(...)`, it must be compatible with the
project target facts exactly, except that feature tuples remain subset-checked.
If it omits `#target(...)`, the project target facts act as semantic defaults.
Project artifact, evidence, and explain-report commands require an explicit
project target selection before final legality, layout, or emitted bytes are
computed; they do not silently consume EL, cache-line, feature, ABI, object
format, or loader defaults. Target reports record whether facts came from an
explicit profile/custom project facts, source requirements, permitted analysis
defaults, or unverified assumptions. Current project artifact reports must have
no unverified target assumptions.

The QEMU `virt` profile is:

```text
qemu-virt-aarch64-el2
```

It names the QEMU-oriented static ELF baseline: `arm64-v8a`, generic
CPU, EL2 entry, Wyst native ABI, static AArch64 ELF output, and existing
AAPCS64 interop support. Module-level `#requires(...)` declarations must be
satisfied, and module-level `#target(...)` declarations must be compatible with
the selected project profile when one is present.

The board-emulation profile is:

```text
qemu-raspi4b-aarch64-el2
```

It names QEMU's `raspi4b` machine with `arm64-v8a`, `cortex-a72`, EL2 entry,
static AArch64 ELF lowering, and a runner-owned flat `kernel8.img`-style
handoff artifact. The profile is intentionally scoped to QEMU board
emulation; it does not claim physical Raspberry Pi 4B hardware bring-up.

The full layered descriptor schema is outside the project-manifest surface.
See [chapter-03-project-builds.md](chapter-03-project-builds.md) for the project
manifest contract.

## Uses

Target descriptors may drive:

- feature gating for intrinsics and instruction forms;
- ABI and calling-convention checks;
- exception-level and privilege diagnostics;
- object-format and entry-contract selection;
- device/MMIO/protocol availability diagnostics;
- deterministic build and explain provenance;
- static latency/throughput estimates for reports.

Microarchitectural estimates are report inputs by default. They do not change
emitted code unless an explicit scheduling or optimization mode consumes them.

## Non-Goals

- Do not make UEFI, Linux, QEMU, or any board model core language semantics.
- Do not treat firmware, OS, or device protocols as portable source facts.
- Do not let target-specific timing counters become portable time semantics.
- Do not let profile data or PMU measurements silently rewrite source or
  emitted code.
