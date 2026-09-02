---
status: accepted
---

# Make external storage authority explicit and traceable

Wyst will treat ordinary `@T` and `[]T` values as contracts backed by static
storage provenance, not as unchecked interpretations of address-shaped bits.
Raw machine boundaries construct external storage only through compiler-owned
`trusted_slice<T>(raw, elements = n)` and
`trusted_mut_slice<T>(raw, elements = n)` operations. These operations check
the machine-verifiable alignment and address-end conditions, return a
must-observe typed failure, and explicitly assert the remaining storage,
initialization, lifetime, and sharing facts under the `external_storage` trust
category.

## Considered options

Implicitly treating every typed address or descriptor as live storage would
preserve C-like convenience but make extent and lifetime unverifiable.
Reserving pointer bits or consulting an ambient allocation table would add a
runtime protocol that conflicts with ADR 0003. General trusted blocks would
hide which assertion creates authority and make transitive auditing depend on
control-flow reconstruction.

## Consequences

Typed authority is non-widening: subslices and field projections retain only
their proven subobject extent, while conversion to integer bits discards
authority. Shared and exclusive external views are distinct; exclusive views
are affine and both forms are function-scoped unless tied to an explicit
owner/provider. Callable values and bodyless declarations publish a
`trusts(...)` upper bound, with omission meaning `trusts(none)`; body-bearing
Wyst functions infer their transitive trust. Structural trust cannot be
suppressed by annotation or artifact policy.

Machine ABIs must carry invalid sentinels as raw integers. In particular, the
ARM64 target entry receives `dtb: u64 in x0`, checks `dtb == 0`, validates the
FDT header through a bounded trusted view, and only then creates the complete
view. A plain `@T` never carries null or another invalid sentinel; optional
typed addresses use `Option<@T>`.
