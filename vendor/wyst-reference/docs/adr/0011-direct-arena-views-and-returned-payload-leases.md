---
status: accepted
---

# Use direct Arena views and returned payload leases

Wyst makes immediate typed Arena access an explicit fallible function call that
returns `Result<@T, ArenaFailure>`. The successful payload carries a static view
lease from the Arena, while a separate phantom-typed `ArenaRegion<T>` provides
durable validation with the existing runtime handle representation. Direct
allocations have no sequence record because they cannot be validated or
converted into a handle later. Wyst does not add Arena-backed `in` placement:
that syntax would add a fallible persistent local-storage category while still
requiring returned payload leases for durable recovery.

## Considered options

Returning both a view and a region would impose the 56-byte handle and indirect
result ABI on direct callers. Returning only a region would retain validation on
the common path. Arena-backed placement would require new declaration, lvalue,
initialization, invalidation, and failure-handling rules for one storage
provider. Keeping sequence records for direct allocations would consume backing
metadata that no later operation can use.

## Consequences

Callable contracts and WYSTIF identify returned leases by source parameter,
access, nominal result variant, and payload projection. The compiler
authenticates Arena allocation tokens, checkpoint frontiers, and transition
invalidation against sealed-core declarations. Runtime arithmetic, typed
initialization, durable records, accounting, and handle validation remain
ordinary checked sealed-core Wyst. Direct accesses add no pointer tag, borrow
counter, generation check, or hidden cleanup.
