---
title: "Chapter 4: Wyst Modules, Targets, and Layout"
group: chapter
chapter: 4
order: 4
summary: "Modules, imports, visibility, source references, and layout/module boundaries."
---

# Chapter 4: Wyst Modules, Targets, and Layout

> **Canonical scope.** Module declaration, import resolution, symbol
> visibility (`pub`), source requirements, `#target` declarations, layout modules, custom
> sections (`#section`), and the layout-vs-GNU-LD comparison. Output
> object format lives in [chapter-16-object-format.md](chapter-16-object-format.md); ABI is
> in [chapter-15-abi-spec.md](chapter-15-abi-spec.md).

Module design covers source files, module names, imports, exported symbols,
and the layout module boundary.

---

## v0.9 Modules, Imports, and Visibility (Current)

Wyst v0.9 source uses keyword-led hierarchical module and import declarations.
After leading trivia, every source file declares exactly one module with
`module path`; `#module` and `#import` are not v0.9 spellings.

<!-- wyst-contract: sketch -->
```wyst
module platform.timer

import platform.clock
import platform.clock as timer
import platform.clock { now, sleep as delay }
pub import platform.errors { Error }
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

## Released v0.8 Syntax Snapshot

> The remainder of this chapter preserves the released v0.8 exposition and
> remains useful for non-conflicting module-discovery, target, layout, and
> placement semantics. Its `#module`/`#import` spellings, full-path default
> qualifier, and any claim that `pub` controls linker export are historical
> v0.8 syntax and do not describe the current v0.9 language. Where the two
> surfaces conflict, the v0.9 section above is authoritative.

### Modules and Targets

---

## Modules

A **module** is a directory of one or more Wyst source files that share a
namespace. Every source file declares which module it belongs to with
`#module name` on the first non-comment line:

<!-- wyst-contract: check-pass -->
```wyst
#module boot.hello
```

The module name is a single identifier; dots are part of the name, not a
nesting operator. `boot.hello` and `boot` are unrelated names — there is no
parent/child relationship, no shared visibility, no implicit re-export.

**Directory rule.** A module is directory-anchored by the file found through
the source-root mapping. The source graph associates the anchor with every
regular, non-hidden `.wyst` part file in the same directory, after removing
build-owned ignored paths such as the selected layout file. Every participating
file must declare the same module name, and a given module name may appear in
only one directory across a compilation.

A file may declare its module exactly once. Re-declaring `#module` later in
the same file is a compile error.

### Multi-File Modules

Participating files in the same module directory that declare the same module
name contribute to one shared namespace. Cross-file references within a module
need no import — any item declared in any participating file of module `foo`
is visible to every other participating file of module `foo` directly by name.

```text
src/kernel.wyst       #module kernel
src/allocator.wyst    #module kernel
src/irq.wyst          #module kernel
src/drivers/uart.wyst #module drivers.uart
```

In the layout above, `kernel.wyst`, `allocator.wyst`, and `irq.wyst` together
form module `kernel`. They share a single flat namespace and can reference
each other's declarations without `#import`. `drivers.uart` lives in
`src/drivers/` as a separate module; module `kernel` must `#import
drivers.uart` to use its exports.

A module declaration has no body delimiters. A leading declaration-attribute
group belongs to the following keyword-led `module` declaration; the remaining
top-level declarations in that source file participate in that module.

### Top-Level Name Collection

The compiler collects top-level declaration names across the participating
files of a module before it evaluates top-level constants. This makes
acyclic top-level constant dependencies order-independent within the visible
module graph: a constant may name another top-level constant that appears
later in source order.

Source order still matters for forms that explicitly define placement or
control flow through the file, such as import placement rules, layout section
concatenation, and statement-local lexical scopes. Local constants inside
function bodies are not part of the top-level dependency graph.

### File-Level Constraints

- **`#requires`**: a module has one source requirement contract. Any file in the
  module may declare `#requires(...)`, but multiple declarations must describe
  the same normalized named-argument set. Wyst does not merge partial
  requirement declarations across files; a missing argument in one declaration
  and an explicit argument in another is a compile error.
- **`#target`**: a module has one exact target contract. Any file in the
  module may declare `#target(...)`, but multiple declarations must
  describe the same normalized named-argument set. Wyst does not merge
  partial target declarations across files; a missing argument in one
  declaration and an explicit argument in another is a compile error.
- **`#[deny_effects(...)]`**: declarations in any file of a module are additive across
  files of the same module. A file may add restrictions; none can lift a
  restriction declared elsewhere in the module.
- **`#import`**: each `#import` directive applies only to references in the
  file that declares it. Two files in the same module each import their
  own dependencies independently. This keeps every source file
  self-documenting about what it depends on.

### Module-Level `deny_effects`

The attribute may appear on the module declaration to restrict effect
categories for every function and label in the module:

<!-- wyst-contract: sketch -->
```wyst
#[deny_effects(sysreg, trap, interrupt_mask, exception_return, cache_maintenance, tlb_maintenance)]
module userspace_lib

import runtime.alloc
// every function in this module is guaranteed EL0-safe —
// no privileged operations anywhere in the call graph
```

A module-level denial is additive with function- or label-level
`deny_effects` — a declaration can deny additional categories beyond its module's restrictions
but cannot un-deny a module-level restriction.

See [chapter-01-language-design.md](chapter-01-language-design.md) Effect System for the full
specification.

---

## Imports

<!-- wyst-contract: sketch -->
```wyst
#import (
  drivers.uart as uart
  runtime.clock { now, Instant as ClockInstant }
)
```

`#import name` records a dependency and makes the imported module's public
declarations available through a qualified namespace. It does not place those
declarations into the importing file's bare namespace. Two or more imports are
usually written in a block:

<!-- wyst-contract: sketch -->
```wyst
#import (
  drivers.uart as uart
  runtime.clock
)
```

Each block entry is the same import item as a standalone `#import name` line,
with the same optional `as alias` clause and optional selective import list.
With an alias, the alias is the qualified namespace:

<!-- wyst-contract: sketch -->
```wyst
#import drivers.uart as uart

_start :: () {
  uart.uart_write('w')
}
```

Without an alias, the full module name is the qualified namespace:

<!-- wyst-contract: sketch -->
```wyst
#import runtime.clock

tick :: () {
  runtime.clock.clock_tick()
}
```

An import can explicitly select public names for unqualified use:

<!-- wyst-contract: sketch -->
```wyst
#import runtime.clock { now, Instant as ClockInstant }

tick :: () -> u64 {
  return now()
}

stamp :: ClockInstant = ...
```

A selected name enters the importing file's bare namespace under its declared
name, or under the selection alias when the selection uses `as`. The module
dependency remains module-qualified at the same time, so `runtime.clock.now()`
or `clock.now()` remains valid when the import also has a module alias:

<!-- wyst-contract: sketch -->
```wyst
#import runtime.clock as clock { now }
```

Imports are not transitive. `#import A` exposes A's exports only to the file
that declares the import; A's own imports are not re-exported. Import aliases
and selected names are local to the importing file and are not part of the
importing module's public surface. Only declarations in the current module
marked `pub` are re-exported to importers.

Two imports in the same module section cannot use the same qualified namespace,
and the same module cannot be imported twice in that section, even with
different aliases. A selected bare import name cannot collide with a local
top-level declaration or with another selected bare import name in the same
section. Ordinary local bindings inside function bodies follow Wyst's normal
lexical scoping rules and may shadow imported or local top-level bare names
inside that local scope.

Wildcard imports are not supported. Source must list every selected bare name
explicitly.

`#import` may appear only at module scope, before any non-import top-level
declaration. The order of imports does not matter.

### Import Resolution

In explicit source-list mode, the compiler is invoked with an explicit list of
source files. It reads each file, groups them by parent directory, indexes
the directories by the `#module` declarations they contain, and resolves
every `#import name` by looking up `name` in that table. If an `#import`
names a module not present in the supplied file list, compilation fails
with a "module not found" diagnostic naming the unresolved import.

```text
wync                                       \
    src/boot/hello.wyst                     \
    src/runtime/uart.wyst                   \
    src/runtime/atomic.wyst                 \
    -o kernel.elf
```

Project builds add a deterministic source-root convention without changing the
language-level import syntax. A project manifest names a root module and one or
more source roots. To locate a module `foo.bar`, the build layer looks for a
file at path `foo/bar.wyst` under each source root; the parent of the matching
file is the module's directory. All `.wyst` files in that directory then
participate as one module.

```text
module name    anchor file (under a source root)   module directory
kernel         kernel.wyst                          src/
drivers.uart   drivers/uart.wyst                    src/drivers/
```

The anchor file must exist for the resolver to find the module; its
`#module` declaration must match the requested module name, and every
discoverable sibling part file in the same directory must declare the same
module. Hidden files, non-`.wyst` files, non-regular files, selected layout
files, and files outside the import closure do not participate in module
identity. Project builds and explicit root-file builds with `--source-root`
use this same directory-anchored source graph; explicit multi-file builds use
the command-line file list as their frozen input set.
Project builds follow the import closure from the root module; they do not
compile directories that no module in the closure imports. See
[chapter-03-project-builds.md](chapter-03-project-builds.md).

The build system remains the authority on what files participate in a build.
This keeps the compiler's notion of a build deterministic and inspectable:
project mode names the root and source roots explicitly, while explicit
source-list mode names the source files directly.

### Symbol References

After resolution, public symbols of an imported module are visible through
their qualified namespace: `module.symbol` or `alias.symbol`. They are visible
as bare `symbol` only when the source explicitly selects that name in the
import item. The compiler records qualified references, module aliases, and
selected bare-name aliases as compiler-owned name facts. This keeps import
resolution deterministic across explicit, project, and loose-file source
graphs.

If two imports in the same importing scope select the same bare name, the
import that introduces the conflict is a compile error. The diagnostic points
at the conflicting selected name and at the first bare name in that scope.
Keep both dependencies qualified, or alias one selected name before importing
both modules into the same scope.

<!-- wyst-contract: sketch -->
```wyst
#module main

#import (
  runtime.gpio { gpio_init as init }
  runtime.uart { uart_init as init }
)

// compile error: both imports select bare `init`
_start :: () {
  runtime.uart.init()
}
```

---

## Visibility

Every top-level declaration in a module is **private to that module by
default**. A declaration is visible to importers only when prefixed with
`pub`:

<!-- wyst-contract: sketch -->
```wyst
#module runtime.uart

UART0_BASE :: u64 = 0x0900_0000          // private — internal helper

pub init :: () { ... }                     // public — usable by importers

pub write :: (s : @u8, n : u64) { ... }    // public
```

Private declarations are not accessible from outside the defining module
under any form (no "friend" mechanism, no escape hatch). The `pub` keyword
is the only way a name crosses a module boundary.

### What Can Be Exported

`pub` is legal on:

- **Functions** (`name :: (args) -> ret { ... }`)
- **Labels** (`name :: label { ... }`) — see [chapter-08-functions.md §2.4](chapter-08-functions.md)
- **Compile-time constants** (`name :: T = expr`, `name ::= expr`)
- **Mutable globals** (`name : T = expr`)
- **Type declarations** (`struct Name { ... }`, `bitstruct Name: Backing { ... }`)
- **Layout symbols** (`pub __text_start ::= #start(.text)`)

When `pub` is combined with `#inline`, `pub` exports the Wyst module
surface only: importers may call the helper, but every call must be inlined
and no ABI-callable body is emitted (see
[chapter-08-functions.md §2.7.1](chapter-08-functions.md)). Taking the
address of a public inline helper is still illegal.

`pub` is not legal on:

- **Local variables** inside function bodies (they have no module-level name).
- **Function parameters**.

### Mutable Exports

A mutable global marked `pub` is visible to importers as a writable global.
Cross-module writes are allowed; the ABI implications are the programmer's
responsibility. This is the same hazard as any shared mutable global in C —
there is no language-level synchronization. Use atomics
([chapter-11-intrinsics.md §1.3.2](chapter-11-intrinsics.md)) or explicit serialization for
any concurrent access.

<!-- wyst-contract: sketch -->
```wyst
pub boot_counter : u64 = 0 // visible and writable by every importer
```

---

## Source Visibility And Linker Boundaries

`pub` is solely a Wyst source-visibility modifier. It makes a declaration
importable by Wyst modules, and `pub import` may re-export a source name, but
neither form creates or changes a linker-visible symbol.

Linker names enter source only through directional boundary declarations:

<!-- wyst-contract: sketch -->
```wyst
import symbol "memcpy" as c_memcpy: extern "C" fn(@u8, @u8, u64) -> @u8
import symbol "errno" as c_errno: @i32
export checksum as symbol "wyst_checksum"
export weak default_idle as symbol "platform_idle"
export _start
```

An import maps one required external linker name to a fresh, typed Wyst name.
Callable imports carry their complete `extern "C" fn(...)` identity; storage
imports carry an address type. Weak imports are rejected because the language
does not yet define a typed absence value. An export maps an existing function,
label, or ordinary mutable global to one external name. Binding is
strong by default; `weak` is legal only on an export. The omitted alias in
`export _start` means `as symbol "_start"`.

`per_cpu` and other per-instance storage templates cannot be exported: their
symbol value is an instance-relative offset, not one process-wide address.
The target must be a declaration owned by the module containing the `export`;
a selected or re-exported Wyst import cannot be captured as if it were local.

Mappings are declarations, not attributes. One local declaration may be
exported repeatedly under independent external aliases and bindings. Two
different local declarations may not claim the same external spelling in one
whole-program build; the compiler reports the collision deterministically.
There is no link-name attribute, no `#export` or `#weak` directive, no implicit
linker export from `pub`, and no source form for hidden shared-object visibility.

The current whole-program compiler keeps module-qualified semantic identities
separate from these external spellings. Changing only `pub`, a module import
alias, or source re-export therefore cannot change ELF identity. The canonical
object-unit mangling and cross-object resolution rules remain owned by Roadmap
item 61 and do not relax this source/linker separation.

In the implemented `ET_EXEC` pipeline, each imported boundary must resolve to
exactly one compatible explicit export in the selected whole program. Code
versus data kind and the complete callable or pointee type must agree before
lowering; an absent or incompatible mapping is a hard diagnostic. IR and
lowering carry the semantic Wyst identity plus a typed relocation/fixup kind,
never an untyped linker string.

A checked-assembly `: symbol = path` operand resolves through the same semantic
Wyst namespace. The path may name an ordinary declaration or the local Wyst
name introduced by `import symbol`, but it cannot quote a linker spelling or
capture an outer declaration implicitly. Assembly labels are scoped to their
one checked block: they cannot be imported, exported, emitted as linker
symbols, or resolve another block's fixup.

---

## Source Requirements And Target Declaration

Reusable modules state source requirements with `#requires(...)`. This
construct accepts minimum architecture revision, required ISA features, minimum
exception level, and required ABI capabilities. It does not select a CPU or a
complete machine profile.

<!-- wyst-contract: check-pass -->
```wyst
#module reusable_spin

#requires(arch = arm64-v8a, el = 1, abi = ( aapcs64 ))

spin_once :: () {
  %nop()
}
```

Build selections such as ABI selection, executable environment, object format,
CPU model, tuning model, loader, device map, exception-level entry, and
platform services belong in project or artifact configuration.

<!-- wyst-contract: sketch -->
```wyst
// Baseline module target:
#target(arch = arm64-v8a, cpu = generic)
```

<!-- wyst-contract: sketch -->
```wyst
// With CPU feature opt-ins:
#target(arch = arm64-v8a, cpu = cortex-a72, features = (lse))
```

<!-- wyst-contract: sketch -->
```wyst
// With execution-level declaration (gates EL-restricted intrinsics):
#target(arch = arm64-v8a, cpu = generic, el = 1)
```

<!-- wyst-contract: sketch -->
```wyst
// With cache-line override for compile-time layout queries:
#target(arch = arm64-v8a, cpu = generic, cache_line = 128)
```

| Field      | Meaning                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arch`     | ISA baseline. `arm64-v8a` is the baseline value.                                                                                                                                                |
| `cpu`      | CPU tuning hint. Affects scheduling but not instruction selection.                                                                                                                              |
| `features` | Optional tuple of CPU-feature opt-ins. Each enables specific instruction lowerings.                                                                                                             |
| `el`       | Execution Level at which the module runs (`0`, `1`, `2`, or `3`). Gates EL-restricted system registers (§1.3.3) and trap intrinsics (§1.3.4). Defaults to `1` (kernel-level code) when omitted. |
| `cache_line` | Cache-line width in bytes for `#cache_line_width()`, `#shared`, and cache-line-aware layout checks. Must be a positive power of two. Defaults to `64` when omitted. |

The full canonical `#target(...)` configuration is part of the reproducibility
input. This includes `cache_line`, whether it is written explicitly or supplied
by its default.

Recognized feature tokens:

| Feature | Effect                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lse`   | Atomic intrinsics (§1.3.2) lower to ARMv8.1 LSE single-instruction forms (`cas`, `swp`, `ldadd`, `ldset`, `ldclr`, `ldeor`) rather than `ldxr`/`stxr` loops. |
| `pmu`   | Enables performance-counter runtime primitives such as `%read_cycle_counter()` on targets that expose the architectural PMU registers.                       |

Absent `features`, the compiler emits the ARMv8.0-A baseline lowering for
every intrinsic.

A module may have only one target contract. Multiple source files in the
same module may repeat `#target(...)` for readability, but every repeat
must contain the same named arguments and the same values after
normalization. Named-argument order, whitespace, equivalent `cache_line`
integer spelling, and feature tuple order do not matter. Omitted
arguments do matter: `#target(arch = arm64-v8a, cpu = generic)` and
`#target(arch = arm64-v8a, cpu = generic, features = (lse))` are
different declarations, not a merge.

Descriptor direction:

- `#requires` is the preferred source-level declaration for reusable module
  requirements.
- `#target` remains the exact target-fact declaration for target-bound modules
  and compatibility source.
- Project builds bind `#requires` and `#target` to a named profile or manifest.
- Target information is modeled as layered descriptors:
  host/tool facts, ISA facts, execution-environment facts, and
  platform/device facts.
- Device, firmware, and OS protocol bindings start as standard-library
  modules, generated artifacts, or project manifests with ABI/effect metadata,
  not as one-off core language declarations.

---

## Layout

A layout file is a valid Wyst module. It uses the same language, same type
system, same tool. No foreign file format to learn.

The builtins `#start()` and `#end()` are layout-time constant forms. They are
type-checked with the layout module, but their numeric values resolve only
after final placement computes section addresses. Layout exports initialized
from section-boundary forms are typed layout-time constants: immutable and
imported like other module exports after layout, but not ordinary
frontend-time constants.

### Entry Point

<!-- wyst-contract: sketch -->
```wyst
#entry _start at 0x0008_0000
```

The entry symbol and its load address are declared together.

### Regions

<!-- wyst-contract: sketch -->
```wyst
#region rom : origin = 0x0000_0000, size = 0x0010_0000, attrs = (readonly)
#region ram : origin = 0x8000_0000, size = 0x8000_0000
#region stack : origin = 0x8000_0000, size = 0x4000
```

Regions name address ranges with optional attributes (`readonly`).

### Sections

<!-- wyst-contract: sketch -->
```wyst
#section .text : align = 16, in = rom
#section .rodata : align = 16, after = .text
#section .data : align = 8, after = .rodata
#section .bss : align = 16, in = ram
```

Sections are placed by constraint: `in` pins to a region, `after` chains
sequentially. Alignment is explicit.

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
- fixed-address constraints from `#entry` and from any compiler-normalized
  exact-start requirement;
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
  value. Different values are conflicting fixed addresses.
- Fixed-address arithmetic is checked in unsigned 64-bit space. An entry
  symbol fixed by `#entry sym at A` creates the implied section-start
  constraint `A - offset(sym)`. If that subtraction underflows, or if any
  addition used to compute an end address overflows, the solver reports address
  overflow.

#### Region Inheritance

`in = region` is an explicit region constraint. A section without `in` but with
one or more `after` predecessors inherits the direct predecessors' region only
when every direct predecessor has the same resolved region. This inherited
region is part of the solved placement and is used for bounds checks. If direct
predecessors resolve to different regions, the section has no inherited region
unless it also has an explicit `in`.

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
   section; the origin of an explicit or inherited region; every predecessor's
   end address; every fixed section-start address for that section.
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
   allocated section.

All empty sections have `file_size = 0`, `memory_size = 0`, and `start = end`.
They still receive deterministic `#start` and `#end` values, and they do not
overlap any other section. An implementation may omit an empty section header
only when no source-visible layout export, synthesized bookend, or object
schema rule requires that header; omission must not change any solved address.

#### Padding And Fill

All section-specific padding and fill bytes are deterministic:

- executable sections use the AArch64 `nop` instruction bytes
  `1f 20 03 d5` for 4-byte-aligned padding and `00` for any impossible
  tail bytes left by byte-granular artifact padding;
- read-only data, initialized data, mixed custom data, `.initcalls`,
  `.percpu`, `.tls`, string tail padding, and file gaps use `00`;
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
  entity and their source locations;
- inherited region conflicts: report the section, each direct predecessor that
  supplied a region, and the chosen explicit region if one exists;
- overlap: report both section intervals, their source layout constraints, and
  the path of `after` and region/fixed-address constraints that positioned each
  interval;
- alignment failure: report the alignment, original lower bound, aligned value,
  and fixed address or region bound it conflicts with;
- address overflow: report the arithmetic operation, operands, section or
  symbol being placed, and the dependency path to the overflowed computation;
- empty-section diagnostics: report zero-sized intervals as `start == end`
  so users can distinguish emptiness from missing placement.

The completion rule is: two conforming implementations given the same
normalized source, layout, target, and compiler-version contract must therefore
produce either the same placement or the same required diagnostic.

### Exports

<!-- wyst-contract: sketch -->
```wyst
pub __text_start ::= #start(.text)
pub __text_end ::= #end(.text)
pub __bss_start ::= #start(.bss)
pub __bss_end ::= #end(.bss)
pub __stack_top :: u64 = 0x8000_4000
```

Section boundaries are exported as typed `u64` layout-time constants. Their
values become fixed after the integrated layout pass places every referenced
section.

### Complete Layout Module

<!-- wyst-contract: sketch -->
```wyst
#module boot.layout

#entry _start at 0x0008_0000
#region rom : origin = 0x0000_0000, size = 0x0010_0000, attrs = (readonly)
#region ram : origin = 0x8000_0000, size = 0x8000_0000
#region stack : origin = 0x8000_0000, size = 0x4000
#section .text : align = 16, in = rom
#section .rodata : align = 16, after = .text
#section .data : align = 8, after = .rodata
#section .bss : align = 16, in = ram

pub __text_start ::= #start(.text)
pub __text_end ::= #end(.text)
pub __bss_start ::= #start(.bss)
pub __bss_end ::= #end(.bss)
pub __stack_top :: u64 = 0x8000_4000
```

### Usage from Source

<!-- wyst-contract: sketch -->
```wyst
#module boot.hello

#target(arch = arm64-v8a, cpu = generic)

_start :: () {
  // __bss_start, __bss_end are available as typed u64 values after layout
  bss_start := __bss_start
  bss_end := __bss_end
}
```

The compiler is invoked with `--layout boot.layout`. The layout module exports
typed values; the source module uses them by bare name after final placement.

### Custom Sections from User Declarations

The layout module defines a section's placement, alignment, and region.
The per-declaration `#section(.name)` attribute names _which_ section a
specific declaration belongs to. Together they express the pattern
"these declarations go into this section, which lives at this address."

<!-- wyst-contract: sketch -->
```wyst
#section(.init.text)
bring_up_uart :: () {
  // boot-time code; can be unmapped after init
  %msr(CNTFRQ_EL0, 24_000_000)
  // ...
}

#section(.modinfo)
module_name :: [16]u8 = "uart_driver_v1"
```

The layout module places those sections:

<!-- wyst-contract: sketch -->
```wyst
#section .init.text : align = 16, after = .text
#section .modinfo : align = 8, after = .rodata
```

#### Legal Placements

`#section(.name)` is legal on:

- Function declarations
- `label` declarations
- Mutable globals (`name : Type = value`)
- Constants (`name :: Type = value`, `name ::= value`)

`#section(.name)` is **illegal** on:

- `struct`, `bitstruct`, and `enum` declarations — they emit no data.
- `vector_table` declarations — their target profile owns a dedicated
  `.wyst.vectors.<name>` section (see [Chapter 14 §10.2](chapter-14-exception-vectors.md)).
- Local variables — they live on the stack, not in any data section.
- `#percpu` and `#tls` declarations — they target the dedicated `.percpu`
  / `.tls` master-image sections (see [§1.3.7](#)).

Applying `#section(.name)` to one of the illegal kinds is a compile
error at the declaration site.

#### Section Name Constraints

A custom section name must:

- Start with `.`
- Continue with `[A-Za-z0-9_.]+` (ELF section-name convention)
- Not collide with any reserved canonical name from
  [chapter-16-object-format.md §3](chapter-16-object-format.md): `.text`, `.rodata`, `.data`,
  `.bss`, `.percpu`, `.tls`, the `.debug_*` family, `.symtab`, `.strtab`,
  `.shstrtab`. Canonical sections are written by _omitting_ the
  attribute (defaults to the section the declaration kind would
  otherwise use).
- Not begin with `.wyst.` (compiler-reserved namespace).

Violating any of these is a compile error at the attribute site.

#### Layout-Module Entry Required

Any `#section(.foo)` used in user code must have a matching
`#section .foo : ...` entry in the layout module. A missing layout
entry is a compile error at the use site that names the missing layout
declaration:

```
error: section .init.text used at boot.wyst:42 has no layout entry
  hint: add `#section .init.text : align = N, after = .text` to the layout module
```

This rule keeps the layout module the single source of truth for
section placement — declarations _name_ sections; layout _places_ them.
No surprise sections appear in the linked image.

#### Section Flags

Section flags (`ALLOC`, `WRITE`, `EXECINSTR`, `NOBITS`) are **derived**
from the declaration kind, not specified by the user:

| Declaration kind                      | Required flags             |
| ------------------------------------- | -------------------------- |
| Function, `label`                     | `ALLOC \| EXECINSTR`       |
| Constant (`::`) with initializer      | `ALLOC`                    |
| Mutable global (`:`) with initializer | `ALLOC \| WRITE`           |
| Mutable global, no initializer        | `ALLOC \| WRITE \| NOBITS` |

If a section receives declarations of multiple kinds, the flag set is
the union — a section holding both functions and constants is
`ALLOC | EXECINSTR`. A section holding both initialized and
uninitialized mutable globals collapses to `ALLOC | WRITE` (the `NOBITS`
flag is dropped because the section must carry the initialized bytes).

The user does not write `flags = (alloc, write)` on `#section(...)`;
the design is deliberately less expressive than GCC's
`__attribute__((section, ...))` for this reason. The kind-derived rule
covers the kernel patterns Wyst targets without requiring users to
reason about ELF flag combinations.

#### Concatenation Order

Multiple declarations targeting the same section are concatenated in:

1. **Source-declaration order** within a single module.
2. **Module-import order** across modules — the order in which the
   compiler resolves modules is deterministic per the Reproducibility
   Model (`chapter-01-language-design.md`).

The compiler does not reorder declarations within a custom section for
alignment or other reasons. The user controls placement order by
controlling declaration order.

#### Bookend Symbols

For every custom section that has at least one declaration, the
compiler auto-synthesizes two symbols:

| Symbol                   | Meaning                                  |
| ------------------------ | ---------------------------------------- |
| `__<section_name>_start` | Address of the first byte of the section |
| `__<section_name>_end`   | Address one past the last byte           |

Dots in the section name are replaced with underscores; leading dot is
dropped. So `.init.text` produces `__init_text_start` and
`__init_text_end`. `.modinfo` produces `__modinfo_start` and
`__modinfo_end`.

These match the convention already used for canonical sections (see
[chapter-16-object-format.md §4](chapter-16-object-format.md)) and unblock the kernel pattern
of freeing `.init.text` after early bring-up:

<!-- wyst-contract: sketch -->
```wyst
free_init_text :: () {
  start := __init_text_start
  end := __init_text_end
  unmap_range(start, end - start)
}
```

Bookend symbols are emitted with `STB_LOCAL` binding unless the layout
module declares an `pub` form referencing the same range (in which
case the user-written export wins and the auto-synthesized symbol is
suppressed). Users who want a bookend visible across modules write an
explicit layout-module export — the auto-synthesized form is for
local use within the same image.

#### Cross-Module Section Aggregation

A custom section can receive contributions from multiple modules.
This is the mechanism for kernel-style metadata tables: each driver
module contributes one entry to `.modinfo`; the layout module places
`.modinfo` once; the runtime walks `__modinfo_start` to `__modinfo_end`
to enumerate drivers.

There is no per-module restriction. Any module can write
`#section(.modinfo)` for any declaration. The layout module's
`#section .modinfo : ...` is the single placement authority.

#### Worked Example: `.init.text`

<!-- wyst-contract: sketch -->
```wyst
#module boot.init

#section(.init.text)
bring_up_uart :: () {
  %msr(CNTFRQ_EL0, 24_000_000)
  // ...
}

#section(.init.text)
bring_up_gic :: () {
  // ...
}

main :: () {
  bring_up_uart() // calls into .init.text
  bring_up_gic()
  free_init_section() // .init.text contents now stale
  kernel_main()
}

free_init_section :: () {
  start := __init_text_start
  end := __init_text_end
  unmap_range(start, end - start)
}
```

Layout module:

<!-- wyst-contract: sketch -->
```wyst
#section .text : align = 16, in = rom
#section .init.text : align = 16, after = .text
#section .rodata : align = 16, after = .init.text
```

After link, `__init_text_start` and `__init_text_end` bracket the
`bring_up_uart` + `bring_up_gic` bytes; `free_init_section` reclaims
that range.

#### Worked Example: `.modinfo` Aggregation

<!-- wyst-contract: sketch -->
```wyst
#module driver.uart

#section(.modinfo)
uart_modinfo :: [16]u8 = "uart_pl011_v1"
```

<!-- wyst-contract: sketch -->
```wyst
#module driver.gic

#section(.modinfo)
gic_modinfo :: [16]u8 = "gic_v3"
```

<!-- wyst-contract: sketch -->
```wyst
#module kernel.modinfo_walk

walk_modinfo :: () {
  addr := __modinfo_start as.address @u8
  end := __modinfo_end as.address @u8
  while addr < end {
    announce_module(addr)
    addr += 16
  }
}
```

Each driver contributes 16 bytes; the compiler zero-fills the remaining
bytes in each `[16]u8` string initializer after escape processing, and the
kernel walks the aggregated table. The layout module places `.modinfo` once.

#### Hot/Cold Section Conventions

Two conventional text sections separate frequently-executed code from
rarely-executed code to improve i-cache density:

| Section      | Purpose                           | Population                                                      |
| ------------ | --------------------------------- | --------------------------------------------------------------- |
| `.text.hot`  | Frequently executed functions     | explicit `#section(.text.hot)`                                  |
| `.text.cold` | Error handlers, init, panic paths | `#cold` attribute (implicit) or explicit `#section(.text.cold)` |

**`#cold` and `.text.cold`:** A function marked `#cold` (see
[chapter-08-functions.md §2.7.2](chapter-08-functions.md)) is implicitly placed in
`#section(.text.cold)`. An explicit `#section(...)` on the same function
overrides this. `#cold` is the common case; explicit `.text.cold` placement
is for code that is not a function declaration (e.g. a `label`).

**Non-`#cold` functions** stay in `.text` by default. A function may
explicitly opt into `.text.hot` via `#section(.text.hot)`:

<!-- wyst-contract: sketch -->
```wyst
#section(.text.hot)
inner_loop :: () {
  // hot loop body — keep in i-cache
}

#cold
panic_handler :: () {
  // implicitly in .text.cold
  log_panic()
}
```

**`#likely`/`#unlikely` do not affect section placement.** They affect basic
block ordering _within_ a function's generated code, not which section the
function lands in. See [chapter-08-functions.md §2.7.2](chapter-08-functions.md) and
[chapter-13-scheduling.md](chapter-13-scheduling.md) for the layout constraint rule.

**Layout module requirement:** If a `#cold` function is implicitly placed in
`.text.cold` and the program has a layout module, the layout module must
declare `.text.cold`:

<!-- wyst-contract: sketch -->
```wyst
#section .text : align = 16, in = rom
#section .text.hot : align = 16, after = .text // optional
#section .text.cold : align = 16, after = .rodata // required for implicit #cold placement
```

If `.text.cold` is not declared and a `#cold` function would be placed there
implicitly, the compiler emits a semantic diagnostic before IR lowering:

```text
error: section .text.cold used by #cold function 'panic_handler' (functions.wyst:42)
       has no layout entry
  hint: add `#section .text.cold : align = 16, after = ...` to the layout module
```

An explicit `#section(...)` on the same function overrides `#cold` placement.
In that case the explicit section must have a layout entry, and `.text.cold` is
not required unless another function is implicitly placed there.

The compiler does not auto-generate `.text.cold`. This follows the existing
"Layout-Module Entry Required" rule: the layout module is the only source of
section order, alignment, and region placement.

#### Design Rationale

| Decision                                    | Rationale                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-declaration attribute (not module-wide) | Real kernel code mixes init-time and runtime functions in the same module. Forcing module boundaries to match section boundaries would require splitting drivers into a dozen tiny modules.                                                                                            |
| Layout-module entry required                | Without the requirement, a typo (`#section(.inti.text)`) would silently produce an orphan section. The "every named section must be placed" rule turns typos into errors at the use site.                                                                                              |
| Flags derived, not user-specified           | ELF section flags are a frequent source of "code in a non-executable section" bugs. Deriving them from declaration kind makes the common case automatic and the wrong case impossible (a function-with-no-EXECINSTR-section is a compile error).                                       |
| No inline alignment on the attribute        | `#align(N)` already covers per-declaration alignment. Doubling up would invite the question "which one wins?" — the layout module's `align =` sets section alignment; `#align(N)` on a declaration sets declaration alignment within the section. One mechanism per concern.           |
| Auto-synthesized bookend symbols            | The kernel pattern of "find and unmap `.init.text`" needs bookends. Making them automatic removes boilerplate; making the visibility local prevents accidental symbol-namespace pollution. Users who want cross-module bookends write explicit layout-module exports.                  |
| `.wyst.` and canonical names reserved        | Canonical names (`.text` etc.) are the _default_ placement — declarations land there without the attribute. Allowing `#section(.text)` would be a no-op surface area. Reserving `.wyst.` keeps the compiler-emitted namespace clean (already used for `.wyst.vectors.<name>` per §10.2). |

#### Tradeoffs

- **Cost:** the user must add a `#section .foo : ...` layout-module
  entry for every custom section they use. This is a small redundancy
  but it makes layout intent visible in one place.
- **Cost:** declarations using `#section(.foo)` must be carefully kept
  consistent — adding a new declaration to `.modinfo` requires the
  layout entry to already exist. The error message points at the
  missing entry, so the fix is mechanical.
- **Benefit:** the spec is implementable without an attribute
  parser for ELF section flags. Codegen knows the declaration kind
  before it picks the section, so the flag computation is local.
- **Benefit:** the kernel `.init.text` pattern, custom `.modinfo`
  tables, and similar runtime-metadata sections all work from day one
  with no special-cased compiler support beyond this attribute.

### Comparison with GNU LD

| Concept     | GNU LD Script           | Wyst Layout                   |
| ----------- | ----------------------- | ---------------------------- |
| Entry       | `ENTRY(_start)`         | `#entry _start at 0x...`     |
| Memory      | `MEMORY { ... }`        | `#region` directives         |
| Sections    | `.text : { *(.text) }`  | `#section .text : align, in` |
| Placement   | output section commands | `in` / `after` constraints   |
| Symbols     | `__text_start = .`      | `pub ::= #start()`       |
| Type system | none                    | full Wyst types               |
| Tool        | separate `ld` pass      | integrated compiler          |

### Design Goals

| Principle               | Contract                                                      |
| ----------------------- | ------------------------------------------------------------- |
| Same language           | Layout is a valid Wyst module                                  |
| Same type system        | Exports are typed `u64` values                                |
| Integrated linker       | No separate `ld` pass — compiler and linker are a single tool |
| Layout-time resolution  | `#start()` / `#end()` resolved at final placement             |
| Constraint-based        | `in` and `after` express placement intent                     |

The layout module system performs the work that a traditional linker script
and linker perform: symbol placement, section ordering, address resolution,
and binary image construction. These are linker responsibilities, and Wyst
embraces that. The difference is that this functionality is integrated into
the Wyst compiler tool itself rather than delegated to a separate program with
a separate input language.

There is no `ld` invocation, no `.ld` script, and no separate linking step.
The compiler resolves symbol addresses, places sections, resolves
cross-module references, and emits the final binary or ELF image in one
invocation. The binary container — ELF64 little-endian AArch64 executable,
canonical section catalog, relocation vocabulary, symbol table discipline —
is specified in [chapter-16-object-format.md](chapter-16-object-format.md).

---

### Duplicate Symbol Policy

Qualified import references do not collide merely because imported modules
contain public declarations. A compile error is reported when source creates an
actual namespace collision: duplicate qualified import namespaces, duplicate
imports of the same module in one module section, duplicate local top-level
names, or duplicate selected bare import names. Ordinary monomorphic
declarations also keep their source symbol names in the current object format,
so duplicate top-level declaration names in one compilation remain invalid even
when the declarations live in different modules. First-wins and COMDAT-style
deduplication are not supported; all source-visible name collisions are surfaced
explicitly.

---
