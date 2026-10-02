---
title: "Wyst Style Guide"
group: guide
order: 10
summary: "Conventions for readable Wyst: formatting, names, modules, functions, and comments."
---

# Wyst Style Guide

Write Wyst so that a reader can identify what a function does, which state it
changes, and which obligations remain with its caller.

This guide recommends conventions for new code and code under active change.
[Best Practices](best-practices.md) applies them to errors, storage, hardware,
and validation. The [language reference](language-overview.md) defines what the
compiler accepts. If advice here conflicts with the reference, follow the
reference and correct the guide.

The separation of style rules from practical advice follows the structure of
[Google's Go style documents](https://google.github.io/styleguide/go/).
The conventions and examples here are specific to Wyst.

## How to use this guide

Use these conventions as the default in new Wyst code. A project can document a
different convention when an existing API, hardware specification, or external
boundary requires it. Do not rename an established public API only to match
this guide.

Compiler requirements, such as exhaustive enum matches, are language rules.
Recommendations, such as a naming convention, are review decisions. Formatting
belongs to `wync fmt`. Keep those three kinds of rule distinct in code reviews.

The Wyst blocks below are complete source modules. They illustrate individual
decisions; they are not complete bootable programs. Use the target and artifact
configuration of your project to check them.

## Priorities

When two forms are valid, use these priorities:

1. **Correct behavior.** Preserve the target, storage, resource, and ABI contracts.
2. **Visible intent.** Make failure, mutation, transfer, and hardware access easy
   to find.
3. **Simple structure.** Use the fewest concepts that explain the current work.
4. **Local consistency.** Use the same names and forms for the same concepts.

A shorter expression is useful only when it is also easy to read. A helper is
useful when its name explains an operation or gives one invariant a clear home.
Do not introduce a generic framework for one concrete use.

## Formatting

Run the formatter. Do not maintain a second set of whitespace rules:

```sh
wync fmt .
wync fmt . --check
```

In a project directory, these commands cover the manifest, declared source
roots, and artifact layouts. The second command checks without rewriting.

The formatter uses two spaces per indentation level and limits breakable syntax
to 100 columns. It can leave indivisible text and target-owned assembly lines
longer than that. It orders imports, formats attributes, and adds trailing
commas to multiline comma lists. Accept that output.

Use blank lines to separate steps with different purposes. If a long expression
is still hard to read after formatting, name an intermediate result or extract
a focused function. Keep comments at positions the formatter can preserve.

Formatting does not check program semantics. See
[Check, Format, and Diagnostics](check-format-and-diagnostics.md).

## Names

Choose names for the reader at the use site. Include units when the type does
not distinguish them: `offset_bytes`, `timeout_ticks`, or `capacity_elements`.
Use the same word for the same concept across parameters, fields, and comments.

### Spelling conventions

| Element | Default | Examples |
| --- | --- | --- |
| Module path and source file | Lowercase words with underscores; dots separate module components | `drivers.uart`, `memory.fixed_buffer`, `fixed_buffer.wyst` |
| Function, operation, parameter, field, or local binding | `snake_case` | `read_frame`, `payload_bytes`, `is_ready` |
| Named type, static interface, or type parameter | `UpperCamelCase` | `FrameHeader`, `Reader`, `Element`, `T` |
| Enum variant | `UpperCamelCase` | `Data`, `InvalidLength`, `EndOfInput` |
| Module constant or placed device | `UPPER_SNAKE_CASE` | `HEADER_BYTES`, `UART0` |

A local `const` still uses `snake_case`. Capitalization does not control
visibility; `pub` does. Preserve imported names such as `.Ok`, `.Error`,
`.Some`, and `.None` exactly. Existing code can use other valid spellings.

Keep hardware register and field names recognizable from the hardware manual,
such as `DR`, `DATA`, or `TPIDR_EL1`. In ordinary type names, treat an acronym as
a word, as in `UartConfig`. Use lowercase acronyms in ordinary value names, as
in `uart_ready`.

```wyst
module protocol.frame

const HEADER_BYTES: u64 = 4

enum FrameKind {
  Data
  Control
}

struct FrameHeader {
  payload_bytes: u32
  kind: FrameKind
}

fn total_bytes(header: FrameHeader) -> u64 {
  return HEADER_BYTES + widen<u64>(header.payload_bytes)
}
```

### Names should explain the operation

Use verbs for actions: `read`, `write`, `reserve`, `reset`. Use names such as
`is_empty` or `has_capacity` for predicates. Avoid vague names such as `process`,
`handle_data`, and `do_work` when a more precise operation is known.

Read a qualified name aloud. `uart.write_byte` already identifies the device;
`uart.uart_write_byte` repeats that information. Retain a qualifier when it
distinguishes operations with different meanings, such as `read_bytes` and
`read_string`.

Use short names for short, obvious roles. `index` is suitable for a loop index;
`destination_offset_bytes` is useful when a function handles several positions.
Do not encode the primitive type in every variable name.

## Modules and imports

Give each module one domain responsibility. Prefer `drivers.uart` or
`memory.allocator` to a growing `util` or `common` module. Split files when that
makes the responsibility easier to find, not to meet a line count.

Each project source file declares exactly one module. Follow the source layout
rules in [Project Builds](project-builds.md); several part files can belong to
one module. Dots in a module name do not create parent visibility.

Use a whole-module import when the qualifier makes calls clearer. Use a
selective import for a small set of types or names that remain unambiguous.
Alias an import to resolve a collision or supply a useful domain name. Avoid
aliases that only save a few characters. Let the formatter order imports.

```wyst
module protocol.payload

import core.checked
import core.collections { Result }

fn read_byte(bytes: []u8, index: u64) -> Result<u8, checked.IndexFailure> {
  return .Ok(bytes[?index])
}
```

Keep declarations private until another module needs them. Use `pub import`
only when the re-export is part of the module's intended API. Remember that
`pub` controls Wyst visibility; native linker symbols use separate `export`
declarations. See [Modules and Symbol Boundaries](modules-and-symbol-boundaries.md).

## Bindings and types

Use `const` unless the binding must change. Introduce a `var` near its first
use and keep its mutable lifetime short. A constant address or view does not,
by itself, establish that all referenced storage is immutable.

Let a local type be inferred when the initializer makes it clear. Write the
type when it selects a literal's width, documents a meaningful boundary, or
removes ambiguity. Keep types explicit in API signatures and for hardware
representations. The compiler's `--warn-redundant-local-types` option can
identify annotations whose removal preserves inferred facts.

Prefer a domain type when two values with the same machine representation must
not be interchangeable. For example, a byte length and a physical address have
different meanings. Check [Bundled Core Library](core-library.md) for existing
quantity types before adding another one.

Use a conversion that states the intended operation: `widen`, `truncate`,
`signcast`, or another supported conversion. Do not use raw address conversion
as a shortcut around a type or lifetime error. Exact conversion rules are in
[Type System](type-system.md#explicit-conversions).

## Functions and control flow

Give each function one operation that can be named and tested. Keep validation
near the boundary that receives the input. Prefer an early return when it
removes a layer of nesting and leaves the main path easy to follow.

```wyst
module buffer.bounds

fn fits(capacity: u64, offset: u64, length: u64) -> bool {
  if offset > capacity {
    return false
  }

  // The guard prevents subtraction from wrapping.
  const remaining = capacity - offset
  return length <= remaining
}
```

Use argument labels when adjacent values have the same type but different
roles, for example `fits(capacity = 64, offset = 8, length = 16)`. Labels are
available on direct Wyst calls. Treat public parameter names as part of how
callers read the API.

Use `if` expressions and `match` expressions for compact value selection. Use
statements when the branches perform several actions. Wyst requires braces
after `else`; a nested conditional uses `else { if ... }`.

Prefer structured loops to architectural transfers for ordinary work. `goto`
belongs to labels and exception-vector entries. Use `never` when a function
intentionally cannot return normally.

Make the parameter contract match the operation. An unmarked parameter gives
read access, `mut` gives an exclusive mutable loan, and `var` takes an owned
mutable value. Keep explicit `xfer` operations visible. Do not hide a transfer
inside a helper whose name suggests a read.

For enum matches, list all outcomes. A statement arm with no work is written
with its pattern alone, without an empty block. See
[Functions and Control Flow](functions-and-control-flow.md) for exact forms.

## Comments and API documentation

Explain why an operation is required, which invariant it preserves, or which
external rule it follows. Do not restate clear code. Use short, direct sentences
and the domain names used in the source. Remove comments when their claim stops
being true.

For a public operation, document the facts that a caller needs:

- accepted input and units;
- returned value or view, including its storage source and lifetime;
- mutation and ownership transfer;
- failure, cancellation, or terminal behavior;
- target, hardware, and concurrency requirements.

Use compiler contracts for facts that the compiler can enforce. Comments can
explain those contracts, but cannot replace them. For a hardware sequence,
identify the relevant manual section and the reason for access order or barriers.

## Reviews and changes

Review behavior and contracts before spelling and whitespace. Point to a
specific rule and explain the effect on the reader. Use the formatter and
compiler to settle mechanical questions.

Improve nearby code when it supports the current change. Keep broad renames or
format-only changes separate from behavioral changes. Do not rewrite an entire
module because the guide gained a new recommendation.

Before submitting, run formatting and semantic checks, build the selected
artifact, and test the behavior that changed. The
[Best Practices validation workflow](best-practices.md#validate-the-selected-artifact)
describes the different evidence each step provides.
