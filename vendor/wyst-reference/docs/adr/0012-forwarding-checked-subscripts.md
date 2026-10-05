---
status: accepted
---

# Add forwarding checked subscripts

Wyst adds `values[?index]` and the bounded slice forms
`values[?lower..<upper]`, `values[?lower..]`, and `values[?..<upper]`. The `?`
is inside the brackets because bounds failure belongs to the projection, while
a following postfix `?` can still forward a selected stored `Result`. A
forwarding checked subscript validates bounds and forwards `IndexFailure` or
`SliceFailure` through the lexical authentic `Result`; it does not produce a
result value. Ordinary subscripts remain proof-required so source does not hide
control flow or validation cost, and Wyst adds no trapping shorthand.

The compiler lowers these forms through the existing authenticated
`core.checked.index` and `core.checked.slice_range` operations and the existing
stored-result forwarding path. The base descriptor and bounds are evaluated
once in source order. A failure forms no address and performs no memory access.
`core.checked` remains available when code needs local recovery or a reusable
proof instead of lexical forwarding.

## Considered options

Postfix `values[index]?` would conflict with forwarding a selected `Result` and
would make the checked projection indistinguishable from result forwarding.
Returning a `Result` would prevent direct use as a place and duplicate
`core.checked`. A trapping form would add an implicit fatal policy. Treating
the form as ordinary indexing would lose its terminal control-flow identity in
compiler traversal and serialized generic bodies.

## Consequences

The AST and semantic interface use distinct forwarding checked index and slice
forms. Only the bounds obligation becomes proved; extent, alignment,
initialization, lifetime, aliasing, access authority, and concurrency remain
independent. Cleanup, typed-storage exits, postconditions, and one-step declared
error wrapping use the stored-result forwarding contract from ADR 0010.
