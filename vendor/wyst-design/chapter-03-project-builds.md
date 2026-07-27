---
title: "Chapter 3: Wyst Project Builds"
group: chapter
chapter: 3
order: 3
summary: "Project layout, manifests, source discovery, target selection, and build modes."
---

# Chapter 3: Wyst Project Builds

The project-build contract defines how a user points
`wync build` at a multi-file project, how modules map to files, which build
facts live outside source, and which larger build-system features remain
outside this build surface.

Project layout, source roots, target profiles, layout files, and build modes
are specified here. Module syntax is specified in
[chapter 4](chapter-04-modules.md). Package management, external linking, and
incremental builds remain explicit boundaries.

## Goals

- Build a non-trivial multi-module kernel without custom shell glue.
- Keep source imports semantic and module-name based.
- Make non-source build facts explicit, deterministic, and reviewable.
- Preserve the whole-program compiler model.

## Non-Goals

- Package management, dependency download, lockfiles, registries, or semantic
  version solving.
- Dynamic linking, external object linking, archive production, or partial link
  outputs. The closed manifest grammar reserves a static-library declaration,
  but no archive writer is active.
- Source globs, directory-wide implicit compilation, or filesystem paths as
  language-level import names.
- Full target-descriptor schema.

## Build Modes

The compiler has two build input modes.

### Project Directory Mode

```sh
wync build .
wync build path/to/project
wync build path/to/wyst.project
```

If the build input is a directory, that directory must contain `wyst.project`.
Project mode does not search parent directories. If the build input is a project file,
paths inside it are resolved relative to that file's directory.

Directory builds without `wyst.project` fail with a diagnostic that suggests
explicit root-file mode.

### Explicit Root-File Mode

```sh
wync build src/boot.wyst \
  --source-root src \
  --layout layout.wyst \
  --target qemu-virt-aarch64-el2 \
  -o build/image.elf
```

This mode keeps small tests and one-off experiments easy. The named root file
is the root module. If `--source-root` is omitted, the root file's directory is
the only source root, but the root file remains a single explicit file so
side-by-side fixture variants and `layout.wyst` are not pulled in by accident.
Imports are still resolved by module name through the same source-root
convention used by project mode. If one or more `--source-root` values are
supplied, the named root file is the root module's anchor and the resolver uses
the same directory-anchored part-file rules as project mode for the root and
for imports.

Explicit mode continues to support the explicit source-list path as
compatibility input. Import-closure discovery is the preferred project and
root-file build surface when source roots are available.

A root module loaded by either build input mode is ordinary Wyst source:

<!-- wyst-contract: check-pass -->
```wyst
module boot

import core.arch { cpu }

fn _start() -> never {
  loop {
    cpu.wfe()
  }
}
```

## Project Manifest

`wyst.project` contains exactly one canonical, closed `project` declaration.
Final linked artifacts are named first-class declarations inside that project:

```text
project project_graph_smoke {
  source_root "src"
  default kernel

  executable kernel for "qemu-virt-aarch64-el2" {
    root boot.entry
    output "build/kernel.elf"
    layout kernel from "layout.wyst"

    debug .full
    unwind .tables
    frame_pointers .all

    verify {
      code arch.timer.tick {
        instructions 2
        families [.hint, .branch]
        prologue .absent
        spill_slots 0
        veneers 0
      }
    }
  }

  benchmark kernel_benchmark for "qemu-virt-aarch64-el2" {
    root bench.entry
    output "build/kernel-benchmark.elf"
    layout benchmark from "layout.wyst"

    debug .none
    unwind .none
    frame_pointers .minimal
  }
}
```

The same `executable` kind covers a target whose authenticated layout owner is
the execution environment:

```text
executable tool for "macos-aarch64" {
  root app.main
  output "build/tool"
  layout .environment
  debug .full
  unwind .tables
  frame_pointers .all
}
```

`macos-aarch64` is an illustrative target ID for the canonical grammar. This
contract does not install that target, a Mach-O writer, a host runner, or any
provider semantics. Until a hosted target is cataloged, selecting it fails as
an unknown target even though the manifest form parses and formats.

The distributable-library form is also fully reserved in this grammar:

```text
static_library widgets for "macos-aarch64" {
  root widgets
  output "build/libwidgets.a"
  companion "build/libwidgets.wystlib"
  debug .full
  unwind .tables
  frame_pointers .all
}
```

The project and artifact names may be identifiers or quoted strings. A project
has one or more repeated `source_root` clauses and exactly one `default`, which
must resolve to one artifact in the same project. The closed artifact-kind set
is `executable`, `benchmark`, `fixture`, and `static_library`.

Every artifact states one semantic root module, one output path, one mandatory
target profile in its header, `.reproducible` profile policy, `.none`,
`.line_tables`, or `.full` debug policy, `.none` or `.tables` unwind policy,
and `.minimal` or `.all` frame-pointer policy. The remaining clauses are
kind-specific:

- `executable`, `benchmark`, and `fixture` have an entry and exactly one layout
  clause. A target with `.artifact` ownership requires
  `layout NAME from "PATH"`; a target with `.environment` ownership requires
  `layout .environment`. The two forms are mutually exclusive.
- `static_library` has no entry or layout and requires one explicit
  `companion "PATH"`. Its `root` selects the source-module import closure.
  Source `export` declarations determine native archive exports, while `pub`
  Wyst declarations determine the authenticated semantic interface. The kind
  rejects `entry`, either layout form, and `runner`. Code verification clauses
  remain structurally valid.

Static-library archive and companion production are unavailable. Selecting a
valid `static_library` returns one stable unavailable-feature diagnostic before
creating an output parent, writing a temporary file, or creating or replacing
either product. An unselected valid static-library declaration may coexist with
a selected executable. Archive/companion emission is a later object-format
contract, not an implicit use of the current ELF writer.

`wync build .` and `wync build path/to/wyst.project` select the declared
default. `--artifact NAME` selects another artifact from that same manifest.
An explicit manifest path is the boundary of a distinct project; project mode
does not merge or inherit declarations from another manifest.

The target profile is the sole manifest selection for target facts. It defines
the architecture and features, entry and supported execution/security/
streaming-state model, ABI, executable environment, environment-service offer,
layout owner, root/entry ABI and return policy, privilege/admission policy, and
dynamic-import/TLS/unwind/panic/exit policies.

The compiler resolves that profile directly to current typed data. There is no
target-profile product, extension set, schema version, or digest layer between
selection and use.

For `qemu-virt-aarch64-el2` and `qemu-virt-aarch64-el2-lse`, that same target
selection requires Wyst Native at EL2, `-> never`, exactly `dtb: @u8 in x0`,
an initially uninitialized stack, and the exact checked `mov sp, stack`
transition with its stack input in `x1`. A manifest or source register
placement cannot override that entry shape.

For `qemu-virt-aarch64-el3`, target selection instead requires secure initial
EL3, an exact zero-parameter `pub naked fn _start() -> never` root, and exactly
one checked `mov sp, stack` transition from `stack: u64 in x1`. The canonical
production fixture then calls `firmware_main()` directly; the compiler does not
hardcode that callee name. This entry has no `x0` DTB parameter.

Source `core.environment` imports derive their required-service set from the
selected target. The build fails when the target does not offer a required
service. Current built-in targets select measurement-counter source
`a64-generic-virtual-counter`. They select the
`freestanding_privileged` execution environment with empty execution- and
completion-provider lists. A compiler-owned synthetic test target exercises
the provider path. Provider semantics are activated by exact selection and
source use, not merely because a callable carries `execution_suspension`.

The compiler uses selected target facts, offered and required services,
manifest policies, and the normalized layout directly during validation,
lowering, diagnostics, and reports. Source requirements remain semantic
requirements; they do not create a parallel manifest target-fact surface.

If no runtime record is supplied, build and raw counter reads remain valid; a
consumer marks every numeric counter verification or report result explicitly
unsupported. A runtime record with the closed disposition `unknown`,
`malformed`, `incomplete`, `stale`, `mismatched`, or `ambiguous` fails before
any record field becomes visible. An unrecognized provider identity is
`unknown`; a source or other recognized-fact disagreement and an invalid epoch
transition are `mismatched`; a recognized provider identity, schema, or product
digest that disagrees with the authenticated selection is `stale`. Missing
authority-declared rows or a present
record without authority are `incomplete`; extra rows, changed effects, scope,
trust-anchor identity or references, and authority-digest disagreement are
`mismatched`; multiple authorities are `ambiguous`. No record and no authority
is the legal raw-only case. A real runtime producer is not part of the current
project-build pipeline;
the compiler-owned baseline synthetic authority digest is
`sha256:c656328d5dde4c49e71ea298af58ac8daa27a8bb9205219d59c061bea3a3ebb1`.

An artifact may contain at most one `verify` block. `code` clauses name
body-bearing functions or labels by canonical absolute semantic declaration
selector, with complete explicit type arguments for a generic declaration:

```text
code math.hash<u64> { ... }
code codec.encode<protocol.Packet, []u8> { ... }
```

Each selector becomes an `artifact_verify` reachability root and final emitted
verification subject. Constraints cover instruction count and authenticated
families or exact post-relocation bytes, plus prologue presence, compiler spill
slots, and veneers. Verification observes final code and rejects a mismatch; it
never rewrites code to satisfy the contract.

Manifest members are fixed-arity contextual clauses, not generic keys or Wyst
expressions. Clause order is insignificant to parsing; the formatter emits the
canonical project order `source_root`, `default`, then declarations in source
order. Within an artifact it emits `root`, `output`, the kind-specific
`companion` or `layout`, `profile`, `debug`, `unwind`, `frame_pointers`, and
`verify`. Unknown clauses, duplicate singleton clauses, duplicate
normalized names/selectors, missing mandatory clauses or referenced
declarations/layouts, and product collisions are hard errors. Generic
`name = value` entries, includes, inheritance, interpolation, environment
lookup, stringly typed policies, and hidden defaults are not manifest syntax.
There are no hosted, kernel, concurrency, provider, privilege, service, or
layout-owner flags, no target-ID suffix convention, and no parallel target
configuration path. The artifact header's target remains the only selection.

All path clauses are relative to the manifest, lexically normalized before
lookup, symlink-safe, and containment-checked against the project directory.
Absolute paths and paths that escape the project are rejected. Output paths
and static-library companion paths must also remain distinct from every project
input and every other artifact product after filesystem resolution.

## Module To File Mapping

Source imports stay semantic:

<!-- wyst-contract: sketch -->
```wyst
module boot

import (
  drivers.uart,
  panic,
)
```

The project build layer maps module names to files under explicit source roots:

```text
boot         -> src/boot.wyst
panic        -> src/panic.wyst
drivers.uart -> src/drivers/uart.wyst
```

Rules:

- Dots in module names become path separators for source-root lookup.
- The anchor file's `module` declaration must exactly match the requested
  module name.
- A module is directory-anchored. Once the resolver finds the anchor, every
  regular, non-hidden `.wyst` file in that anchor directory participates as a
  controlled part file, except build-owned ignored paths such as the selected
  layout file. Each participating file must declare the requested module.
- If a requested module maps to more than one existing file across source
  roots, compilation fails with an ambiguous-module diagnostic.
- If no file exists for an imported module, compilation fails with a
  module-not-found diagnostic.
- Project mode follows the import closure from the selected artifact's `root`.
  It does not compile all `.wyst` files under the declared `source_root`
  directories.
- Hidden files, non-`.wyst` files, non-regular files, files outside the import
  closure, and the selected layout file are ignored for module discovery.
- Generated source is never discovered from conventional `generated/` or build
  output directories. A build step that wants generated Wyst source must place
  the file under an explicitly listed source root before `wync` starts; it then
  follows the same anchor and part-file rules as hand-written source. External
  source roots are outside project mode, and source roots must stay inside the
  project directory.

Filesystem layout is still not language semantics. Moving
`src/drivers/uart.wyst` is allowed if the project source-root mapping still
resolves the semantic module name `drivers.uart`.

## Canonical Project Traversal

Project builds use a deterministic import-closure traversal. This traversal is
part of the reproducibility input manifest:

1. Source roots are considered in the order written in `wyst.project`.
2. The selected artifact's root module is loaded first.
3. A module anchor is found by mapping `.` in the module name to path
   separators and appending `.wyst` under each source root. If more than one
   source root contains the anchor, the import is ambiguous and the build
   fails.
4. Once an anchor is found, every discoverable part file in that anchor's
   directory participates in the module. Discoverable part files are regular,
   non-hidden `.wyst` files after removing build-owned ignored paths such as
   the layout file. Those files are ordered by normalized project-relative path
   using `/` separators. Every participating file must declare the requested
   module exactly once.
5. Imports are collected from the module's files in that file order and source
   text order. Duplicate imports of the same module are kept at their first
   encounter.
6. Traversal is breadth-first: newly discovered imports are appended to the
   work queue in first-encounter order, and modules already loaded are skipped.

The compiler's source input order for a project build is this module traversal
order, with each module contributing its files in the canonical file order
above. Explicit multi-file builds instead use the exact command-line source
order supplied by the user.

## Target Profiles

Project builds select a named target profile. The QEMU `virt` baseline profiles
are:

```text
qemu-virt-aarch64-el1
qemu-virt-aarch64-el2
qemu-virt-aarch64-el3
```

They correspond to the QEMU-oriented AArch64 static ELF baseline:

- `arch = arm64-v8a`
- `cpu = generic`
- exact `el = 1`, `el = 2`, or `el = 3`, matching the selected profile
- static AArch64 ELF output
- Wyst native ABI with AAPCS64 interop support
- executable environment `qemu-aarch64-semihost`, offering exactly
  `a64-semihost-hlt-f000`

The EL1, EL2, and EL3 baselines carry identical authenticated QEMU semihost
service offers and measurement-counter contracts. Their entry contracts are
profile-specific: EL2 authenticates the DTB in `x0`, while the secure EL3
direct-ELF profile authenticates a zero-parameter root and gives `x0` no entry
meaning. Runner selection remains a separate pre-launch catalog choice.

`qemu-virt-aarch64-el2-lse` carries the same QEMU executable-environment,
environment-service offer, ABI, and measurement-counter selections and
additionally provides the authenticated `lse` feature. Use that profile when a
module's exact `#target` tuple requires LSE; the baseline profile remains
LSE-free.

The Raspberry Pi model 4, revision B, QEMU profile is:

```text
qemu-raspi4b-aarch64-el2
```

It corresponds to the Raspberry Pi model 4, revision B, QEMU smoke path:

- `arch = arm64-v8a`
- `cpu = cortex-a72`
- `el = 2`
- QEMU `raspi4b` board emulation
- static AArch64 ELF output converted to a `kernel8.img` handoff artifact
- PL011 UART0 at `0xfe20_1000` checked through `-serial stdio`
- executable environment `bare-aarch64`, offering no environment services

Physical Raspberry Pi hardware validation is outside this profile.

Source-level `#requires(...)` declarations are valid and optional. Project
target facts must satisfy every declared requirement: required features and ABI
capabilities must be present, required architecture must match the implemented
baseline, and the selected exception-level entry must be at least the required
minimum. Source-level `#target(...)` declarations remain valid for exact
target-bound modules. Project target facts become semantic defaults for modules
that omit `#target(...)`. When a module declares `#target(...)`, its facts must
be compatible with the selected project profile and explicit project target
facts. A conflicting target fact or missing source requirement is a diagnostic.

The full layered descriptor schema in [chapter-02-targets.md](chapter-02-targets.md) remains outside
the project-manifest surface. The project manifest does not add device
protocol manifests, SDK discovery, generated binding provenance, or
microarchitectural estimate tables unless a checked target cannot be proved
without a small piece of that surface.

## Layout And Output

The target profile owns the layout-owner decision. For `.artifact`,
`layout NAME from "PATH"` selects exactly one named Wyst layout block from the
referenced file; that block must exist and its semantic entry must name the
artifact root. Two artifacts may select different named layouts from one file,
but neither may borrow a layout whose entry belongs to the other root. For
`.environment`, the exact manifest choice is `layout .environment`; no layout
file becomes a source or build input, and the environment profile must provide
the complete entry and artifact-layout contract before a backend can be active.

The normalized pair of layout owner and layout choice is preserved through
validation and every compatibility/provenance identity. A linked artifact may
not omit its owner-required form or supply the other form. A static library has
no layout choice. `output` names the selected artifact's primary product;
`companion` names the static library's semantic-interface product.

The root source file should not hard-code output paths or project directories.
Published typed layout symbols remain available to source after layout
semantic checking.

## Whole-Program Policy

The currently successful compiler path stays whole-program. It emits one final
static ELF and does not write relocatable objects, archives, or library
companions.

Reason:

- The compiler already performs final placement, relocation patching, symbol
  emission, and DWARF source-floor emission as one deterministic whole-program
  operation.
- Object output would require an explicit undefined-symbol model, serialized
  relocations, archive/library search policy, external linker policy, and
  partial debug-info contracts.
- The user value is removing shell glue for project builds, not becoming a
  general linker.

Object-file and static-library production remain future object/linking
milestones. The reserved static-library manifest grammar does not weaken this
boundary.

## Project Graph Smoke Fixture

A split bare-metal fixture project has this shape:

```text
project-graph-smoke/
|-- wyst.project
|-- layout.wyst
`-- src/
    |-- boot.wyst
    |-- panic.wyst
    |-- uart.wyst
    |-- irq.wyst
    |-- mmu.wyst
    `-- allocator.wyst
```

The project should demonstrate project plumbing without adding runtime
semantics:

- boot entry and stack setup;
- UART output or semihosting exit path;
- exception vector or IRQ dispatch module;
- MMU/page-table setup module;
- tiny explicit allocator or bump-pointer example only if it can be expressed
  with existing language features.

## Diagnostics

The project-build surface has stable diagnostics for:

- directory build without `wyst.project`;
- missing required project or artifact clause;
- unknown or invalid contextual manifest clause;
- invalid module name in `root`;
- source root outside the project directory;
- invalid, escaping, or colliding `output` or `companion` paths;
- missing or mismatched named layout entry;
- target layout-owner mismatch or a missing owner-required layout form;
- duplicate normalized artifact, selector, or product identity;
- artifact product colliding with another project input or product;
- imported module not found under source roots;
- ambiguous module file across source roots;
- source `module` declaration mismatch;
- target profile unknown or incompatible with a module's exact target facts;
- selected target missing a module requirement or environment service;
- invalid or internally inconsistent selected target policy;
- selected static-library production being unavailable before either product
  is created or replaced;
- runner profile incompatible with the artifact's recorded executable
  environment or required-service contract;
- final emitted code violating an artifact verification clause;
- object-output request.
