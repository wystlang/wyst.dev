---
title: Registers and devices
summary: Register maps, devices at physical addresses, arrays of devices, and register access.
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

Register and field names follow the datasheet. `wync fmt` aligns the
entries in columns, because a reader scans a register map by column.

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
maps the device in a page table, can name the same constant.

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

## Reading and writing

`dev.R.read()` loads register `R` one time and gives a snapshot. `.F`
reads field `F` from the snapshot. It does not access the device again. A
local cannot hold a snapshot now, so each read gives one field:

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

`dev.R.write(F = v, ...)` makes one value from the named fields and stores
it one time. Each field that the call does not name is zero, or its fixed
value. Each value must have the exact field type, and a literal must fit
in its field.

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
