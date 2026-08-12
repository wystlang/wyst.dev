---
title: "Storage and Allocation"
group: reference
section: memory-machine
order: 210
summary: "Explicit caller-owned storage and sealed core storage transitions."
---

# Storage and Allocation

Wyst has no implicit allocator, garbage collector, or container runtime.
Storage behavior comes from explicit source operations and selected target contracts.

This reference describes the bundled `core.storage` module.
[Memory Model](memory-model.md) defines typed memory proof.
[Semantic Operations and Hardware Declarations](semantic-operations.md) defines uninitialized storage boundaries.

## Runtime boundary

Normal calls use the selected ABI.
Language operations lower directly or call only an explicitly selected interface.

Declaring a value does not start an allocator.
Importing a core module does not start a runtime.
Dropping a copyable value does not call hidden cleanup code.

The compiler does not insert:

- heap allocation
- reference counting
- tracing or garbage collection
- allocator replacement
- hidden storage growth
- hidden lifetime extension

Code must obtain backing storage from source-visible data or an explicit external interface.

## Sealed core storage

`core.storage` is a sealed, bundled Wyst module.
Its functions are ordinary checked Wyst functions.
They do not name a hidden host runtime.

The module accepts caller-supplied `[]u8` backing.
`fixed_buffer_attach` validates the backing extent and creates a `FixedBuffer` authority.

The storage authority records explicit facts:

- storage identity
- generation
- intended storage use
- capacity and cursor
- live, consumed, abandoned, reserved, and committed byte counts
- alignment and metadata byte counts
- high-water usage

`StorageUse` has three values:

- `CallScopedScratch`
- `OutputOrSubsystem`
- `Permanent`

These values are explicit policy inputs.
They do not select a hidden allocator.

### Direct fixed-buffer transitions

The direct path uses these authority states:

```text
FixedBuffer + DestinationReservation
  -> FixedBuffer + InitializedDestination
  -> FixedBuffer + WrittenRegion
  -> FixedBuffer + view or closed region
```

`fixed_buffer_reserve` validates the requested range and alignment.
Initialization can zero bytes, copy bytes, or write one typed value.
The trusted initialization operation records a programmer assertion.

`destination_finish` creates a `WrittenRegion` only from initialized storage.
The caller can view that region or close it.
After closing every region, the caller can reclassify or close the owning buffer.

### Arena transitions

`arena_attach` converts a `FixedBuffer` into an `Arena` when its checks pass.
The arena owns the buffer authority and maintains explicit accounting state.

A normal allocation uses these authority states:

```text
Arena + Reservation
  -> Arena + InitializedReservation
  -> Arena + Allocation
```

The API also provides explicit operations for:

- cancellation
- allocation views and handles
- publication and retirement
- checkpoints and rewind
- scratch scopes
- last-allocation shrink or rewind
- allocation growth
- arena reset, detach, and abandonment

The exact transition surface is defined by the sealed module.
See its [storage protocol index](catalogs/language/core-storage-protocols.tsv) for names and signatures.

### Accounting and failure

Storage state types are opaque and use `must_account` where authority must be resolved.
Functions consume and return these values with `xfer`.

Fallible transitions return typed `Result` values.
Rejection values recover the authority needed for retry, cancellation, or closure where specified.

The compiler checks the source transition types.
It does not infer an arena transaction from an unrelated function name.

## External boundaries

External code can provide storage only through an explicit declaration and ABI contract.
The compiler does not infer ownership or lifetime from an address value alone.

Use `MaybeUninit<T>` for explicit output storage.
Use `initializes(...)` and `unchanged(...)` contracts for declared output behavior.
See [Semantic Operations and Hardware Declarations](semantic-operations.md#maybeuninitt-storage) for these operations.

Target entry contracts are described in [Entry Contracts](entry-contracts.md).
Link and ABI contracts are described in [ABI Specification](abi.md).
