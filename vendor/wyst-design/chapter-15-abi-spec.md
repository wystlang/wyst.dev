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

| Convention | v0.9 callable syntax | Default | Purpose |
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

## v0.9 Callable Boundary Identity and Explicit Placement (Current)

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
current AArch64 ABI, `x18`, `x29`, `x30`/`lr`, `sp`, and `xzr` are reserved and
produce a compile error in parameter, result, or local `in register`
placement. In particular, `lr` is not a source alias for an ordinary local and
`x18` is not an opt-in platform-register home. The compiler owns those states;
there is no compatibility path that silently converts either spelling into a
special-register binding.

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

## Frozen Outcome ABI And C Mapping (Activation Pending)

Chapter 10 owns `wyst.outcome.v1`. Its future
`core.outcome.Outcome<V, P, E>` is exactly the existing payload-enum
representation: 16 bytes, alignment 8, a zero-extended tag word at byte 0, and
one payload word at byte 8. The canonical tags are `ok = 0`, `partial = 1`,
`complete = 2`, and `err = 3`. The `.complete` payload word is canonically zero.
The other payload word is the ordinary Native-ABI representation of the active
`payload_word` type; inactive bytes are not a second source value.

Under `wyst.nativeAbi.v0.8`, an outcome argument consumes two consecutive GPR
slots and an outcome result returns tag in `x0` and payload in `x1`, exactly as
for every current payload enum. If two consecutive argument slots are not
available, the complete 16-byte value follows the existing stack rule and is
never split. Concrete `V`, `P`, and `E` identities, allowed variants, progress
unit, and trap policy are semantic-interface facts under
`wyst.outcomeSummary.v1`; callers do not infer them from the two machine words.

Wyst enums still have no direct C layout. `wyst.outcomeForeign.v1` defines the
only canonical C bridge as an explicit layout-equivalent record:

```c
struct wyst_outcome_v1 {
    uint64_t tag;
    uint64_t payload;
};
```

An `extern "C"` declaration names that explicit two-word struct, not the Wyst
enum. An ordinary adapter validates `tag`, validates the active payload against
the declared `V`, `P`, or `E` type, requires zero payload for `complete`, and
constructs the typed outcome. Unknown tags, noncanonical payloads, or a
nonzero completion payload are malformed foreign results; a checked adapter
maps them to its declared `.err(E)` foreign-contract cause, while a deliberately
trusted adapter exposes the existing trusted-contract-violation boundary.
Neither case authorizes a default variant or implicit trap.

Legacy C APIs may use negative returns, nulls, status/value pairs, `errno`, or
other external conventions. Those shapes are permitted only inside an
explicit normalizing adapter. The adapter samples every foreign status input
exactly once, preserves committed partial progress, and returns one canonical
outcome before any Wyst-facing API observes it. A Wyst interface, semantic
interface, object, or core API may not expose the legacy sentinel/status shape
as an alternative error convention.

## Released v0.8 ABI Syntax Snapshot

> **Released v0.8 ABI syntax below.** The remainder of this chapter preserves
> the released native/AAPCS64 classification tables and frame rules. Its
> `[aapcs]`, `#pin`, `#noescape`, `#naked`, `#noreturn`, and legacy function
> pointer spellings are historical syntax. Read them as `extern "C"`,
> `in register`, `noescape`, `naked`, `never`, and v0.9 callable values where
> the rules do not conflict; the current identity section above controls every
> conflict. In particular, the later claim that pin maps are absent from
> function-pointer identity is v0.8-only and false for v0.9.

---

### Wyst Native ABI

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

`x16` and `x17` are the linker scratch registers (IP0, IP1). They are caller-saved and available for compiler temporaries, but the linker may overwrite them in branch veneers. Code that uses checked `asm` blocks must not assume `x16`/`x17` survive across an active `bl`; a future checked `blr` row carries the same rule, while the pinned v0.9 pack rejects `blr` as `known_unsupported`.

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

Payload-carrying enums consume two GPR argument slots under the Native ABI.
The first register holds the tag word, corresponding to bytes 0..8 of the
fixed two-word representation. The second register holds the payload word,
corresponding to bytes 8..16. This classification is independent of the
declared tag width and independent of the active variant's payload width.
Only payload-word source types may inhabit that second word; structures,
slices, floating-point values, and nested enum values are rejected before ABI
classification.

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
point :: struct {
  x : u32 // offset 0
  y : u32 // offset 4
}
// passed as: w0 = (y << 32) | x  — NO; passed as the raw 64-bit memory image
// i.e., bits [31:0] = x, bits [63:32] = y
```

The register holds the struct's memory image — the same bytes that a `u64@[addr]` load of a properly aligned struct would produce. The callee unpacks fields using shifts or the normal struct field access syntax.

#### Medium Struct Arguments (9–16 bytes)

A struct whose total size is between 9 and 16 bytes occupies two consecutive integer argument registers. The first register holds bytes 0–7 (low memory), the second holds the remaining bytes (zero-padded to 8 bytes if the struct is not a multiple of 8 bytes in size):

<!-- wyst-contract: historical-v0.8 -->
```wyst
string :: struct {
  data : @u8 // offset 0, 8 bytes
  len : u64 // offset 8, 8 bytes
}
// passed as: x0 = data, x1 = len
// consumes two argument register slots
```

If only one integer argument register remains when a medium struct is to be passed, the struct is passed on the stack instead (see §A.5). Structs are not split across the register/stack boundary.

#### Large Struct Arguments (> 16 bytes)

A struct larger than 16 bytes is not passed in registers. The caller allocates storage for the struct on its stack, copies the argument value there, and passes the address of that storage in the next available integer argument register:

<!-- wyst-contract: historical-v0.8 -->
```wyst
big :: struct {
  a : u64
  b : u64
  c : u64 // 24 bytes total — too large for registers
}
// caller:
//   sub  sp, sp, #32          ; allocate struct copy
//   [stores a, b, c to sp]
//   mov  x0, sp               ; pass address
// callee receives: x0 = address of caller-allocated copy
```

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

Payload-carrying enum return values return as the same two-word Native ABI
value used for arguments: the tag word in `x0` and the payload word in `x1`.
Inactive payload bytes and padding bytes are not part of the returned
source-level value.

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
divmod :: (a : u64, b : u64) -> (q: u64, r: u64) {
  return (a / b, a % b)
}
```

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

#### Interaction with `#pin`

A declaration of the form `name : T #pin(reg) [= value]` on a callee-saved register inside a non-`#naked` function counts as "using" that register for the purpose of this table. An allocator-chosen scalar GPR home in a callee-saved register (`x19`-`x28`) also counts as using that register; an allocator-chosen caller-scratch home does not. The standard prologue unconditionally saves and the epilogue unconditionally restores every used callee-saved register — regardless of whether the body actually reads a pinned binding, regardless of leaf/non-leaf status. The full rules, including the legality of `#pin` inside `#naked` and the compile-error case for caller-saved pins live across a call, live in [chapter-08-functions.md §2.3](chapter-08-functions.md). This document only states the frame-construction consequence: a `#pin(x19)` declaration or allocator home in `x19` is equivalent, for prologue purposes, to any other reference to `x19`.

---

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
before returning, but are not required to establish a frame record. However,
without a frame record, stack unwinding and `wyst explain` backtraces cannot
traverse the frame. A future debug-build mode will require a frame record in
every function. The former `#backtrace` spelling is removed with no replacement;
the future debug-build mode, if activated, remains a build policy rather than a
declaration attribute.

#### Frame Pointer Convention Summary

| Function type     | Frame record required?       |
| ----------------- | ---------------------------- |
| Non-leaf          | Always                       |
| Leaf, no locals   | No                           |
| Leaf, with locals | No (but sp must be restored) |
| Any, former `#backtrace` | Removed spelling; no semantics |
| Any, future debug build  | Always under `wyst.nativeAbi.next` |

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
// idiomatic Wyst variadic-style function
print_all :: (args : @u64, count : u64) { ... }
```

This means Wyst native functions cannot be called as C variadics. A function intended to be a C variadic (e.g. a custom `printf`-like) must use `[aapcs]` and accept a `va_list`, constructing it with checked `asm` only when ordinary Wyst access is insufficient. See [B.6.3](#b63-calling-variadic-c-functions-printf-via-va_list) for the worked example.

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

### AAPCS64 Interop Convention

---

### B.1 Annotation

<!-- wyst-contract: historical-v0.8 -->
```wyst
[aapcs]
my_function :: (x : u32, y : u32) -> u64 { ... }
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
[aapcs]
memcpy :: (dst : @u8, src : @u8, n : u64) -> @u8

[aapcs]
puts :: (s : @u8) -> i32
```

The compiler will generate a call using AAPCS64 argument passing rules for any
call to an `[aapcs]`-annotated function.

---

### B.5 Released v0.8 Function Pointer Type Discipline (Historical)

> This subsection's two-field identity and address-bearing `@(...)` grammar are
> retained only to document v0.8. The v0.9 identity tuple and callable grammar
> are defined in the current section at the start of this chapter.

Calling convention is encoded in the function pointer type. The two pointer forms are:

| Type                     | Convention | Lowering of call site                            |
| ------------------------ | ---------- | ------------------------------------------------ |
| `@(args) -> ret`         | Wyst Native | Wyst Native argument marshalling per this chapter |
| `@[aapcs] (args) -> ret` | AAPCS64    | AAPCS64 argument marshalling per this chapter    |

The shape `(args) -> ret` is the bare function signature and is not a value type (see [chapter-08-functions.md §2.6](chapter-08-functions.md)); only the `@(...)` and `@[aapcs] (...)` forms are storable.

#### Type Identity

Two function pointer types are the same type only when **both** match:

1. The convention annotation matches exactly (`@(...)` ≡ `@(...)`; `@[aapcs] (...)` ≡ `@[aapcs] (...)`; never `@(...)` ≡ `@[aapcs] (...)`).
2. The argument types and return types match exactly under the standard type identity rules (no implicit numeric widening, no `@T` ↔ `u64` coercion).

Register pin maps are not part of the current function-pointer type grammar.
A function declaration with any `#pin(reg)` parameter is therefore a special
entry point whose address cannot be taken as `@(args) -> ret` or
`@[aapcs] (args) -> ret`. Direct calls remain valid because the callee
declaration supplies the pin map to ABI lowering. Indirect calls, callbacks,
dispatch tables, returned function pointers, and imported function-pointer
slots require an ordinary-ABI wrapper or a future pin-map-aware convention
type. Large aggregate and indirect-result returns still use the convention's
ordinary result locations and do not encode argument pins.

There is no implicit conversion between `@(...)` and `@[aapcs] (...)` in either direction. Wyst rejects:

<!-- wyst-contract: historical-v0.8 -->
```wyst
[aapcs]
puts :: (s : @u8) -> i32

native_fp : @(@u8) -> i32 = #addr_of(puts) // compile error
aapcs_fp : @[aapcs] (@u8) -> i32 = #addr_of(puts) // OK
```

#### `#addr_of` and Convention

`#addr_of(name)` produces a function pointer whose convention matches the declaration of `name`:

- `#addr_of` of a function declared without `[aapcs]` has type `@(args) -> ret`.
- `#addr_of` of a function declared `[aapcs]` has type `@[aapcs] (args) -> ret`.

There is no `[aapcs]`-stripping form of `#addr_of`. To call a Wyst-native function from C, the function itself must be declared `[aapcs]`. To call an `[aapcs]` function as if it were native, write a Wyst-native trampoline that re-marshals arguments and calls through.

#### Conversion to and from `u64`

A function pointer of either convention converts to `u64` via `as.address`.
Constructing a function pointer of either convention from a raw integer address
requires the explicit trusted form:

<!-- wyst-contract: historical-v0.8 -->
```wyst
addr := aapcs_fp as.address u64
fp   := #trusted_cast<@[aapcs] (@u8) -> i32>(addr)
```

Function pointers may be compared for equality with the same exact function
pointer type, or with the untyped integer constant `0` as the conventional
sentinel. Other integer comparisons require an explicit `as.address u64`
conversion.

`#trusted_cast<@(args) -> ret>(addr)` or
`#trusted_cast<@[aapcs] (args) -> ret>(addr)` is the only way to construct a
function pointer of a given convention from a raw `u64` address (e.g., when
reading a dispatch table loaded from elsewhere). The programmer asserts the
underlying code follows the declared convention; the compiler cannot verify
this. A wrong convention assertion is an unchecked call-site error: the emitted
call uses the declared convention and may corrupt registers, stack, or control
flow, but the compiler must not exploit that possibility for optimization. The
resulting function pointer defaults to `effects(all)` for `deny_effects`
checking unless the visible callable type supplies a narrower trusted bound or
the compiler proves a more specific target through ordinary symbol flow.

#### Storage and Aggregate Use

Function pointers participate in struct layout ([chapter-06-types.md §1.6](chapter-06-types.md)) as 8-byte values with 8-byte alignment, identical to `@T`. The convention annotation is part of the type for layout-identity purposes but does not affect size or alignment.

Wyst enum types do not have a direct foreign layout. A C enum should be
declared at the boundary as the integer type used by that C ABI. A C tagged
union or discriminated struct should be declared as an explicit Wyst `struct`
whose fields match the C layout. `[aapcs]` function signatures reject by-value
Wyst enum parameters and returns rather than silently treating the Wyst enum
representation as a C layout.

---

### B.6 Foreign Function Idioms

This section gives worked examples for the three FFI shapes that come up in
practice: scalar arguments (`memcpy`), AAPCS struct passing, and C variadics
via `va_list`.

#### B.6.1 Calling `memcpy` (Scalar Arguments)

The simplest FFI case — pointer and integer arguments, pointer return.

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module runtime.libc

[aapcs]
pub memcpy :: (dst : @u8, src : @u8, n : u64) -> @u8

[aapcs]
pub memset :: (dst : @u8, val : i32, n : u64) -> @u8

[aapcs]
pub memcmp :: (a : @u8, b : @u8, n : u64) -> i32
```

These are forward declarations for an object/link-capable build mode; the
bodies are provided by the linked C runtime. Current static-ELF output accepts
and checks these signatures, but rejects calls to or addresses of unresolved
external symbols until that build mode exists. Usage in an object/link-capable
mode:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#import runtime.libc

copy_packet :: (dst_buf : @u8, src_buf : @u8, len : u64) -> @u8 {
  return memcpy(dst_buf, src_buf, len)
}
```

In that mode, the compiler emits a direct `bl memcpy` and follows AAPCS64
argument-passing rules: `dst` in `x0`, `src` in `x1`, `n` in `x2`, return in
`x0`. Wyst's strict typing requires the `@u8` argument types match exactly;
`@u32` would not implicitly narrow to `@u8` (per
[chapter-06-types.md §1.4.1](chapter-06-types.md)).

**Mapping C types to Wyst types** for hand-written declarations follows this table. Use it as a reference when transcribing a header:

| C type (AArch64 SysV / AAPCS64)        | Wyst equivalent    | Notes                                                                                           |
| -------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `char`, `signed char`                  | `i8`              | C `char` signedness is implementation-defined; AArch64 SysV picks signed.                       |
| `unsigned char`                        | `u8`              |                                                                                                 |
| `short`                                | `i16`             |                                                                                                 |
| `unsigned short`                       | `u16`             |                                                                                                 |
| `int`                                  | `i32`             | AArch64 SysV; do **not** assume 32-bit on other platforms.                                      |
| `unsigned int`                         | `u32`             |                                                                                                 |
| `long`                                 | `i64`             | AArch64 SysV LP64.                                                                              |
| `unsigned long`, `size_t`              | `u64`             |                                                                                                 |
| `long long`                            | `i64`             |                                                                                                 |
| `void *`, `T *` (generic data pointer) | `@u8` or `@T`     | Wyst types are strict; pick the right pointee.                                                   |
| `const T *`                            | `@T`              | Wyst does not encode `const` on pointers in the type; the immutability of a binding is separate. |
| `float`, `double`                      | `f32`, `f64`      |                                                                                                 |
| `_Bool`                                | `bool`            | One-byte representation; Wyst `bool` matches.                                                    |
| `va_list`                              | `va_list` (B.6.3) | Wyst struct with AAPCS64 §6.4.3 layout.                                                          |

Any C type not in this table (anonymous unions, bit fields, packed structs, `_Atomic T`, function-like macros) requires hand translation with the user verifying the AAPCS64 layout matches.

#### B.6.2 AAPCS Struct Passing

When a C function takes a struct by value, AAPCS64 rules determine whether the struct is passed in registers, on the stack, or through a caller-owned copy whose address is passed as an ordinary integer argument. Wyst does not change those rules for `[aapcs]` calls. The user's job is to declare the struct with the right layout and to keep `x8` reserved for indirect results.

Worked example: a hypothetical `c_timespec` C call.

```c
// C side:
struct timespec { long tv_sec; long tv_nsec; };
int clock_gettime(int clk, struct timespec *ts);
int clock_diff(struct timespec a, struct timespec b);   // by value
```

Wyst side:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module runtime.posix_time

pub timespec :: struct {
  tv_sec : i64
  tv_nsec : i64
}

[aapcs]
pub clock_gettime :: (clk : i32, ts : @timespec) -> i32

[aapcs]
pub clock_diff :: (a : timespec, b : timespec) -> i32
```

AAPCS64 lowering at the call site:

- `clock_gettime(0, &ts)` — `clk` in `w0`, `ts` (pointer) in `x1`, return in `w0`.
- `clock_diff(a, b)` — `a` is 16 bytes, fits in two GP registers, passed in `x0`/`x1`; `b` is 16 bytes, passed in `x2`/`x3`; return in `w0`.

This is AAPCS64 aggregate classification applied to the supported fixed-arity surface. For structs > 16 bytes that are not HFA/HVA, Wyst's `[aapcs]` lowering uses a caller-owned stack copy and replaces the source argument with a pointer to that copy. That pointer is then allocated exactly like an ordinary pointer argument: it uses the next available `x0`-`x7` slot, or the next stack argument slot after integer argument registers are exhausted. Multiple large by-value aggregate parameters are therefore valid, and they may coexist with an indirect aggregate return; `x8` is reserved for the indirect result pointer only. The Wyst struct layout ([chapter-06-types.md §1.6](chapter-06-types.md) alignment + tail-padding rules) matches AAPCS64's, so there is no Wyst-side adjustment required for `[aapcs]`.

Scalar HFAs are structs whose leaf fields are one to four homogeneous `f32` or `f64` values. Vector HVAs are structs whose leaf fields are one to four homogeneous SIMD vector values. Under `[aapcs]`, those fields pass and return in consecutive SIMD/floating-point registers; the Native ABI treats the same struct as a byte-image aggregate unless another Native rule applies. Mixed or non-homogeneous float/vector structs are not HFA/HVA aggregates, so they use the ordinary byte-image struct rows above.

**Where this can go wrong:** Wyst's strict layout means `#packed` structs do _not_ match the C ABI on the same source declaration unless the C struct is also packed. If a C library uses `__attribute__((packed))`, the Wyst declaration must use `#packed`. If the C library uses any other layout attribute (`__attribute__((aligned(N)))`, MS-style bit fields), the user must hand-verify the layout with `#static_assert(#size_of(T) == ..., ...)` and `#static_assert(#field_offset(T, field) == ..., ...)` style invariants.

#### B.6.3 Calling Variadic C Functions: `printf` via `va_list`

C variadic functions (`printf`, `fprintf`, `vsnprintf`) are the awkward FFI case. AAPCS64 §6.4 defines variadic argument passing: the first 8 arguments may be passed in registers as for fixed arguments, and remaining arguments go on the stack at 8-byte alignment.

Wyst does **not** support declaring variadic Wyst functions (per [§A.8](#a8-variadic-functions)). The supported FFI patterns are:

1. **Direct variadic call with a fixed argument list** — works via a hand-written `[aapcs]` declaration that names the specific variadic call shape.
2. **`va_list`-receiving call** — for `vprintf`/`vsnprintf`-style entry points that take a constructed `va_list`. This is the canonical pattern when the argument list is built at runtime.

##### Pattern 1: Direct variadic call

Declare `printf` once per call shape used:

<!-- wyst-contract: historical-v0.8 -->
```wyst
[aapcs]
pub printf_1s :: (fmt : @u8, s : @u8) -> i32

[aapcs]
pub printf_2d :: (fmt : @u8, a : i32, b : i32) -> i32
```

These are not C's `printf` — they are _fixed-arity_ `[aapcs]` declarations that happen to call into `printf` because C's variadic ABI accepts a fixed-arity call as a special case when the fixed arguments match what `printf` extracts. The linker resolves all `printf_*` symbols to the same `printf` entry point if the user adds a linker alias, or — more simply — declares each as a separate forward declaration and lets the C runtime handle the variadic decode.

This pattern works because AAPCS64 variadics pass register arguments the same way as fixed arguments for the first 8 slots. It breaks for stack-arg variadics or for floating-point variadic arguments (AAPCS64 §6.4 has special rules for those).

##### Pattern 2: `va_list` Construction (the General Case)

`va_list` on AArch64 is defined by AAPCS64 §6.4.3 as a 32-byte aggregate:

```c
// AAPCS64 va_list layout (informative):
struct __va_list {
    void *__stack;     // next stack arg
    void *__gr_top;    // top of saved GP register area
    void *__vr_top;    // top of saved SIMD register area
    int   __gr_offs;   // negative offset from __gr_top
    int   __vr_offs;   // negative offset from __vr_top
};
```

Wyst declares this layout directly:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module runtime.va_list

pub va_list :: struct {
  stack : @u8
  gr_top : @u8
  vr_top : @u8
  gr_offs : i32
  vr_offs : i32
}

#static_assert(#size_of(va_list) == 32, "va_list must match AAPCS64 \xc2\xa76.4.3")
```

The static assert is the load-bearing check: any miscompile of layout against AAPCS64 surfaces here.

**Declaring `vprintf`:**

<!-- wyst-contract: historical-v0.8 -->
```wyst
#import runtime.va_list

[aapcs]
pub vprintf :: (fmt : @u8, ap : @va_list) -> i32

[aapcs]
pub vsnprintf :: (buf : @u8, sz : u64, fmt : @u8, ap : @va_list) -> i32
```

**Constructing a `va_list`.** Variadic argument construction _cannot_ be expressed in pure Wyst because Wyst has no variadic primitives. A future profile may use a checked `asm` block to place values into the AAPCS-defined register-save area, followed by ordinary Wyst initialization of the `va_list` struct. The pinned v0.9 pack has no checked store rows and rejects that block. The examples below are Wyst-like pseudocode until both those rows and runtime local-address materialization are available; `local_addr(x)` is not source syntax.

```text
#import (
    runtime.libc as libc
    runtime.va_list
)

print_three :: (fmt : @u8, a : i64, b : i64, c : i64) -> i32 {
    // Reserve a register-save area on the stack (192 bytes: x0-x7 = 64,
    // q0-q7 = 128) plus the va_list struct itself (32 bytes).  Layout
    // must match AAPCS64 §6.4.2 register-save area exactly.
    gp_save : [8]u64 = {0, 0, 0, 0, 0, 0, 0, 0}
    fp_save : [16]u64 = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
    ap : va_list = {
        stack   = local_addr(gp_save) as.lens @u8, // unused: all args fit in GP regs
        gr_top  = (local_addr(gp_save) as.lens @u8) + 64,
        vr_top  = (local_addr(fp_save) as.lens @u8) + 128,
        gr_offs = -24,                         // 3 args x 8 bytes; offset from gr_top
        vr_offs = 0,                           // no FP args used
    }

    // Place a, b, c into the GP save area at the offsets va_list expects.
    gp_base : @u8 = local_addr(gp_save) as.lens @u8
    u64@[(gp_base + 40) as.lens @u64] = a as.signedness u64 // gr_top - 24
    u64@[(gp_base + 48) as.lens @u64] = b as.signedness u64 // gr_top - 16
    u64@[(gp_base + 56) as.lens @u64] = c as.signedness u64 // gr_top - 8

    return vprintf(fmt, local_addr(ap))
}
```

This is the worked example the spec promises. It is verbose because building a variadic call from scratch _is_ verbose — that is the AAPCS64 variadic-marshalling cost made visible. Most Wyst code should not do this; most Wyst code wants Pattern 1 (fixed-arity declarations).

**Future checked-assembly profile.** The example above uses ordinary Wyst
loads/stores to fill the save area, which works because each argument is exactly
8 bytes (`i64`). The following mixed-width sketch requires checked store rows
that are not active in the pinned v0.9 pack and is rejected by that compiler. A
later profile may use typed signature operands to construct the save area in one
pass once those rows have complete memory and allocation contracts:

```text
build_va_for_floats :: (a : f64, b : f64) -> va_list {
    fp_save : [16]u64 = {0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0}
    asm (
        base: @u8 = relens<@u8>(local_addr(fp_save)),
        first: f64 in v0 = a,
        second: f64 in v1 = b,
    ) {
        // AAPCS64 gives each vector argument a 16-byte save-area slot.
        str first.d, [base, #0]
        str second.d, [base, #16]
    }
    return va_list {
        stack   = local_addr(fp_save) as.lens @u8,
        gr_top  = local_addr(fp_save) as.lens @u8,
        vr_top  = (local_addr(fp_save) as.lens @u8) + 32,
        gr_offs = 0,
        vr_offs = -32,
    }
}
```

This is the future checked-`asm` workaround abi-spec §A.8 /
chapter-15-abi-spec.md:321 refers to, not a pinned-v0.9 source form. When its
rows are activated, the block runs under the rules of
[chapter-08-functions.md §2.9](chapter-08-functions.md): it is a full compiler
memory fence, its memory range and register effects come from parsed rows, and
its signature binders appear directly in the instruction body.

#### B.6.4 Wyst-side Callbacks Called from C

The reverse direction: a C library accepts a function pointer that it later
calls back. The Wyst-side callback uses `extern "C"` callable identity and an
explicit export so the linker can find it. `pub` may be added independently if
other Wyst modules also need source access:

<!-- wyst-contract: sketch -->
```wyst
extern "C" fn on_signal(sig: i32) {
  // ... handler body
}
export on_signal as symbol "on_signal"
```

Passing the function pointer is via `#addr_of`, which produces a function pointer with the convention of the declaration:

<!-- wyst-contract: sketch -->
```wyst
var fp: extern "C" fn(i32) = #addr_of(on_signal)
signal_register(SIGUSR1, fp)
```

This is the same `#addr_of` discipline from [B.5](#b5-function-pointer-type-discipline). No special FFI rule.

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
module containing `#module`, `pub`, `[aapcs]`, type, and
`#static_assert` declarations. User code imports that module with the existing
`#import` mechanism. IR and backend lowering see the same declarations they
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
| `va_list` import is the same Wyst struct            | The B.6.3 `va_list` struct is the canonical Wyst representation; generated declarations must produce that struct (or a layout-equivalent one), not a parallel definition.                                                                                                                                                                    |

#### Workflow for Heavy FFI

With the generated-declaration boundary, a user who needs to interop
with a large C surface can use this workflow:

1. Produce explicit declaration input using hand translation, a pinned C
   parser, or checked preprocessor output.
2. Translate supported declarations to a Wyst `[aapcs]` module following
   B.6.1's type-mapping table and the allowed subset above.
3. Add `#static_assert(#size_of(struct_name) == N, ...)` invariants for every
   C struct once by-value aggregate support exists, with `N` taken from
   `sizeof(struct_name)` on the target.
4. Check the resulting declarations into a Wyst module (`runtime.libc`,
   `runtime.posix`, etc.) or otherwise make the generated file an explicit
   project input, then `#import` it.

The cost is one-time per header; the result is auditable Wyst source that participates in the reproducibility contract from day one.

#### Design Rationale

| Decision                           | Rationale                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated source is the boundary   | Header translation is substantial enough to keep separate from ordinary compilation. Generated Wyst source preserves auditability, deterministic imports, and the existing IR surface. |
| Lock constraints, not syntax       | The constraint table above narrows the import design space without prejudging the syntax. The rules ensure whatever it picks fits with the rest of the language.                      |
| Document the workflow              | AAPCS users need an auditable path before a header importer exists.                                                                                                                   |
| `va_list` is a real Wyst struct now | Treating `va_list` as opaque or `[32]u8` would force every FFI user to drop into checked `asm` for any variadic call. A real struct lets ordinary Wyst code fill it.                    |
| Generated source is the boundary   | Keeping C import output as ordinary Wyst source preserves auditability, deterministic imports, and the existing IR surface.                                                            |

---

### Complete Reference Table

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
f :: (a : u64, b : u64, c : u64, d : u64, e : u64, f : u64, g : u64, h : u64) -> u64
```

```text
a → x0   b → x1   c → x2   d → x3
e → x4   f → x5   g → x6   h → x7
```

#### Nine integer arguments — ninth on stack

<!-- wyst-contract: historical-v0.8 -->
```wyst
g :: (a u64, b : u64, c : u64, d : u64,
      e : u64, f : u64, g : u64, h : u64,
      i : u64) -> u64
```

```text
a → x0   b → x1   c → x2   d → x3
e → x4   f → x5   g → x6   h → x7
i → [sp + 0]                          // first stack argument at sp[0] in callee
```

#### Mixed integer and float arguments

<!-- wyst-contract: historical-v0.8 -->
```wyst
h :: (a : u64, x : f32, b : u64, y : f64) -> u64
```

```text
a → x0   b → x1          // integers fill x0, x1 in order
x → s0   y → d1          // floats fill v0, v1 in order
                          // integer and float registers are independent
```

#### Medium struct argument

<!-- wyst-contract: historical-v0.8 -->
```wyst
bounds :: struct {
  lo : u64 // 16 bytes
  hi : u64
}

check :: (range : bounds, val : u64) -> bool
```

```text
range.lo → x0   range.hi → x1    // struct occupies two consecutive registers
val      → x2
```

#### Large struct argument

<!-- wyst-contract: historical-v0.8 -->
```wyst
transform :: struct {
  a : u64 // 24 bytes — too large
  b : u64
  c : u64
}

apply :: (t : transform, v : u64) -> u64
```

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
- Generate the frame record (`stp x29, x30, [sp, #-N]! ; mov x29, sp`) for every non-leaf function under both conventions. A future debug-build mode may extend this requirement to every function; the removed `#backtrace` spelling cannot opt a declaration into it.
