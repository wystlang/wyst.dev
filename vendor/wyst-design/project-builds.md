---
title: "Project Builds"
group: reference
section: projects-targets
order: 310
summary: "Project input modes, manifests, source discovery, artifact selection, and outputs."
---

# Project Builds

This reference defines the inputs and outputs of `wync build`.
It also defines the `wyst.project` manifest.

Module and import syntax is in [Modules and Symbol Boundaries](modules-and-symbol-boundaries.md).
Target profiles are in [Target Profiles and Requirements](target-profiles.md).
Artifact encoding is in [Artifact and Object Formats](artifact-and-object-formats.md).

## Build Input Modes

`wync build` has project mode and explicit input mode.

### Project Mode

Give the command a project directory or its manifest:

```sh
wync build path/to/project
wync build path/to/project/wyst.project
wync build path/to/project --artifact smoke
```

A project directory must contain `wyst.project` directly.
The compiler does not search parent directories.

The manifest selects the target, layout, output, and default artifact.
Use `--artifact NAME` to select a different artifact.

Project mode rejects `--target`.
Project mode also rejects an `-o` output override.

### Explicit Input Mode

Give the command one or more source files:

```sh
wync build src/boot.wyst \
  --source-root src \
  --layout layout.wyst \
  --target qemu-virt-aarch64-el2 \
  -o build/kernel.elf
```

Explicit input mode requires `--layout` and `-o`.
`--target` is optional.

For one input file, the compiler treats that file as the root module.
The compiler then discovers imported modules.

If `--source-root` is absent, the root file directory is the source root.
Only the named root file contributes to the root module in this form.

If `--source-root` is present, the root module uses directory part-file rules.
Each imported module also uses those rules.

For multiple input files, the compiler uses the exact command-line list.
The compiler does not discover an import closure for that list.

The compiler rejects `-c` and `--emit-object`.
The build command does not write standalone object files.

A root source file must declare its module:

<!-- wyst-contract: fmt -->
```wyst
module boot

fn value() -> u64 {
  return 1
}
```

## Project Manifest

`wyst.project` contains one `project` declaration.
The declaration is closed syntax.
Unknown clauses are errors.

A project requires these members:

- one project name;
- one or more `source_root` clauses;
- one `default` artifact name;
- one or more artifact declarations.

This manifest defines one final executable artifact:

```text
project example {
  source_root "src"
  default app

  executable app for "qemu-virt-aarch64-el1" {
    root app.root
    output "build/app.elf"
    layout app from "layout.wyst"

    debug .none
    unwind .none
    frame_pointers .minimal
  }
}
```

Project and artifact names can be identifiers or quoted strings.
Artifact names must be unique within the project.
`default` must name an artifact in the same project.

### Artifact Kinds

The manifest accepts four artifact kinds:

| Kind | Primary output | Additional required clause |
| --- | --- | --- |
| `executable` | final static ELF | `layout NAME from "PATH"` |
| `benchmark` | final static ELF | `layout NAME from "PATH"` |
| `fixture` | final static ELF | `layout NAME from "PATH"` |
| `static_library` | GNU archive | `companion "PATH"` |

Every artifact requires these clauses:

- `root MODULE`;
- `output "PATH"`;
- `debug .none`, `.line_tables`, or `.full`;
- `unwind .none` or `.tables`;
- `frame_pointers .minimal` or `.all`.

The artifact header requires one installed target profile.
The selected profile supplies target facts for the complete artifact.

All installed target profiles have artifact-owned layout.
Therefore, each final static ELF requires `layout NAME from "PATH"`.

The grammar also recognizes `layout .environment`.
No installed target profile accepts that form.

A `static_library` requires `companion "PATH"`.
It rejects `layout`, `entry`, and `runner` clauses.

### Optional Artifact Policy

An artifact can contain one `hardening` block.
The block accepts only `address_alignment .enabled`.

An artifact can contain one `safety` block.
Each selected category takes `.warning` or `.error`.

The accepted safety categories are:

- `raw_address`;
- `external_storage`;
- `raw_callable`;
- `relensing`;
- `qualifier_retagging`;
- `uninitialized_access`;
- `foreign_assertion`;
- `naked`;
- `stack_contract`;
- `shared_mutation`;
- `privileged_operation`.

Omitted hardening and safety entries do not select a policy.
Duplicate blocks or duplicate entries are errors.

The language reference topics define the effects of these policies.
The manifest only selects them for the artifact.

### Code Verification

An artifact can contain one `verify` block.
Each `code` clause selects one module-qualified function or label.

A concrete generic selector must include all type arguments.
Each selector must contain at least one constraint.

The accepted constraints are:

- `instructions N`;
- `families [LIST]`;
- `bytes [LIST]`;
- `prologue .present` or `.absent`;
- `spill_slots N`;
- `veneers N`.

`bytes` cannot occur with `instructions` or `families`.
A static library rejects `bytes` and `veneers`.
Those constraints require final placement.

Verification checks emitted code.
Verification does not change emitted code.

### Manifest Paths

Manifest paths are relative to `wyst.project`.
Absolute paths are errors.
Paths must not escape the project directory.

Each source root must resolve inside the project directory.
Two source roots must not resolve to the same directory.

Artifact products must not overwrite project inputs.
Artifact output and companion paths must not collide.

The compiler creates parent directories for accepted output paths.
Each project output remains inside the project directory.

## Module Closure And Source Discovery

The artifact `root` names the first module in the module closure.
The compiler follows module imports from that root.
Unrelated files under a source root do not enter the closure.

The compiler maps module names to source paths as follows:

```text
boot          -> SOURCE_ROOT/boot.wyst
drivers.uart  -> SOURCE_ROOT/drivers/uart.wyst
```

An anchor file must declare the requested module name.
Exactly one source root must contain the anchor.
Missing and ambiguous anchors are errors.

After the compiler finds an anchor, it reads its directory.
Regular, non-hidden `.wyst` files can contribute part files.

A part file contributes only when it declares the requested module.
Files for sibling modules do not contribute.

The compiler ignores the selected layout and artifact products during discovery.
The compiler rejects symlinked Wyst source files.

The compiler orders part files by normalized path.
It visits imported modules in first-encounter breadth-first order.

A `verify` selector also creates a source-discovery root.
Modules named by its concrete type arguments also enter discovery.

## Artifact Production

`executable`, `benchmark`, and `fixture` use the same final-link pipeline.
The pipeline writes one static AArch64 ELF file.

The compiler builds one native object and semantic interface for each module.
These module products remain internal during a final artifact build.

`static_library` writes a deterministic GNU archive of Wyst native objects.
It also writes the required `.wystlib` semantic-interface companion.

The archive and companion form one output pair.
The compiler does not expose a general external-object linker through `wync build`.

`wync build` does not add a flat binary as a project output. Run the separate
binary export after a successful executable build when a loader needs it:

```text
wync objcopy --output-target binary build/kernel.elf build/kernel.Image
```

The ELF remains the primary artifact and the source of the exported load
bytes.

## Build Failures

The compiler stops artifact production for invalid project input.
Common failures include:

- a missing manifest;
- a missing or duplicate required clause;
- an unknown artifact or target profile;
- an invalid source root or output path;
- a missing or ambiguous module anchor;
- a module-name mismatch;
- a missing selected layout;
- a target and layout-owner mismatch;
- an invalid code-verification selector;
- an output collision;
- an unsupported object-output request.
