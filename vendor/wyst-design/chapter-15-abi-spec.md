---
title: "Chapter 15: Wyst ABI Specification"
group: chapter
chapter: 15
order: 15
summary: "Native ABI, AAPCS64 interop, argument/return classification, stack protocol, and register ownership."
---

# Chapter 15: Wyst ABI Specification

> This chapter defines:
>
> - The complete Wyst Native ABI (default for Wyst-to-Wyst calls)
> - The AAPCS interop convention (opt-in for C and OS boundaries)
> - Mapping rules between Wyst function signatures and both conventions

The ABI contract specifies register ownership, argument and return
classification, and stack behavior. Its rules depend on functions, address
types, the `in register` placement in `language.callable-storage-contracts`,
`naked`, and exception-vector context.

---

## Overview

Wyst supports two calling conventions:

| Convention | Wyst callable syntax | Default | Purpose |
| ---------- | ---------------------- | ------- | ------- |
| Wyst Native | `fn(...) -> ...` | yes | Wyst-to-Wyst calls; optimized for register use |
| AAPCS64 | `extern "C" fn(...) -> ...` | no | C interop, OS calls, foreign callbacks |

The native ABI is the default. It deliberately diverges from AAPCS64 in the
areas where AAPCS64 leaves performance on the table: struct passing,
multi-value return, and frame pointer policy. AAPCS64 compatibility is
**opt-in** and applies exactly to the `extern "C"` callable; it does not affect
other functions in the same module.

Because Wyst's calling convention is explicit and reproducible, a mismatch
between caller and callee conventions is always a programmer error and is
detectable statically. The compiler emits a diagnostic when a call is checked
against a callable of the wrong convention; it does not adapt between native
and `extern "C"` identities.

## Callable Boundary Identity and Explicit Placement

Chapter 8 is the sole source-semantic owner for
`language.callable-storage-contracts`. This section fixes its ABI projection. A
callable identity contains the convention, ordered parameter types, each
parameter's `noescape` bit and optional register placement, the result type
(including `never`), and an optional register placement for one
scalar result. Declaration parameter names are direct-call source labels only
and are excluded. `pub`, declaration identity, and `naked` are also excluded.

<!-- wyst-contract: sketch -->
```wyst
extern "C" fn(noescape @u8 in x0, u64 in x1) -> i32 in x0
```

An explicit parameter or result `in register` is a required ABI boundary
location, not an allocator hint. It is preserved in callable values and direct
declaration signatures and is checked exactly at every call. The register must
be legal for the value's ABI class and target width, must not conflict with
another simultaneously live required location, and must not be reserved by
the selected convention or target. The compiler diagnoses an unsatisfied map;
it does not insert a hidden adapter or silently use the convention's default
location. Local `var name: T in register` placement is a storage constraint and
does not become part of the enclosing callable identity.

Source placement may not name target-owned architectural state. In the
AArch64 ABI, `x18`, `x29`, `x30`/`lr`, `sp`, and `xzr` are reserved and
produce a compile error in parameter, result, or local `in register`
placement. In particular, `lr` is not a source alias for an ordinary local and
`x18` is not an opt-in platform-register home. The compiler owns those states;
both spellings are rejected as ordinary local bindings.

`noescape` is valid only on an address parameter. Its bit participates in exact
identity even when two signatures otherwise marshal identically. Direct calls
may use declaration parameter labels, but calls through callable values are
always positional. No implicit conversion exists between native and
`extern "C"` callables or between any pair whose placements or `noescape` bits
differ.

A `never` result has no result register and causes the call site to terminate
its reachable ABI flow. `naked` is not a convention or callable-type property;
it suppresses every compiler-generated prologue, epilogue, frame, spill,
callee-save, hidden home, and return sequence. A naked body that cannot satisfy
its ABI directly is rejected. Naked lowering does not impose a smaller
register allowlist: an otherwise legal explicit GPR, scalar-FP, or SIMD map is
accepted, including a parameter list longer than eight when every final
location is a register. Classification rejects the declaration if even one
parameter's final ABI location is stack-based.

`pub` remains Wyst source visibility and re-export only. That source contract
does not turn a public function or `per_cpu` declaration into a raw
linker-address export.

<!-- wyst-contract: fmt -->
```wyst
module abi.contract

extern "C" fn foreign(value: u64 in x0) -> u64 in x0
```

---

### A.1 Register Classification

All ARM64 general-purpose and SIMD registers fall into one of four classes under the Wyst Native ABI:

| Class        | Registers                            | Meaning                                                                          |
| ------------ | ------------------------------------ | -------------------------------------------------------------------------------- |
| Argument     | x0–x7, v0–v7                         | Argument passing and return values; not preserved across calls                   |
| Caller-saved | x8–x17, v8–v15 (call-clobbered bits) | Scratch; not preserved across calls                                              |
| Callee-saved | x19–x28, x29, x30                    | Preserved across calls; callee must save and restore if used                     |
| Reserved     | x18, sp, xzr                         | Platform register / stack pointer / zero register; do not use as general purpose |

**Notes:**

`x16` and `x17` are the linker scratch registers (IP0, IP1). They are caller-saved and available for compiler temporaries, but the linker may overwrite them in branch veneers. Code that uses checked `asm` blocks must not assume `x16`/`x17` survive across an active `bl`; a future checked `blr` row carries the same rule, while the selected checked-assembly pack rejects `blr` as `known_unsupported`.

`v8–v15` (the lower 64 bits, i.e. `d8–d15`) are callee-saved under AAPCS64. Under the Wyst Native ABI they are **caller-saved** in full — the entire 128-bit register is clobbered. This frees the compiler from generating SIMD save/restore in prologues unless the programmer explicitly pins to those registers.
When a Wyst function is annotated `[aapcs]`, the AAPCS64 preservation rule
applies to that function: if it makes any returning call, including a call to a
Wyst-native helper, it saves and restores `d8`-`d15` around its body.

`x30` (the link register) is callee-saved in the sense that a non-leaf function must save it before issuing any call and restore it before returning. See §A.6 (Frame Layout).

---

### A.2 Argument Passing

Arguments are processed left-to-right from the function signature.

The "memory image" of a struct argument referred to throughout this section is the byte sequence produced by the layout rules in [chapter-06-types.md §1.6](chapter-06-types.md) — natural alignment, declaration field order, inter-field padding and trailing padding as specified there. `size_of` and `align_of` in this document refer to the formulas defined there. The size thresholds below (≤ 8, 9–16, > 16, ≤ 32, > 32) apply to `size_of(S)` including trailing padding.

#### Integer and Pointer Arguments

The first eight integer or pointer arguments are placed in `x0`–`x7` in order. Each argument occupies exactly one register regardless of width:

| Argument type      | Register slot      | Notes                                                  |
| ------------------ | ------------------ | ------------------------------------------------------ |
| `bool`             | `x0`–`x7` (64-bit) | Canonical value is `0` or `1`; `wN` writes are allowed |
| `u8`, `u16`, `u32` | `x0`–`x7` (64-bit) | Zero-extended canonical value                          |
| `i8`, `i16`, `i32` | `x0`–`x7` (64-bit) | Sign-extended canonical value                          |
| `u64`, `i64`, `@T` | `x0`–`x7` (64-bit) | Full-width value                                       |

If more than eight integer arguments are present, the remaining arguments are passed on the stack (see §A.5).

#### Enum Arguments

Payload-less enum arguments are classified as their discriminator integer.
They consume one GPR argument slot under the Native ABI; the value in the
register is the zero-extended tag value for unsigned tag types narrower than
64 bits.

Payload-carrying enums use their exact concrete tag-plus-inline-payload layout
and the ordinary aggregate classifier. Values of at most 8 bytes use one GPR;
values of 9–16 bytes use a GPR pair; larger values are copied to caller-owned
argument storage and passed indirectly in the next GPR or stack slot. The
classification is independent of the active variant and includes exact
padding. Struct, array, slice, floating-point, nested-enum, multi-field, and
concrete-generic payloads require no special ABI path.

#### Floating-Point and Vector Arguments

The first eight `f32`, `f64`, or `[T:N]` arguments are placed in `v0`–`v7` in order, independently of the integer argument registers. Integer and vector argument slots do not share an allocation pool.

| Argument type | Register used | Width used |
| ------------- | ------------- | ---------- |
| `f32`         | `s0`–`s7`     | 32-bit     |
| `f64`         | `d0`–`d7`     | 64-bit     |
| `[T:N]`       | `v0`–`v7`     | 128-bit    |

If more than eight floating-point or vector arguments are present, the remaining arguments are passed on the stack (see §A.5).

#### Small Struct Arguments (≤ 8 bytes)

A struct whose total size is at most 8 bytes is packed into a single integer argument register. Field bytes are packed in memory layout order, occupying the low bytes of the register:

The register holds the struct's memory image — the same bytes that a `u64@[addr]` load of a properly aligned struct would produce. The callee unpacks fields using shifts or the normal struct field access syntax.

#### Medium Struct Arguments (9–16 bytes)

A struct whose total size is between 9 and 16 bytes occupies two consecutive integer argument registers. The first register holds bytes 0–7 (low memory), the second holds the remaining bytes (zero-padded to 8 bytes if the struct is not a multiple of 8 bytes in size):

If only one integer argument register remains when a medium struct is to be passed, the struct is passed on the stack instead (see §A.5). Structs are not split across the register/stack boundary.

#### Large Struct Arguments (> 16 bytes)

A struct larger than 16 bytes is not passed in registers. The caller allocates storage for the struct on its stack, copies the argument value there, and passes the address of that storage in the next available integer argument register:

The callee may read the struct through the received pointer but must not write to it — the storage is owned by the caller and may alias the caller's local variable. If the callee needs to modify a copy, it must allocate its own storage.

---

### A.3 Return Values

Native Wyst functions support zero, one, or named tuple return values. AAPCS64
interop remains narrower and rejects out-of-scope multi-value return shapes at
the boundary.

#### Single Integer Return

A single integer or pointer return value is placed in `x0`.

Payload-less enum return values follow the same rule as their discriminator
integer and return in `x0`.

Payload-carrying enum return values use the same exact aggregate classifier as
arguments: at most 8 bytes in `x0`, 9–16 bytes in `x0`/`x1`, and larger values
through caller result storage addressed by `x8`. Inactive and padding bytes are
deterministically initialized but are not active source-level fields.

#### Single Float or Vector Return

A single `f32`, `f64`, or `[T:N]` return value is placed in `v0` (using `s0`, `d0`, or `v0` respectively).

#### Multi-Value Return

Multiple return values are distributed across registers up to the limits below. Wyst's tuple return syntax ([chapter-08-functions.md §2.2](chapter-08-functions.md)) maps directly to this:

| Return type count  | Integer registers used | Float/vector registers used |
| ------------------ | ---------------------- | --------------------------- |
| ≤ 4 integers       | x0–x3                  | —                           |
| ≤ 4 floats/vectors | —                      | v0–v3                       |
| mixed              | x0–x3 (integers)       | v0–v3 (floats/vectors)      |

Example:

Lowering:

```asm
udiv x0, x0, x1     // q -> x0
msub x1, x0, x1, x2 // r -> x1  (uses original a, b from x0, x1, x2... see note)
ret
```

#### Struct Return (≤ 32 bytes)

A struct return value whose total size is at most 32 bytes is packed into `x0`–`x3` using the same memory-image packing rules as struct argument passing. A float-only struct with one to four scalar `f32`/`f64` leaf fields returns those fields in declaration/layout order through `v0`–`v3`, using `sN` for `f32` fields and `dN` for `f64` fields. No indirection is introduced.

#### Indirect Return (> 32 bytes)

When the return type exceeds 32 bytes, the caller allocates storage and passes its address in `x8` (the indirect result location register). The callee writes the return value to that address and does not place any value in `x0`–`x3` for the struct fields. `x8` is not preserved across the call.

<!-- wyst-contract: sketch -->
```wyst
// Return type > 32 bytes
// caller allocates result storage, passes address in x8
// callee writes result to [x8]
// x8 is caller-saved; callee may clobber it after the write
```

---

### A.4 Callee-Saved Registers

The following registers must be preserved by any function that uses them:

| Register | Role                 | Must save/restore if used? |
| -------- | -------------------- | -------------------------- |
| x19–x28  | General callee-saved | Yes                        |
| x29 (fp) | Frame pointer        | Yes (see §A.6)             |
| x30 (lr) | Link register        | Yes in non-leaf functions  |
| sp       | Stack pointer        | Must be restored on return |

All other registers — `x0`–`x17`, `v0`–`v31` (under the native ABI) — are **caller-saved** and may be freely clobbered.

A **leaf function** is a function that makes no calls (no `bl`, `blr`, `svc`, or any other call mechanism) and does not use `x30` for any other purpose. Leaf functions are not required to save `x30`.

A function that calls another function must save `x30` before the call and restore it before returning, because the call instruction overwrites `x30` with the return address.

For `[aapcs]` functions, the same non-leaf boundary also saves the lower
64 bits of `v8`-`v15` (`d8`-`d15`). This is unconditional for any returning
call because Wyst-native callees may legally clobber all SIMD registers.
Leaf `[aapcs]` functions save only the `d8`-`d15` registers that they directly
use or declare as clobbered. Wyst-native functions never save SIMD registers by
convention.

### A.5 Stack Protocol

#### Stack Alignment

The stack pointer must be 16-byte aligned at every call site — at the moment the `bl` or `blr` instruction executes. This is an ARM64 hardware requirement for SIMD loads and stores and must be maintained regardless of whether the function uses SIMD.

If a function's local frame (saved registers + local variables) would leave the stack pointer non-16-byte-aligned, the compiler must pad the frame to restore alignment before issuing any call.

#### Stack Argument Layout

When integer or vector argument registers are exhausted, remaining arguments are pushed onto the stack in **right-to-left order** (last argument is pushed first). At the call site, the first stack argument is at the lowest address (`sp[0]` after the callee's frame is set up):

```text
Higher addresses
  ┌───────────────────────┐
  │  ...caller frame...   │
  ├───────────────────────┤  ← sp before call (16-byte aligned)
  │  arg N   (last arg)   │  [sp + (N-9)*8]
  │  ...                  │
  │  arg 9   (9th arg)    │  [sp + 0]
  └───────────────────────┘  ← sp at callee entry
Lower addresses
```

The callee accesses stack arguments at positive offsets from the incoming `sp`. Stack arguments are not popped by the callee — the caller is responsible for reclaiming the stack space after the call returns.

#### Stack Argument Sizing

Each stack argument occupies 8 bytes regardless of its actual type width. Values narrower than 8 bytes are zero-extended (unsigned types) or sign-extended (signed types) to 8 bytes. This ensures 8-byte alignment for all stack arguments.

Structs passed on the stack are placed at the next 8-byte-aligned offset and occupy `ceil(size / 8) * 8` bytes.

---

### A.6 Frame Layout

#### Non-Leaf Functions

A non-leaf function must save the frame pointer (`x29`) and link register (`x30`) as a frame record. The canonical prologue:

```asm
stp  x29, x30, [sp, #-frame_size]!   // save fp and lr; allocate frame
mov  x29, sp                          // fp points to frame record
```

The frame record is always at the base of the allocated frame (the lowest address of the frame, which `x29` points to). This forms a linked list of frame records for stack walking.

The canonical epilogue:

```asm
ldp  x29, x30, [sp], #frame_size     // restore fp and lr; deallocate frame
ret
```

Callee-saved registers (`x19`–`x28`) used by the function are saved adjacent to the frame record, in implementation-defined order within the frame. The frame pointer and link register must always occupy the lowest two slots of the frame (the canonical ARM64 frame record position).

#### Leaf Functions

Leaf functions that do not use any callee-saved registers and do not need local stack storage may omit the frame record entirely and return via `ret` with `sp` unchanged:

```asm
// leaf function with no frame record
add  x0, x0, x1
ret
```

Leaf functions that need local stack storage must adjust `sp` and restore it
before returning, but are not required to establish a frame record. Without a
frame record, stack unwinding and `wyst explain` backtraces cannot traverse the
frame.

#### Frame Pointer Convention Summary

| Function type     | Frame record required?       |
| ----------------- | ---------------------------- |
| Non-leaf          | Always                       |
| Leaf, no locals   | No                           |
| Leaf, with locals | No (but sp must be restored) |

---

### A.7 PAC Behavior

The Wyst Native ABI does **not** emit Pointer Authentication Code instructions in prologues or epilogues. The compiler does not insert `paciasp` / `autiasp` around frame records.

This is consistent with Wyst's model of treating addresses as plain `u64` integers. PAC tagging is incompatible with that model without explicit type system support.

Functions may opt into PAC prologue/epilogue signing via a `#pac` directive (specified as an extension point in the "ARM64 Feature Scope" section of [chapter-01-language-design.md](chapter-01-language-design.md)). When `#pac` is present:

- The prologue inserts `paciasp` immediately after `stp x29, x30, [sp, ...]`
- The epilogue inserts `autiasp` immediately before `ldp x29, x30, [sp], ...`
- The function must have a frame record (a `#pac` leaf function without a frame record is a compile error, since there is no link register value to sign)

`#pac` and `[aapcs]` may be combined. When both are present, the AAPCS64 calling convention applies and PAC signing is also emitted.

---

### A.8 Variadic Functions

The Wyst Native ABI does not define a variadic calling convention. C-style `va_list` / `...` parameter lists do not exist in Wyst.

Functions that accept a variable number of arguments use explicit count-and-pointer parameters:

This means Wyst native functions cannot be called as C variadics. A function
intended to be a C variadic (e.g. a custom `printf`-like) must use `[aapcs]`
and an explicitly declared, target-ABI-compatible `va_list` binding. Its
representation and construction are foreign-contract facts; they are not part
of the Wyst Native ABI.

---

### A.9 Callee-Entry Location Transfers

Argument classification determines where values exist at the instant a callee
is entered. Register allocation independently determines the compiler home of
each live parameter. Moving from the entry locations to those homes is one
**simultaneous typed transfer set** under both the Wyst Native and AAPCS64
conventions. Source argument evaluation has already completed; transfer order
does not alter the left-to-right evaluation rule in Chapter 7.

Every scalar GPR, FP/SIMD, or stack component that can participate in a
destructive location dependency enters the planner in parameter order and
component order. Exact source/destination self-copies disappear. Every other
planned component records its source location, destination location, register
class, and width. Two distinct values may not claim overlapping destination
storage.

Register pairs, register lists, and aggregate register images whose compiler
homes are byte-addressed storage are preserved into those homes before any
scalar register home is changed. Their specialized pair/list/byte-image copier
must choose scratch registers outside every live incoming source and final
scalar home; it does not pretend an indirect aggregate pointer is the
aggregate's value bits. This preservation stage and the scalar planner are one
entry-transfer protocol with one liveness rule, not two competing general
parallel-copy algorithms. Caller-owned stack inputs are consumed only after
the register preservation stage has made their helper registers safe.

All architectural views of the same register alias for dependency purposes:

- `wN` and `xN` are one GPR location;
- `bN`, `hN`, `sN`, `dN`, `qN`, and arranged SIMD views are one `vN`
  location; and
- overlapping stack byte ranges alias even when their displayed offsets or
  widths differ.

The emitted sequence must preserve the transfer set's simultaneous meaning. A
destination is ready only when writing it cannot overwrite a source still
needed by another pending transfer. This covers fan-out from repeated sources,
register-to-register swaps, longer cycles, mixed register classes, incoming
stack values, and explicit register placement. Parameter declaration order is
not a license to emit destructive sequential moves.

#### Deterministic planning

The canonical planner performs these steps:

1. Normalize aliases, discard exact self-copies, reject overlapping
   destinations, and sort pending transfers by destination, then source, then
   class and width.
2. Emit the first sorted transfer whose destination aliases no still-needed
   source, remove it, and repeat.
3. If no transfer is ready, select the first sorted cycle transfer. Preserve
   its source through the widest view required by every repeated use of that
   exact source, rewrite those uses to the temporary, re-sort, and continue.

This produces the same plan regardless of parameter collection order, map
iteration, or host behavior. A GPR cycle chooses the first unoccupied,
class-compatible register from `x9`–`x17`, then `x7` down through `x0`. An
FP/SIMD cycle chooses the first unoccupied register from `v31` down through
`v16`. A scratch candidate is ineligible when it aliases a source,
destination, explicit pin, saved entry fact, or another protected location.

The following locations are never general scratch registers:

- `x8`, while it carries an indirect-result pointer;
- `x18`, `x29`, `x30`, and `sp`, because of their platform, frame, link, or
  stack roles;
- architectural register 31 in a GPR operation (`xzr`, `wzr`, or the `sp`
  encoding); and
- an allocator pseudo-home such as `Register(Gpr(31))`, which means
  rematerialization rather than physical storage.

When the return convention uses `x8`, the prologue preserves that pointer in
its planned home before any entry transfer or scratch selection may reuse
register state. An explicit placement that would require the same entry bits
to represent both an argument and the indirect-result pointer is rejected as
an unsatisfiable callable boundary.

If the deterministic scratch lists contain no legal register, frame planning
allocates one cycle temporary at the lowest naturally aligned unoccupied
compiler-owned frame offset after the already ordered fixed and value slots.
Its size and alignment are those of the widest value that must be preserved;
one sufficiently large slot is reused by non-overlapping entry cycles. The
slot is allocated before instruction emission, contributes to both
`#[frame(max_bytes = ...)]` and `#[frame(max_spills = ...)]`, and appears in frame and lowering
reports as `incoming-parallel-copy-temporary` with ABI-lowering provenance,
the preserved class and width, and the cycle that required it. It is not a
semantic allocation effect.

Incoming stack locations remain caller-owned sources addressed relative to
the incoming stack pointer. Frame allocation must not make them alias a
compiler-owned destination or temporary. A stack load that needs a helper
register occurs only after every still-live entry value in that helper
register has been preserved.

The same planner is the canonical implementation surface for other
ABI-boundary transfer sets. Callee entry is the boundary required here;
outgoing arguments and results may add location kinds without changing these
alias, ordering, cycle, or temporary-selection rules.

---

### B.1 Annotation

The `[aapcs]` attribute declares that the function conforms fully to the ARM64 Procedure Call Standard (AAPCS64, document IHI0055). The compiler applies AAPCS64 rules for argument passing, register preservation, struct passing (including HFA/HVA rules), return values, and frame records.

`[aapcs]` applies to the **function it annotates**. It does not change the convention of callers or of other functions in the same module.

---

### B.2 When to Use `[aapcs]`

| Situation                                        | Use `[aapcs]` on...                   |
| ------------------------------------------------ | ------------------------------------- |
| Function called from C code                      | The Wyst function                      |
| Function calling into C (e.g. a libc function)   | The Wyst declaration of the C function |
| OS system call entry points                      | The entry function                    |
| Callback passed through a C interface            | The callback function                 |
| Function in a shared library with a C ABI header | All exported functions                |

---

### B.3 AAPCS64 vs Wyst Native: Key Differences

| Feature                 | Wyst Native                                 | AAPCS64                                  |
| ----------------------- | ------------------------------------------ | ---------------------------------------- |
| Argument registers      | x0–x7 (int), v0–v7 (float), independent    | x0–x7 (int), v0–v7 (float), independent  |
| v8–v15 preservation     | Caller-saved (full 128-bit)                | Callee-saved (lower 64 bits, `d8`–`d15`) |
| Struct ≤ 8 bytes        | Single register, memory image              | Single register, memory image (same)     |
| Struct 9–16 bytes       | Two consecutive registers                  | Two consecutive registers (same)         |
| Struct > 16 bytes       | Caller allocates, address follows ordinary integer argument allocation | Caller allocates, address follows ordinary integer argument allocation |
| HFA/HVA structs         | Not defined; treated as byte-image structs | Up to 4 homogeneous elements in v0–v7    |
| Return ≤ 32 bytes (int) | x0–x3                                      | x0–x1 only                               |
| Indirect return pointer | x8                                         | x8 (same)                                |
| Frame record            | Required for non-leaf; optional for leaf   | Required for non-leaf (same policy)      |
| PAC in prologue         | Not emitted (opt-in via `#pac`)            | Not specified; platform-dependent        |
| Variadic support        | Outside Wyst ABI model                      | Defined (AAPCS64 §6.4)                   |

The most significant differences are: (1) Wyst native returns up to 4 integers in `x0`–`x3` where AAPCS64 only uses `x0`–`x1`; (2) `v8`–`v15` are caller-saved in Wyst native, eliminating SIMD callee-save overhead in hot paths; (3) HFA/HVA recognition is reserved for explicit `[aapcs]` boundaries.

---

### B.4 Declaring Foreign Functions

Foreign C functions called from Wyst must be declared with `[aapcs]`:

The compiler will generate a call using AAPCS64 argument passing rules for any
call to an `[aapcs]`-annotated function.

---

### B.7 C Declaration Boundary

The FFI boundary is hand-written `[aapcs]` functions and generated Wyst
declaration modules. Direct C header import remains outside this boundary. A
working C header importer requires a C preprocessor (macros, includes,
conditional compilation), a C
parser, a type-translation layer with documented rules for every C feature
(anonymous struct/union, bit-field layout, `_Bool`, platform-dependent `enum`
backing, function-like macros, `va_list`, `restrict`,
`__attribute__((...))`, packed structs, anonymous structs in struct members),
and a strategy for reconciling C's loose typing with Wyst's strict typing.

#### Import Boundary

The boundary is generated Wyst source, not direct C header parsing during
ordinary compilation. A C binding producer emits an ordinary `.wyst`
module containing `module`, `pub`, `extern "C" fn`, type, and
`#static_assert` declarations. User code imports that module with `import`. IR
and backend lowering see the same declarations they
would see if a programmer had written the module by hand.

Generated declarations must be reproducible from explicit inputs:

- declaration source or checked/pinned preprocessor output;
- target ABI profile;
- generator/compiler version;
- include path and macro configuration, if a preprocessor is used;
- explicit refused-feature policy and symbol exclusion list.

Ordinary compilation must not discover host headers, SDK paths, target C
compiler defaults, or transitive C includes implicitly.

The generated-declaration surface is deliberately narrow:

| Shape                                           | Rule                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Fixed-arity functions                           | Generated as `[aapcs]` declarations.                                                 |
| `void`, `bool`, integer, pointer params/returns | Allowed when the target ABI profile fixes exact widths and representation.           |
| Exact-width aliases                             | May lower to the corresponding Wyst integer type.                                     |
| Pointer-only opaque handles                     | May lower to a strict pointer type chosen by the binding author or generator policy. |

The generator must hard-error refused declarations unless the user
explicitly excludes the symbol before generation. The generator does not emit
by-value structs/unions, bit-fields, floats, vectors, variadics, function
pointers, `_Atomic`, platform-ambiguous enums, or macros.

No-body foreign declarations require an object/link-capable mode where
undefined external symbols are represented explicitly and resolved by a linker.
Dynamic linking is outside this FFI boundary.

#### Constraints Locked on Header Importers

Any C header import design must satisfy:

| Constraint                                         | Reason                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Translates to the same surface as B.6 hand-written | A C header import must produce code semantically identical to a hand-written `[aapcs]` declaration set. No new function-decl kinds; no new type kinds. The IR sees no difference between imported and hand-written.                                                                                                                         |
| Strict typing wins                                 | Where C is ambiguous (signedness of `char`, width of `int` on non-AArch64 targets, layout of bit fields), the importer must pick one interpretation and refuse to compile if the source assumes a different one.                                                                                                                            |
| Per-import explicit                                | Importing `foo.h` brings in symbols _only from that header_. No transitive macro inclusion making other symbols visible. Closed, listable set of imported names per generated declaration module.                                                                                                                                            |
| Deterministic translation                          | Same `.h` file + same compiler version + same `#target` → byte-identical generated declarations. The reproducibility contract extends to generated C declaration output.                                                                                                                                                                   |
| No macros in ordinary compilation                  | The preprocessor expansion problem (macro hygiene, function-like macro arity, conditional compilation across imports) is large enough to keep outside ordinary compilation. A binding producer accepts only the post-`cpp` form of a header, or runs a pinned `cpp` subset. The user provides the preprocessor invocation.                 |
| Explicit list of refused C features                | Any import design must document which C features it refuses (function-like macros, anonymous unions in struct members, `_Atomic`, designated initializers, GCC extensions, etc.). A header using a refused feature is a hard error at import, not a silent miscompile.                                                                      |
| `va_list` bindings are target specific              | Generated declarations must expose the selected target ABI's exact representation and reject unknown layouts; no shared Wyst-native `va_list` layout exists.                                                                                                                                                                                |

#### Workflow for Heavy FFI

With the generated-declaration boundary, a user who needs to interop
with a large C surface can use this workflow:

1. Produce explicit declaration input using hand translation, a pinned C
   parser, or checked preprocessor output.
2. Translate supported declarations to a Wyst `extern "C"` module following
   the target type-mapping rules and the allowed subset above.
3. Add `#static_assert(#size_of(struct_name) == N, ...)` invariants for every
   C struct once by-value aggregate support exists, with `N` taken from
   `sizeof(struct_name)` on the target.
4. Check the resulting declarations into a Wyst module (`runtime.libc`,
   `runtime.posix`, etc.) or otherwise make the generated file an explicit
   project input, then import it.

The cost is one-time per header; the result is auditable Wyst source that participates in the reproducibility contract from day one.

#### Design Rationale

| Decision                           | Rationale                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated source is the boundary   | Header translation is substantial enough to keep separate from ordinary compilation. Generated Wyst source preserves auditability, deterministic imports, and the existing IR surface. |
| Lock constraints, not syntax       | The constraint table above narrows the import design space without prejudging the syntax. The rules ensure whatever it picks fits with the rest of the language.                      |
| Document the workflow              | AAPCS users need an auditable path before a header importer exists.                                                                                                                   |
| Explicit `va_list` binding         | C variadic boundaries use an audited target-specific binding rather than opaque guessed storage.                                                                                   |
| Generated source is the boundary   | Keeping C import output as ordinary Wyst source preserves auditability, deterministic imports, and the existing IR surface.                                                            |

---

### C.1 Full ABI Table

| Feature                          | Wyst Native                                | AAPCS64                                 |
| -------------------------------- | ----------------------------------------- | --------------------------------------- |
| **Integer arg registers**        | x0–x7 (first 8 args)                      | x0–x7 (first 8 args)                    |
| **Float/vector arg registers**   | v0–v7 (first 8, independent)              | v0–v7 (first 8, independent)            |
| **Argument order**               | Left-to-right                             | Left-to-right                           |
| **Stack arg order**              | Right-to-left (last arg pushed first)     | Right-to-left                           |
| **Stack arg alignment**          | 8-byte slots; each arg zero/sign-extended | 8-byte slots (same)                     |
| **Stack alignment at call site** | 16-byte                                   | 16-byte                                 |
| **Struct ≤ 8 bytes**             | 1 integer register (memory image)         | 1 integer register (memory image)       |
| **Struct 9–16 bytes**            | 2 consecutive integer registers           | 2 consecutive integer registers         |
| **Struct > 16 bytes**            | Caller-allocated; address follows ordinary integer argument allocation | Caller-allocated; address follows ordinary integer argument allocation |
| **HFA/HVA**                      | Not recognised; treated as byte struct    | Up to 4 homogeneous elements in v0–v7   |
| **Integer return (1 value)**     | x0                                        | x0                                      |
| **Integer return (2–4 values)**  | x0–x3                                     | x0–x1 only                              |
| **Float/vector return**          | v0–v3                                     | v0 only (v0–v1 for pairs in some cases) |
| **Struct return ≤ 32 bytes**     | x0–x3 (packed)                            | x0–x1 (packed, ≤ 16 bytes)              |
| **Indirect return pointer**      | x8                                        | x8                                      |
| **Caller-saved (int)**           | x0–x17                                    | x0–x17                                  |
| **Caller-saved (float/vec)**     | v0–v31 (all)                              | v0–v7, v16–v31                          |
| **Callee-saved (int)**           | x19–x28, x29, x30                         | x19–x28, x29, x30                       |
| **Callee-saved (float/vec)**     | None (all caller-saved)                   | d8–d15 (lower 64 bits)                  |
| **Frame record (non-leaf)**      | Required                                  | Required                                |
| **Frame record (leaf)**          | Optional                                  | Optional                                |
| **PAC in prologue**              | Not emitted (opt-in: `#pac`)              | Not specified                           |
| **Platform register**            | x18 reserved                              | x18 reserved                            |
| **Variadic**                     | Outside Wyst ABI model                     | Defined (AAPCS64 §6.4)                  |

---

### C.2 Argument Register Allocation Examples

#### Eight integer arguments — all in registers

```text
a → x0   b → x1   c → x2   d → x3
e → x4   f → x5   g → x6   h → x7
```

#### Nine integer arguments — ninth on stack

```text
a → x0   b → x1   c → x2   d → x3
e → x4   f → x5   g → x6   h → x7
i → [sp + 0]                          // first stack argument at sp[0] in callee
```

#### Mixed integer and float arguments

```text
a → x0   b → x1          // integers fill x0, x1 in order
x → s0   y → d1          // floats fill v0, v1 in order
                          // integer and float registers are independent
```

#### Medium struct argument

```text
range.lo → x0   range.hi → x1    // struct occupies two consecutive registers
val      → x2
```

#### Large struct argument

```text
// caller:
//   sub sp, sp, #32         ; allocate struct copy (24 bytes, padded to 32)
//   [stores t.a, t.b, t.c to sp]
//   mov x0, sp              ; address of caller-allocated struct copy
//   mov x1, v               ; v is next available integer register
apply call: x0 = &transform_copy, x1 = v
```

---

### Design Rationale

| Decision                                                    | Rationale                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v8`–`v15` caller-saved                                     | Eliminates SIMD save/restore in non-leaf functions that use SIMD. AAPCS64 callee-saves only the lower 64 bits anyway, making `d8`–`d15` preservation a partial measure that still costs stores/loads. Making them fully caller-saved is a cleaner contract.                                                               |
| 4 integer return registers (`x0`–`x3`)                      | Wyst multi-value return (§2.2) would otherwise require hidden struct allocation for 3- and 4-value returns. Direct register returns are zero overhead. AAPCS64's 2-register limit was designed around C's single-value return model, which Wyst does not share.                                                             |
| Large struct argument address follows ordinary argument allocation | Both Wyst Native and `[aapcs]` calls replace large by-value aggregate arguments with a caller-owned copy pointer and allocate that pointer through the normal integer argument cursor. `x8` remains reserved for indirect _return_ pointers.                     |
| No Native HFA/HVA rules                                     | HFA/HVA rules are reserved for explicit `[aapcs]` boundaries. Native Wyst programs pass vectors explicitly via `[T:N]` parameters; struct-wrapping a vector is a code smell, not a convention.                                                                                                                          |
| AAPCS opt-in rather than default                            | Wyst-to-Wyst calls should not pay the cost of AAPCS64's `d8`–`d15` preservation or its limited return register set. Opt-in via `[aapcs]` makes the boundary explicit and statically checkable — you can grep for every foreign call site.                                                                                   |
| PAC not emitted by default                                  | Wyst treats addresses as plain integers. PAC tags are stored in top address bits, which conflicts with Wyst's address arithmetic model. Opt-in `#pac` is the correct model; mandatory PAC would require a new address type.                                                                                                 |
| No variadic convention                                      | C variadics require shadow stack space for all register arguments in AAPCS64, degrading performance for all callers of variadic functions. Wyst-native code does not need this; pointer+count is always available and more explicit.                                                                                       |

---

### Compiler Requirements

The compiler must:

- Materialize live callee-entry parameters as the simultaneous, alias-aware,
  cycle-safe transfer set from §A.9. Sequential parameter-order moves are not
  conforming, even when their final destination list matches the allocation
  report.
- Emit a **hard error** if a Wyst-native caller passes a `[aapcs]`-annotated function to a function pointer typed as a Wyst-native function pointer, or vice versa.
- Track `[aapcs]` through function pointer types — an `[aapcs]` function's address has type `@[aapcs] (args) -> ret`, which is a distinct type from the non-annotated form `@(args) -> ret`. See §B.5 and [chapter-08-functions.md §2.6](chapter-08-functions.md).
- Replace every large by-value `[aapcs]` aggregate argument that is not HFA/HVA
  with a pointer to caller-owned copy storage, then allocate that pointer
  through the ordinary integer argument path. Do not allocate large aggregate
  arguments in `x8`; `x8` is reserved for indirect results.
- Emit `d8`–`d15` callee-saves in every non-leaf `[aapcs]` function. A leaf
  `[aapcs]` function emits saves only for directly used or declared-clobbered
  `d8`–`d15` registers. Under the Wyst native ABI, no SIMD save/restore is ever
  generated by the convention.
- Correctly handle the register/stack split for structs: a medium struct that would require two registers but only one argument register slot remains must be moved to the stack entirely. Structs are never split across the register/stack boundary.
- Generate the frame record (`stp x29, x30, [sp, #-N]! ; mov x29, sp`) for every non-leaf function under both conventions.

## Operation ABI and C profiles

Native operation lowering returns the exact terminal outcome enum and, only
for effective progress, appends a hidden `noescape fn(P) -> void
effects(ceiling)` callback. Both use ordinary aggregate ABI classification;
large values use indirect argument/result storage. Chapter 26 defines the
explicit AAPCS64 status/out and tagged/out wrapper profiles, initialization
matrices, partial extents, callback-plus-context recovery/progress crossings,
alignment, aliasing, ownership, and lifetime requirements. Neither C profile
is the native operation type and neither creates ambient status.
