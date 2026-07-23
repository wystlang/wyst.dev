---
title: "Chapter 12: Wyst SIMD and Vector Syntax"
group: chapter
chapter: 12
order: 12
summary: "Explicit vector types, lane operations, vector loads/stores, and non-autovectorization policy."
---

# Chapter 12: Wyst SIMD and Vector Syntax

> **Canonical scope.** Vector types (`[T:N]`), element-wise vector
> arithmetic, full-vector address-method loads and stores, and vector
> intrinsics. Element-wise operator semantics live in
> [chapter-07-operators.md](chapter-07-operators.md); type-system rules for vectors live in
> [chapter-06-types.md](chapter-06-types.md).

### Design Boundary

SIMD syntax is explicit and reserved as `[T:N]`; `[N]T` remains an array. Wyst
does not promise hidden autovectorization. Additional SIMD behavior enters
through visible vector types, operations, and primitives.

---

## 3.1 Vector Types

| Wyst     | ARM64 lane view                 |
| -------- | ------------------------------- |
| [f32:4]  | four single-precision lanes     |
| [f64:2]  | two double-precision lanes      |
| [u8:16]  | sixteen byte lanes              |
| [u16:8]  | eight halfword lanes            |

---

## 3.2 Vector Arithmetic

<!-- wyst-contract: sketch -->
```wyst
const a: [f32: 4] = [1.0, 2.0, 3.0, 4.0]
const b: [f32: 4] = [0.5, 0.5, 0.5, 0.5]
const c: [f32: 4] = a + b
```

Lowering:

```asm
fadd <vector-destination>, <vector-left>, <vector-right>
```

Vector operations on floating-point lanes introduce the `fp_state` effect
category. Integer vector arithmetic, bitwise vector operations, vector loads,
and vector stores do not introduce `fp_state` unless another rule applies.

The same operation as a complete checked source contract:

<!-- wyst-contract: check-pass -->
```wyst
module simd_demo

fn add_vec(a: [u32: 4], b: [u32: 4]) -> [u32: 4] {
  return a + b
}
```

---

## 3.3 Vector Loads

Vector loads use the same address-method model as scalar loads. The
address pointee type fixes the loaded vector type:

<!-- wyst-contract: sketch -->
```wyst
const base: @[f32: 4] = address<@[f32: 4]>(0x4000)

const v: [f32: 4] = base.load()
const w: [f32: 4] = element_offset(base, 1).load()
```

Lowering:

```asm
ldr q0, [x0]
ldr q1, [x0, #16]
```

The colon in `[T:N]` distinguishes a vector pointee type from a fixed array.
The ordinary `.load()` method then returns that exact pointee type.

---

## 3.4 Vector Stores

Stores use the same address receiver and exact pointee type:

<!-- wyst-contract: sketch -->
```wyst
const base: @[f32: 4] = address<@[f32: 4]>(0x4000)

base.store(result)
element_offset(base, 1).store(result2)
```

Lowering:

```asm
str q0, [x0]
str q1, [x0, #16]
```

---

## 3.5 Compiler-Owned Vector Operations

<!-- wyst-contract: sketch -->
```wyst
const b: [f32: 4] = a.sqrt()
const c: [f32: 4] = a.abs()
const d: [f32: 4] = -a
```

`.sqrt()`, `.abs()`, and unary negation introduce `fp_state` when they operate on
floating-point scalar or vector values. Integer forms do not introduce
`fp_state`.

Compiler-owned vector operations remain:

- explicit
- inspectable
- architecture-aware
