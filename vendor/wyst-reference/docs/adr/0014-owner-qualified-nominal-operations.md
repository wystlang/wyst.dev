---
status: accepted
---

# Add owner-qualified nominal operations

Wyst accepts declarations such as
`pub fn Arena.allocate_value<T>(mut self: Arena, value: T)`. The declaration
identity has a module, an exact nominal owner, and an operation leaf. The
canonical identity is `module.Owner.operation`. The owner must be a concrete,
nongeneric nominal type declared in the same module. A public operation needs
a public owner. An operation leaf cannot collide with an owner field, enum
variant, or reserved compiler member.

An operation is receiver-enabled only when parameter zero is an explicit
`self` with the exact owner type. An operation without `self` is associated
only. For an exact nominal receiver, `value.operation(arguments...)`
elaborates before typed IR to `Owner.operation(value, arguments...)`. The
receiver is evaluated once and before the remaining arguments. Existing
parameter modes apply without adjustment: `mut self` needs an addressable
mutable place, and `var self` needs explicit `xfer`. Transfer is invalid for a
retained `mut self` receiver.

Lookup uses only the exact static nominal receiver identity. It does not use
autoref, autoderef, conversion, reborrow, interface search, extension lookup,
or overload resolution. A bound callable is not a receiver operation. Static
interfaces keep `Interface.operation(subject, ...)` syntax.

## Considered options

Extension methods would allow declarations outside the owner module. Generic
owners would require identity and materialization rules for owner instances.
Overloads would require a candidate set and argument-directed selection.
Implicit receiver adjustments would hide transfer and aliasing decisions.
These options are outside the current design.

## Consequences

Imports of an owner also expose its public operations under the imported owner
name. Type aliases and re-exports preserve the canonical owner identity.
WYSTIF revision 12 stores the structural owner, leaf, and canonical identity.
Generic definition records and archive indexes use the same identity. Receiver
calls lower as ordinary direct calls and add no typed-IR call category. The
leaves `load`, `store`, `slice`, `write`, and `len` remain reserved for compiler
members in this revision.
