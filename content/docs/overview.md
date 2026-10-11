---
title: Overview
summary: What Wyst is, what it does differently, and its state now.
---

Wyst is a language for ARM64 code that runs with no operating system:
kernels, boot code, and device drivers. Its compiler, `wync`, reads Wyst
source and writes one AArch64 ELF executable. The QEMU `virt` board is the
target now.

The goal of Wyst is low-level code that a reader can read and reason about.
The language has 20 keywords, and its features are mainly the ones that
kernel code needs.

## A first look

This module declares the registers of a UART, puts the UART at its
address, and writes one byte:

```wyst
#[register_map]
struct Pl011 {
  DR: readwrite u32 at 0x00 { DATA: u8 at 0..=7 }
  FR: readonly  u32 at 0x18 { TXFF: bool at 5 }
}

#[mmio(0x0900_0000)]
const uart: Pl011

pub fn put(byte: u8) {
  for uart.FR.read().TXFF {}
  uart.DR.write(DATA = byte)
}
```

`uart.FR.read()` is one 32-bit load from address `0x0900_0018`.
`uart.DR.write(DATA = byte)` is one 32-bit store. The compiler refuses a
write to `FR`, because the declaration makes it `readonly`, and it refuses
a `DATA` value that is not a `u8`.

## What is different

- **Hardware is declarations.** Register maps, devices at fixed addresses,
  system registers, and the exception vector table are declarations that
  the compiler checks. See [Registers and devices](/docs/registers/).
- **Indexes are proved.** The compiler proves that each array index is in
  range before the program runs. There is no bounds check at run time and
  no unchecked index. See [Index proofs](/docs/index-proofs/).
- **Assembly is checked.** Each line of an `asm` block is one A64
  instruction, which the compiler checks against tables from the Arm
  specification. Its inputs and outputs have Wyst types. See
  [Assembly](/docs/assembly/).
- **Cost stays visible.** The compiler keeps each call, branch, and device
  or system register access that the source has. It computes operators on
  constants, and it removes only the loads, stores, and temporary values
  that it adds itself. See [Code generation](/docs/code-generation/).
- **No undefined behavior.** Integer arithmetic wraps. A division or a
  shift takes only a constant that the compiler checks, so no operator can
  fail at run time. [`bitcast`](/docs/addresses/#bitcast) marks each place
  where the program trusts a fact that the compiler cannot prove.
- **No LLVM.** The compiler writes A64 machine words and the ELF file
  itself. Two builds of the same input give byte-identical files.

## State now

Wyst is experimental and has no version number. The compiler is a Rust
program. Its source is in a private repository now.

The language grows with one user: a new ARM64 kernel. A feature enters the
compiler mainly when the next kernel module needs it. Thus the grammar has
some forms that the compiler does not implement now, such as `match` and
`else` after `if`. [Status](/docs/status/) lists what exists now.

## Next steps

- [Install](/docs/installation/) the compiler and QEMU.
- Build and run [Hello, world!](/docs/hello-world/) on QEMU.
- Read the [Language tour](/docs/modules/).
