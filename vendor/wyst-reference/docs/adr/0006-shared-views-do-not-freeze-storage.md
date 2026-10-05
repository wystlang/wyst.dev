---
status: accepted
---

# Keep shared views valid without freezing their contents

A Wyst shared read view guarantees live readable storage but does not freeze
its contents for the view's entire lease. A sequential mutation may occur
within an exclusive access window when it preserves the view's storage
identity, generation, and usable extent; a later read through the view observes
the later contents. Every other overlapping access is statically suspended
during that window. Unsynchronized concurrent mutation remains forbidden.

The opt-in `unchanged(storage)` callable guarantee is stronger than storage
preservation and permits exact-content reasoning across that call only. It does
not make a shared view immutable or freeze its backing contents for the rest of
the view lease. The guarantee covers every possible writer during the call,
including callbacks, concurrent agents, interrupts, DMA, and devices. It is
projection-sensitive: content facts survive only for observations proved
wholly contained in the named subobject or range, without freezing siblings.
Multiple named projections do not combine into a larger content-preserved
region, even when adjacent or overlapping.
For ordinary nonvolatile storage, the fact may support value reuse across the
call. It never permits elision, merging, substitution, or reordering of
volatile, MMIO, or atomic access events.
Those qualified projections may still carry the fact when authenticated
exclusion or provider knowledge proves their representation unchanged, but the
fact supplies no synchronization or happens-before relation.

## Considered options

Rust-style shared-reference freezing makes strong alias-based optimization
possible but rejects useful low-level patterns where a stable buffer is
updated between reads. Unrestricted overlapping mutation would obscure which
access is authoritative and would not support the existing affine mutation
model. Separating storage validity from sequenced content mutation preserves
memory safety while keeping both responsibilities explicit.

## Consequences

The compiler cannot treat bytes reached through a shared view as invariant
across a preserving mutation boundary or hoist their loads across that
boundary. Binding a view with `const` freezes the descriptor binding, not its
backing contents. A call's exclusive window ends on return; a stored mutation
view's window ends at its path-sensitive last use. Concurrency still requires
the existing synchronization and sendability proofs; storage preservation
alone provides neither. Independent exclusive windows may coexist only where
static structure or source-visible control flow proves their projections
disjoint. Callable contracts retain proved disjointness among returned views
so that safe partitioning abstractions remain usable across separate
compilation and indirect calls. Callable types and bodyless boundaries spell
that relation as `disjoint(result.projection, ...)`; body-bearing Wyst
functions infer it.

A shared view is positional unless its abstraction separately authenticates
logical element identity. A storage-preserving edit can move or replace
contents while the view remains usable, so a later read can observe a different
logical value at the same position. An API that promises stable logical
identity must provide an identity-bearing handle and specify its removal,
reuse, and invalidation rules separately.
