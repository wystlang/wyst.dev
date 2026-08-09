---
title: "SIMD"
group: reference
section: memory-machine
order: 230
summary: "Supported vector types, operators, memory access, and floating-point vector operations."
---

# SIMD

Wyst uses `[T:N]` for a vector with `N` lanes of type `T`.
The form `[N]T` is a fixed array.

[Type System](type-system.md) defines vector types and layout.
[Operators and Evaluation](operators-and-evaluation.md) defines operator behavior.
This reference lists the SIMD restrictions.

## Supported Vector Types

[Type System](type-system.md#vectors) lists the accepted vector shapes.
It also defines their size and alignment.
The compiler rejects all other shapes.

## Vector Operators

[Operators and Evaluation](operators-and-evaluation.md#vector-operators) defines the vector operator set.
It also defines operand matching, unary operations, and rejected comparisons.

The compiler also accepts `.abs()` and `.sqrt()` on these types:

- `[f32:2]`
- `[f32:4]`
- `[f64:2]`

Floating-point vector operations contribute the `fp_state` effect.

<!-- wyst-contract: check-pass -->
```wyst
module simd_demo

fn add_vec(a: [u32: 4], b: [u32: 4]) -> [u32: 4] {
  return a + b
}
```

## Vector Memory Access

An address to a vector can use the typed address memory operations.
The pointee type fixes the load or store type.

The final memory verifier checks bounds, extent, alignment, initialization,
and lifetime. [Memory Model](memory-model.md) defines these checks.

## Current Limits

The compiler does not provide these vector operations:

- lane extraction or insertion;
- shuffles or splats;
- comparison masks;
- reductions;
- vector `fma`;
- integer vector division; or
- 64-bit integer-lane multiplication.

The compiler does not perform a general automatic vectorization pass.
