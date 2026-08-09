---
title: "Semantic Operations and Hardware Declarations"
group: reference
section: memory-machine
order: 220
summary: "Closed semantic operations, declared hardware access, target services, and MaybeUninit storage."
---

# Semantic Operations and Hardware Declarations

Semantic operations have compiler-owned identities and contracts.
They do not use a general intrinsic syntax.

The closed index is the [semantic operation catalog](catalogs/language/semantic-operation-catalog.tsv).
This reference describes the source families without copying that index.

## Closed operation surface

An operation is available only through its registered source form.
A user function with the same leaf name remains an ordinary function.

The compiler checks the selected target before it lowers a target-dependent operation.
The check includes architecture, features, exception level, and environment where applicable.

Operations use three source forms:

- qualified members of sealed core namespaces
- compiler-owned methods on specific types
- compiler-owned language forms such as `uninit<T>()`

The sealed `core.arch` namespace has six categories:

- `cpu`
- `barrier`
- `cache`
- `tlb`
- `exception`
- `memory`

Import a category and call its qualified member.
The import creates no wrapper or runtime dispatch.

<!-- wyst-contract: check-pass -->
```wyst
module operations.wait

import core.arch { barrier, cpu }

fn wait() {
  barrier.compiler()
  cpu.wfe()
}
```

Architecture categories provide CPU hints, barriers, cache maintenance, TLB maintenance, exceptions, and non-temporal pair access.
The selected operation owns its argument, privilege, effect, and ordering rules.

[Memory Model](memory-model.md) defines atomic methods and memory ordering.
[SIMD](simd.md) defines vector operations.
[Checked Assembly](checked-assembly.md) defines checked assembly.

## Checked core operations

The sealed `core.checked` namespace provides checked construction and conversion operations.

The current families cover:

- indexes and ranges
- numeric conversion
- byte, element, and physical-address offsets
- alignment
- byte, element, and physical extents
- containment
- field encodings
- generation values

A fallible checked operation returns a typed `Result`.
Most such results use `must_observe`.
Source must match, return, or explicitly discard the result as its type permits.

Successful operations retain their checked facts in typed IR.
They do not start an allocator or consult a runtime registry.

The `trusted_slice<T>` and `trusted_mut_slice<T>` forms accept raw address bits and an element count.
They return a `must_observe Result`.
Success is an explicit external-storage trust boundary.

These forms check representable extent and natural alignment.
They assert the remaining external storage facts required by their contract.
They do not apply to MMIO, volatile, atomic, or uninitialized storage.

## `MaybeUninit<T>` storage

`MaybeUninit<T>` reserves storage without creating a typed value.
It has the size and alignment of `T`.
It has no hidden bytes.

`T` must have the `copyable_discardable` abilities.
The wrapper itself is opaque and noncopyable.
It cannot be embedded in a struct or fixed array.
It cannot be returned by value.

`uninit<T>()` creates activation-local storage.
Module storage cannot use this constructor.
An address to the storage has type `@MaybeUninit<T>` and must be `noescape` at call boundaries.

The whole-storage operations are:

| Operation | Contract |
| --- | --- |
| `uninit<T>()` | Reserve uninitialized storage without a write. |
| `.write(value)` | Perform one complete typed write. |
| `.read()` | Read after complete initialization is proved or asserted. |
| `.read_uninit()` | Observe indeterminate bits while initialization is unproved. |
| `.assume_init()` | Assert complete initialization and return the typed value. |

<!-- wyst-contract: check-pass -->
```wyst
module operations.output

fn copy(value: u64) -> u64 {
  var slot = uninit<u64>()
  slot.write(value)
  return slot.read()
}
```

`.read()` requires complete initialization on every incoming control-flow path.
One complete `.write()` establishes that fact.
Repeated `.read()` operations are permitted while the fact remains valid.

`.read_uninit()` is available only before complete initialization is proved.
`T` must be bit-total and authority-free.
The operation does not establish initialization.

`.assume_init()` is also available only while complete initialization is unproved.
It records an asserted initialization fact.
It cannot create an address, slice, or callable authority from raw bits.

`addr_of(slot)` returns the exact raw-storage address lens.
That address provides `.write(value)` but no ordinary `.load()`.
An opaque call can invalidate an initialization proof unless its contract preserves it.

A callable can declare `initializes(...)` or `unchanged(...)` storage postconditions.
An initialization guarantee can name the complete object or an exact projection.
A projected guarantee does not establish complete-object initialization.
Outcome-gated guarantees apply only on their declared result variants.

Raw-storage loans cannot cross an execution-suspension boundary.
See [Scheduling and Suspension](scheduling-and-suspension.md) for suspension rules.

## MMIO register declarations

`register_map` defines reusable MMIO register structure.
`mmio` places a register map or one scalar register at a constant address.

Register backings are `u8`, `u16`, `u32`, or `u64`.
Each register is `readonly`, `writeonly`, or `readwrite`.
Fields can narrow that access mode.

Artifact construction requires an exact mapping in the selected platform contract.
The mapping covers the range, register cell, width, and peripheral identity.
Dynamic raw MMIO addresses do not satisfy this contract.

<!-- wyst-contract: check-pass -->
```wyst
module operations.uart

#target(arch = arm64-v8a, cpu = generic, el = 2)

register_map Pl011 {
  DR: readwrite u32 at 0 {
    DATA: u8 at 0..=7
  }
}

mmio UART0: Pl011 at 0x0900_0000

fn send(value: u8) {
  UART0.DR.write(DATA = value)
}
```

`.read()` performs one full-width volatile read.
It returns a nominal snapshot for a mapped register.
Snapshot field reads and `.raw` use the captured value.
They do not read the device again.

Raw `.write(value)` performs one full-width volatile write.
Named `.write(FIELD = value)` builds one backing value and performs one write.
It applies declared field and reserved-bit policies.

`.modify(FIELD = value)` performs one full-width read and one full-width write.
It is available only when the declared policies permit that exact sequence.
It is not an atomic operation.

The compiler rejects invalid field ranges, overlaps, access directions, and policy combinations.
Hardware action fields describe the written action mask, not the resulting device state.

Each declared MMIO read or write is verified against its exact volatile access.
No operation adds a retry or architectural barrier.
See [Memory Model](memory-model.md#volatile-and-mmio-access) for ordering limits.

## System register declarations

`system_register` declares an authenticated A64 system register.
The backing type is `u64`.
The declared access mode cannot exceed the cataloged access directions.

A catalog declaration uses the exact canonical register name.
An encoded extension declaration must resolve to an authenticated target-extension row.
An unknown encoding is rejected.

`.read()` emits one authenticated `mrs` and returns a nominal snapshot.
`.write(value)` emits one authenticated `msr`.
Named write and modify use the same field-policy engine as register maps.

The compiler checks target features, exception level, access direction, and register availability.
A declaration cannot create or override an architecture fact.

Each system-register access is a full compiler memory fence.
It does not imply or emit `dmb`, `dsb`, or `isb`.
Required architectural sequencing must be explicit.

## Environment, provider, and trap operations

`core.environment.semihost.call(operation, parameter)` is available only for a selected compatible environment service.
On A64, it uses `x0` and `x1`, emits `hlt #0xf000`, and returns `x0`.

The call is an `environment_contract` trust boundary.
Its numeric arguments do not provide compiler-proved memory authority.
The programmer supplies the host-address and lifetime contract for the synchronous call.

`core.execution.suspension_point()` is a provider marker.
It emits no instruction.
It is not a general yield operation.
[Scheduling and Suspension](scheduling-and-suspension.md) defines its permitted placement.

`core.trap.fatal(reason)` terminates control flow.
The reason has type `u16` and is placed in `x0`.
The A64 lowering emits `brk #0xf001`.

## Target-selected state

`cpu.read_counter()` requires one selected measurement-counter descriptor.
The built-in A64 targets select `a64-generic-virtual-counter`.

The operation reads `CNTVCT_EL0` once and returns `u64`.
It is a compiler memory fence and source scheduling boundary.
It emits no architectural barrier and does not read the counter frequency.

Two results are raw counter samples.
The operation does not define elapsed time, seconds, endpoint comparability, or serialization.

Direct `per_cpu` access requires `per_cpu = single_instance_tpidr_el1`.
Each access reads the `per_cpu` live base from `TPIDR_EL1` again.
The compiler does not allocate instances or install that base.

`#percpu_offset_of(binding)` returns the linked template offset.
It does not acquire a `per_cpu` live base.
`#addr_of` cannot expose a `per_cpu` address.

See [Functions and Control Flow](functions-and-control-flow.md#per_cpu-var) for the declaration and access rules.
