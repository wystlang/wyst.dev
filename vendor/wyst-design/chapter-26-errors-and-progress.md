# Chapter 26 — Errors, outcomes, progress, and recovery

This chapter is normative except for the final section, “Rationale and
reconsideration”. It defines the selected model for absence, materialized
outcomes, live operation protocols, recovery policy, progress, cancellation,
terminal cleanup, fatal termination, and C adapters.

## 26.1 Four closed categories

Wyst keeps four categories distinct. There is no implicit conversion among
them.

1. `core.collections.Option<T>` stores presence (`Some(T)`) or explanation-free
   absence (`None`).
2. `core.collections.Result<T, E>` stores a nominal outcome (`Ok(T)` or
   `Error(E)`) for inspection, transport, combination, or later retry.
3. An `operation` is a nominal, non-first-class synchronous callable protocol.
   Its `failure` transition means that this invocation could not satisfy its
   declared success contract. Expected states advertised by an API—including
   EOF, readiness, cache miss, short count, parser alternative, and process or
   device completion status—remain success data.
4. `#fatal_trap(reason: u16) -> never effects(trap)` enters the authenticated
   target trap path. Architectural faults, violated invariants, explicit fatal
   policy, and trusted-contract failures use traps. Operation handlers never
   catch or convert a trap.

Compile-time diagnostics are not values. Target-defined behavior and trusted
boundary violations retain the taxonomy in Chapter 1. There is no ambient
last-error or last-status value, universal pointer-sized failure type,
exception unwinding, implicit optional lifting, dynamic handler search, hidden
retry, hidden allocation, or automatic conversion between these categories.

## 26.2 Materialized sum types

An enum variant payload may be any compiler-proven `fixed_layout_movable`
value. Eligible values include ordinary fixed-layout structs, arrays, slices
and other fixed descriptors, nested enums, and concrete generic
instantiations. `never`, `void`, raw `MaybeUninit<T>` storage, atomic storage,
symbolically sized values, and values requiring recursive inline storage are
ineligible. Recursive values require explicit indirection.

For a concrete enum `E`, let `D` be the declared unsigned discriminator type.
For every effective payload field, compute its ordinary target layout. The
payload storage alignment is the maximum payload alignment (or one with no
payload); the payload storage size is the maximum payload size rounded up to
that alignment. The payload offset is `align_up(sizeof(D), payload_align)` and
the enum alignment is `max(alignof(D), payload_align)`. The total size is
`align_up(payload_offset + payload_size, enum_align)`. These values and every
variant's exact field types are semantic facts, not reconstructed from a
representative word type.

Construction writes the discriminator, zeroes every inactive payload byte,
then writes the active payload. Padding and inactive bytes are therefore
deterministic and raw observation never exposes stale prior-variant data.
Only fields of the active variant may be projected. A move transfers the
complete enum value and invalidates the source under the ordinary move rules.
No payload is implicitly boxed, referenced, allocated, reference-counted, or
copied. Equality exists only when the enum's exact active payload alternatives
independently satisfy the equality capability; fixed layout and movability do
not imply equality. Initialization, destruction, and raw observation use the
same active-variant rule.

Generic enum payload parameters declare the closed
`fixed_layout_movable` bound. Concrete substitution removes an enum variant or
operation member only when its canonical payload is exactly `never`; the
compiler does not use a general inhabitance proof. Semantic interfaces, final
images, debug data, and ABI facts retain concrete size and alignment. Native
and AAPCS64 use their ordinary aggregate classification, including indirect
argument or result storage for large values.

## 26.3 Canonical stored outcomes

The authenticated `core.collections` source declares:

<!-- wyst-contract: fmt -->
```wyst
pub enum Option<T: fixed_layout_movable>: u8 {
  None
  Some(T)
}

pub enum Result<T: fixed_layout_movable, E: fixed_layout_movable>: u8 {
  Ok(T)
  Error(E)
}
```

The first-order helper families are `option_is_some`, `option_is_none`,
`option_value_or`, `option_value_or_else`, `result_is_ok`,
`result_is_error`, `result_value_or`, and `result_value_or_else`. `*_value_or`
is eager; `*_value_or_else` is lazy. Callback parameters carry an explicit
closed callable effect bound. These declarations are ordinary authenticated
generic declarations and receive no recognition by a local spelling.

Expression-valued exhaustive `match` is the extraction and transformation
mechanism. Its scrutinee evaluates exactly once. Every reachable arm has a
tail value of one exact common type; `never` is compatible with that type.
The ownership state at each join must be exact. All effective variants are
covered or a final explicit `else` is present. A partial-match opt-out is
illegal in an expression match. Handler-head and enum patterns remain shallow
and irrefutable; deeper inspection uses another exhaustive match.

`expect_or_trap<T, E>(value, reason: u16) -> T effects(trap)` returns `Ok`'s
payload or calls `#fatal_trap(reason)`. The reason is evaluated exactly once
and is explicit in typed IR. The ARM64 boundary preserves it in `x0` before a
reserved canonical `BRK #0xf001`. The instruction does not create optimizer
undefined behavior. `#[deny_effects(trap)]` rejects the helper or intrinsic.
There is no force-unwrap punctuation or `trust` alias. Postfix `?` never
applies to `Result`.

## 26.4 Operation declarations and invocation

An operation declaration has this canonical order:

<!-- wyst-contract: sketch -->
```wyst
operation read(dst: noescape @u8, capacity: u64, policy: fn(ReadProblem) -> ReadChoice effects(none)) {
  success(ReadCompletion)
  progress(ReadProgress) effects(none)
  failure(ReadFailure)
  cancelled(CancelledRead)
} effects(handler_invoke) {
  // synchronous producer body
}
```

`success` is required. `progress`, `failure`, and `cancelled` are optional and
may occur only in that order. The members are a closed transition set, not a
second semantic effect system. An operation is a distinct compile-time kind:
it cannot be stored, returned, addressed, or converted to an ordinary function
pointer. Calling it begins execution immediately and creates no operation
object, coroutine frame, task, retained continuation, executor, exception
object, dynamic handler search, or mandatory runtime. An ordinary function
and a success-only operation remain different even when their Native ABI
shapes coincide.

`report value`, `return value`, `fail value`, and `cancel value` produce the
lexically enclosing member. A call is consumed by one fully braced `with` set:

<!-- wyst-contract: sketch -->
```wyst
return read(dst, capacity, decide) with {
  progress(update) { observe(update) }
  failure(problem) { translate(problem) }
  cancelled(cause) { cancelled_value(cause) }
}
```

An omitted success arm is inserted as the identity arm before result typing
and ownership checking. Every effective non-success member is handled exactly
once. Terminal arms have one exact result type, with `never` compatible.
`forward progress`, `forward failure`, and `forward cancelled` require exact
canonical payload type, lifetime, mutability, and ownership compatibility
with the lexical operation. There is no `forward all`, whole-call forwarding,
implicit forwarding, or failure translation. Handlers use shallow,
irrefutable heads. No `return`, outer `break`, or outer `continue` crosses the
handler boundary.

## 26.5 Exact operation failure forwarding

Postfix `?` accepts only a direct operation call whose effective set is exactly
`success` plus `failure`, inside an operation with an exactly matching failure
payload, lifetime, mutability, and ownership mode. It yields the success
payload and is identical to a `with` containing `forward failure` and implicit
success. The callee and arguments evaluate once, left to right. It introduces
no new effect beyond the call.

`?` rejects stored `Result`, progress, cancellation, any required lexical
recovery policy, a mismatched outer failure, progress/resume-only context,
non-direct calls, and public-signature inference. Adding a member to the
callee makes an existing site ill-typed. Child cleanup completes before the
outer failure is committed.

## 26.6 Progress, effects, and liveness

Progress is synchronous, serial, same-strand, unbuffered, notification-only,
and subject to backpressure. `report` does not return until the handler
returns. It supplies no fairness, wait-freedom, lock-freedom, scheduling,
independent forward-progress, or latency guarantee. A returning progress
handler produces `void` and resumes the producer exactly once. Terminal
handlers resume it zero times. Progress has no reply value.

Progress handlers are `noescape`, transitively resume-only, and zero-capture.
They may use their fresh report payload and module-visible declarations, or
operate on caller-owned storage explicitly carried by that payload. Implicit
capture or mutation of an outer local is rejected. The callback cannot be
retained and cannot fail, cancel, return from the producer, target an outer
loop, or call through a typed path that can perform such an escape. A borrowed
progress payload has a fresh report-scoped lifetime ending when the handler
returns and cannot escape.

`handler_invoke` is a target-neutral member of the single closed effect
catalog and `effects(all)`. Every progress member declares one concrete closed
handler-effect ceiling; omission is illegal. The ceiling is part of protocol
identity. A lexical progress arm is independently inferred and must be a
subset of the ceiling. `report` charges `handler_invoke` plus the entire
declared ceiling even if lowering later removes dispatch. The actual arm
effects remain attributed to the function containing `with`; a separately
compiled producer is checked against the conservative ceiling.

If the ceiling contains `execution_suspension`, `report` creates the existing
typed strand-suspension boundary and all context-stability checks apply. No
boundary is invented when authenticated evidence excludes suspension. Denying
`handler_invoke` rejects reporting; denying an arm effect rejects that arm.

## 26.7 Selected recovery interaction

Wyst selects an explicitly passed typed recovery-decision capability. It is an
ordinary `noescape` function-pointer parameter with a visible closed effect
bound, for example `fn(AllocationProblem) -> AllocationChoice effects(none)`.
The producer calls it synchronously, presents one nominal problem, receives
exactly one producer-defined nominal choice, and then explicitly retries,
substitutes, continues, fails, or cancels as its source declares. Unknown
effect bounds are conservative. Exact ordinary callable typing governs
forwarding; there is no separate recovery-forward syntax.

The capability and every caller context are non-retainable. It creates no
continuation and requires no allocation or dynamic handler search. It is not
progress and is never encoded as a reply-bearing `report`. Allocation recovery
uses `AllocationProblem -> AllocationChoice`; parser recovery uses
`ParseProblem -> ParseChoice`; device reconfiguration uses
`DeviceProblem -> DeviceChoice`. These comparisons exercise retry, substitute,
skip/continue, reconfigure, failure, and cancellation without introducing a
second handler mechanism. The Native ABI uses the ordinary noescape callable
parameter ABI. C uses an explicit callback plus `void *context`; the adapter
must invoke it synchronously and never retain either value.

## 26.8 Commitment, cancellation, partial completion, and cleanup

A cancellation request or deadline expiry is ordinary explicit input, not a
terminal outcome. The producer decides when to observe it. Terminal commitment
is the invocation's single linearization point: the first success, failure, or
cancellation label committed by the producer wins. A later request, deadline,
event, or cleanup cannot replace it. `cancelled` acknowledges acceptance of a
cause. An API promising acknowledgement of a specific request includes its
nominal identity or generation in the cancellation payload. Deadline expiry is
a request source unless the API explicitly classifies timeout as success data
or nominal failure. No request, deadline, or handler asynchronously unwinds a
producer.

Terminal lowering performs this order:

1. evaluate the selected payload once;
2. move it into caller-owned outcome storage;
3. construct the exact terminal discriminator (the commitment point);
4. disarm destruction of the moved source;
5. execute registered `defer { ... }` blocks in deterministic innermost-first,
   reverse-registration order; and
6. enter the selected terminal handler.

`defer` registers its block in the current lexical scope. Normal scope exit,
`break`, `continue`, ordinary return, and every operation terminal execute the
applicable registrations. A cleanup may contain cleanup-local loops and traps,
but cannot `report`, `return`, `fail`, `cancel`, `goto`, or target an outer
loop. A trap during cleanup remains a trap; it does not relabel the committed
outcome. There is no implicit destructor runtime. Explicit cleanup and the
ordinary move state are the current deterministic destruction mechanism.

A terminal payload may own completed output or borrow caller-owned storage
that outlives cleanup. It may not borrow producer-local storage released by
cleanup. For reads, writes, parsing, transfer, or provider work that completes
a prefix before failure, caller-owned output remains caller-owned and the
failure payload contains the exact committed extent and nominal cause.
Producer-owned partial output instead moves into the failure or cancellation
payload. Progress never establishes ownership or durable completion. Retry is
explicit caller policy and begins from the committed extent without repeating
already committed work.

## 26.9 ABI and C adapter profiles

Native operation lowering adds a hidden `noescape` progress callback parameter
only when `progress` is effective and returns one exact outcome enum. The
callback type is `fn(P) -> void effects(ceiling)`. Invocation is synchronous.
The returned enum follows ordinary Native aggregate classification; large
outcomes use caller result storage. AAPCS64 operation adapters are ordinary
explicit wrappers and never redefine the native operation type.

Two C profiles are closed and explicit:

* **status/out** applies only to success-or-failure operations whose complete
  failure information has a declared C-compatible status mapping and no rich
  payload or partial extent. It returns the mapped status and accepts
  caller-provided success storage. If an extent must exist on both paths it is
  a separate, always-initialized output with a stated type.
* **tagged/out** returns a terminal tag and accepts correctly aligned
  caller-owned storage for rich success, failure, and cancellation payloads.
  Only the storage selected by the returned tag becomes initialized, except a
  separately declared always-initialized common extent.

Every generated declaration states which outputs initialize on each tag,
ownership, lifetime, aliasing, alignment, cleanup, and partial-extent duties.
Progress and recovery cross C only as explicit noescape callback-and-context
pairs with authenticated effect bounds and synchronous lifetimes. A C process
or device status is not automatically failure; the adapter applies the API's
declared nominal mapping. There is no ambient status register or hidden TLS.

The canonical short-read tagged profile always initializes `extent`, leaves
the first `extent` bytes of caller-owned output valid, initializes exactly one
of success/failure payload storage, and preserves the nominal failure cause.
Bad alignment, overlapping selected payload storage, uninitialized required
common output, escaping callback/context, or an incomplete status mapping is a
compile-time adapter error.

## 26.10 Semantic records and validation

The canonical materialized-sum record is
`wyst.materializedSum.v1 { nominalIdentity, tagType, size, alignment,
payloadOffset, payloadSize, payloadAlignment, variants[] }`; each variant is
`{ nominalIdentity, tag, fields[] }` and each field retains exact type,
offset, size, alignment, ownership, and movability.

The canonical operation record is
`wyst.operationProtocol.v1 { nominalIdentity, parameters[], transitions,
effects, progressHandlerCeiling, recoveryParameters[], nativeAbi,
cAdapters[], provenance }`. `transitions` contains canonical ordered optional
records for success, progress, failure, and cancelled with exact payload type,
lifetime, mutability, ownership, and concrete layout. `nativeAbi` records the
hidden callback signature, exact outcome layout, argument/result
classification, and noescape facts. `cAdapters` records profile, status/tag
mapping, callback/context, output initialization matrix, alignment, aliasing,
cleanup, and common-output obligations. `provenance` names the semantic
producer phase and authenticated authority identities.

The current in-memory semantic-interface consumer validates these records
against checked type/effect/layout facts before IR construction. Typed IR and
the final image preserve nominal outcome types, operation signatures,
transition tags, effect ceilings, suspension provenance, and adapter facts.
DWARF emits exact enum layouts and operation outcome/callback types. Explain
reports render the same fields. A mismatch, missing member, reordered tag,
weakened effect, incompatible layout, or unauthenticated adapter mapping is an
error; consumers never reconstruct the record from names.

Future public interfaces, relocatable objects, and archives must transport the
two records byte-for-byte under an authenticated schema identity and include
them in compatibility and content digests. Chapter 16 and the dedicated
interface, object, archive, and linker work own wire containers, emission,
standalone consumption, archive construction, and linking. Those unavailable
emitters are not claimed here and may not weaken or redefine this payload.

## 26.11 Rationale and reconsideration (nonnormative)

Result-only APIs make storage pleasant but cannot model synchronous progress,
backpressure, or exact live failure forwarding without callback conventions.
Exceptions and unwinding hide control transfer and cleanup costs, complicate
freestanding targets, and erase the exact failure surface. Dynamic conditions
and restarts and general algebraic effects or abilities provide expressive
recovery but require handler search or continuation machinery that Wyst does
not otherwise need. New evidence showing a bounded, statically representable
continuation model with better whole-program costs could justify reopening
that decision.

Explicit recovery capabilities were selected over lexical request/reply after
applying both to allocation, parsing, and device reconfiguration. Capabilities
reuse ordinary callable effects, ABI, ownership, noescape analysis, C callback
mapping, and separate-compilation summaries. Lexical request/reply makes policy
visually local but adds a second closed member set, forwarding rules, grammar,
and continuation-like resumption validation. Evidence that capability plumbing
dominates real APIs or prevents safe borrowing could justify reconsideration;
no alternate spelling is reserved meanwhile.

Reply-bearing progress conflates observation with policy and weakens
backpressure reasoning. Ambient status loses provenance and is unsafe under
nested calls. Automatic unwrapping and force punctuation hide failure policy.
Hidden allocation makes freestanding cost and failure recursive. One-word-only
sum payloads force boxing or impoverished errors. These alternatives would be
reconsidered only with measured program evidence that outweighs explicit
control, exact ownership, and deterministic layout—not for syntax familiarity
alone.
