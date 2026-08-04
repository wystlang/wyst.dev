# Chapter 26 — Errors, outcomes, progress, and recovery

This chapter is required except for the final section, “Rationale and
reconsideration”. It defines the selected model for absence, materialized
outcomes, live interactive functions, recovery policy, progress, cancellation,
terminal cleanup, fatal termination, and C adapters.

Generated hardening checks use the same terminal fatal-trap convention as
other compiler-owned fatal failures: `x0` carries the reason and
`BRK #0xf001` terminates the path. The closed hardening catalog assigns
`0x8001` to `index_bounds` and `0x8002` to `address_alignment`. These paths
provide no recovery, allocation, locking, unwinding, or invented continuation.

## 26.1 Four closed categories

Wyst keeps four categories distinct. There is no implicit conversion among
them.

1. `core.collections.Option<T>` stores presence (`Some(T)`) or explanation-free
   absence (`None`).
2. `core.collections.Result<T, E>` stores a nominal outcome (`Ok(T)` or
   `Error(E)`) for inspection, transport, combination, or later retry.
3. A `fn` with `offers` is a nominal, non-first-class synchronous interactive
   callable. Its `failure` offer means that this invocation could not satisfy
   its declared return contract. Expected states advertised by an API—including
   EOF, readiness, cache miss, short count, parser alternative, and process or
   device completion status—remain ordinary return data.
4. `trap.fatal(reason: u16) -> never effects(trap)`, imported from the sealed
   `core.trap` namespace, enters the authenticated target trap path.
   Architectural faults, violated invariants, explicit fatal policy, and
   trusted-contract failures use traps. Interactive handlers never catch or
   convert a trap.

Compile-time diagnostics are not values. Target-defined behavior and trusted
boundary violations retain the taxonomy in Chapter 1. There is no ambient
last-error or last-status value, universal pointer-sized failure type,
exception unwinding, implicit optional lifting, dynamic handler search, hidden
retry, hidden allocation, or automatic conversion between these categories.
Environmental failures, capacity limits, invalid caller storage, and resource
exhaustion are typed recoverable outcomes by default. An API or its caller may
instead select `trap.fatal` as explicit policy, but a lexical handler never
catches, translates, resumes, or relabels that trap. Wyst promises no restart
after a trap unless an independently supplied isolation boundary has both
contained the producer and recovered the surrounding environment.

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
interactive offer only when its canonical payload is exactly `never`; the
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
The ownership state at each join must be exact. Every effective variant must
be named explicitly. `else`, `_`, and other catch-all spellings are illegal in
an ordinary closed-enum expression match; forward-compatible residue is an
explicit declared payload variant. A partial-match opt-out is illegal in an expression match. Handler-head and enum patterns remain shallow
and irrefutable; deeper inspection uses another exhaustive match.

`expect_or_trap<T, E>(value, reason: u16) -> T effects(trap)` returns `Ok`'s
payload or calls `trap.fatal(reason)`. The reason is evaluated exactly once
and is explicit in typed IR. The ARM64 boundary preserves it in `x0` before a
reserved canonical `BRK #0xf001`. The instruction does not create optimizer
undefined behavior. `#[deny_effects(trap)]` rejects the helper or semantic
operation.
There is no force-unwrap punctuation or `trust` alias. Postfix `?` never
applies to `Result`.

### 26.3.1 Required observation

`-> must_observe T` marks an ordinary non-`void`, non-`never` callable result
whose caller must not silently abandon the produced value. The marker is a
source and semantic-interface caller policy, not an ABI field and not a
property of `T`: it applies equally to `Result`, cancellation-bearing enums,
and any other ordinary value type. It is accepted on body-bearing Wyst and
`extern "C"` functions and on bodyless callable declarations. Callable
conversion may strengthen an unmarked result to `must_observe`; it may not
erase the marker. Callable joins retain the marker.

A required result is observed by binding or assignment, returning it, passing
it as an argument, placing it in an aggregate, consuming it with exhaustive
`match`, or, when the result's resource abilities permit abandonment, using
`discard(expression)`. Tuple destructuring observes it only
when at least one named binding receives a component; an all-`_` destructure
is rejected. `discard` is a statement-only compiler-owned contextual form. It
accepts any ordinary value without `must_resolve` authority, evaluates its
operand exactly once, preserves all effects and traps, and emits no runtime
discard operation. It rejects `void`, `never`, and every structurally
non-abandonable value. This result-observation rule is deliberately not affine or path-sensitive: ordinary
binding of a required result satisfies the call-site obligation, and later
use of that binding follows ordinary value rules. Wyst does not make every
`Result` affine and does not introduce implicit propagation.

An operation may nevertheless make its success or failure payload affine by
placing a `must_account` authority in that payload. `core.storage` uses this
shape for every operation that consumes a reservation, allocation,
publication, arena, fixed buffer, or provider-backed package: failure returns a
nominal reason together with the still-owned authority, and the whole
`Result` remains `must_observe`. Recovery does not require an additional
authenticated checked operation. Consuming projection is a general language
rule: `xfer rejected.authority` consumes the envelope when every remaining
field is discardable; otherwise the projection is rejected because it would
lose another affine value.

Storage failures are selected before mutation and preserve the caller's
observable arena state. Their precedence is identity, generation, sequence,
storage-use compatibility, lifecycle/publication/nesting, request shape,
arithmetic, capacity, then commit-state validation where those classes apply.
Stable attachment products are not repeatedly reparsed. Corrupt private arena
metadata is a typed failure rather than a trap or unchecked write, but the
ledger is transient validation state and is not a checksum or hostile
persistence format. Capacity exhaustion, invalid alignment/extent, stale use,
permanent-reset rejection, and provider acquisition failure remain distinct
nominal outcomes.

### 26.3.2 Callable preconditions and postconditions

A body-bearing Wyst function may place repeatable clauses after its result and
before `offers` and `effects`, in source order:

<!-- wyst-contract: fmt -->
```wyst
fn bounded(value: u64) -> must_observe u64
requires(value != 0, reason = 1)
ensures(result >= value, reason = 2) effects(trap) {
  return value
}
```

`requires` expressions see parameters. `ensures` expressions additionally see
the compiler-owned `result` binding; a function with an `ensures` clause may
not declare a parameter with that name. Preconditions also apply to
body-bearing `extern "C"` functions. Contracts are rejected on naked functions,
labels, bodyless functions, and opaque foreign implementations; an opaque
boundary uses a body-bearing Wyst wrapper when enforcement is required.
`ensures` requires an ordinary scalar, aggregate, or tuple result and is
invalid for `void` or `never`. Generic and mandatory-inline functions carry
the same clauses through instantiation and expansion.

The contract expression language is closed and side-effect-free. It contains
boolean and integer literals, constants, parameters, `result`, by-value
aggregate fields, boolean/integer operators and comparisons, value
conversions, `select`, `is`, and exhaustive value `match`. It excludes calls,
handlers, loads, address operations, atomics, volatile or MMIO access,
floating-point operations, checked assembly, suspension, allocation,
mutation, and loops. Each `reason` has exact type `u16`. It is evaluated lazily,
exactly once, and only when its condition is false.

The callee is the enforcement authority. Preconditions run at entry before
body effects. Each non-interactive ordinary return evaluates its result once,
executes applicable `defer` blocks, checks postconditions against that value,
and only then commits the return. An interactive returned path instead
evaluates its payload, checks postconditions, and then follows the terminal
commitment and cleanup order in §26.8. A false condition calls the same
qualified fatal-trap operation as `trap.fatal`; there is no unwinding or
handler interception. An unproved check therefore contributes the `trap`
effect and is rejected by `effects(none)` or
`#[deny_effects(trap)]`. A universally true clause is elided. A provably false
direct precondition or reachable return postcondition is diagnosed. Caller
proof does not narrow a separately compiled callee check; mandatory inlining
places the authoritative check in the expanded body.

Contracts are not structural callable-type components. A general indirect
call assumes no predicate facts. A direct or statically singleton normal
return authenticates its postconditions as expression-scoped semantic facts;
they are invalidated by ordinary reassignment and never become undefined-
behavior assumptions. Semantic interfaces retain the typed ordered clauses,
their result policy, and exact reason type independently of lowered branch or
trap mnemonics.

## 26.4 Interactive function declarations and invocation

An ordinary function becomes interactive only when it has an `offers` clause.
The function return type is the ordinary-return identity path. Direct members
of `offers` are synchronous notifications; non-resuming offers occur in the
explicit `terminal` group. The canonical order is:

<!-- wyst-contract: sketch -->
```wyst
fn read(
  dst: noescape @u8,
  capacity: u64,
  policy: fn(ReadProblem) -> ReadChoice effects(none),
) -> BytesRead offers handler(none) {
  progress(ReadProgress)
  terminal {
    failure(ReadFailure)
    cancelled(CancelledRead)
  }
} effects(none) {
  // synchronous producer body
}
```

The `handler(...)` clause is optional. When present, it is one deliberate
uniform API ceiling for every lexical arm and uses the same closed effect names
as a callable `effects(...)` clause. `handler(none)` is a pure-handler ceiling;
`handler(all)` is explicit top. Omission means that handler effects are inferred
without a public handler restriction. It does not duplicate the function's own
`effects(...)` contract.

`progress`, `failure`, and `cancelled` are optional and occur only in the shown
notification/terminal classification and canonical order. Together with the
ordinary return they form a closed nominal protocol, not a second effect
system. A `fn` without `offers` is non-interactive. An interactive function
cannot be stored, returned, addressed, or converted to an ordinary function
pointer. Calling it begins execution immediately and creates no interaction
object, coroutine frame, task, retained continuation, executor, exception
object, dynamic handler search, or mandatory runtime. An ordinary function
and a return-only interactive function remain different even when their Native
ABI shapes coincide.

`report value`, `return value`, `fail value`, and `cancel value` produce the
lexically enclosing offer or ordinary return. A direct call is consumed by one
prefix `handle` expression with a fully braced handler set:

<!-- wyst-contract: sketch -->
```wyst
return handle read(dst, capacity, decide) {
  progress(update) { observe(update) }
  terminal {
    failure(problem) { translate(problem) }
    cancelled(cause) { cancelled_value(cause) }
  }
}
```

There is no source arm for ordinary return: the returned value is the identity
path before result typing and ownership checking. Every effective offered
member is handled exactly once, locally or by explicit per-offer forwarding.
Terminal arms and the identity path have one exact result type, with `never`
compatible. `forward progress`, `forward failure`, and `forward cancelled`
require exact canonical payload type, lifetime, mutability, and ownership
compatibility with the lexically enclosing interactive function. There is no
`forward all`, whole-call forwarding, implicit forwarding, or failure
translation. Handlers use shallow, irrefutable heads. A notification arm
continues the producer only by returning normally. It exposes no continuation
or explicit `resume`; terminal arms complete the `handle` expression and never
continue the producer.

## 26.5 Exact interactive failure forwarding

Postfix `?` accepts only a direct interactive call whose effective protocol is
exactly ordinary return plus `failure`, inside an interactive function with an
exactly matching failure payload, lifetime, mutability, and ownership mode. It
yields the ordinary return and is identical to `handle` with `forward failure`
and the identity return path. The callee and arguments evaluate once, left to
right. It introduces
no new effect beyond the call.

`?` rejects stored `Result`, progress, cancellation, any required lexical
recovery policy, a mismatched outer failure, notification context,
non-direct calls, and public-signature inference. Adding a member to the
callee makes an existing site ill-typed. Child cleanup completes before the
outer failure is committed.

## 26.6 Progress, effects, and liveness

Progress is synchronous, serial, same-strand, unbuffered, notification-only,
and subject to backpressure. `report` does not return until the handler
returns. It supplies no fairness, wait-freedom, lock-freedom, scheduling,
independent forward-progress, or latency guarantee. A returning notification
handler produces `void` and continues the producer exactly once. A terminal
handler continues it zero times. Progress has no reply value.

Notification callbacks and their opaque contexts are `noescape`. A handler may
capture safe caller locals lexically by reference. Capture inference rejects
hard-register storage, a second path to storage already lent to a noescape
producer parameter, and repeatable ownership or initialization changes that a
later notification could observe. The callback cannot be retained and cannot
fail, cancel, return from the enclosing caller, target an outer loop, or call
through a typed path that can perform such an escape. A borrowed progress
payload has a fresh report-scoped lifetime ending when the handler returns and
cannot escape.

Every arm's effects are inferred independently. The effect of `handle` is the
union of the producer call and every effective local arm. Whole-project and
separate builds consume the same callable and protocol authority. If an
explicit `handler(...)` ceiling exists, every arm must be a subset of it; an
omitted ceiling adds no restriction. Forwarding progress from a callee with an
explicit ceiling requires an explicit enclosing ceiling no wider than the
callee ceiling. A callee with an omitted ceiling may forward into either form.
There is no separate handler-invocation effect.

If the ceiling or inferred arm effects contain `execution_suspension`,
`report` creates the existing typed strand-suspension boundary and all
context-stability checks apply. No boundary is invented when authenticated
evidence excludes suspension. Denying an inferred arm effect rejects that arm.

Lexical handling is orthogonal to suspension. Current direct source uses
`handle call(...)`. If and when asynchronous `await` expressions become an
accepted source feature, they compose as `handle await request` or
`handle await task`: `await` may suspend the current resumable while `handle`
still provides the complete lexical policy. The current grammar does not yet
accept `await`. Materialized progress and terminal records from queued or
remote work are replayed locally by the observer; a remote producer never
receives, captures, or retains lexical handler arms.

## 26.7 Recovery interaction

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

The recovery parameter's exact ordinal, callable type, `noescape` bit, and
effect bound remain part of the direct interactive declaration product across
module interfaces. A separately decoded consumer rejects a missing, reordered,
or widened recovery entry; it does not reinterpret the call as an opaque
callback protocol.

## 26.8 Commitment, cancellation, partial completion, and cleanup

A cancellation request or deadline expiry is ordinary explicit input, not a
terminal outcome. The producer decides when to observe it. Terminal commitment
is the invocation's single linearization point: the first ordinary return,
failure, or
cancellation label committed by the producer wins. A later request, deadline,
event, or cleanup cannot replace it. `cancelled` acknowledges acceptance of a
cause. An API promising acknowledgement of a specific request includes its
nominal identity or generation in the cancellation payload. Deadline expiry is
a request source unless the API explicitly classifies timeout as return data
or nominal failure. No request, deadline, or handler asynchronously unwinds a
producer.

Terminal lowering performs this order:

1. evaluate the selected payload once;
2. on an ordinary returned path, check postconditions against that payload;
3. move it into caller-owned outcome storage;
4. construct the exact terminal discriminator (the commitment point);
5. disarm destruction of the moved source;
6. execute registered `defer { ... }` blocks in deterministic innermost-first,
   reverse-registration order; and
7. enter the selected terminal handler.

`defer` registers its block in the current lexical scope. Normal scope exit,
`break`, `continue`, ordinary return, and every interactive terminal execute the
applicable registrations. A cleanup may contain cleanup-local loops and traps,
but cannot `report`, `return`, `fail`, `cancel`, `goto`, or target an outer
loop. A trap during cleanup remains a trap; it does not relabel the committed
outcome. There is no implicit destructor runtime. Explicit cleanup and the
ordinary move state are the current deterministic destruction mechanism.

Every ordinary terminal edge accounts for live `must_account` and
`must_resolve` values before the edge commits. Returning or moving the value
into the selected payload accounts for it; `discard(xfer value)` records
deliberate abandonment only for `must_account`. A `must_resolve` value instead
requires obligation-preserving transfer/adoption or authenticated
declaring-module `resolve`. Ordinary return, failure, cancellation, loop/goto
transfer, scope fallthrough, and structured cleanup cannot abandon it. A
genuine nonterminating loop retains the authority because it has no successor;
a sealed nonreturning fatal transition may end it because no successor
authority exists. Ordinary calls returning `never` retain the caller's live
authority and do not acquire this fatal privilege. No unwinding, implicit
destructor, cleanup callback, or callable-name recognition is introduced.
The current language admits no source isolation-abandoning transition; adding
one requires separate authenticated design authority rather than treating an
ordinary nonreturning function as fatal.

A terminal payload may own completed output or borrow caller-owned storage
that outlives cleanup. It may not borrow producer-local storage released by
cleanup. For reads, writes, parsing, transfer, or provider work that completes
a prefix before failure, caller-owned output remains caller-owned and the
failure payload contains the exact committed extent and nominal cause.
Producer-owned partial output instead moves into the failure or cancellation
payload. Progress never establishes ownership or durable completion. Retry is
explicit caller policy and begins from the committed extent without repeating
already committed work.

### 26.8.1 Materialized asynchronous terminal outcomes

The sealed, provider-neutral `core.outcomes` namespace defines the stored
terminal envelope:

```wyst
pub enum TerminalOutcome<R: fixed_layout_movable, F: fixed_layout_movable, C: fixed_layout_movable>: u8 {
  Returned(R)
  Failed(F)
  Cancelled(C)
  Abandoned
}
```

`Returned` carries the ordinary domain result, `Failed` a typed recoverable
failure, and `Cancelled` the acknowledgement of an accepted request.
`Abandoned` is freely constructible data recording that an independently
isolated producer ended without selecting a declared outcome. It is observable
only after that environment contains the producer; it does not catch,
translate, resume, or make the producer's trap recoverable. No runtime,
provider, spawn operation, task, or scheduler is implied. Domain success types
use names such as `BytesRead`; completion terminology describes terminal
delivery rather than acting as a synonym for success.

### 26.8.2 Bounded causal records and failure aggregation

`core.outcomes` owns the additional nominal carriers
`CausalIdentity { value: u64 }`, `CausalOrdinal { value: u64 }`,
`StorageAddress { bits: u64 }`, and `WorkUnits { value: u64 }`. It defines
`CausalId { identity: CausalIdentity, generation: Generation }`,
`CausalRecord { identity: CausalId, parent: Option<CausalId>, stage,
ordinal: CausalOrdinal }`, and `CausalEvent<T> { causal, payload }`.
`CausalStage: u8` has the exact ordered variants `Spawn`, `Send`, `Request`,
`Attempt`, `Progress`, `Completion`, `Cancellation`, and
`TerminalSelection`. These are explicit values, not hidden exceptions or
native stack records, and preserve generation and optional parent identity end
to end.

`aggregate_failures<F>(input, output, policy, work_limit: WorkUnits)` is a
`must_observe`, allocation-free, `effects(none)` operation using caller-owned
non-overlapping slices. It orders unique events by the carrier values
`(ordinal.value, identity.identity.value, identity.generation.value,
stage-tag)`. An exact
duplicate key is an error. `Fail` rejects insufficient output without changing
it; `Truncate` writes the stable sorted prefix and returns stored and total
`ElementLength` counts, including a valid zero-capacity prefix. Complete
storage returns its stored `ElementLength`. Input and output never alias in
place; zero-length ranges do not overlap. Invalid or overflowing ranges and
overlap report `StorageRangeFailure` with nominal `StorageAddress` and
`ByteLength` fields. Insufficient storage reports required and available
`ElementLength`; insufficient work reports required and available `WorkUnits`.

Work is counted exactly as `n*(n-1)/2 + n*stored`. The input count is bounded
so this formula fits `u64`; a caller-supplied lower `work_limit` returns the
required and available counts. Selection uses repeated scans and constant
stack storage. The failure precedence is invalid range, overlapping storage,
input too large, insufficient storage under `Fail`, work limit, duplicate key,
then success or truncation. Every failure is selected before the first output
write, so caller storage is unchanged. The operation performs no allocation,
handler search, unwinding, ambient-state access, or assumed fault recovery.

## 26.9 ABI and C adapter profiles

Native interactive lowering adds a hidden `noescape` progress callback and an
opaque `noescape @u8` context only when `progress` is effective. The callback
type is `fn(noescape @u8, P) -> void effects(bound)`, and invocation is
synchronous. Progress-only functions retain their ordinary direct return.
Functions with terminal offers return one exact compiler-created outcome enum;
it follows ordinary Native aggregate classification and large outcomes use
caller result storage. AAPCS64 interactive adapters are ordinary explicit
wrappers and never redefine the native interactive type.

Two C profiles are closed and explicit:

* **status/out** applies only to return-or-failure interactive functions whose complete
  failure information has a declared C-compatible status mapping and no rich
  payload or partial extent. It returns the mapped status and accepts
  caller-provided return storage. If an extent must exist on both paths it is
  a separate, always-initialized output with a stated type.
* **tagged/out** returns a terminal tag and accepts correctly aligned
  caller-owned storage for rich return, failure, and cancellation payloads.
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
of return/failure payload storage, and preserves the nominal failure cause.
Bad alignment, overlapping selected payload storage, uninitialized required
common output, escaping callback/context, or an incomplete status mapping is a
compile-time adapter error.

## 26.10 Semantic records and validation

The materialized-sum record contains
`{ nominalIdentity, tagType, size, alignment,
payloadOffset, payloadSize, payloadAlignment, variants[] }`; each variant is
`{ nominalIdentity, tag, fields[] }` and each field retains exact type,
offset, size, alignment, ownership, and movability.

The callable contract record contains `{ nominalIdentity, parameters[],
returned, mustObserve, requires[], ensures[], effects, abi }`. Every ordered
contract clause retains its typed condition, exact `u16` reason, source span,
and proof state. `mustObserve` affects source call-site checking and callable
compatibility but not `abi`. Normal direct or statically singleton returns may
add expression-scoped authenticated postcondition facts.

The interactive callable record contains `{ nominalIdentity, parameters[],
returned, offers[], effects, handlerCeiling?, recoveryParameters[], nativeAbi,
cAdapters[] }`. `offers` retains the notification-versus-terminal
classification and ordered optional records for progress, failure, and
cancelled with exact payload type, lifetime, mutability, ownership, and
concrete layout. Every lexical arm has a separate compiler-produced summary
`{ owner, label, effects[], captures[], leases[], control }`. `nativeAbi`
records the hidden callback/context signature when present, the direct return
or exact terminal-outcome layout, argument/result classification, and noescape
facts. `cAdapters` records profile, status/tag mapping, callback/context,
output initialization matrix, alignment, aliasing, cleanup, and common-output
obligations.

The current in-memory semantic-interface consumer validates these records
against one another during decoding and against checked typed IR before
machine lowering. Typed IR and
the final image preserve nominal outcome types, interactive signatures, offer
tags, per-arm summaries, optional handler ceilings, suspension provenance, and
adapter facts. DWARF emits exact enum layouts and interactive outcome/callback
types. Explain
reports render the same fields. A mismatch, missing member, reordered tag,
weakened effect, incompatible layout, or unauthenticated adapter mapping is an
error; consumers never reconstruct the record from names.

Compiler-generated lexical progress-handler entries retain their owner's
authenticated execution levels, inferred arm effects, noescape
callback/context ABI, captures, leases, and canonical generated symbol through
typed IR, machine entry emission, and full DWARF. Their invocation remains the
specified synchronous noescape callback edge; the generated entry is not
degraded to an untyped handler.

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
