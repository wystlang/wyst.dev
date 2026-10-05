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

### Typed slot pools

`SlotPool<T>` allocates fixed-size slots in caller-supplied backing. `T` must
satisfy `copyable_discardable` and have nonzero size. This bound is the existing
typed-storage boundary. The pool does not store affine or terminal values;
those values need an ownership-aware initialization and removal protocol.

`slot_pool_incarnation_assert_fresh` creates an affine attachment token. The
provider asserts that its value will not repeat for the same backing. This
assertion carries `external_storage` trust. `SlotPool.attach<T>` consumes an
authenticated `FixedBuffer`, the token, and an explicit slot capacity. It
returns both authorities on failure, without changing any backing byte.

Attachment requires natural alignment for `T` and enough backing for
`capacity * (size_of(T) + 9)` bytes. The capacity check uses division before
multiplication. Payload slots occupy the low end of the backing. Each slot
has one eight-byte generation and one lifecycle byte in a separate metadata
range. Attachment initializes metadata only. Any remaining bytes are unused.
Zero capacity is valid. Zero-sized element types are rejected.

`slot_pool_allocate` scans for the first free slot. It performs a complete typed
write before it marks the slot live and returns `SlotHandle<T>`. There is no
public reservation or partially initialized handle. Exhaustion changes no
payload, metadata, or accounting. The handle is opaque and copyable. It records
backing identity, attachment incarnation, slot index, and generation.

`slot_pool_view` checks all four handle fields and the slot's live state before
it returns `mut Result<@T, SlotPoolFailure> from pool on .Ok`. The successful
address holds an exclusive loan on the pool and its backing. Loads and stores through
that address do not repeat handle validation. Each new view operation validates
the handle again. The ordinary loan checker rejects pool mutation or transfer
while a dependent view remains in use. This rule also covers derived views and
views carried in aggregates. It conservatively excludes operations on other
slots until the last use of the view.

`slot_pool_release` validates the handle before it changes the slot. It
increments the generation and makes the slot free. Releasing generation
`u64.MAX` retires the slot permanently for that attachment. Generation never
wraps. A released or retired slot is inaccessible through its old handle, and
reuse does not move any other live value. Release leaves payload bytes intact;
it provides no sanitation or cleanup callback.

`slot_pool_facts` reports live, free, and retired slot counts and payload bytes,
backing metadata bytes, unused bytes, full backing extent, and control metadata
size. `SlotPool.detach` requires an empty pool and rejects permanent storage.
Failure returns the pool authority. Success returns the complete `FixedBuffer`;
reattachment requires a fresh incarnation. `SlotPool.abandon_storage` explicitly
ends pool authority, including authority over any remaining live slots.
Backing allocation and provider release remain external.

The pool has no membership iteration, compaction, growth, fallback allocator,
free list, synchronization, or hidden cleanup. Collection operations belong to
`SlotMap<T>`, described below.

The [slot pool fixtures](../wync/tests/fixtures/slot-pool/src/slot_pool_tests.wyst)
and [integration tests](../wync/tests/slot_pool.rs) check the lifecycle, backing
extents, native construction, handle rejection, and view lifetime rules.

### Stable-handle slot maps

`SlotMap<T>` is an ordinary caller-backed container over `SlotPool<T>` in
`core.storage`. It has the same `copyable_discardable`, nonzero-size, alignment,
and capacity requirements. `SlotMap.attach` consumes the backing and fresh pool
incarnation. Attachment failure returns both authorities without writes.
The map exclusively owns its pool: each live pool slot is one map member.
Clients cannot access the pool field or add raw pool slots to the population.
There is no separate membership allocation or duplicate population counter.

`slot_map_insert` initializes a complete typed value through the pool before
publication and returns `SlotHandle<T>`. `slot_map_insert_with<T, E>` checks
capacity before it calls the explicit `fn() -> Result<T, E> effects(none)`
initializer. Both `T` and `E` must be copyable and discardable. An initializer
error returns `SlotMapInsertFailure.Initialization(E)` without changing map
backing, generations, or membership. Full or retired capacity returns
`.Storage(.Exhausted)` without calling the initializer. The initializer uses
the declared effect and access contract. No partially initialized slot
or reservation escapes either insertion operation. Publication means map
membership; it does not imply cross-agent memory publication.

`slot_map_get` returns a checked value copy. `slot_map_view` returns an exclusive
borrowed address `from map on .Ok`. Both validate backing identity, incarnation,
index, live state, and generation through the pool. The address remains stable
until removal or clear. A live view prevents map mutation or transfer until its
last use, including when a derived view is carried in an aggregate.

`slot_map_remove` returns the removed value and releases its slot. Old handles
are invalid before reuse. The pool advances the generation or retires its last
generation without wrapping. Other values remain in place. `slot_map_clear`
releases each live member in increasing slot-index order and returns the empty
map's facts. It does not read or copy payloads, reset generations, reclaim
retired slots, sanitize bytes, or release backing. Clearing an empty map is
valid. Failed access, removal, insertion, and detach preserve map state.

`slot_map_next(map, start_index)` scans live slots in increasing slot-index
order. Start at zero and pass the returned `SlotMapEntry.next_index` to the next
call. Each entry contains a checked value copy and its typed `slot` handle.
Holes and retired slots are skipped. A start index at or beyond capacity returns
`.None`. Reuse returns to the original index; iteration is not insertion order.
Each call observes current membership, not a frozen snapshot. Mutation between
calls can omit new members below the cursor; restart at zero for a new traversal.
Returned handles must be checked again on access. Iteration never moves values.

`slot_map_facts` reports `len`, the complete pool accounting, and map control
metadata size. `len` equals `pool.live`; live, free, and retired counts sum to
capacity. The map adds no backing metadata. `SlotMap.detach` requires an empty
map and non-permanent backing, and returns the complete `FixedBuffer`. Rejection
returns the map authority. Reattachment requires a fresh pool incarnation.
`SlotMap.abandon_storage` explicitly ends the map authority. Neither operation
releases provider storage.

Insert scans at most capacity slots. Get and view validate one slot; remove
validates before copying and before release. A complete traversal or clear scans
at most capacity slots. These bounds exclude initializer work and element-copy
cost. The map provides no arbitrary user keys, compaction, swap-back removal,
growth, hidden allocation, synchronization, or ownership-aware element cleanup.

The [slot map fixtures](../wync/tests/fixtures/slot-map/src/slot_map_tests.wyst)
and [integration tests](../wync/tests/slot_map.rs) check membership, failure
atomicity, deterministic iteration, retirement, native construction, and loans.

### Bounded ring buffers

`core.storage.RingBuffer<T>` is an ordinary bounded deque over a caller's
initialized typed storage. `T` must satisfy `copyable_discardable`.
Normal storage checks also reject payloads that carry a resource loan.
`RingBuffer.attach<T>(mut backing)` takes an exclusive loan of a `[]T` slice,
including an explicit slice of `[N]T` storage. The slice length is the runtime
capacity. Attachment starts with no members and does not read or write backing
elements. Raw `MaybeUninit` storage is not accepted. The backing values are
initialized before attachment; the ring's initialized logical population is
tracked separately by `len` and the physical front index `head`. Clients cannot
forge or change these opaque fields. There is no capacity type argument.

`ring_buffer_facts` reports capacity, length, and head. Length is at most
capacity. For nonzero capacity, head is less than capacity. An empty ring has
head zero. Index calculation subtracts before addition to avoid integer wrap.

`ring_buffer_push_front` and `ring_buffer_push_back` write one complete value
before adding it to the population. They return `Result<Unit, T>`: success
returns `.Ok`, and a full ring returns the input in `.Error` without changing
metadata or backing. `ring_buffer_pop_front` and `ring_buffer_pop_back` return
`Option<T>`. A successful pop copies one member and removes its membership;
an empty pop returns `.None` without changes. Other members stay in place.

`ring_buffer_overwrite_front` and `ring_buffer_overwrite_back` are separate,
explicit overwrite operations. Their result is `Result<Option<T>, T>`.
For a full nonempty ring, they remove and return the opposite-end member in
`.Ok(.Some(value))`, then insert at the requested end. Available capacity returns
`.Ok(.None)`. Zero capacity returns the input in `.Error` without changes.
Ordinary push never selects overwrite behavior.

`ring_buffer_front` and `ring_buffer_back` take `mut ring` and return optional
exclusive addresses to current members. `ring_buffer_spans` takes `mut ring`
and returns exclusive `first` and `second` slices in front-to-back order.
Their lengths sum to the population length; neither includes unused capacity.
The second span is empty when the population does not wrap. These views permit
element mutation and borrow exclusively from the ring. Other ring mutation and
transfer are rejected until the views and their derived aliases reach their
last use. The caller
cannot access overlapping backing while the ring's exclusive backing loan is
live. No runtime borrow counter is required.

Iterate the first span and then the second, or use
`ring_buffer_next(ring, index)`. Start at zero and pass each returned
`RingBufferEntry.next_index` to the next call. Each entry contains a value copy.
An index at or beyond the current length returns `.None`. The index describes
the current logical order, not a stable handle. Mutation between calls can
change that order; restart at zero for a new traversal.

`ring_buffer_linearize(ring, mut destination)` explicitly copies the logical
sequence into separate caller-provided initialized storage. It returns a
slice of the written prefix borrowed from the destination. The ring and the
destination tail stay unchanged. An insufficient destination returns
`RingBufferCopyFailure {required, available}` before any write. Overlapping
ring backing and destination loans are rejected. This operation does not
rearrange ring storage or allocate a temporary buffer.

`ring_buffer_clear` sets length and head to zero. `ring_buffer_close(xfer ring)`
ends the ring authority and its backing loan, including for a nonempty ring.
Both preserve backing bytes. Neither reads, moves, erases, destroys, or releases
elements or provider storage. This behavior requires discardable elements;
resource-owning values need a different explicit lifecycle contract.

All operations take constant work except linearization, which copies exactly
length elements, and a full traversal, which visits exactly length elements.
These bounds exclude element-copy cost. The ring has no growth, allocation,
synchronization, hidden compaction, or automatic linearization. It supplies
queue and deque behavior without separate `Queue` or growing-deque wrappers.
A separate `ArrayBuffer` needs a stack consumer and its own contract.

The [ring fixtures](../wync/tests/fixtures/ring-buffer/src/ring_buffer_tests.wyst)
and [integration tests](../wync/tests/ring_buffer.rs) check sequence order,
wrapping, explicit overwrite, destination copies, failure atomicity, and loans.

## Scalar SPSC rings

`core.storage.SpscRing<T>` transfers unsigned scalar values between one
producer and one consumer. `T: unsigned_integer` includes unsigned nominal
numbers. A scalar contains no outgoing storage reference. Addresses, slices,
structs, local-agent values, and graphs do not satisfy this constraint. This
API neither transfers mutable graphs nor makes a copied pointer sendable.

The caller first uses `spsc_assert_permanent(base, bytes)`. This is an explicit
external-storage assertion, not a proof derived from a numeric address. The
provider asserts that the whole extent is initialized, writable, coherent
Normal memory, has no other user, is admitted once, and remains reserved for
the entire program. No later external access may race with a ring operation.
The assertion uses the existing `external_storage` trust boundary. Internal
atomic addresses use the existing `raw_address` boundary.
Inspection retains those trust facts. A stack address, temporary allocation,
or ordinary exclusive slice loan cannot satisfy this lifetime assertion.
The compiler cannot validate the provider's physical ownership or lifetime.

The resulting opaque affine `SpscPermanentBacking` can be consumed by
`spsc_ring_attach<T>(backing, capacity)`. Attachment validates 128-byte base
alignment, the target cache line width (at most 128 bytes), and space for
`384 + capacity * sizeof(T)` bytes without overflow. Zero capacity is valid.
The backing assertion checks the complete extent for address overflow first.
Rejection returns the backing, without initializing ring metadata. A caller
can retry with a smaller capacity. Successful attachment initializes metadata
and returns one opaque affine ring; it does not allocate or clear payloads.

`spsc_ring_split` consumes that ring and returns one opaque affine
`SpscProducer<T>` and one `SpscConsumer<T>`. Each endpoint has one owner. Tasks
on a CPU must serialize use of that CPU's endpoint. An interrupt cannot act
as a second concurrent producer. Endpoint handoff before use requires provider
publication; descriptor movement alone does not publish backing memory.

| Operation | Result and bound |
| --- | --- |
| `spsc_try_push(mut producer, value)` | `Accepted`, `Full(value)`, or `Closed(value)`; one attempt |
| `spsc_try_pop(mut consumer)` | `Value(value)`, `Empty`, or `Closed`; one attempt |
| `spsc_try_push_batch(mut producer, values)` | Accepted prefix length, unaccepted suffix, and `Complete`, `Full`, or `Closed`; at most the input length attempts |
| `spsc_try_pop_batch(mut consumer, mut destination)` | Written prefix length and `Complete`, `Empty`, or `Closed`; at most the destination length attempts |
| `spsc_close_producer(producer)` | Consumes the endpoint, release-publishes closure, and returns a closed-producer receipt |
| `spsc_finish_consumer(consumer)` | Returns a closed-consumer receipt only after close and drain; rejection returns the live consumer |
| `spsc_ring_reset(producer_receipt, consumer_receipt)` | Consumes matching receipts and returns a new ring generation; rejection returns both receipts |

Each accepted push enters FIFO order. The accepted part of a batch has input
order; a batch is not one atomic transaction. Full and closed pushes retain
the exact value and do not enqueue it. A pop copies the scalar and releases
the slot. Batch pop leaves the unused destination suffix unchanged. There is
no element destructor, hidden allocation, blocking, parking, fallback lock,
or retry. Each individual try operation has bounded source work, with no
contention loop. End-to-end progress still requires both agents to execute;
there is no fairness or delivery guarantee. A caller owns all explicit retry.

Producer tail and closure occupy offsets 0 and 8. Consumer head and completion
occupy offsets 128 and 136. Generation occupies offset 256. Payload starts at
384. Metadata words are aligned `atomic<u64>` values. The two writers have
separate 128-byte metadata lines; payload slots can share a line. There is no
per-slot sequence array: unique endpoint ownership and the two monotonic
cursors determine slot ownership. Producer release of tail publishes the
initialized slot. Consumer acquire of tail precedes its slot read. Consumer
release of head ends that read; producer acquire of head precedes slot reuse.
Only the one owned slot receives a temporary typed view during each access.

Physical slot indices wrap modulo capacity. Logical cursors never wrap. When
a producer cursor reaches `u64.MAX`, its next push closes the producer and
returns the value; prior accepted values still drain. Pop acquires closure
before reading the final tail so an earlier empty observation cannot conceal
an accepted final value. Empty-open and drained-closed are distinct states.

Reset requires both consumed endpoints, matching backing/capacity/generation,
closed producer, finished consumer, and equal head and tail. Thus no legal
endpoint operation or slot view can remain live. Reset clears the counters
and flags, then release-publishes the next generation. Old descriptors reject
access after reset. At generation `u64.MAX`, reset rejects and returns both
receipts; generation never wraps. Endpoint drops cause no implicit close,
destruction, or deallocation. Lost endpoints can prevent reset permanently.
The backing remains reserved even after reset or descriptor loss; this API
has no detach or reclaim operation.

The [behavioral fixture](../wync/tests/fixtures/spsc-ring/src/spsc_tests.wyst),
[rejection tests](../wync/tests/spsc_ring.rs), memory-model litmus tests, and
[native AArch64 checks](../wync/tools/spsc-ring/README.md) cover the selected
scalar contract. They do not establish a kernel's park/wake or idle protocol.

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
