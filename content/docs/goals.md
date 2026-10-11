---
title: Goals and rules
summary: What Wyst is for, the rules that keep it small, and what it leaves out.
---

The goal of Wyst is low-level code that a reader can read and reason about.
The language has about 20 keywords and about 25 builtin names, and it has
no feature that kernel code does not use. The programmer writes only what
the compiler cannot infer.

## What Wyst keeps

These properties together are the reason for the language:

- **Memory safety** in the safe subset, proved from the origin of each
  address, with no lifetime syntax and no runtime. Now, the index proofs
  and the rules for addresses give this: an address cannot leave its
  function, and each index is proved. Each `bitcast` marks a fact that the
  program trusts.
- **Linear resources.** A `linear` value cannot leave a function without
  the declaring module consuming it. Thus the compiler can refuse a
  forgotten end-of-interrupt write. This is not implemented now.
- **Typed registers.** Register maps, devices, and system registers are
  declarations that the compiler understands.
- **Deterministic output.** The compiler writes AArch64 ELF files without
  LLVM, and identical inputs give byte-identical files. The proofs and the
  costs can be inspected.
- **No undefined behavior** as an input to optimization. Trust is tied to
  the operation that asserts it, such as `bitcast`.
- **Checked assembly** in the same type system.

## Rules

- A keyword starts a declaration or a statement. Everything else is a
  builtin name, an attribute, or an argument, and none of those is a
  keyword.
- A new word, clause, attribute, or layout key needs a user in the kernel
  before it enters the language.
- The compiler infers what a function body proves. The program compiles as
  one unit, so every call has a known body. A signature states only types
  and parameter modes.
- Delete before you document.

## What the compiler infers

A signature states only types and parameter modes. The compiler infers the
rest from the body:

- A function cannot keep an address parameter after the call, except
  through its result. There is no `noescape` marker.
- The compiler infers the effects of each call. There are no effect
  clauses.
- `Option` and linear types must be used, by type. An unread binding does
  not count as a use.
- Interface methods use named parameters. There are no function pointer
  types.
- An `else` block that must exit replaces manual unwrap arms. No keyword
  marks the unwrap, because a local cannot hold an `Option`.

## Optimization

Compiler work may be hidden; runtime behavior may not. The compiler removes
the loads, stores, and temporary values that it makes, and it keeps each
call, branch, and device or system register access that the source has.
See [Code generation](/docs/code-generation/).

## Conventions

Each convention removes a keyword with a rule that another language
already proved:

- `pub` marks an exported name. The case of a name carries no meaning.
- The file is the module, as in Zig. A directory only groups modules.
- `struct` and `enum` name themselves. There is no `type` keyword.
- `for` is the one loop. `for cond {}` loops on a condition.
- Labels are `name:`, and `goto` jumps to them.
- `import name path` gives an alias.
- A type implements an interface by having its members.
- `_ = v` consumes a value.
- Fields have no visibility. The programmer, not the compiler, keeps the
  invariants of a type. `linear` stays sound, because only the declaring
  module can consume a linear value.
- `never` is a type name.
- Hardware declarations are attributes on ordinary declarations, such as
  `#[naked] fn` and `#[register_map] struct`.
- A struct lays out its fields in declaration order with natural
  alignment, as C does.
- Stack setup and memory barriers are `asm` lines.
- Layouts are a separate file format that the build reads, as `go.mod` is.

## Not in the language

These have no user in the kernel. Each one needs a user and a design
change before it enters:

- concurrency clauses, contracts, and compile-time meta-operations;
- a protocol for interactive outcomes: `Result`, `match`, and `?` do this
  work;
- staged specialization (`comptime`, `where`) and conditional compilation
  (`#if`, `#target`): the build selects the target;
- floating point, `switch`, `i8`, `i16`, and `i32`;
- explicit uninitialized storage.

## How Wyst grows

A new ARM64 kernel is the one user of Wyst. It is written one module at a
time, together with the compiler. A feature enters the compiler only when
the next kernel module needs it, and the kernel's QEMU boot check is the
acceptance test for each compiler change.
