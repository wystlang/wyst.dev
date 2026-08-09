---
title: "Named Layouts and Placement"
group: reference
section: projects-targets
order: 320
summary: "Named layout inputs, regions, sections, placement attributes, layout symbols, and per-CPU templates."
---

# Named Layouts and Placement

A named layout is an artifact input that selects the entry declaration and constrains
allocated-section placement. It is not an ordinary imported source module.

[Project Builds](project-builds.md) defines manifest selection.
[Entry Contracts](entry-contracts.md) defines target-specific entry validation.
[Artifact and Object Formats](artifact-and-object-formats.md) defines the resulting
ELF and static-library products.

## Named Layout Inputs

A layout input can contain these top-level items:

- one `module` declaration;
- applicable `#target` and `#requires` declarations;
- one or more named `layout` blocks in project mode.

Other top-level declarations are errors.

Project mode selects one block through `layout NAME from "PATH"`.
The selected name must identify exactly one block.

Explicit input mode has no manifest selector.
Its layout file must contain exactly one named layout block.

This layout uses all four section kinds:

<!-- wyst-contract: fmt -->
```wyst
module boot.layout

layout kernel {
  entry boot._start at 0x4008_0000
  region ram: readwrite at 0x4008_0000 size 0x0008_0000

  section ".text": code in ram align 16
  section ".rodata": rodata in ram after ".text" align 16
  section ".data": data in ram after ".rodata" align 8
  section ".bss": bss in ram after ".data" align 16

  pub symbol text_start: @u8 = start(".text")
  pub symbol text_size: u64 = size(".text")
}
```

### Entry Selection

Each selected layout must contain exactly one `entry` member.
The entry uses a module-qualified semantic declaration path.

In project mode, the entry declaration must belong directly to the artifact root module.
The selected declaration must satisfy the target entry contract.

An optional `at ADDRESS` clause fixes the entry address.
The address must be a constant `u64` value.
For AArch64, the address must be divisible by four.

Entry selection creates an artifact reachability root.
It does not export or rename the declaration.

### Regions

A region has this form:

```text
region NAME: readonly at ORIGIN size SIZE
region NAME: readwrite at ORIGIN size SIZE
```

`ORIGIN` and `SIZE` must be constant `u64` values.
`SIZE` must be nonzero.
The range must not overflow `u64`.

Region names must be unique within the layout.

A `readonly` region can contain `code` and `rodata` sections.
It cannot contain `data` or `bss` sections.

### Sections

A section has one quoted name and one kind.
The kinds are `code`, `rodata`, `data`, and `bss`.

`in REGION` constrains region membership.
`after "SECTION"` adds an ordering dependency.
`align N` sets the start alignment.

Alignment must be a nonzero power of two.
Repeated equal region or alignment constraints are accepted.
Conflicting constraints are errors.

An `after` reference must name a declared or implicit canonical section.
Ordering cycles are errors.

The canonical sections require matching kinds:

| Section | Required kind |
| --- | --- |
| `.text` | `code` |
| `.rodata` | `rodata` |
| `.data` | `data` |
| `.bss` | `bss` |

Object-writer sections cannot appear in the layout namespace.
This restriction includes `.debug_*`, `.symtab`, `.strtab`, and `.wyst.*`.

A source `#[section("NAME")]` attribute selects a declared custom section.
The declaration kind must match the emitted contribution.
The attribute does not create a layout section.

If retained init records exist, the layout must declare `.initcalls` explicitly.
That section must have kind `rodata` and alignment of at least eight.

### Layout Symbols

A layout symbol has type `@u8` or `u64`.
Other types are errors.

`start("SECTION")` returns the first section address as `@u8`.
`end("SECTION")` returns the first address after the memory extent.
`size("SECTION")` returns the memory extent as `u64`.

An `@u8` symbol must use `start` or `end` directly.
A numeric address requires `address<u64>(start(...))` or `address<u64>(end(...))`.

Layout-symbol expressions can use integer constant operations.
They cannot use floating-point operations.

A layout symbol cannot reference another layout symbol.
It also cannot depend on an ordinary relocation or per-instance relocation.

`pub symbol` makes the value visible to artifact source.
The compiler also reserves its bare name across the artifact.

`pub symbol` does not create a native export.

## Source Placement Attributes

### `#[align(N)]`

`#[align(N)]` requires an address that is a multiple of `N`.
`N` must be a positive power-of-two `u64` constant.
The selected target must support the requested alignment.

The compiler combines these alignment requirements:

- the natural alignment;
- the section alignment;
- `#[align(N)]`;
- `#[cache_isolated]`;
- target-owned alignment.

The compiler uses the largest requirement.
Padding before a declaration can satisfy the requirement.
The attribute does not change the declaration size.
The attribute does not retain an unused declaration.

The compiler accepts `align` on these declarations:

- a function or label that has a body;
- a module variable;
- a `per_cpu var` declaration;
- a module constant that also has `section`;
- a field in a non-packed struct.

The compiler rejects `align` on bodyless declarations, foreign declarations,
locals, whole types, packed fields, target-owned placements, and `#[inline]`
functions.

<!-- wyst-contract: check-pass -->
```wyst
module align_demo

#[align(16)]
fn entry() { }
```

An aligned struct field changes the field offset and the struct alignment.
The change is part of the struct ABI.
For `per_cpu var`, the template offset and each live instance use the combined
alignment.

Source attributes cannot replace vector-table or trap-frame alignment.

### `#[section("NAME")]`

The selected layout must declare each emitted custom section.
The layout section kind must match the contribution:

| Contribution | Required layout kind |
| --- | --- |
| Function or label | `code` |
| Constant | `rodata` |
| Initialized mutable global | `data` |
| Zero-initialized mutable global | `bss` |

The compiler rejects a reserved, missing, or incompatible section.
It also rejects incompatible contributions to one section.

Compiler-owned `.wyst.*`, debug, symbol, and string sections cannot be named
layout sections.

### `#[init(order = N)]`

Each retained init function contributes one 16-byte `.initcalls` record.
The first word is the `u64` order.
The second word is the function address.

The compiler sorts records by order and semantic declaration identity.
The selected layout must declare `.initcalls` as `rodata` with alignment 8.
The attribute does not call the function.
It does not create startup control flow.

### `#[cache_isolated]`

The selected target must provide an explicit cache-line width.
The compiler aligns the object to at least that width.
It reserves full cache lines around the object.

The reserved padding is not part of the source type.
The padding is not part of the symbol size.
This attribute does not provide atomicity or memory ordering.

## The `.percpu` Template

Each retained `per_cpu var` contributes one entry to `.percpu`.
The source type determines the entry size and natural alignment.
The initializer determines the template bytes.

The ELF symbol value is the byte offset within `.percpu`.
The symbol is local and has type `STT_OBJECT`.
The symbol value is not a live process address.

The compiler emits one initialization template.
It does not allocate or copy live per-CPU instances.
It does not initialize the `per_cpu` live base.
The selected execution environment defines live-instance access.

Debug information does not encode a template offset as `DW_OP_addr`.

## Placement Behavior

The compiler solves section placement after semantic checking and code generation.
The solver honors region, ordering, alignment, and fixed-entry constraints.

The solver uses checked `u64` address arithmetic.
It rejects overflow, overlap, region escape, and unsatisfied dependencies.

The solver derives stable order from declared constraints and canonical section order.
Host directory order and hash-map order do not select placement.
