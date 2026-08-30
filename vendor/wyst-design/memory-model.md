---
title: "Memory Model"
group: reference
section: memory-machine
order: 200
summary: "Typed memory proof, volatile and MMIO access, atomics, and ordering."
---

# Memory Model

This reference defines Wyst memory access contracts.

[Type System](type-system.md) defines address and slice types.
[Checked Assembly](checked-assembly.md) defines checked assembly.
[Semantic Operations and Hardware Declarations](semantic-operations.md) defines semantic hardware operations.

## Typed memory proof

The compiler checks required memory facts in typed IR.
Artifact construction fails when a required fact is unproved or violated.

The proof tracks five dimensions:

| Dimension | Required fact |
| --- | --- |
| bounds | The access stays in the authorized range. |
| usable extent | The storage covers the complete access. |
| alignment | The address meets the type alignment. |
| initialization | The complete read value is initialized. |
| lifetime | The storage is live for the access. |

Each dimension has one of these states: proved, asserted, unproved, violated, or not required.
An assertion authenticates only the dimensions that its operation declares.

Different operations require different facts:

| Operation | Required dimensions |
| --- | --- |
| form a typed address | bounds, usable extent, alignment, lifetime |
| read | all five dimensions |
| write | bounds, usable extent, alignment, lifetime |
| read-modify-write | all five dimensions |
| checked assembly memory use | facts derived from authenticated instruction rows and typed binders |

A write does not require the previous value to be initialized.
A read-modify-write reads the previous value and therefore requires initialization.

A forwarding checked subscript authenticates only the bounds dimension. Its
success path uses the exact captured base descriptor and the authenticated
index or range from `core.checked`. Usable extent, alignment, initialization,
lifetime, access authority, aliasing, and concurrency remain separate proof
obligations. Its failure path forms no typed address and performs no memory
operation.

The analysis is flow-sensitive and interprocedural.
It tracks at most eight pointer alternatives at one merge.
It performs at most 64 interprocedural rounds.
An exceeded limit rejects artifact construction.

The separate concurrency summary visits at most 1024 instantiated bodies per
root. An exceeded limit also rejects artifact construction.

The proof does not add dynamic checks.
It does not treat an unproved fact as optimizer permission.
It does not prove device protocols, DMA ownership, or complete concurrency protocols.

## Typed addresses and views

`@T` carries a typed storage authority and machine address bits.
`[]T` also carries a length.

Field projection, element projection, and slicing narrow the authority.
They do not create additional usable extent.

Address arithmetic is explicit.
Use `byte_offset` or `element_offset` where the type permits that operation.
The resulting access must still pass typed memory proof.

Raw integer conversion does not restore earlier authority.
Raw address construction is an explicit assertion boundary.
See [Type System](type-system.md#explicit-conversions) for the source forms.

An outcome-qualified returned-view relation attaches authority only to the
selected enum payload. For example, `from arena on .Ok` lets the `.Ok` payload
retain the Arena storage identity and lifetime. The `.Error` outcome has no
such authority. WYSTIF transports this relation for calls compiled without the
producer source.

`core.text.from_bytes` preserves the exact source byte-slice provenance on
`.Ok`; validation does not copy or allocate. A checked string slice narrows
that authority to its selected byte range after bounds and UTF-8 boundary
checks. A failed validation or slice creates no string view.

`ScanCursor` retains a view of its input and an offset. `remaining` and
`take_until` return narrowed views of the same input. A staged `scan.read`
success can contain string captures from its input, so
`Result<Record, ScanFailure> from input on .Ok` carries those leases. Its error
outcome carries no input view. Cursor mutation changes only the offset and does
not extend the input lifetime or create storage authority.

`core.fmt.cursor_written_string` validates the written prefix and returns a
view of the cursor backing storage on `.Ok`. Existing invalidation rules for
the mutable backing storage remain in force. The view has no copy, allocation,
or hidden ownership transfer.

Direct Arena allocations return ordinary typed addresses. A later load or
store performs no hidden generation, sequence, or bounds check. The compiler
invalidates those addresses after a successful reset, after a checkpoint
rewind that reclaims their allocation, and after detach, reattachment, or
backing-authority transfer. It preserves an older address across a rewind to a
later checkpoint and preserves all addresses when reset or rewind returns an
error. See [Storage and Allocation](storage-and-allocation.md).

## Volatile and MMIO access

`@volatile T` makes each access a volatile access.
The access has the `volatile_access` effect.

`@mmio T` preserves MMIO intent and volatile access.
The access has both `mmio` and `volatile_access` effects.

Creating or qualifying an address is not an access.
These operations do not produce an access effect by themselves.

Ordinary, volatile, and MMIO address qualifiers do not convert implicitly.
Use the explicit qualifier operations described in [Type System](type-system.md).

Artifact construction requires an exact selected-platform mapping for MMIO.
A constant raw MMIO address must identify a known mapped cell or range.
A dynamic raw MMIO address has no transported mapping identity and is rejected.

A register-map instance transports authenticated mapping identity as a typed
value. Its runtime base address is accompanied in compiler semantics by a
nonempty set of placed-declaration origins. Each register access must fit the
schema and every possible origin's selected-platform mapping. Copying,
aggregate storage, generic materialization, imports, and control-flow joins
preserve that evidence; a join takes the union of its inputs' origins.

Observing or reproducing the base-address bits does not reproduce placement
authority. Address construction, qualification, relensing, numeric conversion,
bitcasting, foreign input, and ordinary literals cannot create a register-map
instance. An incompatible target cannot consume an imported origin even when
its numeric address happens to match.

Volatile and MMIO access do not provide atomicity or synchronization.
They do not configure caches, translation, shareability, or DMA ownership.
Use explicit semantic operations for those protocols.

## Atomic storage

`atomic<T>` is typed atomic storage.
`@atomic<T>` is an address to that storage.
Use `atomic<T>(value)` to initialize an atomic object.

Atomic storage has the size and natural alignment of `T`.
It has no hidden bytes.
It is noncopyable.

Supported scalar elements are:

- `bool`
- `u8`, `u16`, `u32`, and `u64`
- `i8`, `i16`, `i32`, and `i64`
- an admitted one-target-word address value

Ordinary loads, stores, copies, volatile access, and MMIO access cannot access atomic storage.

Raw construction is available only as `address<@atomic<T>>(raw)` inside an executable function.
The compiler requires natural alignment and Normal memory.
Provable misalignment and known device memory are rejected.
A dynamic case remains an explicit programmer assertion.

The current methods are:

| Method | Element kinds | Result |
| --- | --- | --- |
| `load` | all supported elements | loaded value |
| `store` | all supported elements | none |
| `exchange` | all supported elements | previous value |
| `compare_exchange` | all supported elements | `observed` and `exchanged` |
| `fetch_add`, `fetch_sub` | integers | previous value |
| `fetch_and`, `fetch_or`, `fetch_xor` | integers | previous value |
| `test_and_set_bit`, `test_and_clear_bit` | integers | previous bit value |

`compare_exchange` is strong.
It retries a failed store-exclusive when the observed value still matches.

Bit operations require a compile-time `u32` bit index.
The index must fit the element width.

The closed method and type details are in the [atomic matrix](generated-atomic-matrix.md).

## Atomic orders

Wyst has five atomic order names:

- `relaxed`
- `acquire`
- `release`
- `acq_rel`
- `seq_cst`

Legal orders depend on the operation:

| Operation | Legal orders |
| --- | --- |
| load | `relaxed`, `acquire`, `seq_cst` |
| store | `relaxed`, `release`, `seq_cst` |
| read-modify-write | all five orders |

Acquire applies to observations after the operation.
Release applies to observations before the operation.
`acq_rel` combines both directions for a read-modify-write.

On A64, relaxed loads and stores use plain instructions.
Acquire loads use acquire instructions.
Release stores use release instructions.
`seq_cst` loads and stores use the same acquire and release forms.
The compiler does not add an implicit `dmb` for `seq_cst`.

Read-modify-write uses LSE when the selected profile enables LSE.
Other profiles use an LL/SC loop.
The LL/SC loop retries until success or a comparison mismatch.
It has no retry limit, timeout, fallback lock, helper call, or allocation.
This contract does not make each agent wait-free.

## Barriers and ordering

Atomic order and architectural barriers are separate contracts.

`barrier.compiler()` constrains compiler motion only.
It emits no machine instruction.

The `dmb` and `dsb` operations take one explicit barrier option.
That option encodes the domain and access class.
The `isb` operation takes no source argument.

The compiler does not add barriers around volatile or MMIO accesses.
The source must select the barrier required by the device or sharing protocol.

See [Semantic Operations and Hardware Declarations](semantic-operations.md) for the closed barrier operations.
See [Scheduling and Suspension](scheduling-and-suspension.md) for agent and scheduling contracts.
