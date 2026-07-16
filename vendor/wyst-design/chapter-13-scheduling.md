---
title: "Chapter 13: Wyst Scheduling Semantics"
group: chapter
chapter: 13
order: 13
summary: "The standard scheduling policy and explicit source-order scheduling boundaries."
---

# Chapter 13: Wyst Scheduling Semantics

> **Canonical scope.** The implicit `schedule.standard` policy, the explicit
> `schedule source { ... }` boundary, the `#[schedule(source)]` declaration
> attribute, and their reproducibility scope. IR-level region representation
> lives in [appendix-a-ir.md §4.3](appendix-a-ir.md).

### Semantic Boundary

Scheduling policies are permissions for instruction ordering, not a way to change
source meaning. Optimization and IR rules build on the source evaluation order,
effects, memory ordering, and dependency rules established here. Scheduling may
move pure work only when the move is observationally equivalent under those
rules.

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

## Exact Code Contracts (Released v0.8 Snapshot)

The `#exact(...)` declaration suffix and prefix-`%` example in this section are
released-v0.8 syntax retained for the historical post-lowering contract. They
are not active v0.9 source spellings; future artifact verification owns the
successor contract.

Exception vectors, counted sequences, timing-sensitive operations, and byte
identity boundaries use `#exact(...)` on a function or label when source
scheduling is not strong enough. `#exact` is a post-lowering artifact contract,
not a source-level scheduling policy. It does not authorize reordering and it
does not change source meaning; it constrains what the backend is allowed to
emit for that code item.

<!-- wyst-contract: check-pass -->
```wyst
#module exact_code_demo

tick :: () #exact(instructions = 2, families = "hint,branch", bytes = "1f2003d5 c0035fd6", prologue = "absent", spills = 0, veneers = 0, section = ".text", align = 4) {
  %nop()
}
```

The supported exact-code fields are:

| Field | Contract |
| ----- | -------- |
| `instructions = N` | the emitted body has exactly `N` AArch64 instructions |
| `families = "a,b"` | every emitted instruction belongs to one of the listed families: `arithmetic`, `branch`, `compare`, `hint`, `load-store`, `logical`, `move`, `system`, `adr`, or `other` |
| `bytes = "hex"` | the emitted body bytes exactly match the hexadecimal byte string, ignoring spaces and underscores in the source string |
| `registers = "name:xN,other:vM"` | named parameters or locals are assigned exactly to the listed registers after allocation |
| `prologue = "present"` / `"absent"` | the function or label either has or does not have compiler-generated frame setup |
| `spills = N` | register allocation produces exactly `N` spill slots |
| `veneers = N` | veneer planning inserts exactly `N` veneers for the text chunk containing the code item |
| `section = ".name"` | the code item is emitted into exactly that executable section |
| `align = N` | the emitted file and address offsets are aligned to `N` bytes |

The compiler verifies `#exact` after ABI lowering, register allocation, frame
layout, target instruction selection, veneer planning, and text emission. If a
contract cannot be satisfied, the build is rejected with a diagnostic that
names the failed requirement and the extra instruction, byte, register, spill,
veneer, prologue, or placement resource that would be required. The compiler
must not silently insert support code to make an exact-code region work; the
programmer must relax the contract or change the source.

Use `schedule source` for ordinary source-operation ordering. Use `#exact` only
when the post-lowering artifact itself is the contract. Keeping the two
facilities separate prevents source scheduling from becoming a byte-freezing
mode for ordinary code.

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
as `#likely`, `#unlikely`, and section placement, never by scheduling policy.
Separating layout from scheduling preserves two properties:

1. **Reproducibility scope.** Layout decisions are deterministic under the
   Reproducibility Model's input catalog (same source input manifest,
   compiler version, build optimization mode, target, and selected scheduling
   policies → same layout).

2. **Composability.** A programmer can pin layout with `#likely`/`#unlikely`
   while independently selecting source-order boundaries. See
   [chapter-08-functions.md §2.7.2](chapter-08-functions.md) for branch hints
   and [chapter-04-modules.md](chapter-04-modules.md) for section conventions.

## Removed Scheduling Forms

The predecessor directive and modes are removed source syntax:

```text
#schedule(strict)
#schedule(relaxed)
#schedule(throughput)
#schedule(latency)
```

There is no compatibility spelling, mode alias, warning-only acceptance, or
automatic rewrite. The compiler reports these as invalid syntax. The former
internal/report names `schedule.default`, `schedule.strict`,
`schedule.relaxed`, `schedule.throughput`, and `schedule.latency` are likewise
not emitted by v0.9 tooling.
