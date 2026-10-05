---
status: accepted
---

# Keep uninitialized storage out of ordinary bindings

Every ordinary Wyst `const` or `var` binding requires one complete valid value
initializer. Source that needs uninitialized machine storage uses the explicit
affine `MaybeUninit<T>` abstraction; Wyst neither admits deferred ordinary
initialization nor inserts automatic zero-fill.

## Considered options

C-style declarations followed by path-sensitive assignment add a second state
to every ordinary local and make aggregate construction expose partial values.
Implicit zero initialization adds stores and incorrectly suggests that every
all-zero representation is a valid `T`. Explicit raw storage keeps its unusual
operations and proof obligations visible without imposing a runtime service.

## Consequences

`var x: T` without an initializer is invalid syntax rather than a later
use-before-initialization error. Ordinary aggregate construction publishes a
value only after every required component is valid. `MaybeUninit<T>` has the
layout of `T` but is not a `T`, performs no hidden initialization or cleanup,
and must cross into ordinary typed use through a bit-total raw observation, an
authenticated initialization transition, or an explicit initialization
assertion.

`read_uninit()` is available only when `T` is compiler-proved bit-total: every
object-representation bit pattern is valid and the type carries no address,
view, resource, or terminal authority. This restriction permits deliberate raw
bit observation without allowing arbitrary bits to manufacture semantic
authority; the property is structural and source cannot assert it.
The operation is available only while complete initialization is unproved and
leaves that state unchanged. A compiler-proved or assertion-initialized slot
uses `read()` and rejects the redundant raw operation.

The exact bits in unproved storage are unspecified, but they are stable within
one unchanged raw-storage epoch. Repeated `read_uninit()` calls with no
intervening write or possible opaque mutation return the same bit pattern. A
typed write or possible opaque mutation starts a new epoch; this stability is a
semantic fact, not a runtime generation counter.

`unchanged(storage)` preserves the exact object representation and therefore
carries the current raw-storage epoch across a call;
`unchanged(storage) on .Variant` does so only on the named outcome. The relation
is strictly stronger than `preserves(storage)`, which keeps storage live but
allows its contents to change. Without `unchanged`, a possibly mutating opaque
call begins a new epoch. The guarantee covers every possible writer during the
call, including callbacks, agents, interrupts, DMA, and devices; inference
requires checked private-storage, exclusion, or provider facts that rule them
out.

Content preservation is projection-sensitive. A contract such as
`unchanged(packet.header)` or `unchanged(buffer[..<16])` carries forward only
raw-storage epochs proved wholly contained in that projection; it neither
preserves nor freezes sibling or merely overlapping storage.
For dynamic ranges, containment must be established by the caller's current
proof facts. Otherwise the call remains legal but the affected observation
starts a new epoch, without an implicit runtime check or automatic splitting;
source-visible control flow may first establish the needed bounds.
Dynamic contract projections are fixed by their call-entry values. Mutating a
bound operand later in the call cannot retarget the preserved epoch, and the
rule requires no runtime projection descriptor.
The entry range itself must have statically proved ordered, in-bounds limits,
just like an ordinary slice range. An invalid or unproved entry projection
rejects the call; it is not clamped, replaced with an empty range, or guarded by
an implicit trap.
Its bounds come only from explicit call-boundary values. A contract cannot load
through an address or view, access volatile or MMIO state, or call code to
select which raw-storage epoch it promises to preserve.
Pure arithmetic from the canonical contract subset may derive a bound from
those values. Its normalized mathematical value must be proved representable
and the resulting projection in bounds; the contract adds no execution of its
own.
That subset is affine unsigned arithmetic: addition, subtraction, and
multiplication by compile-time constants. Non-affine operations require an
explicitly computed boundary argument.
The canonical form collects coefficients and orders terms. Algebraically
reordered affine source therefore has the same contract identity, while source
evaluation order has no runtime or overflow behavior.
Only entry input values select the epoch-bearing projection. A result variant
may condition whether the guarantee applies, but its payload cannot define or
resize the projection after the call.
The epoch survives only on a path refined to that named variant. Ignoring the
result, selecting another variant, or joining with a path lacking the fact
loses it; a join retains it only when every incoming path does, without a
runtime flag.
The same guarantee on every variant of the closed result type canonicalizes to
one unconditional epoch-preservation fact.
Separate `unchanged` projections carry separate epochs. Their adjacency or
overlap does not preserve an observation spanning their union; the contract
must name that larger projection directly.

Generic `assume_init()` may assert representation validity only for a type that
carries no address, view, affine-resource, or terminal authority. Raw bits do
not establish provenance, extent, lifetime, access, ownership, or resolution
obligations. Authority-bearing values therefore require a dedicated trusted
constructor or provider contract that supplies the relevant facts rather than
a generic initialization assertion. Each generic assertion contributes the
distinct `initialization_assertion` category to its callable's structural trust
bound; it is neither an `external_storage` nor a `foreign_contract` assertion.
The operation is rejected when the slot is already compiler-proved or
assertion-initialized. Proven code uses `read()`, and a repeated assertion may
not create a ceremonial or duplicate trust site.

A mutable loan may initialize caller-owned `MaybeUninit<T>`. Body-bearing Wyst
functions infer the transition only when every successful path performs a
complete producer write of `T`; separately covering every field, element, or
byte is insufficient. Callable types and bodyless boundaries spell
`initializes(storage)` or `initializes(storage) on .Variant`. The fact follows
ordinary control flow and creates no runtime initialized flag or partial-state
analysis. A compiler-authenticated Wyst implementation adds no trust. An
opaque or bodyless claim contributes `initialization_assertion`; a foreign
declaration with the same claim independently contributes both
`foreign_contract` and `initialization_assertion`.

Calling a producer whose effective contract guarantees `initializes(storage)`
for the forwarded storage counts as a complete producer write in the caller.
An outcome-gated guarantee counts only on a path refined to its named variant.
The caller therefore infers and may republish the relation without inspecting
the callee body or introducing partial-state tracking. Trust required by an
unverified callee remains in the caller's structural trust bound.

`initializes(storage)` is a postcondition, not a write-count effect. A producer
may perform any number of complete direct or delegated writes before the
applicable return, provided the final state remains compiler-proved initialized
and no later operation makes it unknown. Each replacement ends the stored
lease for the prior value; authority origins at the boundary come from the
final possible values only.

The postcondition applies only when control returns to the caller: either an
ordinary return or a return refined to the named nominal variant. A trap,
divergence, or another non-returning exit has no caller-visible poststate and
therefore carries no initialization obligation. Partial or complete writes
before such an exit do not create a continuation on which `read()` becomes
available.

A caller may pass storage whose complete initialization is already proved.
`initializes(storage)` still promises only an initialized final state and may
replace the prior value; it does not preserve that value or its authority
origins. If an outcome-gated relation does not cover the returned variant, the
prior initialization fact is no longer usable unless a separate applicable
`unchanged(storage)` guarantee carries it through the call. Mere
`preserves(storage)` is insufficient because it permits content mutation.

An opaque or bodyless validator may pair `unchanged(storage) on .Ok` with
`initializes(storage) on .Ok` for the exact same storage and outcome. On that
path, the existing representation is authenticated as one complete
authority-free `T` without being changed. The pair contributes
`initialization_assertion` for validity and `external_storage` for the asserted
content guarantee; a foreign declaration additionally contributes
`foreign_contract`. It does not relax complete-producer-write inference for a
checked Wyst body and cannot authenticate address, view, resource, or terminal
authority without a dedicated provider contract.

Wyst provides no generic compiler-generated `validate_init<T>()`. Safe Wyst
code observes raw input through a bit-total carrier such as an integer or byte
array, validates the source values explicitly, and constructs a complete `T`
through its ordinary constructors. This validated reconstruction keeps both
the representation policy and runtime work source-visible and does not mutate
the raw slot into a typed object in place.

The raw-input carrier is selected before external bits enter safe Wyst. The
language exposes no `bytes_of_uninit(slot)`, byte view, reinterpretation,
conversion, projection, or relensing operation from `MaybeUninit<T>` to a
different representation type. Existing T-shaped raw storage remains opaque;
validating it in place requires the explicit trusted validator or provider
boundary above.

Wyst also provides no generic `zeroed<T>()` or `MaybeUninit<T>.zero()` path to
typed initialization and derives no zero-validity category. Code that needs a
zero-valued `T` constructs one complete ordinary value through its normal
initializer or constructor; the compiler may lower that construction to bulk
zero fill when equivalent. Raw zero-filled buffers use explicit bit-total byte
storage and do not imply validity for another type.

`MaybeUninit<T>` is activation-local storage. `uninit<T>()` may initialize only
a function-local binding; the slot's address may be lent to callees but cannot
outlive that activation. Module `var`, module `const`, `per_cpu var`, aggregate
fields and elements, by-value parameters, and results cannot contain it. Global
raw input uses an explicitly initialized bit-total byte carrier, while
late-initialized global resources require a dedicated typed provider protocol.
This avoids cross-function or concurrent initialization typestate and adds no
runtime state flag.

Any address loan from local `MaybeUninit<T>` is activation-bounded at the call
boundary. A callback, interrupt, other execution agent, DMA engine, or device
may access the slot only through a synchronous producer that proves all such
access has ended before the borrowing call returns. No returned handle or later
call may retain that address. Truly asynchronous I/O uses persistent bit-total
byte storage plus a typed resource or provider protocol that owns completion;
it never borrows an activation-local raw slot across calls.

A source-visible suspension may retain a local `MaybeUninit<T>` slot as dormant
frame storage when no address or producer loan is outstanding. The exact
preserved activation owns the slot, and each resume point carries its
compiler-known initialization state; suspension adds no runtime flag and cannot
transfer the slot to another activation. Suspension is rejected while any loan
is live. Exogenous interrupt or scheduler preemption may likewise leave the
slot dormant only in the inaccessible saved activation.

Initialization facts join by intersection. A merged control-flow point treats
storage as initialized only when every reachable incoming path proves complete
initialization; otherwise complete initialization is unproved and `read()` is
rejected. Source may retain and refine the distinguishing nominal outcome
before reading, or perform a new complete producer write. This rule adds no
runtime maybe-initialized state or flag and makes no claim that the physical
bits on an unproved path were never initialized.

When every incoming path proves initialization, the joined slot remains
initialized. If those paths store authority derived from different sources,
its origin set is the union of every possible incoming origin. The slot and
every value later read from it conservatively retain those origins, so all of
their backing sources remain constrained until the applicable static leases
end. No runtime origin discriminator is added.

An opaque or bodyless `initializes(storage)` assertion is sufficient only when
the stored `T` is authority-free. A compiler-authenticated Wyst body may
initialize copyable address or view authority by storing an already-valid value
whose provenance relations remain proved. An opaque producer of such a value
instead needs a dedicated provider contract that names its source, extent,
lifetime, and access facts; a generic initialization assertion cannot supply
them.

Initialized address or view authority reuses Wyst's existing provenance word:
`initializes(out) from buffer` ties the complete value written into `out` to
`buffer`, while `initializes(out) from buffer on .Ok` makes both initialization
and origin conditional on the nominal outcome. The relation extends no
lifetime and adds no runtime metadata. The existing comma-separated `from`
list denotes conservative possible origins and constrains every listed source.

An unverified `initializes(out) from buffer` relation contributes both
`initialization_assertion` for complete value formation and `external_storage`
for the asserted provenance, extent, lifetime, and access relation. A foreign
declaration additionally contributes `foreign_contract`. A
compiler-authenticated Wyst body contributes none of these merely for a proved
write and origin relation.

Initialized raw storage containing copyable address or view authority retains a
static lease on every possible backing source even before `read()`. The lease
ends at the stored authority's path-sensitive last possible read, when a write
replaces it, or when the slot loses initialized availability. A `read()` copy
receives its own lease, so replacing the slot does not invalidate a previously
read value. No lease fact has a runtime representation.

Whole-object initialization is value-complete rather than a promise that every
representation byte was written. Every logical field, enum tag, and active
payload must be valid, while padding and inactive payload bytes may remain
indeterminate. Wyst aggregate construction still zeroes those representation
bytes deterministically; opaque C or firmware producers need not. Ordinary
typed operations ignore them, and explicit raw observation treats them as
ordinary indeterminate bits rather than optimizer poison.

Generic `MaybeUninit<T>` tracks initialization only for the complete `T`.
Writes to bytes, fields, elements, or other projections do not publish typed
subvalues and do not accumulate into a hidden initialization bitmap. Projection
writes alone therefore leave the storage raw until one authenticated
whole-object transition establishes the complete `T`.

Wyst currently exposes no incremental fixed-array builder or partially
initialized array view. Fixed arrays are produced by complete ordinary
initializers or whole-object producer transitions. Wyst rejects a loop or other
repeated control flow that attempts to turn element-by-element raw writes into
a new fixed-array value. A loop may freely mutate an array that already has a
complete initialized value. Loop-driven array construction is not part of the
language. `MaybeUninit<T>` has no hidden initialization metadata for array
elements.

`MaybeUninit<T>` requires `T: copyable_discardable`. Consequently `read()` may
return a non-consuming copy and `write(value)` may replace either raw or
initialized contents without losing an affine or terminal obligation. Generic
raw storage has no move-aware `take()` or `replace()` protocol; affine and
terminal values cross boundaries through dedicated typed resource or provider
APIs.
