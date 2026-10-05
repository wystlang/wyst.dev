---
status: accepted
---

# Enforce memory safety without ambient runtime metadata

Wyst will make memory safety an unconditional ordinary-language guarantee
through static storage provenance, affine authorities, leases, initialization
tracking, concurrency proofs, and source-visible checked operations. It will
not make safety an artifact profile, reserve virtual-address bits for the core
guarantee, or require a shadow allocation table, garbage collector, hidden
generation counter, or other ambient runtime service. Ordinary addresses keep
their native one-word representation; slices, arenas, allocators, handles, and
other abstractions may carry or own explicit metadata as part of their visible
contracts.

## Considered options

Pointer generation bits plus side metadata offered dynamic stale-reference
detection, but imposed hidden memory accesses, a non-native pointer protocol,
virtual-address restrictions, allocator synchronization, and ABI adaptation.
Artifact-selected safety retained machine freedom but made the language's
semantic guarantee depend on build policy. Leaving memory safety entirely to
programmer convention preserved the current lowering model but did not meet the
accepted safe-by-default goal.

## Consequences

An ordinary memory operation must have compiler-proved bounds, extent,
alignment, initialization, lifetime, aliasing, and concurrency obligations, or
source must use an explicit checked operation with typed failure. The compiler
does not silently insert a trap, side-table lookup, reference count, allocation,
or synchronization operation. Raw-address construction, MMIO, DMA, foreign
contracts, and checked assembly remain explicit trusted machine boundaries.
Address tags, MTE, PAC, and allocator-specific generations
remain optional mechanisms outside the core semantic guarantee.

The compiler now satisfies this ADR for its implemented safe subset. Ordinary
accesses require complete static proof;
traceable provenance, initialization, lifetime, aliasing, ownership, and
data-race obligations are unconditional. Explicit machine and provider
boundaries retain finite structural trust categories rather than acquiring
ordinary safe authority. Exhaustive compiler tests classify every
memory-capable surface, verified-IR and final-artifact checks preserve those
facts through lowering, and the release gate exercises the tracked positive
and negative corpus. An unclassified memory-capable surface or failing safety
invariant withdraws the claim until it is fixed.
