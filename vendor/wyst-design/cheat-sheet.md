---
title: "Wyst Cheat Sheet"
group: reference
section: language
order: 90
summary: "A quick, task-oriented guide to Wyst source, types, control flow, projects, and compiler tools."
---

# Wyst Cheat Sheet

Use this page for quick recall. The linked reference topics define the exact
language and compiler contracts.

> **Mental model.** A Wyst project selects a source graph, target profile,
> artifact, and layout. The compiler checks typed source and verified IR before
> it creates AArch64 output.

## Start With One Source File

Each project source file declares exactly one module. Imports follow the module
declaration. Declarations follow imports.

<!-- wyst-contract: check-pass -->
```wyst
module examples.counter

pub enum State {
  idle
  ready
}

pub fn sum_below(limit: u64) -> u64 {
  var total: u64 = 0
  for value in 0 ..< limit {
    total += value
  }

  return total
}

pub fn state_code(state: State) -> u64 {
  return match state {
    .idle {
      0
    }
    .ready {
      1
    }
  }
}
```

`pub` exposes a declaration to other Wyst modules. It does not create a native
linker symbol. See [Modules and Symbol Boundaries](modules-and-symbol-boundaries.md).

## Source Forms

| Need | Form |
| --- | --- |
| Name the file's module | `module drivers.uart` |
| Import a module | `import drivers.uart` and use `uart.NAME` |
| Import selected names | `import core.collections { Option, Result }` |
| Add an import alias | `import platform.clock as clock` |
| Publish a declaration | `pub fn read() -> u64 { ... }` |
| Immutable binding | `const limit: u64 = 64` |
| Mutable binding | `var index: u64 = 0` |
| Function | `fn add(left: u64, right: u64) -> u64 { ... }` |
| No normal return | `fn wait() -> never { loop { ... } }` |
| Distinct carrier type | `type DeviceId: u64` |
| Numeric carrier type | `numeric type Offset: u64` |
| Record | `struct Range { base: u64 length: u64 }` |
| Tagged choice | `enum State: u8 { idle ready }` |
| Compile-time assertion | `#static_assert(CONDITION, "message")` |

Names are case-sensitive. Module paths use dots. Source paths normally mirror
module paths: `drivers.uart` maps to `drivers/uart.wyst`.

## Types At A Glance

| Category | Common forms | Note |
| --- | --- | --- |
| Boolean | `bool` | Distinct from `u1`. |
| Integer | `u1` through `u64`; `i2` through `i64` | The number is the exact value width. |
| Float | `f32`, `f64` | An unbound float defaults to `f64`. |
| Byte quantity | `40B`, `16KiB`, `1.5MiB` | Exact compile-time `ByteLength` values. |
| Frequency | `24MHz`, `62.5MHz` | Exact compile-time `Frequency` values. |
| Fixed array | `[N]T` | Owns exactly `N` adjacent values. |
| Slice | `[]T` | A two-word view; it does not own its elements. |
| SIMD vector | `[T:N]` | Admitted shapes total 8 or 16 bytes. |
| Address | `@T`, `@volatile T`, `@mmio T` | Carries an element lens and access qualifiers. |
| String | `string` | A read-only valid UTF-8 view. |
| Multi-result | `(high: u64, low: u64)` | Named tuple with at least two fields. |

The compiler does not apply general implicit conversions. Write the conversion
that states the intended boundary:

| Intent | Form |
| --- | --- |
| Wider integer, same signedness | `widen<T>(value)` |
| Narrower integer | `truncate<T>(value)` |
| Change signedness, same width | `signcast<T>(value)` |
| General integer or Boolean conversion | `numeric<T>(value)` |
| Exact representation crossing | `bitcast<T>(value)` |
| Integer or float category crossing | `floatcast<T>(value)` |
| Saturating same-signedness narrowing | `saturate<T>(value)` |
| Address and `u64` crossing | `address<T>(value)` |
| Change only an address lens | `relens<T>(value)` |
| Change only address qualifiers | `qualify<T>(value)` |

See [Type System](type-system.md) for complete layouts, generics, aggregates,
and conversion rules.

## Control Flow

| Need | Form |
| --- | --- |
| Conditional | `if condition { ... } else { ... }` |
| Conditional value | `const value = if condition { left } else { right }` |
| Conditional loop | `while condition { ... }` |
| Unbounded loop | `loop { ... }` |
| Integer range | `for index in start ..< end { ... }` |
| Enum handling | `match value { .variant { ... } }` |
| Leave or repeat a loop | `break`, `continue` |
| Return a value | `return value` |
| Run cleanup on exit | `defer { ... }` |

`match` over an ordinary enum is exhaustive and has no `else` arm. An integer
range uses an end-exclusive `..<` bound.

Operators group from low to high as follows:

```text
||
&&
==  !=  <  <=  >  >=  is
|
^
&  &^
<<  >>
+  -
*  /  %  %%
prefix +  -  !  ~  xfer
call  index  slice  field  postfix ?
```

Use parentheses when the intended grouping is not immediately clear. See
[Operators and Evaluation](operators-and-evaluation.md) and
[Functions and Control Flow](functions-and-control-flow.md).

## Values, Authority, And Outcomes

| Marker | Meaning |
| --- | --- |
| `mut parameter` | Borrow one mutable value. |
| `var parameter` | Pass one owned mutable value. |
| `noescape` | Prevent the callee from retaining an address, slice, or callable authority. |
| `xfer value` | Transfer an owned resource-bearing value. |
| `must_observe` | Require the caller to observe the result. |
| `Result<T, E>` | Store either `.Ok(value)` or `.Error(error)`. |
| `Option<T>` | Store either `.Some(value)` or `.None`. |
| `result?` | Continue with success or forward the stored failure. |
| `values[?index]` | Check bounds and forward an index failure. |

A checked subscript proves its bounds. It does not also prove initialization,
alignment, lifetime, or device protocol. See [Memory Model](memory-model.md) and
[Outcomes, Progress, and Terminal Control](outcomes-and-progress.md).

## Machine-Facing Code

| Need | Source form |
| --- | --- |
| Sealed architecture operation | `import core.arch { barrier, cpu }` then `cpu.wfe()` |
| Typed MMIO schema | `register_map NAME { ... }` |
| Place an MMIO instance | `mmio NAME: Map at ADDRESS` |
| AArch64 system register | `system_register NAME: readonly u64 { ... }` |
| Checked instruction sequence | `asm (...) { ... }` |
| Fixed entry register | `fn entry(value: u64 in x0)` |
| No generated prologue or return | `naked fn entry(...) -> never` |
| Layout placement | `section`, `region`, `entry`, and `symbol` in a named `layout` |

The selected target profile controls which machine operations are valid. Use
typed declarations and compiler-owned operations instead of raw, untracked
machine facts. See [Semantic Operations and Hardware Declarations](semantic-operations.md),
[Checked Assembly](checked-assembly.md), and
[Named Layouts and Placement](named-layouts-and-placement.md).

## Project Loop

Run these commands from a directory that contains `wyst.project`:

```sh
wync fmt .
wync check .
wync build .
```

Use read-only checks in automation:

```sh
wync fmt . --check
wync check . --diagnostic-format text
```

Inspect compiler decisions when a normal diagnostic is not enough:

```sh
wync explain E0213
wync explain effects . --function module.function
wync explain storage .
wync explain layout .
wync explain lowering . --function module.function
wync disasm build/output.elf
```

| Command | Use it to |
| --- | --- |
| `fmt` | Rewrite source and manifests to canonical form. |
| `check` | Validate the selected artifact without machine output. |
| `build` | Validate and emit the selected artifact. |
| `explain` | Read a diagnostic explanation or inspection report. |
| `disasm` | Inspect authenticated AArch64 disassembly from a Wyst ELF. |
| `lsp` | Start the language server. |

Project manifests, explicit-input mode, artifacts, and output rules are in
[Project Builds](project-builds.md). Compiler diagnostics and exit status are
in [Check, Format, and Diagnostics](check-format-and-diagnostics.md).

## When You Are Stuck

1. Run `wync fmt . --check` to separate formatting from semantic problems.
2. Run `wync check .` and start with the first error.
3. Run `wync explain E####` for that diagnostic code.
4. Use an `explain` report for effects, storage, layout, or lowering questions.
5. Read the linked reference topic before adding a raw assertion or machine
   boundary.

Start with the [Language Overview](language-overview.md) when the required
feature is not on this page. Use [Source of Truth](source-of-truth.md) when two
Wyst sources appear to disagree.
