---
title: "Chapter 13: Wyst Scheduling Semantics"
group: chapter
chapter: 13
order: 13
summary: "Execution strands, effect-driven suspension boundaries, and source scheduling policy."
---

# Chapter 13: Wyst Scheduling Semantics

> **Canonical scope.** The implicit `schedule.standard` policy, the explicit
> `schedule source { ... }` boundary, the `#[schedule(source)]` declaration
> attribute, the execution-strand model, the `execution_suspension` effect and
> its typed boundary, and their reproducibility scope. IR-level representation
> lives in [appendix-a-ir.md](appendix-a-ir.md).

### Semantic Boundary

Scheduling policies are permissions for instruction ordering, not a way to change
source meaning. Optimization and IR rules build on the source evaluation order,
effects, memory ordering, and dependency rules established here. Scheduling may
move pure work only when the move is observationally equivalent under those
rules.

## Execution Strands And Suspension

An **execution agent** is the memory-model umbrella that owns one ordered
execution history. An **execution strand** is one sequential Wyst control-flow
instance inside that agent. A software task or host thread may retain one
strand while it is voluntarily parked, timer-preempted, resumed, or migrated
where the selected target permits migration. Strand identity is compiler-only:
it has no source value and creates no task, host-thread, scheduler, executor,
TLS, stack, entry syntax, runtime, or operating-system dependency.

Every trap or interrupt invocation starts a fresh strand in the same execution
agent as the interrupted strand. Architectural entry orders the handler after
the exact interrupted-strand prefix; nested traps recursively nest this order.
Ordinary architectural exception return ends the handler strand and resumes
the interrupted strand, ordering its resumed suffix after the completed
handler. A scheduler transfer saves or stops the current handler strand and
resumes the selected task's distinct saved strand, or it is nonreturning. It
never relabels the current dynamic continuation as another task.

These are control-order edges for one agent. They do not synchronize with a
different agent, publish unrelated memory, or replace atomic, volatile,
interrupt-exclusion, or provider rules. Selecting another task likewise
creates no source-level synchronizes-with or happens-before edge. A provider
that hands saved-context, run-queue, or current-task metadata to another owner
must perform its own explicit release/acquire publication.

### The `execution_suspension` effect

`execution_suspension` is a closed, target-neutral language effect. It says
that an operation or call may synchronously enter or request an environment or
provider scheduling transfer that ceases the current strand and may later
return it. Exogenous timer, interrupt, or host preemption does not add the
effect to the interrupted operation. The effect does not describe a dormant
caller-owned resumable frame; that later facility has a distinct effect and
boundary.

Every direct, indirect, imported Wyst, or foreign call whose exact or
conservative callable bound contains `execution_suspension` has exactly one
typed `strand_suspension_boundary`. `effects(all)` contains the effect. The
boundary is placed after the callee expression for an indirect call and after
all arguments have been evaluated left-to-right, immediately before transfer
to the callee. Devirtualization, mandatory or optional inlining, tail-call
formation, semantic-interface serialization, objects, archives, and final
linking preserve the same boundary; none may infer its absence from an
unavailable body. Consequently,
`#[deny_effects(execution_suspension)]` proves a strand-nonsuspending call graph
only when every reachable exact or conservative bound excludes it.

The active `wyst.callable-context-summary.v2` sidecar authenticates the exact
or conservative bound and its authority under the same digest as callable
context provenance. Known-target indirect calls join those authenticated
bounds and must reproduce their typed call-site bound. Chapter 16 owns the
wire format for the not-yet-active public semantic-interface/archive producer.

If a suspending call returns, it returns to the same logical software task or
host thread and the same retained strand. The provider may run other tasks and
may migrate that dormant task at this boundary, but it preserves the address
and object identity of every live native activation, SP-relative local,
outgoing area, and nonescaping local pointer. It may not rebind, clone, enter
twice, relocate, stack-copy, nonlocally enter or exit, or asynchronously cancel
that continuation. Each such facility requires a different compiler-visible
effect, boundary, and lifetime model.

For a target that admits current-core state or `per_cpu`, a retained strand may
migrate only at a preserved `strand_suspension_boundary`. Asynchronous
preemption resumes it on the same core. A target that cannot guarantee those
rules makes `per_cpu` unavailable; it may not rely on convention, silently
disable the boundary, or claim arbitrary-point migration without a separate
compiler-visible invalidation proof.

### Context stability

Every compiler-owned current-context operation and every authenticated
provider interface classifies its result with one closed `context_stability`
value:

| Classification | Boundary rule |
| -------------- | ------------- |
| `active_context_affine` | Bound to one active context or current core; it cannot cross a strand or frame-suspension boundary. |
| `task_stable` | May cross a strand boundary because a returning suspension resumes the owning task. |
| `cross_strand_stable` | May cross, subject to the value's exact instance, generation, detach, escape, and lifetime contract. |

The conservative order is `active_context_affine < task_stable <
cross_strand_stable`; a whole aggregate, possible enum variant, or control-flow
join uses the most restrictive reachable live classification. Field projection
retains the selected field's classification. The classification is non-erasable
semantic type/provenance, not a runtime tag or optional lint. Assignment, local
storage, arguments and results, aliases, projections, aggregates, enum
payloads, generic substitution, joins, spills and reloads, inlining, semantic
interfaces, objects, and archives preserve it exactly. Unknown or incompatible
provenance cannot cross a boundary, and no source cast, adapter, or summary may
invent or upgrade it.

There is no source spelling that authors a `context_stability` classification.
The current callable declaration surface therefore produces ordinary parameter
and result summary facts; compiler-owned current-instance operations remain the
only active classified source of values. A classified callable summary is
admitted only from a compiler-owned or authenticated provider producer. The
portable provider accessor surface that creates such results is not yet active;
substituting summary bytes before that producer exists is incompatible
transport, not a way to opt in early.

The later caller-owned resumable-frame facility rejects both affine and merely
task-stable values in frame state and accepts only an authenticated
cross-strand-stable value under its exact lifetime contract. It does not change
this vocabulary or weaken the ordinary strand-boundary rules.

An `active_context_affine` or `task_stable` value may use only compiler-proven
nonescaping activation- or task-local storage. It cannot escape into module or
static storage, unclassified addressed memory, foreign storage, or a resumable
frame. Address-taking is rejected unless every alias is proved dead or eligible
at the applicable boundary. Raw-address circumvention remains the reported
Chapter 1 trust boundary and never sanitizes context stability.

Exogenous preemption may leave an affine value dormant only in the exact saved
activation; a handler or other strand cannot access it. Ordinary return
revalidates it only by restoring that exact context, with same-core restoration
additionally required for core-derived provenance or for a target that admits
current-core or `per_cpu` state.

### Boundary ordering

The boundary is a two-way compiler ordering dependency for observable memory,
volatile/MMIO/atomic operations, other effects, calls, and current-context or
current-`per_cpu` base acquisition. It invalidates cached current-context and
`per_cpu` facts. A live current-core base handle, a live affine context handle,
or an address derived from either is rejected across it; invalidating a cache
cannot repair a source-visible stale address after migration. An ordinary
non-address value already copied from `per_cpu`, an authenticated
`task_stable` value, and an authenticated `cross_strand_stable` value may
remain live under their own lifetime contracts. After the boundary, any
current-context or `per_cpu` fact is reacquired.

Independent pure computation may still move when normal dependencies and the
selected deterministic scheduling profile allow it. The boundary is not
`schedule source`, a compiler memory barrier, an architectural barrier, an
atomic order, synchronization, a happens-before edge, a safepoint, a stack
map, a resumable frame, a continuation, a cancellation point, or evidence that
the callee actually parked.

### Authenticated provider marker

`core.execution.suspension_point` has internal identity
`execution_suspension_point`. Its canonical source form is:

<!-- wyst-contract: sketch -->
```wyst
import core.execution
execution.suspension_point()
```

The sealed private direct whole-module import exposes the final qualifier;
`import core.execution as NAME` is the only alternative access shape. The
compiler rejects selective, bare, public, re-exported, leaf, shadowed, and
spoofed access. Calling the operation contributes `execution_suspension` and
one `strand_suspension_boundary`, returns immediately, and emits zero
instructions, calls, symbols, relocations, stack maps, runtime hooks, or
runtime dependencies. The marker itself never parks, yields, switches context,
or calls an operating system.

The marker is legal only in the smallest authenticated Wyst-native provider
leaf, immediately before the first authenticated non-call environment transfer
or compiler-recognized canonical checked context switch, with no intervening
observable operation. Authentication binds the selected target, provider,
provider-leaf semantic declaration, and adjacent transfer-operation identity;
textual adjacency or an instruction pattern cannot authenticate it. The
compiler rejects standalone, missing, duplicate, post-transfer, observably
separated, and unauthenticated markers. It also rejects a marker before a Wyst
or foreign call whose callable bound already supplies the ordinary boundary.
An authenticated provider transfer must carry the effect itself or have exactly
one preceding marker; it may not have neither or both.

---

## Standard Scheduling

Ordinary code is compiled under the implicit normative policy
`schedule.standard`. This is a language-defined policy, not an omitted or
implementation-selected default. The compiler records it by name in IR,
inspection reports, and generated build identity.

The standard policy's permissions are:

- **Semantic dependencies:** an instruction may move only after every value,
  control, address, and storage dependency it reads has been produced. An
  instruction that produces a value must remain before every use of that value.
- **Evaluation order:** source expression evaluation remains the left-to-right
  contract from Chapter 7. Standard scheduling may change only target
  instruction order after typed IR dependencies prove the same observable
  result.
- **Effects:** calls, inline assembly, system-register operations, traps,
  compiler barriers, volatile accesses, atomics, stores, and other effectful
  operations are scheduling barriers. Pure instructions must not cross an
  effect barrier when that would change the order in which effects are observed
  or reported.
- **Alias proofs:** ordinary memory accesses are not treated as independent by
  default merely because their source expressions differ. Reordering memory
  operations requires a closed alias proof from typed address, storage, and
  memory-model facts. Without such a proof, memory operations remain in source
  order relative to other memory and effect operations. Non-temporal pair
  loads/stores are memory operations under this rule, not pure scheduling hints.
- **Memory model:** standard scheduling must preserve volatile order, atomic
  order, release/acquire and `seq_cst` constraints, barrier synchronization,
  per-location modification order, and happens-before edges from
  [chapter-09-memory-model.md](chapter-09-memory-model.md). It never inserts a
  hidden hardware barrier and never weakens an explicit one.
- **Deterministic tie-breaking:** when multiple pure instructions are ready,
  the compiler ranks them by dependency class, then by their canonical IR/source
  order. Equal-ranked ready instructions keep source order. No hash iteration,
  host timing, thread interleaving, or environment-dependent order may decide a
  tie.
- **Target instruction selection:** the target backend may select any
  target-legal instruction form that preserves the selected order, effects,
  memory constraints, ABI facts, and source-visible rounding/trap behavior.
  Target-specific lowering must use deterministic target descriptor facts and
  must not reinterpret `schedule.standard` as a microarchitecture hint.

The standard policy has no source spelling. It is in force outside explicit
source-order boundaries and remains deterministic for fixed build inputs.

## Source-Order Scheduling Boundaries

The only explicit scheduling block is:

<!-- wyst-contract: check-pass -->
```wyst
module scheduling_demo

fn step(a: u64, b: u64) -> u64 {
  schedule source {
    const sum: u64 = a + b
    return sum
  }
}
```

`schedule source` is defined at the level of **source-level semantic
operations**. A semantic operation is a source-visible evaluation step such as
a runtime arithmetic operation, load, store, call, intrinsic, inline assembly
operation, trap, branch condition, or source-declared temporary whose value is
part of an inspection contract. The boundary is not a one-source-line-to-one-
instruction mapping.

Semantic operations inside the region remain in source evaluation order.
Operations outside the block do not move into it, and operations inside the
block do not move out. Lowering may introduce required support instructions,
but it may not move, duplicate, combine, or eliminate semantic operations when
doing so changes an observable intermediate value or the declared inspection
contract. Non-dependent semantic operations are sequenced by source order.

The boundary is a compiler scheduling fence only. It emits no hardware barrier
and does not strengthen the architectural memory model. Use
`barrier.compiler()` (after importing `core.arch.barrier`) for a statement-level compiler memory fence and the
explicit memory operations in Chapter 9 for architectural synchronization.

Source scheduling permits these target-lowering details when they preserve the
semantic-operation sequence and any declared inspection contract:

| Lowering detail | `schedule source` rule |
| --------------- | ---------------------- |
| constant folding | Permitted for compile-time-constant expressions and other pure values whose folded result is the same source-level value and whose intermediate steps are not part of the inspection contract. |
| folded address modes | Permitted when folding an address calculation into a load/store addressing mode does not remove a source-declared address value that must remain inspectable. The load or store itself stays in source order. |
| support instructions | Permitted before, after, or around a semantic operation when required to materialize immediates, addresses, register moves, masks, extensions, or other target operands. |
| register spills and reloads | Permitted as allocator support instructions. They are not source semantic operations, but they must not reorder source loads, stores, calls, volatile operations, or inspectable temporaries. |
| prologues and epilogues | Permitted as ABI/frame support outside the source semantic sequence for a function body. Source regions do not suppress required frame setup or teardown. |
| ABI marshalling | Permitted for parameter passing, return-value handling, aggregate copies, indirect returns, and call-preserved register handling. Calls remain semantic barriers in source order. |
| dead pure temporary removal | Permitted only when the temporary has no effect, no use, no source-visible address or storage identity, and no declared inspection contract. |
| instruction combination | Permitted only when the combined instruction implements one semantic operation or combines support instructions without changing any observable intermediate. Combining distinct source-level semantic operations into one result is not permitted when it changes an intermediate value or inspection contract. |
| vector-slot allocation changes | Permitted as generated-resource allocation. Slot placement and register choice are not semantic operations, but they remain deterministic and must satisfy any frame, vector-slot, ABI, and report contracts. |

Floating-point contraction is governed by
[chapter-07-operators.md](chapter-07-operators.md): `fma` is the only Wyst
source operation that requests fused multiply-add/subtract lowering. If the source does not use `fma`, neither scheduling policy may fuse
`a * b + c` into a single-rounded multiply-add.

Use `schedule source` when:

- source order is semantically significant
- source-level intermediate values must remain inspectable
- scheduler reordering must be disabled inside a bounded region
- timing-sensitive sequences must not be reordered

Source scheduling does not freeze exact instruction count, exact register
choice, spill placement, prologue shape, or ABI marshalling. Use frame
constraints, slot-budget diagnostics, disassembly snapshots, and generated
reports when those post-lowering resources are part of the contract.

## Whole-Body Attribute

`#[schedule(source)]` is legal only in the declaration's single attribute
group on a body-bearing Wyst `fn` or `label`:

<!-- wyst-contract: check-pass -->
```wyst
module scheduling_demo

#[schedule(source)]
fn ordered_step(value: u64) -> u64 {
  return value + 1
}
```

The attribute wraps the complete body in the same boundary as
`schedule source { ... }`. It is rejected on bodyless declarations, foreign
declarations, constants, variables, types, fields, and other non-code
subjects. Mandatory inline expansion preserves the boundary around the
expanded body; inlining must not flatten it into the caller's surrounding
`schedule.standard` region. Nested source boundaries are legal and
semantically idempotent, but the formatter does not invent or merge them.

Reports record the policies used by a function as `schedule.standard` and,
when present, `schedule.source`. A selected policy participates in generated
build identity whenever it can affect generated bytes.

---

## Final-Code Verification (Manifest-Owned)

The released-v0.8 exact-code declaration suffix is removed from v0.9 source.
The parser recognizes that removal-manifest row only far enough to issue the migration diagnostic; it
must never reach IR or machine lowering. This historical spelling therefore
remains a negative source contract:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module exact_code_demo

tick :: () #exact(instructions = 2, families = "hint,branch", bytes = "1f2003d5 c0035fd6", prologue = "absent", spills = 0, veneers = 0, section = ".text", align = 4) {
  %nop()
}
```

Final-code requirements belong to the selected named artifact's `verify` block
and use a canonical semantic declaration selector:

```text
verify {
  code arch.timer.tick {
    instructions 2
    families [.hint, .branch]
    bytes [0x1f, 0x20, 0x03, 0xd5, 0xc0, 0x03, 0x5f, 0xd6]
    prologue .absent
    spill_slots 0
    veneers 0
  }
}
```

The supported manifest-owned final-code fields are:

| Field | Contract |
| ----- | -------- |
| `instructions N` | the final linked body has exactly `N` AArch64 instructions |
| `families [.a, .b]` | every emitted instruction belongs to one permitted authenticated catalog family |
| `bytes [...]` | the final post-relocation function bytes exactly match the hexadecimal byte list |
| `prologue .present` / `.absent` | compiler-generated frame setup is present or absent |
| `spill_slots N` | final register allocation produced exactly `N` spill slots |
| `veneers N` | final placement attributed exactly `N` veneers to the selected code item |

Source attributes continue to own section and alignment, and callable syntax
continues to own register placement; those are not manifest verification
fields. Verification runs after ABI lowering, register allocation, frame
layout, target instruction selection, relocation, veneer planning, and final
text emission. Failure names the canonical manifest subject and required extra
resource. Verification never rewrites code to satisfy a check.

Use `schedule source` for source-operation ordering and artifact `verify code`
only when the final emitted code itself is the contract. Keeping the facilities
separate prevents source scheduling from becoming a byte-freezing mode.

---

## Layout Constraint

Scheduling policy does not select code layout. Neither standard scheduling nor
a source boundary may:

- move instructions across basic block boundaries
- change the ordering of basic blocks in the emitted binary
- change which section a function or block is placed in
- alter the control flow graph shape (branch targets, fall-through targets)

**Rationale.** Code layout — block ordering, section placement, and fall-through
direction — is determined by source structure and explicit layout controls such
as branch facts and section placement, never by scheduling policy.
Separating layout from scheduling preserves two properties:

1. **Reproducibility scope.** Layout decisions are deterministic under the
   Reproducibility Model's input catalog (same source input manifest,
   compiler version, build optimization mode, target, and selected scheduling
   policies → same layout).

2. **Composability.** A programmer can pin layout with explicit branch facts
   while independently selecting source-order boundaries. See
   [chapter-08-functions.md §2.7.2](chapter-08-functions.md) for branch hints
   and [chapter-04-modules.md](chapter-04-modules.md) for section conventions.

## Removed Scheduling Forms

The predecessor scheduling directive and its four policy arguments are removed
source syntax. Their exact dispositions are frozen in the hash-removal audit.

There is no compatibility spelling, mode alias, warning-only acceptance, or
automatic rewrite. The compiler reports these as invalid syntax. The former
internal/report names `schedule.default`, `schedule.strict`,
`schedule.relaxed`, `schedule.throughput`, and `schedule.latency` are likewise
not emitted by v0.9 tooling.
