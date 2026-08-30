---
title: "ABI Specification"
group: reference
section: binary-interfaces
order: 410
summary: "Native ABI, AAPCS64 interop, argument and result locations, stack protocol, and register ownership."
---

# ABI Specification

This reference defines the AArch64 callable boundary.
Wyst has two calling conventions:

| Convention | Source form | Use |
| --- | --- | --- |
| Native | `fn` | Wyst-to-Wyst calls |
| AAPCS64 | `extern "C" fn` | Supported C and operating-system boundaries |

The calling convention is part of a function type.
Native and `extern "C"` function pointers are different types.
The compiler rejects an implicit conversion between them.

Static interfaces do not define a calling convention or machine ABI entity.
Their qualified calls are erased to ordinary direct Native calls before typed
IR and ABI classification. They add no witness, vtable, metadata argument, or
hidden context. See [Interfaces and Implementations](interfaces-and-implementations.md).

Returned-view source relations are also proof-only metadata. A relation such
as `from arena on .Ok` does not add a pointer tag, result field, hidden
argument, or runtime check. The WYSTIF callable and resource contracts retain
the source parameter, nominal outcome, and direct payload path for separate
compilation. Native ABI classification uses only the declared result type.

## 1. Callable identity

A normal function uses the Native convention.

<!-- wyst-contract: check-pass -->
```wyst
module native_call

fn add(left: u64, right: u64) -> u64 {
  return left + right
}
```

Use `extern "C"` for an AAPCS64 function or function pointer.

<!-- wyst-contract: check-pass -->
```wyst
module aapcs_call

extern "C" fn add(left: u64, right: u64) -> u64 {
  return left + right
}

fn apply(callback: extern "C" fn(u64, u64) -> u64) -> u64 {
  return callback(20, 22)
}
```

A bodyless function declaration must use `extern "C"`.
The semantic checker accepts a supported bodyless AAPCS64 declaration.
A final static executable rejects a reachable unresolved declaration.
A static library can contain the unresolved symbol.

## 2. Explicit register placement

`in register` fixes one scalar parameter, local, or result to one register.
The register class must match the value type.
The placement is part of the callable contract for a parameter or result.

```text
fn exchange(value: u64 in x0) -> u64 in x1 {
  return value
}
```

The compiler rejects these placements:

- `x18`, because it is the platform register;
- `x29`, because it is the frame pointer;
- `x30`, because it is the link register;
- one register for a multi-register or indirect result;
- `x8` for a parameter when the result also uses the indirect-result pointer;
- overlapping live values in the same fixed register;
- a caller-saved pin that is live across a clobbering call.

The compiler does not spill a fixed placement.
It rejects a placement that cannot be preserved.

## 3. Register roles

The current AArch64 backend uses these register roles:

| Registers | Role |
| --- | --- |
| `x0` to `x7` | Integer and pointer arguments; direct results start at `x0` |
| `v0` to `v7` | Floating-point and SIMD arguments; direct results start at `v0` |
| `x8` | Indirect-result pointer |
| `x9` to `x15` | Caller-saved temporary registers |
| `x16`, `x17` | Linker and interprocedural-call scratch registers |
| `x18` | Reserved platform register |
| `x19` to `x28` | Callee-saved general registers |
| `x29` | Frame pointer |
| `x30` | Link register |
| `sp` | Stack pointer |

All Native FP and SIMD registers are caller-saved.
For AAPCS64, the low 64 bits of `v8` through `v15` are callee-saved.
The upper 64 bits of those registers are not preserved.

## 4. Native ABI

### 4.1 Arguments

The Native ABI assigns integer-like values to `x0` through `x7`.
Integer-like values include integers, booleans, bitfields, addresses, and
function pointers. A register-map instance is also integer-like for the Native
ABI: its one runtime word is passed in a general register while its placement
authority remains compiler-only semantic evidence.

An integer whose value width is at most 32 bits uses a 32-bit GPR view; a wider
integer uses a 64-bit GPR view. At every Native call boundary, unused GPR bits
are zero for unsigned integers and sign extension for signed integers. This
normalization also applies to Native integer results.

The Native ABI assigns scalar floating-point and supported SIMD values to
`v0` through `v7`.
The two register sequences advance independently.

The Native ABI classifies a fixed-layout aggregate by size:

| Aggregate size | Argument location |
| ---: | --- |
| 0 to 8 bytes | One general register |
| 9 to 16 bytes | Two general registers |
| More than 16 bytes | Address of a caller-owned copy |

An aggregate uses the stack when its required argument registers are not
available.
An indirect argument also uses a caller-owned copy area.

### 4.2 Results

The Native ABI returns an integer-like scalar in `x0`.
It returns a floating-point or SIMD scalar in `v0`.

The Native ABI classifies a fixed-layout aggregate result by size:

| Aggregate size | Result location |
| ---: | --- |
| 0 to 8 bytes | `x0` |
| 9 to 16 bytes | `x0`, `x1` |
| 17 to 32 bytes | `x0` through `x3`, as required |
| More than 32 bytes | Caller-owned storage addressed by `x8` |

A payload-free enum uses one general register.
Other Native enum values use their fixed aggregate layout.

An outcome-qualified returned view uses the ordinary enum layout. Refining the
enum selects compiler proof metadata for its payload; it does not change the
payload representation or add a validity test.

A register-map instance result uses `x0`. Register-map instances are not
admitted by the AAPCS64 type surface because a C boundary cannot transport
their authenticated placement origins.

### 4.3 Native aggregate types

The Native ABI can lower fixed-layout Wyst aggregates.
These aggregates include named structs, tuples, arrays, strings, and slices.

`MaybeUninit<T>` and `atomic<T>` are storage types.
The compiler rejects them as ordinary ABI values.

## 5. AAPCS64 subset

The compiler implements an AAPCS64 subset for `extern "C"` callables.
The source signature can use these types:

- booleans and native-width `u8`, `u16`, `u32`, `u64`, `i8`, `i16`, `i32`, and `i64` integers;
- scalar `f32` and `f64` values;
- addresses and function pointers;
- named structs with a fixed layout.

The compiler rejects arrays, tuples, strings, slices, enums,
`MaybeUninit<T>`, and `atomic<T>` as direct AAPCS64 source values.
Use an address or a supported named struct for those boundaries.

The compiler rejects every other exact-width integer at an AAPCS64 boundary,
including one nested in a supported named struct. This restriction avoids
inventing a C representation for types that C and AAPCS64 do not name.

### 5.1 Scalar and composite arguments

Integer-like values use `x0` through `x7`.
Floating-point values use `v0` through `v7`.

A named struct of 8 bytes or less uses one general register.
A named struct of 9 to 16 bytes uses two general registers.
A larger named struct uses the address of a caller-owned copy.

A homogeneous floating-point aggregate can contain one to four equal scalar
floating-point members.
A homogeneous vector aggregate can contain one to four equal SIMD members.
These aggregates use consecutive FP or SIMD registers when registers are
available.

### 5.2 Results

An integer-like result uses `x0`.
A floating-point result uses `v0`.

A named struct of 8 bytes or less uses `x0`.
A named struct of 9 to 16 bytes uses `x0` and `x1`.
A larger named struct uses caller-owned storage addressed by `x8`.

A supported homogeneous aggregate result uses consecutive registers starting
at `v0`.

### 5.3 AAPCS64 limits

The compiler rejects variadic C declarations.
The compiler does not emit pointer-authentication prologues or epilogues.
The compiler does not implement SVE or SME procedure-call standards.
The compiler does not claim a complete C ABI for all Wyst types.

## 6. Stack protocol

The stack pointer must be 16-byte aligned at each callable boundary.
The compiler aligns the outgoing argument area to 16 bytes.

Stack arguments use increasing offsets.
Each argument first satisfies its stack alignment.
Direct stack values occupy their classified stack size.
Indirect values occupy one pointer slot plus a caller-owned copy area.

The compiler can use a stack temporary for a simultaneous register transfer.
This temporary resolves transfer cycles without changing ABI locations.

A `naked` function has no compiler-generated frame.
All incoming parameters of a `naked` function must fit in registers.
All arguments from a `naked` call must fit in registers.
The compiler rejects a hidden stack copy or stack argument in that context.

## 7. Frames and preserved state

The compiler creates a frame when the function needs stack storage, saved
registers, a frame record, or an indirect-result pointer slot.
The final frame size is a multiple of 16 bytes.

The compiler saves only used callee-saved registers.
It restores those registers before return.
The compiler can pair adjacent general-register saves and restores.

The `frame_pointers .all` artifact policy requests a frame record for each
eligible function.
The `.minimal` policy keeps only required frame records.
Naked functions do not receive a frame record.

## 8. Calls and clobbers

A returning call clobbers caller-saved registers.
An indirect call uses the same rule.
The `svc`, `hvc`, `smc`, `brk`, and `hlt` operations are also caller-saved
clobber boundaries.
Validated instruction rows add their compiler-derived register clobbers.

The compiler plans argument and result transfers as simultaneous copies.
The planner preserves every source before it overwrites a required location.
The planner rejects a transfer shape that the backend cannot encode.

## 9. Interactive functions

Interactive functions use the Native ABI.
An interactive function without terminal offers keeps its direct result.
An interactive function with terminal offers returns its exact outcome enum.

Effective progress adds a hidden callback and an opaque context address.
Both values use normal Native ABI classification.
[Outcomes, Progress, and Terminal Control](outcomes-and-progress.md) defines the
explicit C boundary profiles for interactive functions.
