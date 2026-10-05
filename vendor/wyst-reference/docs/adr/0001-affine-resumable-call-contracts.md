---
status: accepted
---

# Separate affine access, transfer, and resumable control

Wyst models an affine callable boundary with an independent access ceiling
(`identify`, `read`, or `mutate`) and retained or `consume` authority
disposition, requires consumption to remain visible at ordinary call sites,
and records stable returned-view provenance separately with `from`. Persistent
stackless execution uses declaration-associated `resumable fn` frames and
unique affine activation authorities over explicit caller storage rather than
an `async fn`, future, task, continuation, native-stack capture, or hidden
runtime. This separation keeps aliasing, ownership loss, storage lifetime,
cross-agent transfer, and cancellation independently checkable without a
closed reference-capability lattice.

## Considered options

`borrow` versus `consume` alone could not distinguish shared reads from
exclusive mutation across separate compilation. Treating `read`, `mutate`,
`identify`, and `consume` as peer modes instead conflated access with transfer.
An ordinary function-pointer effect could not bound or address a suspended
child frame, so the first implementation admits only direct acyclic suspending
helper chains and defers a distinct bounded indirect stackless ABI.

## Consequences

Consuming callable arguments use `consume expression`, while `await request`
is already an unambiguous consuming observation operation. Exported returned
leases spell their access and origin, resumable lifecycle transitions consume
one state authority and return at most one successor, frame storage remains
pinned and generation-checked, and cross-agent activation transfer still needs
recursive sendability plus explicit publication.
