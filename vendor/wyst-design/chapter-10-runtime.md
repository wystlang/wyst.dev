---
title: "Chapter 10: Wyst Runtime And Allocation"
group: chapter
chapter: 10
order: 10
summary: "Explicit allocation direction, arenas, storage contracts, dynamic arrays, handles, buffers, and runtime boundaries."
---

# Chapter 10: Wyst Runtime And Allocation

The runtime and allocation boundary is expressed through library and runtime
contracts. Storage contracts, dynamic-array descriptors, typed handles, and
buffer/string APIs remain ordinary explicit Wyst source calls rather than hidden
allocation or runtime-owned containers.

Allocation is described as visible storage contracts rather than hidden
language behavior. The memory model and the storage and library contracts
remain separate concerns.

## v0.9 Dynamic Container Role (Current)

The v0.9 dynamic container is the ordinary explicit generic declaration with
canonical identity `core.collections.DynamicArray`. It is not a prelude type
and must be obtained from the sealed compiler-provided module before its local
binding is applied as `DynamicArray<T>` (or through an import qualifier/alias):

<!-- wyst-contract: check-pass -->
```wyst
module packet.queue

import core.collections { DynamicArray }

fn process(values: @DynamicArray<u8>) {
  // storage and growth remain explicit operations
}
```

A whole public or private `import core.collections` is also valid and exposes
the type as `collections.DynamicArray<T>`; selective imports may use a local
alias, and `pub import` may re-export the authenticated declaration under the
ordinary source-visibility rules.
`DynamicArray` is authenticated by the sealed declaration's versioned
`wyst.dynamicContainerRole.v0.9` metadata, not by its qualified or unqualified
spelling. A project declaration with the same name cannot acquire the role or
replace the sealed module.

The sole authority for that metadata is the compiler-shipped
[`declaration-roles.tsv`](declaration-roles.tsv) registry under
`wyst.declaration-role-registry.v1`. Its row binds the stable role and contract
version to `core.collections.DynamicArray`, the declaration kind and complete
generic field signature, the native ABI, an interface digest, the exact bundled
body digest, compiler semantics, compatibility rules, and the absence of
resource-state capabilities. The compiler re-authenticates all of those facts;
an import alias or re-export carries the authenticated identity rather than
causing a second name lookup for semantics.

Project source, manifests, foreign metadata, and ordinary dependency interfaces
cannot assign a role. Unknown, duplicate, stale, unavailable, or mismatched
interface claims are rejected. In particular, ordinary functions named
`arena_storage_init`, `byte_storage_*`, `dyn_array_*`, `typed_handle_*`,
`buffer_*`, or `c_string_*` are ordinary typed APIs: their spelling alone
creates no allocator, storage, movement, container, runtime, retention,
lowering, effect, or report fact. `wync explain storage` reports the sealed
registry and authenticated `DynamicArray<T>` uses only.

`DynamicArray<T>` preserves the explicit
`wyst.dynamicArrayDescriptor.v0` storage representation and
`wyst.dynamicArrayOperation.v0` operation contract described below. It is
opaque at the Wyst type surface and otherwise participates in parsing, type
checking, explicit generic instantiation, linking, debugging, and dead-code
elimination like ordinary bundled generic library code. Importing the type
does not allocate, initialize, run startup code, or retain operations. Every
stored binding still has an explicit initializer, and allocation, capacity,
growth, failure, movement, and storage identity remain visible in the selected
storage API.

The predecessor dynamic-array type marker is removed syntax in v0.9; it is
neither an alias nor a second
accepted spelling. There is no transition mode in which both forms denote the
same type.

## Frozen Error And Partial-Success Contract (Activation Pending)

`wyst.errorModelCatalog.v1` selects one convention for every fallible or
resumable core/library boundary. The machine-readable authority is
[`error-model.tsv`](error-model.tsv). The source carrier is the future sealed
identity `core.outcome.Outcome` under `wyst.outcome.v1`:

<!-- wyst-contract: sketch -->
```wyst
module core.outcome

pub enum Outcome<V: payload_word, P: payload_word, E: payload_word>: u8 {
  ok(V)
  partial(P)
  complete
  err(E)
}
```

This declaration uses only the already-frozen enum, generic, call, and
`match` syntax. `wyst.outcome.v1` freezes its meaning, representation, ABI,
interface summary, and foreign mapping. It does not activate the sealed module
or any checked operation in the current compiler. The checked outcome
implementation milestone activates them together; until then
`checked<T>(value)` remains reserved and rejected. An ordinary
project declaration named `Outcome` has no compiler role and cannot impersonate
the future sealed identity.

The variants have exactly these meanings and tags:

| Variant | Tag | Payload | Meaning |
| ------- | --- | ------- | ------- |
| `.ok(value)` | 0 | `V` | This invocation successfully produced its final value. |
| `.partial(progress)` | 1 | `P` | This invocation committed positive, observable progress and the same logical operation may be resumed. |
| `.complete` | 2 | canonical zero word | Successful terminal completion with no value, including exhaustion/end-of-stream where the API defines it. |
| `.err(error)` | 3 | `E` | This invocation failed with a typed cause. |

`V`, `P`, and `E` must satisfy the existing `payload_word` bound. Concrete
type identities are part of the complete `Outcome<V, P, E>` identity; there is
no implicit widening, erased error base class, default type argument, or nested
enum payload. An error domain may use an integer, address, callable, or nominal
bitstruct error payload, but the payload is a cause, never a second carrier.
New APIs may not replace `Outcome` with a null/integer sentinel, Boolean or
integer status, status-plus-value tuple, a second result type, `errno` or other
thread-local status, exception, unwind, panic, or implicit retry convention.
Named multi-results may carry additional successful data, but no tuple field
may duplicate or override the `Outcome` disposition.

### Control flow and trapping

Constructing, returning, storing, passing, or matching an outcome has no
implicit effect, allocation, cleanup, retry, trap, panic, or unwind. Control
flow is the existing explicit enum control flow:

<!-- wyst-contract: sketch -->
```wyst
match outcome {
  .ok(value) {
    use(value)
  }
  .partial(count) {
    retain_progress(count)
  }
  .complete {
    finish()
  }
  .err(error) {
    return Outcome<V, P, E>.err(error)
  }
}
```

There is no implicit propagation operator and no implicit unwrap. A library
may provide ordinary helper functions, but their complete input, output,
effects, and terminal behavior remain visible. Allocation failure, parsing and
I/O failure, boot-discovery failure, container growth failure, checked
conversion failure, request cancellation, deadline expiry, provider failure,
invalid resource or resumable-lifecycle transitions, and checked proof,
synchronization, or context failures all use `.err(E)`. Normal terminal
completion uses `.complete`; it is neither an error nor an error-code sentinel.

A normal `.err(E)` never traps. Explicit hardening first constructs the same
`.err(E)` disposition. A selected `wyst.outcomeHardeningTrap.v1` adapter may
then consume that error and invoke the already-explicit trap operation; its
policy and error class are object/interface facts. No safety profile may
silently change an ordinary error into a trap, panic, sentinel, unwind, or
exception. A raw machine-profile operation retains its existing Defined,
Target-defined, Architectural-fault-or-trap, Indeterminate-bits, or
Trusted-contract-violation semantics and does not synthesize an `Outcome`.
Failure to prove a required fact under a verification profile is a compile-time
diagnostic. Only an explicitly selected checked operation has a runtime
outcome.

### Partial progress

`.partial(P)` is successful committed progress, not a disguised error. Its
payload names the operation's documented unit, such as input bytes, output
bytes, records, or code points, and must be strictly positive. The count covers
only progress committed by that invocation. Committed reads remain visible in
the caller's buffer or explicit state; committed writes are not rolled back;
parser progress remains in an explicit caller-owned state or resource. The
operation performs no hidden retry and a zero-progress `.partial` is invalid.

One return has exactly one disposition, so partial progress cannot be bundled
with an error, cancellation, deadline, provider failure, or completion status.
If a provider discovers a terminal disposition only after committing progress,
it returns `.partial(P)`, retains the exact pending disposition in the explicit
operation/resource state, and on the next resume returns `.err(E)` or
`.complete` before doing new work. Cancellation and deadline handling obey the
same rule and cannot erase already committed progress. An API that cannot
retain such state must stop before committing progress and return `.err(E)`
directly.

### Allocation, containers, and lifecycle

Allocation and growth return `.ok(value)` for the resulting address/handle or
capacity-bearing value and `.err(E)` on failure; they never use a null pointer,
unchanged capacity, Boolean status, or trap as the failure carrier. Parsing,
I/O, and boot discovery select the applicable value, partial, completion, and
error variants explicitly. Cancellation, deadline expiry, provider failure,
and invalid resource/resumable transitions are typed `.err(E)` causes rather
than extra top-level variants, which keeps all APIs composable through one
carrier and one exhaustive `match` shape.

The bootstrap `wyst.dynamicArrayDescriptor.v0` `failure_policy = 0` trap/panic
encoding predates this selected convention. It is compatibility-only for that
descriptor version, cannot be selected by a new API or safety profile, and is
not the final container-growth contract. The checked outcome and final
collection-library milestones migrate checked container operations to
`Outcome`; they may not carry the bootstrap policy
forward as an alternative convention.

## Released v0.8 Syntax Snapshot

> The remainder of this chapter preserves the released v0.8 storage and
> allocation exposition. Its explicit allocation, descriptor, failure, and
> movement semantics remain relevant to the authenticated v0.9 role, but every
> `[dynamic]T` annotation and typed punctuation-led declaration shown below is
> a historical v0.8 spelling. Read it as `DynamicArray<T>` with keyword-led
> bindings when applying the contract to current v0.9 source.

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

Storage contracts are expressed as explicit standard-library-shaped API calls
plus `wync explain storage` facts. These calls remain ordinary Wyst functions in
source and do not become hidden language allocation:

- `arena_storage_init` names a caller-visible storage identity, capacity,
  alignment, zero/no-zero policy, and failure policy.
- `byte_storage_init` binds a shared byte-storage core to an explicit arena or
  storage context with capacity, alignment, zeroing, growth, and failure facts.
- `byte_storage_push_zero` and `byte_storage_push_nozero` keep initialized and
  uninitialized byte ranges distinct.
- `byte_storage_reserve` separates capacity reservation from byte
  construction.
- `byte_storage_reset` makes cursor reset visible and invalidates previous
  allocations by contract.

Arena-first is not arena-only. The storage vocabulary deliberately leaves named
space for fixed buffers, pools, per-CPU storage, DMA-coherent storage, and
target/runtime storage sources without implementing them as hidden core
language allocation.

## Dynamic Array Descriptors

`DynamicArray<T>` is a concrete descriptor type. The descriptor is storage for
facts, not an allocation trigger: annotation-time allocation is `none`, and
initialization must happen through a visible typed wrapper such as
`dyn_array_init_Token`. The checked ergonomic surface also accepts
`arr : DynamicArray<u8> = dyn_array_init<u8>(arena, capacity = ..., growth = ...)`;
subsequent repeated operations can use `arr.push(value)`,
`arr.push_from_address(ptr)`, `arr.reserve(capacity = ..., growth = ...)`,
`arr.alloc_slot()`, `arr.init_slot(slot)`, and `arr.commit_slot(slot)` on any
assignable `DynamicArray<T>` descriptor storage path, including locals, globals, and
aggregate fields. Temporaries and constants are not valid mutating receivers.

Where labels appear (`reserve` and `dyn_array_init<T>`), they are
load-bearing and position-independent: the compiler accepts any order of
labeled arguments and rejects misspelled, unknown, duplicate, or missing
required labels. The remaining dot-syntax forms take positional arguments
only — labels on `push`, `push_from_address`, `init_slot`, or
`commit_slot` are a compile error.

The descriptor representation is public and normative under
`wyst.dynamicArrayDescriptor.v0`. A `DynamicArray<T>` value has total size 56 bytes and alignment 8.
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

`growth_policy` encodings in `wyst.dynamicArrayDescriptor.v0` are:

| Value | Meaning |
| ----- | ------- |
| `0` | no growth; capacity is fixed and reserve beyond capacity fails |
| `1` | stable-storage growth; capacity may increase without moving existing element addresses |
| `2` | relocating growth; capacity may increase by moving elements and changing `data` |

`failure_policy` encodings in `wyst.dynamicArrayDescriptor.v0` are:

| Value | Meaning |
| ----- | ------- |
| `0` | trap or panic according to the owning runtime contract |
| `1` | return explicit status from the wrapper operation |

`movement_policy` encodings in `wyst.dynamicArrayDescriptor.v0` are:

| Value | Meaning |
| ----- | ------- |
| `0` | no attached element storage; element addresses are invalid |
| `1` | stable element addresses while the storage identity remains alive |
| `2` | element addresses may move on growth; callers must not retain them across mutating operations |

Other policy values are invalid descriptor state in this contract version unless
a later named contract version defines them. The empty descriptor is all zero
fields: `data = 0`, `len = 0`, `capacity = 0`, `storage_identity = 0`,
`growth_policy = 0`, `failure_policy = 0`, and `movement_policy = 0`. It is a
valid empty descriptor value, but indexing, slicing to nonzero length, reserve,
push, slot allocation, and foreign inspection as live storage require
initialization through an explicit storage contract first. Invalid descriptor
state includes `len > capacity`, nonzero capacity with zero data, misaligned
data, unknown policy values, stale storage identity, or any state produced by a
wrapper that does not satisfy `wyst.dynamicArrayDescriptor.v0`; using such a
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
write the fields only when it opts into `wyst.dynamicArrayDescriptor.v0`,
knows the element type layout, and preserves every invariant above.

The bootstrap wrapper operation metadata is `wyst.dynamicArrayOperation.v0`. Typed
wrappers are monomorphic in the bootstrap surface and report their shared
byte-storage provenance for initialization, push-by-value, push-from-address,
reserve-only, allocate-slot, initialize-slot, and commit-slot operations.
Current compatibility wrapper spellings such as `dyn_array_init_Token` select
entries from this versioned metadata table; the function name is not the
contract authority. The narrow `dyn_array_init<T>` source spelling reports as a
deterministic typed wrapper instance rather than hidden runtime type erasure.

Descriptor state is read through read-only dot projections such as `arr.data`,
`arr.len`, `arr.capacity`, `arr.storage_identity`, `arr.growth_policy`,
`arr.failure_policy`, and `arr.movement_policy`. These projections are not
assignment targets, and Wyst does not provide typed getter APIs for descriptor
state.

`arr[i]` is direct unchecked access to initialized dynamic-array element
storage. It lowers through the descriptor's data pointer and performs no hidden
length or capacity check. Access to capacity-only storage remains explicit
through reserve and slot allocation/initialization/commit operations.

`arr[:]` produces a non-owning `[]T` view over initialized elements by using
the descriptor data pointer and current length. Dynamic-array range slicing is
unchecked; omitted end bounds use `arr.len`, not `arr.capacity`. A `DynamicArray<T>`
never binds implicitly to a `[]T`; call and assignment sites use `arr[:]` when
they want the initialized-element view.

Same-type `DynamicArray<T>` equality compares descriptor state only: data pointer,
length, capacity, storage identity, growth policy, failure policy, and movement
policy. It does not compare elements, and dynamic arrays have no ordered
comparison or integer-zero comparison.

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
introducing a hidden runtime. A function marked `#initcall(order)` contributes one inspectable
`.initcalls` entry. Entries are written deterministically as
`u64 order` plus `u64 function_address`, sorted by order and then by function
symbol name. Each entry also has a compiler-created ELF metadata symbol whose
name includes the fixed-width `u64` order and source module-qualified function
identity; see [chapter-16-object-format.md §4.3](chapter-16-object-format.md).
The function must have signature `()`, must use the native calling convention,
must not be `#inline`, `#naked`, or `#noreturn`, and must return so the next
table entry can run.

The runtime invocation path is ordinary Wyst code. The selected named layout
explicitly declares `.initcalls` as `rodata` with alignment at least 8 and may
publish
`pub symbol __initcalls_start: @u8 = start(".initcalls")` and
`pub symbol __initcalls_end: @u8 = end(".initcalls")`. Boot code walks the table with
explicit loads, constructs a `@()` function pointer with
`#trusted_cast<@()>(addr)`, and calls it. There is no hidden constructor pass, no
link-time rewrite, and no implicit allocation.

Panic and logging stay target-profile conventions. Early kernels should expose
plain, inspectable entry points such as `panic_code(code : u64) #noreturn` and
`log_event(code : u64)`. Formatting, buffers, UART routing, and persistence are
chosen by the profile or example; they are not variadic and do not allocate
unless a visible logging API takes explicit storage.

## Non-Goals

- Do not add a borrow checker or mandatory ownership system as part of this
  runtime design.
- Do not make a global allocator part of the core language.
- Do not hide allocation behind syntax, implicit temporaries, or library magic.
- Do not make page management, TLS, or device memory portable source semantics.
