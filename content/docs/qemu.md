---
title: Running on QEMU
summary: The QEMU command line, the virt board, and test programs that report a status.
---

## The command line

```sh
qemu-system-aarch64 -machine virt,gic-version=3 -cpu cortex-a76 -smp 4 \
  -nographic -semihosting-config enable=on,target=native -kernel program.elf
```

| Option | Why |
| --- | --- |
| `-machine virt,gic-version=3` | The QEMU `virt` board, with a GICv3 interrupt controller. The board gives a GICv2 by default. |
| `-cpu cortex-a76` | The kernel uses 16 KiB pages. The default `cortex-a53` has no 16 KiB translation granule. |
| `-smp 4` | Four CPUs. CPUs 1 to 3 stay off until the program starts them with the PSCI call `CPU_ON`. |
| `-nographic` | The UART goes to the terminal. |
| `-semihosting-config enable=on,target=native` | Lets `semihost.test_exit` stop QEMU. |
| `-kernel program.elf` | QEMU loads the ELF file and starts the CPU at its entry. |

QEMU loads the ELF directly: there is no Linux image header. The CPU starts
at EL1 at the entry, with `x0` equal to 0 and no device tree address. The
program has the board to itself.

## The virt board

These facts of the board are the ones that the examples use:

| Device | Address |
| --- | --- |
| RAM | starts at `0x4000_0000`, 128 MiB by default |
| PL011 UART | `0x0900_0000`, with a 24 MHz clock |
| GICv3 distributor | `0x0800_0000` |
| GICv3 redistributors | `0x080a_0000`, with a stride of `0x2_0000` |

## Programs that report a status

A test program writes to the UART and stops with `semihost.test_exit`.
QEMU then exits with the status of the program. A test passes when QEMU
exits with status 0 and the UART output is the expected text.

The compiler tests run each QEMU fixture this way, with a time limit of 45
seconds. They also build each fixture two times and compare the two files
byte for byte.
