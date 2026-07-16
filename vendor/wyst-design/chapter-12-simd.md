---
title: "Chapter 12: Wyst SIMD and Vector Syntax"
group: chapter
chapter: 12
order: 12
summary: "Explicit vector types, lane operations, vector loads/stores, and non-autovectorization policy."
---

# Chapter 12: Wyst SIMD and Vector Syntax

> **Canonical scope.** Vector types (`[T:N]`), element-wise vector
> arithmetic, full-vector loads (`[T:N]@[addr]`) and stores, and vector
> intrinsics. Element-wise operator semantics live in
> [chapter-07-operators.md](chapter-07-operators.md); type-system rules for vectors live in
> [chapter-06-types.md](chapter-06-types.md).

### Design Boundary

SIMD syntax is explicit and reserved as `[T:N]`; `[N]T` remains an array. Wyst
does not promise hidden autovectorization. Additional SIMD behavior enters
through visible vector types, operations, and primitives.

---

### SIMD and Vector Syntax

---

## 3.1 Vector Types

| Wyst     | ARM64 |
| ------- | ----- |
| [f32:4] | .4s   |
| [f64:2] | .2d   |
| [u8:16] | .16b  |
| [u16:8] | .8h   |

---

## 3.2 Vector Arithmetic

<!-- wyst-contract: sketch -->
```wyst
a : [f32: 4] = {1.0, 2.0, 3.0, 4.0}
b : [f32: 4] = {0.5, 0.5, 0.5, 0.5}
c : [f32: 4] = a + b
```

Lowering:

```asm
fadd v0.4s, v1.4s, v2.4s
```

Vector operations on floating-point lanes introduce the `fp_state` effect
category. Integer vector arithmetic, bitwise vector operations, vector loads,
and vector stores do not introduce `fp_state` unless another rule applies.

The same operation as a complete checked source contract:

<!-- wyst-contract: check-pass -->
```wyst
#module simd_demo

add_vec :: (a : [u32: 4], b : [u32: 4]) -> [u32: 4] {
  return a + b
}
```

---

## 3.3 Vector Loads

Vector loads use the same `type@[addr]` model as scalar loads. The
vector type `[T:N]` serves as the load type prefix:

<!-- wyst-contract: sketch -->
```wyst
base : @[f32:4] = 0x4000

v : [f32: 4] = [f32: 4]@[base]     // load 4 f32s from base
w : [f32: 4] = [f32: 4]@[base + 1] // element offset 1; byte address +16
```

Lowering:

```asm
ldr q0, [x0]
ldr q1, [x0, #16]
```

The colon in `[T:N]` prevents ambiguity: `u64@[addr]` is a scalar load,
`[f32:4]@[addr]` is a vector load. The parser distinguishes them by
whether the bracket content contains a colon.

---

## 3.4 Vector Stores

Same model — vector type prefix on the store target:

<!-- wyst-contract: sketch -->
```wyst
base : @[f32:4] = 0x4000

[f32:4]@[base] = result
[f32:4]@[base + 1] = result2
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
