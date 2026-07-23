---
title: "Chapter 4: Wyst Modules, Targets, and Layout"
group: chapter
chapter: 4
order: 4
summary: "Modules, imports, visibility, source references, and layout/module boundaries."
---

# Chapter 4: Wyst Modules, Targets, and Layout

> **Canonical scope.** Module declaration, import resolution, symbol
> visibility (`pub`), source requirements, `#target` declarations, named layout
> modules, custom sections (`#[section("NAME")]`), and the layout-vs-GNU-LD
> comparison. Output
> object format lives in [chapter-16-object-format.md](chapter-16-object-format.md); ABI is
> in [chapter-15-abi-spec.md](chapter-15-abi-spec.md).

Module design covers source files, module names, imports, exported symbols,
and the layout module boundary.

---

## Modules, Imports, and Visibility

Wyst source uses keyword-led hierarchical module and import declarations.
After leading trivia, every source file declares exactly one module with
`module path`.

<!-- wyst-contract: fmt -->
```wyst
module platform.timer

import (
  drivers.timer as timer,
  platform.clock { now, sleep as delay },
)

pub import (
  platform.errors { Error },
  platform.status { Status },
)
```

A path is a dot-separated sequence of case-sensitive ASCII identifiers. The
path is one module identity; its dots do not grant parent visibility or imply
imports. A whole-module import uses the final component as its local qualifier,
so `import platform.clock` exposes public members as `clock.member`. An `as`
clause replaces that qualifier. A selective import introduces only the named
public declarations into bare scope; a selection may have a local alias.
Wildcard imports do not exist. Duplicate module imports, missing selections,
and every ambiguous collision with a local, import, alias, or re-export are
errors.

Module imports may be written as one import group. The group contains a
non-empty comma-separated list of ordinary import items and admits one optional
trailing comma. It is syntax sugar only: every entry keeps the same
whole-module, alias, selection, collision, sealed-core, and import-closure
behavior as its standalone `import` declaration, and source order is preserved.
Groups contain only module imports; linker `import symbol` declarations are
independent.

An import group is private when written as `import (...)`. A single leading
`pub` produces `pub import (...)` and applies public re-export visibility
uniformly to every entry. An entry cannot carry its own `pub`, and one group
cannot mix private and public imports; write separate groups or standalone
declarations when the visibilities differ. Standalone `import path` and `pub
import path` declarations remain valid.

`pub` is source visibility only. A public declaration may be selected by
another module, and `pub import` re-exports its selected public declarations to
further Wyst consumers. A non-public import remains local to the importing
module. Neither `pub` nor `pub import` exports a linker symbol, creates a linker
alias, retains otherwise unreachable code or storage, or establishes an
artifact root. Linkage and artifact reachability are owned by their explicit
later declarations and layout contracts.

`core` is a sealed compiler-provided package root. Project source cannot
declare, replace, or shadow it. `core.collections` currently authenticates the
ordinary generic declaration `DynamicArray<T>` and permits public or private
whole and selective imports, including selection aliases. A public selective
import may therefore re-export `DynamicArray` under the ordinary visibility
and collision rules:

<!-- wyst-contract: sketch -->
```wyst
import core.collections { DynamicArray }
```

`core.arch` and `core.environment` permit only non-public selective imports of
cataloged category or service namespaces, optionally aliased. They reject
whole-root imports, leaf imports, re-exports, and shadowing, and every module
must directly import each category it uses. The current architecture categories
are `cpu`, `barrier`, `cache`, `tlb`, `exception`, and `memory`; the current
environment service is `semihost`. Their leaf operations come only from the
semantic-operation catalog and cannot be selected as bare functions.
Authentication is by sealed catalog identity, never by a user declaration with
the same spelling.

`core.execution` is the sealed namespace for the provider-facing compiler
operation `suspension_point`. Its only import shape is a private direct
whole-module import, optionally with an ordinary explicit module alias. The
whole import exposes the final qualifier, so canonical source calls
`execution.suspension_point()`. Selective, bare, public, re-exported, or leaf
imports are rejected, as are a local `core` replacement, a shadowed qualifier,
or an attempt to use a same-spelled project declaration as this identity. An
ordinary declaration named `suspension_point` remains an ordinary project
function and gains neither the effect nor the marker boundary. Import
authentication alone does not authorize a call: Chapter 13 additionally
requires the selected target's exact provider and authenticated provider-leaf
placement. No manifest flag, target name convention, or textual same-name
declaration activates the compiler identity.

### Linker Boundaries

`pub` is solely a Wyst source-visibility modifier. Linker symbols use
directional declarations:

- `import symbol "NAME" as local: TYPE` introduces a required external
  function or address.
- `export declaration` creates a strong external alias.
- `export weak declaration` creates a weak external alias.
- `export declaration as symbol "NAME"` selects the exact external spelling.

Weak imports are rejected. One declaration may be exported repeatedly under
independent external aliases. There is no link-name attribute, implicit export
through `pub`, or linker effect from module imports.

## Named Layout DSL

A Wyst layout file is a Wyst module containing one or more named `layout`
declarations. An artifact-owned manifest selection
`layout NAME from "PATH"` selects exactly one block by name. Its name is a
stable semantic identity, not an implicit profile selector. A missing selected
block, a selected block without an entry, or a block with a second entry is a
compile error. An environment-owned `layout .environment` has no source layout
file and therefore does not parse this DSL. Apart from its `module` declaration
and applicable target, requirement, or deny policy, a Wyst layout input contains
no ordinary source declarations outside its layout blocks.

That identity and every checked member contract survive in typed layout IR:
region access, section kind, normalized placement operands and their spans,
semantic entry selection, and typed symbol expressions are not reconstructed
later from spellings. Final placement and artifact construction consume those
facts or verify any syntax-backed artifact adapter exactly against them.

<!-- wyst-contract: sketch -->
```wyst
module boot.layout

layout kernel {
  entry boot.entry._start at 0x4008_0000
  region ram: readwrite at 0x4008_0000 size 0x0008_0000

  section ".text": code in ram align 16
  section ".rodata": rodata after ".text" align 16
  section ".data": data after ".rodata" align 8
  section ".bss": bss in ram align 16

  pub symbol __text_start: @u8 = start(".text")
  pub symbol __text_end: @u8 = end(".text")
  pub symbol __text_size: u64 = size(".text")
}
```

### Semantic Entry Selection

`entry` takes an exact module-qualified Wyst declaration path. Resolution uses
the declaration's semantic identity, never an import alias, source `pub`
status, explicit export alias, ELF spelling, or suffix match. Selecting an
entry sets the final image entry address and creates a reachability root; it
does not publish, export, rename, strengthen, or weaken the selected symbol.

The selected declaration must be a body-bearing target-admissible Wyst entry.
`qemu-virt-aarch64-el1` and `qemu-raspi4b-aarch64-el2` require a Wyst Native,
zero-parameter, unplaced, never-returning function (or the equivalent
body-bearing terminal label). `qemu-virt-aarch64-el2` and
`qemu-virt-aarch64-el2-lse` instead authenticate an exact typed firmware root:

<!-- wyst-contract: sketch -->
```wyst
pub naked fn _start(dtb: @u8 in x0) -> never {
  asm establishes stack (
    stack: u64 in x1 = __stack_top,
  ) {
    mov sp, stack
  }
  boot_main(dtb)
}
```

Those EL2 profiles require exactly that one `dtb` parameter name, `@u8` type,
`x0` placement, Wyst Native convention, `pub naked` declaration,
never-returning behavior, authenticated EL2 fact, and exactly one checked
stack initialization transition. The transition is fixed to its cataloged
`mov sp, stack` source form with one `u64` input in `x1`, so it cannot clobber
firmware `x0`.

The secure direct-ELF `qemu-virt-aarch64-el3` profile authenticates a distinct
zero-parameter root instead:

<!-- wyst-contract: sketch -->
```wyst
pub naked fn _start() -> never {
  asm establishes stack (
    stack: u64 in x1 = __stack_top,
  ) {
    mov sp, stack
  }
  firmware_main()
}
```

Its schema identity is `qemu-virt-aarch64-el3-noargs-v1`, its entry ABI is
`wyst-native-noargs-v1`, and its authenticated initial level is secure EL3.
The root has exactly zero parameters, so `x0` is not an entry parameter and no
DTB authority is implied. The shown checked block is the one admitted stack
transition. In the canonical production fixture `firmware_main()` is its
direct successor, but that callee name is fixture evidence rather than a field
enforced by the target-entry schema. Foreign declarations, linker imports and
aliases, returning or wrong-EL declarations, extra or absent parameters, and
any name, type, placement, convention, or stack-transition mismatch are
rejected before artifact construction. Source placements and clauses alone
never expand or translate between the EL2 and EL3 authenticated target schemas.

The optional `at ADDRESS` clause is a hard unsigned-64-bit placement
constraint on the resolved declaration's first emitted byte. Without `at`, the
entry receives the address produced by ordinary section placement. With `at`,
the solver derives the containing section's required start from the entry's
section-relative offset and rejects underflow, misalignment, overlap, region
escape, or any conflicting fixed address. It never moves the entry within its
section or synthesizes an entry alias.

### Regions And Sections

`region NAME: readonly|readwrite at ORIGIN size SIZE` declares one half-open
address range `[ORIGIN, ORIGIN + SIZE)`. `SIZE` must be nonzero; empty sections
remain representable within a nonempty region and do not require a zero-sized
region. Origin, size, range end, alignment
rounding, and all derived addresses use checked `u64` arithmetic. Region and
section names are unique within a layout block.

Named layouts have no separate image-base member. When at least one region is
declared, the minimum region origin is the image base used by otherwise
unconstrained sections; region declaration order cannot change it. With no
region, the selected target's default executable base applies.

A section declaration names an exact quoted ELF section, assigns exactly one
kind (`code`, `rodata`, `data`, or `bss`), and contributes placement
constraints. `in REGION` selects a region; each `after "SECTION"` adds a
dependency edge; and `align N` adds a positive power-of-two start alignment.
Compiler-owned non-`ALLOC` output names (`.debug_*`, `.symtab`, `.strtab`, and
`.shstrtab`) and the `.wyst.*` namespace are not layout sections and are
rejected before object construction.
Repeated identical constraints normalize to one assertion. Distinct `after`
clauses are all enforced, while conflicting `in` or `align` values are errors.
When alignment is omitted, the class default in the deterministic placement
solver applies. A section without an explicit region may inherit one from its
predecessors under the solver rules below.

The kind is a hard contract with emitted contributions: functions and labels
require `code`, immutable objects require `rodata`, initialized mutable objects
require `data`, and zero-filled mutable objects require `bss`. A source
`#[section("NAME")]` selects an already declared, non-reserved custom section;
it cannot create placement, change the declared kind, target a canonical or
`.wyst.*` section, export a declaration, or rename its symbol.
The `.tls` section is invalid because Wyst has no TLS storage class or emitted
`.tls` payload.

### Typed Layout Symbols

A layout symbol has an explicit source type and a placement-time initializer.
Wyst layout-symbol type set is closed to `@u8` and `u64`; other address
lenses, integer widths, booleans, and aggregate types are rejected before IR:

<!-- wyst-contract: sketch -->
```wyst
layout bounds {
  entry boot.entry._start
  region ram: readwrite at 0x4008_0000 size 0x0008_0000
  section ".text": code in ram align 16

  pub symbol text_begin: @u8 = start(".text")
  pub symbol text_limit: @u8 = end(".text")
  pub symbol text_bytes: u64 = size(".text")
  pub symbol text_address_bits: u64 = address<u64>(start(".text"))
}
```

`start("NAME")` and `end("NAME")` are unshadowable layout-only operations
whose result type is `@u8`; `end` denotes the first byte after the section's
memory extent. `size("NAME")` is a layout-only operation returning that memory
extent as `u64`. Each argument is one single-line string naming a section in
the same layout block. These operations are valid only in layout-symbol
initializers and become concrete only after placement. They are not ordinary
frontend constants and cannot influence type checking, generic selection, or
compile-time conditionals.

The `ConstExpr` grammar permits ordinary compile-time integer facts—including
target and type-layout queries—as pure leaves. The only deferred placement
leaves admitted in a named layout symbol are `start`, `end`, and `size` for a
section in that layout. Ordinary declaration-address relocations and
per-instance offsets are rejected here rather than turning a layout symbol into
an undocumented linker alias. Layout-symbol initializers also cannot reference
another layout symbol (earlier, later, private, public, or themselves); no
second placement-time dependency language is implied by declaration names. An
`@u8` initializer must derive from `start` or
`end`; a `u64` initializer may be an ordinary compile-time integer, `size`, or
a typed numeric expression over layout metrics after explicit address
conversion where required. Deferred evaluation uses the same typed integer
semantics as every other `ConstExpr`: operations wrap at their result width and
shift counts are reduced modulo `max(32, width)`. Layout placement does not
replace those rules with checked arithmetic. Floating-point literals,
conversions to or from floating-point types, floating-point comparisons, and
floating-point arithmetic are not layout-symbol operations; a placement metric
cannot be routed through a floating-point intermediate.

There is no implicit conversion between a typed address and numeric address
bits. A numeric value derived from `start` or `end` must use the ordinary
explicit conversion `address<u64>(...)`; declaring an `@u8` query as `u64`, or
a `size` query as `@u8`, is a type error. `pub` publishes the typed value
through Wyst source visibility only. It does not create an external alias or
change ELF binding; explicit `export` remains the sole external-linkage
surface. A published layout symbol uses its module-qualified declaration
identity. Because the selected layout is an artifact input rather than an
ordinary imported source module, its `pub symbol` members are also available
to source by their bare declared spelling. That spelling must resolve to one
unique layout identity and cannot be shadowed by an ordinary declaration or
import; ambiguity and every duplicate semantic or bare name are hard errors.

### Init Records And Checked Assembly

If at least one `#[init(order = N)]` contribution survives, this selected
layout must explicitly declare, for example,
`section ".initcalls": rodata after ".rodata" align 8`; any declared
alignment must be at least 8. There is no implicit/default `.initcalls`
placement. The layout may
publish typed `start(".initcalls")` and `end(".initcalls")` symbols for an
ordinary runtime walker. `.initcalls` is reserved, so user
`#[section(".initcalls")]` attributes are always rejected.

Placement preserves every checked-assembly contract. A checked block's fixed
placement, typed fixups, first-instruction alignment, and source instruction
sequence survive unchanged. The layout may insert only the cataloged and
reported AArch64 NOP padding authorized by that block's `asm align N`; it may
not insert a literal pool, relaxation, veneer, thunk, or any other instruction
inside the block. In particular, an out-of-range checked `bl`/`CALL26` fixup is
a hard diagnostic that preserves the source instruction; the ordinary
non-checked direct-call veneer policy does not relax it. If placement or range
constraints cannot be satisfied, the compiler diagnoses the conflict instead
of synthesizing code.

The deterministic placement algorithm under “Deterministic Placement Solver”
below consumes the named layout DSL.

### Deterministic Placement Solver

Final placement is a deterministic constraint problem owned by
`phase.placement_constraints` and `phase.placement_solving`. A conforming
implementation must normalize the same build inputs into the same constraint
set, then either produce the same solved placement or the same required
diagnostic. A solver may use any internal algorithm, but its observable result
must match the rules below; hash-map iteration, pointer addresses, thread
scheduling, host path enumeration, and platform linker behavior are never
tie-breakers.

#### Constraint Inputs

The placement constraint set contains only finalized products:

- region declarations: name, origin, size, and attributes;
- section declarations: name, layout-file declaration index, alignment,
  zero or more `in` region constraints, and zero or more `after` section
  constraints;
- fixed-address constraints from an entry `at` clause and from any
  compiler-normalized exact-start requirement;
- section contribution lists with byte size, memory size, declaration
  identity, declaration-order index, required declaration alignment, section
  class, and file-byte payload;
- built-in canonical section order from
  [chapter-16-object-format.md §3](chapter-16-object-format.md) for canonical
  sections not explicitly ordered by the layout file.

A section has these solved fields: section name, resolved region or no region,
file offset, start address, file size, memory size, alignment, and end address.
`end = start + memory_size`; for `NOBITS` sections, `file_size` may be smaller
than `memory_size`, but the address interval uses `memory_size`.

#### Normalization

Constraint collection is deterministic and rejects malformed input before
solving:

- Region names and section names are unique after normalization. Duplicate
  declarations are conflicting constraints, even when their payloads are textually
  identical.
- Alignment values must be positive powers of two. Missing section alignment
  uses the section-class default: 16 for executable text and vector sections,
  8 for initialized data, read-only data, `.initcalls`, `.percpu`, `.tls`, and
  `.bss`, and 1 for non-`ALLOC` metadata unless an owning chapter states a
  stricter value.
- Repeating `align` or `in` with the same normalized value is accepted as a
  duplicate assertion. Repeating either with different values is a conflicting
  constraint diagnostic.
- A section may have multiple `after` constraints. Identical repeats collapse
  to one dependency edge. Distinct `after` constraints are all enforced: the
  section's lower bound is the maximum end address and maximum file offset of
  every predecessor after each predecessor is solved.
- A fixed-address constraint pins a section or symbol to exactly one address.
  Multiple fixed-address constraints for the same entity must name the same
  value. Identical claims collapse without discarding their meaning; different
  values are conflicting fixed addresses. Each normalized claim retains its
  source span, authority origin (for example, the selected entry's `at`
  operand), and exact unsigned-64-bit operand for later diagnostics.
- Fixed-address arithmetic is checked in unsigned 64-bit space. An entry
  declaration fixed by `entry path at A` creates the implied section-start
  constraint `A - offset(entry)`. If that
  subtraction underflows, or if any
  addition used to compute an end address overflows, the solver reports address
  overflow.

#### Region Inheritance

`in = region` is an explicit region constraint. A section without `in` but with
one or more `after` predecessors inherits the direct predecessors' region only
when every direct predecessor has the same resolved region. This inherited
region is part of the solved placement and is used for bounds checks. If direct
predecessors resolve to different regions and the section has no explicit
`in`, inheritance is ambiguous and the solver diagnoses every predecessor and
its resolved region. An explicit `in` resolves that ambiguity and is checked
against every predecessor lower bound.

An explicit `in` may follow a predecessor from another region. In that case the
section is placed at the first address in its explicit region that also
satisfies all `after` lower bounds, alignment, and fixed-address constraints.
If no such address exists, the diagnostic is a region-bounds, overlap, or
fixed-address conflict as appropriate.

#### Solve Order And Ties

The dependency graph contains one node per section and one directed edge
`predecessor -> section` for each `after` constraint. Cycles are illegal,
including self-cycles. The cycle diagnostic must identify every edge in the
reported cycle and render a dependency path such as
`.text -> .rodata -> .data -> .text`, using the cycle rotated to the
lexicographically smallest section name so conforming implementations choose
the same path.

After cycle checking, the solver visits ready sections in deterministic order:

1. lower priority number from explicit layout-file declaration order;
2. built-in canonical section order for canonical sections with no explicit
   layout declaration;
3. canonical section name in bytewise ASCII order.

This is the deterministic tie-breaking rule for equal-priority choices. The
only declaration-order effects at the section level are these layout-file
ordering ties: changing layout file order may change placement among otherwise
independent, equal-priority sections. Inside a section, source declaration order
still controls contribution order as specified in "Concatenation Order"; the
solver may insert padding for alignment, but it must not reorder contributions.

#### Placement Formula

For each section in solve order:

1. Start with the maximum of: the image base or zero for the first unconstrained
   section; the origin and current cursor of an explicit or inherited region;
   every predecessor's end address; every fixed section-start address for that
   section. A region cursor is the maximum end of the already solved non-empty
   sections in that region, initially the region origin. Consequently, two
   independent sections explicitly placed in the same region advance in
   deterministic solve order instead of both beginning at the origin.
2. Start the file offset at the maximum of: the previous file-backed section's
   end offset in solve order, every predecessor's file end offset, and every
   file-offset floor imposed by the writer for headers or program segments.
3. Align both start address and file offset upward to the section alignment.
4. Apply fixed-address constraints after alignment. If aligning the section
   changes a fixed start, or if a fixed start is below an `after` or region
   lower bound, report the conflicting constraints instead of moving the
   section.
5. Compute internal contribution offsets in declaration order. Before each
   contribution, align the section-relative cursor to the contribution's
   required declaration alignment. Padding created here belongs to the section.
6. Compute `file_size`, `memory_size`, and `end` using checked 64-bit
   arithmetic.
7. Verify region bounds and overlap against every previously solved non-empty
   allocated section, then advance the resolved region's cursor to the maximum
   of its old value and this section's end.

All empty sections have `file_size = 0`, `memory_size = 0`, and `start = end`.
They still receive deterministic `start("NAME")` and `end("NAME")` values and
do not overlap any other section. An implementation may omit an empty section header
only when no source-visible layout symbol, synthesized bookend, or object
schema rule requires that header; omission must not change any solved address.

#### Padding And Fill

All section-specific padding and fill bytes are deterministic:

- executable sections use the AArch64 `nop` instruction bytes
  `1f 20 03 d5` for 4-byte-aligned padding and `00` for any impossible
  tail bytes left by byte-granular artifact padding;
- read-only data, initialized data, mixed custom data, `.initcalls`,
  `.percpu`, string tail padding, and file gaps use `00`;
- `.bss` and other `NOBITS` memory gaps reserve zero-initialized memory but
  write no file bytes for those gaps;
- non-`ALLOC` debug and symbol-table sections use the fill rules in their
  owning chapters, defaulting to `00` when no stricter rule exists.

The fill byte policy is derived from section class. Wyst does not expose a
layout-module attribute that changes fill bytes.

#### Required Diagnostics

Every placement diagnostic must identify the conflicting constraints and name
the normalized entities involved. For cycle, overlap, or overflow, the
diagnostic must also show the dependency path that made the failure reachable:

- dependency cycles: report the canonical cycle path and the source location of
  each `after` edge;
- multiple `after` constraints: when they are satisfiable, solve from the
  maximum predecessor end; when they are not, report each predecessor edge and
  the fixed, region, overlap, or overflow constraint that prevents a solution;
- conflicting fixed addresses: report all fixed-address constraints for the
  entity, their exact operands, authority origins, and source locations;
- inherited region conflicts: report the section, each direct predecessor that
  supplied a region, and the chosen explicit region if one exists;
- overlap: report both section intervals, their source layout constraints, and
  the path of `after` and region/fixed-address constraints that positioned each
  interval;
- alignment failure: report the alignment, original lower bound, aligned value,
  and fixed address or region bound it conflicts with;
- address overflow: report the arithmetic operation, operands, section or
  symbol being placed, and the dependency path to the overflowed computation,
  including the fixed-address, region-origin, or image-base origin that began
  that path;
- empty-section diagnostics: report zero-sized intervals as `start == end`
  so users can distinguish emptiness from missing placement.

The completion rule is: two conforming implementations given the same
normalized source, layout, target, and compiler contract must therefore produce
either the same placement or the same required diagnostic.
