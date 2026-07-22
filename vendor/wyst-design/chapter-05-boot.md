---
title: "Chapter 5: Wyst Boot Entry Contract"
group: chapter
chapter: 5
order: 5
summary: "First runnable program shape, boot entry assumptions, and early runtime setup."
---

# Chapter 5: Wyst Boot Entry Contract

> **Canonical scope.** A complete UART hello-world example end-to-end
> followed by the boot entry contract for QEMU `virt`: reset
> state, the secure EL3 direct-ELF handoff, implications, the EL2 → EL1 drop
> with vector install, BSS zero, DTB preservation, and the secondary-CPU PSCI
> `CPU_ON` example.
> Exception vectors live in
> [chapter-14-exception-vectors.md](chapter-14-exception-vectors.md); qualified
> exception operations (`exception.svc`, `.hvc`, and `.eret`) live in
> [chapter-11-intrinsics.md](chapter-11-intrinsics.md).

The UART example is a complete program illustrating the boot-entry shape. The
EL transitions, exception vectors, and SMP recipe depend on the machine
primitive and exception-vector contracts linked above.

---

### Checked Entry Skeleton

The minimal boot-entry shape is a no-return `_start` symbol:

<!-- wyst-contract: check-pass -->
```wyst
module boot

import core.arch { cpu }

fn _start() -> never {
  loop {
    cpu.wfe()
  }
}
```

### QEMU EL2 UART sketch

The `qemu-virt-aarch64-el2` and `qemu-virt-aarch64-el2-lse` profiles
authenticate the firmware DTB in `x0` and the checked `mov sp` initialization
transition. Their selected layout entry must use this shape; the compiler
rejects any partial or source-invented variant before emitting an artifact.

<!-- wyst-contract: sketch -->
```wyst
module boot.hello

import core.arch { cpu }

target(arch = arm64-v8a, cpu = generic, el = 2)

const UART0_BASE: u64 = 0x09_00_00_00
const UARTDR: @volatile u32 = UART0_BASE + 0x00
const UARTFR: @volatile u32 = UART0_BASE + 0x18
const TXFF: u32 = 1 << 5
const STACK_TOP: u64 = 0x4010_0000

fn uart_write(byte: u8) {
  while UARTFR.load() & TXFF != 0 {
    cpu.nop()
  }
  UARTDR.store(widen<u32>(byte))
}

fn uart_print(msg: string) {
  const base: @u8 = msg.data
  var i: u64 = 0
  while i < msg.len {
    uart_write(byte_offset(base, i).load())
    i += 1
  }
}

pub naked fn _start(dtb: @u8 in x0) -> never {
  asm establishes stack (
    stack: u64 in x1 = STACK_TOP,
  ) {
    mov sp, stack
  }
  uart_print("Hi!\n")
  loop {
    cpu.wfe()
  }
}
```

`establishes stack` is a stack-state verifier contract, not a
`#[deny_effects(...)]` effect category. The instruction catalog derives the
block's effects, while the separate stack verifier proves that the stack
pointer is initialized from the aligned `stack` input in `x1`. That exact
instruction has no `x0` write, so the original `dtb` value remains available
for the direct call after stack initialization.

### QEMU secure EL3 direct-ELF sketch

`qemu-virt-aarch64-el3` is a separate secure direct-ELF profile, not an EL2
DTB-entry alias. It authenticates schema identity
`qemu-virt-aarch64-el3-noargs-v1`, entry ABI `wyst-native-noargs-v1`, secure
initial EL3, and exactly this zero-parameter root shape:

<!-- wyst-contract: sketch -->
```wyst
pub naked fn _start() -> never {
  asm establishes stack (
    stack: u64 in x1 = __stack_top,
  ) {
    mov sp, stack
  }
  firmware_main()
}
```

The checked block is the root's one admitted transition from an uninitialized
stack. This canonical fixture calls `firmware_main()` directly after it; the
callee name is runtime evidence and is not hardcoded by the compiler's entry
schema. The profile gives `x0` no entry-parameter meaning and authenticates no
DTB; adding a parameter or substituting either EL2 schema is a pre-artifact
error. The direct ELF still selects executable environment
`qemu-aarch64-semihost-v1`, whose closed offer is
`a64-semihost-hlt-f000-v1`. Source that imports
`core.environment.semihost` therefore records that exact service requirement,
which runner preflight must satisfy before launch.

---

### Boot Entry Contract

The reset state of an ARMv8-A CPU is platform-defined. This part
specifies the contract Wyst assumes for the QEMU `virt` machine (the
canonical development target) and provides a worked example of a
minimal EL2-to-EL1 drop with vector-table installation.

Programmers targeting real silicon must consult their platform's
firmware/bootloader contract and adapt; the structure of the boot code
is similar, but specific register values differ.

---

### QEMU `virt` EL2 Reset State

The following table belongs to the EL2 DTB handoff and is not inherited by the
secure EL3 direct-ELF profile. On EL2 entry to the kernel image loaded via
`qemu-system-aarch64 -machine virt`:

| Item              | State at entry                                                                    |
| ----------------- | --------------------------------------------------------------------------------- |
| Exception Level   | EL2 (unless `-machine virtualization=off`, then EL1)                              |
| PSTATE            | `EL2h`, DAIF = 1111 (all interrupts masked)                                       |
| `x0`              | physical address of FDT (DTB) blob in RAM                                         |
| `x1` – `x3`       | 0                                                                                 |
| `x4` – `x30`      | undefined                                                                         |
| `sp`              | **undefined** — must be initialized before any stack operation                    |
| `pc`              | entry address as configured by `-kernel` (typically the image load address)       |
| MMU               | disabled (`SCTLR_EL2.M = 0`)                                                      |
| D-cache, I-cache  | disabled in `SCTLR_EL2`; cache contents undefined                                 |
| `VBAR_EL2`        | undefined                                                                         |
| `VBAR_EL1`        | undefined                                                                         |
| `TTBR0_EL2`, etc. | undefined                                                                         |
| `HCR_EL2`         | reset value (`E2H = 0`, `RW = 1` on most QEMU versions, but verify)               |
| Secondary CPUs    | halted in PSCI spin (CPU_ON through the platform PSCI conduit); not yet executing |

Implications:

1. **No stack until set.** Function calls, local variables, and anything
   that touches `sp` is forbidden until `sp` is initialized. The first
   instructions of `_start` must run in a `naked` context (see [chapter-08-functions.md §2.7](chapter-08-functions.md))
   or be tiny enough to live entirely in registers.

2. **D-cache must be invalidated.** With the MMU off, the CPU bypasses
   the cache for normal accesses, but the cache may hold stale lines
   from prior firmware activity. Before enabling the MMU, the kernel
   must invalidate the D-cache.

3. **DTB must be preserved.** The DTB pointer in x0 is the only way to
   discover device addresses, memory ranges, and the CPU topology. Save
   it before any code path that may clobber x0.

4. **VBAR_ELx must be installed before unmasking interrupts.** With
   `VBAR_ELx` undefined and DAIF clear, any synchronous fault or async
   interrupt jumps to an undefined address.

---

### Minimal EL2 → EL1 Drop with Vector Install

This example walks from CPU reset at EL2 to executing kernel code at EL1
with the vector table installed and the BSS zeroed. It uses only Wyst
primitives covered in earlier parts.

#### Layout module (`boot.layout`)

The block below uses the current named-layout grammar. Selecting either QEMU
EL2 profile authenticates the incoming `x0` DTB schema and the checked stack
transition together. Choosing a zero-parameter profile for this layout, or
changing either half of the entry contract, is a pre-artifact error.

<!-- wyst-contract: sketch -->
```wyst
module boot.layout

layout qemu_virt {
  entry boot._start at 0x4008_0000 // QEMU virt loads kernel here
  region ram: readwrite at 0x4000_0000 size 0x0800_0000

  section ".text": code in ram align 16
  section ".rodata": rodata after ".text" align 16
  section ".data": data after ".rodata" align 8
  section ".bss": bss after ".data" align 16

  pub symbol __bss_start: @u8 = start(".bss")
  pub symbol __bss_end: @u8 = end(".bss")
  pub symbol __stack_top: u64 = 0x4010_0000 // one mebibyte of stack, top-down
}
```

#### Kernel module (`boot`, QEMU EL2 entry sketch)

The initial `asm establishes stack` sequence is the active QEMU EL2 transition
contract. Its one input is fixed to `x1`, while firmware `x0` remains bound to
`dtb` and is forwarded unchanged after the stack becomes usable.

<!-- wyst-contract: sketch -->
```wyst
module boot

target(arch = arm64-v8a, cpu = generic, el = 2)

import core.arch { barrier, cpu, exception }

system_register SP_EL1: writeonly u64 {}
system_register VBAR_EL1: writeonly u64 {}
system_register HCR_EL2: writeonly u64 {}
system_register CPTR_EL2: writeonly u64 {}
system_register SCTLR_EL1: writeonly u64 {}
system_register SPSR_EL2: writeonly u64 {}
system_register ELR_EL2: writeonly u64 {}
system_register ESR_EL1: readonly u64 {}

// The compiler is invoked with `--layout boot.layout`.
// Published typed layout symbols such as __stack_top are available by bare name.
// Entry point — invoked at EL2 by QEMU with DTB pointer in x0.
// Must be naked: sp is undefined; we cannot use stack until we set it.
pub naked fn _start(dtb: @u8 in x0) -> never {
  // 1. Set up an initial stack (in EL2's sp_el2, which becomes sp here).
  asm establishes stack (
    stack: u64 in x1 = __stack_top,
  ) {
    mov sp, stack
  }
  SP_EL1.write(__stack_top) // stack for after the EL2 -> EL1 drop

  // 2. Install VBAR_EL1 ahead of the drop.
  VBAR_EL1.write(address<u64>(#addr_of(el1_vectors)))
  barrier.isb()

  // 3. Configure HCR_EL2: EL1 runs in AArch64.
  HCR_EL2.write(1 << 31) // RW = 1

  // 4. Configure CPTR_EL2: allow FP/SIMD at EL1 (do not trap).
  CPTR_EL2.write(0x33ff)

  // 5. Configure SCTLR_EL1 reset state: MMU off, caches off.
  SCTLR_EL1.write(0x30c5_0838)
  barrier.isb()

  // 6. Configure SPSR_EL2: target EL1h, all DAIF masked.
  SPSR_EL2.write(0x3c5) // M=0101 (EL1h), DAIF=1111

  // 7. Set ELR_EL2 to where we want EL1 to start.
  ELR_EL2.write(address<u64>(#addr_of(el1_main)))

  // 8. eret: drop to EL1 with x0 (dtb) preserved as the EL1 first argument.
  exception.eret()
}

// EL1 entry — runs after the drop. sp now refers to sp_el1.
fn el1_main(dtb: @u8 in x0) -> never {
  // 10. Zero BSS now that we are at EL1 with a usable stack.
  var addr: @u8 = __bss_start
  while address<u64>(addr) < address<u64>(__bss_end) {
    relens<@u64>(addr).store(0)
    addr = byte_offset(addr, 8)
  }

  // 11. Hand off to high-level kernel init.
  kernel_init(dtb)

  loop {
    cpu.wfe()
  }
}
```

The stack-setting assembly is inline in `_start` rather than a helper call:
before that block executes, `sp` is undefined, and ordinary calls are illegal
under the `naked` verifier.

#### Vector declarations (same program module)

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
  current.spx.serror   -> unexpected

  lower.aarch64.sync   -> unexpected
  lower.aarch64.irq    -> unexpected
  lower.aarch64.fiq    -> unexpected
  lower.aarch64.serror -> unexpected

  lower.aarch32.sync {
    loop {
      cpu.wfe()
    }
  }
  lower.aarch32.irq {
    loop {
      cpu.wfe()
    }
  }
  lower.aarch32.fiq {
    loop {
      cpu.wfe()
    }
  }
  lower.aarch32.serror {
    loop {
      cpu.wfe()
    }
  }
}

label handle_sync {
  // Read ESR_EL1 to dispatch on exception class.
  const esr: u64 = ESR_EL1.read().raw
  // ... full dispatch elided ...
  loop {
    cpu.wfe()
  }
}

label handle_irq {
  // GIC EOI dispatch — elided.
  loop {
    cpu.wfe()
  }
}

label unexpected {
  loop {
    cpu.wfe()
  }
}
```

---

### Secondary CPU Bring-Up (PSCI)

QEMU `virt` advertises PSCI through the DTB. After the primary CPU
parses the DTB to discover the secondary CPUs' MPIDR values, it brings
each online with the PSCI `CPU_ON` SMCCC call. The EL2 SMP example
uses the SMC conduit; an EL1 guest under a hypervisor may use the HVC
conduit when the DTB says so.

The checked `smc` spelling in the following future-profile sketch is not active
in the pinned selected snapshot pack and is rejected there. Current selected snapshot code uses the
cataloged `exception.smc(imm)` operation and its conservative register
contract; a later checked profile may activate the exact signature form shown
here.

<!-- wyst-contract: sketch -->
```wyst
fn psci_cpu_on(mpidr: u64, entry_point: u64, context_id: u64) -> u64 {
  const status: u64 = asm (
    func_id: u64 in x0 = 0xC400_0003, // PSCI_CPU_ON (SMC64)
    target: u64 in x1 = mpidr,
    ep: u64 in x2 = entry_point,
    ctx: u64 in x3 = context_id,
  ) -> func_id {
    smc #0
  }
  return status
}
```

The entry point for secondary CPUs is a separate Wyst function with the
same `naked` discipline as `_start`. Each secondary sets up its own
stack (typically from a per-CPU stack array indexed by MPIDR or by an
atomically-incremented online counter), installs `VBAR_EL1`, and joins
the kernel scheduler.

#### QEMU `virt` SMP Recipe

This SMP bring-up recipe is intentionally narrow: QEMU `virt`, EL2 entry, PSCI via
`smc #0`, two Cortex-A53 CPUs, and a checked shared-memory handoff. It is
not a scheduler, per-CPU-storage implementation, or generic topology
probe.

The smoke run derives a deterministic AArch64 Linux `Image` envelope from the
compiler ELF, verifies that the envelope still binds to the exact ELF bytes and
entry address, and authenticates the original ELF against the runner profile
immediately before launch:

```sh
node wync/tools/a64-linux-image.mjs create \
  <18-smp-smoke.elf> <18-smp-smoke.Image>
node wync/tools/a64-linux-image.mjs verify \
  <18-smp-smoke.elf> <18-smp-smoke.Image>
wync runner-preflight <18-smp-smoke.elf> \
  --runner qemu-system-aarch64-semihost-v1
qemu-system-aarch64 \
  -machine virt,virtualization=on \
  -cpu cortex-a53 \
  -smp 2 \
  -display none \
  -monitor none \
  -serial file:<uart-log> \
  -semihosting-config enable=on,target=native \
  -kernel <18-smp-smoke.Image>
```

The runner profile authenticates only the executable environment and exact
required-service offer. It does not authenticate the QEMU binary, version,
machine, CPU, or argv. The smoke script separately pins the accepted QEMU
version and owns the closed argv shown above; both checks fail before launch.

The envelope supplies QEMU's standard 64-byte Linux Image header and branches
to the unchanged ELF entry while preserving x0, so the EL2 DTB handoff remains
the authenticated input to `_start`. The secure EL3 profile described above is
deliberately different and continues to launch its ELF directly.

The example assumes QEMU's second CPU has MPIDR value `0x1`; production
boot code must discover MPIDRs from the DTB before issuing `CPU_ON`.

The handoff protocol is visible in the source:

1. The primary CPU initializes the shared command, ready, value, and
   wait-count words, then runs `dsb ish`.
2. The primary calls PSCI `CPU_ON` with x0=`0xC400_0003`,
   x1=`secondary MPIDR`, x2=`secondary_start`, x3=`context`.
3. The primary stores the start command, runs `dsb ish`, and sends `sev`.
4. The secondary starts at a `naked` entry, installs its own stack, reads
   `MPIDR_EL1` for inspection, and waits with `wfe` until the command word
   changes.
5. The secondary runs `dsb ish`, writes the checked value, runs `dsb ish`,
   writes the ready word, runs `dsb ish`, and sends `sev`.
6. The primary polls with a bounded loop and `yield`; on success it checks
   the value and emits `SMP ok\n` over the PL011 UART. Any PSCI failure,
   mismatched value, or timeout exits through the semihosting panic path.

The barriers are deliberately written in the source. Wyst does not infer
the SMP synchronization sequence, does not insert implicit cache
maintenance, and does not rewrite the wait loop into a runtime primitive.

---

### Boot-Time Cache and TLB Maintenance

| When                                   | Required sequence                                                      |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Before enabling MMU                    | invalidate D-cache (`dc isw` walk; `ic iallu`); `dsb sy`; `isb`        |
| After writing `TTBR0_EL1` / `TCR_EL1`  | `dsb ish`; `tlbi vmalle1`; `dsb ish`; `isb`                            |
| After enabling MMU (`SCTLR_EL1.M = 1`) | `isb`                                                                  |
| Before unmasking interrupts            | ensure `VBAR_EL1` is set and `isb` has run since the most recent `msr` |

D-cache walk-and-invalidate via `dc isw` is iterative (cache-level-by-set-by-way);
it is verbose and typically lives in a separate helper function that
reads the architectural CLIDR and CCSIDR registers to discover the topology. Wyst source should
provide this as a library; it is too long to inline in every boot sequence.

---

### What This Contract Does Not Cover

- **U-Boot / EDK2 hand-off conventions** — those bootloaders deliver
  control with a different register and memory state (e.g. U-Boot 64-bit
  ARM passes DTB in x0, args 0 elsewhere; image already EL2). The
  contract above applies after the bootloader exits to the kernel; the
  kernel-side code is unchanged.
- **Real-silicon power-on reset** — Cortex-A processors have additional
  reset-time setup (errata workarounds, cluster-controller programming,
  CCI / CMN snoop-filter configuration) that the boot ROM normally
  handles. Wyst code typically picks up from a known-good state after
  this is done.
- **Other secure-world handoffs (EL3 / TrustZone)** — the authenticated
  `qemu-virt-aarch64-el3` direct-ELF profile above is covered. TF-A
  `bl1`/`bl2`, monitor payloads, and real-platform EL3 reset contracts remain
  platform-specific and are not inferred from that QEMU profile.

---

### Design Rationale

| Choice                                    | Reason                                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Document QEMU `virt` specifically         | It is the canonical target. Generalizing across all ARMv8 platforms would dilute the contract into "depends on your firmware."               |
| `_start` is `naked` and returns `never`   | `sp` is undefined; using locals before sp-init would clobber whatever happens to be in `[sp]`. `never` records that the EL1 entry takes over. |
| `exception.eret()` to drop EL, not `bl` or `b` | Architecturally, EL transitions are exception returns. `bl` from EL2 to an EL1 address simply stays at EL2.                             |
| Vector install before enabling interrupts | Establishes a known target for any synchronous fault. Without it, a stray fault becomes an undefined-PC jump.                                |
| BSS zeroing at EL1, after the drop        | Requires a working stack and EL1 MMU-off mode. Cleaner than embedding the zero loop in the `naked` `_start`.                                 |
| Cache invalidation library, not inline    | The CLIDR/CCSIDR walk is verbose, error-prone, and the same across every kernel; it belongs in a shared utility.                             |

---

## Final Direction

The syntax should optimize for:

- visible semantics
- predictable lowering
- explicit memory behavior
- readable machine-oriented programming

The core principle remains:

> expose computational behavior rather than hiding it.
