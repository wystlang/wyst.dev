---
status: accepted
---

# Infer view lifetimes and expose storage preservation

Wyst will prove view lifetimes with path-sensitive leases that end at the
view's last possible use and conservatively depend on every member of its
closed backing authority set. Ordinary Wyst bodies infer returned-view and
storage-preservation relations; callable types and bodyless boundaries carry
them as part of callable identity. A boundary spells unconditional
preservation as `preserves(origin)` and result-dependent preservation as
`preserves(origin) on .Variant`; anything not preserved is potentially
invalidating.

Exact content preservation is a distinct stronger relation. A boundary spells
it as `unchanged(storage)` or `unchanged(storage) on .Variant`; the guarantee
implies `preserves(storage)` but the reverse is false. This keeps live shared
views compatible with sequenced mutation while permitting a specific call to
prove that selected bytes did not change. Content preservation is
projection-sensitive: `unchanged(packet.header)` and
`unchanged(buffer[..<16])` preserve only observations proved wholly contained
in those projections. Dynamic containment must follow from the caller's
current proof facts. If it cannot be proved, the call remains legal but the
overlapping observation loses its content fact and raw-storage epoch; the
language inserts no containment check and performs no automatic range split.
The named projection is fixed by call-entry values. Later changes to an operand
used in a dynamic bound cannot retarget the guarantee, and no runtime projection
descriptor is retained.
Forming the entry projection requires the same static ordering and in-bounds
proof as an ordinary range view. Failure rejects the call rather than clamping,
substituting an empty range, or inserting a trap. This differs from an unproved
containment relation, which leaves the call legal but transports no content
fact to the other observation.
Projection bounds may use explicit call-boundary values, including fields of a
by-value argument. They may not dereference an address or view, perform a
volatile or MMIO read, or call code; the caller must obtain, validate, and pass
such a bound explicitly rather than hiding execution in the contract.
They may use the language's closed canonical subset of pure arithmetic over
those values, so an API may state `buffer[offset..<offset + count]` without a
redundant end parameter. The call must prove the normalized mathematical bound
representable and the final range in bounds; arithmetic is not emitted solely
to service the contract.
The subset is affine unsigned arithmetic: boundary values and literals may use
addition, subtraction, and multiplication by compile-time constants. Dynamic
multiplication, division, modulo, shifts, bitwise operations, and conditionals
are excluded; an API needing them accepts the explicitly computed boundary
value instead.
Normalization collects coefficients and orders terms, so `offset + count` and
`count + offset` have one identity. This is fixed algebraic normalization, not
arbitrary theorem proving. Contract source order has no execution or overflow
behavior because only the normalized mathematical value is validated.
Only call-entry input values may define the projection. A named result variant
may gate whether that fixed guarantee holds, but a result payload cannot define,
resize, or retarget its bounds. An API needing a result-dependent usable region
returns an explicit nominal outcome or view rather than adding a dependent
postcondition to callable identity.
An outcome-gated guarantee becomes available only after control flow refines
the result to the named variant. Ignoring the result, taking another variant,
or joining it with a path lacking the fact loses the prior content epoch; a join
retains the fact only when every incoming path carries it. No runtime validity
flag records that state.
When the same projection and guarantee appear on every variant of the closed
nominal result type, canonicalization collapses them to one unconditional
guarantee. No execution path lacks the fact, so retaining conditional clauses
would create an artificially weaker and more complex callable identity.
Separate content-preserved projections remain independent. Adjacent or
overlapping `unchanged` clauses do not synthesize a union that preserves a
larger observation; a callable that promises the larger fact must publish the
larger projection explicitly.

The guarantee covers every possible writer, not only stores emitted directly
by the callee. Private storage or authenticated exclusion may prove it;
callbacks, agents, interrupts, DMA, or device mutation prevent publication
unless checked provider facts rule those writers out.
Content equality permits load reuse only for ordinary nonvolatile storage.
`unchanged` never erases, merges, hoists, sinks, or substitutes a required
volatile, MMIO, or atomic event, nor does it weaken that event's ordering.
The contract remains legal for volatile, MMIO, and atomic projections as a
content fact, but grants no synchronization or happens-before edge. A checked
body may publish it only when authenticated exclusion or provider facts rule
out every change to the named representation. An unverified declaration uses
the existing explicit storage trust; free-running counters, read-to-clear
registers, and concurrently mutable atomics ordinarily cannot satisfy it.

## Considered options

Lexical scopes or named lifetime parameters would expose proof plumbing in
ordinary source and retain authorities longer than necessary. Manual release
would make safety depend on programmer bookkeeping. Runtime borrow counters,
allocation registries, or hidden generations conflict with ADR 0003. Treating
every mutable call as unconditionally invalidating is safe but rejects useful
nominal operations that report whether backing storage was preserved or
relocated.

## Consequences

A view may be returned, stored, or captured only in a destination bounded by
every possible backing authority. Control-flow joins retain every possible
origin until nominal refinement, and conditional storage-transition outcomes
preserve a lease only in their declared variants. Preservation is exact and
projection-sensitive, so a contained view may survive without preserving
disjoint storage. Ordinary self-backed movable values are rejected unless the
referenced storage has an independent address-stability guarantee. Neither a
lease, a callable contract, nor a storage-transition outcome adds pointer
metadata, lifetime extension, hidden cleanup, or a runtime service. Unverified
bodyless or foreign lifetime, storage-preservation, content-preservation, and
disjointness claims are explicit `external_storage` trust; a foreign boundary
also carries `foreign_contract`. Compiler-inferred and authenticated Wyst
contracts are not trusted assertions.

Callable compatibility may forget preservation or disjointness guarantees but
may never strengthen them. The destination callable type determines which
facts an indirect caller may use; weakening changes no machine ABI and creates
no runtime adapter. A control-flow join of callable values retains the meet of
their guarantees: only facts shared by every possible target survive.
Storage- and content-preservation guarantees form unordered semantic sets in
callable identity. Reordering their source clauses cannot create a distinct
type or change compatibility. An exact duplicate clause is a redundant source
error rather than repeated emphasis; compiler-produced and imported summaries
use the canonical set representation.
Projection identity uses a fixed language-defined canonical form. Built-in
projection sugar may normalize to that form, but callable compatibility and
duplicate detection never depend on proving arbitrary bound expressions
equivalent; separate compilation must reach the same identity without an
optimizer or theorem prover.

Invalidation makes a dependent view entirely unavailable on that path, as with
a transferred value. Residual register or stack bits need not be erased, but
source cannot copy, compare, discard, or extract an address from them; code
that needs numeric address bits must capture them before invalidation.

Invalidation follows the carrying projection through structs, arrays, tuples,
and enum payloads. Independent projections remain usable, but an operation on
the whole carrier is rejected while any required projection is unavailable;
the compiler creates no runtime validity bitmap.

A mutable carrier may repair an unavailable non-owning view projection by
assigning a fresh valid lease without observing the stale value. Whole-carrier
usability returns after every required projection is valid. Owned and terminally
obligated authorities remain subject to their explicit accounting transitions
and cannot disappear through this repair rule.
