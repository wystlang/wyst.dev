---
title: Hello, world!
summary: Write, build, and run a bare-metal program on QEMU.
---

This program writes `Hello, World!` to the UART of the QEMU `virt` board,
then stops QEMU. It has no operating system: the program sets its own
stack, sets up the UART, and writes each byte itself.

## The program

Make a directory, and save this module in it as `hello.wyst`:

```wyst hello.wyst
import runtime.semihost

#[register_map]
struct Pl011 {
  DR:    readwrite u32 at 0x00 { DATA: u8 at 0..=7 }
  FR:    readonly  u32 at 0x18 { BUSY: bool at 3, TXFF: bool at 5 }
  IBRD:  readwrite u32 at 0x24 { DIVINT: u16 at 0..=15 }
  FBRD:  readwrite u32 at 0x28 { DIVFRAC: u6 at 0..=5 }
  LCR_H: readwrite u32 at 0x2c { FEN: bool at 4, WLEN: u2 at 5..=6 }
  CR:    readwrite u32 at 0x30 { UARTEN: bool at 0, TXE: bool at 8, RXE: bool at 9 }
}

#[mmio(0x0900_0000)]
const uart: Pl011

#[naked]
pub fn _start() -> never {
  asm(top in x0 = __stack_top) {
    add sp, x0, #0
  }

  main()
}

fn main() -> never {
  init()

  for byte in "Hello, World!\n" {
    write(byte)
  }

  semihost.test_exit(0)
}

fn init() {
  uart.CR.write(UARTEN = false, TXE = false, RXE = false)
  for uart.FR.read().BUSY {}
  uart.LCR_H.write(FEN = false)
  uart.IBRD.write(DIVINT = 13)
  uart.FBRD.write(DIVFRAC = 1)
  uart.LCR_H.write(FEN = true, WLEN = 3)
  uart.CR.write(UARTEN = true, TXE = true, RXE = false)
}

#[inline]
fn write(byte: u8) {
  for uart.FR.read().TXFF {}
  uart.DR.write(DATA = byte)
}
```

## The layout

A program also needs a layout file, which tells the build where the code
goes in memory. Save this as `hello.layout`:

```layout
entry hello._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0008_0000
section .text:   code   in ram align 16
section .rodata: rodata in ram after .text align 16
symbol __stack_top: u64 = 0x4010_0000
```

QEMU loads the program into RAM at `0x4008_0000` and starts the CPU at the
entry, `_start` of module `hello`. The code goes in `.text`, and the bytes
of the string go in `.rodata`. `__stack_top` is a symbol that the program
reads. [Layout files](/docs/layout-files/) gives the format.

## Build and run

Build the program:

```sh
wync build hello.wyst --layout hello.layout -o hello.elf
```

Run it on QEMU:

```sh
qemu-system-aarch64 -machine virt -cpu cortex-a76 -nographic \
  -semihosting-config enable=on,target=native -kernel hello.elf
```

QEMU prints the line and stops with exit status 0:

```text
Hello, World!
```

## How it works

**The module.** The file `hello.wyst` is the module `hello`. The import of
`runtime.semihost` gives `semihost.test_exit`, which the compiler supplies
for tests on QEMU.

**The registers.** `#[register_map] struct Pl011` declares the registers
of the PL011 UART. Each line gives a register name, an access kind, a size,
a byte offset, and the bit fields of the register. `DATA: u8 at 0..=7` is
bits 0 to 7 of `DR`. `#[mmio(0x0900_0000)] const uart: Pl011` puts the UART
at its physical address. See [Registers and devices](/docs/registers/).

**The start.** The CPU starts at `_start` with no stack. A `#[naked]`
function has no prologue, so it can run before a stack exists. Its `asm`
block puts the address `__stack_top` in `sp`. After that, `_start` can call
a normal function. `never` is the return type of a function that does not
return. See [Boot and exceptions](/docs/boot-and-exceptions/).

**The UART.** `init` disables the UART, waits while it is busy, and sets
the baud rate and the data format. Then it enables the UART and its
transmitter. Each `write` call is one store to the device, and each `read`
call is one load. `for uart.FR.read().BUSY {}` loads `FR` again on each
pass, while the `BUSY` bit is set.

**The loop.** `for byte in "Hello, World!\n"` runs its body one time for
each byte of the string. `write` is `#[inline]`, so the compiler copies its
body into the loop. It waits while the transmit queue is full (`TXFF`),
then stores the byte in `DR`.

**The end.** `semihost.test_exit(0)` asks QEMU to stop with exit status 0.
A program on real hardware does not stop: it waits for the next event.
