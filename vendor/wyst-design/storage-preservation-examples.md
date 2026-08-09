---
title: "Storage-Preservation Examples"
group: appendix
order: 720
summary: "Executable accepted, rejected, explained, and zero-runtime storage-preservation examples."
---

# Storage-Preservation Examples

The documentation test runs these seven examples through project `wync check`.
The test also runs the report examples through `wync explain storage`.
The output excerpts omit temporary paths and source coordinates.

Storage guarantees are compile-time callable postconditions. They do not create
ownership transfer, synchronization, publication, progress, delivery,
fairness, deadlock freedom, or protocol completion. A nominal result variant is
returned data, never an implicit message. Runtime-work accounting below is for
the proof itself; source-authored guards, checked operations, and calls retain
their ordinary cost.

## 1. Accepted Preserved Projection

The dependent view is backed by `pair.left`, exactly the projection retained by
the callable. `preserves` keeps its usable storage identity but does not promise
unchanged bytes.

<!-- wyst-contract: check-pass -->
```wyst
module storage_example_accepted

struct Buffer { bytes: [2]u8 }
struct Pair { left: Buffer right: Buffer }

fn bytes(buffer: Buffer) -> []u8 from buffer {
  return buffer.bytes[..]
}

extern "C" fn inspect(pair: Pair)
accesses(mut pair)
preserves(pair.left)

fn first(pair: Pair) -> u8 {
  const view = bytes(pair.left)
  inspect(pair)
  return view[0]
}
```

Checked result:

```text
$ wync check <documentation-project>
exit status: 0
stdout: empty
stderr: empty
```

The proof adds no runtime work. The authored external call remains an ordinary
call; no communication or synchronization is synthesized.

## 2. Outcome-Gated Saved-Result Refinement

The call makes `view` unavailable until the saved result is refined to
`.Kept`. Refining another result or reassigning `status` would not establish the
postcondition.

<!-- wyst-contract: check-pass -->
```wyst
module storage_example_outcome

enum Status { Kept Moved }
struct Buffer { bytes: [2]u8 }

fn bytes(buffer: Buffer) -> []u8 from buffer {
  return buffer.bytes[..]
}

fn first_if_kept(
  mut buffer: Buffer,
  callback: fn(mut Buffer) -> Status
  preserves(parameter(0)) on .Kept,
) -> u8
{
  const view = bytes(buffer)
  const status = callback(buffer)
  if status is .Kept {
    return view[0]
  }
  return 0
}
```

Checked result:

```text
$ wync check <documentation-project>
exit status: 0
postcondition available only in the matching .Kept branch
proof runtime work: none
```

The branch is source-authored result handling, not a hidden validity check or a
message receive.

## 3. An Overlapping Possible Write Is Rejected

The callable may write the whole `Pair`, but its guarantee covers only `left`.
The possible write to `right` overlaps the live view and therefore invalidates
it.

<!-- wyst-contract: check-fail -->
```wyst
module storage_example_overlap_rejection

struct Buffer { bytes: [2]u8 }
struct Pair { left: Buffer right: Buffer }

fn bytes(buffer: Buffer) -> []u8 from buffer {
  return buffer.bytes[..]
}

fn rejected(mut pair: Pair, callback: fn(mut Pair) preserves(parameter(0).left)) -> u8 {
  const view = bytes(pair.right)
  callback(pair)
  return view[0]
}
```

Checked diagnostic excerpt:

```text
error[E0253]: storage proof question failed: projection containment
note: required backing projection: pair.right
note: available guaranteed projections: pair.left
help: declare preserves or unchanged for the projection that contains the complete dependent view
```

Compilation rejects the source before artifact output, so this failed proof has
no runtime or lowering cost.

## 4. Mutable Boundary Rejected and Explicitly Repaired

A mutable parameter cannot be the stable identity of a call-entry range. The
compiler rejects it and names the source-visible repair; it never invents a
hidden snapshot.

<!-- wyst-contract: check-fail -->
```wyst
module storage_example_mutable_boundary_rejection

struct Buffer { bytes: [4]u8 }

fn rejected(
  mut buffer: Buffer,
  mut limit: u64,
  callback: fn(mut Buffer, u64)
  preserves(parameter(0).bytes[0 ..< parameter(1)]),
)
{
  callback(buffer, limit)
}
```

Checked diagnostic excerpt:

```text
error[E0253]: storage proof question failed: stable call-entry boundary identity
help: declare an explicit const snapshot and use that same name for validation and the call
```

The repair makes the chosen value explicit and uses the same immutable identity
for the guard and call:

<!-- wyst-contract: check-pass -->
```wyst
module storage_example_mutable_boundary_repair

struct Buffer { bytes: [4]u8 }

fn repaired(
  mut buffer: Buffer,
  mut supplied_limit: u64,
  callback: fn(mut Buffer, u64)
  preserves(parameter(0).bytes[0 ..< parameter(1)]),
)
{
  const frozen_limit: u64 = supplied_limit
  if frozen_limit <= 4 {
    callback(buffer, frozen_limit)
  }
}
```

```text
$ wync check <documentation-project>
exit status: 0
hidden snapshot count: 0
```

`frozen_limit` is an ordinary source value. The proof adds no allocation,
descriptor, borrow state, copy, or synchronization.

## 5. Canonical Open Fixed-Array Range

For the `[4]u8` field, `parameter(0).bytes[parameter(1) ..]` and
`parameter(0).bytes[parameter(1) ..< 4]` are one callable identity. Dynamically
sized storage must instead supply an explicit immutable end.

<!-- wyst-contract: check-pass -->
```wyst
module storage_example_open_fixed

struct Buffer { bytes: [4]u8 }

fn canonical(
  actual: fn(mut Buffer, u64)
  preserves(parameter(0).bytes[parameter(1) ..]),
)
{
  const normalized: fn(mut Buffer, u64)
  preserves(parameter(0).bytes[parameter(1) ..< 4]) = actual
}
```

Checked result:

```text
$ wync check <documentation-project>
exit status: 0
open and explicit-end callable identities: equal
```

The static end is canonical compiler identity, not a runtime projection
descriptor.

## 6. Matching `wync explain storage` Output

This direct call produces one accepted whole-parameter preservation event.

<!-- wyst-contract: check-pass -->
```wyst
module storage_example_explain

struct Buffer { bytes: [2]u8 }

fn bytes(buffer: Buffer) -> []u8 from buffer {
  return buffer.bytes[..]
}

extern "C" fn inspect(buffer: Buffer)
accesses(mut buffer)
preserves(buffer)

fn first(buffer: Buffer) -> u8 {
  const view = bytes(buffer)
  inspect(buffer)
  return view[0]
}
```

Stable text-report excerpt:

```text
$ wync explain storage <documentation-project> --format text
storage preservation proofs [basis=compiler-proved-semantic-identity]
caller=storage_example_explain.first callable=direct:storage_example_explain.inspect guarantee=preserves outcome=unconditional projection=parameter(0)
availability=retained generation=current raw-storage-epoch=not-applicable
runtime-work=none
```

The renderer consumes the same structured semantic identity used for
enforcement. It does not authorize the call or infer a guarantee from spelling.

## 7. Explicit Zero-Runtime Accounting

The source retains a whole-parameter dependent view across an authored external
call. The preservation proof contributes no extra runtime representation or
operation.

<!-- wyst-contract: check-pass -->
```wyst
module storage_example_no_runtime

struct Buffer { bytes: [2]u8 }

fn bytes(buffer: Buffer) -> []u8 from buffer {
  return buffer.bytes[..]
}

extern "C" fn inspect(buffer: Buffer)
accesses(mut buffer)
preserves(buffer)

fn first(buffer: Buffer) -> u8 {
  const view = bytes(buffer)
  inspect(buffer)
  return view[0]
}
```

Checked accounting:

```text
storage proof runtime work: none
pointer or projection metadata fields added: 0
hidden allocation, copy, borrow state, or validity branches added: 0
synthesized communication or synchronization operations added: 0
IR and optimizer-input delta after removing explanation-only proof records: 0
```

The storage report establishes `runtime-work=none` for the preservation proof.
It does not state the machine cost of the authored call.

These examples show the call-site rules.
They do not define all lifetime, invalidation, or raw-storage behavior.
