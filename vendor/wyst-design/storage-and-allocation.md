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
`FixedBuffer.attach` validates the backing extent and creates a `FixedBuffer` authority.

Storage authorities record explicit facts:

- storage identity
- generation
- intended storage use
- capacity and cursor
- live and consumed byte counts
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

`FixedBuffer.reserve` accepts raw `offset` and `length` coordinates. It checks
`offset <= capacity` and `length <= capacity - offset`, so the bounds check
does not add the coordinates. It checks alignment at the selected address and
returns a reservation from the exact buffer.
Initialization can zero bytes, copy bytes, or write one typed value.
`DestinationReservation.initialize_value` validates the exact destination size
and alignment before it writes one typed value. The trusted initialization
operation records a programmer assertion.

`InitializedDestination.finish` creates a `WrittenRegion` only from initialized storage.
`WrittenRegion.view` returns its initialized view. The caller can also close
the region.
After closing every region, the caller can reclassify or close the owning buffer.

### Arena transitions

`arena_incarnation_assert_fresh` converts a provider value into an affine
attachment token. The caller asserts that the provider will not repeat that
value for the backing. The assertion carries `external_storage` trust through
direct calls, indirect calls, and semantic interfaces. Exhaustion retires the
backing. `Arena.attach` consumes the token and an authenticated `FixedBuffer`.
The arena owns the complete backing and maintains explicit accounting state.

A direct typed allocation is one atomic transition:

```text
Arena + initialization input
  -> Arena + @T
```

`Arena.allocate_value<T>` returns `Result<@T, ArenaFailure> from arena on .Ok`.
It performs all fallible arithmetic, capacity, bounds, and alignment checks
before it updates the Arena control state. The successful path validates one
exact typed destination, performs one complete typed store, and then updates
the Arena control state. The direct path does not create an
allocation record and does not perform a generation or bounds check on each
later load or store. Every typed failure leaves payload bytes, cursors, and
accounting unchanged.

Durable typed access is a separate recorded transition.
`arena_allocate_region_value<T>` returns `ArenaRegion<T>`. The type argument is
phantom and does not change the 56-byte handle representation. `arena_view<T>`
validates identity, generation, incarnation, sequence, metadata location,
payload bounds, exact type size, and alignment before it returns `@T`.

Byte allocations use `ArenaByteRegion`. `arena_allocate_zero` and
`arena_allocate_from` return this byte-specific handle, and
`arena_view_bytes` validates it before it returns `[]u8`. A typed region cannot
be passed to the byte-view operation, and user code does not use `relens` to
recover a type that was known at allocation.

Each durable allocation uses one 8-byte sequence record at the high end of the
backing. Direct typed allocations are record-free. Payload grows from the low
end. Allocation rejects a request if the payload and durable metadata ranges
would overlap. `ArenaFacts` reports exact capacity, cursor, live, consumed,
alignment-padding, high-water, backing-metadata, and control-metadata values.

Compiler-produced AArch64 measurements are 112 bytes for `Arena`, 8 bytes for
`ArenaIncarnation`, 56 bytes for `ArenaRegion<T>`, 56 bytes for
`ArenaByteRegion`, 72 bytes for `Checkpoint`, and 8 bytes for a direct `@u64`.
A durable allocation record is 8 bytes; a direct allocation adds no metadata.
A 4 KiB backing can hold 256 aligned recorded 8-byte allocations or 512 direct
aligned 8-byte allocations.

The API provides explicit operations for:

- `Arena.checkpoint` and `Arena.rewind`
- reset with byte preservation or full-backing zero sanitation
- full-backing `Arena.detach`
- explicit `Arena.abandon_storage`

Checkpoints are last-in, first-out. Keep and rewind reject a token that is not
the innermost token, and the rejection returns token authority. A rewind
restores allocation state but preserves the high-water value and the monotonic
sequence source. `CallScopedScratch` rejects checkpoint keep, so scratch work
must rewind. `Permanent` storage rejects reset and detach.

Reset advances the generation and retains the complete backing. Detach
advances the generation and returns the complete `FixedBuffer`. Reattachment
requires a fresh external incarnation. Active checkpoints reject reset and
detach. Zero sanitation overwrites the complete backing and does not preserve
private lifecycle bytes.

Direct views carry compiler-only Arena chronology. Another allocation,
checkpoint creation, checkpoint keep, or validation preserves an existing
view. A successful rewind invalidates only direct views allocated after the
selected checkpoint; older direct views remain usable. A successful reset,
detach, reattachment, or transfer of the Arena authority invalidates all
dependent direct views. A failed reset or rewind preserves them. These rules
add no pointer tag, borrow counter, allocation registry, or runtime validity
check.

The Arena does not provide suspended transactions, publication, growth,
last-allocation mutation, or an independent scratch hierarchy.

The exact transition surface is defined by the sealed module.
See its [storage protocol index](catalogs/language/core-storage-protocols.tsv) for names and signatures.
The migrated transition declarations have no flat-name aliases.

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
