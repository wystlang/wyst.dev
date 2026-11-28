---
title: Registers and devices
summary: Register maps, register banks, devices at physical addresses, arrays of devices, shared register maps, addresses of register maps, register access, and big-endian registers.
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
function from the other module, or share the register map, as
[Sharing a register map](#sharing-a-register-map) gives.

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

## Sharing a register map

`pub` before `struct` lets each module that imports the module of a
register map put the map at its own address: `m.S` names the `pub`
register map `S` of module `m` as the type of an `#[mmio]` constant. Thus
the drivers of one kind of device declare its registers one time. This
module declares registers of the common configuration of a virtio device,
and a function that resets a device at the
[address](#addresses-of-register-maps) `common`:

```wyst drivers/virtio.wyst
#[register_map]
pub struct Common {
  DEVICE_STATUS: readwrite u8  at 0x14 { BITS: u8 at 0..=7 }
  QUEUE_SELECT:  writeonly u16 at 0x16 { QUEUE: u16 at 0..=15 }
}

pub fn reset(common: @Common) {
  common.DEVICE_STATUS.write(BITS = 0)
  for common.DEVICE_STATUS.read().BITS != 0 {}
}
```

Each driver puts the map at the address of its own device, and the device
is local to the driver. The driver gives the address of its device to the
function, so the drivers also share the code:

```wyst
import drivers.virtio

#[mmio(0x1000_0000)]
const configuration: virtio.Common

fn open() {
  virtio.reset(@configuration)
  configuration.QUEUE_SELECT.write(QUEUE = 0)
}
```

A field takes `.Variant` also when its enum is not `pub`, because the
field gives the enum. A `pub` register map is still not a value, so a
parameter takes the address of the device, `@virtio.Common`:

```wyst fails
import drivers.virtio

fn reset(configuration: virtio.Common) {}
```

```text
main.wyst:3:25: error: a `#[register_map]` struct is only the type of an `#[mmio]` constant or the target of an address now
```

## Addresses of register maps

`@M`, where `M` is a register map, is the address of a device of map `M`.
It is the type of a parameter, a local, and a result. `@d` gives the
address of device `d` of the module, and `@d[i]` the address of device
`i` of an array of devices. The compiler proves the index, as for
`d[i].R`. Thus one function accesses the registers of each device of one
map:

```wyst
#[register_map]
struct Pl011 {
  DR: readwrite u32 at 0x00 { DATA: u8 at 0..=7 }
  FR: readonly  u32 at 0x18 { TXFF: bool at 5 }
}

#[mmio(0x0900_0000)]
const console: Pl011

#[mmio(0x0904_0000, 0x1000)]
const ports: [2]Pl011

fn put(uart: @Pl011, byte: u8) {
  for uart.FR.read().TXFF {}
  uart.DR.write(DATA = byte)
}

fn hello(n: u64) {
  put(@console, 0x48)
  put(@ports[n & 1], 0x48)
}
```

`p.R.read()`, `p.R.write(F = v, ...)`, and `p.R.modify(F = v, ...)` are
the accesses of register `R` at the address `p`, a local or a parameter,
and `p.R[i]` is register `i` of bank `R`. They follow the rules of
[Reading and writing](#reading-and-writing): the access kinds, the
fields, and one load or store for each access, which the compiler keeps
as for a device.

`bitcast` of a `u64` gives the address of a device that the code finds
only at run time. The operational registers of an xHCI controller are at
the offset that CAPLENGTH gives:

```wyst
#[register_map]
struct Capability {
  CAPLENGTH: readonly u8 at 0x00 { LENGTH: u8 at 0..=7 }
}

#[register_map]
struct Operational {
  USBCMD: readwrite u32 at 0x00 { RS: bool at 0, HCRST: bool at 1 }
  USBSTS: readwrite u32 at 0x04 { HCH: bool at 0, CNR: bool at 11 }
}

const base: u64 = 0x0110_0000

#[mmio(base)]
const capability: Capability

fn reset() {
  const operational: @Operational = bitcast(base + widen(capability.CAPLENGTH.read().LENGTH))
  operational.USBCMD.write(HCRST = true)
  for operational.USBCMD.read().HCRST || operational.USBSTS.read().CNR {}
}
```

`bitcast` is the only form that makes `@M` from an integer. Only a function
of the module that declares the register map makes it, also in a function
of EL0 code, as [Points of trust](/docs/addresses/#points-of-trust) gives. The
module `drivers.timer` makes the address of a `Timer`:

```wyst drivers/timer.wyst
#[register_map]
pub struct Timer {
  COUNT: readonly u32 at 0x00 { VALUE: u32 at 0..=31 }
}

pub fn at(address: u64) -> @Timer {
  return bitcast(address)
}
```

```wyst
import drivers.timer

fn count(address: u64) -> u32 {
  const clock = timer.at(address)
  return clock.COUNT.read().VALUE
}
```

Another module makes no such address:

```wyst fails
import drivers.timer

fn count(address: u64) -> u32 {
  const clock: @timer.Timer = bitcast(address)
  return clock.COUNT.read().VALUE
}
```

```text
main.wyst:4:31: error: `bitcast` of an integer gives no @Timer in a function of this module, because module `drivers.timer` declares `Timer`; it gives only the address of a type that this module declares, or of an array of one
```

The checker does not examine the address. The code asserts that a device of
the map is at the address, so that the address of each register is a
multiple of the register size, as `bitcast` of a `u64` to an
[address of memory](/docs/addresses/#bitcast) asserts its memory.

A register map is not memory and not a value. Thus `load`, `store`, and
`@p.f` do not take its address, and memory does not hold it, also as a
field of a plain struct:

```wyst fails
#[register_map]
struct Pl011 {
  FR: readonly u32 at 0x18 { TXFF: bool at 5 }
}

struct Port {
  uart: @Pl011
}
```

```text
main.wyst:7:9: error: a register map is not a value, so memory does not hold its address
```

Each register gives its access kind, so the address of a register map
has no `var`, as an address of memory has, as
[Read-only addresses](/docs/addresses/#read-only-addresses) gives:

```wyst fails
#[register_map]
struct Pl011 {
  DR: readwrite u32 at 0x00 { DATA: u8 at 0..=7 }
}

fn put(uart: @var Pl011) {
  uart.DR.write(DATA = 0x41)
}
```

```text
main.wyst:6:14: error: the address of a register map has no `var`, because each register gives its access kind
```

`modify` computes the address two times, as it computes an index two
times, so a call in the place of `p`, such as `f().R.read()`, is not
implemented now. Put the address in a local first: `const p = f()`. A
module constant, a module variable, a local `var`, and an `Option` of the
address are not implemented now, and so is the address of a register map
that is not `pub` as the result of a `pub` function.

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

`_ = R.read()` loads the register and drops the snapshot. The read alone
is not a statement, because `_ = value` is the one statement that drops a
value.

`.F` has the type of field `F`. An enum field gives a value of its enum,
which can be a value that no variant has, as
[Enum values](/docs/enums-and-bit-structs/#enum-values) gives. A local
cannot hold a `uN` other than `u8`, `u16`, `u32`, or `u64`. Use `widen`
for a narrower field: for a `u5` field `N`, write
`const n: u8 = widen(gic.TYPER.read().N)`. See
[Bit field types](/docs/values/#bit-field-types).

`dev.R.write(F = v, ...)` makes one value from the named fields and stores
it one time. Each field that the call does not name is zero, or its fixed
value. Each bit outside the fields is zero, so `dev.R.write()` stores zero
in a register without fields. Each value must have the exact field type,
and a literal must fit in its field.

`dev.R.modify(F = v, ...)` loads a `readwrite` register one time, gives
each named field its value and each fixed field its fixed value, and
stores the value one time. Each other bit keeps the bit that the load
gave, so a change of some bits needs no mask constant. The fields and the
values follow the rules of `write`. The load comes before the values, and
the store after them. Here each call changes only the bits that it names,
and keeps each bit that the firmware set:

```wyst
// The PHY of a PCIe port of the Mac Studio. CFGACC lets the port change
// LANE_CFG. REFCLK0REQ asks for the reference clock, and REFCLK0ACK is 1
// when it runs.
#[register_map]
struct Phy {
  LANE_CFG: readwrite u32 at 0x0 { REFCLK0REQ: bool at 0, REFCLK0ACK: bool at 2 }
  LANE_CTL: readwrite u32 at 0x4 { CFGACC: bool at 15 }
}

#[mmio(0x5_8008_c000)]
const phy: Phy

fn start_clock() {
  phy.LANE_CTL.modify(CFGACC = true)
  phy.LANE_CFG.modify(REFCLK0REQ = true)
  for !phy.LANE_CFG.read().REFCLK0ACK {}
  phy.LANE_CTL.modify(CFGACC = false)
}
```

The compiler refuses a `write` of a `readonly` register, a `read` of a
`writeonly` register, and a `modify` of each:

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

## Big-endian registers

`#[big_endian]` before a register of type `u16`, `u32`, or `u64` makes
the register big-endian. A read reverses the bytes after the load, so
each field takes its bits from the reversed value, and a write reverses
the bytes of the value before the store. The fw_cfg device of QEMU virt
has such registers:

```wyst
#[register_map]
struct FwCfg {
  DATA:                   readonly  u8  at 0x00 { BYTE: u8 at 0..=7 }
  #[big_endian] SELECTOR: writeonly u16 at 0x08 { KEY: u16 at 0..=15 }
  #[big_endian] DMA:      writeonly u64 at 0x10 { ADDRESS: u64 at 0..=63 }
}

#[mmio(0x0902_0000)]
const fw_cfg: FwCfg

fn transfer(record: u64) {
  fw_cfg.SELECTOR.write(KEY = 0x19)
  fw_cfg.DMA.write(ADDRESS = record)
}
```

`wync fmt` keeps an attribute on the line of its register, or on the line
above it, as in the source. On the line of the register, the attribute is
a part of the name column. A bit field has no byte order of its own, so
an attribute before it is an error:

```wyst fails
#[register_map]
struct Device {
  CONTROL: readwrite u32 at 0x00 {
    #[big_endian] MODE: u16 at 0..=15
  }
}
```

```text
main.wyst:4:7: error: unknown attribute `big_endian` here
```

## What the compiler keeps

Each access is one load or store of the register size, with one `rev16`
or `rev` for a big-endian register, and `modify` is one load and one
store. Between them, one `and` clears each field whose value has a 0 bit,
and one `orr` for each field puts in its bits of value 1, so the code is
that of the mask form `dev.R.write(VALUE = dev.R.read().VALUE & ~m | v)`.
The compiler does not remove, combine, or move a device access, and it
adds no barrier. When the order of accesses to two devices matters, an
`asm` block gives the barrier, such as `dsb sy`. See
[Assembly](/docs/assembly/).
