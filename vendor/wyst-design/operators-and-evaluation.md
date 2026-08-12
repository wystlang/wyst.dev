---
title: "Operators and Evaluation"
group: reference
section: language
order: 130
summary: "Evaluation order, operator typing, arithmetic edge cases, precedence, and eager selection."
---

# Operators and Evaluation

> **Canonical scope.** This reference defines operator syntax, typing, evaluation order, and arithmetic results.
> [Type System](type-system.md) defines operand types and explicit conversions.
> [Memory Model](memory-model.md) defines memory operations.

Precedence determines expression grouping. Evaluation order determines when each grouped expression runs.

## Evaluation order

Wyst evaluates expression components in source order.

- A binary operator evaluates its left operand before its right operand.
- A call evaluates an indirect callee before its arguments.
- Call arguments evaluate from left to right.
- Aggregate elements evaluate from left to right.
- Struct fields evaluate in written order.
- An index expression evaluates its base before its index.
- A conversion evaluates its operand before conversion.
- An assignment evaluates its target before its value.
- A compound assignment evaluates its target once.
- A branch evaluates its condition before the selected path.

`&&` and `||` are exceptions to unconditional right-operand evaluation.

`&&` evaluates the right operand only when the left operand is `true`.

`||` evaluates the right operand only when the left operand is `false`.

## Operand typing

Concrete binary operands normally need the same type.

A representable numeric literal can bind to the other operand's concrete numeric type.

The same rule applies to a numeric nominal scalar.

The compiler rejects implicit mixed-width and mixed-signedness arithmetic.

Use the named conversions in [Type System](type-system.md) before applying an operator.

## Unary operators

| Operator | Accepted operand | Result |
|---|---|---|
| `+value` | Numeric scalar or numeric vector | Operand type |
| `-value` | Signed integer, float, or matching vector | Operand type |
| `!value` | `bool` | `bool` |
| `~value` | Integer scalar or integer vector | Operand type |
| `xfer value` | Transferable resource value | Operand type |

Unary integer negation wraps to the operand width.

Therefore, negating the minimum signed integer returns the same bit pattern.

`xfer` performs an explicit resource transfer. See [Type System](type-system.md#resource-modifiers).

## Scalar binary operators

### Arithmetic

| Operators | Accepted operands | Result |
|---|---|---|
| `+`, `-`, `*`, `/` | Matching integer operands | Operand type |
| `+`, `-`, `*`, `/` | Matching floating-point operands | Operand type |
| `%`, `%%` | Matching integer operands | Operand type |

Matching numeric nominal scalars use the carrier operations and preserve the nominal type.

Typed addresses do not accept `+` or `-`.

Use the explicit address-derivation operations in [Type System](type-system.md#typed-addresses).

### Bitwise and shift operators

| Operator | Meaning | Accepted operands |
|---|---|---|
| `&` | Bitwise AND | Matching integers |
| `\|` | Bitwise OR | Matching integers |
| `^` | Bitwise XOR | Matching integers |
| `&^` | Bit clear | Matching integers |
| `<<` | Left shift | Integer value and unsigned integer count |
| `>>` | Right shift | Integer value and unsigned integer count |

`left &^ right` computes `left & ~right`.

An untyped shift count binds to `u32`.

The shift result has the left operand's type.

`>>` uses an arithmetic shift for signed values. It uses a logical shift for unsigned values.

`<<` discards high bits outside the left operand's width.

### Logical operators

`&&` and `||` require `bool` operands. They return `bool`.

Both operators use the short-circuit rules in [Evaluation order](#evaluation-order).

### Comparisons

The comparison operators are `==`, `!=`, `<`, `<=`, `>`, and `>=`.

Matching primitive numeric values and nominal numeric values support all six operators.

Matching typed addresses support all six operators.

`bool`, function pointers, slices, and enums support only `==` and `!=`.

Function pointer equality requires matching callable types.

A function pointer can compare with literal `0` by equality only.

Slice equality compares `data` and `len`. It does not compare referenced elements.

Enum equality compares tags. For matching payload tags, it also compares the active payload.

Vector comparisons are invalid. Wyst has no vector comparison result type.

Comparisons return `bool`.

Comparison operators do not associate. Write `a < b && b < c` instead of `a < b < c`.

## Integer results

Fixed-width integer addition, subtraction, and multiplication wrap modulo `2^width`.

This rule applies to signed and unsigned integers.

Integer division truncates toward zero.

Division by zero returns zero.

The minimum signed value divided by `-1` returns the minimum signed value.

`%` is the truncating remainder.

Its nonzero result has the dividend's sign.

For `left % 0`, the result is `left`.

The minimum signed value modulo `-1` returns zero.

`%%` is the floored remainder.

Its nonzero result has the divisor's sign.

For `left %% 0`, the result is `left`.

The minimum signed value floored-modulo `-1` returns zero.

Scalar shift counts are reduced modulo the AArch64 operation width.

The operation width is 32 bits for integer value widths through 32 bits and 64
bits for value widths from 33 through 64 bits. The result is then normalized
back to the left operand's exact value width.

## Floating-point results

`f32` and `f64` support unary `+` and `-`.

They support binary `+`, `-`, `*`, `/`, and all six comparisons.

They do not support `%` or `%%`.

Floating-point arithmetic is not valid in a constant expression.

The compiler lowers scalar floating-point operators to A64 floating-point instructions.

Use `fma` for one fused multiply-add operation. See [Semantic Operations and Hardware Declarations](semantic-operations.md).

## Vector operators

Both vector operands must have the same vector type.

| Lane category | Binary operators |
|---|---|
| Integer | `+`, `-`, `&`, `\|`, `^`, `&^`, `<<`, `>>` |
| Integer lanes smaller than 64 bits | All preceding operators and `*` |
| Floating-point | `+`, `-`, `*`, `/` |

Integer vectors support unary `+` and `~`.

Signed integer vectors also support unary `-`.

Floating-point vectors support unary `+` and `-`.

Vector division accepts only floating-point lanes.

See [SIMD](simd.md) for accepted vector shapes and instruction lowering.

## Precedence and associativity

The table runs from lowest precedence to highest precedence.

| Level | Forms | Associativity |
|---:|---|---|
| 1 | `\|\|` | Left |
| 2 | `&&` | Left |
| 3 | `==`, `!=`, `<`, `<=`, `>`, `>=`, `is` | Non-associative |
| 4 | `\|` | Left |
| 5 | `^` | Left |
| 6 | `&`, `&^` | Left |
| 7 | `<<`, `>>` | Left |
| 8 | `+`, `-` | Left |
| 9 | `*`, `/`, `%`, `%%` | Left |
| 10 | Prefix `+`, `-`, `!`, `~`, `xfer` | Prefix |
| 11 | Call, index, slice, field, postfix `?` | Postfix |

Parentheses override these grouping rules.

Postfix `?` forwards an exact outcome failure. See [Outcomes, Progress, and Terminal Control](outcomes-and-progress.md).

## Compound assignment

Wyst provides these compound assignments:

`+=`, `-=`, `*=`, `/=`, `%=`, `%%=`, `&=`, `|=`, `^=`, `&^=`, `<<=`, `>>=`, `&&=`, and `||=`.

The target must be mutable storage.

The corresponding binary operator must accept the target value and right operand.

The target keeps its type. The compiler does not insert a conversion back to that type.

The target expression evaluates once.

`&&=` evaluates its right operand only when the stored value is `true`.

`||=` evaluates its right operand only when the stored value is `false`.

A direct `per_cpu` binding does not accept compound assignment.

<!-- wyst-contract: check-pass -->
```wyst
module manual.compound_operators

fn update(left: u32, right: u32, enabled: bool) -> u32 {
  var value = left + right
  if enabled && right != 0 {
    value <<= 1
  }

  return value &^ 0xff00
}
```

## Eager selection

`select(condition, when_true, when_false)` evaluates all three arguments from left to right.

The condition must have type `bool`.

Both result arms must bind to one common supported type.

Supported results are `bool`, integers, floats, nominal scalars, typed addresses, and function pointers.

`select` then returns the true or false arm according to the condition.

Use an `if` expression when the unselected arm must not run.
