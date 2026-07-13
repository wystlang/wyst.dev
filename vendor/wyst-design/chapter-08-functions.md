---
title: "Chapter 8: Wyst Functions, Control Flow, and Inline Assembly"
group: chapter
chapter: 8
order: 8
summary: "Declarations, functions, parameters, returns, control flow, labels, inline helpers, register pinning, and assembly escape hatches."
---

# Chapter 8: Wyst Functions, Control Flow, and Inline Assembly

> **Canonical scope.** Function declarations and multi-value return (§2.2),
> register pinning (§2.3), labels (§2.4), structured control flow (§2.5),
> function pointers (§2.6), function attributes including `#inline` (§2.7),
> constraints summary (§2.8), and inline assembly (§2.9). The ABI
> (calling-convention-level rules) lives in [chapter-15-abi-spec.md](chapter-15-abi-spec.md);
> exception vectors live in [chapter-14-exception-vectors.md](chapter-14-exception-vectors.md).

The core contract covers declarations, parameters, return values, and
structured control flow. Register pinning, `#naked`, `#ventry`, and inline
assembly are explicit machine-level escape hatches whose ABI and
exception-vector rules are defined elsewhere.

---

### Functions and Control Flow

Wyst uses a **unified declaration syntax** for everything:

```
name : type = value     // local variable (mutable)
name :: type = value    // constant binding (immutable)
name := value           // inferred local variable
name ::= value          // inferred constant binding
```

The colon is the declaration point everywhere. Single `:` declares mutable
storage: inside function bodies it declares locals, and at top level it
declares mutable globals. Double `::` binds constants wherever declarations are
allowed; at top level it also introduces named declarations such as functions,
labels, and types. There is no `fn` keyword
prefix, no type-before-name ordering, and no dot-prefixed labels.

---

## 2.1 Unified Declarations

All declarations follow the same pattern:

```
name : type = value     // mutable storage (local or global by scope)
name :: type = value    // constant binding (local or top-level by scope)
```

### Type Inference

The type annotation can be omitted. When absent, the compiler infers the type from the right-hand side:

<!-- wyst-contract: sketch -->
```wyst
# Explicit type
counter  : u64 = 0

# Inferred — equivalent to `counter : i64 = 0`
counter  := 0

# Inferred constant — equivalent to `LIMIT :: i64 = 16`
LIMIT ::= 16
```

`:=` and `::=` are declaration tokens. Whitespace is not allowed inside
them: `counter : = 0` and `LIMIT :: = 16` are syntax errors.

#### Literal Typing

Integer and float literals are **untyped** until they are bound to a context
that requires a concrete type. The compiler then checks that the value
fits in the target type. See §1.4.1 for the complete model.

| Literal                | Initial type                            | Default when no context demands one |
| ---------------------- | --------------------------------------- | ----------------------------------- |
| `123`                  | `untyped_int`                           | `i64`                               |
| `0x4000`               | `untyped_int`                           | `i64`                               |
| `0b1010`               | `untyped_int`                           | `i64`                               |
| `4_096`                | `untyped_int`                           | `i64`                               |
| `3.14`                 | `untyped_float`                         | `f64`                               |
| `true`, `false`        | `bool`                                  | —                                   |
| `"hello"`              | `string`                                | —                                   |
| `{1, 2, 3}`            | inferred from element types and context | —                                   |
| `[1.0, 2.0, 3.0, 4.0]` | inferred vector type                    | —                                   |

For local inference, `name := expr` infers from a value expression only.
String literals and boolean literals are already concrete, so
`s := "hello"` gives `s : string` and `b := true` gives `b : bool`.
Bare type names are not values: `x := u64` and `x := string` are compile
errors. Write `x : u64 = 0` or `s : string = "hello"` when a type annotation
is intended.

Constant inference uses the same type rules with `::=`, but the right-hand
side must be a constant expression:

<!-- wyst-contract: sketch -->
```wyst
NAME ::= "wyst" // NAME :: string = "wyst"
LIMIT ::= 16 // LIMIT :: i64 = 16
MASK ::= 1 << 5 // MASK :: i64 = 32
```

Inside a function body, `::` and `::=` introduce **local constants**. They are
block scoped, visible only after their declaration, and have no addressable
stack storage:

<!-- wyst-contract: sketch -->
```wyst
zero_bss :: () {
  stride :: u64 = 8
  half ::= stride / 2
  scratch : [half]u8
  lanes : [u32: half]
  #static_assert(half == 4, "stride sanity")

  addr := __bss_start
  while addr < __bss_end {
    u64@[addr as.address @u64] = 0
    addr += stride
  }
}
```

Local constants can feed later constant contexts such as fixed-array lengths,
vector lane counts, `#static_assert`, and `repeat` counts. They cannot be
assigned, pinned with `#pin`, or passed to `%addr_of`, because they are
immutable values rather than local storage slots.

The current constant evaluator folds integer arithmetic, boolean logic, and
the compile-time query forms. Floating-point literals may bind directly, but
floating-point arithmetic in a constant expression is future work:

<!-- wyst-contract: future -->
```wyst
HALF_PI ::= 3.141592653589793 / 2.0
```

Use annotations or categorized conversions to select a narrower literal type:

<!-- wyst-contract: sketch -->
```wyst
x : u8 = 123      // annotation gives the literal a target type
y := 0x4000 as.numeric u64
z := 3.14 as.float f32
```

Out-of-range literals are rejected at the bind site:

<!-- wyst-contract: sketch -->
```wyst
counter : u8 = 256 // compile error: 256 not representable in u8
mask : u8 = 0xFF // OK
```

#### Inference from Memory Operations

Loads and stores also drive inference:

<!-- wyst-contract: sketch -->
```wyst
mem : @u64 = 0x4000

# Type inferred from the load — x is u64
x := u64@[mem]

# Explicit form — equivalent
x : u64 = u64@[mem]
```

#### Full Examples

<!-- wyst-contract: sketch -->
```wyst
# Local variables (mutable)
counter  : u64          = 0        // explicit
count    := 0                       // i64 (default when no context demands a type)
total    : u64 = 0                  // u64 (literal 0 is untyped, fits)
ptr      : @u8          = buffer   // address type requires annotation
callback : @(u64) -> u64 = #addr_of(handler)  // function pointer requires annotation

# Constants (immutable)
BASE :: u64 = 0x4000_0000
```

---

## 2.2 Functions

Functions are declared with `::` binding. No `fn` keyword — the signature itself is the type:

<!-- wyst-contract: sketch -->
```wyst
name :: (args) -> ret { body }              // returns a value
name :: (args) { body }                      // no return value (omit -> entirely)
name :: () #noreturn { body }                // never returns to caller
```

Named tuple multi-return syntax:

<!-- wyst-contract: sketch -->
```wyst
name :: (args) -> (a: T1, b: T2) { body }
```

Example:

<!-- wyst-contract: sketch -->
```wyst
sum :: (data : @u64, count : u64) -> u64 {

  total : u64 = 0

  repeat count, i {
    total += u64@[data + i]
  }

  return total
}
```

`return` is valid inside function blocks. It returns from the function's own stack frame.
After a statement that cannot fall through, later statements in the same block
are unreachable and are rejected. Non-fallthrough statements include
`return`, `goto`, `%eret()`, unbreakable `loop` statements, and direct calls to
functions declared `#noreturn`. A direct `#noreturn` call is a terminal
statement in ordinary functions, `#naked` functions after their stack contract
permits the call, and labels. A `loop` statement can fall through only if its
body contains a `break` that targets that loop. A `repeat 0` statement always
falls through. A nonzero `repeat` statement can fall through when its body can
reach the closing brace, `break` exits the repeat, or `continue` advances
through the final iteration.

`repeat N, i { ... }` binds `i` as an immutable `u64` counter scoped to the
loop body. The counter starts at `0` and reaches `N - 1`; `repeat 0, i { ... }` never
executes its body. Unbound `repeat N { ... }` remains the same form. `repeat`
does not have range syntax; write the count expression directly.

---

## 2.2.1 Multiple Return Values

Functions can return multiple values using a **tuple return type**:

<!-- wyst-contract: sketch -->
```wyst
foo :: () -> (x: u8, y: u64) {
  return (5, 100)
}
```

| Part                 | Meaning                               |
| -------------------- | ------------------------------------- |
| `-> (x: u8, y: u64)` | tuple return type with named fields   |
| `return (5, 100)`    | return expression producing the tuple |

The names in the return type (`x`, `y`) are the **field names** of the return
tuple. They exist so the caller can inspect fields by name.

### Binding Multiple Return Values

<!-- wyst-contract: sketch -->
```wyst
result : (x: u8, y: u64) = foo()
x_val = result.x
y_val = result.y

x, y := foo()
```

Call results bind as tuple values whose fields are read by name. The order of
field names in the return type determines the ABI return-register order and
the positional order for tuple destructuring. Use `_` to discard a field:

<!-- wyst-contract: sketch -->
```wyst
_, remainder := divmod(7, 3)
```

### Single-Element Tuples

A single return value is just the plain type (no tuple needed):

<!-- wyst-contract: sketch -->
```wyst
get_count :: () -> u64 {
  return 42
}
```

Tuples are only required for **two or more** return values.

### ARM64 Lowering

Multiple return values map directly to Wyst Native ABI return registers:

| Return Count | Registers Used |
| ------------ | -------------- |
| 1            | x0             |
| 2            | x0, x1         |
| 3            | x0, x1, x2     |
| 4            | x0, x1, x2, x3 |

Note: AAPCS64 functions use a separate compatibility surface. `[aapcs]` tuple
returns are outside the direct multi-return model; the 4-register return is a
Wyst Native ABI extension.

<!-- wyst-contract: sketch -->
```wyst
# Wyst
foo :: () -> (x: u8, y: u64) {
    return (5, 100)
}
```

```asm
# ARM64
mov w0, #5          // x -> x0 (lower 8 bits)
mov x1, #100        // y -> x1
ret
```

Wider types (f64, vectors) use the appropriate register class (d0-d3 for floats, v0-v3 for SIMD).

### Function Pointer Types

Multi-return signatures are valid function shapes and may appear in a function
pointer type:

<!-- wyst-contract: sketch -->
```wyst
callback : @() -> (x: u8, y: u64) = #addr_of(foo)
```

See §2.6 for the full rules on function pointer types — in particular, that
the bare shape `() -> (x: u8, y: u64)` is only legal as a function
declaration's signature, and a storage variable must use `@(...)`.

### Tuple Parameter Boundary

Tuple types are currently a multi-return value surface. They may appear as
function return types, in function-pointer return shapes, in result storage,
and in tuple destructuring. They are not parameter types in the current
compiler contract. Pass the fields as separate parameters or wrap them in a
named `struct`.

<!-- wyst-contract: future -->
```wyst
consume_pair :: (pair : (x: u64, y: u64)) { }
```

### Design Rationale

| Choice                     | Reason                                                            |
| -------------------------- | ----------------------------------------------------------------- |
| named fields in return     | caller can destructure by name, not just position                 |
| `return (a, b)` expression | consistent with array literal `{}` vs tuple `()` distinction      |
| direct register mapping    | no hidden struct allocation; values returned in registers         |
| `()` for tuples            | distinguishes from `{}` (array literals) and `[]` (memory access) |

### Tradeoffs

- **Register limit** — more than 4 return values requires stack allocation or a hidden struct. The exact limit depends on type widths (e.g., two f64s use both float return slots).
- **Name requirement** — field names in the return type are mandatory; anonymous tuples like `-> (u8, u64)` are outside the model. Names improve call-site clarity.
- **No nesting** — nested tuples like `-> (x: u8, y: (a: u64, b: u64))` are outside the model. Flatten to a single tuple level.

---

## 2.3 Register Pinning

Register pinning constrains the assembler to place a specific variable or
parameter in a named ARM64 register. It is an explicit override of normal
register allocation.

`#pin` is allowed on:

- **local variables** — mutable storage inside function bodies
- **function parameters** — in the parameter list

`#pin` is not allowed on globals, top-level constants, or local constants. A
pinned global would silently reserve that register for the entire program,
conflicting with any calling convention and hiding a program-wide side effect
from callers. A local constant has no storage slot to pin. If a platform
requires a globally reserved register (e.g. a dedicated thread-pointer), that
belongs in the ABI definition, not in a variable declaration.

---

### Canonical Forms

There are exactly two syntactic forms for `#pin`:

<!-- wyst-contract: sketch -->
```wyst
name : type #pin(reg)              // declare-without-init
name : type #pin(reg) = value      // declare-with-init
```

The pin appears between the type and any initializer, and it is part of the
declaration. There is no post-hoc form — `name #pin(reg)` as a standalone
statement that re-pins an existing binding is **rejected by the grammar**.
A binding is pinned at the point it is declared, for its entire lifetime,
or it is not pinned at all.

<!-- wyst-contract: sketch -->
```wyst
expected : u64 = 0
expected #pin(x0)        // compile error: post-hoc pin is not a legal form
```

The rationale: a single declaration-site form means the register a name
inhabits is determined entirely by the line that introduces the name. Liveness
windows for pins line up with binding scopes, which keeps the conflict rules
(below) decidable from declarations alone.

---

### Pinning Local Variables

<!-- wyst-contract: sketch -->
```wyst
setup :: () {
  counter : u64 #pin(x19) = 0

  repeat 100 {
    counter += 1
  }
}
```

The assembler must place `counter` in `x19` for the lifetime of the binding.
If `x19` is unavailable at the pin site, the compiler emits a compile error —
it will not silently move the pin.

---

### Pinning Function Parameters

Parameters are pinned at function entry. This is the primary use case for
`#pin`: receiving values placed in specific registers by firmware, hardware,
or a foreign calling convention.

<!-- wyst-contract: sketch -->
```wyst
#noreturn
_start :: (dtb : @u8 #pin(x0)) {
  // dtb is guaranteed to be in x0 at entry
  // as placed there by QEMU/firmware at reset
  kernel_init(dtb)
  loop {
    %wfe()
  }
}
```

Multiple parameters can be pinned independently:

<!-- wyst-contract: sketch -->
```wyst
el2_entry :: (arg0 : u64 #pin(x0), arg1 : u64 #pin(x1)) #noreturn {
    ...
}
```

Pinned parameters are not required to follow the normal Wyst ABI register
order. The pin overrides the ABI assignment for that parameter. The caller
is responsible for placing values in the declared registers before branching
to the function.

---

### Non-Escaping Address Parameters

`#noescape` marks an address parameter as a call-scoped borrow of storage the
callee must not retain or expose. It allows callers to pass `%addr_of(local)`
to helper functions without forcing the storage into a global:

<!-- wyst-contract: check-pass -->
```wyst
#module boot

fill :: (out : @u64 #noescape) {
  u64@[out] = 42
}

main :: () -> u64 {
  value : u64 = 0
  fill(%addr_of(value))
  return value
}
```

Inside the callee, `#noescape` is a syntactic rule over the parameter value. A
`#noescape` parameter may appear only as:

- the address operand of a direct memory access, including offset arithmetic in
  that address operand, vector loads/stores, endian loads/stores, atomic
  operations, prefetch, and cache-maintenance operations; or
- an argument to a direct call whose corresponding parameter is also marked
  `#noescape`.

The parameter may not undergo any categorized conversion, be copied into a local binding,
tuple, aggregate, or slice value, be assigned to another local, be returned, be
stored through memory as a value, be passed to an ordinary or indirect call, be
observed as a condition or ordinary arithmetic/comparison value, or be exposed to
`#asm` or directive operands. Violations are compile errors:

<!-- wyst-contract: check-fail -->
```wyst
#module boot

bad :: (ptr : @u64 #noescape) -> @u64 {
  return ptr
}
```

`#noescape` is a parameter contract, not a pointer type and not a provenance
model. Function pointer types do not carry it, so indirect calls remain
conservative and reject stack-local address arguments.

---

### Pinning Callee-Saved Registers (Prologue Ownership)

When a non-`#naked` function pins a local variable to a callee-saved register
(`x19`–`x28`, `x29`), the function's prologue **always** saves that register,
and the epilogue **always** restores it. The save is unconditional: it does
not depend on liveness analysis, on whether the function makes calls, or on
how many paths through the body actually read the pin.

<!-- wyst-contract: sketch -->
```wyst
setup :: () {
  counter : u64 #pin(x19) = 0
  // prologue emits: stp x19, ..., [sp, #-N]!
  // epilogue emits: ldp x19, ..., [sp], #N
  counter += 1
}
```

The pin is treated as "this function uses x19" for the purpose of frame
construction. The rule is intentionally simple so that prologue shape can be
predicted by reading declarations only — without a liveness pass over the body.

A consequence: a `#pin(x19)` that is never read still costs the frame slot
and the save/restore pair. If the pin is not load-bearing, drop it; do not
rely on the optimizer to remove the save.

This rule does not apply inside `#naked` functions — see "Interaction with
`#naked`" below.

---

### Pinning Caller-Saved Registers and Call Boundaries

When a local variable is pinned to a caller-saved register (`x0`–`x17`),
the pin lasts for the binding's lifetime, and the caller-saved register is
clobbered across any `bl`/`blr`/`svc`/`hvc`/`smc`/`brk` call. If the pinned
binding is live across such a call, the program is rejected at compile time:

<!-- wyst-contract: sketch -->
```wyst
work :: (handler : @(u64) -> u64) {
  state : u64 #pin(x0) = 0xdead // pin to caller-saved x0
  result := handler(state) // x0 clobbered by call — state live across it
  // compile error: pinned variable `state` is live across a call that
  // clobbers its pinned register `x0`
  use(state, result)
}
```

The compiler **does not** silently spill the pinned variable around the call.
Doing so would violate the pin's "this name lives in this register" contract —
between the save and restore, no register holds the value.

To make the program compile, narrow the pin's lifetime so it ends before the
call, or pick a callee-saved register:

<!-- wyst-contract: sketch -->
```wyst
work :: (handler : @(u64) -> u64) {
    {
        state : u64 #pin(x0) = 0xdead
        // ... use state here ...
    }                                // pin lifetime ends
    result := handler(0)             // x0 free to be clobbered
    use(result)
}

// or

work :: (handler : @(u64) -> u64) {
    state : u64 #pin(x19) = 0xdead   // callee-saved; prologue saves x19
    result := handler(state)         // x19 preserved across call
    use(state, result)
}
```

Pinned parameters follow the same rule: a `#pin(x0)` parameter that is read
after a call is a compile error unless its value has been moved to a
callee-saved location first.

---

### Pinning Special-Purpose Registers

ARM64 has four registers with architectural roles:

| Register | Role                           | `#pin` semantics                           |
| -------- | ------------------------------ | ------------------------------------------ |
| `lr`     | link register (return address) | read-only alias, any function              |
| `x18`    | platform register (reserved)   | read-only alias, any function              |
| `sp`     | stack pointer                  | rejected by `#pin`; use `#asm(sets_sp)`    |
| `x29`    | frame pointer                  | rejected by `#pin`; inspect only in `#asm` |

A `#pin(special)` declaration is a **read-only alias** of the named register
at the declaration point. It introduces an immutable local binding initialized
to the current value of the architectural register, and it constrains the
compiler not to mutate that architectural register while the binding is live.

<!-- wyst-contract: sketch -->
```wyst
#[naked, noreturn]
exception_handler :: () {
  saved_lr : u64 #pin(lr) // snapshot of lr at entry

  // saved_lr is a normal u64 value; the compiler must not emit
  // any instruction that overwrites the architectural `lr` while
  // saved_lr is live.

  loop {
    %wfe()
  }
}
```

Read-only means assignment is rejected:

<!-- wyst-contract: sketch -->
```wyst
saved_lr : u64 #pin(lr) = 0          // compile error: special-register pins
                                     // cannot take an initializer; the
                                     // initializer is the register's value
saved_lr = 1                         // compile error: pinned alias is immutable
```

Earlier drafts allowed `#pin(sp)` and `#pin(x29)` inside `#naked`
functions. Wyst rejects both forms. Use `#asm(sets_sp)` to initialize
`sp`; use explicit `#asm` if a raw entry stub must inspect `sp` or `x29`.

---

### Interaction with `#naked`

`#naked` suppresses the standard prologue and epilogue. That changes which
forms of `#pin` are legal inside the function:

| `#pin` form                             | In `#naked`?      | Reason                                                                                  |
| --------------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| Parameter pin (`(x : T #pin(x0))`)      | **allowed**       | Names the entry-state contract; no prologue work required.                              |
| Local pin to callee-saved (`#pin(x19)`) | **compile error** | There is no prologue to save the register. Use `#asm` to perform an explicit save.      |
| Local pin to caller-saved (`#pin(x0)`)  | **allowed**       | Same call-boundary rule as non-`#naked`: live across a clobbering call is a hard error. |
| Special-register pin (`#pin(lr/x18)`)   | **allowed**       | Read-only alias; no prologue required.                                                  |
| Special-register pin (`#pin(sp/x29)`)   | **compile error** | Use `#asm(sets_sp)` for `sp`; raw inspection belongs in explicit `#asm`.                |

The reason callee-saved local pins are illegal in `#naked` and not just
"unsupported" here is a semantic boundary: silently emitting a prologue inside a `#naked` function would
defeat `#naked`'s purpose, and silently _not_ emitting one would corrupt the
caller's state. There is no useful middle ground.

If a `#naked` function legitimately needs to use a callee-saved register, the
function body must contain an `#asm` block that saves and restores it
explicitly:

<!-- wyst-contract: sketch -->
```wyst
#[naked, noreturn]
exception_save :: () {
  #asm {
    clobbers {
      memory
    }
    body {
      stp x19, x20, [sp, #-16]!
      // ...
      ldp x19, x20, [sp], #16
    }
  }
}
```

---

### Conflict Rules

The assembler enforces pinning strictly:

| Situation                                                         | Result            |
| ----------------------------------------------------------------- | ----------------- |
| Register is free at pin site                                      | pin applied       |
| Register is live and another pin already holds it                 | **compile error** |
| Two pins in scope request the same register                       | **compile error** |
| Pin on a global or constant                                       | **compile error** |
| Post-hoc `name #pin(reg)` statement                               | **compile error** |
| Caller-saved pin live across a `bl`/`blr`/`svc`/`hvc`/`smc`/`brk` | **compile error** |
| Callee-saved local pin inside `#naked`                            | **compile error** |
| `#pin(sp)` or `#pin(x29)`                                         | **compile error** |
| Initializer on a special-register pin (`#pin(lr) = 0`)            | **compile error** |
| Assignment to a special-register pin (`saved_lr = ...`)           | **compile error** |

The compiler never silently moves a pin to a different register, silently
spills a pinned binding around a call, or silently inserts a prologue into a
`#naked` function. If a pin cannot be satisfied, it is always a compile error.

---

### Relationship to `#asm`

A pinned variable referenced as an `#asm` operand resolves to its pinned
register. The allocator guarantees the variable is live in that register
at both entry and exit of the block:

<!-- wyst-contract: sketch -->
```wyst
val : u64 #pin(x19) = 0

#asm {
    inputs {
        v = gpr(val)          // {v} resolves to x19
    }
    outputs {
        v_out = gpr(val)      // {v_out} also resolves to x19
    }
    body { add {v_out}, {v}, #1 }
}

// val is now 1
```

For the common in-out case (read the value, modify it, write it back),
use the `inout_gpr` constraint:

<!-- wyst-contract: sketch -->
```wyst
val : u64 #pin(x19) = 0

#asm {
    outputs {
        v = inout_gpr(val)
    }
    body { add {v}, {v}, #1 }
}
```

If two operands resolve to conflicting registers, or a clobber names a
register already bound to an operand, the block is rejected at compile
time.

---

### Design Rationale

| Choice                                        | Reason                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `#pin` on declaration only                    | Keeps register assignment visible at the binding site; one form means the register a name inhabits is determined by one line.    |
| No post-hoc re-pin                            | A second form would make liveness windows depend on statement order, not declaration order; harder to reason about and to parse. |
| Callee-saved pins: always save in prologue    | Prologue shape predictable from declarations alone, no liveness pass required. Cost of an unused pin is the cost of removing it. |
| Caller-saved live-across-call is a hard error | The alternative — silent spill — violates the "this name lives in this register" contract.                                       |
| Special-register pins are read-only aliases   | Captures the common exception-handler pattern (snapshot `lr` at entry) without giving up control of architectural state.         |
| `#pin(sp)`/`#pin(x29)` rejected               | `sp` initialization is verified through `#asm(sets_sp)`; raw frame-pointer inspection belongs in explicit `#asm`.                |
| Callee-saved local pins illegal in `#naked`   | Silently adding a prologue would defeat `#naked`. Use `#asm` for explicit save/restore.                                          |
| Locals and parameters only (not globals)      | Globals would silently reserve registers program-wide; that's an ABI-level concern, not a declaration-level one.                 |
| `#` prefix directive                          | Consistent with `#noreturn`, `pub`, `#schedule`, `#asm`.                                                                     |

---

## 2.4 Labels

Labels are bare code regions, declared at **module top level** with the
`label` type. They are not nested inside functions.

<!-- wyst-contract: sketch -->
```wyst
name :: label {
  body
} // bare code region

name :: label #noreturn {
  body
} // never returns

name :: label #naked #noreturn {
  body
} // raw entry label
```

A label:

- has no parameters and no return value
- when marked `#naked`, has no generated prologue, epilogue, or stack frame
- has no `return` (there is no caller to return to)
- must terminate with a `goto` or a `#noreturn` call — no fall-through
- is a top-level declaration with the same visibility rules as a function

`#naked` labels exist for architectural entry points such as exception-vector
targets. They use the same raw stack discipline as `#naked` functions: any
save area, stack switch, register preservation, and eventual `eret`/halt path
must be visible in source, normally through explicit `#asm`.

### Visibility and Cross-Module References

Labels follow the same `pub` / `#import` machinery as functions. A label
declared without `pub` is module-private; with `pub`, it is visible
to other modules that `#import` the module.

<!-- wyst-contract: sketch -->
```wyst
#module boot.handlers

pub handle_sync :: label {
  // ...
  goto resume
}

resume :: label {
  // module-private
  // ...
}
```

<!-- wyst-contract: sketch -->
```wyst
#module boot.vectors

#import boot.handlers // brings `handle_sync` into scope

el1_vectors :: #exception_vector {
  current_el_spx_sync : #ventry {
    goto handle_sync
  } // cross-module goto — OK
  // ...
}
```

The integrated linker resolves the cross-module reference exactly as it
does for function calls (`R_AARCH64_JUMP26` for `goto`, see
[chapter-16-object-format.md](chapter-16-object-format.md)).
In the final ELF symbol table, source labels are executable text symbols but
not function symbols: they use `STT_NOTYPE` so external tools do not confuse
`goto` targets with callable functions that have ordinary prologue/epilogue
semantics.

### Why Labels Are Top-Level

Labels are not in-function constructs because the only legal way to enter
them is `goto`, and `goto` is bare-context only (see §2.5). There is no
in-function position where a label could be entered, so there is no
in-function position where one can be declared.

This also closes off the C-style `goto label;` foot-gun by construction:
the syntax does not exist.

---

## 2.5 Control Flow

### goto and function calls

<!-- wyst-contract: sketch -->
```wyst
goto label_name     // transfer to label, no return
fn_name(args)       // invoke function — statement position
fn_ptr(args)        // invoke function pointer — statement position
```

`goto` is a statement keyword. Function calls use the same postfix call
syntax in statement position and expression position. The old exploratory
`call f(args)` statement form is not part of Wyst.

#### Statement-Position Calls

A call expression may appear as a standalone statement:

<!-- wyst-contract: sketch -->
```wyst
init_uart()
clear_screen()
handler_table[i]()    // computed function-pointer call
```

If the callee returns a value, a statement-position call evaluates the call
and discards the result. An expression statement whose top-level expression
is not a call remains a compile error, so stray statements like `x + y` do
not silently do nothing.

#### Expression-Position Calls

The same syntax is used when the return value is consumed by an enclosing
expression:

<!-- wyst-contract: sketch -->
```wyst
x := sum(arr[:])
total   = a + sum(arr[:]) + b
result  = callback(7)              // function-pointer call
process(transform(input))
```

#### Summary Table

| Position                                     | Form          | Rule                                      |
| -------------------------------------------- | ------------- | ----------------------------------------- |
| standalone statement, return value discarded | `f(args)`     | top-level expression must be a call       |
| right-hand side of assignment                | `x = f(args)` | ordinary expression type-checking applies |
| operand of an operator                       | `a + f(args)` | ordinary expression type-checking applies |
| argument to another call                     | `g(f(args))`  | ordinary expression type-checking applies |

The `call` word is not a keyword. `call f(args)` is invalid syntax
because it is two adjacent expressions, not a call form.

#### `goto` Scope Rules

`goto` is a **bare-context tail transfer**. It is legal only when the
current execution context has no live frame to abandon — i.e. when no
prologue has been emitted and no caller is waiting for a return value. In
practice that means `goto` is legal only inside:

- a `label` body (§2.4)
- a `#ventry` slot (§10.2)
- a position in any other bare construct introduced later (e.g. a future
  trampoline directive)

`goto` in an ordinary function body is a **compile error**, even if the
function has no live locals. The diagnostic suggests `return` (to exit) or
extracting the work into a `label`.

#### What `goto` Cannot Cross

| From                                                                             | To                                              | Result                                                                          |
| -------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `label` / `#ventry`                                                              | another `label`                                 | OK (same module)                                                                |
| `label` / `#ventry`                                                              | public label in another `#import`ed module | OK                                                                              |
| `label` / `#ventry`                                                              | function name                                   | **compile error** — `goto` cannot enter a prologue; use a function call instead |
| function body                                                                    | any label                                       | **compile error** — `goto` cannot abandon a live frame                          |
| inside a structured construct (`if`, `while`, `loop`, `repeat`) within a `label` | label outside the construct                     | OK — the construct emits no frame; the `goto` is still a tail transfer          |
| any position with a pending function-call return                                 | any label                                       | **compile error** — would skip the return                                       |

The last row is the formal statement of "never inward past a function-call
boundary" from earlier drafts: if control flow has reached a point where a
called function is expected to return, that return cannot be skipped by a
`goto`.

#### What `goto` Targets

The target is a bare identifier naming a `label` (or `#ventry` slot's
enclosing `label`). The label must be in scope — either declared in the
current module or imported via `#import`. There is no label literal, no
computed `goto`, no `goto *expr`. Dispatch tables are built from function
pointers (see §2.6), not label addresses.

#### `break` and `continue`

`break` and `continue` are structural control-flow statements inside
`loop`, `while`, and `repeat`. They are statement-position keywords with
no operands and produce no value.

<!-- wyst-contract: sketch -->
```wyst
break          // exit the innermost enclosing loop
continue       // jump to the header of the innermost enclosing loop
```

**Scope rule:** the innermost lexically enclosing loop receives the
transfer. A `break` or `continue` outside any loop is a compile error.

**No cross-function transfer:** `break` and `continue` cannot reach a
loop in an enclosing function. A function body that contains only an
inner loop cannot be exited via `break` (use `return`).

**No `#asm` interaction:** `break` and `continue` are not legal inside an
`#asm` block body. To leave an `#asm` block early, write the branch in
assembly within the body.

**No labels.** Wyst does not provide labeled `break`/`continue`. To exit a
nested loop:

- Pull the inner loop into a helper function and `return` from it, or
- Set a flag in the inner loop and check it in the outer-loop header.

This is a deliberate choice. Labels in Wyst are top-level declarations
(see §2.4); `break label` would either reuse that namespace (creating a
hazard where a `break` could jump to a non-loop label) or introduce a
new function-local identifier scope the language does not have.

**`continue` in `repeat`:** the implicit iteration counter advances
before the next iteration runs, exactly as if the loop body had reached
its closing brace.

<!-- wyst-contract: sketch -->
```wyst
// Skip rows where the first byte is zero:
// `base` is @u8, and `row_size` is measured in bytes.
repeat 100, i {
    if u8@[base + i * row_size] == 0 { continue }
    process_row(i)
}
```

**`loop` is not an expression** — `loop { ... }` produces no value, so
`break value` and `loop`-as-rvalue are not part of the language. Use a
mutable variable assigned before `break`:

<!-- wyst-contract: sketch -->
```wyst
result : u64 = 0
loop {
    if condition_met {
        result = computed_value
        break
    }
}
return result
```

#### ARM64 Lowering

`break` lowers to an unconditional branch to the instruction immediately
following the innermost loop's last instruction. `continue` lowers to an
unconditional branch to the loop header (the test instruction for
`while`, the counter-increment-and-test for `repeat`, the unconditional
back-edge for `loop`).

The compiler emits these as `b` instructions — no special handling and
no register state is preserved or restored at the branch point (a `break`
out of the middle of a basic block leaves all locals in whatever state
they were in; this is the same as falling through to the loop's end).

### If

<!-- wyst-contract: sketch -->
```wyst
if count == 0 {
    return
}
```

### If Expressions

<!-- wyst-contract: sketch -->
```wyst
value = if cond {
    10
} else {
    20
}
```

### Repeat

<!-- wyst-contract: sketch -->
```wyst
repeat count, i {
    total += u64@[data + i]
}
```

### While

<!-- wyst-contract: sketch -->
```wyst
// UARTFR is declared `@volatile u32` elsewhere
while u32@[UARTFR] & TXFF != 0 {
    %nop()
}
```

### Infinite Loop

<!-- wyst-contract: sketch -->
```wyst
loop {
    %wfe()
}
```

### Switch — Exhaustive Enum Discrimination

`switch` is the exhaustive form for reading enum values (§1.6.2). Each
arm is a `case` matching a single variant, optionally binding payload
elements. Exhaustiveness is checked at compile time: an unhandled variant
is an error unless an `else:` arm is present or the switch is annotated
`#partial`.

<!-- wyst-contract: sketch -->
```wyst
switch m {
    case Quit:             handle_quit()
    case Write(p):         handle_write(p)
    case Custom(code):     handle_custom(code)
    case Uart(v), Virtio(v): handle_irq(v)
}
```

| Form                  | Meaning                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `case Variant:`       | Match the variant, ignore payload (legal for any variant).        |
| `case Variant(a):`    | Match a single-payload variant, bind payload to `a` for this arm. |
| `case A(a), B(a):`    | Match either variant and bind the same-name, same-type payload.   |
| `case Variant(a, b):` | Tuple payload binding; outside the enum payload model.            |
| `case Variant(_):`    | Match the variant, explicitly discard payload.                    |
| `else:`               | Catch-all arm. Must come last. Disables the exhaustiveness check. |

A `case` arm body is a statement context. Function calls in arm bodies
follow the statement-position call rule from §2.5 above.

#### `#partial switch`

Annotated to opt out of the exhaustiveness check entirely:

<!-- wyst-contract: sketch -->
```wyst
#partial switch m {
    case Write(p):         handle_write(p)
    // Quit and Custom are silently skipped — no compile error
}
```

Use `#partial` when only a subset of variants is relevant at this site
and reaching an unhandled variant should silently do nothing. Without
`#partial`, the same code is a compile error.

#### Exhaustive switch on plain enums

The same rules apply to payload-less enums:

<!-- wyst-contract: sketch -->
```wyst
switch d {
    case North:   ...
    case East:    ...
    case South:   ...
    case West:    ...
}
```

Missing any variant is a compile error; `else:` or `#partial` opts out.

#### Pattern Binding Scope

Pattern-bound names are local to the arm's body and immutable within it.
Assignment to a binding is a compile error:

<!-- wyst-contract: sketch -->
```wyst
switch m {
    case Custom(code):
        code = 5         // compile error: pattern bindings are immutable
}
```

To produce a mutable local, rebind:

<!-- wyst-contract: sketch -->
```wyst
switch m {
    case Custom(code):
        mx := code       // mx is a new mutable local
        mx += 5
        process(mx)
}
```

#### Patterns Are Not Nested

`case Variant(a, b)` is outside the enum payload model and cannot
itself contain a sub-pattern. To
destructure a payload that is itself an enum, nest a `switch` or `is` in
the body:

<!-- wyst-contract: sketch -->
```wyst
switch outer {
    case Wrap(inner):
        switch inner {
            case Foo(p):   ...
            case Bar(q):   ...
        }
}
```

#### `switch` Is a Statement, Not an Expression

`switch` produces no value. To compute a value across variants, use a
mutable local:

<!-- wyst-contract: sketch -->
```wyst
n : u64 = 0
switch m {
    case Quit:             n = 0
    case Custom(code):     n = code
    case Write(_):         n = 1
}
return n
```

### `is` — Single-Variant Test and Bind

`is` tests one enum value against one variant pattern (the same shape as a
single-variant `case` pattern). When `is` appears as the direct condition of
an `if`, the pattern bindings are in scope within the `if`-true body and
immutable.

<!-- wyst-contract: sketch -->
```wyst
if m is Custom(code) {
    handle_custom(code)
}

if !(m is Quit) && (m is Write(_) || ready) {
    handle_active(m)
}
```

| Form                 | Meaning                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `m is Variant`       | True iff `m`'s tag is `Variant`. No bindings.                                                |
| `m is Variant(a)`    | True iff `m`'s tag is `Variant`; in the `if`-true body, `a` is bound to the payload element. |
| `m is Variant(a, b)` | Tuple payload binding; outside the enum payload model.                                       |
| `m is Variant(_)`    | True iff `m`'s tag is `Variant`; payload explicitly discarded.                               |

#### Binding Scope

Bindings introduced by `is` are valid **only** in the `if`-true block.
They are not visible in the `else` block, after the `if`, or in a
compound condition's other clauses:

<!-- wyst-contract: sketch -->
```wyst
if m is Custom(code) {
    use(code)            // ok — bindings valid here
} else {
    use(code)            // compile error — binding not in scope
}
use(code)                // compile error — binding not in scope
```

`is` may appear inside boolean compounds only when it introduces no payload
binding. Use `_` to explicitly discard a payload. A binding such as
`m is Custom(code) && ready` is rejected because the binding's scope would be
ambiguous. Use a direct `if m is Custom(code)` or a `switch` instead.

#### Negation

Negated `is` patterns are allowed only when they introduce no payload binding.
No bindings are introduced by a negated `is` because the payload bindings would
be undefined if the test is false.

<!-- wyst-contract: sketch -->
```wyst
if !(m is Quit) {
    // m is some other variant — but the specific variant is unknown here
    process_active(m)
}

if !(m is Custom(code)) {    // compile error
    process_active(m)
}
```

#### `is` vs `switch`

`is` is for "check one variant, do one thing." `switch` is for "dispatch
on all variants." When more than one variant needs handling, prefer
`switch` — it gets exhaustiveness checking; chained `if … is` does not.

<!-- wyst-contract: sketch -->
```wyst
// Bad — no exhaustiveness check, easy to forget a variant:
if      m is Quit          { handle_quit() }
else if m is Custom(code)  { handle_custom(code) }
else if m is Write(p)      { handle_write(p) }
// Fault was added to the enum later — silently does nothing

// Good — compile error if a variant is added:
switch m {
    case Quit:           handle_quit()
    case Custom(code):   handle_custom(code)
    case Write(p):       handle_write(p)
}
```

---

## 2.6 Function Pointers

A **function shape** is the syntactic form `(args) -> ret` (or its multi-return
variant). Function shapes describe the parameter and return types of a
function. A function shape by itself is not a value type and not a storable
type.

A **function pointer** is an address of a function with a given shape. The type
is written `@(args) -> ret`, applying the `@T` rule to a function shape exactly
the way it applies to data:

<!-- wyst-contract: sketch -->
```wyst
handler :: (x : u64) -> u64 { return x + 1 }

callback : @(u64) -> u64 = #addr_of(handler)    // pointer to function
result   := callback(7)                         // call through the pointer
```

### Where Each Form Is Legal

| Form             | Where legal                                                             |
| ---------------- | ----------------------------------------------------------------------- |
| `(args) -> ret`  | Signature of a function declaration (`name :: (args) -> ret { ... }`) |
| `@(args) -> ret` | Variable type, parameter type, return type, struct field, array element |

A declaration like `cb : (u64) -> u64 = ...` is a **compile error** — bare
function shapes cannot appear in a value context. The diagnostic suggests
the `@(...)` form:

<!-- wyst-contract: sketch -->
```wyst
cb : (u64) -> u64 = #addr_of(handler)
// compile error: bare function shape `(u64) -> u64` is not a value type;
// did you mean `@(u64) -> u64`?
```

The reason: a function's "value" would be the bytes of its compiled code,
which Wyst does not allow programs to read, copy, or store. What a program
actually holds is the function's address. Distinguishing the two in the type
system means the source always reflects what's in memory.

### Address-Taking

`#addr_of(name)` produces a value of type `@(args) -> ret` when `name` is a
function declaration. There is no implicit "function-name decays to pointer"
rule — assigning a bare function name without `#addr_of` is rejected:

<!-- wyst-contract: sketch -->
```wyst
cb : @(u64) -> u64 = handler // compile error: implicit address-of
// a function is not allowed; write
// `#addr_of(handler)`
cb : @(u64) -> u64 = #addr_of(handler)
```

This mirrors data: you cannot write `p : @u64 = my_u64_var` either.

A function whose parameters use `#pin(reg)` is a **special entry point**, not
an ordinary function-pointer target. Direct calls can inspect the callee
declaration and marshal arguments into the pinned registers, but an ordinary
function pointer type records only the calling convention and value shape. It
does not encode a pin map. Therefore `#addr_of(name)` is rejected for any
function declaration with a pinned parameter unless a future surface adds an
explicit pin-map function type or the program provides an ordinary-ABI wrapper
that performs the re-marshalling.

This restriction applies anywhere the address would be stored or passed:
callbacks, dispatch-table fields, arrays of function pointers, returned
function pointers, and imported ABI table entries all use ordinary function
pointer types unless another convention is explicitly named. Large or
indirect-result return shapes do not loosen the rule; the argument pin map
still has to be known before an indirect call can be marshalled safely. Wyst
has no return-value `#pin` syntax; result placement is owned by the selected
calling convention.

<!-- wyst-contract: check-fail -->
```wyst
#module boot

pinned_entry :: (arg : u64 #pin(x7)) -> u64 {
  return arg
}

bad :: () -> u64 {
  cb : @(u64) -> u64 = #addr_of(pinned_entry)
  return cb(1)
}
```

### Conversions

A function pointer converts to `u64` (the bare address bits) via `as.address`.
Constructing a function pointer from a raw integer address requires the
explicit `#trusted_cast` form:

<!-- wyst-contract: sketch -->
```wyst
fp   : @(u64) -> u64 = #addr_of(handler)
addr := fp as.address u64                        // extract address

// Construct a function pointer from a raw address (e.g. loaded from a
// dynamic dispatch table). The programmer asserts the convention.
addr2 := load_dispatch_slot()
cb2   := #trusted_cast<@(u64) -> u64>(addr2)
```

There is no implicit conversion in either direction, raw
`u64 as.address @(...) -> ...` conversions are rejected, and there is no
conversion between function pointer types of different shapes or different
calling conventions. Two function pointer types are the same type only if
their shapes and (per §2.7 / chapter-15-abi-spec.md B) their calling-convention
annotations match exactly.

### Operators

Function pointers are code addresses, not data address lenses. The supported
operations are:

- indirect call: `callback(7)`
- equality and inequality with the same exact function pointer type:
  `left == right`, `left != right`
- equality and inequality with the untyped integer constant `0`:
  `callback == 0`, `0 != callback`
- explicit extraction to `u64`: `callback as.address u64`
- trusted construction from `u64`: `#trusted_cast<@(u64) -> u64>(raw)`

Function pointers do not support address arithmetic (`callback + 4`),
ordered comparisons (`callback < other`), nonzero integer comparisons
(`callback == 1`), or `type[address]` memory access. Use an explicit
`as.address u64` conversion first if numeric address inspection is truly
intended.

<!-- wyst-contract: check-pass -->
```wyst
#module boot

handler :: (x : u64) -> u64 {
  return x
}

has_callback :: (callback : @(u64) -> u64) -> bool {
  return callback != 0
}

main :: () -> bool {
  callback : @(u64) -> u64 = #addr_of(handler)
  return 0 != callback
}
```

<!-- wyst-contract: check-fail -->
```wyst
#module boot

bad_compare :: (callback : @(u64) -> u64) -> bool {
  return callback == 1
}
```

### Calling Convention in the Type

A function declared with `[aapcs]` has a pointer type written
`@[aapcs] (args) -> ret`. The annotation is part of the type and not
implicitly compatible with the native form:

<!-- wyst-contract: sketch -->
```wyst
[aapcs]
puts :: (s : @u8) -> i32

p_native : @(@u8) -> i32 = #addr_of(puts) // compile error: shape OK
// but convention differs
p_aapcs : @[aapcs] (@u8) -> i32 = #addr_of(puts) // OK
```

Calls through a pointer always use the convention encoded in the pointer
type. The compiler picks `bl` vs `blr` and the argument-marshaling sequence
from the pointer's type alone — there is no per-call-site convention
override. See [chapter-15-abi-spec.md B.5](chapter-15-abi-spec.md) for the cross-language rules.

### Interaction with `#deny`

Indirect calls do not bypass effect checking. A call through a function
pointer contributes the conservative effect upper bound of the pointer value
to the caller's inferred effect set:

- `#addr_of(f)` contributes the inferred effects of `f`.
- Merges through assignments, branches, phis, arrays, fields, returns, and
  parameters union the candidate effect bounds.
- A raw integer-to-function-pointer cast, imported ABI table entry, external
  declaration without an inspectable body, or otherwise unknown function
  pointer is treated as all effect categories for `#deny` checking.

When an indirect call violates `#deny`, the diagnostic points at the call and
lists the known candidate target or explains that the target is unknown.

---

## 2.7 Function Attributes

| Directive            | Applies to         | Meaning                                                                                                                                        |
| -------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pub`            | functions          | externally visible symbol                                                                                                                      |
| `#noreturn`          | functions, labels  | never returns to caller                                                                                                                        |
| `#naked`             | functions, labels  | suppress generated prologue and epilogue                                                                                                       |
| `#inline`            | functions          | always-inline (compile error if impossible)                                                                                                    |
| `#initcall(order)`   | functions          | emit deterministic kernel initcall metadata                                                                                                    |
| `#pin(reg)`          | parameters, locals | constrain variable to named register                                                                                                           |
| `#noescape`          | address parameters | permit stack-local address arguments without allowing escape                                                                                   |
| `#deny(effect, ...)` | functions, modules | restrict which architectural effects may appear in the graph(see [chapter-01-language-design.md](chapter-01-language-design.md) Effect System) |
| `#frame(...)`        | functions, labels  | constrain post-lowering frame bytes and spill slots(see [chapter-01-language-design.md](chapter-01-language-design.md) Generated Resources)    |

---

## 2.7.1 `#inline` — Always-Inline Semantics

`#inline` is an **always-inline** directive, not a hint. The compiler must
inline every call to the function. If inlining is impossible, compilation
fails with a diagnostic at the function definition.

This is consistent with Wyst's design principle: the programmer declares
intent, and the compiler either satisfies it or rejects the program. There
is no silently degraded behavior.

### Syntax

<!-- wyst-contract: sketch -->
```wyst
#inline
helper :: (x : u64) -> u64 {
  return x + 1
}
```

Function-level directives appear as prefix lines on the function declaration.
When a declaration has two or more annotations, the canonical formatter spelling
is a single grouped line. This keeps directives out of the parameter and
return-type shape:

<!-- wyst-contract: sketch -->
```wyst
#[naked, noreturn]
_start :: () {
  loop {
    %wfe()
  }
}
```

Names inside an annotation group are bare because the `#[` marker carries the
`#` once for the whole group. A single annotation remains bare, for example
`#cold`, and parameter annotations such as `#pin(x0)` stay inline on the
parameter.

### When Inlining Is Mandatory

Every call site to an `#inline` function must be replaced with the function
body. The call disappears from the output — no branch, no `blr`, no prologue
or epilogue for the callee. The callee's parameters are bound to the caller's
arguments directly.

### Definition-Time Semantic Checks

An `#inline` function body is semantically checked at the function definition,
independent of call sites. `#static_assert` directives inside the body are
therefore evaluated even when the `#inline` function is unreachable or has no
calls. Statement-level `#if` expansion still happens first, so only the selected
branch contributes `#static_assert` directives to that definition-time check.

### Raw-Context Inline Call Sites

Calls to `#inline` helpers from raw contexts such as `#naked` functions,
labels, and `#ventry` slots get an additional stackless proof. These call sites
cannot rely on ordinary compiler-owned stack slots, so the helper must be void
and limited to stackless statements: intrinsic expression statements, nested
stackless inline helper calls, `#static_assert`, simple `if` control flow, and a
final loop whose body is recursively stackless.

<!-- wyst-contract: sketch -->
```wyst
#[inline, noreturn]
idle :: () {
  loop {
    %wfe()
  }
}

#[naked, noreturn]
_start :: () {
  idle()
}
```

The final loop rule exists so reusable idle tails can be factored without
weakening `#naked`'s no-implicit-stack boundary.

### When Inlining Is Impossible (Compile Errors)

The compiler emits a hard error at the `#inline` function definition if any
of the following conditions make inlining impossible:

| Condition                | Reason                                                   | Error location      |
| ------------------------ | -------------------------------------------------------- | ------------------- |
| direct recursion         | infinite expansion                                       | function definition |
| indirect recursion       | call cycle through other functions                       | function definition |
| `#asm` in body           | inline assembly cannot be safely duplicated              | function definition |
| `#addr_of(self)`         | function takes its own address                           | function definition |
| function pointer capture | address stored in variable or passed to another function | function definition |
| `#ventry` slot overflow  | inlined body exceeds 128-byte slot budget                | function definition |
| `#naked`                 | naked functions have no frame to inline into             | function definition |

#### Recursion

Directly recursive `#inline` functions are rejected:

<!-- wyst-contract: sketch -->
```wyst
#inline
fact :: (n : u64) -> u64 {
  if n <= 1 {
    return 1
  }
  return n * fact(n - 1) // ERROR: recursive #inline function
}
```

Indirect recursion is also rejected:

<!-- wyst-contract: sketch -->
```wyst
#inline
a :: (n : u64) {
  if n > 0 {
    b(n - 1) // ERROR: indirect recursion through b → a
  }
}

#inline
b :: (n : u64) {
  if n > 0 {
    a(n - 1)
  }
}
```

#### `#asm` Bodies

Functions containing `#asm` blocks cannot be inlined because inline assembly
may have side effects, register constraints, or clobber lists that are not
safe to duplicate at arbitrary call sites:

<!-- wyst-contract: sketch -->
```wyst
#inline
read_ctr :: () -> u64 {
    val : u64
    #asm {                                        // ERROR: #asm in #inline function
        outputs {
            r = gpr(val)
        }
        body { mrs {r}, CNTVCT_EL0 }
    }
    return val
}
```

#### `#ventry` Slot Overflow

This is the most important interaction. A `#ventry` slot has a hard 128-byte
budget. Whether an `#inline` function will fit depends on **register
pressure at the call site** — a body that fits with three callee-saved
registers free might require spills, and therefore overflow the slot, when
fewer are available. The compiler resolves this with a **two-check hybrid**.

##### Check 1 — Definition-time budget check (worst-case pressure)

Every `#inline` function that is reachable (directly or transitively) from
any `#ventry` slot is analyzed at its definition site under a fixed
worst-case register-pressure model:

| Assumption                                   | Rationale                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `x0`–`x17` are occupied by the caller        | A `#ventry` handler that has done any work before the `#inline` call has typically clobbered the AAPCS caller-saved set. |
| `x19`–`x28` are free                         | The handler may save and use callee-saved registers; we don't assume the whole pool is gone.                             |
| `x18`, `lr`, `sp`, `x29`, `xzr` are reserved | Same as the regalloc free-pool rules ([appendix-a-ir.md §11.2](appendix-a-ir.md)).                                       |

The compiler computes the inlined body's emitted size under this model
(including any spills the regalloc pass would insert) and compares it to
the 128-byte slot budget. If the body **cannot fit even in the most
optimistic call site** (a slot whose only content is this one call), the
error fires at the `#inline` function definition:

<!-- wyst-contract: sketch -->
```wyst
#inline
large_helper :: () {
  // ... worst-case lowering: 160 bytes after spills ...
}

el1_vectors :: #exception_vector {
  current_el_sp0_sync : #ventry {
    large_helper()
  }
}
```

```text
error: #inline function 'large_helper' cannot fit in any #ventry slot
       worst-case emitted size: 160 bytes (exceeds 128-byte slot budget)
       worst-case assumes x0–x17 occupied, x19–x28 free
  note: reachable from #ventry at current_el_sp0_sync (line 17)
```

The programmer fixes this by shrinking `large_helper` (the function is
literally too large for any vector slot), not by editing call sites.

If `large_helper` were never reachable from a `#ventry` slot, this check
**does not fire** — `#inline` functions used only in ordinary code have no
size cap.

##### Check 2 — Call-site budget check (actual pressure)

Even if `large_helper` passes the definition-time check, each individual
call site in a `#ventry` body is re-checked against the actual register
pressure at that call point. The compiler:

1. Computes the live-register set at the site(from the IR's liveness
   analysis).
2. Inlines the body and runs the regalloc pass with that set excluded from
   the free pool.
3. Sums the emitted bytes (the helper plus the rest of the `#ventry` slot
   body).

If the total exceeds 128 bytes, the error fires **at the `#ventry` slot**,
with a note pointing back to the `#inline` function:

<!-- wyst-contract: sketch -->
```wyst
#inline
medium_helper :: () {
  // worst-case 100 bytes; under low pressure 80 bytes
}

el1_vectors :: #exception_vector {
  current_el_sp0_sync : #ventry {
    // ... 50 bytes of preceding work ...
    medium_helper() // 80 bytes here; total 130 > 128
    goto handler
  }
}
```

```text
error: #ventry slot 'current_el_sp0_sync' exceeds 128-byte budget
       slot size after inlining: 130 bytes
       call to #inline 'medium_helper' contributed 80 bytes here
  note: #inline 'medium_helper' passes the worst-case definition check
        (100-byte ceiling); the overflow is specific to this slot's
        accumulated pressure. See definition at line 23.
```

The programmer fixes this by restructuring the site(moving work
out, or shrinking the preceding code), not by editing the `#inline`
function.

##### The two checks together

| Failure mode                                          | Where the error fires       |
| ----------------------------------------------------- | --------------------------- |
| Function literally too large to fit any slot          | At the `#inline` definition |
| Function fits in a low-pressure slot but not this one | At the `#ventry` slot       |
| Function passes both checks                           | Compiles                    |

This gives the programmer the right error in each case. A grossly
oversized helper gets the early definitional rejection ("this function can
never fit any slot — shrink it"). A helper that's marginal under load gets
the late call-site rejection ("this specific slot is too tight — adjust
the slot's other contents").

##### Inline-reaching-`#ventry` Restriction: No Calls Inside

An `#inline` function that is reachable from any `#ventry` slot must be
**call-free** in its body — no `name(...)`, no `tail`/`goto` to a
label that is itself a function, no indirect calls via `#addr_of`. The
restriction applies transitively: any `#inline` function the body invokes
must also be call-free.

<!-- wyst-contract: sketch -->
```wyst
#inline
helper :: () {
  other_function() // ERROR if `helper` is reachable from any #ventry slot
}
```

```text
error: #inline function 'helper' contains a call but is reachable from #ventry
       calls inside #inline functions reaching #ventry are forbidden
       (an inlined call would clobber caller-saved registers, forcing spills
        whose worst-case size cannot be bounded locally)
  note: reachable from #ventry at current_el_sp0_sync (line 17)
```

The rule keeps both checks above local and predictable. If you need a
call inside `#ventry`, place it directly in the `#ventry` body, not inside
an `#inline` helper. The `#ventry` body's own size analysis (Check 2)
accounts for the call's clobber set; the `#inline` body's analysis
(Check 1) does not.

#### Public `#inline` Functions

`pub` and `#inline` are compatible, but they control different surfaces.
`pub` makes the helper visible to importing Wyst modules. `#inline` keeps it
inline-only: every call must be expanded at the call site, no callable code
body is emitted, and the helper is not an ABI-exported symbol.

<!-- wyst-contract: sketch -->
```wyst
#module helpers

#inline
pub helper :: (x : u64) -> u64 {
  return x + 1
}

#module boot

#import helpers as h

main :: () -> u64 {
  return h.helper(41) // inlined here; no call to helper remains
}
```

If inlining is impossible at any importer call site, compilation fails
instead of falling back to a call. `#addr_of(helper)` remains illegal for
both private and public inline helpers because there is no function address
to capture.

#### Function Pointer Capture

If the address of an `#inline` function is taken (stored in a variable,
passed as a callback, etc.), inlining is impossible because there is no
code address to capture:

<!-- wyst-contract: sketch -->
```wyst
#inline
compare :: (a : u64, b : u64) -> i64 {
  return a as.signedness i64 - b as.signedness i64
}

sort :: (data : @u64, len : u64) {
  cmp : @(u64, u64) -> i64 = #addr_of(compare) // ERROR: address of #inline function taken
  // ...
}
```

### Design Rationale

| Choice                                       | Reason                                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| always-inline, not hint                      | consistent with Wyst's explicit philosophy                                                                                                      |
| hybrid budget check                          | definition-time check catches grossly-oversized helpers; call-site check catches pressure-specific overflow; each error lands where the fix is |
| worst-case `x0`–`x17` model                  | realistic for `#ventry` handlers (caller-saved usually gone before the call) without rejecting helpers that would work with callee-saved free  |
| no calls inside `#inline`-reaching-`#ventry` | keeps the worst-case analysis local; call clobbers cannot be bounded without inter-procedural analysis                                         |
| no recursion                                 | infinite expansion is unsound; use non-inline for recursive code                                                                               |
| no `#asm`                                    | inline assembly constraints are not duplicable                                                                                                 |
| no `pub`                                 | addressable symbol and no-address body are contradictory                                                                                       |
| `#ventry` budget checked early               | slot overflow is a compile error, not a silent hardware fault                                                                                  |

### Tradeoffs

- **No recursive helpers** — common patterns like tree traversal require
  non-inline functions. This is intentional: recursion needs a stack frame,
  and inlining eliminates the frame.
- **Code size** — aggressive inlining increases code size. The programmer
  controls this explicitly by choosing which functions get `#inline`.
- **No opt-out** — there is no `#inline` variant that silently falls back
  to a call. If you need that, don't use `#inline`.

---

## 2.7.2 Branch Hints and Cold Marking

### `#likely` / `#unlikely`

<!-- wyst-contract: sketch -->
```wyst
if #likely cond {
    hot_path()
} else {
    error_handler()
}

while #unlikely retry_flag {
    attempt_recovery()
}
```

`#likely` and `#unlikely` are branch hints that affect **basic block layout**
— specifically, which branch direction is the fall-through path. They do not
affect instruction scheduling within blocks.

**Semantics:**

- `#likely` makes the annotated condition's true-branch the fall-through
  (spatially adjacent) path. The false-branch is placed out-of-line.
- `#unlikely` makes the annotated condition's false-branch the fall-through
  path. The true-branch is placed out-of-line.
- Without a hint, the compiler uses source order (true-branch is
  fall-through by default).

**Determinism:** Same source + same compiler version + same target + same
`#schedule` mode = same block layout. The hints are ordering constraints on
layout, not optimization hints. They are deterministic across invocations.

**ARM64 note:** ARM64 has no branch prediction hint encoding. The effect
of `#likely`/`#unlikely` is entirely through spatial locality — the
fall-through path stays in the same cache line or adjacent lines, improving
i-cache utilization.

**Interaction with `#schedule`:** `#likely`/`#unlikely` control block
placement. `#schedule(throughput)` and `#schedule(latency)` control
instruction order _within_ blocks. The two are orthogonal and compose
without interaction. See [chapter-13-scheduling.md](chapter-13-scheduling.md) for the layout
constraint rule.

**Legal positions:** `#likely` and `#unlikely` may appear before the
condition expression in `if` and `while` statements only.

<!-- wyst-contract: sketch -->
```wyst
if #likely x > 0 { ... }          // OK
while #unlikely queue_empty { ... } // OK
// repeat N { ... }                // no condition — hints not applicable
```

### `#cold`

<!-- wyst-contract: sketch -->
```wyst
#cold
error_handler :: () {
  log_error()
  panic()
}
```

`#cold` is a function-level attribute indicating that the function is rarely
executed. It has one deterministic effect: `#cold` functions are implicitly
placed in `#section(.text.cold)` unless an explicit `#section(...)` overrides
it.

**Semantics:**

- `#cold` applies to function declarations only.
- A `#cold` function's code is placed in `.text.cold`, separating it from
  hot code to improve i-cache density of the hot path.
- Explicit `#section(name)` on the same function overrides the implicit
  `.text.cold` placement.
- `#cold #inline` is legal: when the inlined body contains a branch to the
  `#cold` function's code, the branch hint propagates — the path leading to
  the inlined cold code is treated as unlikely.

**Determinism:** `#cold` is an ordering constraint (section placement), not
an optimization hint. Same source = same section placement.

See [chapter-04-modules.md](chapter-04-modules.md) for `.text.hot` / `.text.cold` section
conventions.

### Updated Attribute Table

| Directive   | Applies to               | Meaning                                                      |
| ----------- | ------------------------ | ------------------------------------------------------------ |
| `pub`   | functions                | externally visible symbol                                    |
| `#noreturn` | functions, labels        | never returns to caller                                      |
| `#naked`    | functions, labels        | suppress generated prologue and epilogue                     |
| `#inline`   | functions                | always-inline (compile error if impossible)                  |
| `#pin(reg)` | parameters, locals       | constrain variable to named register                         |
| `#noescape` | address parameters       | permit stack-local address arguments without allowing escape |
| `#likely`   | `if`, `while` conditions | expected-path hint; affects block layout                     |
| `#unlikely` | `if`, `while` conditions | unexpected-path hint; affects block layout                   |
| `#cold`     | functions                | rarely executed; placed in `.text.cold`                      |

---

## 2.8 Constraints

| Constraint                     | Rule                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `return` only inside functions | labels have no frame to unwind                                                                                                                   |
| label bodies must terminate    | must end with `goto` or `#noreturn` call (no fall-through)                                                                                       |
| `#noreturn` is a directive     | prefix directive, orthogonal to return type; applies to functions and labels                                                                     |
| `goto` is bare-context only    | legal only inside `label` bodies and `#ventry` slots; targets top-level `label` declarations (incl. imported); see §2.5 for the full scope table |
| `::` vs `:`                    | `::` for constants in any declaration scope and named top-level declarations such as functions, labels, and types; `:` for mutable storage (locals in function bodies, globals at top level) |
| `:=` / `::=` are tokens        | inferred mutable and inferred constant declarations are visually distinct; `x : = 1` and `X :: = 1` are syntax errors                            |

---

## 2.9 Inline Assembly

`#asm` is Wyst's checked escape hatch into explicit ARM64. Use it for
instructions the language does not (or cannot) expose directly:
system-register access, traps, cache and TLB maintenance, exclusive monitor
pairs, and encodings whose exact form is load-bearing.

The bootstrap compiler intentionally treats the body as a checked mnemonic
subset, not as an embedded general-purpose assembler. Supported mnemonics have
direct encoder coverage and tests; unsupported instructions are compile-time
errors until their encoding and operand checks are added. This keeps
inline assembly auditable, deterministic, and aligned with Wyst's explicit
machine-semantics model.

`#asm` is **not** a free pass to defeat the compiler. Every `#asm` block
declares its register/memory I/O contract; the compiler honors that contract
for register allocation and treats the block as a full two-way memory fence
unless the programmer explicitly opts out via `#asm(pure)`.

---

### Block Structure

An `#asm` block has up to four named sections in fixed order, then a `body`
section containing the literal instructions:

<!-- wyst-contract: sketch -->
```wyst
#asm {
    inputs {
        <operand-list>
    }
    outputs {
        <operand-list>
    }
    clobbers {
        <clobber-list>
    }
    options {
        <option-list>
    }
    body {
        <instructions>
    }
}
```

All sections except `body` are optional. The sections must appear in the
order shown. Section names are not reserved identifiers outside `#asm`.

---

### Operands

Each operand in `inputs` and `outputs` has the form:

```text
name = constraint(wyst-expression)
```

where `name` is the identifier used in the body to refer to the operand,
`constraint` is one of the constraint vocabulary tokens below, and
`wyst-expression` is the Wyst-side value the constraint binds to.

<!-- wyst-contract: sketch -->
```wyst
#asm {
    inputs {
        addr = gpr(buf)
        n = gpr(count)
    }
    outputs {
        result = gpr(sum)
    }
    body {
        mov  {result}, #0
        cbz  {n}, 1f
    0:
        ldr  x16, [{addr}], #8
        add  {result}, {result}, x16
        subs {n}, {n}, #1
        b.ne 0b
    1:
    }
}
```

Operand names are local to the `#asm` block. Two operands in one block
may not share a name. Names beginning with `_` are reserved for the
compiler.

#### Operand Width Selectors

In the body, an operand reference may be prefixed with a register-view
selector to access a sub-width of the chosen register:

| Form       | Meaning                                              |
| ---------- | ---------------------------------------------------- |
| `{name}`   | natural width (`xN` for `u64`, `wN` for `u32`, etc.) |
| `{x:name}` | force 64-bit `xN` view                               |
| `{w:name}` | force 32-bit `wN` view                               |
| `{d:name}` | force 64-bit scalar FP `dN` view                     |
| `{s:name}` | force 32-bit scalar FP `sN` view                     |
| `{v:name}` | force whole SIMD/FP `vN` register view               |
| `{v4s:name}` | force SIMD/FP `vN.4s` arranged register view      |

The selector controls only how the operand is rendered into the instruction
text. Width must be consistent with the underlying instruction encoding;
mismatches are a compile error. Example: `stlxr` writes a 32-bit status
code, so the destination operand is referenced as `{w:status}` even when
the Wyst variable backing it is `u64`.

---

### Constraint Vocabulary

The full set of constraints. Each takes one Wyst expression as its argument.

| Constraint       | Direction    | Binds to                              | Notes                                                                                   |
| ---------------- | ------------ | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `gpr(expr)`      | input/output | any general-purpose register          | Input value is loaded before the block; output variable receives the register afterward |
| `inout_gpr(var)` | in+out       | any general-purpose register          | Variable is read and written; same register both ways                                   |
| `fp(expr)`       | input/output | any SIMD/FP register (`vN`/`dN`/`sN`) | Used for float and vector operands                                                      |
| `inout_fp(var)`  | in+out       | any SIMD/FP register                  |                                                                                         |
| `imm(expr)`      | input        | compile-time integer immediate        | `expr` must be a constant; substituted as `#N` literal                                  |
| `mem(addr)`      | input        | memory operand                        | Substituted as `[xN]` form; declares the access                                         |

There is no early-clobber or commutativity hint. A variable that needs to
live in a specific physical register is `#pin`'d at its declaration site;
the constraint then resolves that pin transparently:

<!-- wyst-contract: sketch -->
```wyst
syndrome : u64 #pin(x0)

#asm {
    outputs {
        esr = gpr(syndrome)      // {esr} resolves to x0
    }
    body { mrs {esr}, ESR_EL1 }
}
```

If `syndrome` were not pinned, the allocator would pick any free GPR.

---

### Clobbers

`clobbers` lists registers and memory regions that the block may overwrite
beyond its declared outputs:

<!-- wyst-contract: sketch -->
```wyst
#asm {
    inputs {
        addr = gpr(p)
    }
    outputs {
        val = gpr(result)
    }
    clobbers {
        x16, x17, memory
    }
    body {
        // body uses x16, x17 as scratch
    }
}
```

Each clobber is one of:

| Form               | Meaning                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `xN` / `wN`        | the named GPR is clobbered (compiler must save/restore if live)        |
| `vN` / `dN` / `sN` | the named SIMD/FP register is clobbered                                |
| `memory`           | the block may read or write any memory the surrounding scope can reach |
| `cc`               | the block clobbers the condition flags (NZCV)                          |

Registers used as constraint operands do not need to appear in `clobbers:`.
Adding them is redundant but not an error.

Ordinary `#asm` is a full two-way compiler memory fence.
The `memory` clobber is allowed as documentation for an opaque block that
touches memory, but it does not make the block stronger. `#asm(pure)` is the
only opt-out from the default fence, and `#asm(pure)` must not list `memory`.

---

### Options

`options` is a comma-separated list of keywords that modify the block's
contract with the compiler:

| Option            | Meaning                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pure`            | The block has no side effects beyond writing its declared outputs. The compiler may schedule it freely, and a block with the same inputs may be CSE'd or eliminated if its outputs are unused. Implies the block is **not** a memory fence.                                                                                                    |
| `sets_sp`         | `#naked` only. The block establishes `sp` from exactly one aligned input operand named `stack`.                                                                                                                                                                                                                                                |
| `preserves_sp`    | `#naked` only. The block may inspect `sp` or use verifier-supported balanced stack-pointer adjustments, but must leave `sp` unchanged when the block exits.                                                                                                                                                                                    |
| `align(n)`        | The first instruction of the block is placed at an address that is a multiple of `n` bytes (power of two).                                                                                                                                                                                                                                     |
| `effects: <spec>` | Declares which effect categories the block introduces for `#deny` checking (see [chapter-01-language-design.md](chapter-01-language-design.md) Effect System). `<spec>` is either `none` (no `#deny` effect categories) or a comma-separated list of effect category names. Without this annotation, the block is conservatively assigned all effect categories. |

`#asm(pure) { ... }` is shorthand for `#asm { options { pure } body { ... } }`
for the very common case of a pure block with no I/O sections.

`#asm(effects: none) { ... }` is shorthand for
`#asm { options { effects: none } body { ... } }`.

Options may be combined: `#asm(pure, effects: none) { ... }`. The `pure`
option controls the memory fence and reordering model; the `effects`
option controls which effect categories the block introduces for the
`#deny` system. They are orthogonal — a block can be a memory fence
(non-`pure`) but introduce no `#deny` effect categories (e.g. a register-
to-register computation that the programmer does not want to reorder
past memory operations).

`effects: none` is verified against the compiler's recognized ARM64 inline-asm
instruction table. The compiler rejects recognized effectful instructions,
including barriers and floating-point/SIMD instructions, rather than trusting
the `none` declaration blindly.

`sets_sp` and `preserves_sp` are verifier contracts for `#naked` code.
`sets_sp` changes the compiler's stack state from unknown to aligned after the
compiler checks the single `stack` input. `preserves_sp` may appear only after
`sp` has been established, and keeps that already-known stack state alive only
when the body's use of `sp` is mechanically verifiable:
plain `sp` reads and balanced 16-byte `add`/`sub` adjustments are accepted, but
writeback operands and assignments such as `mov sp, x0` are rejected. A naked
`#asm` body that mentions `sp` without `preserves_sp` makes the compiler treat
the stack state as unknown after the block.

These stack-state contracts are not effect categories. A
`#asm(sets_sp, effects: none)` block is legal when it satisfies the `sets_sp`
verifier and contains no instruction rejected by the `effects: none` table. A
module may deny every effect category and still use a verifier-approved
`sets_sp` block to establish the initial stack in `#naked` entry code.

---

### Memory Fence Semantics

**Default behavior: every `#asm` block is a full two-way compiler memory
fence.** The compiler may not move any memory operation across the block
in either direction, regardless of declared I/O. This is the safe default;
the only opt-out is `#asm(pure)` below.

The same rule is restated for cross-reference in the ARM64 Feature
Scope section of [chapter-01-language-design.md](chapter-01-language-design.md) (ARM64 Feature
Scope) — code that uses `#asm` to access SVE, PAC, or MTE instructions
inherits this fence behavior by default.

The fence is a _compiler_ fence, not a hardware fence. To order accesses
at the hardware level, insert `%dsb`, `%dmb`, or `%isb()` (or an explicit
barrier inside the body).

To declare a block that is safe to reorder, mark it `pure`:

<!-- wyst-contract: sketch -->
```wyst
#asm(pure) {
    inputs {
        v = gpr(x)
    }
    outputs {
        r = gpr(y)
    }
    body { rev {r}, {v} }      // byteswap — no side effects
}
```

A pure block:

- Must not read or write memory.
- Must not access system registers.
- Must not trap or branch outside its body.
- Must not clobber `memory` or `cc` (declaring either implicitly disables
  `pure` and is a compile error).

The compiler may freely reorder, hoist, sink, or eliminate pure blocks.
Use `pure` only when the body is genuinely a pure register-to-register
computation.

---

### Pinned Variables and `#asm`

A `#pin`'d variable referenced as an `#asm` operand resolves to its pinned
register. The allocator guarantees the variable is live in that register
at both the entry and exit of the block:

<!-- wyst-contract: sketch -->
```wyst
dtb : @u8 #pin(x0)

#asm {
    inputs {
        base = gpr(dtb)        // {base} resolves to x0
    }
    outputs {
        magic = gpr(out)
    }
    body { ldr {magic}, [{base}] }
}
```

If two operands resolve to conflicting registers (two pins both demand the
same register, or a clobber names a register that is also an operand), the
block is rejected at compile time.

---

### Worked Examples

#### `mrs` / `msr` — System Register Access

This example exists as a pedagogical reference for `#asm` operand
interpolation. **Production code should use `%mrs` and `%msr` (§1.3.3)**,
which encode register-name legality, access permissions, and reserved
encodings in the type system rather than the assembler.

<!-- wyst-contract: sketch -->
```wyst
read_tcr :: () -> u64 {
  raw : u64
  #asm {
    outputs {
      r = gpr(raw)
    }
    body {
      mrs {r}, TCR_EL1
    }
  }
  return raw
}

write_tcr :: (val : u64) {
  #asm {
    inputs {
      v = gpr(val)
    }
    body {
      msr TCR_EL1, {v}
      isb
    }
  }
}
```

The block is a full fence by default; the surrounding compiler cannot
reorder loads or stores across the `msr`/`isb`, which is required because
`TCR_EL1` changes the address translation regime.

#### `svc` — Supervisor Call

This example exists as a pedagogical reference for `#asm` operand
interpolation and clobbers. **Production code should use `%svc`
(§1.3.4)** with `#pin`'d locals to express the syscall ABI.

<!-- wyst-contract: sketch -->
```wyst
syscall :: (n : u64, a0 : u64) -> u64 {
  ret : u64
  #asm {
    inputs {
      num = gpr(n)
      arg = gpr(a0)
    }
    outputs {
      res = gpr(ret)
    }
    clobbers {
      memory
      cc
    }
    body {
      mov x8, {num}
      mov x0, {arg}
      svc #0
      mov {res}, x0
    }
  }
  return ret
}
```

`memory` clobber: the supervisor handler may touch arbitrary memory on the
caller's behalf. `cc` clobber: the handler may return with arbitrary flag
state.

#### `ldxr` / `stxr` — Atomic Compare-and-Swap

This example exists as a pedagogical reference for `#asm` operand
interpolation, width selectors, and the `memory` clobber. **Production
code should use `%cas` (§1.3.2)**, which lowers to the same sequence on
ARMv8.0 and to a single `casa`/`casal` instruction on ARMv8.1 LSE.

<!-- wyst-contract: sketch -->
```wyst
cas_u64 :: (addr : @u64, old : u64, new : u64) -> u64 {
  result : u64 // 0 on success, 1 on failure
  seen : u64
  #asm {
    inputs {
      a = gpr(addr)
      old = gpr(old)
      new = gpr(new)
    }
    outputs {
      s = gpr(result)
      v = gpr(seen)
    }
    clobbers {
      memory
    }
    body {
      ldaxr {v}, [{a}]
      cmp   {v}, {old}
      b.ne  1f
      stlxr {w:s}, {new}, [{a}]
      b     2f
      1:
      mov   {w:s}, #1
      clrex
      2:
    }
  }
  return result
}
```

`{w:s}` selects the 32-bit `wN` view because `stlxr` writes a 32-bit
status code. The `memory` clobber is documentation here; ordinary `#asm` is
already a compiler memory fence.

#### `tlbi` — TLB Invalidation

This example exists as a pedagogical reference. **Production code should
use `%tlbi_vaae1is` (§1.3.5)** with explicit barriers — the lowering is
identical, but the intrinsic form is grep-able and the operand legality
is checked.

<!-- wyst-contract: sketch -->
```wyst
invalidate_tlb_va :: (vaddr : u64) {
  #asm {
    inputs {
      v = gpr(vaddr)
    }
    clobbers {
      memory
    }
    body {
      dsb ishst
      tlbi vaae1is, {v}
      dsb ish
      isb
    }
  }
}
```

`memory` clobber: invalidating a translation changes the meaning of every
subsequent load and store. The compiler must not assume any prior
address-to-value mapping survives this block.

#### `dc cvac` — Cache Maintenance

This example exists as a pedagogical reference. **Production code should
use `%dc_cvac` (§1.3.5)**.

<!-- wyst-contract: sketch -->
```wyst
clean_cacheline :: (addr : @u8) {
  #asm {
    inputs {
      a = gpr(addr)
    }
    clobbers {
      memory
    }
    body {
      dc cvac, {a}
      dsb ish
    }
  }
}
```

---

### Design Rationale

| Choice                                  | Reason                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Named operands (`{name}`)               | Self-documenting in the body; no scrolling to map positions to meanings      |
| Register-class constraints (`gpr`/`fp`) | Allocator keeps freedom; programmer doesn't pre-bind to physical regs        |
| `#pin` for specific registers           | One mechanism for register affinity, used in one place                       |
| Full fence by default                   | Forgetting to declare a side effect cannot silently miscompile               |
| `#asm(pure)` opt-out                    | Schedulable blocks still possible, but the burden is on the programmer       |
| Optional `memory` clobber               | Documents opaque memory effects; ordinary `#asm` is already a compiler fence |
| `body { ... }` delimited                | Parser knows where constraints end; future options slot in cleanly           |
