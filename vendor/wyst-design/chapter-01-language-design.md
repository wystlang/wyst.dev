---
title: "Chapter 1: Wyst Language Design"
group: chapter
chapter: 1
order: 1
summary: "Language identity, principles, no compiler-exploitable UB, effect system, and compiler philosophy."
---

# Chapter 1: Wyst Language Design

This chapter is the conceptual map for Wyst. It summarizes memory ordering,
effects, ABI, IR, object files, and tooling; the canonical definitions are
linked below.

> **Chapter scope.** This chapter states the identity, principles, and
> high-level rules of the language. When a topic is defined in more detail
> elsewhere, this chapter summarizes and links.
>
> Canonical definitions live in the following files:
>
> | Topic                                      | Canonical file                                                     |
> | ------------------------------------------ | ------------------------------------------------------------------ |
> | Type system, conversions, aggregates       | [chapter-06-types.md](chapter-06-types.md)                         |
> | Address types (`@T`, `@volatile T`, `@mmio T`) | [chapter-06-types.md §1.4.1](chapter-06-types.md)                  |
> | Struct, bitfield, enum layout              | [chapter-06-types.md §1.6, §1.6.1, §1.6.2](chapter-06-types.md)    |
> | Memory model (ordering, races)             | [chapter-09-memory-model.md](chapter-09-memory-model.md)           |
> | Volatility, `#acquire`/`#release`          | [chapter-09-memory-model.md §1.3.1](chapter-09-memory-model.md)    |
> | Runtime primitives (`%`-prefixed)          | [chapter-11-intrinsics.md](chapter-11-intrinsics.md)               |
> | Atomic runtime primitives                  | [chapter-11-intrinsics.md §1.3.2](chapter-11-intrinsics.md)        |
> | System register access                     | [chapter-11-intrinsics.md §1.3.3](chapter-11-intrinsics.md)        |
> | Trap / cache / TLB / hint primitives       | [chapter-11-intrinsics.md §1.3.4–1.3.6](chapter-11-intrinsics.md)  |
> | Per-CPU / TLS                              | [chapter-11-intrinsics.md §1.3.7](chapter-11-intrinsics.md)        |
> | Functions, control flow                    | [chapter-08-functions.md](chapter-08-functions.md)                 |
> | `#pin` register affinity                   | [chapter-08-functions.md §2.3](chapter-08-functions.md)            |
> | `#asm` inline assembly                     | [chapter-08-functions.md §2.9](chapter-08-functions.md)            |
> | SIMD / vector syntax                       | [chapter-12-simd.md](chapter-12-simd.md)                           |
> | `#schedule` semantics, layout constraint   | [chapter-13-scheduling.md](chapter-13-scheduling.md)               |
> | Modules, imports, layout, `#section`       | [chapter-04-modules.md](chapter-04-modules.md)                     |
> | Alignment, `#exception_vector`             | [chapter-14-exception-vectors.md](chapter-14-exception-vectors.md) |
> | Boot entry contract                        | [chapter-05-boot.md](chapter-05-boot.md)                           |
> | Debug information (DWARF)                  | [chapter-23-debug-info.md](chapter-23-debug-info.md)               |
> | Calling convention (Native, AAPCS)         | [chapter-15-abi-spec.md](chapter-15-abi-spec.md)                   |
> | Operators, precedence, arithmetic          | [chapter-07-operators.md](chapter-07-operators.md)                 |
> | Formal grammar (PEG)                       | [appendix-b-grammar.md](appendix-b-grammar.md)                     |
> | Object file format, relocations            | [chapter-16-object-format.md](chapter-16-object-format.md)         |
> | Compiler IR (SSA, regions, ops)            | [appendix-a-ir.md](appendix-a-ir.md)                               |
> | Target descriptor, dependency chains       | [appendix-a-ir.md §6.9, §14](appendix-a-ir.md)                     |
> | `#likely`, `#unlikely`, `#cold`            | [chapter-08-functions.md §2.7.2](chapter-08-functions.md)          |
> | `select(cond, a, b)`                       | [chapter-07-operators.md](chapter-07-operators.md)                 |
> | `#shared`, `#cache_line_width()`           | [chapter-09-memory-model.md §9.12](chapter-09-memory-model.md)     |
> | Prefetch, non-temporal, cycle counter      | [chapter-11-intrinsics.md §1.3.8](chapter-11-intrinsics.md)        |
> | Store-to-load forwarding hazards           | [chapter-09-memory-model.md §9.10](chapter-09-memory-model.md)     |
> | Hot/cold section conventions               | [chapter-04-modules.md](chapter-04-modules.md)                     |
> | `#field_offset(T, field)`, `#repr`         | [chapter-06-types.md](chapter-06-types.md)                         |
> | Effect system, `#deny`                     | chapter-01-language-design.md (this file)                          |
> | Effect categories on runtime primitive ops | [appendix-a-ir.md §6.8](appendix-a-ir.md)                          |
> | TMA vocabulary                             | chapter-01-language-design.md (this file)                          |

### Core Identity

Wyst is a semantic ARM64 systems language and assembler focused on:

- reproducible lowering
- explicit machine semantics
- no compiler-exploitable undefined behavior
- performance transparency
- readable low-level programming
- architecture-aware tooling

Wyst is intentionally positioned between:

- traditional assembly
- compiler IRs
- systems programming languages

It is best understood as:

> a human-readable semantic IR for machine-oriented programming.

---

## Design Constraints

Wyst must preserve:

- explicit dataflow
- explicit memory behavior
- deterministic lowering
- inspectable performance behavior
- direct ARM64 correspondence

Wyst intentionally avoids:

- hidden optimization passes
- automatic algorithmic rewrites
- opaque compiler behavior
- implicit vectorization
- hidden allocation semantics
- compiler-exploitable undefined behavior

The assembler may:

- select legal encodings
- select architecture-specific instruction forms
- schedule instructions within explicit permissions
- optimize layout and alignment

The assembler may not:

- silently change algorithms
- silently rewrite control flow
- introduce hidden memory behavior
- perform hidden global optimization

---

## No Compiler-Exploitable Undefined Behavior

Wyst provides two behavior guarantees.

**Guarantee 1 — No compiler-exploitable undefined behavior.** The compiler
never uses an unspecified program state as a license to transform, remove,
or reorder code. In C, a compiler may assume signed overflow does not occur
and delete branches on that basis. In Wyst, no such assumption is ever made.
If the source says `x + 1`, the compiler emits `add`. Period.

**Guarantee 2 — Named behavior categories for invalid or unusual operations.**
Wyst does not place unrelated edge cases into one broad bucket. Every emitted
invalid or unusual operation has exactly one behavior category from the
taxonomy below. Ill-formed source that is rejected before emission is listed as
`Defined` because the specified result is a diagnostic rather than a runtime
instruction.

This is not the same as memory safety. Wyst does not prevent invalid memory
access. It guarantees the compiler will not exploit the possibility of such
access to generate surprising code. The programmer retains responsibility for
avoiding invalid operations in safety-critical paths.

### Behavior Taxonomy

| Category | Meaning | Optimizer consequence |
| -------- | ------- | --------------------- |
| Defined | Wyst specifies the exact compile-time diagnostic or runtime result. | The optimizer may use only the specified value or diagnostic rule. It gets no license to assume the edge case cannot occur. |
| Target-defined | The selected target descriptor, ABI profile, or architecture manual specifies the result. | The optimizer may use only target facts that are explicitly selected for the current build. It gets no portable impossible-state assumption. |
| Indeterminate bits | The program observes a machine bit pattern whose exact bits are not specified by Wyst. The value is still an ordinary value of its static type. | The optimizer may not treat the value as poison, undef, uninitialized IR, or a fact that justifies deleting unrelated code. |
| Architectural fault or trap | The emitted operation may synchronously fault, trap, or complete according to the selected architecture and current machine state. | The optimizer must preserve the emitted operation and surrounding observable behavior unless a separate explicit rule permits motion or deletion. |
| Trusted-contract violation | The program supplied a false ABI, assembly, address, function-pointer, or foreign-interface assertion. | The compiler may rely on the explicitly trusted contract only for the operation that needs it; the category itself does not imply arbitrary impossible-state assumptions. |

No category grants C-style undefined-behavior optimization power. Any optimizer
permission must be separately and explicitly specified by a construct such as
`#asm(pure)`, a checked `#schedule` region, or a documented target descriptor
fact. In particular, `Indeterminate bits` values never behave like LLVM
`poison` or `undef`; they are values with unspecified contents, not optimizer
fuel.

### Trust-Boundary Model

A trust boundary is any construct where the program supplies a fact the compiler
cannot prove from a Wyst body or checked target descriptor. The compiler records
the fact as an assertion, not a proof. A false assertion is a
`Trusted-contract violation`: the emitted operation may execute incorrectly at
that boundary, but the assertion does not become general-purpose undefined
behavior and does not let the optimizer assume unrelated impossible states.

All trust-boundary constructs share this model:

| Construct | Asserted fact | Compiler assumption | If the assertion is false |
| --------- | ------------- | ------------------- | ------------------------- |
| Raw-address assertion, including an explicit `as.address` raw integer to `@T`, `@volatile T`, or `@mmio T` boundary | The raw address denotes storage suitable for the asserted address type, volatility contract, and MMIO-intent contract. | Later typed loads, stores, atomics, and address operations use the asserted address type at that use. | The specific access may fault, trap, read or write the wrong storage, or violate the device protocol; unrelated code is not deleted or reordered as UB fallout. |
| `#trusted_cast<@(args) -> ret>(addr)` or `#trusted_cast<@[aapcs] (args) -> ret>(addr)` | The raw address, function signature, return type, and calling convention identify a callable function entry. | The constructed function pointer has the asserted type; calls through it use that signature and ABI. | The indirect call may branch to the wrong address or interpret registers/stack incorrectly; the false assertion is confined to that constructed pointer and its uses. |
| Foreign declarations and object/header facts without a Wyst body | The linked symbol exists and obeys the declared type, calling convention, and externally documented side effects. | Calls and address-taking use the declaration as the boundary contract. | The emitted call or data reference follows the declaration and may miscommunicate with the foreign code or object. |
| Manually stated foreign effects and library contracts not proven from a body | The named API has the stated effects, allocation behavior, storage identity, error behavior, and protocol constraints. | Diagnostics and explain reports may use the stated contract only for that API boundary. | Code at that API boundary may observe wrong effects or protocol behavior; other calls do not inherit the false fact. |
| Inline assembly effects, clobbers, operands, stack options, and `#asm(pure)` | The assembly body performs only the declared effects, clobbers only the declared registers/memory state, and satisfies the stack and purity options. | Register allocation, `#deny` propagation, scheduling, and report output use the checked declaration. Recognized contradictions are rejected before emission. | The assembly may corrupt state or perform undeclared effects at that block; only the explicit `#asm` permissions apply. |
| ABI overrides such as `[aapcs]` functions and function-pointer types | The boundary obeys the selected ABI's register, stack, parameter, return, and ownership rules. | Calls, prologues, epilogues, and function-pointer signatures are lowered for the asserted ABI. | The call boundary may pass or receive values incorrectly; no unrelated optimizer assumption is created. |

Diagnostics for an operation that needs one of these facts must name the trusted
fact required to accept the operation. For example, a raw integer-to-function
pointer `as.address` conversion is rejected until the program writes `#trusted_cast`, and the
diagnostic identifies the required function-pointer address, signature, and ABI
assertion.

Explain reports label every reported fact as `proven` or `asserted`. Proven
facts come from checked source structure, typed IR, target descriptors, or
lowering artifacts. Asserted facts come from trust-boundary constructs and carry
the source location of the assertion plus a `trustedFact` label in JSON reports.

This version does not add a project or function switch that prohibits selected
trust-boundary categories. If such a switch is added later, it must be a
separate semantic feature row and must reject prohibited categories before IR
lowering instead of silently ignoring them.

### Principles

- **No compiler-exploitable UB.** There is no program state the compiler may
  use as a license for transformation. Arithmetic, control flow, and memory
  operations are emitted as written.
- **Integer arithmetic wraps.** Signed and unsigned overflow wraps two's
  complement on the type width. No runtime check, no hidden branch, no
  debug/release mode difference. Programs may rely on wrap-around.
- **Machine behavior is named.** When the target architecture defines a result
  or fault condition, Wyst exposes that as `Target-defined` or
  `Architectural fault or trap`.
- **No silent compiler traps.** The compiler does not insert panic, abort, or
  trap instructions unless the programmer explicitly requests them.

### Operation Classification

| Operation | Category | Wyst behavior |
| --------- | -------- | ------------- |
| Signed or unsigned integer overflow in `+`, `-`, `*`, `/`, or `<<` | Defined | Two's-complement wrap at the type width. |
| Integer divide by zero | Defined | `x / 0` produces `0`; `x % 0` and `x %% 0` produce `x`. |
| Most-negative signed integer divided by `-1` | Defined | Quotient wraps to the input value; remainder is `0`. |
| Shift count outside the nominal element width | Defined | Count is reduced modulo `max(32, width(T))`; signed counts are rejected. |
| Floating-point arithmetic exceptions | Defined | IEEE 754 result for the selected operation. |
| Float-to-integer conversion of out-of-range, `NaN`, or infinity | Target-defined | The selected architecture's conversion instruction defines the result. |
| Access through an unmapped, stale, null, non-canonical, or otherwise invalid data address | Architectural fault or trap | The emitted load/store may fault or complete according to the active translation and memory attributes. |
| Misaligned ordinary scalar access | Architectural fault or trap | The emitted access may complete or fault according to the selected architecture, alignment controls, and memory type. |
| Misaligned non-temporal pair, vector, exclusive, or other alignment-restricted access | Architectural fault or trap | The emitted instruction may fault according to the architecture. |
| Source `goto` that crosses an invalid boundary, enters a prologue, abandons a live frame, or targets a malformed label | Defined | The compiler rejects the source before emission. |
| Function-pointer arithmetic, ordered comparison, memory access, or convention mismatch visible in source types | Defined | The compiler rejects the source before emission. |
| Function pointer constructed with `#trusted_cast` from a false address, signature, or ABI assertion | Trusted-contract violation | The call is emitted according to the trusted type; a false assertion is the program's contract violation. |
| Ordinary read of a local before initialization | Defined | The compiler rejects the source before emission; no implicit zeroing and no implicit indeterminate value are manufactured. |
| Explicit raw read through `%read_uninit`, padding, or inactive payload bytes reached through raw memory | Indeterminate bits | The observed bits are ordinary typed values and never optimizer poison. |
| Access-atomic data race | Target-defined | The load observes a value permitted by the ARM64 memory model for the selected memory type. |
| Tearing data race on a non-access-atomic operation | Indeterminate bits | The observed bits may combine sub-access results and need not equal any whole value stored by an agent. |
| Foreign ABI mismatch that is visible in Wyst declarations or function pointer types | Defined | The compiler rejects the mismatch before emission. |
| False foreign declaration, C header fact, object symbol assertion, or variadic ABI assertion trusted by the program | Trusted-contract violation | The emitted boundary follows the declaration the program supplied. |
| Unsupported inline assembly mnemonic, operand, branch target, clobber, or effect declaration recognized as contradictory | Defined | The compiler rejects the block before emission. |
| False inline assembly declaration not provable by the compiler, including missing clobbers or a false `pure` assertion | Trusted-contract violation | The program broke the checked escape-hatch contract; only separately declared optimizer permissions apply. |

### Contrast with C/C++

C and C++ define behavior only for "valid" programs and leave everything else
as UB — a contract the compiler exploits for optimization. When a C compiler
sees signed overflow, it may assume it cannot happen and delete the branch
that follows. This is legal under the standard and produces real security
vulnerabilities.

Wyst removes the compiler's license to exploit unspecified states:

- The compiler never assumes overflow cannot occur
- The compiler never assumes pointers are non-null unless the programmer proves it
- The compiler never assumes memory accesses are in-bounds
- The compiler never transforms code based on "this is UB, so it can't happen"

The tradeoff is that Wyst also does not prevent invalid memory access. It
classifies invalid access as `Architectural fault or trap`, `Target-defined`,
or `Trusted-contract violation` depending on the actual operation. That is a
meaningful improvement in predictability, not a safety guarantee.

### Integer Wrapping

All integer arithmetic — signed and unsigned — wraps on overflow. This is the default and only behavior.

- No runtime checks
- No hidden branches
- No panic on overflow
- No debug/release mode differences

If checked arithmetic is needed, it is an explicit operation with a defined failure mode. The default `+`, `-`, `*` operators never check.

### Relationship to Reproducibility

No compiler-exploitable UB is a prerequisite for reproducible lowering. If
the compiler could exploit unspecified states, two compilations of the same
source with different optimization contexts could produce different code. By
removing the license to exploit unspecified states, Wyst ensures that the
output is determined by the source, not by compiler assumptions about what
cannot happen.

---

## Semantic Model

### Variable Model and Register Affinity

Wyst programs are written in terms of **named variables**, not registers.
The register allocator owns the mapping from variables to physical registers.
The programmer expresses register affinity only when the hardware contract
requires a specific register, and only via the `#pin` directive.

#### Register Names Are Reserved Tokens

The following identifiers are reserved by the lexer and may not be used as
variable, parameter, constant, function, or field names anywhere in a Wyst
program:

| Class                  | Reserved tokens                                            |
| ---------------------- | ---------------------------------------------------------- |
| General-purpose 64-bit | `x0`–`x30`                                                 |
| General-purpose 32-bit | `w0`–`w30`                                                 |
| SIMD/FP 128-bit        | `v0`–`v31`                                                 |
| SIMD/FP scalar views   | `b0`–`b31`, `h0`–`h31`, `s0`–`s31`, `d0`–`d31`, `q0`–`q31` |
| Stack pointer          | `sp`, `wsp`                                                |
| Link register          | `lr` (alias for `x30`)                                     |
| Frame pointer          | `fp` (alias for `x29`)                                     |
| Platform register      | `ip0` (`x16`), `ip1` (`x17`)                               |
| Zero register          | `xzr`, `wzr`                                               |

These tokens are legal **only** in two positions:

1. Inside the argument list of a `#pin(...)` directive on a declaration
   (e.g. `counter : u64 #pin(x19) = 0`).
2. Inside the body of an `#asm { ... }` block.

Anywhere else they are a compile error. In particular:

- Writing `x0 = x1 + x2` outside `#asm` is a syntax error.
- Declaring `x0 : u64 = 0` is a syntax error (cannot bind a reserved token).
- A parameter list cannot name a parameter `x0`.

#### Variables, Not Registers

Every named binding in Wyst is a variable. The register allocator places
variables in physical registers as a pure function of source, compiler
version, and target. The programmer never writes physical registers as
arithmetic operands; the assembly-like form `x0 = x1 + x2` does not exist
at the Wyst surface level. It exists only inside `#asm` bodies, where the
programmer has taken explicit responsibility for register-level scheduling.

Compound operations apply to variables:

<!-- wyst-contract: sketch -->
```wyst
counter : u64 = 0
counter += 1            // lowers to `add xN, xN, #1` for whichever xN the allocator picked
```

#### Register Affinity via `#pin`

When a value must live in a specific register because of a hardware or ABI
contract — firmware delivering a DTB pointer in `x0`, an exception handler
expecting the syndrome in a particular register, an `#asm` block whose
encoding is fixed — the programmer expresses this with `#pin` on the
declaration:

<!-- wyst-contract: sketch -->
```wyst
counter : u64 #pin(x19) = 0

_start :: (dtb : @u8 #pin(x0)) #noreturn {
    kernel_init(dtb)
    loop { %wfe() }
}
```

`#pin` is allowed on local variables and function parameters. It is not
allowed on globals or constants — a pinned global would silently reserve a
register program-wide, which is a hidden side effect Wyst does not permit.

`#pin` appears only at the declaration site. There is no statement-level
pin form. A variable's register affinity is fixed when it is introduced.

If a pin cannot be satisfied, the compiler emits a hard error. Pins are
never silently moved to a different register, silently spilled around a
call, or silently saved by an injected prologue. The full conflict catalog
is in [chapter-08-functions.md §2.3](chapter-08-functions.md), and includes:
register unavailable, two pins requesting the same register, caller-saved
pin live across a call, callee-saved local pin inside `#naked`, and rejection
of `#pin(sp)`/`#pin(x29)`.

#### Direct Register Manipulation

Programs that genuinely need to manipulate a physical register without going
through a Wyst variable (system instructions, register window saves, vector
table prologues) do so inside an `#asm` block. Inside `#asm`, register
tokens are first-class operands of the embedded assembler. Outside `#asm`,
they are tokens with no expression meaning.

This division gives Wyst two clean modes:

- **Wyst surface code** — variables only; the allocator owns registers.
- **`#asm` blocks** — explicit register manipulation; the programmer owns
  registers and declares I/O to the surrounding scope.

`#pin` is the bridge: a `#pin(xN)` variable can be referenced by name from
both Wyst code and an `#asm` block, and the allocator guarantees the binding
lives in `xN` at the `#asm` site.

See the [chapter-08-functions.md §2.3](chapter-08-functions.md), for the full `#pin`
specification, and section 2.9 for the `#asm` specification.

---

## Memory Model

Wyst uses a memory-interpretation model instead of pointer-centric semantics.
Addresses are typed values (`@T`) with a 64-bit machine representation; the
qualifier `@volatile T` marks an access contract whose loads and stores are
observable to the compiler and cannot be elided, merged, or reordered across
other compiler-visible memory effects. `@mmio T` adds programmer intent that
the address denotes MMIO. ARM64's Normal and Device memory attributes are not
created by either type; they come from page tables or target/runtime platform
configuration and may also be recorded as target facts.

Canonical references:

- Address types, arithmetic, conversion rules → [chapter-06-types.md §1.4.1](chapter-06-types.md)
- Memory interpretation model, `#acquire` / `#release`, barrier runtime primitives
  (`%dsb`, `%dmb`, `%isb()`, `%compiler_barrier()`) → [chapter-09-memory-model.md §1.3.1](chapter-09-memory-model.md)
- Execution model, happens-before, races, atomicity -> [chapter-09-memory-model.md](chapter-09-memory-model.md)

---

## Structured Control Flow

Wyst favors structured control flow (`if`, `while`, `loop`, `repeat`) with
explicit low-level escape hatches (`label`, `goto`) for hardware-required
shapes such as `#ventry` slots. Structured syntax improves CFG visibility,
dependency analysis, and tooling integration; the escape hatches keep
hardware code expressible.

Canonical reference: [chapter-08-functions.md §2.4–2.5](chapter-08-functions.md).

---

## Effect System

Wyst tracks which architectural side effects a function may perform and
lets the programmer restrict them with `#deny`. This gives kernel code
something that even Rust does not have in a first-class way: compile-time
enforcement of architectural boundaries — "this module must not touch
system registers," "this interrupt handler must not mask interrupts."

Canonical references: [appendix-a-ir.md §6.8](appendix-a-ir.md) (effect categories on runtime
primitive IR ops), [appendix-a-ir.md §7](appendix-a-ir.md) invariant 16 (verifier enforcement),
[appendix-b-grammar.md](appendix-b-grammar.md) (`#deny` production).

### Design

Effects are **inferred, not declared.** The compiler knows every
effect-introducing operation because Wyst has a closed runtime primitive set —
every `%mrs`, `%svc`, `%tlbi_*`, `%atomic_*`, etc. is a known compiler
primitive. The compiler assigns effect categories at the leaf (the
runtime primitive call) and propagates them upward through the call graph during
semantic analysis.

The programmer does not annotate what a function _does_ — the compiler
already knows. The programmer annotates what a function **must not do**,
using `#deny`.

### Effects, Authority, And Generated Resources

`#deny` tracks semantic effects and the explicitly modeled authority facts that
the compiler can check before lowering. It does not track generated backend
resources.

| Kind | Examples | Reporting surface |
| ---- | -------- | ----------------- |
| Semantic effects | volatile accesses, MMIO-intent loads/stores, system-register access, traps, atomics, barriers, cache/TLB maintenance, CPU halt, interrupt-mask changes, floating-point state access, performance-counter reads | `#deny`, effect diagnostics, `wync explain effects` |
| Authority/trust facts | raw address assertion, retagging an address for volatile/MMIO-intent use, raw function-pointer construction or invocation, required privilege level, trusted foreign or assembly contracts, stack-address escape permission, target-provided memory-map facts | trust-boundary diagnostics and asserted facts in explain reports |
| Generated resources | frame bytes, spill/reload counts, register-class usage, code size, veneers, caller-owned aggregate copies, compiler-owned stack slots | `#frame(...)` post-lowering constraints, ABI/lowering reports, generated-manifest/object reports |

Retagging an address as `@volatile T` or `@mmio T` is an authority assertion.
It is not a memory access and does not create the architectural page-table
memory type. A later access through `@volatile T` introduces the
`volatile_access` effect; a later access through `@mmio T` introduces both
`volatile_access` and `mmio`. Ordinary local storage, tuple destructuring
storage, and `%addr_of(local)` stack-address materialization are generated
resource facts and do not introduce effect categories.

`#frame(max_bytes = N, max_spills = M)` is the function-level constraint for
generated frame resources. The compiler checks it after ABI lowering and
register allocation against the actual frame composition, including fixed frame
objects, spills and reload slots, outgoing call areas, caller-owned aggregate
copies, indirect-result storage, alignment padding, and assembly-required save
areas. Diagnostics and lowering explain reports identify the source value or ABI
rule that introduced each byte or spill.

### Effect Categories

| Category            | Introduced by                                                                 |
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
| `fp_state`          | runtime floating-point arithmetic, comparison, conversion, and FP/SIMD primitives |
| `perf_counter`      | `%read_cycle_counter`                                                         |

Some runtime primitives introduce multiple categories: `%daif_set` introduces
both `sysreg` and `interrupt_mask`.

The categories are deliberately coarse. They represent architectural
boundaries (privilege level, memory type, synchronization domain), not
individual instruction distinctions. TLB maintenance is separated from
cache maintenance because address-translation invalidation is a distinct
kernel boundary from cache-line cleaning, invalidation, or instruction-cache
coherency. Finer-grained categories can be added in future versions without
breaking existing `#deny` declarations.

### Inference

Effect inference is a whole-program pass during semantic analysis. It
runs after name resolution and type checking, before IR construction.

1. **Leaf assignment.** Every runtime primitive call and every volatile or
   MMIO-intent load/store is tagged with its effect categories from the table
   above. A cast to `@volatile T` or `@mmio T` records an address-authority
   assertion but does not introduce an access effect until the resulting
   address is read or written. Target-provided Device-memory ranges are mapping
   facts, not effects. Ordinary local and tuple bindings and `%addr_of(local)`
   are backend resource facts, not semantic effects. Runtime floating-point
   operations introduce
   `fp_state`; floating-point literals and pure moves do not by themselves
   introduce `fp_state`.

2. **`#asm` blocks.** An `#asm` block that does not carry an explicit
   `effects` annotation is conservatively assigned all effect categories.
   The programmer may narrow this with `#asm(effects: none)` or
   `#asm(effects: atomic, sysreg)` to declare which effects the assembly
   actually performs. The `effects: none` form is verified against the compiler's
   recognized ARM64 inline-assembly instruction table and is rejected if the
   body contains a recognized effectful instruction. Other explicit effect lists
   are the programmer's declaration for `#deny` propagation.

3. **Call graph propagation.** For every function, the compiler computes
   the union of effect categories from:
   - direct runtime primitive usage within the function body
   - `#asm` blocks within the function body
   - the inferred effect sets of all functions called from the body

   This produces a per-function effect set.

4. **Function-pointer calls.** An indirect call contributes the conservative
   effect upper bound of the function-pointer value. `#addr_of(f)`
   contributes `f`'s inferred effect set; assignments, phis, fields,
   arrays, returns, and parameters combine bounds by union. A pointer produced
   from `#trusted_cast<@(args) -> ret>(addr)`, an imported ABI table, external
   declaration without inspectable body, or otherwise unknown source is treated
   as all effect categories for `#deny` checking. Raw integer-to-function-pointer
   `as.address` conversions are rejected; the explicit `#trusted_cast` spelling records the
   programmer's ABI trust decision without claiming a narrower effect bound.
   This preserves the "single inferred effect set per function" model without
   adding user-written effect declarations to function-pointer types.

5. **`#deny` checking.** For every function (or module) with a
   `#deny(effect, ...)` attribute, the compiler intersects the inferred
   effect set with the denied set. A non-empty intersection is a
   compile-time error.

Because Wyst does whole-program single-pass compilation, the entire call
graph is visible. There are no separately-compiled modules that could
hide effects.

### `#deny` — Restricting Effects

`#deny` is a directive on a function or module declaration. It takes a
comma-separated list of effect categories:

<!-- wyst-contract: sketch -->
```wyst
#deny(sysreg, trap)

format_string :: (buf : @u8, len : u64) -> u64 {
  // compile error if anything reachable from here
  // touches %mrs, %msr, %svc, %hvc, etc.
}
```

#### Function-level `#deny`

<!-- wyst-contract: sketch -->
```wyst
#deny(interrupt_mask)

allocator_alloc :: (size : u64) -> @u8 {
  // uses atomics — that's fine, `atomic` is not denied
  lock : u64 = #acquire u64@[lock_addr]
  // ...
  // but if someone adds %daif_clr here, compile error
}
```

#### Module-level `#deny`

<!-- wyst-contract: check-pass -->
```wyst
#module userspace_lib

#deny(sysreg, trap, interrupt_mask, exception_return, cache_maintenance, tlb_maintenance)
// everything in this module is guaranteed to be
// EL0-safe — no privileged operations anywhere
```

A module-level `#deny` applies to every function in the module. A
function-level `#deny` within such a module is additive — it can deny
additional categories but cannot un-deny a module-level restriction.

#### Error Diagnostics

When a `#deny` violation is detected, the compiler traces the full call
chain from the denied function to the leaf runtime primitive:

```text
error: effect `sysreg` denied on `format_string`
  --> fmt.wyst:8:5
   | result = helper(buf, len)
   |          ^^^^^^ calls `helper`
  --> util.wyst:22:9
   |     el = %mrs(CurrentEL)
   |          ^^^ introduces `sysreg` effect
   |
note: denied at:
  --> fmt.wyst:1:1
   | #deny(sysreg, trap)
```

The trace includes every intermediate call site so the programmer can
see exactly how the forbidden effect leaked in.

#### Interaction with `#asm`

An unannotated `#asm` block is conservatively treated as introducing all
effect categories. This means any `#deny` restriction on a function
containing an unannotated `#asm` block will fire. The programmer
resolves this by annotating the `#asm` block:

<!-- wyst-contract: sketch -->
```wyst
#deny(sysreg)
fast_memcpy :: (dst : @u8, src : @u8, len : u64) {
    #asm(effects: none) {
        // pure register-to-register computation
        // no system register access
        body { ... }
    }
}
```

The available `#asm` effect annotations are:

| Form                           | Meaning                                  |
| ------------------------------ | ---------------------------------------- |
| `#asm(effects: none)`          | no recognized `#deny` effect categories (checked against the inline-asm instruction table) |
| `#asm(effects: atomic)`        | only atomic operations                   |
| `#asm(effects: sysreg, trap)`  | only system register access and traps    |
| `#asm { ... }` (no annotation) | conservatively: all effects              |

`effects: none` is distinct from `#asm(pure)`. The `pure` annotation
controls the memory fence and clobber model (see
[chapter-08-functions.md §2.9](chapter-08-functions.md)); the `effects` annotation controls
which effect categories the block introduces for `#deny` checking. They
are orthogonal and may be combined: `#asm(pure, effects: none)`.

For `effects: none`, the compiler rejects recognized effectful ARM64
instructions such as `mrs`/`msr`, exception/trap instructions, cache
maintenance, TLB maintenance, barriers, exclusive or atomic memory operations,
ordinary loads/stores, floating-point/SIMD instructions, and CPU-wait
instructions. Use an explicit non-`none` effect list, or omit the effect
annotation and accept the conservative all-effects default, when the body does
perform architectural effects.

Stack-pointer state is verified separately from the `#deny` effect system.
`#asm(sets_sp, effects: none)` may establish `sp` in a `#naked` function when
the `sets_sp` verifier contract is satisfied. A
`#asm(preserves_sp, effects: none)` block may inspect `sp` when the
`preserves_sp` verifier contract proves the stack pointer is unchanged. These
stack-state contracts do not introduce a separate effect category, and denying
every effect category does not by itself reject a verifier-approved stack-state
block.

### What `#deny` Does Not Do

- **No runtime checks.** `#deny` is pure compile-time analysis. It
  adds zero instructions to the output.
- **No effect declarations on functions.** The programmer never writes
  "this function has effect X." The compiler infers that automatically.
  `#deny` is the only programmer-facing surface.
- **No effect polymorphism.** A function has a single inferred effect
  set. There are no effect-generic functions or effect parameters. This
  keeps the system simple and avoids the complexity of effect algebras.
- **No transitive un-deny.** A function cannot remove a `#deny`
  restriction inherited from its module. The restriction is monotonic —
  it can only grow, never shrink.
- **No backend resource budget.** `#deny` does not reject compiler-generated
  stack use. Use `#frame(max_bytes = ..., max_spills = ...)` when a function
  must prove a post-lowering frame budget.

### Design Rationale

| Choice                                              | Reason                                                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inferred effects, not declared                      | Wyst has a closed runtime primitive set and whole-program compilation — the compiler already knows what every function does. Declarations would be redundant noise.                                     |
| `#deny` (restrictions) not `#effect` (declarations) | The interesting question is never "what does main do" — it's "does this utility function accidentally use a privileged primitive?" Restrictions are the useful direction.                              |
| Coarse categories                                   | Kernel code cares about architectural boundaries (EL0 vs EL1, Normal vs Device memory, atomic vs non-atomic), not individual instruction distinctions. The closed category set covers useful semantic restrictions without treating backend resources as operations. |
| Module-level `#deny`                                | Enforcing "this entire subsystem is EL0-safe" as a single declaration is the highest-value use case. Without module-level `#deny`, every function would need its own annotation.                       |
| Conservative `#asm` default                         | `#asm` is opaque to the compiler. Assuming all effects is the safe default; the programmer narrows it when needed.                                                                                     |
| No entry-point accumulation                         | Effects propagate upward but `main` (or `_start`) never needs an annotation because restrictions flow downward via `#deny`, not upward via declarations.                                               |

---

## Alignment

`#align(n)` constrains the assembler to place a label, function, or
`.rodata` constant at an address that is a multiple of `n` bytes (power
of two, compile-time constant).

Canonical reference: [chapter-14-exception-vectors.md §10.1](chapter-14-exception-vectors.md).

---

## Exception Vectors

ARM64 exception vectors have strict hardware requirements (2 KB table
alignment, exactly 16 slots, 128 bytes per slot) that Wyst encodes
directly via the `#exception_vector` / `#ventry` construct. Slot
position determines architectural meaning; slot names are free-form.

Canonical reference: [chapter-14-exception-vectors.md §10.2](chapter-14-exception-vectors.md).
Worked boot example using these vectors: [chapter-05-boot.md](chapter-05-boot.md).

---

## Bitfields

`bitfield(T)` declarations name bit ranges within a `u8`/`u16`/`u32`/`u64`
backing integer. Field reads lower to `ubfx`, writes to `bfi`. They are
the primary tool for ARM64 system registers and hardware control words.
Field writes are register-level RMW and are **not** atomic on memory; use
[chapter-11-intrinsics.md §1.3.2](chapter-11-intrinsics.md) atomics for shared state.

Canonical reference: [chapter-06-types.md §1.6.1](chapter-06-types.md).

---

## Compile-Time Assertions

`#static_assert(expr, "message")` halts compilation with a diagnostic if
the expression is false. `#size_of(T)`, `#align_of(T)`, and `#len(array)` are
compile-time queries for layout verification and fixed storage contracts
(hardware contracts, exception-frame stability, C ABI compatibility).

Canonical reference: [chapter-06-types.md §1.15](chapter-06-types.md).

---

## Scheduling Semantics

`#schedule(strict | relaxed)` are enforceable ordering constraints
(reproducible). `#schedule(throughput | latency)` are optimization hints
(deterministic within one compiler binary but not stable across compiler
versions; never use in `#ventry` bodies).

Canonical reference: [chapter-13-scheduling.md](chapter-13-scheduling.md).

---

## SIMD and Vector Semantics

`[T:N]` vector types are first-class with element-wise arithmetic that
maps to a single NEON instruction when the vector fits in 16 bytes.
Wyst reserves the `[T:N]` syntax for NEON-sized SIMD vectors; SVE/SVE2 are out
of scope (see "ARM64 Feature Scope" above). `[N]T` is always an array.

Canonical reference: [chapter-12-simd.md](chapter-12-simd.md).

---

## Performance Transparency

Wyst exposes observable machine behavior.

Examples:

- dependency chains
- cache behavior
- alignment effects
- issue utilization
- branch predictability
- memory ordering
- backend pressure

Explain mode:

```text
Loop throughput: ~2.3 cycles

Bottlenecks:
- load-use latency
- branch dependency
```

The goal is not cycle-perfect simulation.

The goal is:

> observable computational behavior.

---

## Reproducibility Model

Wyst guarantees **reproducible lowering**: given the same source, the same
compiler version, the same build optimization mode, the same canonical
`#target(...)` configuration, the same source input manifest, and the same
selected scheduling modes including implicit `schedule.default`, the compiler
always produces identical output.
Reproducibility is scoped to these inputs; it is not guaranteed across compiler
versions, build optimization modes, target configurations, source manifests, or
different `#schedule` modes.

The `#target` input is the entire canonical `#target(...)` argument list, not
only `arch` and `cpu`. Fields such as `features`, `el`, and `cache_line`
participate in reproducibility because they can change compile-time queries,
layout checks, intrinsic availability, and instruction lowering. An omitted
field participates through its specified default value.

Requirements for reproducibility:

- same compiler version
- same build optimization mode (`--optimization` or the project manifest's
  `optimization` field, defaulting to `reproducible`)
- same source input manifest:
  - explicit source-list mode: the same ordered command-line source paths and
    file contents;
  - explicit root-file mode with `--source-root`: the same root file, source
    roots, and import closure discovered by the project traversal rules;
  - project mode: the same `wyst.project`, ordered `source_roots`, root module,
    layout path and contents, and import-closure traversal described in
    [chapter-03-project-builds.md](chapter-03-project-builds.md)
- same canonical target configuration, including the full `#target(...)`
  argument list and defaults
- same selected scheduling modes, including implicit `schedule.default`

**Optimization hint modes are same-binary deterministic but cross-version
unstable.** `#schedule(throughput)` and `#schedule(latency)` must produce the
same output for the same source input manifest, compiler binary, build
optimization mode, and target across invocations. They may produce different
output across compiler versions or microarchitecture targets. Use them only in
paths where cross-version instruction-order stability is not required.

Register allocation is a pure function of the source, compiler version, and
target. The same inputs always produce the same allocation.

---

## ABI Strategy

Wyst has two calling conventions: the **Native Wyst ABI** (default,
Wyst-to-Wyst) and **AAPCS64** (opt-in via `[aapcs]`, used for C interop
and OS boundaries). Native diverges from AAPCS64 in two main areas for
performance: `v8`–`v15` are fully caller-saved, and up to four integer
return values use `x0`–`x3`. Large by-value aggregate arguments in both
conventions use caller-owned copy storage and pass the copy address through
ordinary integer argument allocation; `x8` is reserved for indirect results.
Variadic Wyst functions do not exist; use explicit count-and-pointer
parameters.

Canonical reference: [chapter-15-abi-spec.md](chapter-15-abi-spec.md). Function-pointer type
discipline (`@(args) -> ret` vs `@[aapcs] (args) -> ret`):
[chapter-08-functions.md §2.6](chapter-08-functions.md) and [chapter-15-abi-spec.md §B.5](chapter-15-abi-spec.md).

---

## Tooling Philosophy

Tooling is a core language feature.

Wyst tooling should expose:

- CFGs
- dependency graphs
- cacheline visualization
- PMU correlation
- scheduling analysis
- generated instruction streams

Example commands:

```text
wync build <project-dir|path/to/wyst.project>
wync check <project-dir|path/to/wyst.project>
wync explain E####
wync explain lowering <project-dir|path/to/wyst.project>
wync rebuild-benchmark <project-dir|path/to/wyst.project>
```

---

## Syntax Direction

Wyst syntax should prioritize:

- explicit structure
- parse determinism
- IR visibility
- machine readability
- human readability

Canonical block syntax:

<!-- wyst-contract: sketch -->
```wyst
if cond {
    body
}
```

Indentation-based syntax may exist as optional sugar, but brace-delimited syntax should remain canonical for tooling stability and CFG clarity.

---

## Compiler Architecture

### Default Optimization Profile

The default build profile is a reproducible lowering profile, not an
optimizing release profile. It may perform deterministic local
canonicalization required for compilation or directly implied by source:
compile-time constant evaluation, syntax-to-IR lowering, deterministic
instruction selection, deterministic register allocation, removal of unused
pure temporaries, and required object/relocation emission.

Default lowering must not perform hidden global optimization,
profile-guided optimization, hidden vectorization, hidden branch conversion,
hidden allocation or lifetime rewrites, hidden data-structure substitution,
or alias/UB-backed load-store rewrites.

Non-default build optimization modes must be explicit in the command or build
profile, and each mode must document whether it is byte-for-byte reproducible
under the Reproducibility Model's input catalog. Source-level `#schedule`
directives are a separate scheduling input, not build optimization modes.
Aggressive optimization passes need an explain/pass-trace story before they can
become candidates for any default profile.

This profile follows the explicit build optimization mode policy documented in
[chapter-17-optimization-modes.md](chapter-17-optimization-modes.md).

### High-Level Pipeline

```text
Lexer
  ↓
Parser
  ↓
AST
  ↓
Semantic Analysis
  ↓
Typed IR
  ↓
Dependency Graph
  ↓
ARM64 Lowering
  ↓
Scheduling
  ↓
Encoding
  ↓
Object File
```

### Stage Detail

**Parse → AST.** Source becomes a typed AST. Function bodies, control flow,
memory accesses, compile-time forms (`#addr_of`, `#len`), and runtime primitives
(`%atomic_load`, `%mrs`, etc.) are recognisable but not yet lowered.

**Constant Folding.** Compile-time expressions are evaluated. `#start()` /
`#end()` symbols are recorded as pending; resolved in the placement stage.

**Register Allocation.** Variables are assigned to ARM64 registers. `#pin`
constraints apply first; remaining variables are allocated by the compiler.
Register allocation is a pure function of source, compiler version, and
target triple. Tie-breaking must not use hash-based ordering, pointer-
derived ordering, or any input that varies across invocations — the same
source compiled with the same compiler version against the same target
produces the same register assignment on every invocation. This is a
specified invariant; reproducible lowering depends on it. Full algorithm
and tie-breaks in [appendix-a-ir.md §11](appendix-a-ir.md).

**Instruction Selection.** Semantic operations become ARM64 instructions.

**Scheduling.** Constrained scheduling per the `#schedule` directive in
scope: `strict` preserves source order exactly; `relaxed` reorders only
independent instructions; `throughput` and `latency` are optimization hints
whose output is deterministic within one compiler binary but may vary across
compiler versions or microarchitecture targets.

**Symbol Placement and Relocation.** The integrated linker assigns final
addresses to all symbols, satisfying `#region`, `#section`, and `#entry`
constraints from the layout module. Pending `#addr_of` references and
cross-module symbols are resolved. Slot size enforcement for `#ventry`
bodies is verified after placement.

**Binary Emission.** Machine code emitted. Output is reproducible under the
Reproducibility Model above: the same source input manifest, compiler version,
build optimization mode, canonical `#target(...)` configuration, and
`#schedule` modes produce identical output.

---

## ARM64 Feature Scope

Wyst targets the **ARMv8-A baseline** instruction set. Three
modern ARM64 features are explicitly out of scope for this version of the
language: SVE/SVE2, PAC, and MTE. None has a Wyst-surface representation;
specific instructions in these families can be exposed through the checked
`#asm` subset as encoder support is added.

### SVE / SVE2 (Scalable Vector Extension)

SVE introduces variable-length vector registers (128–2048 bits, hardware-
determined at runtime). Wyst's fixed-width `[T:N]` vector type cannot
express SVE — the lane count is a compile-time constant in the type,
which is incompatible with runtime-determined vector lengths. Wyst code
targeting platforms with SVE hardware compiles to NEON (fixed-width)
vector operations only.

**Extension point:** a future `[T:?]` or `#sve` region type that defers
lane count to runtime, with separate runtime primitives for SVE predicate
registers.

### PAC (Pointer Authentication)

PAC instructions (`pacia`, `autia`, etc.) sign and authenticate pointer
values using address bits above the VA range. Wyst's address model treats
addresses as plain `u64` integers, incompatible with PAC-tagged pointers
without explicit top-byte handling. The compiler does not emit `paciasp`
or `autiasp` in prologues/epilogues by default.

Full PAC support would require: prologue/epilogue generation controlled
by a `#pac` function attribute; an address type carrying PAC tag state
(e.g. `@signed(T)`); explicit `%sign` / `%auth` / `%strip` runtime primitives.

**Extension point:** a `#pac` function-level directive that enables
`paciasp` / `autiasp` emission, plus `@signed(@T)` for authenticated
pointers across trust boundaries. See [chapter-15-abi-spec.md §A.7](chapter-15-abi-spec.md)
for the ABI-level PAC behaviour already locked in.

### MTE (Memory Tagging Extension)

MTE stores a 4-bit tag in the top byte of a pointer and checks it against
a tag in memory-granule metadata on every load/store. Wyst's `@T` address
type uses the full 64-bit value with no provision for tag bits.

**Extension point:** a `@tagged(@T)` address type whose top byte is
managed by the language, with runtime primitives for tag allocation and the
`stg` / `ldg` instructions.

### Using These Features Today

All three remain inline-assembly territory rather than language-level
features. Code that requires SVE vector operations, PAC signing, or MTE tag
manipulation should use `#asm` once the required mnemonic has checked encoder
support in the compiler. By default, `#asm` blocks are full two-way compiler
memory fences (see [chapter-08-functions.md §2.9](chapter-08-functions.md)); operations within
them are invisible to alias analysis and reordering. `#asm(pure)` opts out
for register-only computations but is unsafe for code that touches memory or
system state.

---

## Internal IR

The IR should be:

- SSA-inspired
- typed
- dependency-aware
- memory-aware
- scheduling-aware

The IR should not become:

- LLVM-complex
- transformation-heavy
- optimizer-centric

The full IR specification — type system, op vocabulary, region tree,
textual form, verifier invariants — lives in [appendix-a-ir.md](appendix-a-ir.md). This section
states design intent only.

---

## CPU Modeling Strategy

Wyst models observable performance characteristics rather than hidden microarchitectural internals.

Expose:

- cache behavior
- latency estimates
- dependency depth
- branch predictability
- bandwidth pressure
- scheduling constraints
- TMA bucket analysis

Avoid:

- cycle-perfect simulation
- exact predictor modeling
- architecture-specific hidden heuristics

The performance model should remain:

- approximate
- inspectable
- measurable
- architecture-aware

### TMA Vocabulary

Future `wync explain` performance reports use the **Top-down Microarchitecture
Analysis (TMA)** vocabulary. TMA classifies every cycle into one of four
top-level buckets:

| Bucket                    | Meaning                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Retiring**              | Useful work — ops that produce results the program consumes                                               |
| **Frontend Bound**        | Pipeline starved because the frontend cannot deliver ops fast enough (i-cache misses, decode bottlenecks) |
| **Backend Bound: Memory** | Pipeline stalled waiting for data (cache misses, load-use latency, store-buffer pressure)                 |
| **Backend Bound: Core**   | Pipeline stalled on execution resources (divider, FP unit contention)                                     |
| **Bad Speculation**       | Work discarded due to branch misprediction or machine clears                                              |

These buckets are the output schema for future performance explain reports.
The compiler will **estimate** (not measure) which bucket dominates, based on
static analysis of IR dependency chains ([appendix-a-ir.md §6.9](appendix-a-ir.md)),
branch hints ([chapter-08-functions.md §2.7.2](chapter-08-functions.md)),
memory access patterns ([chapter-09-memory-model.md §9.10](chapter-09-memory-model.md)),
and the target descriptor ([appendix-a-ir.md §14](appendix-a-ir.md)).

The vocabulary aligns with ARM's top-down methodology (topdown-tool, SPE)
so that `wync explain` estimates can be validated against runtime PMU data.

---

## PMU and Runtime Analysis

Wyst should integrate runtime performance analysis.

Potential metrics:

- cache misses
- branch misses
- backend stalls
- IPC
- bandwidth pressure
- TLB misses

These measurements should correlate directly back to:

- source lines
- dependency graphs
- memory regions
- scheduling regions

---

## Visualization Goals

Wyst should support first-class performance visualization.

Examples:

### Dependency Graphs

Visualize:

- instruction dependencies
- critical paths
- scheduling freedom

### Cache Heatmaps

Visualize:

- locality
- cacheline usage
- false sharing

### Pipeline Visualization

Visualize:

- issue width
- bubbles
- stalls
- backend pressure

### Memory Traffic

Visualize:

- load/store density
- streaming behavior
- bandwidth pressure

---

## Explainability

Performance analysis should be integrated into normal development. A future
`wync explain performance` surface can use the TMA vocabulary (see CPU
Modeling Strategy above) to present bottleneck analysis in a structured,
actionable format.

Example:

```text
wync explain performance memcpy.wyst:12-18

  Estimated throughput: ~2.3 cycles/iteration
  TMA breakdown:
    Retiring           ~43%
    Backend Bound      ~45%  (Memory ~40%, Core ~5%)
    Frontend Bound     ~10%
    Bad Speculation     ~2%

  Bottlenecks:
    - load-use latency (4 cycles) — Backend:Memory
    - loop-exit misprediction     — Bad Speculation

  Suggestions:
    - %prefetch for sequential access pattern (see chapter-11-intrinsics.md §1.3.8)
    - consider %ldnp/%stnp for streaming stores
    - select() for branchless loop-exit if condition is unpredictable
```

This analysis is:

- **estimated** — derived from the target descriptor ([appendix-a-ir.md §14](appendix-a-ir.md))
  and dependency chain analysis ([appendix-a-ir.md §6.9](appendix-a-ir.md)), not from runtime
  measurement
- **architecture-aware** — latency and throughput values come from the
  target descriptor, which varies by `#target`
- **source-correlated** — line ranges map directly to IR regions and
  scheduling blocks
- **actionable** — suggestions reference specific Wyst features that address
  the identified bottleneck category

---

## Long-Term Vision

Wyst is not merely an assembler.

It is:

- a semantic systems language
- a machine-observability platform
- a performance reasoning environment
- a human-oriented machine IR

Potential future roles:

| Capability                    | Future   |
| ----------------------------- | -------- |
| semantic assembly             | yes      |
| educational platform          | yes      |
| profiling environment         | yes      |
| systems research platform     | possible |
| architecture exploration tool | possible |

---

## Final Principle

The central principle of Wyst is:

> Make computational behavior visible.

Not:

- magical
- hidden
- compiler-driven

But:

- explicit
- inspectable
- explainable
- measurable
