---
title: "Modules and Symbol Boundaries"
group: reference
section: language
order: 110
summary: "Module identity, imports, visibility, and native symbol boundaries."
---

# Modules and Symbol Boundaries

This reference defines modules, imports, visibility, and symbol boundaries.
Project source discovery is in [Project Builds](project-builds.md).
Target declarations are in [Target Profiles and Requirements](target-profiles.md).
Artifact layout syntax is in [Named Layouts and Placement](named-layouts-and-placement.md).

## Modules

Each project source file must contain exactly one module declaration.
The declaration uses `module PATH`.

A module path is a dot-separated sequence of identifiers.
Identifiers are case-sensitive.

<!-- wyst-contract: fmt -->
```wyst
module platform.timer

pub fn ticks() -> u64 {
  return 0
}
```

Multiple files can declare the same module.
The build system treats those files as module part files.

All part files for one module must use the same module path.

Dots do not create parent visibility.
They only form the module identity.

Project source cannot declare `core` or a path below `core`.
The compiler owns that sealed package.

## Module Imports

An import must follow a module declaration.
It must precede top-level declarations in that module part.

Wyst supports whole-module imports and selective imports:

<!-- wyst-contract: fmt -->
```wyst
module application

import core.arch { cpu }
import drivers.uart
import platform.clock as clock
import platform.time { Instant, now as current_time }

pub import public.errors { Error }
```

The formatter orders module imports into private `core.*`, private project, and
public re-export sections. It separates each non-empty section with one blank
line and sorts module paths within each section.

A whole-module import uses the final path component as its qualifier.
For example, `import drivers.uart` provides `uart.NAME`.

An `as` clause changes the qualifier.
A whole-module alias cannot have a selection list.

A selective import adds named public declarations to bare scope.
Each selection can have an alias.

Import scope belongs to the module part that declares it.
Every semantic pass, including transitive effect inference, resolves names in
that exact part's import scope.

Selection lists must not be empty.
Wildcard imports are not supported.

The compiler rejects self-imports and duplicate module imports.
It also rejects missing modules and non-public selections.

Import names must not collide with declarations, namespaces, or other imports.
Published layout symbols also reserve their bare names.

A public `register_map` can be imported as a nominal type and hardware schema.
A public placed register-map `mmio` declaration can be imported as a value of
that type. Its semantic module interface retains the exact map identity,
placement origin, and target requirements. Importing a private placement is rejected;
importing a public placement does not convert it to raw address authority.

### Import Groups

Parentheses group module imports:

<!-- wyst-contract: fmt -->
```wyst
module application

import (
  drivers.uart as uart,
  platform.time { Instant, now },
)

pub import (
  public.errors { Error },
  public.status,
)
```

An import group must contain at least one entry.
Commas separate entries.
A trailing comma is optional.

One leading `pub` applies to the complete group.
An entry cannot contain its own `pub` modifier.

Grouping does not change import semantics.
The formatter preserves grouped and standalone forms.

### Sealed Core Imports

Sealed `core` modules use the same import grammar.
Each sealed namespace defines its accepted import shapes.

Some namespaces accept selective imports.
Some namespaces accept private whole-module imports.
The compiler rejects every other shape.

The selected target can also restrict a sealed environment service.
Importing the service does not create that target capability.

## Source Visibility

`pub` makes a declaration visible to importing Wyst modules.
A private declaration remains inside its declaring module.

`pub import` re-exports public declarations.
A selective re-export can change the exposed name.

A whole-module re-export exposes all public members of the imported module.
Re-exported names must not collide.

`pub` affects only Wyst source visibility.
It does not create a native linker symbol.

Static interfaces share the top-level declaration namespace with nominal
types. Their operations occupy a namespace owned by the interface. Imports,
aliases, and public re-exports use the ordinary declaration rules.

A static-interface implementation is declared only in its subject type's
owning module and has no `pub` modifier. Cross-module consumption is derived
from public interface and subject visibility. Import scope never changes which
implementation a concrete subject selects. See [Interfaces and
Implementations](interfaces-and-implementations.md).

## Native Symbol Boundaries

Native symbol declarations are separate from module imports.

<!-- wyst-contract: fmt -->
```wyst
module boundary

import symbol "errno" as errno: @i32

export value as symbol "wyst_value"

fn value() -> u64 {
  return 7
}
```

`import symbol "NAME" as LOCAL: TYPE` declares a required native symbol.
The linker name must be a nonempty, single-line UTF-8 string.

A code symbol type must be an `extern "C"` function-pointer type.
A data symbol type must be an address type.

Weak symbol imports are not supported.
The final static ELF build rejects unresolved native imports.

`export DECLARATION` exports a strong native symbol.
`export weak DECLARATION` exports a weak native symbol.

`as symbol "NAME"` sets the exact native spelling.
One declaration can have multiple distinct export aliases.

Only locally declared functions, labels, and ordinary mutable globals can be exported.
An imported or re-exported Wyst declaration cannot be exported.

A concrete generic function export must include its type arguments.
It must also include an explicit native alias.

Native export spellings must be unique.
`pub` and `export` remain independent.
