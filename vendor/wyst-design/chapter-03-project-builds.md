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
- Dynamic linking, external object linking, archive libraries, or partial link
  outputs.
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

`wyst.project` uses a small line-oriented key/value format with quoted strings
and string lists:

```text
name = "project-graph-smoke"
root = "boot"
source_roots = ["src"]
layout = "layout.wyst"
target = "qemu-virt-aarch64-el2"
target_arch = "arm64-v8a"
target_cpu = "generic"
target_el = "2"
output = "build/image.elf"
```

Required fields:

| Field          | Meaning                                                         |
| -------------- | --------------------------------------------------------------- |
| `name`         | Human-readable project name for diagnostics and provenance.     |
| `root`         | Root module name, not a file path.                              |
| `source_roots` | Ordered list of directories searched by module-name convention. |
| `layout`       | Layout module path relative to the project file.                |
| `output`       | Output ELF path relative to the project file.                   |

Optional target fields:

| Field               | Meaning                                                       |
| ------------------- | ------------------------------------------------------------- |
| `target`            | Named target profile for the build.                           |
| `target_arch`       | Same value accepted by `#target(... arch = ...)`.             |
| `target_cpu`        | Same value accepted by `#target(... cpu = ...)`.              |
| `target_el`         | Same value accepted by `#target(... el = ...)`.               |
| `target_cache_line` | Same value accepted by `#target(... cache_line = ...)`.       |
| `target_features`   | String list equivalent to `#target(... features = (...))`.    |

These fields are build selections or selected target facts, not reusable source
requirements. A library that needs an ISA extension should write
`#requires(features = (...))`; the project decides which compatible CPU,
tuning model, executable environment, object format, loader, device map,
exception-level entry, and platform services provide those requirements.

The target section is optional only for non-artifact analysis such as project
checks. Project artifact builds, release evidence, rebuild benchmarks,
generated manifests, and explain reports require either a named `target` or
explicit target facts before they compute final legality, layout, or generated
bytes. A project may use only a named `target`, only explicit target facts, or
both. When both are present, explicit facts must agree with the named profile.
Reports record the provenance of each selected target fact and include a build
identity that changes when an explicit target fact changes.

Wyst rejects unknown manifest keys. This keeps spelling mistakes from
silently becoming ignored build metadata.

Path-valued manifest fields (`source_roots`, `layout`, and `output`) must be
relative to the project file. Absolute paths are rejected. Source roots are
also required to resolve inside the project directory.

## Module To File Mapping

Source imports stay semantic:

<!-- wyst-contract: sketch -->
```wyst
#module boot

#import (
  drivers.uart
  panic
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
- The anchor file's `#module` declaration must exactly match the requested
  module name.
- A module is directory-anchored. Once the resolver finds the anchor, every
  regular, non-hidden `.wyst` file in that anchor directory participates as a
  controlled part file, except build-owned ignored paths such as the selected
  layout file. Each participating file must declare the requested module.
- If a requested module maps to more than one existing file across source
  roots, compilation fails with an ambiguous-module diagnostic.
- If no file exists for an imported module, compilation fails with a
  module-not-found diagnostic.
- Project mode follows the import closure from `root`. It does not compile all
  `.wyst` files under `source_roots`.
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
2. The root module is loaded first.
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
```

They correspond to the QEMU-oriented AArch64 static ELF baseline:

- `arch = arm64-v8a`
- `cpu = generic`
- exact `el = 1` or `el = 2`, matching the selected profile
- static AArch64 ELF output
- Wyst native ABI with AAPCS64 interop support
- executable environment `qemu-aarch64-semihost-v1`, offering exactly
  `a64-semihost-hlt-f000-v1`

The EL1 and EL2 baselines carry identical authenticated QEMU semihost,
runner-service, ABI, and measurement-counter contracts; only the exact entry
EL differs.

`qemu-virt-aarch64-el2-lse` carries the same QEMU executable-environment,
runner-service, ABI, and measurement-counter selections and additionally
provides the authenticated `lse` feature. Use that profile when a module's
exact `#target` tuple requires LSE; the baseline profile remains LSE-free.

The Raspberry Pi 4B QEMU profile is:

```text
qemu-raspi4b-aarch64-el2
```

It corresponds to the Raspberry Pi 4B QEMU smoke path:

- `arch = arm64-v8a`
- `cpu = cortex-a72`
- `el = 2`
- QEMU `raspi4b` board emulation
- static AArch64 ELF output converted to a `kernel8.img` handoff artifact
- PL011 UART0 at `0xfe20_1000` checked through `-serial stdio`
- executable environment `bare-aarch64-v1`, offering no environment services

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

The project manifest owns non-source image facts:

- `layout` names the layout module.
- `target` names the target profile.
- `output` names the emitted ELF.

The root source file should not hard-code output paths or project directories.
Layout exports remain available to source.

## Whole-Program Policy

The compiler stays whole-program. It emits one final static ELF and does not write
relocatable object files.

Reason:

- The compiler already performs final placement, relocation patching, symbol
  emission, and DWARF source-floor emission as one deterministic whole-program
  operation.
- Object output would require an explicit undefined-symbol model, serialized
  relocations, archive/library search policy, external linker policy, and
  partial debug-info contracts.
- The user value is removing shell glue for project builds, not becoming a
  general linker.

Object-file output remains a future object/linking milestone.

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
- missing required manifest field;
- unknown manifest key;
- invalid module name in `root`;
- source root outside the project directory;
- imported module not found under source roots;
- ambiguous module file across source roots;
- file `#module` mismatch;
- target profile unknown or incompatible project target facts;
- project target facts incompatible with a module `#target`;
- project target facts missing a module `#requires` capability;
- object-output request.
