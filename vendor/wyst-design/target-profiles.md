---
title: "Target Profiles and Requirements"
group: reference
section: projects-targets
order: 300
summary: "Current source target facts and the closed built-in target profiles."
---

# Target Profiles and Requirements

A target profile is a compiler-owned set of machine and environment facts.
A project or command selects one built-in target profile.

Target profiles control semantic checks, instruction availability, layout policy, entry rules, and artifact emission.
See [Project Builds](project-builds.md) for target selection.

## Source Requirements

`#requires` states the minimum capabilities that a source module needs.
It does not select a complete target profile.

<!-- wyst-contract: check-pass -->
```wyst
module target.requirements

#requires(arch = arm64-v8a, el = 1, abi = ( aapcs64 ))

fn identity(value: u64) -> u64 {
  return value
}
```

`#requires` accepts these fields:

| Field | Rule |
| --- | --- |
| `arch` | The value must be `arm64-v8a`. |
| `features` | Each named AArch64 feature must be available in the selected profile. |
| `el` | The selected profile entry level must be at least this value. |
| `abi` | Each capability must be `wyst-native` or `aapcs64`. |

The compiler rejects `cpu`, `cache_line`, `device_memory`, and `per_cpu` in `#requires`.
These fields are build selections or exact target facts.

## Exact Source Target Facts

`#target` states exact source facts for a target-bound module.
If a module omits `#target`, the selected project profile supplies target facts.
An explicit fact must agree with the selected profile.
An explicit feature list can select only features from that profile.

<!-- wyst-contract: check-pass -->
```wyst
module target.exact

#target(arch = arm64-v8a, cpu = generic, el = 2)

fn identity(value: u64) -> u64 {
  return value
}
```

`#target` accepts these fields:

| Field | Accepted values |
| --- | --- |
| `arch` | `arm64-v8a` |
| `cpu` | `generic` or `cortex-a72` |
| `el` | `0`, `1`, `2`, or `3` |
| `cache_line` | A positive power of two |
| `features` | A tuple of current compiler-known AArch64 features |
| `device_memory` | One or more nonempty address ranges |
| `per_cpu` | `single_instance_tpidr_el1` |

`per_cpu` requires EL1 or higher.
It also requires a compatible selected execution environment.

A module can repeat `#target` only with identical normalized arguments.
The same rule applies to repeated `#requires` declarations.
The compiler does not merge different declarations.

Address qualifiers do not configure hardware memory attributes.
See [Memory Model](memory-model.md) for address and MMIO rules.

Each placed register-map instance retains the target requirements and exact
platform-mapping identity that authenticated its declaration. Combining target
requirements during project construction must preserve every possible
placement origin. A final artifact rejects an imported or selected instance
whose origin is incompatible with the chosen profile; equal numeric bases do
not make two platform mappings interchangeable.

## Built-In Target Profiles

The compiler accepts only the five profile names in this table.
All five profiles select AArch64 revision `v8Ap0` and the `not_streaming` state.

| Profile | CPU | Entry EL | Supported ELs | Features | Security state |
| --- | --- | ---: | --- | --- | --- |
| `qemu-virt-aarch64-el1` | `generic` | 1 | 0, 1 | `base`, `fp_simd` | `non_secure` |
| `qemu-virt-aarch64-el2` | `generic` | 2 | 0, 1, 2 | `base`, `fp_simd` | `non_secure` |
| `qemu-virt-aarch64-el2-lse` | `generic` | 2 | 0, 1, 2 | `base`, `fp_simd`, `lse` | `non_secure` |
| `qemu-virt-aarch64-el3` | `generic` | 3 | 0, 1, 2, 3 | `base`, `el3`, `fp_simd` | `secure` |
| `qemu-raspi4b-aarch64-el2` | `cortex-a72` | 2 | 0, 1, 2 | `base`, `fp_simd` | `non_secure` |

The secure EL3 profile supports `non_secure` and `secure` security states.
The other profiles support only `non_secure`.

All profiles provide these common facts:

| Fact | Value |
| --- | --- |
| Source architecture | `arm64-v8a` |
| ABI capabilities | `wyst-native`, `aapcs64` |
| Layout owner | `artifact` |
| Root ABI | `wyst-module-root` |
| Root return policy | `never` |
| Admission policy | `freestanding-authenticated-a64` |
| Dynamic imports | `forbidden` |
| TLS | `forbidden` |
| Unwind policy | `dwarf-cfi-static-elf` |
| Panic policy | `source-defined-terminal` |
| Environment class | `freestanding_privileged` |
| Execution providers | none |
| Completion providers | none |
| Retained-strand migration | `forbidden` |
| Asynchronous-preemption resume | `same_core` |
| Current-core policy | `invalidate_and_reacquire_after_boundary` |
| `per_cpu` policy | `invalidate_and_reacquire_after_boundary` |
| Measurement counter | `a64-generic-virtual-counter` |

Executable, benchmark, and fixture artifacts must use an artifact-owned named layout.
Static-library artifacts do not accept a layout clause.
See [Project Builds](project-builds.md).

## Profile Environments

The QEMU `virt` profiles select environment `qemu-aarch64-semihost`.
This environment offers service `a64-semihost-hlt-f000`.
It selects platform-memory contract `qemu-virt.platform-memory.v1`.

The Raspberry Pi 4B QEMU profile selects environment `bare-aarch64`.
This environment offers no environment service.
It selects platform-memory contract `raspi4b.platform-memory.v1`.

Both platform-memory contracts contain compiler-known MMIO ranges.
They do not prove source-defined cache, translation, or DMA protocols.
See [Memory Model](memory-model.md) and [Semantic Operations and Hardware Declarations](semantic-operations.md).

The QEMU `virt` contract also authenticates the physical GICv3 CPU interfaces
needed by the kernel. The closed GIC system-register set is `ICC_SRE_EL1` read
and write, `ICC_PMR_EL1` write, `ICC_BPR1_EL1` write, `ICC_CTLR_EL1` read and
write, `ICC_IGRPEN1_EL1` write, `ICC_IAR1_EL1` read, `ICC_EOIR1_EL1` write,
`ICC_SGI1R_EL1` write, and `ICC_SRE_EL2` read and write. The `ICC_SRE_EL2`
entries require EL2. Each entry binds one generated accessor identity,
encoding, direction, and minimum exception level. The contract does not
authenticate `ICC_DIR_EL1`, virtual `ICV_*` accessors, or encoded declarations.

The same contract authenticates only the canonical `CNTP_CTL_EL0` read and
write and `CNTP_CVAL_EL0` write needed by the physical generic timer. These
exact predicate-resolved accessors disambiguate conditional architectural
aliases. The selected target feature closure must still satisfy each accessor
predicate. The contract does not authenticate `CNTP_CVAL_EL0` read, other timer
control or compare registers, virtual timer accessors, or encoded declarations.

Its GIC MMIO surface binds register maps `GicDistributor` at `0x0800_0000`
and `GicRedistributor` at `0x080a_0000`. It lists only the fixed cells used by
the kernel: distributor `CTLR`, `TYPER`, `ICENABLER1` through `ICENABLER8`, and
`PIDR2`; redistributor `CTLR`, `TYPER`, `WAKER`, `IGROUPR0`, `ISENABLER0`,
`ICENABLER0`, `IPRIORITYR0`, `IPRIORITYR7` at full redistributor offset
`0x1041c`, and `ICFGR1` at full redistributor offset `0x10c04`. Other cells do
not receive MMIO authority.

The four QEMU `virt` profiles use `semihost-service-or-terminal` exit policy.
The Raspberry Pi 4B QEMU profile uses `terminal-only` exit policy.

## Entry Policies

The profiles use these entry ABI facts:

| Profile group | Entry ABI | Compiler-owned firmware schema |
| --- | --- | --- |
| QEMU `virt` EL1 | `wyst-native-zero-parameter` | none |
| QEMU `virt` EL2 and EL2 LSE | `wyst-native-dtb-x0` | DTB parameter in `x0` |
| QEMU `virt` EL3 | `wyst-native-noargs` | zero parameters |
| Raspberry Pi 4B QEMU EL2 | `wyst-native-zero-parameter` | none |

[Entry Contracts](entry-contracts.md) defines the compiler-validated entry contracts.

## Target Use

The compiler uses resolved target facts for these tasks:

- validate source requirements and exact source facts;
- gate AArch64 instruction forms and semantic operations;
- check execution levels and security state;
- select ABI and entry rules;
- select environment services and platform-memory facts;
- select the measurement-counter descriptor; and
- select layout and artifact policies.

Architecture instruction support does not provide an environment service.
A source import must match a service offered by the selected environment.
