---
title: "Chapter 7: Wyst Operator Specification"
group: chapter
chapter: 7
order: 7
summary: "Expression syntax, arithmetic, comparison, casts, precedence, and branchless selection."
---

# Chapter 7: Wyst Operator Specification

> Formal specification of Wyst operators, precedence, and arithmetic semantics.
>
> **Canonical scope.** This document is the canonical reference for operator
> set, precedence, and arithmetic semantics (overflow, division, shift,
> floating-point). Type conversions and the rules for crossing types under
> operators (mixed-signedness, mixed-width, address arithmetic) live in
> [chapter-06-types.md §1.4.1](chapter-06-types.md). The operator-with-ARM64-lowering summary
> table at [chapter-06-types.md §1.12](chapter-06-types.md) points back here for full
> semantics.

Operator semantics depend on the type names and conversion rules in
[chapter 6](chapter-06-types.md). They define the expressions, casts,
comparisons, and precedence used by control-flow constructs.

---

## Overview

Wyst operators are categorized as:

- **unary** — one operand, prefix position
- **binary** — two operands, infix position
- **compound assignment** — binary operation fused with assignment

All operators provide two guarantees:

**No compiler-exploitable undefined behavior.** The compiler never uses an unspecified
program state as a license to transform code. If the source says `x + 1`, the compiler
emits `add`. It does not reason about whether `x + 1` can overflow or use that assumption
to delete branches.

**Named behavior categories for edge cases.** Arithmetic edge cases in this
chapter are `Defined` unless a subsection explicitly says the selected target
or architecture defines the result. The behavior taxonomy in
[chapter-01-language-design.md](chapter-01-language-design.md) controls the
optimizer consequence: edge cases do not imply impossible-state assumptions.

Arithmetic overflow, wrap, division, and shift semantics are fully specified below.
Memory access behavior is specified in the memory model.

---

## Evaluation Order

Expression evaluation is left-to-right in source order unless a construct in
this section states otherwise. Precedence and associativity decide how tokens
group into subexpressions; evaluation order decides when those subexpressions
are evaluated.

Binary operators evaluate the left operand first, then the right operand.
Logical `&&` and `||` still short-circuit: the left operand is evaluated first,
and the right operand is evaluated only when required to determine the result.

Function calls evaluate the callee expression first for indirect calls, then
evaluate arguments left-to-right. Direct calls have no runtime callee expression
to evaluate; their arguments are evaluated left-to-right. Inline calls follow
the same argument-evaluation rule before parameter binding and body expansion.

Nested calls follow from the recursive rule. In `f(g(), h())`, `g()` is fully
evaluated before `h()`, then the outer call to `f` is evaluated after both
arguments are available.

Indexing evaluates the base expression first, then the index expression, then
performs the element address calculation and load or store implied by the
surrounding context. Slicing uses the same base-first rule, then evaluates the
start bound before the end bound when both bounds are present.

Casts and conversions evaluate their operand first, then perform the explicit
conversion. A conversion never permits the scheduler to move an observable
effect from the operand across an adjacent observable effect.

Aggregate constructors evaluate their written elements left-to-right. Tuple
elements, array elements, vector lanes, slice-constructor operands, and enum
payload arguments follow the order written in source. Struct field initializers
also evaluate in written source order, even when the fields are written out of
declaration order:

<!-- wyst-contract: sketch -->
```wyst
const pair: Pair = { b = f(), a = g() } // evaluates f() before g()
```

Struct layout and storage still follow the struct declaration. Source-order
initializer evaluation does not change field offsets, ABI classification, or
the declaration-order field identity of the constructed value.

Assignments evaluate the storage target first, then the assigned value, then
perform the store or local rebinding. For memory assignments, the address side
is evaluated before the value side. Compound assignments evaluate the storage
target once, load the current value, then evaluate the right-hand expression,
compute the operator result, and store or rebind the result. Logical compound
assignments keep their short-circuit behavior after the target/current value is
established.

An assignment governed by `language.callable-storage-contracts` preserves that
source order for every explicit `per_cpu` target expression: a written base or
index is evaluated before the assigned value. Its current-core base acquisition is hidden target support, not a
source-visible address expression. Lowering performs that one fresh acquisition
only after the target expressions and assigned value have completed, immediately
before the final offset calculation and store. Therefore no call or other
effectful RHS can leave a stale current-core base live across the effect, and a
terminal target or RHS produces neither an acquisition nor a store.

Runtime `if`, `while`, integer-range `for`, `match`, and expression-valued `if`
constructs evaluate their condition or selector before any branch body or arm
body is entered. Branch bodies are not eagerly evaluated: only the selected
runtime path evaluates its expressions. Expression-valued `if` follows the same
condition-first branch rule; it is the branching counterpart to eager
`select`.

Scheduling may move pure work only when the move is observationally equivalent
under the memory model, effect system, and active scheduling region. It may not
change the order of observable effects such as volatile accesses, atomics,
barriers, calls, inline assembly, floating-point state effects, traps, or
short-circuit suppression.

ABI argument placement is not expression evaluation order. The source argument
list determines evaluation order; the Native ABI or AAPCS64 register/stack
classification only determines where already-evaluated argument values are
placed for the call.

`wync check --warn-effectful-nesting` enables an optional lint for expressions
that compose multiple calls, volatile memory accesses, atomics, or traps in one
expression tree. The lint is advisory: Wyst still defines left-to-right
evaluation, but the warning asks programmers to bind effectful subexpressions
to locals before combining them.

---

## Unary Operators

Unary operators have **higher precedence than all binary operators**.

They appear in prefix position: `op x`.

| Operator | Name               | Definition                                                        |
| -------- | ------------------ | ----------------------------------------------------------------- |
| `+`      | identity           | `0 + x`                                                           |
| `-`      | negation           | `0 - x`                                                           |
| `~`      | bitwise complement | every bit of `x` flipped; equivalent to `-(x + 1)` for signed `x` |
| `!`      | logical NOT        | `false` if `x` is true, `true` if `x` is false                    |

The complement operator `~` flips every bit of its operand. For an unsigned
integer `x` of width `n`, the result is `(2ⁿ - 1) ^ x` — all bits inverted.
For a signed integer `x`, the result is always `-(x + 1)`.

---

## Binary Operators

### Arithmetic

| Operator | Name                | Operands         |
| -------- | ------------------- | ---------------- |
| `+`      | sum                 | integers, floats |
| `-`      | subtraction         | integers, floats |
| `*`      | multiplication      | integers, floats |
| `/`      | division            | integers, floats |
| `%`      | modulo (truncated)  | integers         |
| `%%`     | remainder (floored) | integers         |

These operators are available in runtime expressions after type checking.
Compile-time constant folding currently covers integer arithmetic and boolean
logic. Floating-point literal binding is supported, but floating-point
arithmetic inside constant declarations, `#static_assert`, layout expressions, and other
compile-time constant contexts is a future surface:

<!-- wyst-contract: check-pass -->
```wyst
module ops

fn compute() -> u64 {
  const x: u64 = 40
  const y: u64 = 2
  return x + y
}
```

<!-- wyst-contract: future -->
```wyst
const SCALE = 1.5 * 2.0
```

### Bitwise

| Operator | Name            | Operands |
| -------- | --------------- | -------- |
| `\|`     | bitwise OR      | integers |
| `^`      | bitwise XOR     | integers |
| `&`      | bitwise AND     | integers |
| `&^`     | bitwise AND-NOT | integers |
| `<<`     | left shift      | integers |
| `>>`     | right shift     | integers |

The `&^` operator computes `a & (~b)` — AND with the complement of the right
operand. It is provided as a single operator for clarity and direct lowering
to `bic` on ARM64. The `~` symbol is reserved exclusively for unary complement;
it does not appear as a binary operator.

### Comparison

Comparison operators produce a `bool` result.

| Operator | Name             |
| -------- | ---------------- |
| `==`     | equal            |
| `!=`     | not equal        |
| `<`      | less than        |
| `<=`     | less or equal    |
| `>`      | greater than     |
| `>=`     | greater or equal |

Both operands must have the **same concrete type**. Mixed-signedness
(`i32 < u32`) and mixed-width (`u8 < u64`) comparisons are compile errors;
the programmer must cast explicitly. There is no implicit promotion. See
[chapter-06-types.md §1.4.1](chapter-06-types.md) for the full conversion model.
Address comparisons are defined for the same address lens: `@T == @T`,
`@T != @T`, `@T < @T`, `@T <= @T`, `@T > @T`, and `@T >= @T` are valid and
use unsigned numeric address ordering. Slice, dynamic-array, enum, and
function-pointer comparisons are equality-only. `[]T == []T`,
`DynamicArray<T> == DynamicArray<T>`, `fn(u64) -> u64 == fn(u64) -> u64`, and
their `!=`
forms are valid, but ordered checks require explicit field comparisons or
explicit comparisons such as `s.len < t.len`, `arr.capacity < other.capacity`,
or `address<u64>(callback) < address<u64>(other)`.
Enum equality is tag equality for payload-less enums and tag-plus-active-payload
equality for payload enums; inactive payload bytes and padding bytes are not
compared.
Slice equality is descriptor equality (`data` and `len`), not element-wise
memory comparison. Dynamic-array equality is descriptor-state equality
(`data`, `len`, `capacity`, `storage_identity`, `growth_policy`,
`failure_policy`, and `movement_policy`), not element-wise memory comparison.
Untyped integer constants may bind to the data-address lens for equality checks,
so `addr == 0` is valid. Function pointers may also compare with the untyped
integer constant `0`, so `callback == 0` is valid; nonzero integer comparisons
still require an explicit numeric cast. Slices and dynamic arrays do not compare
with integer zero; use an explicit descriptor projection such as `s.data == 0`,
`s.len == 0`, `arr.data == 0`, or `arr.len == 0` to say which sentinel is
intended. Comparing addresses, slices, or dynamic arrays of different element
types, enums of different types, or function pointers of different shapes or
calling conventions, is a compile error unless the program retargets or casts
explicitly.

### Logical

Logical operators operate on `bool` values and short-circuit: the right
operand is only evaluated if the result is not determined by the left operand
alone.

| Operator | Name        | Definition                       |
| -------- | ----------- | -------------------------------- |
| `&&`     | logical AND | `b` if `a` is true, else `false` |
| `\|\|`   | logical OR  | `true` if `a` is true, else `b`  |

Short-circuit behavior is observable: if evaluating the right operand has
side effects (e.g. a volatile load), those side effects are suppressed when
the result is determined by the left operand.

### Vector

SIMD vector operators use the `[T:N]` spelling. `[N]T` is always a fixed array.

For `[T:N]` types that fit within one ARM64 SIMD register (`N * sizeof(T) <= 16`),
the arithmetic and bitwise binary operators are defined **element-wise**. Each
maps to a single ARM64 SIMD instruction. No loops, no unrolling.

<!-- wyst-contract: sketch -->
```wyst
const a: [f32: 4] = [1.0, 2.0, 3.0, 4.0]
const b: [f32: 4] = [5.0, 6.0, 7.0, 8.0]
const c = a + b    // [6.0, 8.0, 10.0, 12.0] — one vector add
```

Element-wise operators by operand kind:

| Operator | Float vectors | Integer vectors | Notes                        |
| -------- | ------------- | --------------- | ---------------------------- |
| `+`      | yes           | yes             |                              |
| `-`      | yes           | yes             |                              |
| `*`      | yes           | yes             |                              |
| `/`      | yes           | no              | no ARM64 integer SIMD divide |
| `&`      | no            | yes             |                              |
| `\|`     | no            | yes             |                              |
| `^`      | no            | yes             |                              |
| `&^`     | no            | yes             | AND-NOT; lowers to `bic`     |
| `<<`     | no            | yes             |                              |
| `>>`     | no            | yes             |                              |

All compound assignment forms apply: `a += b` is `a = a + b`, element-wise.

**The 16-byte constraint is hard.** Element-wise operators are not defined for
`[T:N]` where `N * sizeof(T) > 16`. A `[f32:32] + [f32:32]` expression is a
compile error — write the loop so the iteration cost is visible.

Valid element-wise vector types:

| Type      | Bytes | ARM64 arrangement | Signed variant |
| --------- | ----- | ----------------- | -------------- |
| `[u8:16]` | 16    | sixteen byte lanes | `[i8:16]`     |
| `[u16:8]` | 16    | eight halfword lanes | `[i16:8]`   |
| `[u32:4]` | 16    | four word lanes    | `[i32:4]`      |
| `[u64:2]` | 16    | two doubleword lanes | `[i64:2]`   |
| `[f32:4]` | 16    | four single-precision lanes | —       |
| `[f64:2]` | 16    | two double-precision lanes | —        |
| `[u8:8]`  | 8     | eight byte lanes   | `[i8:8]`       |
| `[u16:4]` | 8     | four halfword lanes | `[i16:4]`     |
| `[u32:2]` | 8     | two word lanes     | `[i32:2]`      |
| `[f32:2]` | 8     | two single-precision lanes | —        |

Signed variants affect `>>` (arithmetic shift rather than logical) and
comparison operators. Addition, subtraction, multiplication, and bitwise
operators produce the same bit pattern regardless of signed/unsigned
interpretation.

---

## Operator Precedence

Unary operators have the highest precedence and always bind tighter than any
binary operator.

Binary operators use conventional systems-language precedence for arithmetic,
shift, bitwise, comparison, and logical operators. Higher numbers bind more
tightly.

| Precedence | Operators                   | Associativity   |
| ---------- | --------------------------- | --------------- |
| 9          | `*` `/` `%` `%%`            | left            |
| 8          | `+` `-`                     | left            |
| 7          | `<<` `>>`                   | left            |
| 6          | `&` `&^`                    | left            |
| 5          | `^`                         | left            |
| 4          | `\|`                        | left            |
| 3          | `==` `!=` `<` `>` `<=` `>=` | non-associative |
| 2          | `&&`                        | left            |
| 1          | `\|\|`                      | left            |

Binary operators of equal precedence associate **left to right**, except
comparisons. Comparison operators are non-associative: `a < b < c` is rejected
unless parentheses make the grouping explicit.

<!-- wyst-contract: sketch -->
```wyst
x / y * z     // same as (x / y) * z
a + b - c     // same as (a + b) - c
a << b >> c   // same as (a << b) >> c
a & b & c     // same as (a & b) & c
```

Parentheses override precedence in the standard way.

#### Common Expressions

<!-- wyst-contract: sketch -->
```wyst
// UART flag check — & binds before !=
UARTFR.load() & TXFF != 0   // same as (UARTFR.load() & TXFF) != 0

// Bit manipulation
x &^ mask                           // clear bits in mask
x | (1 << n)                        // set bit n
(x >> 4) & 0xF                      // extract nibble
x ^ y                               // toggle bits in x that are set in y

// Parenthesize when relying on a lower-precedence subexpression
(x | y) + 1
```

---

## Compound Assignment Operators

All binary operators have a compound assignment form. `a op= b` is exactly
equivalent to `a = a op b`. The left operand `a` is evaluated once.

### Arithmetic Compound Assignment

| Operator | Equivalent   |
| -------- | ------------ |
| `+=`     | `a = a + b`  |
| `-=`     | `a = a - b`  |
| `*=`     | `a = a * b`  |
| `/=`     | `a = a / b`  |
| `%=`     | `a = a % b`  |
| `%%=`    | `a = a %% b` |

### Bitwise Compound Assignment

| Operator | Equivalent   |
| -------- | ------------ |
| `\|=`    | `a = a \| b` |
| `^=`     | `a = a ^ b`  |
| `&=`     | `a = a & b`  |
| `&^=`    | `a = a &^ b` |
| `<<=`    | `a = a << b` |
| `>>=`    | `a = a >> b` |

### Logical Compound Assignment

| Operator | Equivalent     |
| -------- | -------------- |
| `&&=`    | `a = a && b`   |
| `\|\|=`  | `a = a \|\| b` |

Short-circuit semantics are preserved in `&&=` and `||=`. If `a` is `false`,
`b` is not evaluated in `&&=`. If `a` is `true`, `b` is not evaluated in `||=`.

---

## Integer Arithmetic

### Division and Modulo — Truncated (`/`, `%`)

For integer values `x` and `y`, the quotient `q = x / y` and remainder
`r = x % y` satisfy:

```
x = q * y + r     and     |r| < |y|
```

Division truncates toward zero. The remainder has the same sign as the dividend:

<!-- wyst-contract: sketch -->
```wyst
 7 /  3  ==  2      7 %  3  ==  1
-7 /  3  == -2     -7 %  3  == -1
 7 / -3  == -2      7 % -3  ==  1
-7 / -3  ==  2     -7 % -3  == -1
```

### Division and Remainder — Floored (`/`, `%%`)

For integer values `x` and `y`, the floored remainder `r = x %% y` satisfies:

```
r = x - y * floor(x / y)
```

The floored remainder has the same sign as the divisor. This matches
mathematical modulo behavior:

<!-- wyst-contract: sketch -->
```wyst
 7 %%  3  ==  1
-7 %%  3  ==  2
 7 %% -3  == -2
-7 %% -3  == -1
```

### Overflow Exception — Most Negative Value

The single exception to integer division semantics applies when the dividend
`x` is the most negative representable value for its signed type, and the
divisor `y` is `-1`. In this case, the mathematical quotient overflows the
type:

```
q = x / -1  ==  x          (two's complement wraps)
r or m = 0
```

No panic occurs. The result is defined as the wrapped value.

### Division by Zero

Integer divide by zero is defined and does not trap. `x / 0` produces `0`.
Modulo by zero is also defined: `x % 0` and `x %% 0` produce `x`.

The same rules apply at compile time and runtime.

For `%%`, this is a semantic result, not permission to expose the target's
native divide-by-zero behavior. A backend may use any lowering that is proven to
produce `x` when the divisor is zero. It does not have to emit a separate
divisor-zero guard when the selected instruction sequence is already zero-safe.

---

## Integer Overflow

### Unsigned Integers

For unsigned integers, the operators `+`, `-`, `*`, and `<<` are computed
modulo `2ⁿ`, where `n` is the bit width of the type. High bits are silently
discarded. Programs may rely on wrap-around behavior:

<!-- wyst-contract: sketch -->
```wyst
var x: u8 = 255
x += 1   // x == 0, defined wrap
```

### Signed Integers

For signed integers, the operators `+`, `-`, `*`, `/`, and `<<` may overflow.
Overflow is **defined behavior** in Wyst. The result is the value produced by
two's complement arithmetic for the given type width.

No runtime panic occurs on signed overflow. The assembler may not assume
overflow does not occur and may not optimize code on that basis:

<!-- wyst-contract: sketch -->
```wyst
// The assembler may NOT assume (x < x + 1) is always true
// because x + 1 may wrap to a smaller value
```

This means, in particular, that `x < x + 1` is not a tautology and must be
evaluated as written.

---

## Shift Operators

The shift operators `<<` and `>>` shift the left operand by the count given
by the right operand. The shift count must be **non-negative**.

Operand typing:

- The left operand may be any integer (`u8`–`u64`, `i8`–`i64`).
- The right operand must be a non-negative integer. If untyped, it is
  bound to `u32`. If typed, it must be one of `u8`/`u16`/`u32`/`u64` —
  signed shift counts are a compile error.
- The result type is the type of the left operand.

Shift behavior:

| Left operand     | Shift kind | Description                          |
| ---------------- | ---------- | ------------------------------------ |
| signed integer   | arithmetic | sign bit is extended on right shifts |
| unsigned integer | logical    | zeros are shifted in on right shifts |

### Shift Count is Modular

The shift count is reduced modulo `max(32, width(T))`, where `T` is the type of
the left operand, before the shift is performed. The result is then stored in
the left operand type. This matches ARM64 scalar register-shift behavior:
8-bit, 16-bit, and 32-bit scalar shifts use the 32-bit count domain; 64-bit
scalar shifts use the 64-bit count domain.

| Left operand width | Count taken modulo |
| ------------------ | ------------------ |
| 64-bit             | 64                 |
| 32-bit             | 32                 |
| 16-bit             | 32                 |
| 8-bit              | 32                 |

Examples for `u64`:

<!-- wyst-contract: sketch -->
```wyst
const x: u64 = 1
x << 63   // 0x8000_0000_0000_0000
x << 64   // same as x << 0  →  1        (64 mod 64 == 0)
x << 65   // same as x << 1  →  2        (65 mod 64 == 1)
x >> 64   // same as x >> 0  →  x
```

Examples for narrow scalar integers:

<!-- wyst-contract: sketch -->
```wyst
const b: u8 = 1
b << 8    // 0: 8 mod 32 == 8, then the u8 result keeps the low 8 bits
b << 32   // 1: 32 mod 32 == 0
```

This is what ARM64 register shifts produce: `lsl wD, wA, wB` for scalar
integer widths up to 32 bits and `lsl xD, xA, xB` for 64-bit scalar integers.
There is no hidden range check and no synthetic mask for narrow scalar counts.

Programs that require "zero result for large shift count" semantics must write
the condition explicitly:

<!-- wyst-contract: sketch -->
```wyst
result = if shift_count < 64 { x << shift_count } else { 0 }
```

This makes the behavior visible and the cost of the range check explicit,
consistent with Wyst's principle of exposing computational behavior rather
than hiding it.

### Shift Relationships to Arithmetic

<!-- wyst-contract: sketch -->
```wyst
x << 1    // same as x * 2
x >> 1    // same as x / 2, truncated toward negative infinity (arithmetic shift)
```

---

## Floating-Point Operators

Floating-point arithmetic follows IEEE 754 semantics with the following
clarifications.

### Unary

<!-- wyst-contract: sketch -->
```wyst
+x    // identity: same as x
-x    // negation: flips the sign bit
```

### Arithmetic

Standard IEEE 754 binary operations: `+`, `-`, `*`, `/`.

Floating-point arithmetic follows IEEE 754 semantics throughout, including
for exceptional cases. Division by zero produces `+Inf`, `-Inf`, or `NaN`
as defined by IEEE 754 — no runtime panic occurs. Programs that need to
detect these conditions should check the result explicitly:

<!-- wyst-contract: sketch -->
```wyst
const result: f64 = a / b

if result == result {   // NaN check: NaN != NaN by IEEE 754
    // result is a valid finite or infinite value
}
```

Runtime floating-point arithmetic, comparisons, casts, unary negation, and
`fma` introduce the `fp_state` effect category. Floating-point literals and
pure register moves do not introduce `fp_state` by themselves.

### Fused Operations

Floating-point operations are **not fused by default**. `a * b + c` is always
two operations with two roundings, matching the written source expression.

To explicitly request a fused multiply-add (single rounding, using ARM64
`fmadd`/`fmsub`), use the unshadowable `fma` operation:

<!-- wyst-contract: sketch -->
```wyst
const result = fma(a, b, c)          // a * b + c, fused — single rounding
const difference = fma(a, b, -c)     // a * b - c, fused — lowers to fmsub
```

The distinction matters for:

- **Reproducibility**: `a * b + c` always produces the two-rounded result,
  regardless of platform or compiler build identity.
- **Checksums**: sequential rounding is exact and consistent.
- **Performance-sensitive paths**: `fma` is explicitly faster where available
  and the programmer has decided the rounding difference is acceptable.

There is no opt-out mechanism for accidental fusion. If the source does not
use `fma`, the compiler does not fuse.

---

## Disambiguation Notes

Several operator symbols appear in multiple roles. The parser resolves them
by syntactic position and token sequence.

| Symbol | Unary context      | Binary context    |
| ------ | ------------------ | ----------------- |
| `~`    | bitwise complement | _(no binary use)_ |
| `-`    | negation           | subtraction       |
| `+`    | identity           | addition          |
| `^`    | _(no unary use)_   | bitwise XOR       |
| `&`    | _(no unary use)_   | bitwise AND       |

The `~` symbol is **unary only**. It never appears as a binary infix operator.
This makes it unambiguous in all positions.

The `&^` binary operator is always parsed as a two-token sequence in infix
position. It is never ambiguous with unary `~` because `~` does not appear
after `&` in any valid expression.

---

## Branchless Conditional Selection

<!-- wyst-contract: sketch -->
```wyst
const result = select(cond, a, b)
```

`select(cond, a, b)` follows the general call-like evaluation order: it
evaluates `cond` first, then evaluates `a`, then evaluates `b`. It returns `a`
if `cond` is true, `b` otherwise. It is
**always branchless** — it lowers to a `cmp` + `csel` sequence (one instruction
after the compare). The compiler never expands `select` into a branch.

**Signature:** `select(cond : bool, a : T, b : T) -> T`

**Supported types for T:**

| Category          | Types                      |
| ----------------- | -------------------------- |
| Unsigned integers | `u8`, `u16`, `u32`, `u64`  |
| Signed integers   | `i8`, `i16`, `i32`, `i64`  |
| Floating point    | `f32`, `f64`               |
| Other scalars     | `bool`, `@T` (any pointer) |

For vector lane selection, use bitwise
masking.

**Semantics:**

- Both arms are evaluated unconditionally. Side effects in both arms (memory
  loads, volatile accesses) always occur, with `a`'s effects observed before
  `b`'s effects.
- The result type matches the arm types exactly — no implicit widening or
  conversion.
- `cond` must be `bool` (the result of a comparison or logical operation),
  not an integer.

<!-- wyst-contract: sketch -->
```wyst
// Branchless min
const min = select(a < b, a, b)

// Branchless absolute value (signed)
const abs = select(x < 0, -x, x)

// Branchless clamp
const clamped = select(v < lo, lo, select(v > hi, hi, v))
```

**When to use `select` vs `if`:**

| Use `select` when                                        | Use `if` when                                        |
| -------------------------------------------------------- | ---------------------------------------------------- |
| Both arms are cheap (register-to-register)               | One arm is expensive (memory access, function call)  |
| Branch misprediction is likely (unpredictable condition) | Condition is highly predictable                      |
| The result is a single scalar value                      | The body has side effects that should be conditional |

`select` surfaces the existing `select` IR op from [appendix-a-ir.md §6.6](appendix-a-ir.md). It is
a built-in function form, not a ternary operator — this avoids syntactic
conflicts with existing operators and is grep-friendly.

---

## ARM64 Lowering Correspondence

| Wyst expression  | ARM64 instruction(s)          | Notes                                                            |
| --------------- | ----------------------------- | ---------------------------------------------------------------- |
| `a + b`         | `add xD, xA, xB`              |                                                                  |
| `a - b`         | `sub xD, xA, xB`              |                                                                  |
| `a * b`         | `mul xD, xA, xB`              |                                                                  |
| `a / b`         | `sdiv` / `udiv`               | signed or unsigned by type                                       |
| `a % b`         | `sdiv` + `msub`               | truncated remainder; 2 instructions                              |
| `a %% b`        | `sdiv` + `msub` + adjust      | floored remainder; signed forms include conditional adjustment; zero divisor must still produce `a` |
| `a \| b`        | `orr xD, xA, xB`              |                                                                  |
| `a ^ b`         | `eor xD, xA, xB`              |                                                                  |
| `a & b`         | `and xD, xA, xB`              |                                                                  |
| `a &^ b`        | `bic xD, xA, xB`              | direct ARM64 instruction                                         |
| `a << b`        | `lsl wD/xD, wA/xA, wB/xB`     | count taken modulo `max(32,width(T))`; single instruction        |
| `a >> b`        | `asr` / `lsr`                 | signed → `asr`, unsigned → `lsr`; same count domain as `<<`      |
| `fma(a,b,c)`    | `fmadd dD, dA, dB, dC`        | explicit fused multiply-add; single rounding                     |
| `-x`            | `neg xD, xA`                  |                                                                  |
| `~x`            | `mvn xD, xA`                  |                                                                  |
| `!x`            | `cmp xA, #0` + `cset`         |                                                                  |
| `select(c,a,b)` | `cmp` + `csel xD, xA, xB, cc` | branchless conditional; always one instruction after compare     |

Vector element-wise lowering (examples; arrangement suffix determined by type):

| Wyst expression    | ARM64 mnemonic | Lane arrangement                 |
| ------------------ | -------------- | -------------------------------- |
| `[f32:4]: a + b`   | `fadd`         | four single-precision lanes      |
| `[f32:4]: a - b`   | `fsub`         | four single-precision lanes      |
| `[f32:4]: a * b`   | `fmul`         | four single-precision lanes      |
| `[f32:4]: a / b`   | `fdiv`         | four single-precision lanes      |
| `[f64:2]: a + b`   | `fadd`         | two double-precision lanes       |
| `[i32:4]: a + b`   | `add`          | four word lanes                  |
| `[i32:4]: a * b`   | `mul`          | four word lanes                  |
| `[u8:16]: a + b`   | `add`          | sixteen byte lanes               |
| `[u8:16]: a & b`   | `and`          | sixteen byte lanes               |
| `[u8:16]: a \| b` | `orr`          | sixteen byte lanes               |
| `[u8:16]: a ^ b`   | `eor`          | sixteen byte lanes               |
| `[u8:16]: a &^ b`  | `bic`          | sixteen byte lanes               |

## Outcome operators

Postfix `?` is the sole outcome-specific operator. It accepts only a direct
success-plus-failure operation call in an exactly compatible enclosing
operation and is identical to implicit success plus `forward failure`. It does
not apply to `Result`, translate errors, forward progress/cancellation, or
provide recovery policy. Exhaustive expression `match`, not punctuation
unwrapping, transforms stored outcomes.
