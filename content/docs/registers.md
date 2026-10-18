---
title: Registers and devices
summary: Register maps, register banks, devices at physical addresses, arrays of devices, and register access.
---

A device has registers at fixed offsets from its base address. Wyst
declares them with a register map, puts the device at its address, and
checks each access.

## Register maps

A `#[register_map] struct` declares the registers of one kind of device.
Each entry gives a register name, an access kind, a type, a byte offset,
and the bit fields of the register:

```wyst
#[register_map]
struct Redistributor {
  WAKER:      readwrite u32 at 0x0014   { ProcessorSleep: bool at 1, ChildrenAsleep: bool at 2 }
  IGROUPR0:   readwrite u32 at 0x1_0080 { Timer: bool at 30 }
  ISENABLER0: readwrite u32 at 0x1_0100 { Timer: bool at 30 }
}
```

- The access kind is `readonly`, `writeonly`, or `readwrite`.
- The register type is `u8`, `u16`, `u32`, or `u64`. The offset is a
  multiple of the register size, and registers do not overlap.
- A field type is `bool`, `uN` with N from 1 to 64, or an enum.
  `at lo..=hi` must have N bits. `at lo` alone takes N bits from bit `lo`.
  Fields stay inside the register and do not overlap.
- A field with `= value`, such as `ARE: bool at 4 = true`, is fixed. Each
  write gives it that value, and a write cannot name it. A bit that the
  specification requires to be 1 (RES1) is a fixed field.
- The fields in `{ }` are optional.

Register and field names follow the datasheet. `wync fmt` aligns the
entries in columns, because a reader scans a register map by column.

## Computed positions

The offset and each bit position are constants that the compiler
computes: a literal, a module constant, a `pub` constant of an imported
module, or an operator on constants. Each is an integer, as an index is,
and one with only literals is a `u64`. Thus one constant can give the
place of a line in more than one register:

```wyst
// Line n of the AIC is bit n % 32 of word n / 32 of MASK_SET and
// MASK_CLR.
const uart_line: u16 = 1097

#[register_map]
struct Aic {
  MASK_SET: readwrite u32 at 0x6400 + 4 * (uart_line / 32) { Uart: bool at uart_line % 32 }
  MASK_CLR: readwrite u32 at 0x6600 + 4 * (uart_line / 32) { Uart: bool at uart_line % 32 }
}
```

The compiler gives a register map its fields in declaration order, as it
gives a constant its value. Thus a position can use only the constants of
its module before the map, and a device comes after its map:

```wyst fails
#[register_map]
struct Uart {
  ICR: writeonly u32 at 0x44 { RX: bool at rx }
}

const rx: u8 = 4
```

```text
main.wyst:3:44: error: `rx` is used before its declaration
```

## Devices

`#[mmio(address)] const name: Map` puts one device of the register map
`Map` at a physical address. The constant has no value of its own:

```wyst
#[register_map]
struct Pl011 {
  DR: readwrite u32 at 0x00 { DATA: u8 at 0..=7 }
  FR: readonly  u32 at 0x18 { BUSY: bool at 3, TXFF: bool at 5 }
}

pub const uart_address: u64 = 0x0900_0000

#[mmio(uart_address)]
const uart: Pl011
```

The address is a `u64` constant. Thus other code, such as the code that
maps the device in a page table, can name the same constant. The address
of each register, the base plus the offset, must be a multiple of the
register size.

The device is local to its module, and a `pub` device is not implemented
now. Make a `pub` function that accesses the device, and call this
function from the other module.

## Arrays of devices

`#[mmio(address, stride)] const name: [N]Map` puts N devices of one map at
`address`, `address + stride`, and so on. The stride is a power of two,
and each register fits in it. The GICv3 redistributors, one for each CPU,
are an example:

```wyst
#[register_map]
struct Redistributor {
  WAKER: readwrite u32 at 0x0014 { ProcessorSleep: bool at 1, ChildrenAsleep: bool at 2 }
}

#[mmio(0x080a_0000, 0x2_0000)]
const redistributors: [4]Redistributor

fn wake(cpu: u64) {
  redistributors[cpu & 3].WAKER.write(ProcessorSleep = false)
  for redistributors[cpu & 3].WAKER.read().ChildrenAsleep {}
}
```

`name[i].R` is register `R` of device `i`. The compiler must prove that `i`
is less than N, as for any index. See [Index proofs](/docs/index-proofs/).
A call in the index, such as `redistributors[cpu() & 3]`, is not
implemented now. Put the result of the call in a local first.

## Register banks

A register bank is a fixed number of registers of one shape, one after the
other from one offset. `[N]` before the access kind declares N registers.
The Apple PMGR has one start register for each cluster of cores:

```wyst
const clusters: u64 = 3

#[register_map]
struct Pmgr {
  START: [clusters]writeonly u32 at 0x5_4008 { CORES: u4 at 0..=3 }
}

#[mmio(0x2_8e08_0000)]
const pmgr: Pmgr

// Starts core 0 of each cluster.
fn start() {
  for cluster in 0 ..< clusters {
    pmgr.START[cluster].write(CORES = 1)
  }
}
```

`dev.R[i]` is register `i` of bank `R`, at the offset of the bank plus `i`
times the register size: here 0x5_4008, 0x5_400c, and 0x5_4010. The
compiler must prove that `i` is less than N, as for an array of devices,
and a call in the index is not implemented now. N is a constant that the
compiler computes, and it is not 0. The bank takes N times the register
size, so no other register can start in it, and each bank fits in the
stride of an array of devices. A device of an array takes its own index
first, as in `pmgrs[die].START[cluster]`.

A bank needs the index, and a register that is not a bank takes none:

```wyst fails
#[register_map]
struct Pmgr {
  START: [3]writeonly u32 at 0x5_4008 { CORES: u4 at 0..=3 }
}

#[mmio(0x2_8e08_0000)]
const pmgr: Pmgr

fn start() {
  pmgr.START.write(CORES = 1)
}
```

```text
main.wyst:10:8: error: `START` is a register bank; select one with `START[index]`
```

## Reading and writing

`dev.R.read()` loads register `R` one time and gives a snapshot. `.F`
reads field `F` from the snapshot. It does not access the device again. A
read in an expression gives one field:

```wyst
#[register_map]
struct Pl011 {
  DR: readwrite u32 at 0x00 { DATA: u8 at 0..=7 }
  FR: readonly  u32 at 0x18 { BUSY: bool at 3, TXFF: bool at 5 }
}

#[mmio(0x0900_0000)]
const uart: Pl011

fn put(byte: u8) {
  for uart.FR.read().TXFF {}
  uart.DR.write(DATA = byte)
}
```

`const s = dev.R.read()` keeps the snapshot in the local `s`. Each `s.F`
reads field `F` from the same snapshot, with no more access. A field read
is the only use of a snapshot. A naked function has no local, so each read
in it gives one field.

```wyst
#[register_map]
struct Pl011 {
  FR: readonly u32 at 0x18 { BUSY: bool at 3, TXFF: bool at 5 }
}

#[mmio(0x0900_0000)]
const uart: Pl011

// One load of FR gives both flags.
fn idle() -> bool {
  const flags = uart.FR.read()
  return !flags.BUSY && !flags.TXFF
}
```

Each other use of a snapshot, such as an operand, an argument, `@s`, or a
copy in another local, is an error:

```wyst fails
#[register_map]
struct Pl011 {
  FR: readonly u32 at 0x18 { BUSY: bool at 3 }
}

#[mmio(0x0900_0000)]
const uart: Pl011

fn quiet() -> bool {
  const flags = uart.FR.read()
  return flags == 0
}
```

```text
main.wyst:11:10: error: a field read is the only use of a register snapshot
```

A read can also be a statement alone. It loads the register and discards
the value.

`.F` has the type of field `F`. An enum field gives its backing `uN`,
because the register can hold a value that is no variant. A local cannot
hold a `uN` other than `u8`, `u16`, `u32`, or `u64`. Use `widen` for
a narrower field: for a `u5` field `N`, write
`const n: u8 = widen(gic.TYPER.read().N)`. See
[Bit field types](/docs/values/#bit-field-types).

`dev.R.write(F = v, ...)` makes one value from the named fields and stores
it one time. Each field that the call does not name is zero, or its fixed
value. Each bit outside the fields is zero, so `dev.R.write()` stores zero
in a register without fields. Each value must have the exact field type,
and a literal must fit in its field.

The compiler refuses a `write` of a `readonly` register and a `read` of a
`writeonly` register:

```wyst fails
#[register_map]
struct Pl011 {
  FR: readonly u32 at 0x18 { BUSY: bool at 3, TXFF: bool at 5 }
}

#[mmio(0x0900_0000)]
const uart: Pl011

fn clear() {
  uart.FR.write(TXFF = false)
}
```

```text
main.wyst:10:11: error: register `FR` is readonly
```

## What the compiler keeps

Each access is one load or store of the register size. The compiler does
not remove, combine, or move a device access, and it adds no barrier. When
the order of accesses to two devices matters, an `asm` block gives the
barrier, such as `dsb sy`. See [Assembly](/docs/assembly/).
