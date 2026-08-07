---
title: "Chapter 9: Wyst Memory Model"
group: chapter
chapter: 9
order: 9
summary: "Normal memory, volatile memory, atomics, barriers, ordering, agents, and happens-before."
---

# Chapter 9: Wyst Memory Model

> **Canonical scope.** ARM64 register model (§1.1), load/store
> architecture (§1.2), memory interpretation model (§1.3), memory
> access directives and volatility (§1.3.1), and the full memory
> model — execution model, compiler ordering rules, happens-before,
> visible-value-of-a-load, data races, atomicity, and interrupt handler
> ordering.
>
> Typed atomic storage and methods live in the generated
> [atomic matrix](generated-atomic-matrix.md) and
> [chapter-11-intrinsics.md §1.3.2](chapter-11-intrinsics.md);
> address types and conversion rules live in [chapter-06-types.md §1.4.1](chapter-06-types.md);
> inline assembly fence semantics live in [chapter-08-functions.md §2.9](chapter-08-functions.md).

The memory model defines ordering for normal and volatile memory,
acquire/release operations, atomics, barriers, agents, and happens-before.
Its address and access dependencies are linked above.

## Storage Provenance and Usable Extent

An ordinary typed address or view is authority, not merely a machine address
encoding. `@T` authorizes access to one live, aligned, initialized `T` only
where its static storage provenance proves those facts. `[]T` authorizes
access to exactly `.len` contiguous live, aligned, initialized elements of
one storage identity. An empty slice may have no backing; its data bits carry
zero usable extent and cannot be dereferenced or passed where one live `T` is
required until a nonempty backing proof exists.

Provenance is non-widening. A subslice, element address, or field address
retains only its projected usable extent. Address arithmetic may produce bits
outside that extent, and address equality or integer conversion may inspect
those bits, but no load, store, read-modify-write, slice construction, returned
view, or storage lease may consume authority outside the retained extent.
Converting an address or descriptor field to `u64` discards provenance;
reconstructing a typed value from those bits begins a new trusted assertion
rather than recovering the earlier proof.

Ordinary `address.slice(elements = n)` never invents storage. It succeeds only
when the receiver retains proof for the exact requested range. Code that has
only raw machine bits uses one of the compiler-owned, unshadowable boundaries:

<!-- wyst-contract: sketch -->
```wyst
match trusted_slice<u32>(raw, elements = count) {
  .Ok(words) => consume(words)
  .Error(reason) => reject(reason)
}

match trusted_mut_slice<u32>(raw, elements = count) {
  .Ok(words) => initialize_or_update(words)
  .Error(reason) => reject(reason)
}
```

Both forms evaluate `raw` and `count` once from left to right and return a
`must_observe Result<[]T, core.checked.ExternalSliceFailure>`. The checked
predicate accepts an empty view, and otherwise requires natural alignment and
that `count * #size_of(T)` plus `raw` is representable without unsigned
overflow. A constant false predicate is a compile-time error; a dynamic
predicate is emitted as ordinary control flow and successful proof is retained
in typed IR. No helper call, allocation, registry lookup, shadow metadata, or
pointer rewriting occurs.

The successful result is nevertheless an explicit `external_storage` trust
boundary. `trusted_slice` asserts initialized ordinary CPU-accessible Normal
memory with no concurrent mutation for the view lifetime.
`trusted_mut_slice` asserts exclusive CPU access and yields an affine mutation
authority. Neither form applies to MMIO, volatile device registers,
atomic storage, device-owned DMA, `MaybeUninit`, or types lacking the
`copyable_discardable` abilities. Shared results may copy while preserving
their narrowed provenance; exclusive results move but do not copy.

External views are function-scoped and cannot escape unless their lifetime is
tied to an explicit owner or provider authority. Target/static storage can be
permanent only through its authenticated provider contract. Layout regions
describe placement but do not instantiate live objects or create authority.
Provably false overlap or exclusivity assertions are rejected; a dynamically
unknown assertion remains explicit trust and is visible in reports.

This layer establishes bounds plus provenance and usable extent. It does not,
by itself, complete Wyst's whole-language memory-safety claim: lifetime,
initialization, aliasing, reclamation, and concurrency obligations remain
independent gates until their compiler enforcement is complete.

Resource movement is not synchronization. `no_copy` permits unique local
movement, while `agent_local` recursively forbids cross-agent transfer; neither
fact creates a happens-before edge or permits concurrent mutation. Publishing
a structurally eligible frozen value or uniquely transferred authority still
requires the release/acquire, atomic, exclusion, or provider protocol specified
by this chapter. The compiler never derives sendability from nominal spelling.

## Atomic Acquire and Release Access

Acquire and release ordering is part of the closed method surface of opaque
atomic storage. The receiver is an `atomic<T>` binding or an explicit
`@atomic<T>` address:

<!-- wyst-contract: sketch -->
```wyst
var flag: atomic<u64> = atomic<u64>(0)
const observed: u64 = flag.load(.acquire)
flag.store(1, .release)
```

The receiver's exact atomic element type supplies `T`. `.load(.acquire)`
performs one load-acquire; `.store(value, .release)` performs one store-release
after evaluating the receiver and value once in source order. Ordinary,
volatile, and MMIO addresses do not gain atomic ordering and cannot implicitly
convert to `@atomic<T>`. The exact element/method/order matrix,
compare-exchange failure orders, ARM64 mapping, and removal table are generated
from [`atomic-matrix.json`](atomic-matrix.json). That matrix is the sole
authority for atomic storage types, methods, orders, result shapes, and
lowering.

### Construction, lifetime, and modification order

Direct construction creates the atomic location and contributes its initial
write **I**. I is the first member of that location's modification order and
happens-before every later atomic event on the location. For a runtime local,
evaluation of the constructor operand is sequenced before I, and I is complete
before the binding can escape or be observed. For module storage, I is part of
static initialization before program access. For each `per_cpu` instance, the
template bytes are copied only while that instance is unobserved; the resulting
instance-specific I happens-before publication and its first access. The
constructor has no order argument, is not a member of the global SC order, and
does not invent a user-visible atomic load or store event.

### Storage validity and exact width

Every atomic event requires atomic-capable **Normal memory** and the natural
alignment of its exact element width: 1, 2, 4, or 8 bytes, or the target word
alignment for an address element. `atomic<T>` does not manufacture either
property. Device/MMIO placement, under-aligned aggregate or packed placement,
provably misaligned `@atomic<T>`, and mixed atomic/plain access are rejected. A
dynamically constructed atomic address therefore carries an explicit audited
Normal-memory and alignment assertion; it is never inferred from an ordinary,
volatile, or MMIO address.

<!-- wyst-contract: fmt -->
```wyst
module memory.contract

fn mapped_counter(raw: u64) -> @atomic<u64> {
  return address<@atomic<u64>>(raw)
}
```

This exact named conversion is the sole raw construction path and is valid only
in an executable function body so its trust-boundary fact remains traceable in
human and JSON reports. It preserves the address bits and emits no memory event
or runtime check. A constant that is misaligned or overlaps target-declared
Device memory is rejected; for a dynamic value, natural alignment and
atomic-capable Normal memory remain explicit programmer assertions rather than
compiler proof. `relens`, qualifier conversion, reverse exposure to a plain
address, and implicit conversion never construct an atomic address.

The access width is exactly `#size_of(T)`. Checked 16-byte pair-atomic and
exclusive operations are separate range operations: they do not add an atomic
element class, turn `@atomic<u64>` into a 16-byte address, or otherwise widen
the opaque storage boundary.

### Sequential consistency and progress obligations

Wyst ARM64 mapping uses acquire loads, release stores, and acquire-release
RMW forms for `.seq_cst`, with no implicit `dmb`. Instruction selection alone
is not a proof of sequential consistency. The single global SC-order rules in
§9.3 and the required store-buffering, load-buffering, and IRIW outcomes in
§9.3's “required Litmus Outcomes” remain mandatory evidence for this mapping.
A target-lowering change is invalid unless its architecture argument and
litmus suite preserve every required and forbidden outcome.

Every admitted operation uses an exact-width implementation with no hidden
lock, allocation, or helper: a selected LSE instruction or an LL/SC loop that
restarts after every store-exclusive failure. There is no retry budget,
timeout, synthetic compare failure, or fallback lock; an unsupported target
is a hard capability error. This is a lock-free implementation class, not a
wait-free guarantee for an individual agent: under contention an LL/SC caller
may retry indefinitely. Reports identify the selected lowering and progress
class explicitly.

## Register and `per_cpu` Memory Contract

Chapter 8 is the sole source-semantic owner for
`language.callable-storage-contracts`. In Wyst, explicit register placement is
written `in register`. Parameter and result placement is part of callable
identity, while `var name: T in register` is a hard local-storage requirement.

A direct `per_cpu` scalar, field, or element use contributes the ordinary
memory event requested by its type plus the target-defined current-core base
acquisition needed for that use. The base acquisition and offset calculation
are part of that source access: they may not be cached, hoisted, or commoned
with another `per_cpu` access. An ordinary scalar read or write contributes one
load or store. A named bitstruct-field write is one logical source operation but
uses its normal confined backing-word read-modify-write sequence: one load,
`BitfieldInsert`, and one store, all through the same freshly acquired base.
Those operations have the same volatility, ordering, race, and alias rules as
their ordinary non-`per_cpu` counterparts. Atomic `per_cpu` storage is accessed
only through atomic-matrix methods; the storage class itself adds no
atomicity or ordering.

There is no source-visible address, template address, or whole-aggregate copy
event for `per_cpu` storage. `#percpu_offset_of` is a compile-time final-template
byte-offset query and performs no current-core acquisition or memory access.
The target availability and single-instance gate are defined by Chapter 8 and
projected into target lowering by Chapter 11. Before the production multicore
realization milestone, reachable access requires
`#target(..., per_cpu = single_instance_tpidr_el1)` and its EL1+,
16-byte-aligned `TPIDR_EL1` live-base contract.

## Shared-access verification and exclusion authority

The shared-access verifier classifies every ordinary access that may conflict
across authenticated concurrency roots. An unresolved classification is the
unconditional language error `E0249`; `shared_mutation` policy remains only as
an optional audit of explicit trusted foreign, volatile/MMIO, and
checked-assembly boundaries. Roots are artifact
entries, native-exported callables, exception-vector entries, and
target-authenticated provider entries; an ordinary call does not invent a new
root. The analysis follows direct calls, callable aliases, synchronous
`noescape` callbacks, branches, joins, and loops. Read/read pairs do not
conflict; overlapping read/write and write/write byte ranges do. Distinct
`per_cpu` instances isolate task roots on distinct cores, but `per_cpu` alone
does not protect a task from a same-core interrupt strand.

The analysis runs over the selected imported source closure before semantic
interfaces are emitted. A source-module boundary therefore neither erases an
access summary nor creates concurrency authority. The language currently has
no interface-only ordinary source import; such a feature would require an
authenticated access summary before it could preserve this rule.

Access collection includes assignments, ordinary and byte-endian address
loads and stores, non-temporal pair loads and stores, cache-block zeroing,
raw-storage initialization, parameter-backed view projections, and local
aliases carrying a callable's declared `from` origins. A returned view
conservatively names the whole subtree of each exact source argument
projection: access through a view from `pair.left` overlaps `pair.left` and its
children, but not `pair.right`. That identity follows direct reads and writes,
arguments to helper calls, concrete callable aliases, and function-pointer
parameters whose type carries the same `from parameter(index)` result
contract.

If an ordinary address read or write has no bounded target set, the verifier
uses wildcard storage rather than dropping the access. Wildcard storage
overlaps every ordinary storage identity, so a cross-root read/write or
write/write conflict rejects `E0249`. One matching exact guard authority may
cover wildcard aliases in both roots; different authorities cannot. Addresses
proved activation-local are excluded before wildcard classification. Volatile
or MMIO pointer type is retained on a collected access so the verifier cannot
silently upgrade that explicit trusted machine boundary into an
ordinary-language violation. These are static summary facts with no runtime
tag, borrow counter, or metadata.

A mutable shared access is classified only when one of these exact proofs
holds at the access site:

- the operation is an atomic-matrix event with a legal order;
- exclusive ownership or local isolation proves that no other root can name
  the range;
- the accessed range is guarded by one exact held lock;
- the relevant interrupt class is masked, or authenticated preemption
  exclusion is active;
- an owning value was consumed by `xfer` through a generation-checked,
  release/acquire-published transfer protocol with no live writable alias; or
- a selected target descriptor authenticates the exact volatile/MMIO/device
  operation as a device protocol exception.

Volatile or MMIO intent, a compiler fence, a current-core base, a function
name, and a convention are not proofs. Checked assembly contributes only
machine facts authenticated by the active catalog; arbitrary assembly text
cannot assert a shared-access fact. A foreign declaration that asserts a
concurrency contract remains both a `foreign_assertion` and an explicitly
trusted `shared_mutation` boundary. The declaration makes the assertion
explicit; it does not turn the asserted transition into a compiler proof.

### Guard statements

Guard statements attach proof authority to an exact source range without
acquiring that authority or emitting code:

<!-- wyst-contract: fmt -->
```wyst
guard mut queue by QUEUE_LOCK {
  queue.tail = next
}

guard status against interrupts(.irq) {
  consume(status)
}

guard mut current against preemption {
  current.state = .running
}
```

`guard storage by lock` proves read access; `guard mut storage by lock` also
proves mutation. `against interrupts(.class)` and `against preemption` use the
same access modes. The storage expression must retain a stable name,
projection, index, or slice identity. Authority covers that range and its
subprojections, not sibling or wider ranges. A pointer to the range may
outlive the block, but the guard authority may not. Entering or leaving a guard
is not a fence, atomic event, interrupt instruction, preemption operation, or
runtime check; the typed semantic marker is retained through final IR
verification and lowers to zero bytes.

The exact lock must already be held and must remain held for the whole block.
The exact interrupt class must already be masked. Interrupt exclusion is
non-reentrant: double masking, wrong-class restoration, missing restoration,
and access after restoration are unproved. Preemption exclusion is a separate
target-provider authority; interrupt masking satisfies it only when the
selected target descriptor explicitly states that equivalence. No exclusion
authority may cross `execution_suspension`.

### Callable concurrency clauses

Callable types and declarations carry the authority they require or change:

<!-- wyst-contract: fmt -->
```wyst
fn try_lock() -> bool
acquires(QUEUE_LOCK) when result

fn unlock()
releases(QUEUE_LOCK)

fn masked_work()
under(interrupts(.irq))

fn mask_irq()
excludes(interrupts(.irq))

fn unmask_irq()
restores(interrupts(.irq))
```

`under(mechanism)` enters and returns with the same authority. `acquires(lock)`
enters without the lock and returns holding it; `releases(lock)` enters holding
it and returns without it. `excludes(mechanism)` and `restores(mechanism)` are
the corresponding provider transitions for interrupt or preemption
exclusion. A conditional acquisition is written `when result` for `bool`, or
with an exact result-variant condition; ignoring that result does not acquire
authority. Callable identity includes the ordered, canonical clauses, so an
indirect callable cannot erase or strengthen them.

Body-bearing Wyst functions infer exact `accesses(storage)` and
`accesses(mut storage)` summaries from their checked bodies. Explicit
`accesses` clauses are reserved for callable types and bodyless boundaries,
where the assertion is auditable. Calls substitute actual arguments for
positional parameter storage. A synchronous `noescape` callback borrows the
caller's authority for the call only; an escaping or suspending callback
cannot retain it. An unproved body-bearing acquisition, release, mask, unmask,
or preemption transition is rejected with `E0249`. A bodyless foreign
transition remains an explicit `foreign_contract` trust boundary and can also
be audited with the `shared_mutation` category; it never becomes
compiler-proved authority.

Lock transitions are accepted only for a closed two-state protocol on the
exact atomic lock location. Acquisition uses an acquire, acquire-release, or
sequentially consistent compare-exchange/exchange transition between distinct
sentinels. Release uses release or sequentially consistent storage of the
matching unlocked sentinel. Incompatible atomic orders, unrelated locations,
or incompatible sentinels do not establish the transition.

At control-flow joins, only authority held on every incoming edge survives.
Unlock, transfer, or restoration ends authority immediately; later access is
unproved. Returning, falling through, breaking, or continuing with an
unbalanced acquired/excluded state is a leak. Analysis is deterministic and
fail-closed: more than eight callable/pointer alias alternatives or more than
64 interprocedural propagation rounds is rejected with `E0249`.

### Publication and transfers

Plain payload mutation may be shared only along a path where it is sequenced
before a release (or `seq_cst`) atomic publication and the conflicting read is
control-dependent on a matching acquire (or `seq_cst`) observation of that
same atomic location and released value. Relaxed ordering, an acquire whose
result is ignored, different publication locations, and incompatible
compare-exchange orders do not prove publication. The proof is a
happens-before proof from the memory model; a guard is never treated as a
substitute fence.

Generation-checked transfer uses ordinary visible generation data and the
authenticated `core.checked.generation` operation. The owner is consumed with
`xfer`, no writable alias may remain live, and publication to another agent
still requires the release/acquire edge above. The compiler creates no hidden
generation counter and does not infer a transfer protocol from names.

The verifier rejects every unresolved ordinary site before emission. No
manifest setting can disable or downgrade `E0249`. A `.warning` or `.error`
`shared_mutation` setting applies only to explicit trusted machine boundaries;
warning-only and omitted audits remain byte-identical when compilation is
otherwise accepted. These rules do not change §9.5: memory events admitted
through a trusted boundary remain governed by this memory model and the
selected target rather than optimizer undefined behavior.

This section defines the required closed behavior. The implementation closure
ledger identifies provisional classifier surfaces that do not yet satisfy it;
while any such blocker remains, the compiler does not make the safe-subset
data-race-freedom claim.

---

## 1.1 ARM64 Register Model

ARM64 is fundamentally register-oriented. Wyst surfaces this register file
as a set of **reserved tokens** rather than as a set of variables. The
register allocator owns variable-to-register mapping; the programmer
expresses exact register placement only via the `in register` clauses in
`language.callable-storage-contracts`
and manipulates machine operands directly only inside checked `asm` bodies
(section 2.9).

General-purpose:

```text
x0-x30   64-bit
w0-w30   lower 32-bit views
sp,wsp   stack pointer
xzr,wzr  zero register
lr       alias for x30
fp       alias for x29
ip0,ip1  aliases for x16, x17 (linker scratch)
```

SIMD/FP:

```text
v0-v31   128-bit vectors
q0-q31   128-bit views
d0-d31   f64 / lower 64-bit views
s0-s31   f32 / lower 32-bit views
h0-h31   f16 / lower 16-bit views
b0-b31   lower 8-bit views
```

These tokens are reserved by the lexer. Using one as a variable, parameter,
constant, function, struct field, or label name is a syntax error. They may
appear only:

1. In a legal `in register` placement position defined by
   `language.callable-storage-contracts`.
2. In a catalog-authorized position inside the body of an `asm { ... }` block.

A Wyst statement like:

<!-- wyst-contract: sketch -->
```wyst
x0 = x1 + x2
```

is rejected. Add is expressed by writing variables:

If the operation must use specific registers (firmware contract, fixed ABI),
place the local variables explicitly:

<!-- wyst-contract: sketch -->
```wyst
var a: u64 in x1 = 1
var b: u64 in x2 = 2
var c: u64 in x0 = a + b   // guaranteed `add x0, x1, x2`
```

If an instruction must be emitted literally and its source form is active on
the checked-assembly surface, use `asm`. For example, the pinned pack admits a
load-bearing aligned NOP:

<!-- wyst-contract: sketch -->
```wyst
asm align 16 {
    nop
}
```

The pinned Wyst pack does not activate `add` as a checked source form, so the
fixed-local expression above is the supported way to request `add x0, x1, x2`.
A literal checked `add` remains a support error until a later profile activates
its exact row.

---

## 1.2 Load/Store Architecture

ARM64 is a load/store ISA.

Arithmetic only operates on registers.

Memory access must be explicit.

Traditional ARM64:

```asm
ldr x0, [x1]
add x0, x0, #5
str x0, [x1]
```

Wyst preserves this explicitly.

---

## 1.3 Memory Interpretation Model

This is one of Wyst's defining ideas.

Wyst does not elevate addresses into:

- ownership objects
- provenance-tracked references
- hidden pointer abstractions
- named address spaces

Addresses are typed values (`@T`) with a 64-bit machine representation,
interpreted through typed memory syntax. They are distinct from `u64`
(conversion requires `as`); source arithmetic on them is element-scaled.
The element type `T` records the stride used by plain `+` and `-`.
The formal rules live in [chapter-06-types.md §1.4.1](chapter-06-types.md) (Address Types subsection); this
section introduces the surface form.

ARM64 has a flat virtual address space. The only hardware distinction is:

- **Normal memory** — cached, reorderable
- **Device memory** — uncached, ordered, side-effecting

The ordering semantics of memory operations — what the compiler may reorder, what values
a load may return in the presence of concurrent stores, and how agents synchronize — are
specified in this chapter.

### Volatile and MMIO-Intent Access

Volatility is a compiler-visible access contract on the **address type**.
There is no per-access `#volatile` directive in Wyst: declare the address as
`@volatile T` when every load or store through that value must be observable to
the compiler and protected from elision, merging, or reordering across other
compiler-visible memory effects.

`@mmio T` is a separate, greppable address form for programmer intent that the
address denotes MMIO. It carries the same volatile-access contract as
`@volatile T`, and accesses through it additionally introduce the `mmio` effect.
Neither `@volatile T` nor `@mmio T` proves that the address is mapped as ARM
Device memory. Normal-vs-Device memory type is established by page tables,
firmware, or platform configuration; target descriptions may record known
mapping facts, but a type conversion cannot create them.

A volatile access is a **compiler barrier**. The compiler may not:

- eliminate the access (no dead store elimination, no load forwarding)
- hoist the access above surrounding code
- sink the access below surrounding code
- merge multiple accesses to the same address
- speculatively execute the access ahead of a guard condition

Two volatile accesses are never reordered with respect to each other.
A plain access may not be moved across a volatile access in either direction.

**Volatility does not emit CPU memory barriers.** This is separate from the
architectural ordering supplied by the address's memory attributes. ARM
Device-nGnRE and Device-nGnRnE preserve program order for accesses to the same
memory-mapped peripheral, so accesses to different registers in one such
peripheral do not require barriers merely because their addresses differ.
Use an explicit barrier when required ordering crosses the boundary covered by
the Device-memory rule, or when completion rather than ordering is required.
See section 1.3.1 for the qualified barrier catalog and MMIO ordering patterns.

**Volatility and MMIO intent do not control cacheability.** Whether an address
is cached or uncached is determined by the page-table entry for that address
(specifically the MAIR index and the memory type attribute in the descriptor).
A volatile or MMIO-intent access to an address mapped as Normal-Cacheable in the
page tables will still go through the cache. Platform initialization code is
responsible for configuring MMIO regions with Device memory attributes
(e.g. Device-nGnRE) before accessing them.

### Declared Hardware Access Events

Placed register maps and standalone scalar `mmio` declarations use the same
observable access contract as raw access through `@mmio T`, while retaining
their stronger declaration and value-type rules from Chapters 6 and 11. Each
permitted `.read()` is exactly one volatile MMIO-intent load and each permitted
raw or named `.write(...)` is exactly one volatile MMIO-intent store. Every such
event carries both `volatile_access` and `mmio` effects.

The receiver and all arguments are evaluated once, left to right in written
order, before the hardware event. A policy-aware named write constructs its
complete backing value before its one store. A permitted `.modify(...)`
evaluates the receiver and arguments first, then performs exactly one hardware
read followed by exactly one hardware write. The pair is one compiler-ordering
unit but is not an atomic read-modify-write: another observer may update the
register between its read and write.

Every declared MMIO access is a full two-way compiler-memory boundary. A pass
must not eliminate, duplicate, merge, split, speculate, or reorder it, and no
plain, volatile, MMIO, atomic, barrier, or opaque memory event may cross it in
either direction. A complete modify may not be separated, interleaved with an
unrelated compiler memory event, or reduced to a single event. Field projection
from a captured register snapshot is an ordinary value operation and is not a
second event.

System-register declaration operations are also full two-way compiler-memory
boundaries. Their machine-semantic effects, privilege gates, faults, and
implicit-state facts come from the authenticated A64 catalog rather than from
the MMIO effect pair. A system-register modify likewise keeps its exact one
read/one write sequence together as one compiler-ordering unit.

These boundaries create no synchronizes-with or happens-before edge and provide
no atomicity. They emit no implicit `dmb`, `dsb`, or `isb`. Any architectural
barrier required by a device or system register remains a separate explicit
source operation. Effects and lowering reports distinguish scalar reads,
snapshot reads, raw full-width writes, policy-aware named writes, complete
read-modify-writes, compiler-only ordering, and actually emitted barrier
instructions.

### Address Types

Addresses are typed as `@T` — an address into elements of type `T`. This applies to **any** type with a compile-time-known size:

#### Integer Addresses

<!-- wyst-contract: sketch -->
```wyst
@u8   // address into u8s   (element stride 1)
@u16  // address into u16s  (element stride 2)
@u32  // address into u32s  (element stride 4)
@u64  // address into u64s  (element stride 8)
```

The "stride N" annotation describes what one _element_ occupies. Address
movement uses `element_offset(p, i)`, `byte_offset(p, bytes)`, or
`field_addr(p, T.field)` so the unit is explicit. The formal arithmetic rules
are in [chapter-06-types.md §1.4.1](chapter-06-types.md).

#### Volatile and MMIO-Intent Addresses

The qualifier `@volatile T` marks an address with the volatile-access compiler
contract. The qualifier `@mmio T` marks the same access contract plus programmer
intent that the numeric address denotes an MMIO register or region. Every load
or store through either qualified address is a compiler barrier (see section
1.3.1). Only access through `@mmio T` introduces the `mmio` effect. Qualifiers
propagate through address arithmetic:

There is no implicit conversion among `@T`, `@volatile T`, and `@mmio T` in any
direction. Stripping volatility or MMIO intent requires an explicit
`qualify<T>(address)` conversion and emits a warning; adding either qualifier
also requires that named conversion.
These are visible source events and do not perform memory access by themselves.

Volatility is determined only by the static address type at the memory-access
site. A load or store through an expression of type `@T` is a plain access; a
load or store through an expression of type `@volatile T` or `@mmio T` is a
volatile access. Access through `@mmio T` additionally records MMIO intent.
This access-site rule does not create separate alias classes. A plain access
through `@T`, a volatile access through `@volatile T`, and an MMIO-intent access
through `@mmio T` may alias when their numeric address ranges can overlap,
including when one address was produced by casting the other.

#### Float Addresses

<!-- wyst-contract: sketch -->
```wyst
@f32  // address into f32s (stride 4)
@f64  // address into f64s (stride 8)
```

Float loads and stores use the same `type[address]` syntax:

#### Struct Addresses

<!-- wyst-contract: sketch -->
```wyst
// `string` is a built-in value with this representation:
// { data : @u8, len : u64 }

@string  // address into strings (stride 16)
```

Struct stride is the total size of the struct (sum of field sizes including padding). Addressing structs lets you treat contiguous struct data as an array:

#### Vector Addresses

Vector addresses follow the same model — stride equals the total vector size.

The element type records the intended access type. Array and slice indexing
syntax is a separate operation; `@T` address arithmetic uses element offsets:

### MMIO Example

MMIO intent and volatility come from the address type. No per-access directive
can be forgotten, and the type does not replace the runtime page-table setup
that maps the UART region as Device memory.

### Why This Model Exists

This syntax unifies:

- loads
- stores
- arrays
- MMIO
- volatile memory
- typed access
- pointer arithmetic

without introducing separate pointer semantics or named address spaces.

Advantages:

- smaller semantic core
- direct ARM64 mapping
- clearer lowering rules
- easier explainability
- matches hardware reality (flat address space)

Tradeoffs:

- harder alias analysis
- harder provenance tracking
- more compiler responsibility

Wyst intentionally favors semantic clarity over optimizer complexity.

---

## 1.3.1 Volatility, MMIO, and Barriers

Wyst separates volatile access, MMIO intent, atomic ordering, hardware
barriers, and compiler-only barriers.

Wyst distinguishes five orthogonal mechanisms for controlling memory
operations:

| Mechanism                | Form                             | Scope                                      |
| ------------------------ | -------------------------------- | ------------------------------------------ |
| Volatile access contract | `@volatile T` or `@mmio T` type  | every access through the typed address     |
| MMIO intent              | `@mmio T` type                   | every access through the typed address     |
| Atomic ordering          | typed `atomic<T>` methods         | one atomic operation                         |
| CPU memory ordering      | `barrier.dsb(...)`/`barrier.dmb(...)`/`barrier.isb()` | hardware and compiler fence at one point |
| Compiler-only ordering   | `barrier.compiler()`              | compiler fence at one point; emits nothing |

Volatility is **always** type-based. Atomic acquire and release orders are
arguments to typed atomic methods. Barriers are statement-level fences.

---

### Volatility via `@volatile T`

An address of type `@volatile T` carries a compiler-visible access contract,
not a page-table memory-type fact. Every load or store through such an address
is a **compiler barrier**:

- the compiler may not eliminate the access (no dead-store elimination,
  no load forwarding, no merging of consecutive accesses);
- the compiler may not hoist the access above surrounding code;
- the compiler may not sink the access below surrounding code;
- the compiler may not speculatively execute the access ahead of a guard.

Two volatile accesses are never reordered relative to each other. A plain
access may not be moved across a volatile access in either direction.

A volatile access lowers to the same `ldr`/`str` instruction as a plain
access. The "device" behavior comes from the page-table attributes for the
address, not from the instruction encoding. Volatility is a compiler
contract, not a hardware contract — it guarantees the compiler does not
optimize the access away.

#### Propagation

Volatility propagates through address arithmetic. If `p : @volatile u32`, then
`p + 4` is `@volatile u32` at element offset 4, which means byte address
`p + 16`. Use `p + 1` for the next `u32` element, or cast through `@volatile u8`
when a byte view is needed. Any access through the derived address is a
compiler barrier:

Volatility and MMIO intent are properties of the static result type of the
arithmetic expression. If an integer operand was produced from an address with
the named `address<u64>(source)` conversion, the source address's qualifiers must match the result address
qualifiers. Mixed-qualifier address arithmetic is rejected unless the source
first casts one address to the intended qualifier:

There is no implicit conversion among `@T`, `@volatile T`, and `@mmio T` in any
direction. To strip volatility or MMIO intent use an explicit `qualify<T>`
conversion, which emits a warning. To treat a plain address as volatile or
MMIO-intent, use that named conversion as well. These
conversions do not perform an access and do not introduce
`volatile_access` or `mmio` effects until a later load or store:

The static address type at the access site decides whether the access is
plain, volatile, or MMIO-intent, but it is not an alias boundary. If `plain`
and `device` hold the same numeric address, the compiler must assume
`plain.load()` and `device.load()` may touch the same bytes even though one
access is plain and the other is volatile with MMIO intent.

### MMIO Intent via `@mmio T`

`@mmio T` is the source-level marker for an address that the programmer intends
to use as memory-mapped I/O. It is intentionally separate from the architectural
memory type:

- converting an address to `@mmio T` records intent but does not perform MMIO;
- loading or storing through `@mmio T` introduces both `volatile_access` and
  `mmio` effects;
- target descriptors may report known Device-memory ranges, but those facts are
  mapping facts, not type conversions;
- the runtime or platform remains responsible for configuring page tables with
  Device memory attributes before MMIO is accessed.

#### What `@volatile` and `@mmio` Do Not Do

**Volatility does not emit CPU memory barriers.** Architectural ordering comes
from the address's memory attributes: Device-nGnRE and Device-nGnRnE preserve
program order for accesses to the same peripheral, including different
register offsets. Use an explicit barrier only when the required relationship
extends beyond that Device ordering. See **MMIO Ordering** below.

**Volatility and MMIO intent do not control cacheability.** Whether an address
is cached or uncached is determined by the page-table entry for that address
(specifically the MAIR index and the memory type attribute in the descriptor).
A volatile or MMIO-intent access to an address mapped as Normal-Cacheable in the
page tables will still go through the cache. Platform initialization code is
responsible for configuring MMIO regions with Device memory attributes
(e.g. Device-nGnRE) before accessing them.

---

### Combination Rules

| Combination                                  | Validity      | Reason                          |
| -------------------------------------------- | ------------- | ------------------------------- |
| load/store via `@T`                          | valid         | plain access                    |
| load/store via `@volatile T`                 | valid         | volatile (compiler barrier)     |
| load/store via `@mmio T`                     | valid         | volatile plus MMIO intent       |
| typed atomic method                          | valid         | order must be legal for that method |
| atomic order on another access kind          | compile error | atomic orders belong to atomic methods |

---

### Qualified Barrier Operations

Barriers enforce memory ordering at the CPU level, independent of any
specific memory access. They are required wherever the ARM64 weak memory
model would otherwise permit the CPU to reorder accesses in ways the program
cannot tolerate.

The examples below assume `import core.arch { barrier }`; the category name is
not ambient.

<!-- wyst-contract: sketch -->
```wyst
barrier.dsb(.sy)    // data synchronization barrier — full system
            // stalls until all preceding memory accesses complete
            // lowers to: dsb sy

barrier.dsb(.st)    // data synchronization barrier — stores only
            // stalls until all preceding stores complete
            // lowers to: dsb st

barrier.dsb(.ld)    // data synchronization barrier — loads only
            // stalls until all preceding loads complete
            // lowers to: dsb ld

barrier.dsb(.ish)   // data synchronization barrier — inner shareable domain
            // lowers to: dsb ish

barrier.dsb(.osh)   // data synchronization barrier — outer shareable domain
            // lowers to: dsb osh

barrier.dsb(.nsh)   // data synchronization barrier — non-shareable domain
            // lowers to: dsb nsh

barrier.dmb(.sy)    // data memory barrier — full system
            // orders but does not stall; preceding accesses are ordered
            // before subsequent ones but the CPU need not wait
            // lowers to: dmb sy

barrier.dmb(.ish)   // data memory barrier — inner shareable domain
            // lowers to: dmb ish

barrier.isb()      // instruction synchronization barrier
            // flushes the pipeline; required after writing system registers
            // that affect instruction fetch or decode
            // lowers to: isb
```

The accepted `barrier.dsb` and `barrier.dmb` arguments are dot-prefixed
compile-time cases from this closed vocabulary:

| Token family | Meaning |
| ------------ | ------- |
| `sy`         | full-system domain, all explicit memory accesses |
| `st`         | full-system domain, stores only |
| `ld`         | full-system domain, loads only |
| `ish`        | inner-shareable domain, all explicit memory accesses |
| `ishst`      | inner-shareable domain, stores only |
| `ishld`      | inner-shareable domain, loads only |
| `osh`        | outer-shareable domain, all explicit memory accesses |
| `oshst`      | outer-shareable domain, stores only |
| `oshld`      | outer-shareable domain, loads only |
| `nsh`        | non-shareable domain, all explicit memory accesses |
| `nshst`      | non-shareable domain, stores only |
| `nshld`      | non-shareable domain, loads only |

The option tokens match the ARM64 architecture manual shareability/access
domain notation.

`barrier.dsb`, `barrier.dmb`, and `barrier.isb()` are also full two-way compiler memory fences:
the compiler must not move any load, store, atomic, volatile access, barrier,
or opaque side effect across them. This fusion is intentional policy, not an
accident of the current backend. Use `barrier.compiler()` when source needs
only compiler ordering and must not emit a hardware barrier:

<!-- wyst-contract: sketch -->
```wyst
barrier.compiler()   // full compiler memory fence; lowers to no instruction
```

`barrier.compiler()` has no hardware memory-ordering effect. It does not
flush pipelines, drain store buffers, order cache or TLB maintenance, or
create a happens-before edge between agents.

---

### MMIO Ordering

Compiler-visible ordering and architectural Device-memory ordering are
separate contracts. `@volatile T` and `@mmio T` preserve source event order but
do not select the hardware memory type; page tables, firmware, or platform
configuration must map peripheral regions as Device memory.

When a peripheral is mapped as Device-nGnRE or Device-nGnRnE, accesses to that
same memory-mapped peripheral arrive in program order. Different register
offsets do not change that rule. A sequence such as the PL011 baud-rate update
therefore needs no barrier between its register writes:

<!-- wyst-contract: sketch -->
```wyst
UART0.IBRD.write(DIVINT = 13)
UART0.FBRD.write(DIVFRAC = 1)
UART0.LCR_H.write(FEN = true, WLEN = 3)
UART0.CR.write(UARTEN = true, TXE = true)
```

With the Stage 1 MMU disabled, ARM64 data accesses use Device-nGnRnE, so the
same rule covers pre-MMU boot fixtures. Device-nGnRnE also forbids early write
acknowledgement.

Use an architectural barrier when the required relationship extends beyond
same-peripheral Device ordering. Examples include Normal-memory writes before
an MMIO doorbell, accesses to different peripherals, communication with
another observer, cache or TLB maintenance, and completion before reset,
power-state transition, or suspension. `barrier.dmb(...)` orders covered
accesses; `barrier.dsb(...)` additionally waits for covered operations to
complete. Select the narrowest access class and shareability domain justified
by the target rather than defaulting to `.sy`.

---

### Spinlock Example

The lock uses typed methods on opaque atomic storage:

The example assumes `import core.arch { cpu }`; the category name is not
ambient.

<!-- wyst-contract: sketch -->
```wyst
var lock: atomic<u64> = atomic<u64>(0)

fn spin_lock() {
  loop {
    var (_, ok) = lock.compare_exchange(0, 1, .acquire)
    if ok {
      return
    }
    cpu.wfe()
  }
}

fn spin_unlock() {
  lock.store(0, .release) // store-release clears the lock
  cpu.sev() // wake any waiters
}
```

The selected checked-assembly pack does
not activate open-coded `ldaxr`/`stlxr`, so production code uses the typed
atomic methods.

---

### Relationship to Scheduling

Volatile accesses remain in source event order relative to other volatile
accesses — the compiler will not reorder them relative to each
other. This is a **compiler scheduling** constraint only. Architectural
ordering comes from the mapping's memory attributes or, where those rules do
not cover the required relationship, an explicit `barrier.dmb` or `barrier.dsb`.

Atomic storage expresses acquire and release ordering through
`.load(.acquire)` and `.store(value, .release)`.

---

### Why Volatility Lives in the Type

Per-access `#volatile` directives have a known failure mode: a single
forgotten annotation silently miscompiles, and the compiler issues no
warning because both forms are legal at every access site. Wyst rejects
that model. Volatility and MMIO intent are properties of _what the address
value is meant to access_, not _how a particular line of code touches it_.
Modelling them in the type makes the rule check-able:

- A function `read_reg(p : @volatile u32) -> u32` cannot be called with
  a plain `@u32` argument without an explicit categorized conversion.
- A function `peek(p : @u32) -> u32` cannot be called with an
  `@volatile u32` argument without an explicit categorized conversion.
- A function `read_mmio(p : @mmio u32) -> u32` cannot be called with a plain or
  volatile-only address without an explicit `qualify<@mmio u32>(address)` conversion.
- A struct field declared `@volatile u32` or `@mmio u32` cannot be accessed as
  if it were a plain `u32`.
- Refactoring an MMIO access into a helper preserves MMIO intent through the
  parameter type.

Code review can focus on the type declaration site, not on every access.

---

## Overview

Wyst's memory model is language-level: it describes source executions before
production SMP runtime policy is added. It defines which values loads may
observe, which operations synchronize across agents, how barriers participate
in ordering, and which compiler transformations are legal.

The model has three distinct orders:

1. **Source event order**: the evaluation order required by Wyst source inside
   one execution agent.
2. **Compiler event order**: the order of memory and effect events in the
   emitted instruction stream after optimization.
3. **Architectural event order**: the order in which the selected target may
   make those emitted events visible to agents under the target memory model.

The compiler may change compiler event order only when the transformation is
allowed by this chapter. The architecture may still observe events in an order
permitted by ARM64 unless Wyst emits acquire, release, `seq_cst`, or barrier
instructions that constrain it. Where ARM64 terminology is used (inner
shareable, outer shareable, full system, Device memory, Normal memory), it
carries the ARM64 Architecture Reference Manual meaning.

---

## 9.1 Execution Model

### Agents

An **execution agent** is the memory-model umbrella for an ordered execution
history that can share memory with other agents:

- a hardware CPU core;
- a DMA controller or other bus master that can read or write system memory;
- an external device that owns or updates MMIO-visible state.

An **execution strand** is one sequential Wyst control-flow instance inside an
agent. Ordinary code, each trap/interrupt invocation, and each saved task
continuation are distinct strands as specified in Chapter 13. A trap handler is
therefore not a new memory-model agent: it is a fresh strand in the interrupted
agent. External agents without Wyst control flow have the corresponding
target-defined sequential history.

Each agent's **source event order** combines its strand orders with the
target-defined entry and ordinary-return control edges between them. Within a
strand, it is induced by Wyst evaluation rules in
[chapter-07-operators.md](chapter-07-operators.md), statement order, and
control flow. For an assignment, the address/storage-target side precedes the
assigned value. For a call, the callee expression and argument effects are
ordered left-to-right before the call effect and any suspension boundary.

### Memory Locations and Access Ranges

A **byte location** is one byte of addressable memory. An **access range** is
the contiguous byte range touched by one source load, store, or atomic
operation. Two events **conflict** when their access ranges overlap and at
least one event writes.

A **coherence location** is the exact access range of an access-atomic scalar
or atomic operation. Naturally aligned `u8`/`i8`, `u16`/`i16`, `u32`/`i32`,
`u64`/`i64`, address-width, `f32`, and `f64` scalar accesses are
access-atomic as described in §9.6. Wider aggregate, pair, vector, and
misaligned accesses are modeled as a deterministic sequence of smaller memory
events; each sub-event has its own access range.

### Memory Events

The model recognizes these source memory events:

| Event kind | Wyst surface | Writes? | Synchronizing? |
| --- | --- | --- | --- |
| Plain load | `addr.load()` where `addr: @T` | no | no |
| Plain store | `addr.store(val)` where `addr: @T` | yes | no |
| Volatile load | `addr.load()` where `addr: @volatile T` | no | compiler-only fence |
| Volatile store | `addr.store(val)` where `addr: @volatile T` | yes | compiler-only fence |
| MMIO-intent load | `addr.load()` where `addr: @mmio T` | no | compiler-only fence plus `mmio` effect |
| MMIO-intent store | `addr.store(val)` where `addr: @mmio T` | yes | compiler-only fence plus `mmio` effect |
| Acquire atomic load | `atomic_addr.load(.acquire)` | no | acquire |
| Release atomic store | `atomic_addr.store(val, .release)` | yes | release |
| Relaxed atomic load/store | `.load(.relaxed)` / `.store(val, .relaxed)` | load: no, store: yes | no |
| Seq-cst atomic load/store | `.load(.seq_cst)` / `.store(val, .seq_cst)` | load: no, store: yes | acquire/release plus SC |
| Atomic RMW | `.compare_exchange`, `.exchange`, every `.fetch_*`, and both bit methods | success/RMW: yes; failed compare-exchange: no | by the closed order argument |

An **atomic event** is an ordered atomic load/store or an atomic RMW on an
`atomic<T>` binding or `@atomic<T>` address. Atomic events on the same
coherence location are single-copy atomic and do not tear. A read-modify-write
(RMW) event contains a read part and, when it succeeds or is an unconditional
RMW, a write part. A successful RMW's read and write are adjacent in the
location's modification order. A failed `compare_exchange` is an atomic read
with no write.

Volatility is determined only by the static address type at the access site.
Volatile and MMIO-intent accesses are observable compiler events, but they are
not synchronization events. Atomic storage cannot be volatile- or
MMIO-qualified and requires atomic-capable Normal memory; an ordinary,
`@volatile T`, or `@mmio T` address never acquires atomic ordering implicitly.

Qualified barrier operations (`barrier.dsb`, `barrier.dmb`, `barrier.isb()`)
and `barrier.compiler()` are **barrier events**, not loads or stores. They are in
source event order, constrain compiler event order, and have the hardware
meaning described in §9.9. `barrier.compiler()` has no architectural event.
`schedule source` boundaries are compiler scheduling boundaries only.

---

## 9.2 Modification Order, Reads-From, and Coherence

### Modification Order

Every byte location has a **modification order**: a total order of all writes
to that byte, including an initial write representing the byte's startup
contents. For an access-atomic write to a multi-byte coherence location, the
write appears as one indivisible modification of that exact range and as one
write in each covered byte's modification order.

For each coherence location used by atomic events, Wyst also defines a
per-location modification order for that exact byte range, written **mo(X)**.
`mo(X)` is a total order of the initial write, every access-atomic write to X,
and every successful atomic RMW write to X. That includes plain, volatile,
MMIO-intent, atomic-store, and RMW writes when they touch the exact range X as
one access-atomic event. Non-access-atomic writes appear only in the per-byte
modification orders for their sub-accesses.

`mo(X)` is consistent with the per-byte modification orders for X. RMW events
are linearized at one point in `mo(X)`: their read part reads the immediately
preceding value in `mo(X)`, and their write part, if any, follows that read
without an intervening write to X. This is what makes the canonical
`.compare_exchange(..., .acquire)` lock / `.store(..., .release)` unlock
pattern a defined synchronization pattern rather than an illicit mixed access.

### Reads-From

Each load-like event has a **reads-from** relation:

- An access-atomic scalar or atomic load from X reads from exactly one write W
  to X.
- A successful RMW reads from the write immediately before it in `mo(X)`.
- A failed `compare_exchange` reads from one write in `mo(X)` and performs no
  write.
- A non-access-atomic load reads from one write per sub-access. A wider load
  may therefore observe bytes from different writes.
- A volatile or MMIO-intent load reads from the hardware-presented value at its
  architectural event, subject to the same access-atomic or tearing rules.

The result of a load is assembled from its reads-from write or writes. A
tearing read observes `Indeterminate bits`; those bits become an ordinary typed
value and are never optimizer poison.

### Per-Location Coherence

For one coherence location X, executions must satisfy these coherence rules:

1. If write A to X happens-before write B to X, then A precedes B in `mo(X)`.
2. If write A to X happens-before load L from X, then L may not read from a
   write that precedes A in `mo(X)`.
3. If load L from X reads from write A, and L happens-before write B to X, then
   A precedes B in `mo(X)`.
4. If load L1 from X happens-before load L2 from X, and L1 reads from A while
   L2 reads from B, then B must not precede A in `mo(X)`.

When no conflicting concurrent write exists, a load reads the latest write to
its location that happens-before the load, or the initial write when no such
write exists. When a conflicting concurrent write exists, §9.5 determines
whether the result is target-defined or indeterminate.

---

## 9.3 Synchronizes-With, Happens-Before, and SC Order

### Atomic Order Meanings

Every atomic order has this language-level meaning:

| Order | Language meaning |
| --- | --- |
| `relaxed` | Atomicity and participation in `mo(X)` only. No synchronizes-with edge and no cross-location ordering. |
| `acquire` | The read side is an acquire operation. Later source events in the same agent may not be observed before it. If it reads from a release sequence, it synchronizes with that release sequence's head. |
| `release` | The write side is a release operation. Earlier source events in the same agent may not be observed after it. It can head a release sequence. |
| `acq_rel` | RMW-only. The event is both acquire and release; it can synchronize as a read and head or extend a release sequence as a write. |
| `seq_cst` | The event has acquire/release strength as applicable and participates in the single global sequentially consistent order. |

`.load` accepts `.relaxed`, `.acquire`, and `.seq_cst`; `.store` accepts
`.relaxed`, `.release`, and `.seq_cst`. `exchange`, `compare_exchange`, every
`fetch_*`, and both bit methods accept all five closed orders. No method has a
default order or runtime-dispatched order.

### Release Sequences

Wyst supports release sequences. A **release sequence** on coherence location X
is the maximal contiguous sequence in `mo(X)` that starts with a release write
or release RMW H and continues through atomic RMW events on X, from any agent,
where each RMW reads from the immediately previous member of the sequence.
Plain stores, relaxed atomic stores, failed `compare_exchange` reads, or writes
to another location end the sequence.

The sequence head H may be a `.release`/`.seq_cst` atomic store or a
`.release`/`.acq_rel`/`.seq_cst` RMW. RMW operations that extend a release
sequence do not need release ordering themselves; their read-from chain
carries the sequence.

### Synchronizes-With

The **synchronizes-with** relation, written **sw**, contains these edges:

1. A release sequence head H on X synchronizes-with an acquire read A on X when
   A reads from any member of that release sequence. `seq_cst` loads and RMWs
   count as acquire reads; `acquire`, `acq_rel`, and `seq_cst` RMWs count as
   acquire reads.
2. A release-side architectural barrier B1 synchronizes-with an acquire-side
   architectural barrier B2 when all of these hold:
   - B1 is `barrier.dmb` or `barrier.dsb` with an all-access or store-covering domain.
   - B2 is `barrier.dmb` or `barrier.dsb` with an all-access or load-covering domain.
   - B1 is source-ordered before a store S to flag location F.
   - A load L from F reads-from S.
   - L is source-ordered before B2.
   - both barriers' shareability/access domains cover F and the protected
     locations.

Barrier-mediated synchronization is intentionally explicit and domain
sensitive. Two agents issuing barriers without a read-from edge on a flag do
not synchronize. `barrier.compiler()` never synchronizes with another agent.
`barrier.isb()` orders instruction-side effects for one agent; by itself it does not
create a memory synchronizes-with edge.

### Happens-Before

The **happens-before** relation, written **hb**, is the transitive closure of:

- source event order within one agent;
- every synchronizes-with edge;
- initialization order before the first event that can access initialized
  storage.

If A hb B, every legal compiler event order and architectural execution must
preserve the visibility consequences required by A before B. `hb` is not a
claim that the emitted instructions are textually adjacent; it is the language
ordering relation used by visible-value, race, and transformation checks.

### Global Sequentially Consistent Order

All `seq_cst` atomic events participate in one total order, written **S**. S
contains every `.load(.seq_cst)`, `.store(value, .seq_cst)`, and atomic RMW
method requested with `.seq_cst`. S must be consistent with:

- happens-before between `seq_cst` events;
- each location's `mo(X)` for `seq_cst` writes and successful `seq_cst` RMWs
  to X;
- each RMW's requirement that its read part observes the immediately preceding
  write in `mo(X)`.

A `seq_cst` store is a release write in `mo(X)` and S. A `seq_cst` load is an
acquire read in S. A `seq_cst` RMW is both acquire and release, participates in
`mo(X)`, and participates in S as one indivisible event.

### How a Seq-Cst Load Selects Its Value

A `seq_cst` load L from X selects its value by first choosing a write W to X
that is allowed by reads-from and per-location coherence. It must also satisfy
the SC constraints:

1. If W is `seq_cst`, W must precede L in S.
2. If there is a `seq_cst` write Wsc to X that precedes L in S, W must not
   precede Wsc in `mo(X)`.
3. If a write Whb to X happens-before L, W must not precede Whb in `mo(X)`.

Thus an SC load never observes a value older than the latest SC write to that
location before it in S, nor older than a write that already happens-before it.
It may read a later non-SC write in `mo(X)` when the ordinary reads-from rules
allow that write.

### Barrier Examples

Acquire/release synchronization is the preferred CPU-to-CPU spelling:

<!-- wyst-contract: sketch -->
```wyst
var flag: atomic<u64> = atomic<u64>(0)

// Agent 1
buf.store(data)
flag.store(1, .release)

// Agent 2
const seen: u64 = flag.load(.acquire)
if seen == 1 {
    const data: u64 = buf.load()
}
```

The release store heads a release sequence on `flag`. The acquire load reads
from that sequence, so the release synchronizes-with the acquire and the data
write happens-before the final data read.

Barrier-mediated synchronization is valid but less composable:

If the flag load reads from the flag store and the inner-shareable domain covers
both locations, the two barriers synchronize. If the flag load does not read
from the store, or the domain is wrong, no inter-agent hb edge is created.

### required Litmus Outcomes

The following litmus outcomes are part of the required concurrent memory-model
suite. The executable form lives in
`wync/tests/memory_model_litmus.rs`; a regression must fail by naming the
semantic outcome that was wrongly admitted or rejected, not merely by noticing
that an instruction mnemonic changed.

| Litmus | Program shape | Outcome rule |
| --- | --- | --- |
| Message passing | Agent 0 writes `data`, then release-stores `flag`; agent 1 acquire-loads `flag`, then reads `data`. | If `flag == 1`, `data == 0` is forbidden; reading the release value synchronizes with the acquire and carries the payload write through hb. |
| Store buffering | Each agent stores one atomic location and then loads the other. | With `relaxed`, `r0 == 0 && r1 == 0` is allowed. With `seq_cst`, the same outcome is forbidden by the single SC order. |
| Load buffering | Each agent loads one atomic location and then stores the other. | With `relaxed`, `r0 == 1 && r1 == 1` is allowed. With `seq_cst`, the same outcome is forbidden because it creates an SC cycle. |
| Independent reads of independent writes (IRIW) | Two agents publish independent writes; two readers observe the locations in opposite orders. | Release/acquire permits the split observation when the reads synchronize only per location. `seq_cst` forbids the split observation through the global SC order. |
| Release sequence | A release store to `flag` is followed in `mo(flag)` by a relaxed RMW that reads it; a later acquire load reads the RMW value. | The acquire synchronizes with the release-sequence head, so stale protected data is forbidden. |
| Barrier message passing | Plain payload write, `barrier.dmb(.ishst)`, plain flag store; flag load, `barrier.dmb(.ishld)`, payload read. | If the flag load reads from the flag store and the domain covers both locations, stale payload is forbidden. Replacing the barriers with `barrier.compiler()` allows the stale payload because no inter-agent sw edge exists. |
| Mixed atomic/plain access | One agent performs a relaxed atomic store while another performs a plain load of the same scalar location without hb. | Ordinary Wyst rejects the plain side with `E0249`. If a false trusted contract admits it, the hardware outcome is target-defined for access-atomic scalar accesses rather than optimizer-undefined behavior. |
| Compiler scheduling and aliasing | A store followed by a load is compared with a load/store reordering. | Reordering may-alias accesses is forbidden when it admits a stale-load outcome. Reordering proven disjoint accesses is allowed when the transformed outcomes are a subset of the source outcomes. |

ARM64 lowering validation for these litmus tests is semantic, not mnemonic
based. The checked ARM64 contracts use architectural facts that correspond to
the ARMv8 formal model: other-multi-copy atomicity, aligned scalar
single-copy atomicity, the architectural ordering of a store-release before a
following load-acquire, and either LSE single-event RMW behavior or baseline
LL/SC retry-until-complete behavior. A lowering proof that only says "`ldar`
was emitted" or "`stlr` was emitted" is incomplete for Wyst `seq_cst`.

---

## 9.4 Compiler Event Order, Alias Proofs, and Transformations

### Compiler Event Order

The compiler emits a **compiler event order** for each agent: the order of
loads, stores, atomics, volatile accesses, barrier events, calls with memory
effects, and non-pure `asm` effects in the instruction stream. A transformation
is legal only when every source execution admitted by the emitted program has a
corresponding source execution admitted by this chapter with the same observable
volatile, MMIO, atomic, barrier, trap, call, and plain-memory effects.

Compiler event order is more constrained than architectural event order. For
example, a volatile load must remain textually ordered in compiler event order,
but the target may still need `barrier.dmb` or `barrier.dsb` for hardware ordering relative to
another agent. Conversely, `barrier.compiler()` constrains compiler event
order but produces no architectural event.

### Closed Alias Proof List

Wyst deliberately rejects strict-aliasing folklore. Different element types,
different address qualifiers, casts through `u64`, and different parameter
names are not alias proofs. Every nontrivial memory reordering, load
forwarding, or dead-store removal must be justified by one of these closed
proofs:

1. **Distinct compiler-owned globals.** Two mutable or immutable globals with
   distinct compiler-assigned storage allocations are disjoint for their
   allocated byte ranges. This proof does not apply to numeric address
   constants, foreign symbols, linker overlays, or target-described MMIO
   ranges.
2. **Distinct non-escaping stack objects.** Two stack objects in the same
   function are disjoint for their allocated byte ranges while neither
   object's address has escaped through a store, return, indirect call,
   ordinary call without a precise no-memory contract, inline assembly, or cast
   to a value that can outlive the proof.
3. **Statically disjoint byte ranges.** Two accesses derived from the same
   proven base are disjoint when their byte offsets and widths are compile-time
   known and the ranges do not overlap. Typed element offsets, byte-lens casts,
   and `#field_offset` may be used to compute the ranges.
If none of these proofs applies, the compiler must assume the ranges may alias.
This includes two `@T` parameters, a `@T` access and an `@volatile T` access,
two computed numeric addresses, and two differently typed views of the same
bytes.

### Reordering Table

Given source event A before source event B, may the compiler emit B before A?

| Earlier A / later B | Plain | Volatile/MMIO | Acquire | Release | Atomic relaxed | Atomic SC | Barrier/opaque |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Plain | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | no |
| Volatile/MMIO | no | no | no | no | no | no | no |
| Acquire | no | no | no | no | no | no | no |
| Release | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | no |
| Atomic relaxed | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | no |
| Atomic SC | no | no | no | no | no | no | no |
| Barrier/opaque | no | no | no | no | no | no | no |

"Barrier/opaque" includes `barrier.dsb`, `barrier.dmb`, `barrier.isb()`, `barrier.compiler()`,
strict schedule boundaries, calls whose memory effects are not proven absent,
and non-pure `asm` blocks. A data, control, or address dependency is always a
separate reason that reordering is illegal.

### Allowed Transformations

The following transformations are allowed when their listed proof obligations
are met:

- Reorder two plain or relaxed-atomic events only when the closed alias proof
  list proves their ranges do not overlap, there is no dependency, and no
  intervening event imposes ordering.
- Forward a plain store to a later plain load only when the stored range fully
  covers the loaded range, no intervening event may write any overlapping byte,
  and the storage is proven private or otherwise non-observable by another
  agent for that interval.
- Delete a plain store only when a later write fully overwrites it before any
  possible read, volatile/MMIO access, atomic event, barrier, opaque call, or
  escaping use can observe it.
- Combine adjacent plain scalar accesses into an aggregate copy only when the
  resulting chunking is exactly the deterministic aggregate-copy rule in §9.6
  and no volatile, MMIO, atomic, barrier, or opaque event is crossed.
- Keep ordinary scalar values in registers when the source object is a
  non-escaping local or another closed alias proof shows no event can observe
  the memory slot.

### Forbidden Transformations

The compiler must not:

- use a data race, indeterminate read, invalid address, false trusted contract,
  or architectural fault as an impossible-state assumption;
- treat a data race as optimizer poison or LLVM-style `undef`;
- infer non-aliasing from different Wyst element types, signedness, volatility,
  MMIO intent, `@T` parameter names, or source casts;
- eliminate, duplicate, merge, split, speculate, or reorder volatile or
  MMIO-intent accesses except as required by the explicit access itself;
- move any memory event across `barrier.dsb`, `barrier.dmb`, `barrier.isb()`,
  `barrier.compiler()`, a strict schedule boundary, or an opaque memory-effect
  call or non-pure `asm` block;
- weaken an atomic order, remove an atomic event, split one atomic RMW into
  separately observable source events, or synthesize an atomic event the source
  did not request;
- replace a racy source load with an arbitrary constant, cached value, or
  "as-if" value not delivered by the target execution;
- assume a plain access cannot race merely because racing would make the
  program incorrect.

---

## 9.5 Data Races and Mixed Accesses

### Data Race Definition

Two memory events M and N constitute a **data race** if:

1. they are from different agents;
2. their access ranges overlap;
3. at least one writes;
4. neither M hb N nor N hb M; and
5. they are not both atomic events on the same coherence location.

Atomic events on the same coherence location are serialized by `mo(X)` even
when their order is `relaxed`. They may fail to synchronize, but they do not
data-race with each other.

### Data Race Behavior

A data race in Wyst is never compiler undefined behavior. It is:

- `Target-defined` when every racing access that supplies the observed value is
  access-atomic for its range and memory type; or
- `Indeterminate bits` when any observed racing access can tear, decompose, or
  assemble bytes from independently racing sub-accesses.

The compiler emits the source memory events subject only to the allowed
transformations in §9.4. It does not delete, merge, invent, or reorder events
because a race exists. The selected target then determines which value a racing
access-atomic load observes. For Device memory and MMIO registers, the device
specification also participates in the target-defined result.

Ordinary Wyst programs with a statically possible data race are rejected with
`E0249`. A race can reach hardware only through a false explicit trusted
contract or as the device protocol itself. In that case Wyst keeps the outcome
traceable to the boundary and hardware execution rather than silently turning
it into optimizer poison.

### Mixed Atomic and Plain Access

A plain, volatile, or MMIO-intent access that conflicts with an atomic event on
the same bytes is a data race unless happens-before orders the two events. The
plain side is the offending side; the atomic event keeps its own atomicity and
modification-order meaning.

The intended patterns are:

- use only atomic events for a shared synchronization location;
- use plain data writes before a release and plain data reads after a matching
  acquire;
- use plain flag accesses only with the barrier-mediated synchronization rule
  in §9.3;
- protect mixed plain/atomic maintenance code with interrupt masking, locks, or
  another hb edge.

The canonical spinlock pattern is not a mixed-access race:

<!-- wyst-contract: sketch -->
```wyst
var lock: atomic<u64> = atomic<u64>(0)

// acquire
var (_, ok) = lock.compare_exchange(0, 1, .acquire)

// release
lock.store(0, .release)
```

Both operations are atomic events on the same coherence location. The release
store heads a release sequence; a later acquire `compare_exchange` that reads
the released value synchronizes with it.

### Volatile and MMIO Races

Volatile access is an observability contract for the compiler, not a
data-race exemption. Two CPU agents concurrently accessing the same volatile
location, at least one writing, race unless hb orders them or both accesses are
also atomic events on the same coherence location.

MMIO-intent accesses through `@mmio T` are expected for device-owned registers:
the device is an agent and the register semantics are supplied by the device
and the page-table memory type. Two CPU agents concurrently writing the same
MMIO register still race at the language level unless externally serialized.

---

## 9.6 Atomicity

### Natural Alignment

A load or store of type T at a naturally aligned address (address is a multiple of
`size_of(T)`) is **access-atomic**: it appears to other agents as a single indivisible
operation. No intermediate partially-written value is observable.

| Type                | Size    | Required alignment |
| ------------------- | ------- | ------------------ |
| `u8`, `i8`          | 1 byte  | any                |
| `u16`, `i16`        | 2 bytes | 2-byte aligned     |
| `u32`, `i32`, `f32` | 4 bytes | 4-byte aligned     |
| `u64`, `i64`, `f64` | 8 bytes | 8-byte aligned     |

### Misaligned Access

A load or store at a misaligned address is not access-atomic. The access may be
decomposed by hardware into multiple sub-accesses. Concurrent agents may observe a
partial write. Misaligned accesses to device memory additionally produce alignment faults
on most ARM64 configurations.

### Multi-Word and Pair Accesses

Single-copy atomicity on the ARMv8-A baseline is guaranteed _only_ for single-register
aligned loads and stores up to 8 bytes (`u8`/`u16`/`u32`/`u64`). Any access wider than
that is _not_ access-atomic. Three lowerings trigger this in Wyst programs:

1. **General-purpose pair loads/stores (`ldp`/`stp`).** Explicit inline
   assembly, frame save/restore code, explicit pair-oriented primitives, and
   eligible compiler-synthesized stack/aggregate transfer chunks may use pair
   instructions. `ldp` is observed by other agents as two independent 8-byte
   loads; `stp` as two independent 8-byte stores. A racing agent may observe
   the high half from before the race and the low half from after it.
2. **128-bit vector loads/stores (`ldr q`/`str q`).** Full-vector address-method
   accesses or other 16-byte SIMD lowerings are observed as two
   8-byte halves on ARMv8-A.
3. **Compiler-synthesized aggregate copies.** A struct, fixed-array,
   dynamic-array descriptor, slice/string descriptor, payload enum, or tuple copy
   wider than 8 bytes lowers to a deterministic sequence of chunks. Chunks may
   be scalar chunks or eligible 16-byte pair chunks. The whole sequence is not
   atomic, and racing agents may observe a prefix of old chunks and a suffix of
   new chunks, or the reverse, depending on which agent is reading and which is
   writing.

Compiler-synthesized aggregate copies use this exact chunk rule:

1. Copy legs run from byte offset 0 upward.
2. At each offset, first choose a 16-byte pair chunk when at least 16 bytes
   remain, both endpoints are 8-byte aligned, and the memory endpoint, if any,
   is non-volatile. Stack endpoints use the compiler's exact stack-slot offset;
   memory endpoints use the static alignment of the accessed type.
3. A pair chunk transfers two 8-byte subchunks in low-then-high order. Stack
   endpoints use `ldp` / `stp`; memory endpoints use `ldp` / `stp` when the
   AArch64 pair addressing mode encodes, otherwise two scalar 8-byte memory
   operations in low-then-high order. The pair chunk is not access-atomic.
4. If a pair chunk is not eligible, choose the largest scalar chunk size in
   `8, 4, 2, 1` that fits the remaining byte count and is guaranteed aligned at
   both endpoints. Each scalar chunk is one general-purpose-register load
   followed by one general-purpose-register store for that copy leg.
5. The compiler does not use SIMD vector load/store instructions for
   compiler-synthesized aggregate copies.
6. A memory-to-memory aggregate assignment is two deterministic copy legs: source
   memory is first materialized into a compiler-owned temporary with this rule,
   then the temporary is copied to destination memory with the same rule.

These are _hardware_ properties of the lowering. The compiler pins the chunking
above for reproducibility, and the §9.4 "non-access-atomic load" case applies to
multi-chunk aggregate copies when they race.

#### Worked example: 16-byte struct copy

For a naturally aligned, non-volatile 16-byte `Point`, the compiler may lower
the source-memory leg as one pair chunk:

```text
ldp x9, x10, [src, #0]                 // low and high 8-byte subchunks
stp x9, x10, [tmp, #0]
```

Then it lowers the temporary-to-destination leg with the same chunk rule:

```text
ldp x9, x10, [tmp, #0]
stp x9, x10, [dst, #0]                 // low and high 8-byte subchunks
```

If the memory endpoint is volatile or insufficiently aligned for a pair chunk,
the leg falls back to scalar `ldr` / `str` chunks. If a non-volatile memory
endpoint is aligned but outside the encodable pair-addressing range, the memory
side uses two scalar 8-byte accesses while the stack side may still use the pair
operation for that 16-byte chunk. The observable race model is the same: there
is no 16-byte single-copy atomic aggregate assignment.

A concurrent agent reading `dst` while another agent issues this copy may observe
`(old_x, new_y)` or `(new_x, old_y)` — values that no agent ever stored as a whole
`Point`. Use typed acquire/release atomic methods on a flag, the other typed
atomic methods (§1.3.2), or interrupt masking when wider-than-8-byte aggregates
are shared across agents.

#### Bitfield case

Bitfield types (§1.6.1) use an unsigned `u8`/`u16`/`u32`/`u64` backing
integer, so a bitstruct field read-modify-write itself never spans the
single-copy-atomic width and is not subject to pair-store tearing. The
Bitfield Read-Modify-Write subsection below covers the _separate_ hazard of
two agents writing different fields of the same backing word.

#### FEAT_LSE2 (optional)

ARMv8.4 FEAT_LSE2 widens single-copy atomicity to 16 bytes for naturally aligned
accesses. Wyst programs do not rely on it by default. A future `#target(... features =
(lse2))` opt-in (see [chapter-04-modules.md](chapter-04-modules.md)) may add an
explicit 16-byte access or copy mode on platforms that support it; until that feature
gate is added, the baseline scalar-chunk aggregate-copy rule stands and all
multi-word aggregate copies are non-atomic.

### Bitstruct Field Read-Modify-Write

A bitstruct field write `val.field = x` is a **read-modify-write**: the compiler reads the
backing word, modifies the target field, and writes the backing word back. This sequence
is **not atomic** with respect to concurrent writes to other fields of the same backing
word.

Two agents concurrently writing different fields of the same bitstruct backing word race
on the overlapping bytes. The result observes `Indeterminate bits` and is likely to
corrupt one or both writes.

Programs must not allow concurrent writes to different fields of the same bitstruct backing
word without external serialization. For MMIO registers this means bitstruct field writes must
not be used from interrupt handlers that share a register with the interrupted code, unless
the register is exclusively owned by one context at a time.

For practical safe patterns — including full-register writes, `ldxr`/`stxr` atomic RMW
loops, and interrupt-disable sequences — see the **Concurrency and Atomicity** section
in [chapter-06-types.md §1.6.1](chapter-06-types.md) (Bitfield Types).

---

## 9.7 Interrupt Handler Ordering

### Preemption Establishes One-Agent Control Order

An interrupt handler begins a fresh strand after the exact interrupted-strand
prefix at architectural entry. Nested handlers recursively nest that order.
Ordinary exception return completes the handler strand and resumes the
interrupted strand, placing its suffix after the completed handler. Those are
source/control-order edges for the same execution agent, not a flush of a store
buffer, cross-agent synchronization, or an architectural memory barrier.

A scheduler transfer saves that ordering with the interrupted agent and then
resumes a distinct saved strand for the selected task, or does not return. Task
selection does not relabel the handler continuation, publish unrelated memory,
or create a synchronizes-with/happens-before edge. Provider-owned saved-context,
run-queue, or current-task metadata handed to another owner requires explicit
provider release/acquire publication.

### Sharing Data With an Interrupt Handler (Single Core)

To share mutable data between foreground code and an interrupt handler on the same core:

1. Shared locations must be declared as `@volatile T` when every access must
   remain observable to the handler; volatility is a compiler-ordering
   contract, not cross-agent synchronization.
2. For writes that must complete before the handler reads them, issue `barrier.dsb(.sy)` after the
   write and before the signaling store.
3. For multi-word data that must be read or written consistently, disable interrupts during
   the critical section.

### Sharing Data With an Interrupt Handler (Multi-Core)

When the handler may run on a different core than the producing code, preemption ordering
does not apply. Use the acquire-release model:

<!-- wyst-contract: sketch -->
```wyst
var result_ready: atomic<u64> = atomic<u64>(0)

// Producing core
result_buf.store(computed_value) // write result
result_ready.store(1, .release)  // result_buf ordered before this

// Handler (any core)
const flag: u64 = result_ready.load(.acquire)
if flag == 1 {
    const val: u64 = result_buf.load() // happens-after release; result is visible
}
```

---

## 9.8 Initial Values and `MaybeUninit<T>` (Wyst)

Memory locations not explicitly initialized contain `Indeterminate bits`:

- Memory zeroed by startup code (e.g. the `.bss` initialization loop) contains zero.
- Stack memory reused from a previous frame contains values written by that frame.
- Device registers contain device-specific power-on reset values.
- Memory from an allocator contains values from its previous occupant.

**The Wyst compiler does not zero-initialize ordinary locals.** Every ordinary
`const` or `var` binding requires one complete initializer, so an uninitialized
typed local never enters scope. Omitting the initializer is invalid syntax,
not a deferred-assignment state.

<!-- wyst-contract: sketch -->
```wyst
fn main() {
  var x: u64 // error: ordinary binding requires an initializer
}
```

Programs that deliberately need raw machine storage must say so in the type and
the operation:

<!-- wyst-contract: sketch -->
```wyst
fn main() -> u64 {
  var storage = uninit<u64>()
  const first: u64 = storage.read_uninit()
  storage.write(7)
  const second: u64 = storage.read()
  return first + second
}
```

`MaybeUninit<T>` reserves storage with the same layout, size, alignment, and
calling-convention footprint as `T`, but it does not initialize a `T` value and
does not imply automatic zeroing. `T` must satisfy `copyable_discardable`;
affine and terminal values use dedicated typed resource or provider APIs.
`storage.read_uninit()` is available only when `T` is additionally
compiler-proved bit-total: every object-representation bit pattern must be
valid, and the type must carry no address, view, resource, or terminal
authority. The operation returns an ordinary `T` whose bits come from the raw
storage and leaves the initialization state unchanged; bit-totality is derived
structurally and cannot be asserted by source. The operation is available only
while complete initialization is unproved. A compiler-proved or
assertion-initialized slot rejects it and uses `read()` instead.
Wyst does not specify the initial bit pattern, but repeated `read_uninit()`
operations on the same slot return the same bits while no write or possible
opaque mutation intervenes. A typed write or possible opaque mutation begins a
new raw-storage epoch. The compiler may reuse an observed value within an epoch
but may not substitute independently changing arbitrary values; no epoch has a
runtime counter or tag.
`unchanged(storage)` guarantees the exact object representation across a call
and carries the current epoch through that boundary;
`unchanged(storage) on .Variant` does so only on the named nominal outcome. The
relation implies `preserves(storage)`. The reverse is false because storage may
remain live while its contents change. A possibly mutating opaque call without
the applicable `unchanged` guarantee begins a new epoch. The guarantee covers
every possible writer during the call, including callbacks, agents, interrupts,
DMA, and devices. Inference requires checked private-storage, exclusion, or
provider facts that rule those writers out.
For ordinary nonvolatile storage, this content fact may allow an existing load
value to remain usable across the call. It never eliminates, merges, forwards,
hoists, sinks, or reorders volatile, MMIO, or atomic access events. Their exact
event counts and ordering remain governed by their access semantics even when
the underlying object representation is proved unchanged.
The clause is legal for volatile, MMIO, and atomic projections as a content
fact. It neither synchronizes agents nor creates a happens-before edge.
Compiler inference requires authenticated exclusion or provider facts proving
that no event changes the named representation; an unverified boundary uses the
existing explicit storage trust. Free-running counters, read-to-clear
registers, and concurrently mutable atomics ordinarily do not qualify.
The relation is projection-sensitive. `unchanged(packet.header)` and
`unchanged(buffer[..<16])` carry forward only epochs proved wholly contained in
the named projection; sibling and merely overlapping storage receive no
content-preservation fact.
Dynamic containment must follow from the caller's current proof facts. When it
cannot be proved, the call remains legal but the affected observation begins a
new epoch. No implicit runtime containment check or automatic range splitting
occurs; source-visible control flow may first prove the necessary bounds.
The dynamic projection itself is fixed from values at call entry. Later
mutation of a bound operand does not retarget which bytes retain their epoch,
and the rule retains no runtime projection descriptor.
Bounds must be source-visible immutable values. A mutable supplied bound gains
usable identity only after an explicit `const` snapshot; the compiler never
creates an implicit snapshot. For fixed arrays, `[lower ..]` canonicalizes to
`[lower ..< static_length]`. Dynamically sized storage has no canonical omitted
end and therefore requires an explicit immutable upper bound.
The entry projection must satisfy the ordinary static ordering and in-bounds
proof against the source's usable extent. An invalid or unproved entry range
rejects the call rather than being clamped, treated as empty, or guarded by an
implicit trap. Failure to prove that some other observation is contained does
not reject the call; it only prevents that observation from retaining its
epoch.
Bounds may use explicit by-value call-boundary values but cannot load through an
address or view, access volatile or MMIO state, or invoke code. The caller must
obtain and validate any memory-derived bound explicitly before passing it; a
contract never hides execution to select an epoch.
The closed canonical contract-expression subset may use pure arithmetic over
those values. Its normalized mathematical bound must be proved representable
and the result in bounds, and no arithmetic is emitted solely for the contract.
The subset is affine unsigned arithmetic: addition, subtraction, and
multiplication by compile-time constants. Dynamic multiplication, division,
modulo, shifts, bitwise operations, and conditionals require an explicitly
computed boundary argument instead.
The canonical form collects coefficients and orders terms. Reordered affine
source has one contract identity, and written evaluation order contributes no
runtime or overflow semantics.
Only call-entry input values select the projection. A result tag may condition
whether its epoch survives, but result payloads cannot define or resize that
projection after the call.
The existing epoch continues only on a path refined to the named result
variant. Ignoring the result, selecting another variant, or joining with a path
that lacks the fact starts a conservative new epoch. A join preserves the old
epoch only when every incoming path carries it; no runtime flag is added.
When every variant of the closed result type carries the same fact, canonical
contract normalization makes it unconditional and the epoch survives without
result refinement.
Separate `unchanged` projections do not combine. Even if adjacent or
overlapping, they cannot carry the epoch of an observation spanning their
union; a larger guarantee must name the larger projection directly.
Body-bearing Wyst functions infer exact content preservation from their checked
bodies. An unverified bodyless `unchanged(storage)` guarantee contributes
`external_storage`; a foreign declaration carrying it additionally contributes
`foreign_contract`.
`storage.write(value)` performs one complete typed write and establishes
compiler-proved initialization, after which `storage.read()` is valid.
`storage.assume_init()` is the trusted assertion form when no proof is
available, but only when `T` carries no address, view, affine-resource, or
terminal authority. The assertion can establish representation validity; it
cannot manufacture provenance, extent, lifetime, access, ownership, or
resolution authority from raw bits. Authority-bearing values require a
dedicated trusted constructor or provider contract that establishes those
facts. The operation contributes `initialization_assertion` to the enclosing
callable's structural trust bound, distinct from `external_storage` and
`foreign_contract`. It is available only while complete initialization remains
unproved; a compiler-proved or already assertion-initialized slot rejects it
and uses `read()` instead. After an indeterminate read is observed, the result
is an ordinary typed value. It is never LLVM-style poison or `undef`, and the
compiler must not use the read as a reason to delete or invent unrelated
behavior.

A mutable loan may establish that caller-owned `MaybeUninit<T>` contains one
complete valid value after a call. Body-bearing Wyst functions infer this
transition from their checked bodies only when every applicable path performs
a complete producer write of `T`. Separate writes to every field, element, or
byte do not combine into an initialization proof. Callable types and opaque or
bodyless boundaries spell `initializes(storage)` for an unconditional
transition or `initializes(storage) on .Variant` when only one nominal outcome
establishes it. The fact follows ordinary control flow and does not add an
initialized flag or partial-state analysis to the storage.

A call whose effective contract guarantees `initializes(storage)` for the
forwarded storage counts as a complete producer write in its caller. A
conditional guarantee counts only on a path refined to the named result
variant. The caller can consequently infer and republish the relation without
callee-body inspection or partial-state tracking. Trust required by an
unverified callee propagates into the caller's structural trust bound.

`initializes(storage)` is a postcondition rather than an exact-write effect. A
producer may perform multiple complete direct or delegated writes before the
applicable return. The guarantee is inferred when the final state on every
applicable path remains proved initialized and is lost if a later operation
makes that state unknown. Replacing an initialized value ends its stored lease,
so authority origins at the boundary are precisely the possible origins of the
final values rather than a history of every intermediate write.

The initialization postcondition applies only when control returns to the
caller. An unconditional relation applies to each ordinary return; an
outcome-gated relation applies to a return carrying its named nominal variant.
A trap, divergent path, or other non-returning exit has no caller-visible
poststate and no initialization obligation. Writes before such an exit do not
make `read()` available on any caller path because none resumes.

Storage passed to an initialization-bearing call may already be
compiler-proved initialized. The relation guarantees the final state and may
replace the previous value; it does not preserve that value or its authority
origins. If an outcome-gated relation does not cover the actual returned
variant, the entry initialization fact becomes unproved unless a separate
applicable `unchanged(storage)` guarantee preserves the representation through
the call. `preserves(storage)` alone is insufficient because content mutation
remains permitted.

An opaque or bodyless validator may combine
`unchanged(storage) on .Variant` with
`initializes(storage) on .Variant` for the exact same storage and outcome. The
existing representation then remains byte-for-byte unchanged while that path
authenticates it as one complete authority-free value. The combination
contributes `initialization_assertion` and `external_storage`; a foreign
declaration additionally contributes `foreign_contract`. It neither relaxes
the complete-producer-write rule for checked Wyst bodies nor establishes
address, view, resource, or terminal authority without a dedicated provider
contract.

Wyst defines no generic compiler-generated `validate_init<T>()`. Safe Wyst code
instead observes the raw representation through a bit-total integer or byte
array, checks the relevant source values explicitly, and constructs one
complete ordinary `T`. This validated-reconstruction path exposes its runtime
work and representation policy in source and never changes raw storage into a
typed object in place.

The raw-input carrier is selected before external data enters safe Wyst. There
is no `bytes_of_uninit(slot)` or equivalent byte view, reinterpretation,
conversion, projection, or relensing operation from `MaybeUninit<T>` to another
representation type. Existing T-shaped raw storage remains opaque and requires
the trusted in-place validator or dedicated provider boundary described above.

Wyst exposes no generic `zeroed<T>()` or `MaybeUninit<T>.zero()` operation that
establishes typed initialization and derives no property meaning that all-zero
bits are valid for `T`. Source constructs a complete zero-valued `T` through
ordinary typed syntax, which the compiler may lower to bulk zero fill when
equivalent. Raw zeroing applies only to explicit bit-total byte storage and
does not authenticate another representation type.

`MaybeUninit<T>` is activation-local. `uninit<T>()` may create only a
function-local binding, whose address may be lent but cannot outlive that
activation. Module and per-CPU storage, aggregate fields and elements, by-value
parameters, and results cannot contain it. Persistent raw input uses an
explicitly initialized bit-total byte carrier; persistent late initialization
uses a dedicated typed provider protocol. Wyst therefore needs neither
cross-function initialization typestate nor a runtime initialized flag.

Every address loan from activation-local `MaybeUninit<T>` is bounded by one
synchronous borrowing call. A callback, interrupt, other execution agent, DMA
engine, or device may access the slot only when the callable proves that all
such access is complete and no address is retained at return. A producer handle
cannot carry the address into a later call. Truly asynchronous work uses
persistent bit-total byte storage and an explicit typed completion resource or
provider protocol instead. This rule prevents both cross-agent races and
use-after-return without a runtime loan record.

A source-visible suspension may retain a `MaybeUninit<T>` local when no address
or producer loan is outstanding. The slot remains dormant in the exact
preserved activation, and each resume point retains the static initialization
proof appropriate to its incoming paths. The slot cannot transfer to another
activation and receives no runtime initialized flag. Suspension with a live
loan is rejected. Exogenous interrupt or scheduler preemption follows the same
dormancy rule: the handler or another strand cannot access the saved slot.

Initialization facts join by intersection. Storage is compiler-proved
initialized after a control-flow merge only when every reachable incoming path
proves complete initialization. If any incoming path lacks the fact, complete
initialization is unproved after the merge: `read()` is unavailable, while a
new complete producer write or source-visible refinement of the distinguishing
outcome may re-establish it. This is a static proof state, not a claim that the
bytes were never initialized and not a runtime maybe-initialized flag.

When all incoming paths prove initialization, the joined storage remains
initialized. If they stored authority with different backing sources, the
joined origin set is the union of all possible incoming origins. The stored
lease and each later `read()` conservatively retain that complete set, so every
possible source remains constrained until the corresponding static lease ends.
The storage gains no runtime origin tag or discriminator.

A compiler-authenticated Wyst implementation contributes no trust merely for
establishing initialization. An opaque or bodyless `initializes(storage)` claim
contributes `initialization_assertion`; a foreign declaration carrying that
claim contributes both `foreign_contract` and `initialization_assertion`.
Such a generic opaque claim is sufficient only for authority-free `T`.

A compiler-authenticated Wyst body may initialize copyable address or view
authority by storing an already-valid value and preserving its proved
provenance and lease relations through the storage. An opaque producer cannot
establish those relations merely by writing address-shaped bits and declaring
`initializes(storage)`. It requires a dedicated provider contract that names
the authority's source, extent, lifetime, and access facts. The canonical form
is `initializes(out) from buffer`, or
`initializes(out) from buffer on .Variant` when both initialization and origin
depend on one nominal outcome. The stored authority inherits the named source's
constraints; no lifetime is extended and no metadata is added. Multiple
comma-separated origins follow the returned-view rule: every listed source is
a conservative possible origin and remains constrained.

At an unverified boundary this combined contract contributes
`initialization_assertion` for the complete valid value and `external_storage`
for its asserted provenance, extent, lifetime, and access relation. A foreign
declaration additionally contributes `foreign_contract`. A
compiler-authenticated Wyst body contributes no trust for a proved
initialization and origin relation.

Whole-object initialization is value-complete: every logical field, enum tag,
and active payload must be valid. Padding and inactive payload bytes may remain
indeterminate when an opaque or foreign producer does not write them. Native
Wyst aggregate construction still zeroes those bytes deterministically.
Ordinary typed operations ignore them; explicit raw observation yields
ordinary indeterminate bits and never compiler poison or `undef`.

When initialized raw storage contains copyable address or view authority, the
slot itself retains a static lease on every possible origin. Reclamation,
relocation, or another invalidator of any possible backing source is rejected
while the slot may still be read. That stored lease ends at its path-sensitive
last possible read, on a replacing `write(value)`, or when opaque mutation makes
the initialized value unavailable. Each successful `read()` copy carries its
own ordinary lease, which may outlast a later overwrite of the slot. These facts
add no runtime fields, tags, counters, or calls.

An ordinary aggregate initializer commits one complete value; no partially
initialized ordinary binding becomes source-visible while its fields or
elements are evaluated. Raw-storage methods operate on the whole
`MaybeUninit<T>` object. Byte, field, element, and other projection writes do
not publish typed subvalues or accumulate compiler-only initialization bits.
Projection writes alone leave the storage raw until one authenticated
whole-object transition establishes the complete `T`.

Wyst currently provides no incremental fixed-array builder or partially
initialized array view. Fixed arrays are produced by complete ordinary
initializers or whole-object producer transitions. Wyst rejects repeated control
flow that attempts to convert element-by-element raw writes into a new fixed-array
value. Repeated control flow may mutate an array after a complete initialized
value exists. A future loop-driven array-construction expression is a separate
language decision; it must expose only the completed array and cannot
retroactively add partial state to `MaybeUninit<T>` or hidden initialization
metadata.

`MaybeUninit<T>` is non-copyable and cannot be passed or returned by value,
embedded in an aggregate, converted, relensed, or used by ordinary value
operations. Its `copyable_discardable` element bound excludes `no_copy`,
`must_account`, and `must_resolve` values. Once initialized, `read()` returns a
non-consuming copy and leaves the storage initialized. `write(value)` is valid
in either state and leaves compiler-proved initialized storage; when replacing
an initialized value, the prior copy is simply discarded. It does not
initialize, read, or destroy a hidden `T`, and Wyst has no implicit destructors
or cleanup hooks. Generic raw storage therefore needs no move-aware `take()` or
`replace()` protocol and cannot hide an affine or terminal obligation.

Register-resident and stack-resident storage have identical source semantics.
An explicit local `in x19` placement or allocator placement may change where
the storage lives, but not
whether an ordinary read is legal and not whether a raw read must be spelled
with `.read_uninit()`.

### Borrowed aggregate provenance

Borrow provenance is structural and compiler-verified for every ordinary
fixed-layout carrier, not only bare pointers and slices. Struct fields, tuple
fields, fixed-array elements, enum variants and payload positions, branch
values, and nested combinations retain two paths: the exact projection within
the source storage and the exact projection within the value carrying that
borrow. Construction prefixes the carrying path; projection, tuple
destructuring, `match`, and direct `if value is .Variant(binding)` remove the
corresponding component. A statically different field, fixed index, or variant
is disjoint; a dynamic index or slice remains conservatively overlapping.

The provenance follows ordinary local transfer and `var` parameter/result
transport. It has no runtime identity field, borrow counter, tag, or checked
operation. Callable `from` origins and semantic interfaces preserve the
authorized source parameters; local structural paths preserve the actual
projection. Where a separately compiled callable exposes only a whole
parameter origin, the consumer conservatively constrains that whole parameter
rather than guessing a narrower projection. Phi, `if`, `select`, and `match`
joins retain every possible live origin, and a returned borrow is valid only
when every possible origin is named by the callable's `from` contract.

An exclusive carried projection conflicts with mutation, transfer,
relocation, reset, or reclamation of overlapping source storage until its
proven last use. Proven-disjoint sibling fields remain usable. Casting to a
type that cannot carry a pointer, slice, or borrowed aggregate drops no usable
borrow authority; converting an address to an integer never turns that integer
into storage provenance.

Affine aggregate envelopes may be consumed through a projected `xfer` only
when every unselected sibling has compiler-proven discard ability. This permits
recovery such as `xfer rejected.authority` from a typed failure record while
rejecting a projection that would silently lose another non-discardable
authority. Tuple destructuring likewise requires every ignored component to be
discardable. These are compile-time resource transitions, not destructors or
runtime cleanup. Because `must_resolve` removes discard ability structurally,
the same rule rejects projected transfer with an obligated remainder.

The `core.storage` reservation typestates apply the initialization rule to
caller-backed bytes. An uninitialized reservation becomes initialized only by
an exact zero fill, exact byte copy, a typed store whose `T` satisfies
`copyable_discardable`, or an explicit programmer assertion. Commitment is a
separate transition. A typed store must match both `#size_of(T)` and
`#align_of(T)` and therefore cannot duplicate an affine authority into raw
storage. `must_resolve` never satisfies this bound, so neither typed nor byte
storage operations can hide it in unauthenticated raw bytes. Reset zeroing is sanitation of backing bytes; it does not create live
typed values or invoke cleanup for prior occupants.

---

## 9.9 ARM64 Correspondence

The Wyst memory model is a restriction and formalization of the ARM64 VMSA memory model.
Every guarantee Wyst makes is backed by a specific ARM64 hardware mechanism:

| Wyst operation                      | ARM64 instruction | Hardware guarantee                                                                     |
| ---------------------------------- | ----------------- | -------------------------------------------------------------------------------------- |
| Plain load (via `@T`)              | `ldr`             | No ordering guarantee; may be reordered with other non-acquire/release accesses        |
| Plain store (via `@T`)             | `str`             | No ordering guarantee                                                                  |
| Volatile load (via `@volatile T` or `@mmio T`)  | `ldr`             | Compiler barrier only; cacheability from page-table MAIR                               |
| Volatile store (via `@volatile T` or `@mmio T`) | `str`             | Compiler barrier only; cacheability from page-table MAIR                               |
| Atomic `.load(.acquire)`           | `ldar`            | One-way fence: all subsequent accesses observed after this load                        |
| Atomic `.store(value, .release)`   | `stlr`            | One-way fence: all preceding accesses observed before this store                       |
| `barrier.dsb(.sy)`                 | `dsb sy`          | Stall until all preceding explicit memory accesses are globally observed (full system) |
| `barrier.dsb(.st)`                 | `dsb st`          | Stall until all preceding explicit stores are globally observed                        |
| `barrier.dsb(.ld)`                 | `dsb ld`          | Stall until all preceding explicit loads are globally observed                         |
| `barrier.dsb(.ish)`                | `dsb ish`         | `dsb sy` scoped to inner shareable domain                                              |
| `barrier.dsb(.osh)`                | `dsb osh`         | `dsb sy` scoped to outer shareable domain                                              |
| `barrier.dsb(.nsh)`                | `dsb nsh`         | `dsb sy` scoped to non-shareable domain                                                |
| `barrier.dmb(.sy)`                 | `dmb sy`          | Order preceding accesses before subsequent ones; no pipeline stall                     |
| `barrier.dmb(.ish)`                | `dmb ish`         | `dmb sy` scoped to inner shareable domain                                              |
| `barrier.isb()`                    | `isb`             | Flush pipeline; all preceding instructions retire before subsequent fetch              |
| `barrier.compiler()`               | none              | Full compiler fence only; no hardware memory-ordering guarantee                        |

**`ldar` one-way semantics:** The load value is observed, and all subsequent accesses in
program order are observed after it. Preceding accesses may be observed before or after
the `ldar`. Acquire is a downward fence, not a full barrier.

**`stlr` one-way semantics:** All preceding accesses in program order are observed before
this store. Subsequent accesses may be observed before or after the `stlr`. Release is an
upward fence, not a full barrier.

**`dsb sy` stall semantics:** The pipeline stalls until all preceding explicit memory
accesses to any memory type are globally observed by all agents in the full system
shareability domain. `dsb` is stronger than `dmb`; use `dmb` when the stall is not
required.

**Beyond this model:** The ARM64 VMSA has additional mechanisms
(load-exclusive/store-exclusive pairs for RMW atomicity, cache maintenance
instructions, and TLB invalidation). The Wyst checked-assembly pack does not
activate those source forms; use the corresponding Wyst intrinsic where one
exists, otherwise the compiler rejects the operation. An admitted non-pure
`asm` block is a full two-way compiler memory fence, with architectural effects
and memory ranges derived from parsed rows.

---

## 9.10 Potential Hardware Sensitivities

Certain instruction patterns are legal and well-defined but can behave
differently across microarchitectures. The language assigns no latency, cache,
store-buffer, or throughput result to them, and compiler inspection reports do
not diagnose or price them. A modeled or measured performance surface must
identify its model or observation and state its limits before making such a
claim.

---

### 9.10.1 Store-to-Load Forwarding (STLF)

ARM64 implementations commonly maintain a **store buffer** and may forward a
preceding stored value to a later load. Whether forwarding occurs and its
performance effect depend on the specific core, memory state, address proof,
and dynamic execution. Source shape alone does not prove either outcome.

#### Common Forwarding-Compatible Shape

Exact-width, exact-address accesses are a commonly compatible shape:

- Store and load are the same width and alignment.
- The load address is identical to the store address.
- The store is the most recent write to that address in program order.

#### Potentially Forwarding-Resistant Shapes

The following shapes can prevent or complicate forwarding on some cores:

| Pattern                                     | Example                                           | Structural concern                               |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Width mismatch (narrow store, wider load)   | `p8.store(x)` then `relens<@u32>(p8).load()`      | The load spans bytes outside the narrow store    |
| Width mismatch (wider store, narrower load) | `p64.store(x)` then `relens<@u32>(p64).load()`    | Forwarding rules vary by implementation          |
| Partial overlap                             | Store to `p8`, load from `element_offset(p8, 2)`  | The accesses overlap without identical coverage  |
| Multiple stores                             | Two adjacent `p32` stores followed by `relens<@u64>(p32).load()` | The load spans multiple source stores |

#### Bitstruct RMW and STLF

Bitstruct field writes compile to read-modify-write sequences using bit-field
extract/insert operations such as `ubfx` and
`bfi` (see [chapter-06-types.md §1.6.1](chapter-06-types.md)). A field write followed by a
differently-sized read of the backing integer can trigger STLF failure:

<!-- wyst-contract: sketch -->
```wyst
bitstruct Status: u32 {
    READY: bool at 0
    ERROR: bool at 1
    COUNT: u16 at 2..=15
}

// Potential STLF hazard: field write is a u32 RMW,
// but if the compiler or programmer batches sub-word
// stores, a subsequent full read may stall.
reg.READY = true
reg.ERROR = false
reg.COUNT = 42
const raw: u32 = bitcast<u32>(reg) // all writes are full-width u32 RMW
```

In practice, bitstruct field writes in Wyst are full-width RMW on the backing
type, so they do not cause width-mismatch STLF failures by themselves. The
hazard arises when mixing bitstruct access with raw sub-word stores to the same
address, or when accessing the same memory at different widths through pointer
casts.

#### Compiler Inspection Boundary

The current compiler may display the exact typed accesses and final machine
instructions as structural facts, but it does not label these patterns as a
performance hazard or claim forwarding success, failure, or cost. Such a claim
requires a target-applicable identified model with explicit assumptions or a
measured observation of an identified artifact and workload.

#### Guidance

- **Store and load at the same width.** If a value is stored as `u32`, read it
  back as `u32`.
- **Batch sub-word writes.** Construct a full-width value in a register, then
  store once, rather than writing individual bytes or half-words.
- **Avoid cross-width aliasing.** Do not write through a `@u8` and read back
  through a `@u64` at the same address.

---

## 9.11 Quick Reference: Is This Reordering Permitted?

Given operation A before operation B in source, may the compiler emit B before A?

**No** if any of:

- A or B is a volatile or MMIO-intent access, unless the explicit access itself
  requires only its own lowered event.
- A or B is `barrier.dsb`, `barrier.dmb`, `barrier.isb()`, `barrier.compiler()`, a strict schedule
  boundary, a non-pure `asm` block, or a call with unproven memory effects.
- B is a release event or `seq_cst` event that would be hoisted above A.
- A is an acquire event or `seq_cst` event that would have B moved before it.
- A and B access overlapping ranges, or the compiler lacks one of the closed
  alias proofs from §9.4.
- B depends on the value, address, control result, or effect produced by A.

**Yes** only for the cases allowed by the §9.4 reordering table: plain or
relaxed-atomic events with a closed alias proof, no dependency, and no
intervening event that imposes ordering.

---

## 9.12 Cache Line Awareness

Modern ARM64 processors transfer data between caches and main memory in
fixed-size **cache lines** (typically 64 bytes; 128 bytes on Apple M-series).
When two variables share a cache line and are written by different cores, the
MESI coherence protocol forces the line to bounce between caches — even if the
cores never access the same variable. This is **false sharing**, and it can
degrade throughput by 10–50×.

### `#cache_line_width()` — Compile-Time Query

`#cache_line_width()` is a compile-time query that returns the cache line
width in bytes for the current `#target`. It is resolved at compile time — no
runtime cost, no code emitted.

**Default value:** 64 (matches Cortex-A and Neoverse families).

**Override:** `#target(... cache_line = 128)` sets the value for the
compilation unit. This is required for Apple M-series targets where the
DCache line size is 128 bytes.

**Legal positions:**

| Context                            | Example                                     |
| ---------------------------------- | ------------------------------------------- |
| `#[align(...)]` argument           | `#[align(#cache_line_width())]`             |
| `#static_assert`                   | `#static_assert(#cache_line_width() >= 64)` |
| Array size                         | `buf : [#cache_line_width()]u8`             |
| Constant declaration               | `const CL = #cache_line_width()`            |
| Arithmetic in constant expressions | `stride :: #cache_line_width() * 2`         |

See [chapter-06-types.md §1.15](chapter-06-types.md) for the full compile-time query table.

---
