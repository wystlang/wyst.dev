---
title: "Chapter 10: Wyst Runtime And Allocation"
group: chapter
chapter: 10
order: 10
summary: "Explicit allocation direction, arenas, storage contracts, dynamic arrays, handles, buffers, and runtime boundaries."
---

# Chapter 10: Wyst Runtime And Allocation

The runtime and allocation boundary is expressed through library and runtime
contracts. Storage contracts, the bootstrap dynamic-array descriptor, typed
handles, and buffer/string APIs remain explicit rather than hidden allocation
or runtime-owned containers.

Allocation is described as visible storage contracts rather than hidden
language behavior. The memory model and the storage and library contracts
remain separate concerns.

## Bootstrap Dynamic-Array Descriptor

The ordinary explicit generic declaration with canonical identity
`core.collections.DynamicArray` is a bootstrap descriptor retained for layout
migration and foreign inspection. It is not a prelude type and must be obtained
from the sealed compiler-provided module before its local binding is applied as
`DynamicArray<T>` (or through an import qualifier/alias):

<!-- wyst-contract: check-pass -->
```wyst
module packet.queue

import core.collections { DynamicArray }

fn process(values: @DynamicArray<u8>) {
  // descriptor inspection is explicit
}
```

A whole public or private `import core.collections` is also valid and exposes
the type as `collections.DynamicArray<T>`; selective imports may use a local
alias, and `pub import` may re-export the authenticated declaration under the
ordinary source-visibility rules.
`DynamicArray` has a compiler-owned descriptor role, selected by its exact
sealed module and declaration identity rather than by its qualified or
unqualified spelling. The compiler validates the bundled declaration's field
shape and reports descriptor annotations. A project declaration with the same
name cannot acquire the role or replace the sealed module.

In particular, ordinary functions named
`arena_storage_init`, `byte_storage_*`, `dyn_array_*`, `typed_handle_*`,
`buffer_*`, or `c_string_*` are ordinary typed APIs: their spelling alone
creates no allocator, storage, movement, container, runtime, retention,
lowering, effect, or report fact. `wync explain storage` reports compiler-owned
`DynamicArray<T>` descriptor uses only. The compiler recognizes no initializer
or mutation method for it.

`DynamicArray<T>` preserves only the explicit
`wyst.dynamicArrayDescriptor` storage representation described below. It
participates in parsing, type checking, explicit generic instantiation,
linking, debugging, and dead-code elimination like ordinary bundled generic
library code. Importing, declaring, zero-initializing, projecting, indexing, or
comparing the descriptor performs no allocation, cleanup, synchronization,
retry, looping, storage attachment, or runtime call. Storage-owning wrapper
APIs are ordinary source code and must make every such behavior explicit.

## Thesis

Wyst should preserve explicit control over storage. Allocation belongs in visible
APIs, generated bindings, standard-library modules, or target/runtime profiles,
not in implicit language behavior.

## Core Rules

- Generated code must not perform hidden global allocation.
- The language must not add implicit region inference, garbage collection,
  allocator replacement, or hidden lifetime extension.
- Allocation vocabulary starts as library/API contracts, not core syntax.
- Storage context should be passed explicitly when an API needs caller-owned
  memory.
- Generic allocator interfaces may exist later, but they must not erase the
  lifetime and reset behavior that make arenas useful.

## Arena-First Vocabulary

The allocation vocabulary makes arena contracts concrete:

- backing storage or growth policy;
- alignment requirements;
- zeroed or uninitialized allocation behavior;
- failure behavior;
- reset, pop, clear, or checkpoint behavior;
- scratch arena conflicts and nesting rules.

These facts are visible to diagnostics, examples, and `wync explain storage`.

## Storage Contracts

The sealed `core.storage` module is the canonical byte-storage surface. Its
implementation is ordinary Wyst source in `wync/core/storage.wyst`; the
compiler authenticates and bundles that source exactly like other sealed core
modules. There is no arena intrinsic, allocator opcode, compiler-selected
backing, implicit cleanup, or special lowering. Only generic ability checking,
ordinary resource/borrow verification, checked quantity operations, and the
semantic identities used by `wync explain storage` have compiler roles.

### Backing and providers

`fixed_buffer_attach(mut backing: []u8, use: StorageUse)` consumes an exclusive
borrow of exactly the caller-provided byte slice and returns a `must_observe
Result<FixedBuffer, FixedBufferAttachFailure> from backing`. It parses the
complete address extent once; address-plus-length overflow returns
`InvalidExtent` without losing the backing authority. An empty fixed buffer is
valid. `FixedBuffer` records the exact capacity, address-derived
`StorageIdentity`, generation, and one of these use classes:

- `CallScopedScratch` for storage whose scoped work must rewind;
- `OutputOrSubsystem` for storage that may back returned or subsystem state;
- `Permanent` for storage whose arena cannot reset or detach.

`fixed_buffer_reclassify` is an explicit consuming transition.
`fixed_buffer_close` explicitly accounts for the wrapper; it neither releases
nor cleans the provider's bytes. Hosted providers may acquire a slice with
`malloc`, `mmap`, or `VirtualAlloc`, package its release ticket separately, and
attach the slice. Kernels may use static, boot-reserved, page, per-CPU, DMA, or
device-specific backing. Provider acquisition, release, page policy, and
failure remain outside `core.storage`; the common seam is the exclusive slice
plus any separate affine provider authority.

Arena-first is not arena-only. `fixed_buffer_reserve` accepts a previously
checked `ByteRange` and `Alignment` and creates a direct
`DestinationReservation` without a ledger or allocation policy. The explicit
typestate chain is `DestinationReservation` to `InitializedDestination` to
`WrittenRegion`, using `destination_initialize_zero`,
`destination_initialize_from`, `destination_initialize_value`, or the trusted
`destination_assume_initialized`, followed by `destination_finish`. A direct
reservation borrows its fixed buffer exclusively until its last use. The
buffer remains a bounded destination, not an allocator.

### Arena attachment and record model

`arena_attach(var buffer: FixedBuffer)` transfers one whole fixed buffer into
one monotonic `Arena`. Capacity must be at least 80 bytes and both base and
capacity must be eight-byte aligned. Failure returns
`ArenaAttachRejected { buffer, reason }`, preserving the authority. The arena
keeps 208 bytes of control state in its ordinary `Arena` value and stores one
private 80-byte record per allocation at the high end of the backing. Payload
grows upward and records grow downward. The record carries identity,
generation, sequence, previous cursors, payload start and length, padding,
record offset, and one packed state word. That word uses two bits for the
vacant/pending/live/retired lifecycle and one bit for publication; all 61
unnamed bits are reserved and any nonzero reserved bit is corrupt metadata.
The record is transient validation metadata, not a persistent or cross-process
format.

The control value represents pending work as the payload enum `None`,
`Reservation(PendingReservationState)`, or `Growth(PendingGrowthState)` rather
than as parallel booleans, kind tags, and optionally meaningful words. Private
nominal sequence, record-offset, and checkpoint-identity types prevent those
equal-width quantities from being interchanged accidentally. Their layouts,
the 64-byte pending transaction, the 208-byte arena control value, and the
80-byte backing record are source-level static assertions in
`core.storage`.

`arena_reserve` performs checked alignment and extent arithmetic and permits at
most one pending transaction. Success returns an opaque, non-discardable
`Reservation`; it does not establish initialized or committed bytes. The
reservation becomes `InitializedReservation` only through
`arena_initialize_zero`, `arena_initialize_from`,
`arena_initialize_value<T: copyable_discardable>`, or the explicit trusted
assertion `arena_assume_initialized`. `arena_commit` alone creates an
`Allocation`. `arena_cancel_reservation` and `arena_cancel_initialized` visibly
rewind a pending transaction. Zero-length requests are real sequenced records
and still consume record metadata.

The typed-value forms require the exact `#size_of(T)` and `#align_of(T)` and
admit only compiler-proven fixed-layout values with copy and discard abilities.
They cannot byte-copy affine authorities into untracked storage. Raw bytes
that represent an externally defined format are parsed by that format's
boundary after initialization; `core.storage` does not manufacture typed
authority from arbitrary bytes.

Every authenticated operation validates identity, generation, sequence,
packed state, and the parts of the ledger that could have changed. Record
inspection returns an ordinary aggregate whose slice and record pointer both
carry compiler-verified provenance from the exact `arena.bytes` field; it adds
no runtime borrow tag or second authenticated operation and does not borrow
unrelated arena control fields. Stable raw capacity, alignment, and extent
facts are not reparsed downstream. Rejection is typed and failure-atomic: the
arena cursor, live bytes, and accounting state are unchanged. Where a rejected
operation consumed an affine input, its error envelope returns that input. The
general projected-transfer rule permits `xfer rejected.authority` only when
every unselected sibling is discardable.

### Accounting and reclamation

`arena_facts` reports exact, separate extents. With `metadata` meaning private
backing records and `control_metadata` meaning `#size_of(Arena)`, the required
relations are:

```text
committed = live + abandoned
consumed = committed + reserved + alignment_padding + backing_metadata
```

The report also carries exact capacity, payload cursor, high-water mark,
identity, generation, and storage use. Control metadata is not inside capacity
or consumed. Alignment padding is not live data; abandoned bytes remain
committed/consumed until an allowed rewind or reset; reserved bytes are pending
and not committed. `wync explain storage` uses authenticated
`core.storage.*` semantic identities, never declaration spelling, and reports
this complete vocabulary plus `hidden-allocation=false`,
`hidden-cleanup=false`, `hidden-fallback=false`,
`hidden-synchronization=false`, and `allocator-selection=caller-or-provider`.

`arena_checkpoint`, `arena_keep_checkpoint`, and
`arena_rewind_checkpoint` implement linked, strictly nested checkpoints.
`arena_begin_scratch` is valid only for `CallScopedScratch` and
`arena_finish_scratch` always rewinds the innermost scope. Pending transactions
and changed publication counts block checkpoint completion. Output/subsystem
and permanent arenas cannot masquerade as scratch.

`arena_shrink_last` and `arena_rewind_last` accept the live token for the most
recent allocation only. Growth of that same allocation is another explicit
reservation/initialization/commit transaction through the
`arena_*_growth` functions; it grows only into already supplied backing and is
not backing growth. `arena_abandon` makes live bytes abandoned.
`arena_publish` converts an allocation into a `PublishedRegion` and increments
an explicit dependent count; `arena_view_published` validates it and
`arena_retire_published` retires and abandons it. Reset, rewind, shrink, growth,
or detach cannot invalidate a live publication silently.

`arena_reset` is one logical generation transition with an explicit sanitation
choice (`PreserveBytes` or `ZeroBacking`) and backing outcome:
`RetainCapacity`, `ReleaseCapacity`, or `RetainUpTo(ByteLength)`. The outcome is
respectively `Retained(Arena)`, `Released(FixedBuffer)`, or
`Split(Arena, FixedBuffer)`; a retained capacity below the 80-byte arena
minimum becomes a release. Reset rejects pending work, checkpoints,
publications, permanent storage, and generation exhaustion. Successful reset
invalidates all earlier allocations, handles, reservations, views, and
descriptors by generation. `arena_detach` applies the same liveness rules and
returns the full fixed buffer with the next generation. Pointer-free
`AllocationHandle` receipts may outlive reset, but validation returns
`StaleGeneration`; they never keep backing alive.

The monotonic arena is byte storage, not a general object heap. Arbitrary
per-object free, fixed-slot reuse, concurrent allocation, backing acquisition
or growth, page management, fallback allocation, cleanup callbacks,
synchronization, ambient allocator context, reference counting, and a general
object-heap/`SlotPool` contract require separate visible APIs. No part of this
surface chooses or calls such an API implicitly.

## Dynamic Array Descriptors

`DynamicArray<T>` is a concrete raw descriptor type. The descriptor is storage
for facts, not an allocation trigger. Its only compiler-provided initializer is
the ordinary all-zero aggregate initializer accepted for this descriptor.
`dyn_array_init<T>(...)`, `.push(...)`, `.push_from_address(...)`,
`.reserve(...)`, `.alloc_slot()`, `.init_slot(...)`, and `.commit_slot(...)`
have no compiler-owned syntax, typing, mutation, storage, or report semantics.
If a project declares functions with those spellings, they are ordinary calls.

The descriptor representation is public and required under
`wyst.dynamicArrayDescriptor`. A `DynamicArray<T>` value has total size 56 bytes and alignment 8.
Its fields are fixed in this order:

| Order | Field | Type | Offset | Size | Alignment | Meaning |
| ----- | ----- | ---- | ------ | ---- | --------- | ------- |
| 0 | `data` | `@T` | 0 | 8 | 8 | Base address of element storage, or `0` when no storage is attached. |
| 1 | `len` | `u64` | 8 | 8 | 8 | Number of initialized elements available through indexing and slicing. |
| 2 | `capacity` | `u64` | 16 | 8 | 8 | Number of element slots in the attached storage. |
| 3 | `storage_identity` | `u64` | 24 | 8 | 8 | Storage source token naming an arena, fixed buffer, pool, target/runtime source, or `0` for no storage. |
| 4 | `growth_policy` | `u64` | 32 | 8 | 8 | Encoded growth rule used by reserve and push operations. |
| 5 | `failure_policy` | `u64` | 40 | 8 | 8 | Encoded behavior for allocation, capacity, or initialization failure. |
| 6 | `movement_policy` | `u64` | 48 | 8 | 8 | Encoded address-stability rule for element storage across growth. |

The descriptor invariants are part of the public contract: `len <= capacity`;
`capacity > 0` requires `data != 0`; `data` must satisfy `T`'s alignment for
every initialized element; and `storage_identity`, `growth_policy`,
`failure_policy`, and `movement_policy` must be valid tokens for the selected
storage contract. The descriptor address itself is stable only for the storage
location that holds the descriptor value; element addresses follow
`movement_policy`.

`storage_identity` encodings are storage-contract tokens, not raw allocator
pointers unless the owning storage contract says so. `0` means no storage
identity is attached. Nonzero values are compared as identities by descriptor
equality and are interpreted only by the wrapper/storage contract that created
the descriptor.

`growth_policy` encodings in `wyst.dynamicArrayDescriptor` are:

| Value | Meaning |
| ----- | ------- |
| `0` | no growth; capacity is fixed and reserve beyond capacity fails |
| `1` | stable-storage growth; capacity may increase without moving existing element addresses |
| `2` | relocating growth; capacity may increase by moving elements and changing `data` |

`failure_policy` encodings in `wyst.dynamicArrayDescriptor` are:

| Value | Meaning |
| ----- | ------- |
| `0` | trap or panic according to the owning runtime contract |
| `1` | return explicit status from the operation |

`movement_policy` encodings in `wyst.dynamicArrayDescriptor` are:

| Value | Meaning |
| ----- | ------- |
| `0` | no attached element storage; element addresses are invalid |
| `1` | stable element addresses while the storage identity remains alive |
| `2` | element addresses may move on growth; callers must not retain them across mutating operations |

Other policy values are invalid descriptor state. The empty descriptor is all zero
fields: `data = 0`, `len = 0`, `capacity = 0`, `storage_identity = 0`,
`growth_policy = 0`, `failure_policy = 0`, and `movement_policy = 0`. It is a
valid empty descriptor value, but indexing or foreign inspection as live
storage requires a descriptor supplied by an explicit external contract.
Invalid descriptor
state includes `len > capacity`, nonzero capacity with zero data, misaligned
data, unknown policy values, stale storage identity, or any state produced by a
wrapper that does not satisfy `wyst.dynamicArrayDescriptor`; using such a
descriptor is a trusted-contract violation by the program or foreign producer.

Resetting a descriptor to the all-zero empty descriptor drops the descriptor's
attachment to storage but performs no hidden free, destructor, element drop, or
allocator callback. The lifetime of the storage source is external to the
descriptor; the descriptor never extends arena, fixed-buffer, pool, DMA, or
foreign storage lifetime. Wrapper APIs that release or recycle storage must
state that behavior as their own visible contract.

Native ABI consequences follow the public aggregate layout: `DynamicArray<T>` is a
56-byte, 8-aligned aggregate, and ABI classification uses the ordinary aggregate
rules for that size and alignment. DWARF debug info emits the same member names,
order, offsets, and field types. Persistence is not promised: descriptor values
contain process-local addresses and storage tokens, so only the all-zero empty
descriptor is portable across address spaces or program runs unless an external
persistence contract translates the fields. Foreign inspection may read and
write the fields only when it opts into `wyst.dynamicArrayDescriptor`,
knows the element type layout, and preserves every invariant above.

Descriptor state is read through read-only dot projections such as `arr.data`,
`arr.len`, `arr.capacity`, `arr.storage_identity`, `arr.growth_policy`,
`arr.failure_policy`, and `arr.movement_policy`. These projections are not
assignment targets, and Wyst does not provide typed getter APIs for descriptor
state.

`arr[i]` lowers directly through the descriptor's data pointer and performs no
hidden length or capacity check. Flow-sensitive typed IR must first prove the
exact `i < arr.len` relation; capacity is never substituted for length. A
dynamic access can establish the relation with `checked.index` and use the
authenticated index only on its success path. An unproved access is rejected
unconditionally. The descriptor supplies no compiler-owned access to
capacity-only storage.

The bootstrap descriptor has no `arr[:]` or range-slicing surface and never
binds implicitly to a `[]T`. Source that needs a slice must explicitly obtain
one through an ordinary wrapper contract or construct a raw view from the
descriptor's projected address and length.

Same-type `DynamicArray<T>` equality compares descriptor state only: data pointer,
length, capacity, storage identity, growth policy, failure policy, and movement
policy. It does not compare elements, and dynamic arrays have no ordered
comparison or integer-zero comparison.

This descriptor is not the selected public growable-array surface. The future
`[?]T` work defines affine mutation authority, storage and generation proofs,
growth operations, and view leases before migrating users and retiring this
bootstrap declaration. None of those future semantics is inferred from the
current descriptor.

## Typed Handles

Stable-index typed-handle contracts use monomorphic
`typed_handle_<operation>_<T>` wrapper calls for report facts. The wrappers
remain ordinary Wyst functions and do not imply a runtime-owned container.

The initial contract covers stable-index container initialization, handle
creation, valid access, and stale-handle rejection. Each fact names the
container identity, population identity, capacity when present, handle value
when present, slot index when present, expected generation, observed
generation, failure policy, movement policy, address-stability policy,
stale-check rule, and outcome. Stale-slot detection is explicit: a stale
rejection must show the generation or population identity evidence used to
reject the handle.

This surface proves one stable-index container contract only. Broad collection
APIs, pointer-stable containers, unordered swap-back arrays, dense/sparse sets,
hidden bounds checks, and general generic container syntax remain outside the
typed-handle surface.

## Buffer And String API Contracts

The buffer/string contract covers length/capacity-carrying byte buffers and
explicit string-to-C-string conversion costs. As with the earlier storage
surfaces, ordinary standard-library-shaped calls provide report facts; Wyst does
not synthesize a runtime buffer implementation or hidden allocation path.

The API surface uses monomorphic byte-buffer wrappers such as
`buffer_init_u8`, `buffer_append_slice_u8`, `buffer_append_string_u8`, and
`c_string_from_string_u8`. String API boundaries are explicit byte pointer plus
carried length. The report distinguishes the string boundary from a raw slice
and records the copy, scan, sentinel, capacity, storage identity, growth, and
failure facts.

C-string conversion is always explicit. The report names the embedded-NUL scan,
the byte copy, the trailing NUL sentinel write, and the failure policy; Wyst
strings remain length-carrying byte strings and do not become implicitly
NUL-terminated at ABI boundaries.

## Target And Runtime Boundary

Page reserve/commit, guard pages, TLS or per-CPU arenas, interrupt-time
storage, firmware services, and OS allocation calls are target or runtime
contracts. They should be exposed through profiles, standard-library modules,
or generated bindings with stable provenance instead of special core-language
rules.

## Effect Boundary

Dynamic storage acquisition through known runtime APIs is a semantic operation
that can be reported by storage diagnostics and explain output. Compiler-owned
frame slots, spills, reloads, register-class pressure, and caller-owned
aggregate copies are generated backend resources instead; they belong in
post-lowering constraints and reports, not in `#[deny_effects(...)]`.

## Kernel Initcalls, Panic, And Logging

A small kernel-runtime metadata contract provides initcall tables without
introducing a hidden runtime. A function marked `#[init(order = N)]` contributes one inspectable
`.initcalls` entry. Entries are written deterministically as
`u64 order` plus `u64 function_address`, sorted by order and then by function
symbol name. Each entry also has a compiler-created ELF metadata symbol whose
name includes the fixed-width `u64` order and source module-qualified function
identity; see [chapter-16-object-format.md §4.3](chapter-16-object-format.md).
The function must have signature `()`, use the native calling convention, omit
`#[inline]`, omit `naked`, return a value other than `never`, and return so the
next table entry can run.

The runtime invocation path is ordinary Wyst code. The selected named layout
explicitly declares `.initcalls` as `rodata` with alignment at least 8 and may
publish
`pub symbol __initcalls_start: @u8 = start(".initcalls")` and
`pub symbol __initcalls_end: @u8 = end(".initcalls")`. Boot code walks the table with
explicit loads, constructs a `@()` function pointer with
`#trusted_cast<@()>(addr)`, and calls it. There is no hidden constructor pass, no
link-time rewrite, and no implicit allocation.

Panic and logging stay target-profile conventions. Early kernels should expose
plain, inspectable entry points such as `fn panic_code(code: u64) -> never` and
`log_event(code : u64)`. Formatting, buffers, UART routing, and persistence are
chosen by the profile or example; they are not variadic and do not allocate
unless a visible logging API takes explicit storage.

## Non-Goals

- Do not add a borrow checker or mandatory ownership system as part of this
  runtime design.
- Do not make a global allocator part of the core language.
- Do not hide allocation behind syntax, implicit temporaries, or library magic.
- Do not make page management, TLS, or device memory portable source semantics.

Operations, progress, exact forwarding, recovery capabilities, cancellation,
and cleanup require no language runtime, allocation, executor, coroutine,
exception object, dynamic handler stack, TLS status, or retained continuation.
The canonical Option/Result source is bundled and authenticated like the
existing collections declaration, but its helpers remain ordinary generic
Wyst code.
