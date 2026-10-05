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

The compiler accepts only the profile names in this table.
The QEMU profiles select AArch64 revision `v8Ap0`. All profiles select the
`not_streaming` state.

| Profile | CPU | Entry EL | Supported ELs | Features | Security state |
| --- | --- | ---: | --- | --- | --- |
| `qemu-virt-aarch64-el1` | `generic` | 1 | 0, 1 | `base`, `fp_simd` | `non_secure` |
| `qemu-virt-aarch64-el2` | `generic` | 2 | 0, 1, 2 | `base`, `fp_simd` | `non_secure` |
| `qemu-virt-aarch64-el2-lse` | `generic` | 2 | 0, 1, 2 | `base`, `fp_simd`, `lse` | `non_secure` |
| `qemu-virt-aarch64-el3` | `generic` | 3 | 0, 1, 2, 3 | `base`, `el3`, `fp_simd` | `secure` |
| `qemu-raspi4b-aarch64-el2` | `cortex-a72` | 2 | 0, 1, 2 | `base`, `fp_simd` | `non_secure` |
| `apple-m1-ultra-m1n1-el2` | `generic` | 2 | 0, 1, 2 | `base`, `fp_simd`, `vhe` | `non_secure` |

The Apple profile selects the AArch64 `v8Ap1` instruction subset with VHE for
the M1 Ultra Mac Studio (`Mac13,2`) direct m1n1 entry. It authenticates the
entry and diagnostic operations below. It does not establish observed boot
state, memory ownership, device initialization, or a complete Apple kernel.

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

The Apple profile also selects `bare-aarch64`, with no environment service.
Its `apple-m1-ultra.platform-memory.v1` contract authenticates the
`AppleS5lUart` map at `0x3_9b20_0000`. It accepts a 32-bit readonly register
at offset `0x10` and a 32-bit writeonly register at offset `0x20`. The first
cell contains transmit-ready bit 1 and transmit-empty bit 2; the second accepts
a transmit byte. Admission may read five 32-bit configuration cells: line
control at `0x00`, control at `0x04`, FIFO control at `0x08`, baud divisor at
`0x28`, and fractional divisor at `0x2c`. Their write directions remain denied.
Other directions, widths, cells, and integer-derived MMIO addresses are not
authorized. Source supplies finite polling and preserves the loader's UART
configuration. The contract also selects the exact VHE entry register accesses
listed in [A64 Compiler Semantics](a64-compiler-semantics.md). Translation
writes are limited to `HCR_EL2`, `SCTLR_EL12`, `TCR_EL12`, `TTBR0_EL12`,
`TTBR1_EL12`, `MAIR_EL12`, and the EL1 `SCTLR`, `TCR`, `TTBR0`, `TTBR1`,
and `MAIR` accessors. Cache and TLB maintenance is limited to DC CVAC, DC CIVAC,
IC IALLU, TLBI VMALLE1, and TLBI VAAE1. Native-word authentication enforces the
exact set; the shared I-cache surface cannot grant another scope. Source owns
the typed table range, 64-byte stride, publication and completion barriers. This contract supplies no DMA,
reset, clock, or interrupt-controller mechanism. Source owns the VHE/no-EL3
runtime checks and the transition protocol.

All three platform-memory contracts contain compiler-known MMIO ranges.
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
control or compare registers, virtual timer reads, or encoded declarations.
The exact `CNTV_CTL_EL0` write accessor permits masking the unused virtual timer
on secondary entry.

Its GIC MMIO surface binds register maps `GicDistributor` at `0x0800_0000`
and `GicRedistributor` at `0x080a_0000`. It lists only the fixed cells used by
the kernel: distributor `CTLR`, `TYPER`, `ICENABLER1` through `ICENABLER8`, and
`PIDR2`; redistributor `CTLR`, `TYPER`, `WAKER`, `IGROUPR0`, `ISENABLER0`,
`ICENABLER0`, `IPRIORITYR0`, `IPRIORITYR7` at full redistributor offset
`0x1041c`, and `ICFGR1` at full redistributor offset `0x10c04`. Other cells do
not receive MMIO authority.

The fixed secondary bindings use `GicRedistributor` at `0x080c_0000`,
`0x080e_0000`, and `0x0810_0000`. Each 128 KiB pair permits read-only 64-bit
`TYPER` at offset `0x8`, read-only 32-bit `CTLR` at `0`, read/write 32-bit
`WAKER` at `0x14`, and write-only 32-bit `ICENABLER0` at `0x10180`.
Addressed SGI delivery also permits read/write 32-bit `IGROUPR0` at `0x10080`
and `IPRIORITYR0` at `0x10400`, and write-only 32-bit `ISENABLER0` at `0x10100`.
Local physical timers also permit read/write 32-bit `IPRIORITYR7` at
`0x1041c` and `ICFGR1` at `0x10c04`. These cells support identity checks, local
initialization, SGI 1, and PPI 30. Other secondary cells and a fifth
redistributor have no platform authority.
Source must check the live affinity and last-frame fields before admission.

The four QEMU `virt` profiles use `semihost-service-or-terminal` exit policy.
The Raspberry Pi 4B QEMU profile uses `terminal-only` exit policy.
The Apple profile also uses `terminal-only`.

## Entry Policies

The profiles use these entry ABI facts:

| Profile group | Entry ABI | Compiler-owned firmware schema |
| --- | --- | --- |
| QEMU `virt` EL1 | `wyst-native-zero-parameter` | none |
| QEMU `virt` EL2 and EL2 LSE | `wyst-native-dtb-x0` | DTB parameter in `x0` |
| QEMU `virt` EL3 | `wyst-native-noargs` | zero parameters |
| Raspberry Pi 4B QEMU EL2 | `wyst-native-zero-parameter` | none |
| Apple M1 Ultra m1n1 EL2 | `wyst-native-m1n1-x0-x3` | DTB in `x0`; raw `x1`, `x2`, `x3` |

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
