---
title: "Appendix A: Wyst Intermediate Representation"
group: appendix
appendix: "A"
order: 25
summary: "Compiler IR, SSA, effect representation, verifier invariants, register allocation, and lowering internals."
---

# Appendix A: Wyst Intermediate Representation

> **Canonical scope:** the typed SSA IR consumed by every compiler pass between semantic analysis and ARM64 instruction selection. Defines values, ops, regions, control flow, type system, textual form, and verifier invariants. It is authoritative for compiler-internal IR only; [source-of-truth.md](source-of-truth.md) defines how IR documentation is resolved against user-visible language and ABI rules.
> **Cross-references:** [chapter-01-language-design.md](chapter-01-language-design.md) (Compiler Architecture, Internal IR), [chapter-06-types.md](chapter-06-types.md), [chapter-08-functions.md](chapter-08-functions.md), [chapter-09-memory-model.md](chapter-09-memory-model.md), [chapter-13-scheduling.md](chapter-13-scheduling.md), [chapter-16-object-format.md](chapter-16-object-format.md) (relocation vocabulary).

## Appendix Scope

This advanced compiler-internal reference maps Wyst source concepts into SSA,
verifier invariants, scheduling regions, allocation, and lowering. The source
contracts it depends on are linked above.

## v0.9 Callable and `per_cpu` IR Contract (Current)

Chapter 8 owns the source semantics for `language.callable-storage-contracts`.
Typed IR must preserve, without reconstruction, a callable's convention,
ordered parameter and result types,
each parameter's `noescape` bit and optional register placement, the optional
scalar result placement, and whether its result is `never`. Declaration
parameter names may remain diagnostic metadata but are excluded from the
callable type key. `naked` is definition-lowering metadata, not a callable-type
field. Calls are well typed only when the complete identity matches; IR has no
implicit callable adapter operation.

Every `never` call and every label path reaches an IR terminator.
`exception.eret()` is
an operandless final value in its block followed by `unreachable`; it cannot
have an IR continuation. ARM64 lowering treats it as a tail transfer: a
non-`naked` definition restores every compiler-owned saved register and tears
down its frame immediately before `eret`, while a `naked` definition emits no
such compiler-owned sequence. A `naked` definition carries a hard
no-frame/no-prologue/no-epilogue/no-spill invariant that is rechecked after
each lowering and allocation phase capable of creating a resource.

A module `per_cpu var` is represented as `GlobalStorage::PerCpu` plus its
source type, natural size/alignment, statically representable initializer
bytes/relocations, canonical symbol identity, and deterministic template-order
key. Its final `.percpu` byte offset is a placement result. A
`#percpu_offset_of` constant retains the global identity until placement and
then becomes that final `u64` byte offset; it never becomes an address.

A direct `per_cpu` read, write, field access, element access, or method from
`wyst.atomic-matrix.v1` remains a non-addressable access record through
scheduling. The record
contains the global identity, checked subobject byte offset, requested typed
operation, source origin, and selected target/runtime realization facts. An
implementation may temporarily express its address calculation as internal
ops only when the verifier proves that the value reaches one confined access
endpoint, cannot be stored, returned, passed, cast, joined, or exposed, and
cannot survive scheduling as a general address. A bitstruct field write may use that
one address for only its verified backing-word load/insert/store RMW pair; it
does not create reusable provenance.

At machine lowering, each access record expands independently to one fresh
base acquisition, the final linked byte offset, and exactly the requested
operation. No value, phi, global, compiler-owned frame slot, dataflow fact, or
common-subexpression record may carry a current-core base from one source
access to another. Declaration or offset-query IR creates no base acquisition.

Before access-bearing IR is admitted, the selected target must explicitly
provide the Chapter 11 realization contract. The currently implemented
single-instance selection is
`#target(..., per_cpu = single_instance_tpidr_el1)`, whose facts
are: available; `MRS TPIDR_EL1`; EL1 or higher; 16-byte live-base alignment;
reserved system state `TPIDR_EL1`; and realization
`single-instance-test-runtime`. Without that exact selection, reachable access
is a source/target diagnostic rather than malformed IR.

Typed IR for v0.9 admits no TLS storage kind, offset constant, current-instance
operation, symbol, or relocation. Internal names inherited from the released
v0.8 implementation do not authorize predecessor per-CPU or TLS source
behavior.

## v0.9 Strand Suspension And Context-Stability IR Contract (Current)

The target-neutral effect enum contains `execution_suspension` in addition to
the machine-effect vocabulary. It is present in `effects(all)`, callable
signatures, imported semantic interfaces, function-pointer bounds, inferred
effect summaries, deny sets, diagnostics, and report products. It is not an
A64 instruction-semantic row. An unavailable imported body retains the exact
authenticated bound from its interface, or the conservative `all` bound; it
never becomes effect-free because no local `FunctionIr` exists.

Every effect-bearing call has one `strand_suspension_boundary` value after all
callee/argument operands and immediately before transfer. The boundary record
and its verifier-required adjacent call or authenticated marker fact retain the
source call or marker identity, exact or conservative effect-bound provenance,
and adjacent transfer identity. An inlined call retains the record
immediately before the first expanded callee operation, and a tail call retains
it immediately before its terminator. Objects, archives, devirtualization, and
linking consume or reproduce the same typed record from the serialized bound;
they may not lower it to optional metadata.

`context_stability` is a required provenance component for every value
originating in a compiler-owned current-context operation or authenticated
provider interface. Its closed values are `active_context_affine`,
`task_stable`, and `cross_strand_stable`, ordered from most to least
restrictive. SSA copies, arguments/results, phi nodes, fields, aggregate and
enum construction/extraction, generic substitutions, spills/reloads, and
interface/object/archive serialization carry the exact component. Projection
selects the field component; aggregate and possible-variant joins take the
most restrictive live component. A raw address conversion records a trust
boundary and cannot clear or upgrade this provenance.

The current module builder emits ordinary callable parameter/result summaries
because the execution-strand contract adds no source qualifier and
authenticated provider accessors are not yet active. The verifier authenticates
that ordinary product and rejects unsourced classified replacement bytes. This
does not create a second schema: compiler-owned or authenticated provider
producers use the same `wyst.callable-context-summary.v2` transport, and its
consumer preserves and joins those classified facts without erasure when such a
producer is active.

That v2 sidecar authenticates the callable signature's exact effect list or
conservative top, the exact `SuspensionEffectAuthority`, ordered parameter
provenance, and result provenance under one digest. A known-target indirect
call joins the decoded target bounds in closed catalog order and requires that
join to equal its typed call-site bound before boundary analysis consumes it.
Missing or extra sidecars, a bound/authority disagreement with the canonical
signature and module authority map, or any noncanonical effect ordering is
invalid IR.

Liveness at each suspension boundary rejects an affine handle, current-core or
`per_cpu` base, or an address derived from one. It permits an ordinary scalar
already loaded from `per_cpu` and authenticated task-stable or cross-strand-
stable values. The boundary kills every cached current-context/current-instance
base fact, so the next access creates a fresh acquisition. Its dependency edges
also prevent observable memory, volatile/MMIO/atomic operations, effects,
calls, and base acquisitions from crossing in either direction, while leaving
independent pure operations eligible for deterministic scheduling.

## v0.9 Address, Slice, and Conversion IR Contract (Current)

Chapter 6 owns the source semantics represented by
`language.ir-source-semantic-agreement`. IR construction must erase the old
source spellings while preserving each explicit semantic choice:

- `address.load()` and `address.store(value)` become one typed `load` or
  `store`. The address operand is produced before the stored value. The IR
  retains ordinary, volatile, or MMIO receiver intent and therefore the exact
  `volatile_access`/`mmio` effect set.
- A byte-address `load<T>(endian = ...)` or `store<T>(..., endian = ...)`
  becomes one `endian_load` or `endian_store` with explicit result/value type,
  byte order, qualifier intent, required alignment, selected-target unaligned
  fact, and possible-fault classification. It is never decomposed into byte
  accesses in high IR.
- `byte_offset`, `element_offset`, and `field_addr` retain their source unit and
  source origin until IR construction has derived one byte offset. The
  canonical address op is then `gep(base, byte_offset)`; no later pass may
  rescale it. A constant symbol-relative byte offset remains a relocation
  addend measured in bytes.
- `addr_of(local)` becomes `stack_addr_of` with the local's exact address lens.
  It has no memory effect. Its addressability/resource fact survives to final
  allocation and rejects a fixed register home. Relocation-producing
  `#addr_of(symbol)` remains the distinct symbol `addr_of` operation.
- A range slice evaluates and lowers the base, present start, and present end
  once from left to right, then emits one `slice(data, len)` descriptor. Its
  address calculation is element-scaled exactly once. Raw
  `address.slice(elements = count)` emits the same descriptor from an ordinary
  address and the mandatory element count. Descriptor construction itself has
  no load, store, allocation, copy, or runtime bounds-check op.
- Every named conversion becomes `cast` with the exact named conversion kind.
  `saturate` is a same-signedness integer narrowing clamp;
  `truncate_bits` keeps a compile-time-validated low-bit width and returns the
  same source integer type. The verifier does not infer a conversion kind from
  source/target types.

For current AArch64, the target fact carried by scalar memory IR explicitly
permits unaligned ordinary and volatile accesses at 16, 32, and 64 bits. MMIO
IR requires natural alignment. Provable MMIO misalignment is rejected before
IR construction; a dynamic MMIO address carries
`possible_architectural_fault=true`. No verifier or optimizer may turn that
fact into an impossible-state assumption.

The v0.9 parser rejects the predecessor typed-memory, categorized-conversion,
colon-range, raw-descriptor, runtime address-of, and endian-primitive spelling
classes before semantic or IR construction. The verifier then validates the canonical structural result: it
rejects typed-address add/sub, a second scale on a canonical byte offset, a
non-byte endian receiver, non-ordinary raw-slice data, an inexact stack-address
lens, and a conversion kind outside its closed endpoint row. Shape-equivalent
IR nodes do not retain a redundant copy of the discarded source spelling;
source-origin metadata is retained only where it changes an IR invariant, such
as GEP unit/origin verification.

## v0.9 Atomic IR Contract (Current)

`language.opaque-atomic-storage-closed-orders` preserves atomic opacity in typed
IR. `atomic<T>` is a storage type and `@atomic<T>` is the only address form that
can name it. Both have the exact
size and natural alignment of `T`; neither erases to an ordinary `T` or `@T`
before atomic verification. An aggregate containing atomic storage is
non-copyable, and IR has no whole-value atomic copy, move, assignment,
reinitialization, volatile qualification, MMIO qualification, or relensing op.

`atomic<T>(value)` lowers directly into the destination storage. A module or
`per_cpu` destination records statically representable initializer bytes and
relocations and emits no startup function or synthetic store. A runtime-local
destination evaluates `value` once and records the initial modification-order
value before the location can escape. Construction is reported as storage
initialization and contributes no user-visible atomic load/store event.

The generated [atomic matrix](generated-atomic-matrix.md) is the IR operation
authority. Its eleven rows map source methods to the closed typed operations
`load`, `store`, `exchange`, `compare-exchange`, `fetch-add`, `fetch-sub`,
`fetch-and`, `fetch-or`, `fetch-xor`, `test-and-set-bit`, and
`test-and-clear-bit`. Every op retains its `atomic<T>`/`@atomic<T>` receiver,
exact element type, source order, result kind, and report/progress identity.
`compare-exchange` returns the named pair `(observed: T, exchanged: bool)` and
uses the matrix-derived failed-read order. No source `%` spelling survives as
a callable or compatibility IR operation.

The verifier rejects any method, element, or order not present in the matrix;
ordinary or mixed access to atomic storage; under-aligned aggregate placement
or provably misaligned atomic addresses; and an atomic address without the
required atomic-capable Normal-memory contract. Pair-atomic checked operations
remain separate 16-byte range operations and never widen `atomic<T>`.

The initial modification recorded by `atomic<T>(value)` is the location's
first modification-order member and happens-before every verified atomic op on
that location. Atomic target plans retain exact width and alignment and are
either one selected LSE operation or retry-until-success LL/SC; a plan may not
contain a lock, helper, retry limit, timeout, or synthetic failure. The IR
progress identity means lock-free implementation, not per-agent wait-freedom.
For `.seq_cst`, verification also retains participation in the single global
SC order. ARM64 `ldar`/`stlr`/acquire-release-RMW selection is accepted only
with Chapter 9's architecture proof and normative SC litmus obligations; the
absence of an implicit `dmb` is not by itself evidence of correctness.

## v0.9 Hardware Register IR Contract (Current)

Hardware declarations are semantic module facts, not allocated globals. A
register-map fact records stable map/register identity, unsigned backing type,
constant byte offset, access mode, normalized fields, and reserved/policy facts.
A placed-map fact binds that identity to one constant MMIO base. A scalar-MMIO
fact records its exact scalar transfer type and address. A system-register fact
records one authenticated generated catalog identity; an encoded declaration
retains the resolved target-extension identity, never a free raw tuple.

High IR preserves nominal `Map.Register.Value` and `SystemRegister.Value`
snapshot identity until the snapshot's `.raw` or named-field projection is
lowered. A snapshot-read result cannot be substituted for its backing scalar by
type equivalence. `.raw` is a pure exact-backing projection, and a named field
projection is one normalized typed-field extraction. Neither projection carries
a memory or machine-register access effect.

Declared MMIO operations use the ordinary typed `load` and `store` vocabulary
plus one mandatory per-function `HardwareAccessIr` record:

- stable declaration and placed-instance identity, plus the nominal snapshot
  identity or explicit `none` for standalone scalar MMIO;
- exactly one `ScalarRead`, `SnapshotRead`, `RawWrite`, `NamedWrite`, or
  `Modify` operation kind, rendered respectively as `hardware.scalar.read`,
  `hardware.snapshot.read`, `hardware.raw.write`, `hardware.named.write`, or
  `hardware.modify`;
- exact transfer type and width, alignment, `volatile=true`, `mmio=true`, and
  the `volatile_access` plus `mmio` effects;
- the ordered primitive value IDs implementing the operation,
  `full_compiler_fence=true`, and
  `emitted_architecture_barrier=false`.

A scalar read is one load whose result is the declaration's exact scalar type
and whose snapshot identity is `none`. A snapshot read is one load whose
high-IR result has the nominal snapshot type. A raw write is one store of the
exact backing scalar. Named-write construction is pure typed-field insertion
plus fixed policy masks followed by one store. A modify is one load, pure typed-
field/policy operations, then one store; its single `Modify` record binds the
ordered primitive IDs and prevents any pass from separating, duplicating,
eliminating, or interleaving the pair. Receiver and argument SSA dependencies
preserve their once-only left-to-right evaluation before the first access.

System-register operations use the typed `sysreg.read` and `sysreg.write` IR
forms with stable generated register, encoding, support, and semantic identities.
A declaration read produces its nominal snapshot; raw and policy-aware writes
consume `u64`. The four non-scalar `HardwareAccessIr` kinds and public labels
describe system-register operations; a modify record binds its adjacent read/
write pair around pure field operations. The verifier rejects an unbound tuple,
handwritten encoding, source-assembly payload, direction mismatch, unavailable
target/EL/state predicate, incomplete semantic row, or transfer type other than
`u64`.

Every declared MMIO access and system-register operation carries a full
two-way compiler-memory boundary. A modify's boundary encloses the complete
pair. This ordering metadata is distinct from `barrier.arch`: it creates no
synchronization edge and selects no `dmb`, `dsb`, or `isb`. Lowering and effect
reports derive the public operation-kind and compiler-ordering facts from this
verified IR metadata rather than reconstructing source syntax.

Type erasure replaces a hardware snapshot with its exact backing scalar only
after all `.raw` and field projections have become typed scalar operations. It
preserves access origin, modify grouping, catalog identity, effects, and
ordering through scheduling and instruction selection. Map/scalar MMIO then
selects exactly one width-matched load or store per access; system-register IR
selects exactly one authenticated `mrs` or `msr` per access. No lowering may
introduce a retry, truncation, additional access, raw-encoding escape, or
architectural barrier.

> Later predecessor register-placement, callable-modifier, per-CPU, and TLS
> wording in this appendix belongs to the released v0.8 IR exposition unless
> explicitly updated. Read non-conflicting allocation details through the
> current `in register`, `naked`, `never`, and `per_cpu` contract above.

The Wyst IR is the compiler-internal source of truth between the semantic analyzer and
the ARM64 backend. Every optimization, scheduling decision, and lowering rule
is expressed against this representation. Its design priorities, in order:

1. **Preserve every semantic decision the type system made.** Volatility,
   endianness, address-type stride, bitstruct identity, signed-vs-unsigned —
   all live in the IR until the lowering pass explicitly erases them.
2. **Make reordering legality syntactically obvious.** A pass should be able
   to ask "may I swap these two ops?" by reading the IR, not by recomputing
   provenance.
3. **Stay small.** ~30 op kinds. New language features prefer new attributes
   on existing ops over new ops.
4. **Be deterministic.** Identical source + compiler build identity + target +
   selected scheduling policies → identical IR. No hash-table-iteration-order
   dependencies, no rolling unique IDs that vary across runs (use
   declaration-order IDs).

---

## 1. Pipeline Position

```text
Source
  ↓        parser
AST
  ↓        semantic analysis (type checking, name resolution)
Typed AST
  ↓        effect inference (semantic operation → category, call graph propagation, deny_effects checking)
  ↓        IR construction (SSA, dominators, regions)
SSA IR  ← this document, "high IR"
  ↓        analysis passes (alias, liveness, schedule legality)
  ↓        scheduling pass (reorders only where schedule.standard permits)
Scheduled IR
  ↓        type-erasure / structure-flattening pass
Low IR  ← still this document, "low IR" form
  ↓        register allocation
Allocated IR
  ↓        instruction selection + encoding
  ↓        post-placement verification (asm stack bounds, branch target section legality)
Object Image (see chapter-16-object-format.md)
```

"High IR" and "Low IR" use the same op vocabulary and the same textual form;
the difference is which type information is still attached and which ops are
permitted. The boundary is the **type-erasure pass** (§9).

---

## 2. Type System

The IR uses **Wyst's source-level type system directly**, with two
restrictions that hold from SSA construction onward:

- Aggregate types (`struct`, `[]T` slices, `[N]T` arrays, `bitstruct`,
  `enum`) survive into the IR. They are lowered to scalar ops only by the
  type-erasure pass.
- `@volatile T` and `@mmio T` are **distinct** from `@T` everywhere — no IR op
  accepts them interchangeably. A pass that ignores volatility or MMIO intent
  must reject IR involving those qualifiers.

### 2.1 Scalar Types

| IR type    | Width | Notes                                                                            |
| ---------- | ----- | -------------------------------------------------------------------------------- |
| `u8`–`u64` | 8–64  | Wyst unsigned ints                                                                |
| `i8`–`i64` | 8–64  | Wyst signed ints                                                                  |
| `bool`     | 8     | Memory size 1 byte; AArch64 GP register slot is `xN` with canonical value 0 or 1 |
| `void`     | 0     | Result type of side-effecting ops with no value                                  |

`u128` and `i128` are **not** scalar IR types. 128-bit values come from NEON
loads/stores (`load.v16i8` etc.) and live in vector types.

### 2.2 Address Types

| IR type       | Notes                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------- |
| `@T`          | One-word ordinary Wyst address with exact pointee lens `T`.                                   |
| `@volatile T` | One-word volatile-qualified address. Its loads/stores are observable compiler-ordering events. |
| `@mmio T`     | One-word volatile-qualified address with MMIO intent. Accesses also carry `mmio`; architectural memory type still comes from mapping facts. |

The element lens controls only operations that name element units: array
indexing and `element_offset`. `byte_offset` is already byte-measured and
`field_addr` consumes the declared field byte offset. Plain source `+` and `-`
never reach address IR. Once IR construction produces a byte `gep`, no lower
pass may infer or apply another scale.

### 2.3 Aggregate Types

| IR type                                 | Survives until                                                  |
| --------------------------------------- | --------------------------------------------------------------- |
| `struct { f0: T0, f1: T1, ... }`        | Type-erasure pass                                               |
| `bitstruct Name: Backing { ... }`       | Type-erasure pass; lowered to the backing integer plus typed bit-field extract/insert ops |
| `enum T` with payload variant `P`      | Type-erasure pass; payload-less enums lower as their tag, and payload enums use the fixed two-word representation `{tag_word, payload_word}` |
| `[N]T`                                  | Type-erasure pass; indexed access stays as `gep`                |
| `[]T`                                   | Type-erasure pass; lowered to an address-and-length descriptor    |
| `[T:N]`                                 | Survives end-to-end; mapped to NEON registers in regalloc       |
| `fn(T0 [noescape] [in reg], ...) -> R [in reg] [@cc]` | Survives end-to-end with convention, per-parameter `noescape`/placement, result placement, and `never` in exact identity |

Fixed arrays are inline storage, not pointer-plus-size descriptors. A value of
type `[N]T` has the same source layout as `N` adjacent elements of `T`, with
`size_of([N]T) = N * size_of(T)` and `align_of([N]T) = align_of(T)`. The IR may
use `stack_addr_of` or `addr_of` to form an address to that storage, and
array-to-slice lowering may build a separate descriptor, but the fixed-array
value itself never carries an implicit runtime length field.

Slice values are descriptors with `data` and `len`. Dynamic arrays are
seven-field descriptors matching `wyst.dynamicArrayDescriptor.v0`: `data`,
`len`, `capacity`, `storage_identity`, `growth_policy`, `failure_policy`, and
`movement_policy`. Payload-less enums are tag values; payload enums are fixed
two-word values with tag at word 0 and payload at word 1. Aggregates preserve
their source layout until type erasure so IR, ABI classification, debug info,
and emitted data all agree on field order, size, alignment, and inactive bytes.

Typed data addresses carry an element lens in the IR type (`@T`,
`@volatile T`, or `@mmio T`) until explicit address traversal has been lowered
to byte offsets. Raw addresses are integers or `@u8` byte-lens addresses in
the IR taxonomy: a `u64` integer is not a source address and requires an
explicit `address<T>` boundary, while an `@u8` remains a typed byte address.
Changing a lens requires `relens<T>`. No later offset regains element scaling
automatically.

### 2.4 Type Erasure

After the type-erasure pass:

- All `struct` types are dissolved; field accesses become `gep` + scalar load/store.
- All `bitstruct` types are dissolved; field reads become carrier-typed bit-field extracts and field writes become range-proved bit-field inserts.
- All payload-less `enum` types are dissolved into tag-typed integer values.
- All payload-carrying `enum` types are dissolved into fixed two-word
  `{tag_word, payload_word}` values; `enum_field(tag)` reads word 0 and
  `enum_field(payload)` reads word 1.
- The verifier admits only source-level payload-word types in the payload word:
  `bool`, integer scalars, pointers, function pointers, and bitstructs. Structs,
  slices, floating-point values, and nested enum values must not appear as enum
  payload IR.
- All `[]T` slices are dissolved into address-and-length pairs.
- `[N]T` arrays remain inline aggregate storage until their indexed accesses,
  copies, or address projections are decomposed into `gep`, load/store, and
  chunk-copy operations. They are not descriptor values and do not become
  pointer-plus-size values unless source explicitly forms a slice.
- Address types `@T` collapse to `@u8` (the element lens has done its job).
- Endian-aware load/store ops retain their byte-order attribute until
  lowering picks the required native load/store and byte-swap sequence.

Passes that run after type erasure are **forbidden** from creating any of
the erased types.

---

## 3. Module IR

A compilation unit's IR is a list of typed top-level declarations. The
following textual sketch states the current structural renderer grammar; it is
not source syntax:

```text
module = declaration*

declaration = function | global | layout-symbol | type-declaration

function = visibility attribute* name signature function-body
global = visibility attribute* name type const-expression
layout-symbol = "pub" name "u64" layout-query
type-declaration = visibility name type-form
```

`visibility` is `pub` or absent (private; see [chapter-04-modules.md](chapter-04-modules.md)).
In current v0.9 typed IR, hard facts are separate fields: definition lowering
records `naked`; callable signatures record convention, placements,
`noescape`, and `never`; globals record `GlobalStorage::PerCpu`; declaration
attributes retain only activated catalog entries. The predecessor renderer's
callable modifiers, register placement, storage classes, and ABI markers are
not source spellings or a current open attribute set. No TLS fact is legal in
v0.9 IR.

The current v0.9 layout authority is likewise structural rather than a textual
directive replay. Module IR preserves the selected layout declaration's exact
name and dialect; declaration-ordered region records with origin, size,
`readonly`/`readwrite` access, and operand spans; declaration-ordered section
records with exact ELF name, `code`/`rodata`/`data`/`bss` kind, normalized
region/alignment/`after` constraints, and their operand spans; the semantic
entry identity with its optional fixed-address claim; and declaration-ordered
typed layout symbols. A layout-symbol initializer is an AST-independent typed
placement expression over absolute constants, `start`/`end` address values,
`size` values, explicit address conversion, and the typed operations admitted
by the layout `ConstExpr` grammar. Each operation retains the result integer
type needed to reproduce ordinary `ConstExpr` width wrapping and modulo shift
counts after placement; placement does not create a checked-arithmetic dialect.
No legal named layout symbol disappears from IR merely because its initializer
is not affine. Final artifact preparation
consumes or validates against these typed facts; reparsing the layout syntax is
not an independent semantic authority.

The IR preserves source-file boundaries only for diagnostic / DWARF purposes;
semantic analysis flattens the module-and-import graph into a single global
namespace before IR construction begins. Every IR op carries a diagnostic
source span: file identity, byte range, and line/column mapping key. Passes
that rewrite, move, or lower an op must preserve the source span that best
identifies the originating source construct. These spans survive through
post-placement verification.

---

## 4. Function IR

A function consists of:

- A **signature**: typed parameters, return type, calling convention, attribute set.
- A **CFG**: a finite set of basic blocks with directed control edges.
- A **region tree**: a hierarchical structure that mirrors `schedule source`
  blocks, loops, and structured `if`/`while`/`for` nesting. Every basic block
  belongs to exactly one leaf region.
- A **value table**: SSA values with their defining op, type, and (after
  liveness) a live range.

### 4.1 Basic Blocks

A basic block has:

- A unique block name (`bb0`, `bb1`, …; assigned in IR-construction order).
- Zero or more **phi** instructions at the top (one per SSA value that joins
  here from multiple predecessors).
- A sequence of **ordinary** instructions, none of which are control flow.
- Exactly one **terminator**: `br`, `jmp`, `tail`, `ret`, or `unreachable`.

Every basic block has exactly one entry point (the top) and exactly one
exit (the terminator). No fall-through except via explicit `jmp`.

### 4.2 SSA Discipline

- Every value is defined exactly once.
- Even values whose source bits are indeterminate have an explicit defining
  instruction such as `indeterminate_read`; the IR never represents an
  ordinary SSA value by omitting its definition.
- An ordinary definition is available later in its own block and in blocks it
  dominates. It is not available merely because its numeric value ID or its
  serialization position precedes a use. **Liveness** is computed separately
  and is not part of the IR availability rule.
- Phis are the only mechanism for control-dependent values. A phi is defined
  at the top of its block. Its operands are pairs
  `(predecessor-block, value)`, with exactly one typed operand for every
  reachable incoming CFG edge.
- A phi operand is an edge use, not a use in the phi's block. Its definition
  must be available at the named predecessor's terminator. This permits a
  loop-carried value defined later in serialization order while rejecting a
  value defined only on a sibling path.
- **Dominators** are computed on demand. They are not stored in IR.
- **No critical or parallel incoming edges.** Every predecessor of a block
  with phis has only that block as a successor, and each incoming edge has a
  unique predecessor block. The IR builder inserts deterministic split blocks
  where needed.

#### Predecessor environments

IR construction carries an explicit, immutable **binding environment** on each
reachable CFG edge. The environment maps every source binding live at that
edge to its type and current SSA definition. A successor starts from the
environment recorded for its predecessor; it never observes mutations made
while a sibling successor was lowered.

For a branch, both arms therefore start from the same branch-entry environment.
For a join, the builder considers only predecessors that actually terminate
with an edge to the join and merges every binding that was live at the branch
entry:

- no reachable predecessor means the join is unreachable;
- one reachable predecessor reuses that predecessor's definition;
- multiple predecessors that provide the same definition reuse it; and
- multiple predecessors that provide different definitions create one typed
  phi whose incoming pairs are the exact predecessor set.

A `return`, tail transfer, `goto`, trap-like terminal operation, or
`unreachable` terminator contributes no join edge and no environment. A local
declared inside one arm is absent from the branch-entry environment and does
not escape the arm.

The same rules apply recursively to expression-valued conditionals, inlined
control flow, switches, short-circuit CFG, and nested branches. Loop headers
merge the entry edge with every reachable fallthrough or `continue` backedge.
Loop exits merge the failing-condition edge, when one exists, with every
reachable `break` edge. An indefinite loop without a reachable `break` has no
exit environment. These are the only SSA-construction rules for loop-carried
bindings; new loop forms use this mechanism rather than a separate builder.

#### Explicit defining rules

- Function parameters are the first definitions in the entry block, in exact
  signature order, with matching names and types. The entry block has no
  predecessor.
- Constants, aggregate fields, tuple fields, slice fields, enum fields, casts,
  address calculations, and all other projections are ordinary definitions at
  their recorded instruction positions. They receive no function-wide scope
  exemption.
- Phi definitions precede every ordinary definition in their block. An
  ordinary same-block use must follow its definition.
- A terminator is sequenced after every definition listed in its block. Every
  condition, selector, or return operand must dominate that terminator.
- An unreachable block cannot supply an incoming value to a reachable phi.
  Definitionless ordinary values are invalid even in terminal or unreachable
  regions.

### 4.3 Region Tree

Regions form a tree rooted at the function's body. The standard region
kinds, with semantics that match Wyst surface syntax:

| Region kind          | Built from                                      | Reordering legality across the boundary                                                                    |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `function-body`      | The function itself                             | (the root; no "across" boundary)                                                                           |
| `schedule.source`    | `schedule source { ... }` or a body wrapped by `#[schedule(source)]` | No reordering of source-level semantic operations across the boundary or inside; target lowering may still add required support instructions under Chapter 13. |
| `schedule.standard`  | Implicit ordinary code outside explicit source boundaries | Deterministic pure reordering is permitted within dependency, effect, alias-proof, and memory-model rules. |
| `loop`               | `loop`, `while`, `for`                          | Loop carries dependencies via phis; no reorder across an iteration boundary.                              |
| `if-then`, `if-else` | `if`/`else` branches                            | Branch boundaries are sequence points; no speculative reorder crosses them.                                |
| `inline-asm`         | non-pure `asm { ... }` block                     | Hard reorder barrier in both directions; parsed row effects and memory ranges remain explicit in IR.       |

A pass asking "may I reorder ops A and B?" walks A and B up to the lowest
common ancestor region; if any region on the path forbids the reorder, no.
This is the IR's representation of the §4 (Scheduling Semantics) +
§9 (Memory Model) ordering rules — the IR makes them syntactically
checkable.

Regions are emitted at IR construction time and **preserved unchanged**
through every pass until the type-erasure pass. A `schedule.source` boundary
survives mandatory inline expansion and may collapse only when it is empty and
therefore no longer load-bearing.

---

## 5. SSA Values

Every value has:

- A type (§2).
- A defining instruction.
- A symbolic name in textual IR: `%v0`, `%v1`, ... assigned in declaration
  order within a function. Names are stable across passes (a pass that
  deletes `%v3` does **not** renumber later values).

### 5.1 Constants

Constants are **inline literals**, not SSA values, unless their use requires
a register. The textual form distinguishes:

```text
%r = add u32 %a, 1            ; immediate
%r = add u32 %a, %b           ; SSA value
```

A large constant (over 16 bits, exceeding `mov`/`movk` synthesis budget) is
materialized as a separate `const` op:

```text
%c = const u64 0xFFFF_0000_DEAD_BEEF
%r = add u64 %a, %c
```

This makes the cost of materializing a constant visible in the IR.

---

## 6. Op Vocabulary

The IR has **32 op kinds**, grouped below. Each op section lists:

- **Signature** — input types, output type.
- **Semantics** — what it computes.
- **Effects** — what memory or machine state it touches.
- **Legality** — when it may appear in IR.
- **Lowering** — the canonical ARM64 emission. (Lowering is normative
  only at the type-erasure boundary; passes above that boundary need not
  agree.)

### 6.1 Arithmetic and Logical

All binary op operands are produced in source evaluation order before the op is
created: left operand first, then right operand. A pass may reorder pure
producer ops only when the move is legal under Chapter 9 and Chapter 13.

#### `add` / `sub` / `mul`

- **Signature:** `(T, T) -> T` where `T` is integer (signed or unsigned, any width).
- **Semantics:** two's-complement arithmetic. **Wraps on overflow** (matches Wyst's "no compiler-exploitable UB" rule in `chapter-01-language-design.md`).
- **Effects:** none.
- **Legality:** any T from §2.1 that's integer. Bitfield and bool rejected.
- **Lowering:** `add` / `sub` / `mul` (or `madd`/`msub` when the pattern matches).

#### `udiv` / `sdiv` / `umod` / `smod`

- **Signature:** `(T, T) -> T`.
- **Semantics:** integer division follows the operator rules in
  [chapter-07-operators.md](chapter-07-operators.md).
  Division by zero produces `0`; modulo by zero produces the dividend. The
  compiler does not insert `exception.brk`. A lowering for floored remainder must
  preserve the specified modulo-by-zero result, but may do so through any
  target sequence proven to produce the dividend when the divisor is zero.
- **Effects:** none.
- **Lowering:** `udiv`/`sdiv` + `msub` for the truncated remainder; signed
  floored remainder adds the sign-adjustment sequence.

#### `and` / `or` / `xor`

- **Signature:** `(T, T) -> T` for integer T.
- **Semantics:** bitwise. The result preserves the input type.
- **Lowering:** `and`/`orr`/`eor`.

#### `shl` / `lshr` / `ashr`

- **Signature:** `(T, U) -> T`, where `T` is an integer type and `U` is an
  unsigned integer shift-count type.
- **Semantics:** shift count is reduced modulo `max(32, width(T))` before
  shifting. The result preserves `T`.
- **Lowering:** `lsl`/`lsr`/`asr`; use the 32-bit instruction form for scalar
  `T` widths up to 32 bits and the 64-bit instruction form for scalar `u64` and
  `i64`. No hidden range check or synthetic narrow-count mask is inserted.

#### `cmp`

- **Signature:** `(T, T) -> bool` where T is integer or data address for all
  comparison ops, or function-pointer for `eq` and `ne` only. Source-level
  function pointer comparisons against untyped integer `0` lower as comparison
  against a function-pointer-typed zero constant.
- **Attribute:** `op : { eq, ne, ult, ule, ugt, uge, slt, sle, sgt, sge }`.
- **Semantics:** integer comparison, unsigned ordered data-address comparison,
  and equality-only function-pointer comparison. Source-level ordered function
  pointer checks lower through explicit `address<u64>(...)` conversions before comparison.
  Mixed-sign and mixed-width are forbidden (Phase 0.4 rules).
- **Lowering:** `cmp` + `cset`/`csel`.

### 6.2 Memory

#### `load`

- **Signature:** `(@T) -> T`.
- **Attributes:** `volatile : bool`, `mmio : bool`,
  `order : { plain, acquire, seq_cst }`, `required_align : u32`,
  `target_unaligned : { permitted, disallowed }`, and
  `possible_architectural_fault : bool`.
- **Semantics:** loads `T` from the address. Volatile and ordered loads must not be elided, duplicated, or reordered (see [chapter-09-memory-model.md](chapter-09-memory-model.md)).
- **Effects:** reads memory. `volatile=true` introduces `volatile_access`;
  `mmio=true` also introduces `mmio`. With `volatile=true` or
  `order != plain`, the operation also acts as the specified compiler reorder
  boundary.
- **Lowering:** scalar `ldr`/`ldrb`/`ldrh` family for scalar values;
  deterministic scalar chunks for aggregate values per
  [chapter-09-memory-model.md §9.6](chapter-09-memory-model.md); `ldar`/`ldaxr`
  for acquire/seq_cst.

#### `store`

- **Signature:** `(@T, T) -> void`.
- **Attributes:** the same qualifier, alignment, target-unaligned, and possible-
  fault facts as `load`, plus `order : { plain, release, seq_cst }`.
- **Operand production order:** source assignment lowering produces the address
  operand before the stored value operand, then emits the store.
- **Lowering:** scalar `str`/`strb`/`strh` family for scalar values;
  deterministic scalar chunks for aggregate values per
  [chapter-09-memory-model.md §9.6](chapter-09-memory-model.md); `stlr`/`stlxr`
  for release/seq_cst.

#### `endian_load`

- **Signature:** `(@u8) -> T`, including volatile/MMIO-qualified byte receivers,
  where `T` is exactly `u16`, `i16`, `u32`, `i32`, `u64`, or `i64`.
- **Attributes:** `endian : { big, little }` and the qualifier, alignment,
  target-unaligned, and possible-fault facts from `load`.
- **Semantics:** loads 16-, 32-, or 64-bit integer bytes from the address and
  produces an ordinary target-order integer value. It is one memory event.
- **Lowering:** native `ldr`/`ldrh` plus `rev`/`rev16` as needed.

#### `endian_store`

- **Signature:** `(@u8, T) -> void`, including volatile/MMIO-qualified byte
  receivers and the same exact closed `T` set as `endian_load`.
- **Attributes:** `endian : { big, little }` and the qualifier, alignment,
  target-unaligned, and possible-fault facts from `store`.
- **Semantics:** stores a host-order integer value using the requested byte
  order as one memory event.
- **Lowering:** `rev`/`rev16` as needed before native `str`/`strh`.

Neither endian op admits a raw integer or non-byte address operand. Lowering
must not synthesize bytewise fallback, temporary storage, an adjusted address,
or an alignment check.

#### `indeterminate_read`

- **Signature:** `(storage : T) -> T`.
- **Source spelling:** `storage.read_uninit()` where `storage` is
  `MaybeUninit<T>`.
- **Semantics:** observes the current bits of explicit raw local storage as an
  ordinary `T` value. The result is unspecified by Wyst but is not poison,
  `undef`, or a missing SSA definition.
- **Legality:** only generated for explicit raw-storage reads; ordinary local
  reads before initialization are source diagnostics and must not reach IR as
  definitionless SSA values.
- **Lowering:** copy or load the storage home into a normal result home using
  the same storage class and type-erased representation as `T`.

### 6.3 Atomic RMW (released v0.8 IR snapshot)

This subsection preserves the predecessor IR spelling for historical context.
The current typed `atomic<T>`/`@atomic<T>` contract and generated operation
matrix are defined in the v0.9 section above; source tools do not expose these
old forms.

#### `atomic.cas`

- **Signature:** `(@T, T, T) -> (T, bool)` — (prior, ok).
- **Attribute:** `order : { relaxed, acquire, release, acqrel, seq_cst }`.
- **Lowering:** `cas{,a,l,al}` on LSE targets; `ldxr`/`stxr` loop otherwise (per `#target features = (lse)`). The non-LSE loop retries store-exclusive failure until the compare-and-swap operation completes; it has no retry budget or hidden fallback result.

#### `atomic.rmw`

- **Signature:** `(@T, T) -> T` (returns prior value).
- **Attribute:** `op : { add, or, and, xor, xchg, bit_set, bit_clear }`, `order : same as cas`.
- **Lowering:** `ldadd`/`ldset`/`ldclr`/`ldeor`/`swp` (LSE); `ldxr`+arith+`stxr` loop otherwise. The non-LSE loop retries store-exclusive failure until the update store succeeds; it does not lower through a bounded internal retry count, fallback lock, or runtime helper.

#### `atomic.load` / `atomic.store`

- Like `load`/`store` but `order` is restricted to `{ relaxed, seq_cst }` (acquire/release continue to use the `#acquire`/`#release` directives, which lower to `load`/`store` with `order=acquire`/`release` — see §1.3.2).

### 6.4 Control Flow

#### `br`

- **Signature:** `(bool) -> noreturn`.
- **Operands:** condition, true-target block, false-target block.
- **Terminator-only.**

#### `jmp`

- **Signature:** `() -> noreturn`.
- **Operand:** target block.
- **Terminator-only.**

#### `call`

- **Signature:** `(fn(T0, T1, ...) -> R, T0, T1, ...) -> R`.
- **Attributes:** `cc : { wyst, aapcs }`, `tail : bool`.
- **Operand production order:** indirect calls produce the callee expression
  first, then call arguments left-to-right. Direct calls produce arguments
  left-to-right before the call op.
- **Suspension:** when the exact or conservative callable bound contains
  `execution_suspension`, exactly one `strand_suspension_boundary` follows the
  final argument and immediately precedes this op.
- **Effects:** AAPCS or Wyst-native register clobber per `cc`; full compiler memory fence unless attribute `pure : bool = true` (rare; only for pure-function intrinsics).

#### `strand_suspension_boundary`

- **Signature:** `() -> void`.
- **Associated authority:** the boundary origin identifies its call shape or
  provider marker. The immediately adjacent call signature or authenticated
  module marker fact supplies source/transfer identity, callable-bound
  provenance, and provider identity; verification rejects a boundary that
  cannot join to that exact authority.
- **Ordering:** a two-way dependency for observable memory, volatile/MMIO/
  atomic operations, effects, calls, and current-context/current-instance base
  acquisitions. It invalidates cached current-context and `per_cpu` bases but
  is not a compiler-memory or architecture barrier.
- **Liveness:** rejects live current-core or affine handles and addresses
  derived from them; ordinary copied values plus authenticated task-stable and
  cross-strand-stable values are legal.
- **Lowering:** zero instructions, calls, symbols, relocations, stack maps, or
  runtime hooks. It remains a typed scheduling and verification operation until
  all ordering and liveness consumers have run.

#### `tail`

- **Like `call` but terminator-only, and reuses the caller's frame.** Used for `goto` to a `label` symbol (intra- or inter-module).

#### `ret`

- **Signature:** `(R) -> noreturn` where R is the function return type, or `() -> noreturn` for void.
- **Terminator-only.**

#### `unreachable`

- **Terminator-only.** Generated for code following `exception.eret`, a direct `never`
  call, or another operation the verifier proves cannot return;
  also used for switch arms the verifier can prove dead.

### 6.5 Addressing

#### `addr_of`

- **Signature:** `() -> @T`.
- **Operand:** addressable symbol reference (function name, label name, or
  ordinary global name). A `per_cpu` declaration is not addressable and is
  rejected here. Layout-only `start("NAME")` and `end("NAME")` queries resolve
  into their owning typed layout-symbol values rather than being accepted as
  ordinary `addr_of` operands; source consumes a published `@u8` layout symbol
  as that address value directly.
- **Semantics:** materializes the address of a relocatable symbol as a typed
  address value. It is one relocation-producing origin; it is not the only one
  in the compiler. Direct calls, symbol branches, constant address
  initializers, non-addressable `per_cpu` access records, veneers, jump-table entries,
  and address-bearing instruction operands are represented separately.
- **Lowering:** `adrp` + `add` page pair (or `adrp` + `ldr` when stored into data).

#### `stack_addr_of`

- **Signature:** `(local-storage T) -> @T`.
- **Semantics:** materializes the exact runtime address of an addressable local
  without a load or store. The result is non-escaping.
- **Resource:** marks the local addressable and may force a frame home; a hard
  register placement is incompatible and rejected.
- **Lowering:** one stack-relative address materialization after final frame
  layout. It never creates a symbol relocation.

#### `gep`

- **Signature:** `(@T, u64) -> @T`; the offset is the canonical modulo-`2^64`
  byte representation derived from the source count.
- **Semantics:** byte-offset addressing in IR. Source `byte_offset` reaches the
  op unchanged; `element_offset` and array indexing are scaled exactly once;
  `field_addr` and struct member access use the declared field byte offset.
  Source unit/origin metadata records which derivation occurred and the
  verifier rejects a second scale.
- **Lowering:** `add` with immediate or `add xN, xM, xK, lsl #s`.

#### Relocation-Producing Origins

Relocation-producing origins are explicit in IR or in the lowering artifact
records that consume IR. The current compiler recognizes these origins:

The released v0.8 umbrella term **per-instance object references** survives in
some internal/test vocabulary. For v0.9 it denotes only the non-addressable
`per_cpu` access and offset records below; it does not include TLS or authorize
general current-instance addresses.

| Origin | IR or lowering representation | Emitted artifact consequence |
| --- | --- | --- |
| direct calls | `call` with a `SymbolId` callee, recorded as a direct call patch during ARM64 lowering | `CALL26` when in range, or a deterministic veneer whose body uses an address-materialization relocation |
| symbol branches | `tail` / `goto` to a label or function symbol, recorded as a direct branch patch | `JUMP26` when in range, or a deterministic veneer whose body uses an address-materialization relocation; a fixed target-owned vector-table chunk instead rejects an out-of-range branch because it has no veneer extent |
| address materialization | `addr_of`, string address materialization, and symbol-base materialization for constant-address `gep` | `ADR_PG_HI21` + `ADD_LO12` page-pair relocation, with byte addends folded only for constant offsets |
| constant address initializers | `ConstIr::Address` and slice/string/data descriptors containing an address constant | `ABS64` data slot patched during final image write-out |
| `per_cpu` object references | a non-addressable direct-access record and `#percpu_offset_of` constant keyed by `GlobalStorage::PerCpu` identity | compiler-owned `.percpu` offset patching; direct access expands only after target realization validation and no TLS relocation exists |
| jump tables | future explicit jump-table records, if a lowering mode emits tables | table entries are relocation origins; current `switch-dispatch` mode does not emit jump tables |
| address-bearing inline assembly operands | checked `asm` `symbol` parameters and typed address operands | retain the typed fixup or address materialization record on the exact parsed instruction |

Passes must not infer relocation provenance from arbitrary integer values or
from later uses of a bound address local. A relocation origin is carried by the
IR node or lowering patch that names the symbol, object, string, section, or
future jump-table entry.

### 6.6 Casts and Construction

#### `cast`

- **Signature:** `(S) -> T`.
- **Attribute:** `kind : { widen, truncate, signcast, numeric, bitcast,
  address, relens, qualify, floatcast, saturate }`, plus the authenticated
  trust bit used by `trusted_callable<T>(address)` construction and by the exact
  `address<@atomic<T>>(raw)` raw atomic-address assertion. For the latter, the
  bit authenticates the source trust boundary; the verifier additionally
  requires `u64 -> @atomic<T>`, rejects provable misalignment and known Device
  memory, and rejects every relens, qualifier, reverse-exposure, or
  atomic-containing aggregate cast.
- **Semantics:** each kind is a distinct named source conversion; the verifier
  checks that `(S, T)` matches Chapter 6's closed row. `saturate` clamps a
  same-signedness integer narrowing. The verifier never infers or changes the
  kind from the endpoint types.
- **Lowering:** zero-cost for representation-preserving cases; target extend or
  mask instructions for `widen` and `truncate`; comparisons plus branchless
  selects for `saturate`; and the selected target conversion
  instruction for `floatcast`. Named conversion lowering performs no memory
  access or allocation.

#### `truncate_bits`

- **Signature:** `(integer T, width: u8) -> T`.
- **Semantics:** the width is the source-validated compile-time constant in
  `1..=bit_width(T)`. The node clears every representation bit above that width
  and preserves the declared carrier type. The verifier rejects a changed
  carrier, zero width, or a width above the carrier.
- **Lowering:** identity for the full carrier width; otherwise one target mask
  or bit-extract instruction, with no branch, trap, or memory access.

#### `select`

- **Signature:** `(bool, T, T) -> T`.
- **Semantics:** operands are produced in source order: condition, true arm,
  false arm. Both arms are evaluated unconditionally before the `select`, and
  effectful arm producers retain that order.
- **Lowering:** `csel`.

#### `const`

- **Signature:** `() -> T`.
- **Attribute:** the literal value.
- **Used for** constants too large to inline in an op operand.

#### `phi`

- **Signature:** `(T, T, ..., T) -> T` — one operand per CFG predecessor.
- **Top-of-block-only.**

#### `aggregate`

- **Signature:** `(T0, T1, ...) -> S` where `S` is a struct, slice, or enum variant.
- **Semantics:** constructs an aggregate from its parts. Used pre-type-erasure.
  Aggregate part producers run in source order. Struct aggregate fields are
  stored in declaration order after their initializer expressions have been
  evaluated in written source order.
- **Lowering:** decomposed by type erasure; no direct ARM64 lowering.

#### `extract`

- **Signature:** `(S) -> Ti` where Ti is one field of aggregate S.
- **Attribute:** field index.
- **Lowering:** decomposed by type erasure.

### 6.7 Inline Assembly and Barriers

#### `asm.block`

- **Signature:** typed ordinary/immediate/symbol inputs plus fresh or tied value
  results; scratch and asm-only resources remain internal to the block.
- **Attributes:** parsed instruction/encoding identities, local CFG, semantic
  binders and views, typed fixups, fixed placements, optional alignment and
  stack clause, and declared, mechanically verified `pure` eligibility (per
  §2.9).
- **Effects:** the exact union of generated instruction-row memory, register,
  architectural-state, control-flow, fault, and language-effect records. A
  non-pure block is additionally a full two-way compiler fence; a verified
  pure block is an ordinary deterministic `effects(none)` computation.
- **Lowering:** after permitted whole-block optimization, one final 32-bit word
  per written instruction in the same order and identity, plus only declared
  alignment padding. Semantic binders occupy catalog-authorized operand fields
  directly; no template text, interpolation, constraint string, or manual
  clobber survives in IR.

#### `barrier.compiler`

- **Signature:** `() -> void`.
- **Effects:** reorder barrier in IR only. Emits no instruction.
- **Source spelling:** `barrier.compiler()` through an imported
  `core.arch.barrier` category binding.
- **Use:** sequence point insertion by source or passes that need to constrain reordering without an architectural fence.

#### `barrier.arch`

- **Signature:** `() -> void`.
- **Attribute:** `kind : { dmb, dsb, isb }`; `dmb` and `dsb` carry one of the
  ARM64 domains `sy`, `st`, `ld`, `ish`, `ishst`, `ishld`, `osh`, `oshst`,
  `oshld`, `nsh`, `nshst`, or `nshld`.
- **Effects:** architectural barrier plus full two-way compiler memory fence.
- **Lowering:** the named instruction.

### 6.8 Semantic Operation IR

#### `intrinsic`

- **Signature:** `(T0, T1, ...) -> R` where `R` is `void` or a single type.
- **Attributes:** `name : enum`, plus name-specific attributes (immediate ranges, EL gating, fence kind, clobber set).
- **Semantics:** opaque to passes that do not recognize the stable identity.
  Recognizing passes consume its catalog-derived attributes; for example,
  `core.arch.cache.data.clean_to_poc` carries the exact generated target and
  ordering facts selected by its semantic-operation row.

Wyst v0.9 source has no prefix-`%` operation namespace. Typed IR retains an
internal operation node only after semantic analysis has attached the stable
identity, surface, target plan, source privilege, compiler ordering, report
identity, and exact generated target facts from
`semantic-operation-catalog.tsv`. Category aliases never enter that identity.
Source privilege is the catalog's deliberate language-level restriction; it
is preserved separately from the per-target privilege facts joined from the
generated machine authority.

| Group | Source family |
| --- | --- |
| Atomics | generated `atomic<T>` / `@atomic<T>` methods |
| System register | declared `system_register` `.read()`, `.write(...)`, and `.modify(...)`; `cpu.mask`/`cpu.unmask` |
| Trap/return | imported `exception.svc/hvc/smc/brk/hlt/eret` |
| Cache/TLB | imported `cache.*` and `tlb.*` categories |
| CPU | imported `cpu.*` category, including the fixed counter-source descriptor |
| Barrier | imported `barrier.*` category |
| Environment | imported executable-environment services such as `semihost.call` |
| Execution | authenticated provider-only `core.execution.suspension_point` |
| Language | `fma`, vector operations, enum `.tag`, address methods, and `MaybeUninit<T>` operations |

Each semantic operation carries catalog identity and a generated target-fact
set. The latter preserves every selected encoding, authority and semantic ID,
features, execution state, privilege, register and memory contract, effects,
and faults. Counter reads additionally preserve the selected artifact-target
profile, exact source-descriptor identity and compatibility profile, source,
read plan, width, frequency-acquisition classification, minimum EL, enablement,
failure, source-report identity, and origin. These are generic read-operation
facts only; typed IR does not invent a per-run counter domain/configuration
epoch, realized frequency, endpoint comparability/offset, serialization,
platform-state progress, mutable-control exclusion, or maximum interval span.
The module owns the artifact-target selection independently of the operation
record. IR verification and backend admission rederive the record from that
module selection, so an absent, moved, unknown, duplicate, multiple, or stale
descriptor/profile binding fails closed.

| Attribute  | Values                                                  |
| ---------- | ------------------------------------------------------- |
| `fence`    | `none` / `compiler` / `mem(domain)` / `full`            |
| `clobbers` | bitset over `{x0..x30, v0..v31, nzcv, memory}`          |
| `traps`    | `bool` — may not return                                 |
| `el_min`   | `0 / 1 / 2 / 3` — minimum exception level               |
| `commutes` | `bool` — pure, no side effects, may be reordered freely |
| `effect`   | set of effect categories (see below)                    |

The `effect` attribute carries the set of effect categories this
operation introduces. Effect categories are a closed enum used by the
`deny_effects` system (see [chapter-01-language-design.md](chapter-01-language-design.md) Effect
System) to enforce architectural boundaries at compile time:

| Effect category     | Introduced by                                                                 |
| ------------------- | ----------------------------------------------------------------------------- |
| `sysreg`            | authenticated system-register operations, `cpu.mask`, `cpu.unmask`, `cache.data.zero_block_size` |
| `trap`              | `exception.svc/hvc/smc/brk/hlt` and `semihost.call`                          |
| `exception_return`  | `exception.eret`                                                              |
| `cache_maintenance` | `cache.data` maintenance members other than `zero_block_size`, plus `cache.instruction.*` |
| `tlb_maintenance`   | `tlb.*`                                                                       |
| `atomic`            | typed `atomic<T>` / `@atomic<T>` method operations from the generated atomic matrix |
| `cpu_event`         | `cpu.sev`, `cpu.sevl`, `cpu.wfe`                                             |
| `cpu_halt`          | `cpu.wfi`, `cpu.wfe`                                                         |
| `interrupt_mask`    | `cpu.mask`, `cpu.unmask`                                                     |
| `volatile_access`   | any load/store through `@volatile T` or `@mmio T`, and each declared MMIO read/write event |
| `mmio`              | any load/store through `@mmio T`, and each declared MMIO read/write event |
| `barrier`           | `barrier.compiler`, `barrier.dsb`, `barrier.dmb`, `barrier.isb`              |
| `fp_state`          | FP arithmetic/comparison/conversion ops and FP/SIMD primitives                |
| `perf_counter`      | `cpu.read_counter`                                                           |
| `execution_suspension` | `core.execution.suspension_point` and exact or conservative callable bounds that may cease and later resume the calling strand |

Some semantic operations introduce multiple effects: `cpu.mask` introduces
both `sysreg` and `interrupt_mask`. The categories are deliberately coarse —
they represent architectural boundaries (privilege level, memory type,
synchronization domain), not individual instruction distinctions.
`cache.prefetch` is a reorderable preserved hint and introduces no
cache-maintenance effect.

Generated resources such as local stack slots, frame bytes, spill and reload
counts, register-class pressure, veneers, code size, and caller-owned aggregate
copies are not IR effect categories. They are backend facts checked and reported
by ABI, lowering, object, and generated-manifest surfaces after lowering.

Effects propagate through the call graph automatically during semantic
analysis (see [chapter-01-language-design.md](chapter-01-language-design.md) Effect System).
The `effect` attribute on intrinsic ops is the leaf source; the compiler
computes the transitive closure for every function.

Passes consult these attributes; the front-end is the only thing that
populates them.

---

### 6.9 Typed-IR Dependency Shape

`typed_ir_dependency_shape(function)` is a read-only structural query for
compiler inspection reports. It operates on the verified typed IR and does not
modify the IR, select an instruction schedule, or influence code generation.
The result contains:

- one node per typed SSA value, including its stable value identity, operation,
  type, containing basic block, and source span;
- directed operand edges from each defining value to each user, with the
  operand index;
- basic-block membership and directed control-flow edges;
- strongly connected components of the operand graph and the control-flow
  graph, with an explicit `cyclic` fact; and
- unweighted graph counts such as node, operand-edge, block, CFG-edge,
  component, cyclic-component, and loop-component counts.

A control-flow component is a loop component exactly when it contains more than
one block or a block with a self-edge. Operand components use the same
structural definition of cyclicity. Component identities and member order are
deterministic for the same typed IR.

The query has typed-IR structural authority only. It does not expose a
`critical_path`, latency, throughput, cycle, cache-state, store-issue, or other
machine-cost claim. Calls, memory operations, atomics, barriers, assembly,
phis, and loops remain ordinary structural nodes and edges; no weight is
assigned to them. Backend-only work such as spills, ABI copies, and
multi-instruction expansions may be identified by the lowering report but is
not retroactively inserted into this typed-IR graph.

---

## 7. Function and Module Verifier Invariants

Every IR must satisfy these conditions. The verifier runs after IR
construction, after every pass that mutates IR, and before ABI or machine
lowering may consume the function.

1. **Single-definition and placement**: every `%vN` has exactly one defining
   instruction, is listed exactly once in the block named by that definition,
   and has one stable position in that block.
2. **Structural dominance**: every ordinary use and terminator use of `%vN` is
   dominated by `%vN`'s definition. Same-block ordinary uses occur strictly
   after the definition; numeric value-ID order is not evidence of dominance.
3. **Type agreement**: every op's operand types match its signature.
4. **No critical or parallel phi edges**: no block with a phi has a
   predecessor with multiple successors or two incoming edges represented by
   the same predecessor identity.
5. **One terminator per block**.
6. **Phi edge agreement**: every phi is at the top of its block and has exactly
   one operand for each reachable CFG predecessor, with no missing, duplicate,
   unknown, non-predecessor, or unreachable incoming block. Each incoming type
   equals the result type, and its definition dominates the named
   predecessor's terminator.
7. **Region containment**: every basic block belongs to exactly one leaf region; nested regions form a tree.
8. **Entry, reachability, and terminal structure**: the entry block has no
   predecessor and begins with one exact definition per signature parameter.
   Every block is reachable from entry or explicitly terminal-unreachable; an
   unreachable block cannot contribute an edge operand to reachable code.
9. **Address qualifier flow**: an op of type `@volatile T` or `@mmio T` may
   only be consumed by a qualifier-matching memory op, `cast { kind: relens }`,
   `cast { kind: qualify }`, or `gep`. Removing `@volatile` or `@mmio` requires
   `qualify<T>` provenance. Conversion alone never introduces a volatile or
   MMIO access effect.
10. **Complete callable identity agreement**: a `call %f, ...` must match the
    callee's convention, ordered parameter/result types, per-parameter
    `noescape` bits and placements, scalar result placement, and `never` result
    exactly. Declaration parameter names do not participate.
11. **Intrinsic effect respect**: a pass that reorders any op past an `intrinsic` op without consulting the intrinsic's effect attributes is a verifier-detected bug.
12. **Volatile store preservation**: no pass may elide, duplicate, or reorder a `store` with `volatile=true` relative to any other `volatile=true` load or store. Volatile stores are never dead-store eliminated, even if a subsequent volatile store writes the same address. This invariant is verified structurally: within any basic block, the relative order of volatile ops in IR must match the order after every pass.
13. **Atomic ordering legality**: a `load` with `order=acquire` must not appear after any op it guards in the same basic block (i.e. no op that was below the acquire-load before a pass may appear above it after the pass). Symmetrically, a `store` with `order=release` must not appear before any op it publishes. The verifier checks this by recording pre-pass op ordering for acquire/release ops and comparing against post-pass ordering within the same block.
14. **Target-structural vector and trap-frame agreement**: a `vector_table` IR
    declaration retains its authenticated target selector and exactly the
    profile's canonical slot identities in source order. Every slot has one
    terminal body and retains source, target-row, instruction, edge, and
    padding provenance. Missing, extra, duplicate, reordered, falling-through,
    or profile-incompatible slots are verifier errors; the current AArch64
    profile's 128-byte budget and fixed offsets are rechecked after instruction
    selection. A nominal `trap_frame` type retains its authenticated profile,
    exact field layout, extent, and alignment. Its establishing/restoring label
    contract and first checked-assembly stack transition must name the same
    frame/profile and exact canonical target sequence; a forged direction,
    execution level, system register, instruction identity, state transition,
    or terminal edge is a verifier error.
15. **Placement–calling-convention consistency**: every
    `in register` requirement from `language.callable-storage-contracts` must
    name a register legal for its value class and width and
    not reserved by the calling convention or target. Exact parameter/result
    maps remain in callable identity; local maps remain allocation constraints.
    `naked` does not relax target-reserved state.
16. **Effect deny satisfaction**: when a function, label, or module carries a `#[deny_effects(...)]` attribute (see [chapter-01-language-design.md](chapter-01-language-design.md) Effect System), each affected body's inferred transitive effect set must not intersect the denied set. A violation is a **user diagnostic** (not an internal error) citing the denied effect, the semantic operation or callee that introduced it, and the full call chain.
17. **Branch target section legality**: a `jmp`, `br`, or `tail` op whose target resolves to a symbol in a section without the executable attribute (`SHF_EXECINSTR`) is a **user diagnostic**. The verifier checks this after symbol placement, when section attributes are known, and reports the diagnostic at the preserved source span of the control-flow op. See §7.1.
18. **Integer constant range**: a `const` of integer type `T` must be canonical
    for `T` — an unsigned value in `[0, 2^bits)` and a signed value sign-extended
    into `[-2^(bits-1), 2^(bits-1))`. `truncate<T>` and
    `truncate_bits(value, width)` fold constant operands into that canonical
    representation. An out-of-range integer constant reaching the verifier is
    an internal compiler error rather than a value the backend must
    defensively truncate.
19. **Direct-only `per_cpu` access**: each access record names one
    `GlobalStorage::PerCpu` declaration, one checked subobject offset, one
    source-requested typed operation, one source origin, and the validated
    target realization. Any address escape, aggregate copy, missing or reused
    base acquisition, or unrelated second memory operation is invalid IR. The
    one exception is a bitstruct-field write: its one address may feed exactly
    one backing-word `Load` and the matching `Store` only when the loaded value
    flows through one `BitfieldInsert` into that store and nowhere else. This
    is one logical source RMW, not reusable address provenance.
20. **No v0.9 TLS**: no TLS storage kind, offset constant, current-instance
    operation, symbol, or relocation may occur in a v0.9 module.
21. **Naked resource prohibition**: a `naked` definition contains no
    compiler-owned frame, prologue/epilogue, spill/reload, callee-save,
    argument home, or synthesized return resource.
22. **Address-unit finality**: every source-derived `gep` carries one byte,
    element, field, or index derivation and one final byte offset. A typed-
    address arithmetic origin or a second element scale is invalid IR.
23. **Memory alignment facts**: every 16-, 32-, or 64-bit scalar load/store
    carries required alignment and the selected AArch64 unaligned-access fact.
    MMIO uses natural alignment; a dynamic MMIO address carries
    `possible_architectural_fault=true`. That flag never licenses dead-code or
    impossible-state reasoning.
24. **Endian operation exactness**: an endian op has a byte-lensed typed address,
    one closed integer width, one explicit byte order, and one memory event.
    Bytewise expansions are invalid before target instruction selection.
25. **Slice construction exactness**: a range or raw-address slice produces one
    descriptor after one left-to-right evaluation of its written operands and
    contains no hidden access, allocation, copy, or bounds-check op.
26. **Typed bit-field agreement**: each bitstruct field operation names one
    normalized declaration field whose owner, backing type, carrier type, low
    bit, and encoded width agree with the IR operands and result. A field read
    returns the declared carrier. A field insertion is valid only when its
    value is representation-wide enough and is either intrinsically within the
    field width, a constant or exhaustive enum encoding proved in range, or the
    result of `truncate_bits` with that exact width. The verifier rejects a
    field insertion that would rely on target instruction truncation.
27. **Bitstruct construction and raw boundary**: aggregate construction starts
    from a zero value of the exact backing type, evaluates every named field
    initializer once in written order, and inserts each complete unique field.
    A raw cast is valid only between a bitstruct and its exact declared backing
    type and preserves all backing bits, including unnamed bits.
28. **Checked-assembly result validity and nominal authentication**: each fresh
    or tied checked-assembly result consumes the canonical IR type-validity
    metadata and is admitted only when every representation bit pattern is a
    valid value. A nominal bitstruct's embedded name and backing must exactly
    match the module's normalized bitstruct layout before its all-bit-pattern
    validity or natural GPR view is used. The verifier rejects constrained
    `bool`, enum, address/provenance, and callable result types and rejects a
    fabricated or mismatched nominal backing even when it has the same size.
29. **Checked-assembly metadata closure**: every `asm` value in a v0.9 module
    carries a complete checked semantic signature; `checked: none` is confined
    to explicitly versioned pre-v0.9 compatibility IR. Each retained direct
    call carries its full ABI/resource contract and a sema-sealed local-CFG
    reachability bit. The verifier reconstructs the typed CFG and rejects any
    disagreement before naked-stack or backend link-register safety consumes
    that bit; unreachable call rows keep their emitted instruction and exact
    resources.
30. **Hardware snapshot nominality**: each snapshot value names one normalized
    map-register or system-register declaration and has that declaration's exact
    backing. Only its read-only raw projection and normalized readable fields
    may extract it; equal width does not authorize substitution, construction,
    or a raw write operand.
31. **Hardware access-record closure**: each declared access has exactly one
    `HardwareAccessIr` record with one of the five closed kinds, complete object
    identity, the nominal snapshot identity or scalar-MMIO `none`, exact ordered
    primitive IDs,
    `full_compiler_fence=true`, and
    `emitted_architecture_barrier=false`. Snapshot read, raw write, and named
    scalar read, snapshot read, raw write, and named write each bind exactly one
    primitive access. Modify binds exactly one read followed by one write with
    only pure policy/field operations between them.
32. **Authenticated system-register identity**: each declaration-backed
    `sysreg.read` or `sysreg.write` names an active generated catalog row and
    complete semantic record available to the selected target and execution
    state. A free encoded tuple, unknown extension identity, incomplete facts,
    non-`u64` transfer, direction mismatch, or constructed assembly text is
    invalid IR.
33. **Suspension-boundary exactness**: every direct, indirect, imported Wyst,
    or foreign call whose exact or conservative bound contains
    `execution_suspension` has exactly one `strand_suspension_boundary` after
    its last evaluated operand and immediately before transfer. A call whose
    bound excludes the effect has none. Inlining, devirtualization, tail-call
    formation, interface/object/archive round trips, and final linking may not
    drop, duplicate, separate, or move the boundary after its transfer. The v2
    callable sidecar's bound and authority must exactly match the canonical
    signature and module authority map; known indirect targets must join to the
    retained call-site bound before this invariant is evaluated.
34. **Suspension ordering and base invalidation**: no observable memory,
    volatile/MMIO/atomic operation, effect, call, or current-context/current-
    instance base acquisition crosses a boundary in either direction. Every
    cached current-context and `per_cpu` fact is dead at the boundary and a
    later access reacquires it. A live current-core/affine handle or derived
    address is invalid; an ordinary copied non-address value is not.
35. **Context-stability closure**: compiler-owned and authenticated interface
    origins carry exactly one closed stability value. Every assignment,
    argument/result, alias, projection, aggregate/enum payload, generic
    substitution, phi, spill/reload, inline expansion, and serialized summary
    preserves or conservatively joins it. The same v2 sidecar digest covers
    these facts, the callable effect bound, and its authority atomically. No
    cast or adapter upgrades it, and affine/task-stable values do not escape
    compiler-proven eligible storage.
36. **Provider marker authentication**: `execution_suspension_point` names the
    sealed semantic identity `core.execution.suspension_point`, one selected
    target/provider/leaf declaration, and one immediately following
    authenticated non-call transfer. Standalone, missing, duplicate,
    post-transfer, separated, spoofed, or redundant-before-effect-bearing-call
    marker facts are invalid and never reach machine lowering.

A failed verifier check is a hard failure and the malformed function never
reaches ABI lowering, register allocation, scheduling, or instruction
selection. It is an internal compiler error, never a user diagnostic — with
two exceptions: invariant 16 (effect deny violation) and invariant 17 (branch
to non-executable section) produce user-facing diagnostics because they
reflect source-level mistakes, not compiler bugs.

### 7.1 Branch Target Section Validation

After symbol placement (when every symbol has a section assignment and
every section has ELF flags), the verifier performs a second pass over
control-flow ops to detect branches into non-executable memory.

The diagnostic source span on each control-flow op is required to survive
all passes up to and including this post-placement verifier pass. A lowering
pass may change the op's machine form, but it must keep the source span of
the original `goto`, branch, tail call, or direct call that introduced the
control-flow edge. If a generated control-flow op has no direct source token,
it inherits the source span of the enclosing source construct that caused it
to be generated.

**Scope:** any `jmp`, `br`, `tail`, or `call` op whose target is a
statically-resolvable symbol (i.e. not a computed branch through a
function pointer).

**Rule:** if the target symbol's section does not carry `SHF_EXECINSTR`
(the ELF executable-section flag), the compiler emits a user diagnostic:

```text
error: branch targets non-executable section
  --> main.wyst:42:5
   | goto data_buffer
   |      ^^^^^^^^^^^ symbol `data_buffer` is in section `.data`
   |
note: `.data` does not have the executable attribute (SHF_EXECINSTR)
```

**Rationale:** jumping into `.data`, `.bss`, `.rodata`, or `.percpu` is
almost always a bug — a label or function name was confused with a data
symbol. This check uses information the compiler already has (the layout
module's section declarations and the symbol table) and costs nothing at
runtime.

**Computed branches** through function pointers cannot have their final target
section checked statically. A future profile that activates `blr` for checked
assembly requires an ordinary signature input with an exact callable type and
ABI/effect/terminal contract; raw integers and untyped addresses are rejected.
The pinned v0.9 pack recognizes `blr` as `known_unsupported` and emits no such
IR operation.

### 7.2 Checked-`asm` Stack-State Verification

Stack access is closed by the signature header and the parsed instruction
rows. Without a stack clause, any explicit or implicit access to `sp`, stack
memory, or stack state is rejected. The verifier never infers permission merely
because an offset happens to fall within the compiler-owned frame.

In a profile with active stack rows, `asm preserves stack` permits checked
temporary stack use. The verifier tracks the complete stack state through the
local assembly CFG, including every cataloged explicit or implicit delta,
alignment fact, addressing writeback, and memory range. Every normal exit must
reproduce the complete incoming state; otherwise the block is rejected:

```text
error[E0701]: asm preserves stack does not restore the incoming stack state
  --> handlers.wyst:18:5
   | sub sp, sp, #16
   |     ^^^^^^^^^^^^^ stack delta is -16 at the normal exit
   |
note: every normal exit from `asm preserves stack` must have zero net delta
```

`asm establishes stack` and `asm restores stack` are restricted to their owning
naked entry and restore contexts under `language.callable-storage-contracts`
and require a complete target
transition contract, not just a numeric `sp` delta. The pinned v0.9 pack has no
active row proving either transition and therefore rejects both clauses; it also
has no stack-access row with which `preserves` could perform temporary stack
use. A naked block with stack behavior but no matching active proof is rejected
just like an ordinary block.

The whole-function allocation witness combines this state trace with final
spill slots, callee-saved and indirect-result storage, alignment, and all other
frame resources. A `per_cpu` access under
`language.callable-storage-contracts` never contributes a hidden current-instance
cache slot. Wyst rejects local `in x29`; no fixed local may
masquerade as an alternate compiler frame base.

---

## 8. Textual IR Form

The IR has a human-readable textual form used for:

- Compiler debugging output (`wync --emit-ir`).
- Pass snapshots.
- Documentation worked examples.

The textual form is **not guaranteed to parse back across compiler build
identities**. It is a stable dump format within a single build identity.

### 8.1 Grammar Sketch

```text
ir-file       = module-line decl*
module-line   = "module" name newline
decl          = function | global | type-decl

function      = visibility attribute* "func" name signature "{" function-body "}"
function-body = region* block*

region        = "region" region-kind region-name "{" region-body "}"
region-body   = block-name+

block         = block-name ":" instr* terminator

instr         = value-binding? op type? operands attribute-block? newline
terminator    = op operands attribute-block? newline

value-binding = "%" identifier "="
attribute-block = "[" attribute-list "]"
```

### 8.2 Worked Example

The Wyst surface code:

<!-- wyst-contract: sketch -->
```wyst
fn uart_write(byte: u8) {
  while (UARTFR.load() & TXFF) != 0 {
    cpu.wfe()
  }
  UARTDR.store(widen<u32>(byte))
}
```

The post-IR-construction, pre-type-erasure lowering is:

```text
module boot.hello

func uart_write [cc=wyst] (byte: u8) -> void {

  region schedule.standard body {
    bb0:
      %fr_addr = addr_of @mmio u32 "UARTFR"
      jmp bb1

    region loop spin {
      bb1:
        %fr = load @mmio u32, %fr_addr [volatile=true, order=plain, align=4]
        %txff = const u32 0x20
        %busy_mask = and u32 %fr, %txff
        %busy = cmp u32 %busy_mask, 0 [op=ne]
        br %busy, bb2, bb3

      bb2:
        intrinsic () -> void [name=wfe, fence=none]
        jmp bb1
    }

    bb3:
      %dr_addr = addr_of @mmio u32 "UARTDR"
      %byte_u32 = cast u32 %byte [kind=zext]
      store @mmio u32, %dr_addr, %byte_u32 [volatile=true, order=plain, align=4]
      ret
  }
}
```

Things to notice:

- `loop` region nests inside `schedule.standard`; the IR makes the
  reorder-legality scope syntactically visible.
- The volatile/MMIO loads and stores carry the `volatile=true` attribute even
  though the type already records it; this is **deliberate redundancy** so that
  an alias-analysis pass that touches a load doesn't need to look up the type to
  see if it's volatile. MMIO intent remains in the address type and effect facts.
- `intrinsic wfe` is opaque: a pass that doesn't know what `wfe` does still
  knows its declared `fence=none` and can reorder around it (subject to the
  block boundary).
- `addr_of` is the address-materialization origin in this example. Other
  relocation-producing origins, such as direct calls and symbol branches, are
  represented by their own IR terminators or lowering patch records
  ([chapter-16-object-format.md](chapter-16-object-format.md) §6).

---

## 9. The Type-Erasure Pass

A single pass between scheduling and register allocation **dissolves
aggregate types** and lowers `bitstruct` operations to typed bit-field operations. The
pass:

1. Replaces every `struct`, `[]T`, `enum`, and `bitstruct` SSA value with a
   set of scalar SSA values.
2. Replaces `extract`, `aggregate`, bitstruct field-read, bitstruct
   field-write ops with sequences of `gep` + `load` / `store` + `and` /
   `or` / `shl` / `lshr` / `ubfx` / `bfi` ops.
3. Collapses `@T` to `@u8` (no stride info beyond this point).
4. Erases `volatile=true` only when there is no volatile load or store
   reaching the value — otherwise preserves it. (Volatile addresses
   threaded into non-volatile operations is a frontend error caught much
   earlier.)
5. Lowers endian-aware load/store ops to native integer load/store plus
   `byteswap` where host and requested byte order differ.

After type erasure, the IR uses only scalar types and `[T:N]` vectors. It is
ready for register allocation (Phase 5.3) and instruction selection.

---

## 10. Determinism

Every pass must be deterministic. Specific requirements:

- **Iteration order** over basic blocks is **reverse postorder** (computed
  once per function, recomputed when the CFG changes). Hash-table iteration
  is forbidden for any IR-mutating decision; passes that need a map use
  ordered containers keyed on `%vN` identifiers.
- **Value numbering** is by source-order of definition. A new value
  introduced by a pass takes the lowest unused `%vN`.
- **Region tree traversal** is structural (parent before children;
  children in declaration order). Schedulers may reorder within a region;
  they may not reorder across regions.
- **Pass scheduling**: the optimization pipeline is a fixed list of passes
  in a fixed order. There is no cost-driven pass selection.

This is what underlies the Reproducibility Model claim in
`chapter-01-language-design.md`: same source input manifest, compiler build identity,
build optimization mode, target, and selected scheduling policies → identical IR →
identical object output.

---

## 11. Register Allocation

The Wyst register allocator is a pass over the IR after type erasure (§9) and
before instruction selection. Its output is the same IR with every non-void SSA
value assigned either to a physical register home or to a deterministic
stack-slot home.

This section is **normative**. Every Wyst-conforming compiler must implement
this SSA-based allocator and these tie-breaks. The Reproducibility Model
([chapter-01-language-design.md](chapter-01-language-design.md)) requires it:
two compilers that allocate differently produce different ELF bytes and
different debug location lists.

### 11.1 Algorithm

The allocator uses deterministic SSA interference coloring:

1. **Classify homes.** Scalar integer, pointer, function-pointer, bitstruct,
   boolean, and payloadless-enum SSA values are GPR candidates. Composite
   values (`string`, slice, dynamic array descriptor, tuple, array,
   payload-carrying enum two-word values, and named aggregate) are stack-resident. Scalar
   floating-point and vector SSA values are stack-resident in the current
   AArch64 backend unless an explicit `in register` placement is present;
   automatic
   FPR/vector homes require call-aware range splitting and are outside the
   current allocator pool.
2. **Pre-color explicit placements.** Every `in register` value is assigned
   its fixed register. A placed value whose type cannot inhabit that register
   class is a
   compile error.
3. **Force stack-required values.** Any value whose runtime stack address is
   materialized by `stack_addr_of` / `addr_of(local)` is stack-resident. A
   fixed placement on such a value is a compile error because "this binding lives in
   a register" conflicts with "this binding has stable stack storage." The
   Checked-assembly signature operands and scratch resources add only their
   generated live ranges, ties, fixed placements, and implicit constraints;
   the presence of `asm` does not force unrelated automatic GPR candidates to
   the stack.
4. **Compute SSA liveness.** Ordinary operands are live at their instruction.
   Terminator operands are live at the block exit. `phi` incoming operands are
   live on the predecessor edge named by the incoming pair; the `phi` result is
   defined at the start of the successor block.
5. **Build the interference graph.** For each definition, add an undirected
   edge to every value live at that program point. `phi` results do not
   interfere with their incoming edge values unless another ordinary liveness
   path makes them overlap.
6. **Color each register class independently.** Run maximum-cardinality search
   over the class-specific graph. At each MCS step, select the unnumbered value
   with the highest current MCS score, then higher static use weight, then
   higher interference degree, then earlier definition position, then lower
   `%vN`. In that order, assign the first register from the deterministic
   preferred list (§11.2) that is not already used by an interfering colored
   neighbor.
7. **Spill fallback.** If no register in the class is available, assign the
   value to stack. Explicitly placed values are never spilled.

This is not a graph-coloring license for implementation-defined behavior: the
graph construction, ordering, register choice, and spill fallback above are part
of conformance.

### 11.2 Register Pool

For the current AArch64 backend, the allocator-controlled pool is still
deliberately constrained, but it is call-shape aware. These registers are never
allocator-controlled automatic homes:

- `xzr` / `wzr` — zero register, not allocatable.
- `sp` — stack pointer, owned by the prologue.
- `lr` (`x30`) — link register and return address carrier.
- `x29` — frame pointer, owned by the prologue; `naked` does not make
  target-reserved state a legal placement.
- `x18` — platform register; reserved by the AArch64 PCS for the platform.
- `x8` — indirect-result location register.
- `x16..x17` — linker/interprocedural-call scratch registers.
- Any register named by an in-scope explicit placement.

The baseline scalar GPR pool is `{ x19..x28 }` minus active explicit
placements. Any
function that receives an automatic home in this callee-saved pool saves the
used register in its prologue and restores it in its epilogue, exactly as it
does for an explicit callee-saved local placement.

For functions with no checked `asm`, no direct calls, and no indirect calls, the
preferred scalar GPR pool is the caller-scratch set `{ x0..x7, x9..x15 }`.
Native leaf parameters with no explicit placements prefer their incoming ABI registers
`x0..x7`, and leaf `phi` values prefer `{ x1..x7, x9..x15 }`, so common leaf
loops avoid avoidable moves and callee-saved frame traffic.

For functions with direct calls but no checked `asm` and no indirect calls, scalar GPR
values proven not live across a call prefer `{ x0..x7, x9..x15 }` before the
callee-saved pool. Values live across a call use only callee-saved automatic
homes unless they are explicitly placed and legal under
`language.callable-storage-contracts`.

For reused same-block absolute address bases that feed multiple direct memory
operations before any call or checked `asm`, the preferred list moves `x10` to the
front when `x10` is otherwise available. This matches the backend load/store
base convention and keeps repeated global or symbol-address accesses from
rematerializing the same address in the same block.

`xzr` / `wzr` may appear in allocation reports as rematerialized pseudo-home 31 for a
pseudo-home. That marker means "rematerialize this constant, string/slice
descriptor, or absolute symbol address at the use site"; it is not an
allocatable live register and does not create an `xzr` value home.

Each register bank referenced by an active checked-assembly row has a generated
availability and interference model. FPR/vector inputs, results, and scratch
resources therefore receive legal `vN` homes (or a hard allocation diagnostic)
under the same complete-live-range rule as GPR resources. A bank with no active
row remains unavailable rather than falling back to a fake GPR or stack home.

### 11.3 Tie-Breaking and Spill Selection

Tie-breaks are part of the algorithm:

- **Static use weight** is the count of SSA uses, counting ordinary operands,
  `phi` incoming edge operands, and terminator operands once each.
- **Definition position** is the index of the defining value in the function's
  stable IR value list.
- **Interference degree** is the number of graph neighbors after SSA liveness
  construction.
- **MCS selection order** is descending MCS score, descending static use
  weight, descending interference degree, ascending definition position, then
  ascending `%vN`.
- **Register choice** follows the deterministic preferred list for the value's
  class and call-shape (§11.2).
- **Spill choice** is implicit: a value spills only when every register in its
  class is already occupied by an interfering colored neighbor.

### 11.4 Explicit-Placement Resolution Order

The placement pre-pass processes exact placements in source declaration order.
Source-level placements
that request the same register in the same function scope are rejected before
allocation, matching the current `language.callable-storage-contracts` rules in
[chapter-08-functions.md](chapter-08-functions.md). If malformed or
transformed IR reaches allocation with two fixed homes for the same physical
register and the SSA interference graph contains an edge between their values,
the allocator also rejects it as a register-allocation conflict.

No fallback path exists. The compiler does **not**:

- Move a placement to a different register.
- Drop a placement with a warning.
- Spill an explicitly placed value to satisfy a competing placement.

If the program over-constrains via `in register`, the programmer must revise
the placement set. This is consistent with the language's general "make conflicts
visible" stance.

### 11.5 Spill Slot Layout

Spill slots are allocated in the function's frame, immediately after the
saved-callee-saved-register area. Slot offsets are assigned in
**first stack-home order**. A value is introduced to the spill-slot layout at
the first program position where its allocation range is stack-resident. That
event is recorded once per SSA value. If multiple values first become
stack-resident at the same position, lower `%vN` IDs receive earlier slots.

Slot sizes match the spilled value's type size (8 bytes for `u64`/`i64`/`@T`,
16 bytes for vector pairs, etc.) with natural alignment.

### 11.6 Coalescing

Coalescing is represented by non-interference, not by a separate destructive
pass. If two SSA values are connected only by a `phi` edge or copy-like local
binding and the SSA liveness graph does not give them an interference edge, the
coloring step may assign them the same register. The allocator does not merge
graph vertices, does not rewrite SSA, and never invalidates an explicit
placement.

### 11.7 Interaction with checked `asm`

Checked `asm` blocks contribute typed input, tied/fresh result, scratch,
instruction-level live-range, fixed-placement, and implicit-resource
constraints derived from their signatures and parsed instruction rows (§2.9).
No manual clobber set exists. The allocator may create boundary transfers and
preservation operations outside the written block, but may not add, remove, or
reorder an instruction inside it. An unsatisfiable scratch or fixed-home
assignment is a hard allocation error rather than a spill or hidden interior
support instruction.

The block's presence never forces unrelated automatic values to memory or
reserves a whole register bank. Every block-associated home, transfer, spill,
preservation, and frame resource carries a typed causal trace rooted in the
specific generated constraint. `asm pure` blocks have the same explicit
operand/result allocation model and are admitted only when the semantic rows
and CFG prove an ordinary deterministic `effects(none)` computation.

### 11.8 Determinism Guarantees

Given identical IR input, identical `#target` declaration, and identical
scheduling policies, the register allocator produces:

- The same physical register for every SSA value.
- The same set of spilled values.
- The same spill slot for every spilled value.
- The same register-sharing decisions for non-interfering values.

This holds **across compiler invocations on the same machine** and **across
machines running the same compiler build identity** — there is no nondeterminism
from heap layout, hashtable iteration, or threading. The allocator is
single-threaded by spec.

### 11.9 Callee-Entry Transfer Planning

Allocation homes do not change the locations in which the selected calling
convention delivers parameters. After allocation and frame planning, the
backend constructs one simultaneous transfer set from all live incoming ABI
locations to their compiler homes. It must not lower that set as a
parameter-order sequence: a home may alias another parameter's still-unread
incoming location.

The transfer planner is shared infrastructure over typed physical locations,
not an allocator heuristic. It normalizes architectural aliases, preserves
repeated sources, breaks cycles deterministically, and protects the
indirect-result state before any input register is reused. Chapter 15 defines
the canonical ordering, scratch selection, temporary-frame fallback, and
reporting rules. Pseudo-home 31 and other rematerialization markers are
not physical locations and are never planner scratch registers.

### 11.10 Out of Scope

- **Live-range splitting after coloring.** The allocator either colors a value
  for its whole SSA allocation range or assigns that value to stack.
- **General rematerialization.** The current backend rematerializes scalar
  constants, string/slice descriptors, and absolute symbol-address expressions
  (`addr_of`, constant-address `gep`, and copy-like automatically placed locals over those
  forms). It does not perform arbitrary expression rematerialization,
  rematerialize effect-dependent values, or use rematerialization as a substitute
  for live-range splitting.
- **Cross-function allocation.** Each function is allocated independently.
  Whole-program allocation across `#[inline]` boundaries is implicit (inlined
  bodies are part of the caller's interval set), but no allocation flows
  across non-inlined calls — the AAPCS or Wyst-native ABI handles that.

---

## 12. Open Questions

These remain outside this IR model:

- **Profile-guided scheduling**: the `br` op now carries an optional `hint`
  attribute (`likely_true`, `likely_false`, `none`) from compiler-owned branch
  facts. A future version may add numeric `weights` for PGO data.
- **Loop dependency annotations**: vectorization-specific loop policy is
  outside the scheduling model and has no reserved source spelling.
- **DWARF emission lowering**: spec locked at
  [chapter-23-debug-info.md](chapter-23-debug-info.md); IR carries the source-location attributes
  consumed by DWARF emission.
- **Cross-module inlining of `#[inline]` functions**: public inline helpers
  are available to importing modules during IR construction, before SSA.
  The compiler keeps their checked AST bodies available for expansion, but
  does not lower them into standalone `FunctionIr` bodies or exported ABI
  symbols. This matches the whole-program single-pass model in
  [chapter-16-object-format.md](chapter-16-object-format.md): source bodies
  are available while imported call sites are lowered.

---

## 13. Cross-References

| Topic                                                | Canonical location                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Source → AST → IR pipeline                           | `chapter-01-language-design.md`, "Compiler Architecture"                        |
| Type system rules (conversion, promotion)            | [chapter-06-types.md §1.4](chapter-06-types.md)                                 |
| `schedule.standard` / `schedule source` semantics    | [chapter-13-scheduling.md](chapter-13-scheduling.md)                            |
| Memory model (load reordering, races)                | [chapter-09-memory-model.md](chapter-09-memory-model.md)                        |
| Atomics surface syntax → IR ops                      | [chapter-11-intrinsics.md §1.3.2](chapter-11-intrinsics.md)                     |
| System-register intrinsics                           | [chapter-11-intrinsics.md §1.3.3](chapter-11-intrinsics.md)                     |
| checked `asm` block semantics                        | [chapter-08-functions.md §2.9](chapter-08-functions.md)                         |
| Register allocator                                   | §11 of this document                                                            |
| Object file output                                   | [chapter-16-object-format.md](chapter-16-object-format.md)                      |
| Operator semantics and precedence                    | [chapter-07-operators.md](chapter-07-operators.md)                              |
| Typed-IR dependency shape                            | §6.9 of this document                                                           |
| Future performance evidence boundary                 | §14 of this document                                                            |
| Branch hints and placement                           | [chapter-08-functions.md §2.7.2](chapter-08-functions.md)                       |
| `select` op surface syntax                           | [chapter-07-operators.md](chapter-07-operators.md)                              |
| Effect system, `deny_effects`                        | [chapter-01-language-design.md](chapter-01-language-design.md), "Effect System" |
| Effect categories on intrinsics                      | §6.8 of this document                                                           |
| Branch target section validation                     | §7.1 of this document                                                           |
| checked-`asm` stack bounds diagnostic                | §7.2 of this document                                                           |

---

## 14. Future Performance Evidence Boundary

The current compiler has no target-cost descriptor that inspection reports may
use to claim instruction latency, throughput, cache state, branch-prediction
state, or cycle cost. A selected target identity names semantic and lowering
capabilities; it does not imply that a corresponding performance model exists.

A future modeled-cost facility must define a separately versioned model whose
underlying authenticated facts actually differ whenever model names differ. It
must identify target applicability, assumptions, unsupported factors, and an
uncertainty or precision class. Every numeric field must carry the common
epistemic metadata, and modeled estimates must remain distinct from exact
machine facts and measured observations.

No future machine critical-path or cycle claim may be derived from §6.9 alone.
Such a claim requires final-machine CFG paths, scheduling, instruction
expansions, dependencies, target resources, and explicit branch and memory
assumptions. Unknown factors remain unknown. Until that facility is implemented,
the compiler inspection reports expose only the unweighted typed-IR structure
defined in §6.9.

Two verified `cpu.read_counter` records likewise establish only two raw source
reads. Width-aware subtraction yields a modular tick delta; it is not by itself
elapsed-time or latency evidence. The selected target's static platform-counter-
instance provider `a64-generic-virtual-counter-instance-provider-v1` version 1,
under `wyst.platform-counter-instance-provider.v1`, is an authenticated target-
profile extension bound to the exact source descriptor. It names
`wyst.platform-counter-instance-record.v1`; a validated record has a normalized
`wyst.platform-counter-instance-identity.v1` identity, and the static product
also names field `universe_evidence_schema` with value
`wyst.platform-counter-universe-evidence.v1`. Its five-field product digest is
`sha256:ab1c41697aac01bea2961dd676ea33f980712a4471ea70ed226adcf4ed3659b1`.
These static facts belong to target compatibility and compilation identity, not
to either `cpu.read_counter` operation record.

An optional immutable per-run instance record is a launch/measurement product,
not typed IR and not a reusable compilation-cache input. It separately carries
the runtime domain and configuration epoch, realized frequency, comparison and
serialization modes/overhead, complete platform-state applicability/progress
evidence, mutable controls/exclusions/epoch transitions, evidence identities,
an authenticated universe-authority contract identity and content digest, and
normalized record content digest. The authority uses
`wyst.platform-counter-universe-evidence.v1`; an independently selected
platform-environment contract under
`wyst.platform-counter-universe-evidence-contract.v1` pins its exact digest.
Self-consistent resealing cannot establish completeness. The authority binds
provider/source, exact counter domain and configuration epoch, both universe
evidence references, exact sorted states, and exact sorted controls with sorted
effects. Scope enters its digest, preventing authority replay across domains or
epochs; the record binds both the selected trust anchor identity and that digest
and must match all authority facts. Runtime authority and record content remain
outside typed IR and reusable compilation identity. No-record/no-authority
consumption leaves the two raw
reads legal and every numeric result explicitly unsupported. Records with the
closed disposition `unknown`, `malformed`, `incomplete`, `stale`, `mismatched`,
or `ambiguous` fail before exposing any trusted record field. An unrecognized
provider identity is `unknown`; source or another recognized-fact disagreement
and an invalid epoch transition are `mismatched`. Missing authority-declared
rows or missing authority for a present record are `incomplete`; extras and
effect, scope, trust-anchor, reference, or digest differences are `mismatched`;
multiple authorities are `ambiguous`.

A measured interval from the future performance/resource-report and benchmark-
comparison contract must bind the same source descriptor, static
provider/schema, and immutable instance-record identity/content digest at both
endpoints and prove one domain/configuration epoch, comparability and offset,
explicit endpoint serialization and overhead, realized frequency, the possible
platform-state set and progress evidence, mutable source/frequency/offset/reset/
rebase/comparability-control exclusion, and a maximum span below the modulus
before publishing a numeric elapsed claim. These runtime contracts do not add
fields to the current counter-source IR record.
