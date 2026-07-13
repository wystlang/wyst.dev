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

The Wyst IR is the compiler-internal source of truth between the semantic analyzer and
the ARM64 backend. Every optimization, scheduling decision, and lowering rule
is expressed against this representation. Its design priorities, in order:

1. **Preserve every semantic decision the type system made.** Volatility,
   endianness, address-type stride, bitfield identity, signed-vs-unsigned —
   all live in the IR until the lowering pass explicitly erases them.
2. **Make reordering legality syntactically obvious.** A pass should be able
   to ask "may I swap these two ops?" by reading the IR, not by recomputing
   provenance.
3. **Stay small.** ~30 op kinds. New language features prefer new attributes
   on existing ops over new ops.
4. **Be deterministic.** Identical source + compiler version + target +
   `#schedule` mode → identical IR. No hash-table-iteration-order
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
  ↓        effect inference (intrinsic → category, call graph propagation, #deny checking)
  ↓        IR construction (SSA, dominators, regions)
SSA IR  ← this document, "high IR"
  ↓        analysis passes (alias, liveness, schedule legality)
  ↓        scheduling pass (reorders within #schedule(relaxed) regions)
Scheduled IR
  ↓        type-erasure / structure-flattening pass
Low IR  ← still this document, "low IR" form
  ↓        register allocation
Allocated IR
  ↓        instruction selection + encoding
  ↓        post-placement verification (#asm stack bounds, branch target section legality)
Object Image (see chapter-16-object-format.md)
```

"High IR" and "Low IR" use the same op vocabulary and the same textual form;
the difference is which type information is still attached and which ops are
permitted. The boundary is the **type-erasure pass** (§9).

---

## 2. Type System

The IR uses **Wyst's source-level type system directly**, with two
restrictions that hold from SSA construction onward:

- Aggregate types (`struct`, `[]T` slices, `[N]T` arrays, `bitfield(T)`,
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
| `@T`          | Wyst address with element lens `T`. 64-bit at runtime; source arithmetic is element-scaled.    |
| `@volatile T` | Volatile-qualified address. Stores and loads through this type cannot be reordered or elided. |
| `@mmio T`     | Volatile-qualified address with MMIO intent. Accesses also carry the `mmio` effect; architectural memory type still comes from mapping facts. |

The element lens is used while lowering source address arithmetic: `(p :
@u32) + 1` becomes a byte-offset operation with offset `4`. After that point,
lower-level address operations use byte offsets.

### 2.3 Aggregate Types

| IR type                                 | Survives until                                                  |
| --------------------------------------- | --------------------------------------------------------------- |
| `struct { f0: T0, f1: T1, ... }`        | Type-erasure pass                                               |
| `bitfield(T) { ... }`                   | Type-erasure pass; lowered to integer + `ubfx`/`bfi` ops        |
| `enum T { Variant0, Variant1(P), ... }` | Type-erasure pass; payload-less enums lower as their tag, and payload enums use the fixed two-word representation `{tag_word, payload_word}` |
| `[N]T`                                  | Type-erasure pass; indexed access stays as `gep`                |
| `[]T`                                   | Type-erasure pass; lowered to `struct {data: @T, len: u64}`      |
| `[T:N]`                                 | Survives end-to-end; mapped to NEON registers in regalloc       |
| `fn(T0, T1, ...) -> R [@cc]`            | Survives end-to-end; `@cc` selects calling convention           |

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
`@volatile T`, or `@mmio T`) until source arithmetic has been lowered to byte
offsets. Raw addresses are integers or `@u8` byte-lens addresses: once source
chooses integer arithmetic or an `@u8` lens, later offsets are byte counts and
do not regain element scaling automatically.

### 2.4 Type Erasure

After the type-erasure pass:

- All `struct` types are dissolved; field accesses become `gep` + scalar load/store.
- All `bitfield(T)` types are dissolved; field reads become `ubfx`-shaped ops, field writes become `bfi`-shaped ops.
- All payload-less `enum` types are dissolved into tag-typed integer values.
- All payload-carrying `enum` types are dissolved into fixed two-word
  `{tag_word, payload_word}` values; `enum_field(tag)` reads word 0 and
  `enum_field(payload)` reads word 1.
- The verifier admits only source-level payload-word types in the payload word:
  `bool`, integer scalars, pointers, function pointers, and bitfields. Structs,
  slices, floating-point values, and nested enum values must not appear as enum
  payload IR.
- All `[]T` slices are dissolved into `{data, len}` pairs.
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

A compilation unit's IR is a list of typed top-level declarations:

```text
module := decl*

decl := function | global | layout-symbol | type-declaration

function := visibility attribute* name "::" signature "=" function-body
global   := visibility attribute* name (":" | "::") type "=" const-expr
layout-symbol := "pub" name "::" "u64" "=" "#start" "(" section-name ")"
type-declaration := visibility name "::" type-form
```

`visibility` is `pub` or absent (private; see [chapter-04-modules.md](chapter-04-modules.md)).
`attribute` covers `#inline`, `#naked`, `#pin(reg)`, `#noreturn`, `#percpu`,
`#tls`, `#section(...)`, `#align(N)`, and the calling-convention markers
`[aapcs]` / `[wyst]`.

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
- A **region tree**: a hierarchical structure that mirrors `#schedule` blocks,
  loops, and structured `if`/`while`/`repeat` nesting. Every basic block
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
- A value is in scope from its defining instruction to the end of the
  function. **Liveness** is computed separately and is not part of the IR.
- Phis are the only mechanism for control-dependent values. Phi operands
  are pairs `(predecessor-block, value)`; one operand per incoming edge.
- **Dominators** are computed on demand. They are not stored in IR.
- **No critical edges.** A predecessor of a block with phis must have only
  that block as a successor. The IR builder inserts split blocks where
  needed.

### 4.3 Region Tree

Regions form a tree rooted at the function's body. The standard region
kinds, with semantics that match Wyst surface syntax:

| Region kind          | Built from                                      | Reordering legality across the boundary                                                                    |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `function-body`      | The function itself                             | (the root; no "across" boundary)                                                                           |
| `schedule.strict`    | `#schedule(strict) { ... }`                     | No reordering of source-level semantic operations across the boundary or inside; target lowering may still add required support instructions under Chapter 13. |
| `schedule.relaxed`   | `#schedule(relaxed) { ... }`                    | Reordering inside the region permitted within Wyst's memory model rules. No reordering across the boundary. |
| `schedule.default`   | Implicit ordinary code outside explicit `#schedule` regions | Distinct default mode; deterministic pure reordering is permitted within dependency, effect, alias-proof, and memory-model rules. |
| `loop`               | `loop`, `while`, `repeat`                       | Loop carries dependencies via phis; no reorder across iteration boundary.                                  |
| `if-then`, `if-else` | `if`/`else` branches                            | Branch boundaries are sequence points; no speculative reorder crosses them.                                |
| `inline-asm`         | `#asm { ... }` block                            | Hard reorder barrier in both directions; opaque to alias analysis.                                         |

A pass asking "may I reorder ops A and B?" walks A and B up to the lowest
common ancestor region; if any region on the path forbids the reorder, no.
This is the IR's representation of the §4 (Scheduling Semantics) +
§9 (Memory Model) ordering rules — the IR makes them syntactically
checkable.

Regions are emitted at IR construction time and **preserved unchanged**
through every pass until the type-erasure pass, after which they may
collapse only when their boundary is no longer load-bearing (e.g. an empty
`schedule.relaxed` is dropped).

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
  compiler does not insert `%brk`. A lowering for floored remainder must
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
  pointer checks lower through explicit `as.address u64` conversions before comparison.
  Mixed-sign and mixed-width are forbidden (Phase 0.4 rules).
- **Lowering:** `cmp` + `cset`/`csel`.

### 6.2 Memory

#### `load`

- **Signature:** `(@T) -> T`.
- **Attributes:** `volatile : bool`, `order : { plain, acquire, seq_cst }`, `align : u32` (computed from the source's known alignment).
- **Semantics:** loads `T` from the address. Volatile and ordered loads must not be elided, duplicated, or reordered (see [chapter-09-memory-model.md](chapter-09-memory-model.md)).
- **Effects:** reads memory. With `volatile=true` or `order != plain`, also acts as a reorder barrier per its order.
- **Lowering:** scalar `ldr`/`ldrb`/`ldrh` family for scalar values;
  deterministic scalar chunks for aggregate values per
  [chapter-09-memory-model.md §9.6](chapter-09-memory-model.md); `ldar`/`ldaxr`
  for acquire/seq_cst.

#### `store`

- **Signature:** `(@T, T) -> void`.
- **Attributes:** `volatile : bool`, `order : { plain, release, seq_cst }`, `align : u32`.
- **Operand production order:** source assignment lowering produces the address
  operand before the stored value operand, then emits the store.
- **Lowering:** scalar `str`/`strb`/`strh` family for scalar values;
  deterministic scalar chunks for aggregate values per
  [chapter-09-memory-model.md §9.6](chapter-09-memory-model.md); `stlr`/`stlxr`
  for release/seq_cst.

#### `load.be` / `load.le`

- **Signature:** `(@U) -> T`, where `T` is a 16-, 32-, or 64-bit integer.
- **Attributes:** `endian : { be, le }`, `volatile : bool`.
- **Semantics:** loads 16-, 32-, or 64-bit integer bytes from the address and
  produces an ordinary host-order integer value.
- **Lowering:** native `ldr`/`ldrh` plus `rev`/`rev16` as needed.

#### `store.be` / `store.le`

- **Signature:** `(@U, T) -> void`, where `T` is a 16-, 32-, or 64-bit
  integer.
- **Attributes:** `endian : { be, le }`, `volatile : bool`.
- **Semantics:** stores a host-order integer value using the requested byte
  order.
- **Lowering:** `rev`/`rev16` as needed before native `str`/`strh`.

#### `indeterminate_read`

- **Signature:** `(storage : T) -> T`.
- **Source spelling:** `%read_uninit(storage)` where `storage` is
  `MaybeUninit<T>`.
- **Semantics:** observes the current bits of explicit raw local storage as an
  ordinary `T` value. The result is unspecified by Wyst but is not poison,
  `undef`, or a missing SSA definition.
- **Legality:** only generated for explicit raw-storage reads; ordinary local
  reads before initialization are source diagnostics and must not reach IR as
  definitionless SSA values.
- **Lowering:** copy or load the storage home into a normal result home using
  the same storage class and type-erased representation as `T`.

### 6.3 Atomic RMW

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
- **Effects:** AAPCS or Wyst-native register clobber per `cc`; full compiler memory fence unless attribute `pure : bool = true` (rare; only for pure-function intrinsics).

#### `tail`

- **Like `call` but terminator-only, and reuses the caller's frame.** Used for `goto` to a `label` symbol (intra- or inter-module).

#### `ret`

- **Signature:** `(R) -> noreturn` where R is the function return type, or `() -> noreturn` for void.
- **Terminator-only.**

#### `unreachable`

- **Terminator-only.** Generated for code following `%eret`, a direct
  `#noreturn` call, or another operation the verifier proves cannot return;
  also used for switch arms the verifier can prove dead.

### 6.5 Addressing

#### `addr_of`

- **Signature:** `() -> @T`.
- **Operand:** symbol reference (function name, label name, global name, or `#start(.section)`).
- **Semantics:** materializes the address of a relocatable symbol as a typed
  address value. It is one relocation-producing origin; it is not the only one
  in the compiler. Direct calls, symbol branches, constant address
  initializers, per-instance object references, veneers, jump-table entries,
  and address-bearing instruction operands are represented separately.
- **Lowering:** `adrp` + `add` page pair (or `adrp` + `ldr` when stored into data).

#### `gep`

- **Signature:** `(@T, i64) -> @T`.
- **Semantics:** byte-offset addressing in IR. This is not the source-level
  `@T + n` rule: source address arithmetic uses element offsets and is scaled
  to bytes before it reaches this op. Field offsets, array indexing, struct
  member access, and byte-lens source arithmetic all compile to `gep` plus a
  compile-time-or-runtime byte offset.
- **Lowering:** `add` with immediate or `add xN, xM, xK, lsl #s`.

#### Relocation-Producing Origins

Relocation-producing origins are explicit in IR or in the lowering artifact
records that consume IR. The current compiler recognizes these origins:

| Origin | IR or lowering representation | Emitted artifact consequence |
| --- | --- | --- |
| direct calls | `call` with a `SymbolId` callee, recorded as a direct call patch during ARM64 lowering | `CALL26` when in range, or a deterministic veneer whose body uses an address-materialization relocation |
| symbol branches | `tail` / `goto` to a label or function symbol, recorded as a direct branch patch | `JUMP26` when in range, or a deterministic veneer whose body uses an address-materialization relocation |
| address materialization | `addr_of`, string address materialization, and symbol-base materialization for constant-address `gep` | `ADR_PG_HI21` + `ADD_LO12` page-pair relocation, with byte addends folded only for constant offsets |
| constant address initializers | `ConstIr::Address` and slice/string/data descriptors containing an address constant | `ABS64` data slot patched during final image write-out |
| per-instance object references | `current_instance_addr_of` and `per_instance_offset_of` values, plus `ConstIr::PerInstanceOffset` | compiler-owned per-CPU/TLS offset patching; no dynamic ELF TLS relocation is serialized in the static image |
| jump tables | future explicit jump-table records, if a lowering mode emits tables | table entries are relocation origins; current `switch-dispatch` mode does not emit jump tables |
| address-bearing inline assembly operands | checked `#asm` memory/address operands that name a symbol-sourced address | reuse the same address materialization records as ordinary operands before template emission |

Passes must not infer relocation provenance from arbitrary integer values or
from later uses of a bound address local. A relocation origin is carried by the
IR node or lowering patch that names the symbol, object, string, section, or
future jump-table entry.

### 6.6 Casts and Construction

#### `cast`

- **Signature:** `(S) -> T`.
- **Attribute:** `kind : { zext, sext, trunc, bitcast, addr_to_int, int_to_addr, fp_to_int, int_to_fp, byteswap }`.
- **Semantics:** each kind is a distinct cast operation; the verifier checks that the (S, T) pair matches the kind. This mirrors the Phase 0.4 `as`-pair rules.
- **Lowering:** zero-cost (`bitcast` when on a register of the right size), `sxtb`/`sxth`/`sxtw` (`sext`), `and` (`trunc`), `rev`/`rev16`/`rev32` (`byteswap`).

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

- **Signature:** `(in0, in1, ...) -> (out0, out1, ...)`.
- **Attributes:** template, constraint strings, clobbers, `pure : bool` (per §2.9).
- **Effects:** unless `pure=true`, full two-way memory fence and full register clobber per AAPCS caller-saved set + declared clobbers.
- **Opaque to alias analysis** (per `chapter-01-language-design.md`'s consequence statement in §9.2).
- **Lowering:** verbatim, with operand interpolation.

#### `barrier.compiler`

- **Signature:** `() -> void`.
- **Effects:** reorder barrier in IR only. Emits no instruction.
- **Source spelling:** `%compiler_barrier()`.
- **Use:** sequence point insertion by source or passes that need to constrain reordering without an architectural fence.

#### `barrier.arch`

- **Signature:** `() -> void`.
- **Attribute:** `kind : { dmb, dsb, isb }`; `dmb` and `dsb` carry one of the
  ARM64 domains `sy`, `st`, `ld`, `ish`, `ishst`, `ishld`, `osh`, `oshst`,
  `oshld`, `nsh`, `nshst`, or `nshld`.
- **Effects:** architectural barrier plus full two-way compiler memory fence.
- **Lowering:** the named instruction.

### 6.8 Runtime Primitive IR

#### `intrinsic`

- **Signature:** `(T0, T1, ...) -> R` where `R` is `void` or a single type.
- **Attributes:** `name : enum`, plus name-specific attributes (immediate ranges, EL gating, fence kind, clobber set).
- **Semantics:** opaque to passes that don't recognize the name. Passes that **do** recognize the name may use the declared attribute set to reason about effects (e.g. a pass knows `%dc_cvac` is a full memory fence because its `fence : full` attribute says so).

The source language spells runtime-lowered primitives with `%`; the IR keeps
the internal op name `intrinsic` for opaque, target-specific operations from
§1.3.2 through §1.3.8. The complete name set:

| Group           | Names                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Atomics         | `cas`, `fetch_add`, `fetch_sub`, `fetch_or`, `fetch_and`, `fetch_xor`, `xchg`, `atomic_bit_set`, `atomic_bit_clear`, `atomic_load`, `atomic_store` |
| System register | `mrs`, `msr`, `mrs_s`, `msr_s`, `daif_set`, `daif_clr`, `dczid_block_size`                                                            |
| Trap            | `svc`, `hvc`, `smc`, `brk`, `hlt`, `eret`                                                                                             |
| Cache           | `dc_cvac`, `dc_civac`, `dc_ivac`, `dc_cvau`, `dc_zva`, `ic_iallu`, `ic_ialluis`, `ic_ivau`                                            |
| TLB             | `tlbi_vmalle1[_is]`, `tlbi_alle1[_is]`, `tlbi_aside1[_is]`, `tlbi_vae1[_is]`, `tlbi_vaae1[_is]`, `tlbi_vale1[_is]`, `tlbi_alle2[_is]`, `tlbi_vae2[_is]`, `tlbi_vale2[_is]`, `tlbi_ipas2e1[_is]`, `tlbi_ipas2le1[_is]`, `tlbi_vmalls12e1[_is]`, `tlbi_alle3[_is]`, `tlbi_vae3[_is]`, `tlbi_vale3[_is]` |
| Hint            | `wfi`, `wfe`, `sev`, `sevl`, `yield`, `nop`                                                                                           |
| Per-CPU / TLS   | compile-time offset queries are `#` forms; runtime base lookup is library/runtime code                                                |
| Performance     | `prefetch`, `ldnp`, `stnp`, `read_cycle_counter`                                                                                      |
| Byte order      | `load_be`, `load_le`, `store_be`, `store_le`                                                                                          |
| Misc            | `compiler_barrier`; `tag_of` as a runtime enum tag projection; `#tag_of` remains a compile-time form                                  |

Each intrinsic carries a declared **effect summary** with these attributes,
populated by the front-end from the §1.3.x specs:

| Attribute  | Values                                                  |
| ---------- | ------------------------------------------------------- |
| `fence`    | `none` / `compiler` / `mem(domain)` / `full`            |
| `clobbers` | bitset over `{x0..x30, v0..v31, nzcv, memory}`          |
| `traps`    | `bool` — may not return                                 |
| `el_min`   | `0 / 1 / 2 / 3` — minimum exception level               |
| `commutes` | `bool` — pure, no side effects, may be reordered freely |
| `effect`   | set of effect categories (see below)                    |

The `effect` attribute carries the set of effect categories this
intrinsic introduces. Effect categories are a closed enum used by the
`#deny` system (see [chapter-01-language-design.md](chapter-01-language-design.md) Effect
System) to enforce architectural boundaries at compile time:

| Effect category     | Introduced by                                                                 |
| ------------------- | ----------------------------------------------------------------------------- |
| `sysreg`            | `%mrs`, `%msr`, `%mrs_s`, `%msr_s`, `%daif_set`, `%daif_clr`, `%dczid_block_size` |
| `trap`              | `%svc`, `%hvc`, `%smc`, `%brk`, `%hlt`                                        |
| `exception_return`  | `%eret`                                                                       |
| `cache_maintenance` | `%dc_*`, `%ic_*`                                                              |
| `tlb_maintenance`   | `%tlbi_*`                                                                     |
| `atomic`            | `%cas`, `%fetch_*`, `%xchg`, `%atomic_bit_*`, `%atomic_load`, `%atomic_store` |
| `cpu_halt`          | `%wfi`, `%wfe`                                                                |
| `interrupt_mask`    | `%daif_set`, `%daif_clr`                                                      |
| `volatile_access`   | any load/store through `@volatile T` or `@mmio T`                             |
| `mmio`              | any load/store through `@mmio T`                                              |
| `barrier`           | `%compiler_barrier`, `%dsb`, `%dmb`, `%isb`                                   |
| `fp_state`          | FP arithmetic/comparison/conversion ops and FP/SIMD primitives                |
| `perf_counter`      | `%read_cycle_counter`                                                         |

Some intrinsics introduce multiple effects: `%daif_set` introduces both
`sysreg` and `interrupt_mask`. The categories are deliberately coarse —
they represent architectural boundaries (privilege level, memory type,
synchronization domain), not individual instruction distinctions.

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

### 6.9 Dependency Chain Queries

A **dependency chain** is a sequence of ops linked by SSA def-use edges: each
op in the chain consumes the value produced by the preceding op. The
**critical path** of a region is the longest dependency chain measured in
estimated latency from the target descriptor (§14).

Two query interfaces are defined for `wyst explain` (not for codegen):

**`critical_path(region) -> (ops: [Op], estimated_latency: u32)`**

Returns the longest dependency chain in the region and its estimated total
latency in cycles. If multiple chains tie, returns the first found in RPO
traversal order.

**`dep_chain(op) -> [Op]`**

Returns the chain of ops that feed into `op`, walking backward through SSA
def-use edges to the chain root (an op with no SSA inputs, such as `const`,
`arg`, or `load`).

These queries operate on the IR after scheduling-region construction (§4.3)
but before register allocation (§11). They are read-only — they do not
modify the IR or influence codegen. Their purpose is to feed `wyst explain`
with dependency and latency information for TMA-style analysis (see
[chapter-01-language-design.md](chapter-01-language-design.md)).

Latency estimates come from the target descriptor (§14). If no target
descriptor is available, `critical_path` reports chain length in ops rather
than estimated cycles.

---

## 7. Function and Module Verifier Invariants

Every IR must satisfy these conditions; the verifier runs after IR
construction and after every pass that mutates IR.

1. **Single-definition SSA**: every `%vN` has exactly one defining instruction.
2. **Dominance**: every use of `%vN` is dominated by `%vN`'s definition.
3. **Type agreement**: every op's operand types match its signature.
4. **No critical edges**: no block with a phi has a predecessor that has multiple successors.
5. **One terminator per block**.
6. **Phi block agreement**: a phi in `bb` has exactly one operand per CFG predecessor of `bb`.
7. **Region containment**: every basic block belongs to exactly one leaf region; nested regions form a tree.
8. **Reachability**: every block is reachable from the entry block (or marked `unreachable`).
9. **Address qualifier flow**: an op of type `@volatile T` or `@mmio T` may only be consumed by `load`/`store` with `volatile=true`, by `cast`, or by `gep`. Casting away `@volatile` or `@mmio` requires an explicit `cast { kind: bitcast }`. Casting alone never introduces a volatile or MMIO access effect.
10. **Calling convention agreement**: a `call %f, ...` where `%f` has type `fn(...) [@cc]` must have `call.cc = @cc`.
11. **Intrinsic effect respect**: a pass that reorders any op past an `intrinsic` op without consulting the intrinsic's effect attributes is a verifier-detected bug.
12. **Volatile store preservation**: no pass may elide, duplicate, or reorder a `store` with `volatile=true` relative to any other `volatile=true` load or store. Volatile stores are never dead-store eliminated, even if a subsequent volatile store writes the same address. This invariant is verified structurally: within any basic block, the relative order of volatile ops in IR must match the order after every pass.
13. **Atomic ordering legality**: a `load` with `order=acquire` must not appear after any op it guards in the same basic block (i.e. no op that was below the acquire-load before a pass may appear above it after the pass). Symmetrically, a `store` with `order=release` must not appear before any op it publishes. The verifier checks this by recording pre-pass op ordering for acquire/release ops and comparing against post-pass ordering within the same block.
14. **Exception vector completeness**: when a function is attributed `#exception_vector`, it must contain exactly 16 `#ventry` regions. A missing or extra slot is a verifier error. Each slot's emitted size must not exceed 128 bytes — verified after instruction selection when sizes are final.
15. **Pin–calling-convention consistency**: a `#pin(reg)` declaration must not name a register reserved by the function's calling convention (`sp`, `x29`, `x18`, `xzr`, `wzr`) unless the function is `#naked`. The verifier cross-checks all active pins against the register pool exclusion list from §11.2.
16. **Effect deny satisfaction**: when a function carries a `#deny(effect, ...)` attribute (see [chapter-01-language-design.md](chapter-01-language-design.md) Effect System), the inferred effect set of the function (computed from intrinsic usage and transitive call graph) must not intersect the denied set. A violation is a **user diagnostic** (not an internal error) citing the denied effect, the intrinsic or callee that introduced it, and the full call chain.
17. **Branch target section legality**: a `jmp`, `br`, or `tail` op whose target resolves to a symbol in a section without the executable attribute (`SHF_EXECINSTR`) is a **user diagnostic**. The verifier checks this after symbol placement, when section attributes are known, and reports the diagnostic at the preserved source span of the control-flow op. See §7.1.
18. **Integer constant range**: a `const` of integer type `T` must be canonical for `T` — an unsigned value in `[0, 2^bits)` and a signed value sign-extended into `[-2^(bits-1), 2^(bits-1))`. A narrowing `as.truncate` conversion folds its operand literal into range during lowering, so an out-of-range integer constant reaching the verifier is an internal compiler error rather than a value the backend must defensively truncate.

A failed verifier check is an internal compiler error, never a user
diagnostic — with two exceptions: invariant 16 (effect deny violation)
and invariant 17 (branch to non-executable section) produce user-facing
diagnostics because they reflect source-level mistakes, not compiler bugs.

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

**Computed branches** (calls through function pointers, `blr` via `#asm`)
cannot be checked statically and are not covered by this rule. The
programmer retains responsibility for computed branch targets.

### 7.2 `#asm` Stack Bounds Diagnostic

For any non-`#naked` function, the compiler owns frame layout and checks
stack-pointer-relative memory operands in the `#asm` template against the
function's **final compiler-owned frame**. This is a post-RA, post-placement
verification: it runs after register allocation, spill-slot assignment, local
stack-slot placement, callee-saved/indirect-result frame placement,
current-instance cache slot placement, and final frame alignment. It does not
use an earlier per-program-point frame estimate.

**Scope:** any `ldr`, `str`, `ldp`, `stp`, or equivalent instruction in
an `#asm` body that uses `sp` (or `x29` when frame-pointer-relative) as a
base register with an immediate offset.

**Rule:** if the offset is greater than or equal to the final compiler-owned
frame size, the compiler emits an error:

```text
error[E0701]: #asm stack access is outside the compiler-owned frame
  --> handlers.wyst:18:9
   | ldr x0, [sp, #4096]
   |              ^^^^^^ stack offset is not within this function's frame
   |
note: stack bounds are checked against the final frame after register
      allocation and frame placement
```

Offsets inside the final frame are accepted even when they exceed the
pre-allocation ABI frame base. Accesses outside that frame must use a
different base, an explicit operand, or `#naked` code whose stack ownership is
fully in programmer-controlled assembly.

**`#naked` functions** are excluded from this check because the compiler
does not control their frame layout. Stack-relative accesses in `#naked`
`#asm` blocks are entirely the programmer's responsibility.

**Interaction with `#pin`:** Wyst rejects `#pin(x29)`, so
`x29`-relative `#asm` bounds refinement is not performed.

---

## 8. Textual IR Form

The IR has a human-readable textual form used for:

- Compiler debugging output (`wync --emit-ir`).
- Pass snapshots.
- Documentation worked examples.

The textual form is **not guaranteed to parse back across compiler versions**.
It is a stable dump format within a single compiler version.

### 8.1 Grammar Sketch

```text
ir-file       := module-line decl*
module-line   := "module" name newline
decl          := function | global | type-decl

function      := visibility attribute* "func" name signature "{" function-body "}"
function-body := region* block*

region        := "region" region-kind region-name "{" region-body "}"
region-body   := block-name+

block         := block-name ":" instr* terminator

instr         := value-binding? op type? operands attribute-block? newline
terminator    := op operands attribute-block? newline

value-binding := "%" identifier "="
attribute-block := "[" attribute-list "]"
```

### 8.2 Worked Example

The Wyst surface code:

<!-- wyst-contract: sketch -->
```wyst
uart_write :: (byte : u8) {
  while u32@[UARTFR] & TXFF != 0 {
    %wfe()
  }
  u32@[UARTDR] = byte as.widen u32
}
```

Lowers (post-IR-construction, pre-type-erasure) to:

```text
module boot.hello

func uart_write [cc=wyst] (byte: u8) -> void {

  region schedule.default body {
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

- `loop` region nests inside `schedule.default`; the IR makes the
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
aggregate types** and lowers `bitfield` operations to bit-fiddling. The
pass:

1. Replaces every `struct`, `[]T`, `enum`, `bitfield(T)` SSA value with a
   set of scalar SSA values.
2. Replaces `extract`, `aggregate`, bitfield field-read, bitfield
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
`chapter-01-language-design.md`: same source input manifest, compiler version,
build optimization mode, target, and `#schedule` modes → identical IR →
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

1. **Classify homes.** Scalar integer, pointer, function-pointer, bitfield,
   boolean, and payloadless-enum SSA values are GPR candidates. Composite
   values (`string`, slice, dynamic array descriptor, tuple, array,
   payload-carrying enum two-word values, and named aggregate) are stack-resident. Scalar
   floating-point and vector SSA values are stack-resident in the current
   AArch64 backend unless an explicit fixed pin is present; automatic
   FPR/vector homes require call-aware range splitting and are outside the
   current allocator pool.
2. **Pre-color pins.** Every `#pin(reg)` value is assigned its fixed
   register. A pinned value whose type cannot inhabit that register class is a
   compile error.
3. **Force stack-required values.** Any value whose runtime stack address is
   materialized by `stack_addr_of` / `%addr_of(local)` is stack-resident. A
   fixed pin on such a value is a compile error because "this binding lives in
   a register" conflicts with "this binding has stable stack storage." The
   current AArch64 backend also forces non-pinned automatic GPR candidates to
   stack in functions containing `#asm`, keeping compiler-owned register homes
   out of inline-assembly clobber territory until live-range splitting exists.
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
   value to stack. Pinned values are never spilled.

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
- `x29` — frame pointer, owned by the prologue unless `#naked`.
- `x18` — platform register; reserved by the AArch64 PCS for the platform.
- `x8` — indirect-result location register.
- `x16..x17` — linker/interprocedural-call scratch registers.
- Any register named in an in-scope fixed pin.

The baseline scalar GPR pool is `{ x19..x28 }` minus active fixed pins. Any
function that receives an automatic home in this callee-saved pool saves the
used register in its prologue and restores it in its epilogue, exactly as it
does for an explicit callee-saved `#pin`.

For functions with no `#asm`, no direct calls, and no indirect calls, the
preferred scalar GPR pool is the caller-scratch set `{ x0..x7, x9..x15 }`.
Native leaf parameters with no fixed pins prefer their incoming ABI registers
`x0..x7`, and leaf `phi` values prefer `{ x1..x7, x9..x15 }`, so common leaf
loops avoid avoidable moves and callee-saved frame traffic.

For functions with direct calls but no `#asm` and no indirect calls, scalar GPR
values proven not live across a call prefer `{ x0..x7, x9..x15 }` before the
callee-saved pool. Values live across a call use only callee-saved automatic
homes unless they are explicitly pinned and legal under the `#pin` rules.

For reused same-block absolute address bases that feed multiple direct memory
operations before any call or `#asm`, the preferred list moves `x10` to the
front when `x10` is otherwise available. This matches the backend load/store
base convention and keeps repeated global or symbol-address accesses from
rematerializing the same address in the same block.

`xzr` / `wzr` may appear in allocation reports as `Register(Gpr(31))` for a
pseudo-home. That marker means "rematerialize this constant, string/slice
descriptor, or absolute symbol address at the use site"; it is not an
allocatable live register and does not create an `xzr` value home.

The automatic FPR/vector pool is empty in the current AArch64 backend. Wyst
still permits `#pin(vN)` for the same reasons as `#pin(xN)`: SIMD code
occasionally needs register stability for vector lanes, especially across an
`#asm` block. Automatic FPR/vector allocation is deferred until the backend can
model caller-saved vector clobbers without creating misleading debug locations.

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

### 11.4 Pin Resolution Order

The pin pre-pass processes pins in source declaration order. Source-level pins
that request the same register in the same function scope are rejected before
allocation, matching the rule table in
[chapter-08-functions.md §2.3](chapter-08-functions.md). If malformed or
transformed IR reaches allocation with two fixed homes for the same physical
register and the SSA interference graph contains an edge between their values,
the allocator also rejects it as a register-allocation conflict.

No fallback path exists. The compiler does **not**:

- Move a pin to a different register.
- Drop a pin with a warning.
- Spill a pinned value to satisfy a competing pin.

If the program over-constrains via `#pin`, the programmer must revise the
pin set. This is consistent with the language's general "make conflicts
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
graph vertices, does not rewrite SSA, and never invalidates a pin.

### 11.7 Interaction with `#asm`

`#asm` blocks declare their operand and clobber sets explicitly (§2.9).
Because the current allocator does not split live ranges after coloring, the
AArch64 backend forces non-pinned automatic GPR candidates to stack for any
function containing `#asm`. Explicit pins and assembly operands remain fixed
constraints; if a pinned value conflicts with an operand or clobber, the
verifier rejects the program rather than silently moving the value.

`#asm(pure)` blocks (§2.9) have the same input/output handling but no
implicit memory clobber.

### 11.8 Determinism Guarantees

Given identical IR input, identical `#target` declaration, and identical
`#schedule` mode, the register allocator produces:

- The same physical register for every SSA value.
- The same set of spilled values.
- The same spill slot for every spilled value.
- The same register-sharing decisions for non-interfering values.

This holds **across compiler invocations on the same machine** and **across
machines running the same compiler version** — there is no nondeterminism
from heap layout, hashtable iteration, or threading. The allocator is
single-threaded by spec.

### 11.9 Out of Scope

- **Live-range splitting after coloring.** The allocator either colors a value
  for its whole SSA allocation range or assigns that value to stack.
- **General rematerialization.** The current backend rematerializes scalar
  constants, string/slice descriptors, and absolute symbol-address expressions
  (`addr_of`, constant-address `gep`, and copy-like unpinned locals over those
  forms). It does not perform arbitrary expression rematerialization,
  rematerialize effect-dependent values, or use rematerialization as a substitute
  for live-range splitting.
- **Cross-function allocation.** Each function is allocated independently.
  Whole-program allocation across `#inline` boundaries is implicit (inlined
  bodies are part of the caller's interval set), but no allocation flows
  across non-inlined calls — the AAPCS or Wyst-native ABI handles that.

---

## 12. Open Questions

These remain outside this IR model:

- **Profile-guided scheduling**: the `br` op now carries an optional `hint`
  attribute (`likely_true`, `likely_false`, `none`) from `#likely`/`#unlikely`
  directives. A future version may add numeric `weights` for PGO data.
- **Loop dependency annotations**: `#schedule(parallel)` regions for
  vectorizable loops are outside the scheduling model.
- **DWARF emission lowering**: spec locked at
  [chapter-23-debug-info.md](chapter-23-debug-info.md); IR carries the source-location attributes
  consumed by DWARF emission.
- **Cross-module inlining of `#inline` functions**: public inline helpers
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
| `#schedule(strict)` / `#schedule(relaxed)` semantics | [chapter-13-scheduling.md](chapter-13-scheduling.md)                            |
| Memory model (load reordering, races)                | [chapter-09-memory-model.md](chapter-09-memory-model.md)                        |
| Atomics surface syntax → IR ops                      | [chapter-11-intrinsics.md §1.3.2](chapter-11-intrinsics.md)                     |
| System-register intrinsics                           | [chapter-11-intrinsics.md §1.3.3](chapter-11-intrinsics.md)                     |
| `#asm` block semantics                               | [chapter-08-functions.md §2.9](chapter-08-functions.md)                         |
| Register allocator                                   | §11 of this document                                                            |
| Object file output                                   | [chapter-16-object-format.md](chapter-16-object-format.md)                      |
| Operator semantics and precedence                    | [chapter-07-operators.md](chapter-07-operators.md)                              |
| Target descriptor, dependency chains                 | §6.9, §14 of this document                                                      |
| Branch hints (`#likely`/`#unlikely`)                 | [chapter-08-functions.md §2.7.2](chapter-08-functions.md)                       |
| `select` op surface syntax                           | [chapter-07-operators.md](chapter-07-operators.md)                              |
| Effect system, `#deny`                               | [chapter-01-language-design.md](chapter-01-language-design.md), "Effect System" |
| Effect categories on intrinsics                      | §6.8 of this document                                                           |
| Branch target section validation                     | §7.1 of this document                                                           |
| `#asm` stack bounds diagnostic                       | §7.2 of this document                                                           |

---

## 14. Target Descriptor

The target descriptor is a per-`#target` data table mapping instruction
classes to estimated latency and throughput. It is consumed by `wyst explain`
for dependency chain analysis and TMA-style bottleneck estimation. It does
**not** drive codegen — scheduling decisions use the simpler rules in
[chapter-13-scheduling.md](chapter-13-scheduling.md).

### 14.1 Entry Format

Each entry maps an instruction class to two values:

| Field        | Type  | Meaning                                           |
| ------------ | ----- | ------------------------------------------------- |
| `latency`    | `u32` | Estimated cycles from issue to result available   |
| `throughput` | `f32` | Peak operations per cycle (reciprocal throughput) |

### 14.2 Representative Entries (Cortex-A class)

| Instruction class          | Latency | Throughput | Notes                        |
| -------------------------- | ------- | ---------- | ---------------------------- |
| `add`, `sub`, `and`, `orr` | 1       | 2.0        | simple ALU                   |
| `mul`                      | 3       | 1.0        | integer multiply             |
| `sdiv`, `udiv`             | 12      | 0.08       | integer divide (variable)    |
| `ldr` (L1 hit)             | 4       | 2.0        | load from L1 cache           |
| `ldr` (L2 hit)             | ~12     | ~1.0       | load from L2 cache           |
| `str`                      | 1       | 2.0        | store (issue latency)        |
| `csel`                     | 1       | 2.0        | conditional select           |
| `fmadd`                    | 4       | 2.0        | fused multiply-add (FP)      |
| `fadd`, `fsub`             | 2       | 2.0        | FP add/sub                   |
| `fdiv` (f64)               | ~15     | ~0.07      | FP divide (variable)         |
| `b.cc` (predicted)         | 0       | 2.0        | branch (correctly predicted) |
| `b.cc` (mispredicted)      | ~12     | —          | branch misprediction penalty |

These values are approximate, representative of a generic Cortex-A78 class
core. They are not cycle-accurate and should not be used for precise
performance modeling.

### 14.3 Scope and Limitations

- The target descriptor is part of the compiler, not user-configurable. Same
  compiler version + same `#target` = same descriptor values.
- Values are estimates. Real hardware behavior depends on microarchitectural
  state (cache contents, branch predictor history, pipeline occupancy) that
  is not modeled.
- **Future extension point:** user-provided descriptors may use
  `#target(descriptor = "path")` for custom cores after a checked descriptor
  file format and provenance contract are designed.
- Dependency chain queries (§6.9) use the descriptor for latency estimates.
  If no descriptor is loaded, they report chain length in ops.
