---
status: accepted
---

# Add declared direct forwarding for stored Result errors

Wyst permits postfix `?` on an authentic `core.collections.Result<T, E>` when
the lexical return type is another authentic `Result`. Equal error types pass
through unchanged. A different error type can be widened only when its enum
declares one direct `Variant(from E)` payload. The operation preserves the
complete error value and follows the same resource, storage, cleanup,
postcondition, and lexical-return rules as a handwritten `match`.

The `from` marker is declaration metadata. It does not change enum layout, ABI,
abilities, effects, or trust. A marked variant has exactly one inhabited,
fixed-layout movable payload, and each concrete source type has at most one
marked destination variant. The compiler checks uniqueness after generic
materialization. An opaque enum exposes this relation only in its owner module;
public non-opaque enums carry it in their authenticated semantic module
interface. Stored result forwarding and interactive exact failure forwarding
remain separate: neither converts into the other, and a stored resource-bearing
result still requires explicit `xfer`.

## Considered options

Structural inference would make an unmarked payload a conversion contract.
Transitive search would make behavior depend on a graph outside the declaration.
Arbitrary conversion functions could add effects and hidden policy. Error-set
unions would add a second sum-type model. Wyst rejects these alternatives and
uses one explicit, direct enum wrapping step.

## Consequences

`Variant(from Type)` becomes public semantic API for a public visible variant.
Adding or removing the marker changes the declaration surface and invalidates
dependent generic materializations. The same direct relation also supports the
explicit `embed<T>(value)` conversion, which rejects exact source and target
types as redundant.
