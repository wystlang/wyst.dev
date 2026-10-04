---
title: "Effective Wyst"
group: guide
order: 5
summary: "Write clear Wyst programs with explicit types, failure policies, storage lifetimes, and machine boundaries."
---

# Effective Wyst

Good Wyst code makes its obligations visible. A reader should be able to find the
owner of storage, the operation that changes it, the failure a caller must handle,
and the boundary where code depends on a machine or external promise.

This guide explains how to combine Wyst features into clear programs. It takes its
example-led approach from [Effective Go](https://go.dev/doc/effective_go). The
recommendations and examples are specific to Wyst. Familiar syntax does not imply
the same arithmetic, allocation, interface, or concurrency behavior as another
language.

Start with the [Cheat Sheet](cheat-sheet.md) if the syntax is new. Use the [Style
Guide](style-guide.md) for spelling and formatting conventions and [Best
Practices](best-practices.md) for a compact review of systems boundaries. The
linked [reference topics](language-overview.md) define the language rules; this
guide recommends choices within those rules.

Each `wyst` code block is an independent, complete module. The final module API
example has three labeled files that form one project. Examples use the
`qemu-virt-aarch64-el2` static-library target; they are not bootable programs.
Project commands assume a directory with a `wyst.project` manifest. The final
section explains what compilation, reference execution, and target tests prove.

## Contents

- [Let tools settle formatting](#let-tools-settle-formatting)
- [Give a module one responsibility](#give-a-module-one-responsibility)
- [Use types to preserve meaning](#use-types-to-preserve-meaning)
- [Work with arrays, slices, and text](#work-with-arrays-slices-and-text)
- [Make mutation visible](#make-mutation-visible)
- [Keep the main path easy to follow](#keep-the-main-path-easy-to-follow)
- [Choose arithmetic policy explicitly](#choose-arithmetic-policy-explicitly)
- [Let the caller choose failure policy](#let-the-caller-choose-failure-policy)
- [Design storage lifetime with the API](#design-storage-lifetime-with-the-api)
- [Own resources through their complete lifetime](#own-resources-through-their-complete-lifetime)
- [Handle live outcomes explicitly](#handle-live-outcomes-explicitly)
- [Introduce abstraction when it names shared work](#introduce-abstraction-when-it-names-shared-work)
- [Keep hardware work at a clear boundary](#keep-hardware-work-at-a-clear-boundary)
- [Write the sharing protocol before the atomic operation](#write-the-sharing-protocol-before-the-atomic-operation)
- [Transform a bounded record](#transform-a-bounded-record)
- [Turn a local operation into a module API](#turn-a-local-operation-into-a-module-api)
- [Build evidence for the claim you make](#build-evidence-for-the-claim-you-make)

## Let tools settle formatting

Run the formatter as part of normal editing:

```sh
wync fmt .
wync fmt . --check
```

In project mode, the formatter covers the manifest, declared source roots, and
artifact layouts. Accept its indentation, import order, and line breaks. Spend
review time on the meaning of the code. When a formatted expression is still hard
to read, give an intermediate value a name that explains its role.

Choose names at the call site. `uart.write_byte` identifies both the device and
the action. A parameter named `timeout_ticks` identifies a unit that `n` would
hide. Use `snake_case` for operations and local values, `UpperCamelCase` for types
and enum variants, and `UPPER_SNAKE_CASE` for module constants. Capitalization
does not grant visibility; `pub` does.

A useful comment states an invariant, a storage lifetime, or a hardware
requirement. A comment that repeats an assignment adds a second place to keep the
same fact correct. Put enforceable facts in types and contracts, then use comments
to explain why they matter.

## Give a module one responsibility

Name modules after the domain they own: `protocol.frame`, `memory.allocator`, or
`drivers.uart`. A module is a useful boundary when it owns a coherent set of
decisions. A growing `common` module often means those decisions have no clear
owner.

Each project source file declares one module. Several part files can belong to
that module. Keep declarations private until another module needs them. Use a
whole-module import when the qualifier explains an operation, and a selective
import for types that remain clear without it:

```wyst
module effective.input

import core.checked
import core.collections { Result }

pub fn read_byte(bytes: noescape []u8, index: u64) -> Result<u8, checked.IndexFailure> {
  return .Ok(bytes[?index])
}
```

Here `Result` is useful vocabulary in the signature. `checked.IndexFailure`
retains the origin of the failure. There is no need to wrap that error until the
module has a domain distinction to add.

The `noescape` parameter permits a view of local storage because `read_byte`
does not retain it. This is a storage-lifetime promise; access rules still
apply. Use the same contract for other readers that finish with the input
during the call.

`pub` exposes a declaration to Wyst modules. A native linker symbol requires an
explicit `export`; foreign calling conventions have their own rules. Keep those
decisions at the external boundary. See [Modules and Symbol
Boundaries](modules-and-symbol-boundaries.md) and [ABI Specification](abi.md).

## Use types to preserve meaning

Two values can occupy the same number of bits and still be incompatible. A device
identity is not a block count. Give such concepts distinct types before they cross
several layers of code:

```wyst
module effective.quantities

type DeviceId: u64

numeric type BlockCount: u64

fn same_device(left: DeviceId, right: DeviceId) -> bool {
  return left == right
}

fn has_capacity(available: BlockCount, requested: BlockCount) -> bool {
  return requested <= available
}
```

A plain nominal carrier such as `DeviceId` permits same-type equality without
introducing arithmetic on identities. A `numeric type` opts into its carrier's
numeric operations and keeps the nominal type in the result. It does not add
overflow checks. Use the existing types in `core.quantities` when they already
express your unit or identity.

Use a struct for facts that belong together and an enum for alternatives. An enum
carries the data valid for its selected case. It avoids combinations such as
`accepted = true` with an unrelated `closed = true` flag:

```wyst
module effective.admission

enum Admission {
  Accepted(u64)
  Full
  Closed
}

fn should_retry(admission: Admission) -> bool {
  return match admission {
    .Accepted(_) { false }
    .Full { true }
    .Closed { false }
  }
}
```

The match names the retry policy for every alternative. If the protocol gains
another case, exhaustive matching makes the caller revisit that policy.

Use `opaque` when the declaring module must control construction or access to the
representation. Do not expose fields that callers must never change independently.
See [Type System](type-system.md).

## Work with arrays, slices, and text

### Construct complete values

Initialize a value in the form in which the next operation can use it. A struct
literal supplies every field exactly once. An ordinary binding always has an
initializer; a declaration without an initializer is not a request for zero-filled
storage. This makes the first valid state visible at the declaration.

When two modes need different initial states, choose between complete values with
an `if` expression or a constructor. Do not create a partially valid record and
rely on a later branch to repair it. Use a constructor when its name explains a
domain state, such as empty statistics, rather than just hiding a literal.

```wyst
module effective.data.initialize

struct Statistics {
  accepted: u64
  rejected: u64
}

fn empty_statistics() -> Statistics {
  return {accepted = 0, rejected = 0}
}

pub fn example() -> bool {
  const statistics = empty_statistics()
  const cleared: [4]u8 = [0; 4]
  const marker: [4]u8 = "OK"
  return statistics.accepted == 0 && statistics.rejected == 0 && cleared[3] == 0 && marker[2] == 0
    && marker[3] == 0
}
```

The two byte arrays illustrate different initialization rules. `[0; 4]` explicitly
repeats a value. The repeated expression is evaluated once and its value is
copied, so the element type must permit copying. A string literal in a fixed
byte-array context writes its decoded bytes and fills the remaining elements with
zero. Here `marker` contains `O`, `K`, zero, zero. That padding rule does not
extend to an arbitrary struct, local variable, or string view.

Use `[_]u8` on a direct literal binding when the literal should determine the
array length. Use an explicit length when the extent is part of the format,
hardware contract, or capacity decision. Neither form creates a growable array.

Reserve `MaybeUninit<T>` for operations that need raw storage and an explicit
initialization transition. It is not an alternative spelling for an ordinary
value. See [Type System](type-system.md#fixed-arrays) and [Bindings and
Assignment](functions-and-control-flow.md#bindings-and-assignment).

### Decide whether you need a copy or a view

A fixed array contains its elements. A slice describes a range of elements in
existing storage. This distinction matters when an operation must retain the
original bytes: copying an array of scalar elements supplies a snapshot, while
taking a slice keeps a relationship to the original storage.

```wyst
module effective.data.copy_view

pub fn example() -> bool {
  var source: [3]u8 = [10, 20, 30]
  const snapshot = source
  const view = source[..]
  source[1] = 99
  return snapshot[1] == 20 && view[1] == 99
}
```

After the assignment, `snapshot[1]` is still 20 and `view[1]` is 99. The array
copy and the source have separate element storage. The view reads the source's
current contents at that position. `const view` prevents changing that binding; it
does not turn the backing bytes into a snapshot.

Choose a view when a consumer should inspect the current buffer and the buffer can
remain valid for that use. Choose an explicit copy when the consumer must retain
old content or outlive the original backing storage. An array of integers is a
simple copy. An array or struct that contains slices also copies those
descriptors; their elements continue to live in their existing backing storage.
Copying an aggregate is not a recursive allocation and copy of everything
reachable through it.

The slice length is the accessible element count, not spare capacity. Making a
shorter slice neither allocates storage nor frees the excluded elements. There is
no implied append operation, capacity growth, or owner transfer. If an algorithm
must produce independent output, have the caller supply its destination and make
the copy explicit.

These are sequential observations. They do not authorize concurrent mutation or
let an alias bypass an active exclusive loan. See [Slices](type-system.md#slices)
and [Typed Addresses and Views](memory-model.md#typed-addresses-and-views).

### Compare the property you mean

Two slices can refer to different buffers that contain identical bytes. They can
also refer to the same starting address with different lengths. Decide whether
your question concerns the descriptor or the contents before choosing equality.

Slice `==` compares `data` and `len`. Use `core.bytes.equal` to compare the byte
sequences. A buffer's identity is useful for alias and bookkeeping decisions; it
is usually the wrong meaning for a packet signature, file header, or protocol
token.

```wyst
module effective.data.equality

import core.bytes

pub fn example() -> bool {
  var first: [_]u8 = "OK"
  var second: [_]u8 = "OK"
  const left = first[..]
  const right = second[..]
  return left != right && bytes.equal(left, right)
}
```

The two arrays have separate storage. Their views compare unequal as descriptors
and equal as content. Equal lengths alone would not establish content equality,
and content equality would not establish that the storage can be changed through
either alias.

The byte helpers also provide `starts_with`, `ends_with`, `find`, and `find_byte`.
Use an operation that states the actual question. A prefix check avoids pretending
that a longer input must equal its header. Search returns an explicit optional
byte offset, so offset zero remains a valid match. An empty needle matches at
zero; decide whether an empty search term is valid for the surrounding protocol.

These helpers read existing storage and allocate nothing. Keep the source valid
for the call. When an algorithm compares input before copying or editing it,
separately establish the destination bounds and any required non-overlap. A
successful comparison creates no new storage authority. See [Bundled Core
Library](core-library.md#corebytes-and-coretext) and
[Comparisons](operators-and-evaluation.md#comparisons).

### Validate bytes before treating them as text

Use bytes for a wire representation and `string` for a valid UTF-8 view. Receiving
a buffer from a file, device, or foreign function does not prove its encoding.
`core.text.from_bytes` checks the complete byte range and returns either a string
view or a failure with an offset and reason.

```wyst
module effective.data.text

import core.text

pub fn example() -> bool {
  const valid: [_]u8 = "caf\xc3\xa9"
  const invalid: [1]u8 = [0xff]
  const accepted = match text.from_bytes(valid[..]) {
    .Ok(value) { value.len == 5 }
    .Error(_) { false }
  }
  const rejected = match text.from_bytes(invalid[..]) {
    .Ok(_) { false }
    .Error(_) { true }
  }
  return accepted && rejected
}
```

The encoded word café occupies five bytes. The byte `0xff` cannot begin a valid
UTF-8 sequence. The two matches make those distinct outcomes observable. A parser
would normally retain the failure details for its caller; this example needs only
to establish that the invalid input is rejected.

Validation does not allocate a string or copy its bytes. The successful view still
depends on the original array. Keep that backing storage valid, and do not reuse
or mutate it in a way that breaks the live string's validity. A returned string
needs the appropriate storage-source contract just as a returned slice does.

`string.len` counts bytes. It does not count displayed characters or Unicode
scalar values. A string does not imply NUL termination. The zero padding of a
larger byte-array literal is a separate initialization rule; it does not add a
terminator to every string.

Use `core.text.equal` and related text helpers when their borrowing contracts fit
the source lifetime. Their content comparisons are byte-exact. They do not
normalize Unicode, fold case, or apply a locale. Two differently encoded sequences
can look alike without being byte-equal. If the protocol needs normalization or
case-insensitive comparison, that policy requires explicit work beyond UTF-8
validation. See [Strings](type-system.md#strings) and [Bundled Core
Library](core-library.md#corebytes-and-coretext).

### Make text boundaries part of slicing

A byte offset inside a valid string is not necessarily a place where another valid
string can begin or end. Use checked string slicing to establish both the range
and the UTF-8 boundaries. A raw byte slice only establishes a byte range.

In the string `AéZ`, `A` occupies byte zero, `é` occupies bytes one and two, and
`Z` occupies byte three. The range `1..<3` selects the complete encoded `é`. The
range `1..<2` cuts that encoding in half.

```wyst
module effective.data.text_slice

import core.collections { Result }
import core.text

fn text_range(value: string, lower: u64, upper: u64) -> Result<string, text.TextSliceFailure>
  from value on .Ok {
  return .Ok(value[?lower..<upper])
}

pub fn example() -> bool {
  const source = "A\xc3\xa9Z"
  const complete = match text_range(source, 1, 3) {
    .Ok(value) { text.equal(value, "\xc3\xa9") }
    .Error(_) { false }
  }
  const split = match text_range(source, 1, 2) {
    .Ok(_) { false }
    .Error(_) { true }
  }
  return complete && split
}
```

The successful result borrows from `value`, which is stated by `from value on
.Ok`. The caller gives the backing value a name before requesting the returned
view. This lets the compiler retain the exact source relation. The error
alternative carries no string view from that source.

`TextSliceFailure` distinguishes a reversed range, an out-of-bounds offset, and an
invalid lower or upper UTF-8 boundary. Preserve those distinctions when they help
identify malformed input. Do not turn a rejected text boundary into an unchecked
byte projection and call the result a string. If a byte-oriented protocol selects
the range first, validate that selected byte range before treating it as text.

There is no `string[?index]` form that returns one character. One byte is not
generally a Unicode scalar, and one scalar is not generally a displayed grapheme.
An API that takes positions should say whether they are byte offsets or some
higher-level text unit. See [Strings](type-system.md#strings) and [Forwarding
Checked Subscripts](functions-and-control-flow.md#forwarding-checked-subscripts).

### Return related observations together

Use a named result tuple when one operation naturally produces several
observations. The field names explain their roles at the boundary, while the
caller can either keep the tuple or destructure it. A minute count and the
remaining seconds belong to the same calculation; returning them together avoids a
second operation or a hidden output parameter.

```wyst
module effective.data.tuples

fn split_seconds(total: u64) -> (minutes: u64, seconds: u64) {
  return (total / 60, total % 60)
}

fn reverse(left: u64, right: u64) -> (first: u64, second: u64) {
  return (right, left)
}

pub fn example() -> bool {
  const time = split_seconds(125)
  var (left, right) = split_seconds(125)
  (left, right) = reverse(left, right)
  return time.minutes == 2 && time.seconds == 5 && left == 5 && right == 2
}
```

The result declaration names the fields, and the return expression supplies their
values in order. The caller can write `time.minutes` or bind both positions with
destructuring. Result names are not implicit local variables that a bare return
can recover. Every normal return must provide the declared result.

Tuple assignment evaluates the right side once and updates the existing mutable
targets together. The call to `reverse` therefore sees both original values before
either binding changes. It is useful for algorithms that advance a pair of state
variables as one step. A tuple literal is accepted here as a function return; use
a tuple-producing call or value for assignment rather than assuming every tuple
expression has an inferred field schema.

Use `_` in destructuring when an ordinary discardable position is deliberately
unused. An underscore does not authorize abandoning a resource that requires
resolution. If absence or failure is part of the operation, retain that in
`Option`, `Result`, or a suitable enum instead of inventing an ambiguous output
value.

Choose a struct when the result becomes a durable domain concept with its own
operations or invariants. Choose a tuple for a small set of related outputs whose
meaning is clear from the producing function. Named tuples require at least two
fields. See [Functions](functions-and-control-flow.md#functions) and [Bindings and
Assignment](functions-and-control-flow.md#bindings-and-assignment).

## Make mutation visible

Use `const` when a binding does not change. Use `var` for state that does, and
keep that state near the operation that changes it. A constant slice or address
does not make its backing storage immutable.

Wyst distinguishes reading, borrowing for mutation, and taking ownership. Choose
the parameter mode for the operation:

| Purpose | Parameter contract | Call-site decision |
| --- | --- | --- |
| Read a value | Unmarked parameter | Pass the value under its read rules |
| Change a caller's value | `mut T` | Loan a writable place with `mut value` |
| Take an owned mutable value | `var T` | Transfer a resource with `xfer value`; copyable values can be copied |

An operation associated with a nominal type can keep construction and mutation
close to that type:

```wyst
module effective.selection

opaque struct Selection {
  enabled: bool
}

fn Selection.create(enabled: bool) -> Selection {
  return {enabled}
}

fn Selection.enable(self: mut Selection) {
  self.enabled = true
}

fn Selection.is_enabled(self: Selection) -> bool {
  return self.enabled
}

fn choose() -> bool {
  var selection = Selection.create(false)
  (mut selection).enable()
  return selection.is_enabled()
}
```

The mutation is visible both in `self: mut Selection` and in the call. Receiver
syntax does not insert a borrow, dereference an address, or find an interface
implementation. A direct call such as `Selection.enable(mut selection)` states the
same loan explicitly.

An address or device value can carry authority to change other storage. Its access
contract matters in addition to its parameter mode. Read access to the value
itself is not a promise that every operation through it is read-only. See
[Functions and Control Flow](functions-and-control-flow.md).

## Keep the main path easy to follow

Reject invalid input near the start of an operation. Then let the normal path
continue without another level of nesting. Name intermediate results when they
explain why an operation is valid.

For example, this range check avoids an overflowing `offset + length`:

```wyst
module effective.ranges

fn fits(capacity: u64, offset: u64, length: u64) -> bool {
  if offset > capacity {
    return false
  }

  const remaining = capacity - offset
  return length <= remaining
}

fn example() -> bool {
  return fits(capacity = 64, offset = 8, length = 16)
}
```

The guard establishes that subtraction cannot wrap. The named arguments make three
values of the same type distinguishable at the use site. Direct Wyst calls support
these labels; public parameter names therefore help callers read the API.

Use a `match` expression to select a value from alternatives. Use statements when
each path performs several steps. For ordinary iteration, use a range whose bound
comes from the same view that the body indexes:

```wyst
module effective.counting

fn count_nonzero(bytes: noescape []u8) -> u64 {
  var count: u64 = 0
  for index in 0 ..< bytes.len {
    if bytes[index] != 0 {
      count += 1
    }
  }

  return count
}
```

The range excludes `bytes.len`. It supplies the bound needed by the ordinary
subscript. For an index supplied by a caller, `bytes[?index]` checks the bound and
forwards a typed failure instead. Use `core.checked.element` when this layer needs
to match the failure locally.

Wyst evaluates call arguments and expression components in source order; `&&` and
`||` short-circuit. Even with defined order, split device reads and other
significant effects into named steps. The transaction should be clear without
reconstructing a large expression. See [Operators and
Evaluation](operators-and-evaluation.md).

## Choose arithmetic policy explicitly

Fixed-width integer addition, subtraction, and multiplication wrap. Integer
division by zero returns zero. These are defined language results, but they may
not be valid results for a size, deadline, or protocol field.

When overflow is part of a checksum or counter protocol, ordinary arithmetic can
express the requirement. When overflow means invalid input, use a checked
operation or establish a bound before doing the arithmetic. Check a divisor when
zero has no valid meaning for the operation.

Choose a conversion for its meaning:

| Need | Appropriate operation |
| --- | --- |
| Keep the value while increasing integer width with the same signedness | `widen<T>` |
| Intentionally keep only low bits | `truncate<T>` |
| Clamp to a domain maximum | Compare with the maximum before narrowing |
| Reject a value outside the destination range | A checked conversion |
| Cross an exact representation boundary | `bitcast<T>` under its type rules |

For a packet length, silently keeping low bits usually changes the message. For a
hardware field whose specification selects low bits, it may be exactly the
required operation. A successful type conversion does not choose that policy for
you. See [Type System](type-system.md#explicit-conversions).

### Check before computing a size

A size calculation is often a proof about storage. Suppose a message has a fixed
header and `count` records, each `stride` bytes long. The mathematical size is
`header + count * stride`. Evaluating that expression first and testing the result
against a capacity is too late: either operation can already have wrapped to a
small value.

First state the application's policy. Here zero stride is invalid, zero records
are valid, and a total that does not fit in `u64` is a recoverable error. Then put
the guards before the operations they justify:

```wyst
module effective.message_size

import core.collections { Result }

enum SizeFailure {
  ZeroStride
  Overflow
}

fn message_size(count: u64, stride: u64, header: u64) -> Result<u64, SizeFailure> {
  if stride == 0 {
    return .Error(.ZeroStride)
  }

  const available = u64.MAX - header
  if count > available / stride {
    return .Error(.Overflow)
  }

  return .Ok(header + count * stride)
}
```

`u64.MAX - header` cannot underflow because `header` is a `u64`. The zero guard
makes the divisor valid for this policy. The final comparison proves that the
product fits in the remaining range, so both the multiplication and the addition
are safe from wrapping. A zero count still produces the header size, including
when the header occupies the whole range.

This proves representability, not availability. A caller must still compare the
successful size with its actual destination capacity. An allocator or device can
impose a smaller limit than `u64.MAX`. Keep that second check at the boundary that
knows the limit; do not make the numeric helper guess it.

| Count | Stride | Header | Result |
| ---: | ---: | ---: | --- |
| 3 | 4 | 8 | `.Ok(20)` |
| 0 | 4 | `u64.MAX` | `.Ok(u64.MAX)` |
| 1 | 1 | `u64.MAX` | `.Error(.Overflow)` |
| 4 | 0 | 8 | `.Error(.ZeroStride)` |

Use a small helper like this when the formula is repeated or when its name
explains a domain rule. For a single simple range, the earlier subtraction-first
`fits` function is enough. Do not replace every addition with this policy: an
intentionally wrapping sequence number and an allocation size have different
requirements.

### Narrow at the representation boundary

Suppose an external count is a `u64`, but the wire field is one byte. There are
three distinct possible policies: reject an unrepresentable value, clamp it to the
largest byte, or keep only its low bits. Write the one the protocol requires. For
example, a validated field encoder can use a checked conversion:

```wyst
module effective.byte_field

import core.checked
import core.collections { Result }

fn encode_count(count: u64) -> Result<u8, checked.NumericConversionFailure> {
  return checked.numeric<u8>(count)
}

fn clamp_byte(count: u64) -> u8 {
  if count > widen<u64>(u8.MAX) {
    return u8.MAX
  }

  return truncate<u8>(count)
}

fn example() -> bool {
  const value: u64 = 300
  const low_bits = truncate<u8>(value)
  const clamped = clamp_byte(value)
  return match encode_count(value) {
    .Ok(_) { false }
    .Error(_) { low_bits == 44 && clamped == 255 }
  }
}
```

For `300`, all three operations behave correctly according to their own contracts,
but only one can be correct for a particular wire format. The checked conversion
returns an error; truncation yields `44`; the explicit clamp yields `255`. This
distinction is more useful than a general instruction to avoid casts. The
conversion should let a reviewer identify the policy immediately.

Keep calculations in a type with enough range, then convert once at the boundary
that requires the smaller representation. Do not truncate an intermediate result
merely to make its type match another operand. The lost information is unavailable
to a later check. Conversely, widening after an overflow cannot recover the
mathematical value: widen operands before the operation when the wider result is
required.

The same reasoning applies to signedness. A signed negative length is invalid
input; changing its bit interpretation does not validate it. Use a checked
conversion when the mathematical value must survive the crossing. Reserve
`signcast` and exact representation operations for boundaries that actually
specify a bit interpretation. See [checked core
operations](semantic-operations.md#checked-core-operations) and [integer
results](operators-and-evaluation.md#integer-results).

## Let the caller choose failure policy

Use `Option<T>` for ordinary absence and `Result<T, E>` for a completed operation
with a recoverable failure. Use `Result<Unit, E>` when success has no payload. Do
not reserve a valid integer value as an error code when that makes success
ambiguous.

### Forward a failure until a layer can act

Use `?` when this function has no useful recovery. It keeps the success path short
while retaining a typed error:

```wyst
module effective.tags

import core.checked
import core.collections { Result }

enum DecodeFailure {
  Bounds(from checked.IndexFailure)
  UnknownTag(u8)
}

fn read_tag(bytes: noescape []u8, index: u64) -> Result<u8, DecodeFailure> {
  const tag = bytes[?index]
  if tag > 2 {
    return .Error(.UnknownTag(tag))
  }

  return .Ok(tag)
}
```

The bounds failure keeps its payload inside `DecodeFailure.Bounds`. The `from`
variant declares that one conversion. Wyst does not search for a chain of
conversions or run arbitrary conversion code during forwarding.

Use `match` where the current layer can retry, select a default, or report a
domain-specific failure. A default is a policy, so name it and use it only where
the protocol permits it. Matching `.Error(_)` and returning zero in a required
field reader would hide malformed input.

Stored `Option` also supports `?`, but forwards absence to an enclosing `Option`
result. It does not turn absence into an error. In a `Result<Option<T>, E>`, first
handle or forward the Result, then decide what `.None` means. This keeps absence
distinct from failed work.

### Keep absence separate from failed work

`Result<Option<T>, E>` has three meanings: a value arrived, no value exists, or
the read failed. Preserve those meanings until a layer can choose a response. Here
a busy read may use a cached limit. An unavailable source still returns its
original detail. A successful absence still reaches the caller.

```wyst
module effective.optional

import core.collections { Option, Result }

enum ReadFailure {
  Busy
  Unavailable(u8)
}

enum LimitFailure {
  Read(from ReadFailure)
  Missing
}

fn recover_busy(
  pending: Result<Option<u16>, ReadFailure>,
  cached: Option<u16>,
) -> Result<Option<u16>, ReadFailure>
  effects(none)
{
  return match pending {
    .Ok(value) { .Ok(value) }
    .Error(problem) {
      match problem {
        .Busy {
          match cached {
            .Some(value) { .Ok(.Some(value)) }
            .None { .Error(problem) }
          }
        }
        .Unavailable(_) { .Error(problem) }
      }
    }
  }
}

fn with_default(pending: Result<Option<u16>, ReadFailure>) -> Result<u16, ReadFailure> {
  const optional = pending?
  return .Ok(
    match optional {
      .Some(value) { value }
      .None { numeric<u16>(64) }
    },
  )
}

fn required(pending: Result<Option<u16>, ReadFailure>) -> Result<u16, LimitFailure> {
  const optional = pending?
  return match optional {
    .Some(value) { .Ok(value) }
    .None { .Error(.Missing) }
  }
}
```

`recover_busy` changes exactly one failure case. With `.Busy` and cached
`.Some(12)`, it returns `.Ok(.Some(12))`. Without a cached value, `.Busy` remains
an error. `.Unavailable(7)` keeps its payload even when a cache exists. This
prevents a local fallback from concealing failures that need attention.

The two callers illustrate different absence policies. `with_default` uses 64 when
the read succeeds without a value. `required` turns that absence into
`LimitFailure.Missing`. Neither policy follows automatically from `Option`.
Returning `.Ok(.None)` would preserve absence for another layer instead.

The first `?` removes the `Result` layer. A second `?` cannot turn `None` into
`Missing`: Option forwarding needs an enclosing Option return type. The `Read(from
ReadFailure)` declaration authorizes one direct stored-error wrapper; it retains
the original failure. It does not define a general conversion path through
arbitrary error types.

Treat retries with the same precision. A retry needs a repeatable operation, an
explicit bound, and any authority that the first attempt returned. A typed error
alone supplies none of those facts. See [Error-Handling
Examples](error-handling-examples.md) for a resource-returning retry and
[Functions and Control
Flow](functions-and-control-flow.md#stored-result-forwarding) for forwarding
rules.

### Separate failure from a broken invariant

Use a recoverable result for malformed external input, insufficient capacity, or a
device that can legitimately be busy. Use a fatal policy only when the program
cannot continue under its contract. `expect_or_trap` makes fatal Result extraction
explicit; it is not a substitute for choosing error policy.

A reasonless `requires(condition)` asks the compiler to prove the condition at
each direct call. A reason-bearing `requires(condition, reason = ...)` checks at
runtime and traps on failure. An `ensures` clause also uses runtime fatal policy.
These contracts serve different callers: a recoverable parser must not become
terminal merely because a precondition is shorter to write.

```wyst
module effective.preconditions

import core.collections { Option }

fn remaining(capacity: u64, used: u64) -> u64
requires(used <= capacity) {
  return capacity - used
}

fn available(capacity: u64, used: u64) -> Option<u64> {
  if used <= capacity {
    return .Some(remaining(capacity, used))
  }

  return .None
}

fn required_remaining(capacity: u64, used: u64) -> u64
requires(used <= capacity, reason = 1) {
  return capacity - used
}
```

The branch in `available` proves the obligation before calling `remaining`. The
latter needs no runtime contract check. `required_remaining` instead performs a
check and takes the fatal-trap path if it fails. Choose between these forms based
on the caller's obligation and recovery needs.

`must_observe` requires consumption or an allowed explicit discard at the call
site. It does not ensure that the selected recovery policy is useful.

## Design storage lifetime with the API

Start with a fixed array or caller-supplied buffer when it meets the task. Wyst
provides no implicit heap or garbage collector. A slice describes existing
storage; making another slice does not allocate another buffer.

When returning a view, declare which input supplies its storage. State the units,
failure behavior, and ownership in the API description: `prefix` takes a byte
count, returns a borrowed prefix on success, and leaves the source unchanged if
that count is outside the slice. The type states the storage relation; these words
explain the intended use:

```wyst
module effective.windows

import core.checked
import core.collections { Result }

fn prefix(bytes: []u8, count: u64) -> Result<[]u8, checked.SliceFailure>
  from bytes on .Ok {
  return .Ok(bytes[?..<count])
}
```

On success, the result depends on `bytes`. The `from` clause transfers that
storage relation to the caller; it does not extend the backing storage's lifetime.
A bounds check proves the selected range, not every fact needed to use a raw
address. Extent, initialization, alignment, lifetime, access authority, and
concurrency remain separate obligations.

Use `noescape` when the callee must not retain an address, slice, or callable
capability beyond its permitted scope. Returning a view still requires a matching
`from` contract. Use `preserves` when a call must keep a storage identity valid,
and `unchanged` when it must also preserve the bytes under the applicable
contract. A valid view does not by itself mean that nobody changed its data.

Choose storage tools by the lifetime you need:

| Need | Starting point |
| --- | --- |
| A fixed amount of local data | A fixed array |
| Work in storage owned by the caller | A slice with the required access contract |
| Explicit reservation and initialization | `FixedBuffer` and destination transitions |
| Many allocations released at one boundary | `Arena` |
| Bounded slots or stable keyed access | The supported slot-pool or slot-map API |

Do not convert a stale view to an integer and back to bypass a storage diagnostic.
The missing fact is authority, not an inconvenient type. See [Memory
Model](memory-model.md) and [Storage and Allocation](storage-and-allocation.md).

## Own resources through their complete lifetime

### Treat a resource as an obligation with an owner

Choose a resource modifier for the action that must happen when ownership ends.
The modifiers do not install a destructor or call a cleanup function for you.

| Modifier | What the caller must do |
| --- | --- |
| `no_copy` | Transfer explicitly instead of copying; leaving the value unused is permitted. |
| `must_account` | Transfer, return, adopt into another owner, or explicitly discard every live value. |
| `must_resolve` | Retain the accounting rules, but finish through the declaring module instead of discarding. |

These requirements propagate through fields and enum payloads. Wrapping a handle
in a struct or an `.Error` does not make its obligation disappear. Use `opaque`
with a resource modifier when callers must acquire and finish the resource through
your API.

This small batch records how many items were added. Finishing consumes the batch
and returns the count:

```wyst
module effective.ownership

opaque must_resolve struct Batch {
  count: u64
}

fn open() -> Batch {
  return {count = 0}
}

fn add(batch: mut Batch) {
  batch.count += 1
}

fn finish(batch: var Batch) -> u64 {
  const count = batch.count
  resolve(xfer batch)
  return count
}

pub fn example() -> u64 {
  var batch = open()
  add(mut batch)
  add(mut batch)
  return finish(xfer batch)
}

export example
```

`add(mut batch)` lends the existing batch for the call. The caller still owns it
afterward. `finish(xfer batch)` gives ownership to `finish`; the original local is
unavailable after that transfer. `finish` reads the result before calling
`resolve`, which discharges this module's obligation. Resolution itself is not an
external release operation. A real finish function must perform its required
writes, acknowledgments, or closure before it resolves the token.

A `var` parameter means owned mutable input. It does not silently move a named
noncopyable argument. Omitting `xfer` is a rejected copy. Omitting `finish` leaves
the batch unresolved; substituting `discard(xfer batch)` is also rejected. If
abandoning work is a valid operation, expose a named cancellation function in the
owning module and give it a precise contract.

### Close on success and on an early error

A useful cleanup structure reads the information it needs, arranges closure, and
then processes the saved result. Here a small source either supplies its byte or
reports that it is unavailable. The counter makes closure observable:

```wyst
module effective.cleanup

import core.collections { Result }

opaque must_resolve struct Source {
  byte: u8
}

enum ReadFailure {
  Unavailable
}

var CLOSES: u64 = 0

fn close(source: var Source) {
  CLOSES += 1
  resolve(xfer source)
}

fn read(source: Source, available: bool) -> Result<u8, ReadFailure> {
  if !available {
    return .Error(.Unavailable)
  }

  return .Ok(source.byte)
}

fn read_and_close(source: var Source, available: bool) -> Result<u8, ReadFailure> {
  const pending = read(source, available)
  defer {
    close(xfer source)
  }

  const byte = pending?
  return .Ok(byte)
}

pub fn read_once(byte: u8, available: bool) -> Result<u8, ReadFailure> {
  var source: Source = {byte}
  return read_and_close(xfer source, available)
}

export read_once
```

Both `read_once(7, true)` and `read_once(7, false)` close the source once. On
success, the function returns `.Ok(7)`. On failure, `pending?` returns
`.Error(.Unavailable)` through ordinary lexical return processing, which runs the
deferred block.

The placement of `defer` matters. Its `xfer source` captures ownership for cleanup
when the block is registered. Reading `source` after that registration is
rejected. Save the result first, then operate on that independent result. When the
owner must remain available for more work, use a helper that borrows it, save the
helper's result, close the owner explicitly, and only then forward.

Deferred blocks run in reverse registration order on fallthrough and structured
exits. They cannot return an error with `?`. Choose explicit close-result handling
when closure can fail in a way the caller must recover from. Do not infer
exception unwinding or cleanup after a fatal trap from this mechanism. See
[Terminal Control and
Cleanup](outcomes-and-progress.md#terminal-control-and-cleanup).

### Separate reservation, initialization, and closure

A storage reservation is permission to initialize a range. It is not yet a view of
initialized bytes. The bundled storage API makes those stages distinct:

```wyst
module effective.buffer

import core.collections { Result }
import core.storage {
  DirectReserveFailure,
  FixedBuffer,
  FixedBufferAttachFailure,
  InitializedDestination,
  WrittenRegion,
  destination_initialize_zero,
  fixed_buffer_close,
  written_region_close,
}

enum FillFailure {
  Attach(from FixedBufferAttachFailure)
  Reserve(from DirectReserveFailure)
}

fn fill(buffer: mut FixedBuffer, count: u64) -> Result<u64, DirectReserveFailure> {
  var reservation = FixedBuffer.reserve(mut buffer, 0, count, #align_of(u8))?
  var initialized = destination_initialize_zero(xfer reservation)
  var region = InitializedDestination.finish(xfer initialized)
  const written = WrittenRegion.view(region).len
  written_region_close(xfer region)
  return .Ok(written)
}

pub fn clear_prefix(backing: mut []u8, count: u64) -> Result<u64, FillFailure> {
  var buffer = FixedBuffer.attach(mut backing, .OutputOrSubsystem)?
  const pending = fill(mut buffer, count)
  fixed_buffer_close(xfer buffer)
  return .Ok(pending?)
}

export clear_prefix
```

`clear_prefix` borrows a caller-supplied slice, attaches a buffer authority, and
lets `fill` borrow that authority. A successful reservation becomes an initialized
destination, then a written region. Each `xfer` consumes the previous state.
`WrittenRegion.view` exposes initialized bytes; the region closes after its last
use. Finally, `clear_prefix` closes the buffer before forwarding `fill`'s result.

With four bytes initially set to `0xa5`, a count of two clears the first two bytes
and leaves the other two unchanged. A count of five returns an invalid-range
failure and leaves all four bytes unchanged. The failed reservation preserves
bytes because it checks the range before writing. `?` does not provide rollback. A
count of zero succeeds with an empty written region and still follows closure.

The caller keeps the backing storage. Closing these authorities does not free a
heap allocation or erase the bytes. Finish or close every dependent region before
closing its buffer. Use the storage contract of the selected operation to decide
whether a returned view remains usable; scope exit is not a general lifetime
extension.

For a single external output value, consider `MaybeUninit<T>` instead of inventing
a reservation protocol. It reserves storage without creating `T`. A complete
`.write(value)` establishes initialization; `.read()` requires that fact on every
incoming path. An external provider can state an `initializes(...)` contract.
`.assume_init()` is an assertion, not a check. Neither ordinary raw storage nor
`MaybeUninit` is a place to hide a `must_resolve` value; those values require an
API that accounts for their ownership. See [Storage and
Allocation](storage-and-allocation.md) and [Uninitialized
Storage](semantic-operations.md#maybeuninitt-storage).

### Recover the authority returned with an error

A fallible operation that consumes a resource must specify who owns it on failure.
The following initializer prefers eight-byte storage, then tries a four-byte
representation if the reservation has the wrong length. Both preserve the original
`u32` value:

```wyst
module effective.retry

import core.collections { Result }
import core.storage {
  DestinationInitializationRejected,
  DestinationReservation,
  InitializationFailure,
  InitializedDestination,
  WrittenRegion,
}

fn initialize_counter(
  reservation: var DestinationReservation,
  value: u32,
) -> Result<InitializedDestination, DestinationInitializationRejected>
  from reservation
{
  var pending = DestinationReservation.initialize_value<u64>(xfer reservation, widen<u64>(value))
  return match xfer pending {
    .Ok(initialized) { .Ok(xfer initialized) }
    .Error(rejected) {
      if rejected.reason == InitializationFailure.WrongLength {
        return DestinationReservation.initialize_value<u32>(xfer rejected.reservation, value)
      }

      .Error(xfer rejected)
    }
  }
}

pub fn finish_counter(
  reservation: var DestinationReservation,
  value: u32,
) -> Result<WrittenRegion, DestinationInitializationRejected>
  from reservation
{
  var initialized = initialize_counter(xfer reservation, value)?
  return .Ok(InitializedDestination.finish(xfer initialized))
}

export finish_counter
```

The first call consumes `reservation`. A failed call returns a rejection that owns
that reservation. The retry uses `rejected.reservation`; it cannot reuse the
original local. This policy forwards misalignment failures unchanged. The `u32`
retry still checks its own exact size and natural alignment.

The `Result` itself carries resource obligations on both outcomes. `match xfer
pending` transfers it into the selected arm. A plain copy is invalid. On success,
the caller gets initialized storage; on failure, it gets the resource needed to
retry or explicitly abandon the attempt. The unconditional `from reservation`
relation matters because either outcome can carry that storage.

`finish_counter` shows direct forwarding from a resource-producing call. The
successful payload becomes `initialized`; an error returns with its rejection
authority intact. If a resource-bearing Result has already been stored in a local,
forwarding requires transfer as well. Explicit `match xfer pending` is useful when
recovery has more than one step.

The successful written region still needs a caller to view or close it. A typed
error also does not promise that arbitrary repetition is safe. This retry is valid
because rejected typed initialization retains the reservation and writes no
partial value. See the [resource retry
example](error-handling-examples.md#retry-with-returned-resource-authority).

### Put reclamation after the last dependent use

An arena gives several allocations one reclamation policy. A direct allocation
returns an ordinary typed address after complete initialization; later loads do
not repeat a handle or generation check. The compiler instead tracks the view's
relationship to arena state.

This function keeps one earlier allocation, computes with temporary storage, and
rewinds the temporary allocation before it returns the calculation:

```wyst
module effective.scratch

import core.collections { Result }
import core.storage { Arena, ArenaFailure, CheckpointRejected }

enum ScratchFailure {
  Arena(from ArenaFailure)
  Rewind(from CheckpointRejected)
}

fn temporary(arena: mut Arena) -> Result<u64, ArenaFailure> {
  const value = Arena.allocate_value<u64>(mut arena, 7)?
  return .Ok(value.load())
}

pub fn sum_with_scratch(arena: mut Arena) -> Result<u64, ScratchFailure> {
  const retained = Arena.allocate_value<u64>(mut arena, 10)?
  var checkpoint = Arena.checkpoint(mut arena)?
  const pending = temporary(mut arena)
  const facts = Arena.rewind(mut arena, xfer checkpoint)?
  const value = pending?
  return .Ok(retained.load() + value)
}

export sum_with_scratch
```

The temporary address is last used inside `temporary`. Its returned `u64` is a
copy, so it remains usable after rewind. The earlier `retained` address was
allocated before the checkpoint and remains valid after a successful rewind. Thus
success returns `17` and leaves the earlier allocation in the arena.

Save the temporary result before rewinding. Forwarding it immediately with `?`
would leave the checkpoint unaccounted for on failure. Here rewind runs first,
then `pending?` handles the calculation result. If rewind fails, its rejection
returns the checkpoint in `ScratchFailure.Rewind`. The caller must retain,
transfer, or explicitly account for that resource. Checkpoints must be resolved in
reverse creation order; the error is not permission to ignore arena state. The
earlier allocation also remains allocated if a later step fails.

Successful reset invalidates all direct arena views. Rewind invalidates views
allocated after its checkpoint. Failed reset and rewind preserve them.
`PreserveBytes` changes sanitation, not address validity. The following fragment
is deliberately invalid after a successful reset:

```text
const value = Arena.allocate_value<u64>(mut arena, 7)?
const facts = arena_reset(mut arena, .PreserveBytes)?
return .Ok(value.load())
```

Use a recorded region and explicit validation when an API needs a durable
allocation handle. When attaching an arena, its fresh-incarnation token is a
provider assertion: its value must not repeat for that backing. Reusing a constant
is not a freshness policy. These lifetime and authority rules are in [Memory
Model](memory-model.md) and [Storage and Allocation](storage-and-allocation.md).

## Handle live outcomes explicitly

### Use a live protocol when the caller participates during work

An interactive function offers notifications and terminal alternatives during one
direct call. Choose it when the caller must participate before the producer
finishes. Its offers remain part of that invocation; a returned `Result` remains
ordinary data that can be stored and examined later.

The following observer makes sequencing visible. `TRACE` records producer work,
the progress handler, and cleanup for one invocation.

```wyst
module effective.notifications

var TRACE: u64 = 0
var NOTIFIED: u8 = 0

struct Observation {
  value: u64
  trace: u64
  notified: u8
}

fn produce(reject: bool) -> u64 offers handler(none) {
  progress(u8)
  failure(u8)
} effects(none) {
  defer {
    TRACE = TRACE * 10 + 4
  }

  TRACE = TRACE * 10 + 1
  report 7
  TRACE = TRACE * 10 + 3
  if reject {
    fail 9
  }

  return 7
}

fn observe(reject: bool) -> Observation effects(none) {
  TRACE = 0
  NOTIFIED = 0

  const value = handle produce(reject) {
    progress(value) {
      NOTIFIED = value
      TRACE = TRACE * 10 + 2
    }
    failure(problem) {
      TRACE = TRACE * 10 + 5
      widen<u64>(problem)
    }
  }
  return {value = value, trace = TRACE, notified = NOTIFIED}
}
```

`report 7` calls the progress arm synchronously. That arm records digit 2 before
the producer records digit 3. No queue or second strand is required.

| Call | Value | Trace | Notification |
| --- | ---: | ---: | ---: |
| `observe(false)` | 7 | 1234 | 7 |
| `observe(true)` | 9 | 12345 | 7 |

The normal result of `produce` is the normal value of the `handle` expression;
there is no returned arm. On failure, the producer's deferred cleanup records 4
before the failure arm records 5. That arm supplies 9 as the value of the handle
expression, and the caller continues after it.

A normal exit from a progress arm resumes the producer. The arm cannot use
`return`, `fail`, or `cancel` to escape the call. Its captures must also remain
valid across repeated reports. Use progress for observation, not a hidden
early-return mechanism. If caller policy must change the work, give the producer
an explicit input or a synchronous recovery callback with a typed answer.

Deferred cleanup runs on structured exits in reverse registration order. Stored
`?` also uses ordinary return processing. Neither mechanism reverses earlier
writes: the trace records what already happened. Resource ownership must still be
accounted for on every terminal path.

### Give cancellation a precise checkpoint

Cancellation requests are ordinary inputs. The producer chooses when to accept
them and commits that decision with `cancel`. A cancellation offer does not
asynchronously interrupt an arbitrary instruction.

This bounded counter checks cancellation before each unit of work. The
intermediate `relay` preserves its complete protocol.

```wyst
module effective.cancellation

enum Terminal {
  Returned
  Failed
  Cancelled
}

struct Observation {
  terminal: Terminal
  value: u64
  reports: u64
}

fn count(limit: u8, stop_after: u8) -> u64 offers handler(none) {
  progress(u8)
  failure(u8)
  cancelled(u8)
} effects(none) {
  if limit > 3 {
    fail limit
  }

  var completed: u8 = 0
  while completed < limit {
    if completed == stop_after {
      cancel completed
    }

    completed += 1
    report completed
  }

  return widen<u64>(completed)
}

fn relay(limit: u8, stop_after: u8) -> u64 offers handler(none) {
  progress(u8)
  failure(u8)
  cancelled(u8)
} effects(none) {
  return handle count(limit, stop_after) {
    forward progress
    forward failure
    forward cancelled
  }
}

fn observe(limit: u8, stop_after: u8) -> Observation {
  var reports: u64 = 0
  const value = handle relay(limit, stop_after) {
    progress(completed) {
      reports = reports * 10 + widen<u64>(completed)
    }
    failure(problem) {
      return {terminal = .Failed, value = widen<u64>(problem), reports = reports}
    }
    cancelled(completed) {
      return {terminal = .Cancelled, value = widen<u64>(completed), reports = reports}
    }
  }
  return {terminal = .Returned, value = value, reports = reports}
}
```

For `observe(3, 3)`, the producer returns 3 after reports 1, 2, and 3. For
`observe(3, 1)`, it reports 1 and then cancels with one completed unit. Invalid
limit 4 fails before any report. Zero work returns immediately, even when
`stop_after` is zero. The source order chooses these outcomes.

Document that ordering where callers depend on it. Moving the cancellation check
after a report changes the amount of accepted work. Checking it before input
validation changes which terminal alternative wins. There is no language-level
race to resolve in this synchronous example.

Each forwarding arm requires the exact corresponding payload type in the enclosing
protocol. It preserves the notification or terminal alternative without
translating it. Since this producer also offers progress and cancellation, a
postfix `?` cannot replace the complete handler.

The terminal arms in `observe` return from the caller. They can make that choice
because those offers have ended the producer invocation. Its progress arm only
updates the report record and resumes the producer. See [Outcomes, Progress, and
Terminal Control](outcomes-and-progress.md).

### Name each boundary when a live call returns stored data

An interactive function can return a stored `Result`. In that case the invocation
protocol and the returned data have separate meanings. This query uses a live
failure for transport failure and a stored error for an unknown key. The
intermediate layer forwards transport failure unchanged, then adjusts only a
successful returned value.

```wyst
module effective.boundaries

import core.collections { Result }

enum QueryFailure {
  UnknownKey(u8)
}

enum RequestFailure {
  Transport(u16)
  Query(from QueryFailure)
}

fn lookup(key: u8) -> Result<u64, QueryFailure> offers {
  failure(u16)
} effects(none) {
  if key == 0 {
    fail 17
  }

  if key > 2 {
    return .Error(.UnknownKey(key))
  }

  return .Ok(widen<u64>(key) * 10)
}

fn adjusted(key: u8) -> Result<u64, QueryFailure> offers {
  failure(u16)
} effects(none) {
  const returned = handle lookup(key) {
    forward failure
  }
  const value = returned?
  return .Ok(value + 1)
}

fn request(key: u8) -> Result<u64, RequestFailure> effects(none) {
  const returned = handle adjusted(key) {
    failure(reason) {
      return .Error(.Transport(reason))
    }
  }
  return .Ok(returned?)
}
```

The two statements in `adjusted` expose both boundaries. The handler forwards the
live `u16` failure. The subsequent `?` inspects the returned `Result` and returns
its `QueryFailure` through the ordinary result path. Keys 1 and 2 produce 11 and
21. Key 3 preserves `UnknownKey(3)`. Key 0 leaves through the live failure with
payload 17 before any stored result is examined.

`request` is the layer that deliberately changes protocols. Its terminal handler
constructs `RequestFailure.Transport` and returns a stored error. The compiler
does not perform that adaptation implicitly. A returned query error takes the
separately declared `Query(from QueryFailure)` path.

For a direct call that offers only failure, `lookup(key)?` performs exact
interactive failure forwarding. Because this call returns a Result, a second
operation is needed to process the stored error; `(lookup(key)?)?` expresses both.
Prefer the expanded form when naming the two stages helps a reader. Forwarding
evaluates the call once and skips later work on its chosen path.

### Attribute handler work to the caller

An offered set is a control protocol. An effect bound describes operations. Keep
both visible when a handler performs work that the producer's own body does not
perform. `handler(trap)` permits callers to use the `trap` effect in their
handlers; it does not make the producer itself effectful.

```wyst
module effective.handler_effects

import core.trap

fn inspect(value: u8) -> u64 offers handler(trap) {
  progress(u8)
  failure(u8)
} effects(none) {
  report value
  if value == 0 {
    fail 1
  }

  return widen<u64>(value)
}

fn guarded(value: u8) -> u64 effects(trap) {
  return handle inspect(value) {
    progress(observed) {
      if observed > 2 {
        trap.fatal(numeric<u16>(41))
      }
    }
    failure(problem) {
      100 + widen<u64>(problem)
    }
  }
}
```

Here `guarded(1)` returns 1. `guarded(0)` handles the producer's typed failure and
returns 101. `guarded(3)` commits fatal reason 41 in the progress handler; the
failure arm does not catch it. The compiler attributes that trap effect to
`guarded`, while `inspect` retains `effects(none)`.

Use such a fatal guard only for a required invariant. If out-of-range data is an
expected input, a typed rejection lets callers choose recovery. Fatal traps have
no recoverable handler or language exception-unwinding path.

Replacing the ceiling with `handler(none)` rejects this trap-capable handler.
Changing `guarded`'s bound to `effects(none)` also rejects its body. An omitted
effect bound is inferred; it does not mean `none`. Conversely, ordinary counter or
trace writes can fit `handler(none)` because ordinary memory mutation does not
itself add a classified effect. See the [effect reports](inspection-reports.md)
when the source of a permitted operation is unclear.

## Introduce abstraction when it names shared work

Start with a concrete operation and identify the work that stays the same across
its callers. A generic function shares an algorithm across types. A static
interface supplies the operations that algorithm needs. A nominal operation groups
behavior with one exact type. An enum or callable value represents a choice made
while the program runs. Choose from those needs; adding an interface to every type
does not improve an API.

### Give a generic algorithm the abilities it uses

A saturating total is useful for bounded counters: keep the largest representable
value instead of wrapping after overflow. The algorithm needs unsigned arithmetic,
ordering, and the type's maximum:

```wyst
module effective.generic_sum

fn sum_saturated<T: unsigned_integer>(values: noescape []T) -> T effects(none) {
  var total: T = 0
  for index in 0 ..< values.len {
    const value = values[index]
    if value > T.MAX - total {
      return T.MAX
    }

    total += value
  }

  return total
}

pub fn example() -> u64 effects(none) {
  const small: [3]u8 = [200, 40, 30]
  const wide: [3]u64 = [200, 40, 30]
  const small_view: []u8 = small[..]
  const saturated = sum_saturated(small_view)
  const exact = sum_saturated<u64>(wide[..])
  return widen<u64>(saturated) + exact
}
```

The result is `525`: the `u8` total saturates at `255`, and the `u64` total is
`270`. An empty view returns zero. The comparison establishes that the next
addition fits before the operation executes. Adding first and testing the wrapped
result makes the overflow policy harder to verify. Early return is valid because
unsigned inputs cannot reduce the total.

`unsigned_integer` proves precisely the numeric category this algorithm requires.
`numeric` would admit floats and would not provide integer limits. `scalar` would
also admit values without this arithmetic. A bound is a contract for the generic
body; it is not a hint about the types callers will probably use.

Use `copyable_discardable` for an algorithm that only needs ordinary copies and
discard. Use `fixed_layout_movable` when moving a value is sufficient. The latter
does not grant copying or discard. Neither bound permits arbitrary field access or
invents comparison operators. The closed bound set is in [Type
System](type-system.md#generic-declarations).

### Let known argument types drive inference

The first call infers `T = u8` from the declared type of `small_view`. The second
call states `u64` explicitly. Both choices describe the same algorithm. A typed
intermediate view is useful when an expression such as `small[..]` does not itself
supply the static type needed for inference.

Wyst infers a complete type-argument list from parameter shapes and known argument
types. It does not infer backward from the receiving variable's result type. An
uncontextualized integer literal does not tell the compiler whether the intended
type is `u8`, `u64`, or another integer. Write all type arguments when that
distinction is not established at the call.

Generic struct and enum applications remain explicit. A field of type `Result<u64,
ParseError>` states both arguments even if its initializer looks unambiguous. Do
not build an API that depends on partial argument lists, default type arguments,
or inference from callable signatures.

### Check compile-time assumptions

Compile-time decisions should state why the selected implementation is valid. This
module rounds values down to its fixed power-of-two boundary:

```wyst
module effective.alignment

const ALIGNMENT: u64 = 16

#static_assert(ALIGNMENT != 0, "alignment must be nonzero")
#static_assert(ALIGNMENT & ALIGNMENT - 1 == 0, "alignment must be a power of two")

fn align_down(value: u64) -> u64 effects(none) {
  #if ALIGNMENT == 1 {
    return value
  } #else {
    const low_mask: u64 = ALIGNMENT - 1
    return value & u64.MAX - low_mask
  }
}

pub fn example() -> u64 effects(none) {
  return align_down(123)
}
```

The result is `112`. Clearing the low four bits rounds down to a multiple of
sixteen. `ALIGNMENT - 1` selects those low bits; subtracting that mask from
`u64.MAX` produces the bits to keep.

The assertions reject zero and non-power-of-two alignments before the mask is
used. They check implementation assumptions. Validate external input with runtime
checks instead. This function uses the concrete `u64` type because its mask and
values share that representation; it needs no generic conversion.

`#if` selects a branch during compilation. Only the selected branch is checked.
The alignment-one branch documents the case with no low bits to clear. Use
ordinary `if` when the choice comes from a runtime value; a compile-time assertion
cannot validate a runtime configuration.

A parameter written `name: comptime Type` requires a closed compile-time value and
has no runtime ABI position. Use such specialization when a caller must select
fixed structure. Do not specialize every tuning value by habit: more concrete
combinations can produce more generated code. A module constant, as above, is
simpler when one configuration applies to all calls. See [Functions and Control
Flow](functions-and-control-flow.md) for staged parameters and [Type
System](type-system.md#compile-time-queries-and-required-evaluation) for
compile-time evaluation.

### Define interfaces from the consumer's work

A prefix comparison needs an indexed byte and an end indication. It does not need
an allocation operation, a device initializer, or a complete stream API. Define
that small requirement, then map concrete providers to it:

```wyst
module effective.byte_sources

pub enum ByteAt {
  Found(u8)
  End
}

pub interface ByteSource: copyable_discardable {
  at: fn(Self, u64) -> ByteAt effects(none)
}

fn starts_with<T: ByteSource>(source: T, prefix: noescape []u8) -> bool effects(none) {
  for index in 0 ..< prefix.len {
    const equal = match ByteSource.at(source, index) {
      .Found(byte) { byte == prefix[index] }
      .End { false }
    }
    if !equal {
      return false
    }
  }

  return true
}

pub struct Header {
  bytes: [4]u8
}

fn header_at(header: Header, index: u64) -> ByteAt effects(none) {
  if index >= 4 {
    return .End
  }

  return .Found(header.bytes[index])
}

impl ByteSource for Header {
  at = header_at
}

pub struct ZeroRun {
  length: u64
}

fn zero_at(run: ZeroRun, index: u64) -> ByteAt effects(none) {
  if index >= run.length {
    return .End
  }

  return .Found(0)
}

impl ByteSource for ZeroRun {
  at = zero_at
}

pub fn example() -> bool effects(none) {
  const header: Header = {bytes = [0x57, 0x59, 1, 0]}
  const signature: [2]u8 = [0x57, 0x59]
  const zeros: [3]u8 = [0, 0, 0]
  const enough: ZeroRun = {length = 3}
  const short: ZeroRun = {length = 2}
  return starts_with(header, signature[..]) && starts_with(enough, zeros[..]) && !starts_with(
    short,
    zeros[..],
  )
}
```

`Header` reads stored bytes. `ZeroRun` represents a run of zero bytes without
allocating that run. Both can participate in prefix comparison. The example
accepts the header signature and a sufficient zero run, then rejects a run that
ends too soon. An empty prefix succeeds without asking the provider for a byte.
The consumer owns the comparison policy; each provider owns its representation and
end check.

A useful interface groups a specific consumer need. If all callers already have
byte slices, a slice parameter is simpler. Here, requiring a slice would force the
generated provider to allocate or require a separate comparison algorithm. The
interface removes that duplication without imposing storage on either provider.

The interface's `copyable_discardable` ability applies to its subject. It does not
let an implementation declare a noncopyable resource copyable. Each `impl`
explicitly maps `at` to an ordinary function. The subject's owning module supplies
that mapping; matching function names alone do not establish conformance. A
concrete subject has one implementation for that interface. The public interface
and subjects make their implementations usable across modules; the mapping
functions can stay private.

The generic body uses `ByteSource.at(source, index)`. It cannot use receiver dot
syntax to discover interface operations. Its `effects(none)` promise is checked
against the requirement, including before a provider is selected. Changing the
requirement to admit MMIO would also require the consumer to admit that effect,
even if one mapping only reads ordinary fields.

Keep all relevant requirements accurate, including effects, trust, result
observation, storage, and access contracts. An interface does not erase those
obligations. After a concrete type is selected, interface calls become ordinary
direct calls. See [Interfaces and
Implementations](interfaces-and-implementations.md).

### Make a runtime choice explicit

Static interfaces do not produce values that can be stored in a field. For a small
set of runtime alternatives, an enum shows each choice and its data:

```wyst
module effective.enum_dispatch

enum ByteTransform {
  Identity
  Mask(u8)
}

fn ByteTransform.apply(self: ByteTransform, byte: u8) -> u8 effects(none) {
  return match self {
    .Identity { byte }
    .Mask(mask) { byte & mask }
  }
}

fn select_transform(clear_high_bit: bool) -> ByteTransform effects(none) {
  if clear_high_bit {
    return .Mask(0x7f)
  }

  return .Identity
}

pub fn example() -> u8 effects(none) {
  const transform = select_transform(true)
  return transform.apply(0xc1)
}
```

The result is `0x41`. `ByteTransform.apply` is an operation on the exact nominal
type. The receiver call is a convenient spelling of
`ByteTransform.apply(transform, 0xc1)`. It does not search an interface or
implicitly borrow the value. The match performs the runtime selection and requires
a policy for every variant.

This representation is useful when the available policies are a closed set. Each
case can carry different data. Adding a case makes exhaustive matches revisit the
decision. Runtime configuration within one concrete provider also remains
possible: a field can select an offset or mode without changing its
static-interface implementation.

When the caller supplies behavior through a callable, store the callable and its
explicit data together:

```wyst
module effective.callable_dispatch

struct BytePolicy {
  apply: fn(u8, u8) -> u8 effects(none)
  operand: u8
}

fn keep(byte: u8, operand: u8) -> u8 effects(none) {
  return byte
}

fn mask(byte: u8, operand: u8) -> u8 effects(none) {
  return byte & operand
}

fn select_policy(clear_high_bit: bool) -> BytePolicy effects(none) {
  if clear_high_bit {
    return {apply = mask, operand = 0x7f}
  }

  return {apply = keep, operand = 0}
}

fn transform(policy: BytePolicy, byte: u8) -> u8 effects(none) {
  return policy.apply(byte, policy.operand)
}

pub fn example() -> u8 effects(none) {
  return transform(select_policy(true), 0xc1)
}
```

This example also returns `0x41`. The `apply` field contains a function value;
`operand` contains its context. The call passes that context explicitly. No
closure capture or hidden interface object is involved.

The callable's `effects(none)` bound lets the caller retain the same effect
promise. A broader callable contract would broaden what callers must permit.
Indirect calls use positional arguments, so names belong in the record and the
surrounding API rather than at that call site.

Prefer the enum when variants have different data or callers must inspect the
selected case. Prefer a callable when an operation with a common signature must be
supplied independently. Use a static interface when the concrete subject is
selected during compilation. These choices establish different representations and
obligations; changing the spelling of a method call does not change which
selection the program needs.

## Keep hardware work at a clear boundary

Separate observation, calculation, and action. The device layer decides when to
read a register. Ordinary functions decide what the observation means. The device
layer then performs the required action. This division gives tests a stable input
and leaves the hardware sequence visible to a reviewer.

### Make one observation before making several decisions

A register snapshot is useful when two facts must describe the same read. The
PL011 flag register has separate indications for a full transmit FIFO and a busy
transmitter. Capacity to accept another byte and completion of the last
transmission are different questions:

```wyst
module effective.uart_observation

#target(arch = arm64-v8a, cpu = generic, el = 2)

register_map Pl011 {
  FR: readonly u32 at 0x18 {
    BUSY: bool at 3
    TXFF: bool at 5
  }
}

mmio UART0: Pl011 at 0x0900_0000

struct TransmitObservation {
  can_accept: bool
  finished: bool
}

fn observe(device: Pl011) -> TransmitObservation effects(mmio, volatile_access) {
  const flags = device.FR.read()
  return {can_accept = !flags.TXFF, finished = !flags.BUSY}
}

pub fn primary_can_accept() -> bool {
  const observation = observe(UART0)
  return observation.can_accept
}
```

`read()` performs one full-width volatile read. Access to `flags.TXFF` and
`flags.BUSY` uses that captured value. Calling `read()` separately for each field
would permit a state change between the observations. Conversely, a poll loop must
perform another explicit read each time it needs new information. Keeping an old
snapshot in the loop would keep testing the old observation.

Pass a typed device instance to a reusable driver. The placement carries the
selected platform's mapping identity as well as the runtime base address. A
numeric value equal to `0x0900_0000` does not reproduce that authority. The map
also does not give the caller exclusive device ownership. Two callers can still
race between a readiness check and a write. The surrounding driver must own that
access protocol.

### Choose the register operation from its policy

A full write, a read-modify-write, and a command write have different meanings.
Name these differences in the driver API. Here the first operation replaces the
selected control configuration, the second updates one declared setting, and the
third acknowledges one interrupt condition:

```wyst
module effective.uart_control

#target(arch = arm64-v8a, cpu = generic, el = 2)

register_map Pl011 {
  CR: readwrite u32 at 0x30 {
    UARTEN: bool at 0
    TXE: bool at 8
    RXE: bool at 9
  }
  ICR: writeonly u32 at 0x44 {
    TX: bool at 5 write_one_clears
  }
}

mmio UART0: Pl011 at 0x0900_0000

pub fn enable_transmit_only() {
  UART0.CR.write(UARTEN = true, TXE = true, RXE = false)
}

pub fn set_receive_enabled(enabled: bool) {
  UART0.CR.modify(RXE = enabled)
}

pub fn acknowledge_transmit_interrupt() {
  UART0.ICR.write(TX = true)
}
```

The named control write constructs one complete backing value and writes it once.
It deliberately does not retain other control settings. The modify operation reads
the current value, updates `RXE`, retains the declared `UARTEN` and `TXE`
settings, and writes once. Use it only when the register permits that read and
write and the caller controls concurrent changes. It is not an atomic operation.
Model every setting that must survive the update: undeclared bits follow an
implicit zero policy in this restricted schema.

`TX = true` in the interrupt-clear write is an action mask: it requests a clear.
It does not mean that the resulting interrupt state is true. Trying to preserve a
command register by reading and writing its previous bits can repeat commands or
acknowledge unrelated events. This declaration prevents a read of `ICR` and
therefore prevents `modify` on it.

These functions demonstrate register operations; they omit baud-rate setup,
interrupt delivery, and the sequencing for reconfiguration. Keep those
requirements in the driver that owns initialization. A declaration must faithfully
describe the device manual. The compiler can enforce the declared policies; it
cannot establish that the description matches the physical chip.

Neither volatile access nor MMIO supplies synchronization, architectural barriers,
cache maintenance, or DMA ownership. Add the explicit semantic operations required
by the protocol. `schedule source` constrains compiler instruction order; it does
not emit a processor barrier.

### Put an enforceable boundary around calculation

An ordinary planning function should accept values rather than read a device for
itself. That makes a retry decision reproducible:

```wyst
module effective.transmit_plan

enum Plan {
  Done
  Wait
  Send(u64)
}

fn bounded_count(remaining: u64, limit: u64) -> u64 effects(none) {
  if remaining < limit {
    return remaining
  }

  return limit
}

#[deny_effects(mmio, volatile_access)]
fn plan(remaining: u64, limit: u64, ready: bool) -> Plan {
  if remaining == 0 {
    return .Done
  }

  if !ready || limit == 0 {
    return .Wait
  }

  return .Send(bounded_count(remaining, limit))
}

pub fn example() -> bool {
  const sends_three = match plan(8, 3, true) {
    .Send(count) { count == 3 }
    .Done { false }
    .Wait { false }
  }
  return sends_three && (plan(0, 3, false) is .Done) && (plan(8, 0, true) is .Wait) && (plan(
    8,
    3,
    false,
  ) is .Wait)
}
```

The denied effects propagate through calls. Moving a register read into a helper
called by `plan` still violates the boundary. The caller owns the fresh
observation, the maximum batch it permits, and what to do after `.Wait`. The
planner does not invent a busy loop, timeout, or hidden retry.

`effects(none)` is the stronger bound when no compiler-known effect category is
permitted. It does not mean that ordinary memory is unchanged, that no resource
needs accounting, or that the function must terminate. Use storage and ownership
contracts for those separate promises. Keep effectful operations in named
statements when their order matters; hiding several device calls inside one
expression makes the protocol harder to inspect.

See [Semantic Operations](semantic-operations.md) and [Memory
Model](memory-model.md) for the exact hardware contracts.

### Derive addresses from their storage

When an API needs an address, derive it from an existing typed object. Keep
address calculations attached to that source instead of reconstructing them from
numeric offsets. This cursor advances through a bounded logical range; its field
addresses come from the caller's initialized object:

```wyst
module effective.cursor_address

struct Cursor {
  offset: u64
  limit: u64
}

fn advance(cursor: noescape @Cursor, count: u64) -> bool effects(none) {
  const offset = field_addr(cursor, .offset)
  const current = offset.load()
  const limit = field_addr(cursor, .limit).load()
  if current > limit || count > limit - current {
    return false
  }

  offset.store(current + count)
  return true
}

pub fn example() -> bool {
  var cursor: Cursor = {offset = 4, limit = 16}
  const first = advance(addr_of(cursor), 11)
  const second = advance(addr_of(cursor), 2)
  return first && !second && cursor.offset == 15
}
```

`field_addr` selects a field through the checked pointee type. It preserves the
relevant source authority and narrows access to that field. The range check
protects arithmetic and cursor policy; it does not grant access to a separate
buffer. If the cursor also describes a byte view, carry that view and its lifetime
rather than treating `limit` as evidence that arbitrary memory exists.

An aligned numeric address alone does not establish usable extent, initialization,
and lifetime. Converting an address to an integer and back does not restore its
previous authority. Use explicit checked refinement when the input itself needs
validation. A successful checked subscript proves bounds; the remaining memory
obligations still apply.

For output that starts uninitialized, use the explicit initialization rules in
[Separate reservation, initialization, and closure](#separate-reservation-initialization-and-closure).
An initialization assertion cannot create missing address, slice, or callable
authority. See [Memory Model](memory-model.md) for those separate requirements.

### Keep checked assembly smaller than its explanation

Prefer `system_register` declarations and semantic core operations when they
express the required machine action. When maintaining an existing assembly
routine, isolate each operation behind a small typed function. This helper reads
the exception return address held in `ELR_EL2`:

```wyst
module effective.exception_return

#target(arch = arm64-v8a, cpu = generic, el = 2)

pub fn return_address() -> u64 effects(sysreg) {
  return asm -> address: u64 {
    mrs address, ELR_EL2
  }
}
```

The typed result is established by `mrs` on every exit. The compiler chooses its
register because the operation has no fixed-register requirement. It derives
effects and clobbers from the admitted instruction row, and the `sysreg` effect
must fit the enclosing function's bound. There is no manual clobber list to keep
synchronized with the instruction.

Call this helper only where the exception state has the meaning the caller
expects. Reading `ELR_EL2` does not save a complete trap frame or prevent a nested
exception from changing the recorded state. That protection belongs to the
exception-entry protocol. A typed `system_register` declaration is the better API
when the code also needs named fields or write policies.

A recognized AArch64 mnemonic is not necessarily admitted in the active
checked-assembly profile. Use the checked catalog instead of assuming that a
syntax example or a disassembler's output will compile. Do not add `naked` or
fixed registers to an ordinary helper; they impose stack and allocation
constraints. Use `asm retained` only when the instruction occurrence itself must
remain. Retention does not provide a hardware fence. See [Checked
Assembly](checked-assembly.md) and [AArch64 Exception Vectors and Trap
Frames](exception-vectors-and-trap-frames.md).

### Separate source visibility, binary symbols, and entry

Choose an external interface for its consumer. `pub` allows other Wyst modules to
name a declaration. `export` gives a declaration a native linker name. `extern
"C"` chooses the supported AAPCS64 calling convention. One modifier does not imply
either of the others:

```wyst
module effective.external_boundary

export bounded_count as symbol "wyst_bounded_count"

extern "C" fn bounded_count(requested: u64, capacity: u64) -> u64 effects(none) {
  if requested > capacity {
    return capacity
  }

  return requested
}

pub fn example() -> bool {
  return bounded_count(9, 4) == 4 && bounded_count(2, 4) == 2
}
```

This exported scalar interface has a direct C representation and no borrowed
storage to describe. A Wyst slice or enum is not a supported direct C boundary
value. For a larger interface, choose supported named structs or addresses, and
document who owns storage, its usable size, and its lifetime. An exported Native
function is still Native; a convenient symbol spelling does not make its calling
convention compatible with C. See [ABI Specification](abi.md).

An executable entry is a further decision. A named layout selects its entry and
places its sections in regions. Entry selection neither exports nor renames the
declaration. For `qemu-virt-aarch64-el2`, the compiler-owned firmware schema
requires a naked `_start(dtb: u64 in x0) -> never` and an authorized `establish
stack from VALUE` transition. Select stack storage from the platform layout rather
than copying a plausible address into application code.

A valid layout and entry do not initialize BSS, install exception vectors,
configure devices, or start other CPUs. Those are explicit platform tasks. Keep
ordinary reusable modules independent of that sequence and join them in the
executable root. The examples here are static libraries, so their success does not
claim that a boot sequence was tested. See [Named Layouts and
Placement](named-layouts-and-placement.md), [Entry Contracts](entry-contracts.md),
and [Project Builds](project-builds.md).

## Write the sharing protocol before the atomic operation

For shared state, first state who can read and write, what makes each change
visible, and when the storage can be reused. Atomic operations implement parts of
that contract. An atomic field beside ordinary data does not protect that data by
proximity. Volatile and MMIO accesses provide neither atomicity nor
synchronization.

### Protect a complete value with one lock

Suppose several execution agents publish and read a pair of settings. Each reader
needs both fields from the same update. Making each field atomic would prevent
torn scalar accesses, but a reader could still combine one old field with one new
field. Protect the complete value with one lock instead.

This module permits one holder at a time. The lock word is zero when available and
one when held. Initialization must complete before other agents enter the API.
Every access to `SETTINGS` must use this same lock; no caller receives an address
into the shared value.

```wyst
module effective.shared_settings

import core.collections { Result, Unit }

export publish

export snapshot

pub struct Settings {
  attempts: u64
  delay: u64
}

pub enum AccessFailure {
  Busy
}

var SETTINGS: Settings = {attempts = 3, delay = 5}
var LOCK: atomic<u64> = atomic<u64>(0)

fn try_acquire() -> bool
acquires(LOCK) when result {
  const attempt = LOCK.compare_exchange(0, 1, .acquire)
  return attempt.exchanged
}

fn release()
releases(LOCK) {
  LOCK.store(0, .release)
}

pub fn publish(value: Settings) -> must_observe Result<Unit, AccessFailure> {
  if try_acquire() {
    guard mut SETTINGS by LOCK {
      SETTINGS = value
    }

    release()
    return .Ok({})
  }

  return .Error(.Busy)
}

pub fn snapshot() -> must_observe Result<Settings, AccessFailure> {
  if try_acquire() {
    var value: Settings = {attempts = 0, delay = 0}
    guard SETTINGS by LOCK {
      value = SETTINGS
    }

    release()
    return .Ok(value)
  }

  return .Error(.Busy)
}
```

`compare_exchange` changes zero to one only if it observes zero. Its `exchanged`
result determines whether the caller holds authority. The `acquires(LOCK) when
result` contract exposes this condition to the checker. Calling `try_acquire` and
ignoring its result does not acquire usable authority.

`guard mut SETTINGS by LOCK` permits the write under that held authority. The read
guard permits a copy. Neither guard acquires the lock or emits lock instructions.
The explicit acquire and release operations do that work. `releases(LOCK)` ends
the held authority when the release store runs.

The release store publishes the completed update to a later successful acquire on
the same lock. The reader copies both fields while it holds the lock, then
releases it and returns the independent copy. Another writer can replace the
shared settings without changing that returned value. Moving either field read
after `release` would break the protocol. Returning a view would require a longer
storage and exclusion contract.

Both functions return `Busy` when they cannot acquire. Neither failure changes the
settings. A caller can keep its previous snapshot, retry later, or report
contention. Choose that policy at the call site. Validate a proposed value before
acquisition so that the critical section remains small. If a future edit adds an
early return after acquisition, it must still release the lock after all protected
accesses end. Do not call unknown callbacks or suspending operations while holding
it.

This protocol provides mutual exclusion; it makes no fairness promise. Wyst's
strong `compare_exchange` can retry a store-exclusive internally on targets
without LSE. One source call therefore does not imply a fixed instruction count or
a bounded response time. A high-priority context that repeatedly retries while the
holder cannot run can prevent progress.

### Give waiting a caller-visible budget

A waiting API should distinguish “not observed yet” from a broken invariant. This
example has a completion flag that changes from false to true once and is never
reset. All shared state in this example is the atomic flag itself. It
intentionally returns no view or ordinary shared payload.

```wyst
module effective.completion

import core.collections { Result, Unit }

export mark_finished

export try_wait

export ready_for_next_step

pub enum WaitFailure {
  Busy
}

var FINISHED: atomic<bool> = atomic<bool>(false)

pub fn mark_finished() {
  FINISHED.store(true, .release)
}

pub fn try_wait(observations: u64) -> must_observe Result<Unit, WaitFailure> {
  for observation in 0 ..< observations {
    if FINISHED.load(.acquire) {
      return .Ok({})
    }
  }

  return .Error(.Busy)
}

pub fn ready_for_next_step() -> bool {
  return match try_wait(8) {
    .Ok(_) { true }
    .Error(_) { false }
  }
}
```

`try_wait(0)` performs no load and returns `Busy`. A positive budget permits at
most that many loads. `ready_for_next_step` gives one caller a concrete policy:
try eight observations, then return false so the caller can do other work. It does
not fabricate a completed result, trap on contention, or start a background task.

The budget bounds source observations, not elapsed time. A false result does not
mean that completion cannot occur immediately after the last load. A true result
remains useful because this protocol never resets the flag. A reusable completion
object needs a separate generation and reuse protocol; clearing a flag without
coordinating its readers can confuse two operations.

Acquire/release is suitable when the flag participates in publication, but it does
not by itself authenticate a new ordinary-data payload. To add one, state its
writer, lifetime, initialization, read authority, and reuse rule, then encode the
required checked contracts. Use the guarded snapshot pattern above when a small
copied value meets the requirement. Do not treat successful flag polling as
permission to reconstruct an arbitrary address.

### Separate source order from machine order

`schedule source` keeps operations in source order and prevents compiler motion
across the region boundary. `#[schedule(source)]` applies that constraint to a
whole function. These forms create no runtime scheduler and emit no architectural
memory barrier. `barrier.compiler()` likewise constrains only compiler motion.

Select atomic orders and explicit architectural barriers from the sharing or
device protocol. Do not replace acquire/release with `schedule source`, and do not
add `seq_cst` expecting an implicit `dmb`: Wyst's A64 `seq_cst` loads and stores
use the acquire and release instruction forms. The `dmb` and `dsb` operations
require an explicit domain and access option; `isb` takes no source argument. No
barrier is inserted automatically around MMIO. See [Memory Model](memory-model.md)
and [Semantic Operations](semantic-operations.md).

### End temporary authority before suspension

An `execution_suspension` effect identifies a call or provider transfer that can
suspend the current execution strand. It does not create a thread, coroutine,
stack, or executor. Synchronous interactive progress handlers stay on that strand;
a handler that can suspend must expose that effect too.

Structure work in three phases: acquire and inspect state, release temporary
authority, then call the provider. After resumption, acquire the authority again
and recheck the state. Another agent may have changed it while this strand was
suspended. Preserve an independent value copy only when a snapshot is sufficient
for the next step.

The compiler rejects live exclusion authority and live raw-storage loans across a
suspension boundary. Current-context and `per_cpu` facts must be reacquired after
it. This rule is why adding a yield inside a lock holder is not a harmless latency
improvement. It changes both the authority lifetime and the progress requirements.

The sealed `core.execution.suspension_point` marker is accepted only beside an
authenticated provider transfer. The marker emits no instruction and does not park
or yield by itself. Provider integration must establish the actual transfer, saved
context, stacks, and resumption contract. The cooperative task fixture
demonstrates one such arrangement; it does not supply a general scheduler.
Fairness, wakeups, teardown, and progress still require provider implementation
and integration tests. See [Scheduling and
Suspension](scheduling-and-suspension.md).

The examples above establish compilable atomic and authority contracts. They do
not start multiple agents or demonstrate concurrent execution. Test the chosen
target and provider with actual concurrent entry, contention, release, and
shutdown before making a runtime progress claim.

## Transform a bounded record

Keep a small transformation in three steps: read the record, validate its meaning,
and write the result into caller storage. Give each step a typed failure so that a
caller can choose the response.

This example accepts a retry count and a delay measured in ticks. It writes a
canonical decimal record. The scanner accepts leading zeroes; the formatter
removes them. The example's retry policy rejects zero attempts and zero delay.

```wyst
module effective.retry

import core.collections { Result }
import core.fmt
import core.quantities { ByteLength, TickDuration }
import core.scan { ScanFailure, read }

struct RetrySettings {
  attempts: u16
  delay: TickDuration
}

enum ConfigFailure: u8 {
  Syntax(from ScanFailure)
  ZeroAttempts
  ZeroDelay
  Output(from fmt.FormatFailure)
}

fn normalize(
  input: string,
  output: mut noescape []u8,
) -> must_observe Result<ByteLength, ConfigFailure>
  effects(none)
{
  const settings: RetrySettings = parse(input)?
  const attempts: u16 = settings.attempts
  const delay: u64 = bitcast<u64>(settings.delay)
  var target = fmt.cursor(mut output)
  return .Ok(fmt.write(addr_of(target), "attempts={};delay={}", attempts, delay)?)
}

fn parse(input: string) -> must_observe Result<RetrySettings, ConfigFailure> effects(none) {
  const fields = read<(attempts: u16, delay: TickDuration)>(
    input,
    "attempts={attempts};delay={delay}",
  )?
  if fields.attempts == 0 {
    return .Error(.ZeroAttempts)
  }

  if fields.delay == 0 {
    return .Error(.ZeroDelay)
  }

  return .Ok({attempts = fields.attempts, delay = fields.delay})
}

fn example() -> bool effects(none) {
  var storage: [32]u8 = [0; 32]
  var output: []u8 = storage[..]
  return match normalize("attempts=03;delay=005", mut output) {
    .Ok(written) { written == 18 }
    .Error(_) { false }
  }
}
```

`read` checks the complete input against a compile-time template. The named tuple
fixes each field's type. A value larger than `u16.MAX` cannot become an attempt
count. `parse` then checks the domain rules. Its result contains numbers and does
not retain a view of the input. `TickDuration` keeps the delay distinct from a
byte count; its explicit carrier conversion belongs at the text output boundary.

This example passes a literal-backed string. In the current compiler snapshot,
these `normalize` and `parse` boundaries reject a string backed by a stack-local
byte array. A scalar result does not by itself establish a non-retaining input
contract, and `noescape string` is not supported. Check that boundary before
adapting the parser to a receive buffer. The module API example below has the
same input limitation.

The `Syntax(from ScanFailure)` and `Output(from fmt.FormatFailure)` variants
declare the two direct error conversions. Each `?` can return early while
preserving the original failure detail inside the named variant.

The caller chooses and initializes the output buffer. `mut noescape []u8` permits
changes through the parameter and prevents the function from retaining that
storage beyond the call. The success count is a `ByteLength`. Only that prefix is
output; the function does not append a NUL byte.

`fmt.write` checks the complete output length before it writes. Syntax and policy
failures occur before formatting; a capacity failure leaves the destination
unchanged. A caller can retry with more space without receiving a partial record.
The `effects(none)` contract still permits these ordinary memory writes.

Use these cases to check the boundary:

| Input | Output capacity | Expected result |
| --- | ---: | --- |
| `attempts=03;delay=005` | 18 bytes | 18 bytes: `attempts=3;delay=5` |
| `attempts=0;delay=5` | 32 bytes | `ZeroAttempts`; output unchanged |
| `attempts=3;delay=0` | 32 bytes | `ZeroDelay`; output unchanged |
| `attempts=65536;delay=5` | 32 bytes | `Syntax`; output unchanged |
| `attempts=3;delay=5;` | 32 bytes | `Syntax`; output unchanged |
| `attempts=3;delay=5` | 8 bytes | `Output`; output unchanged |

See [Bundled Core Library](core-library.md) for the scan, format, and quantity
contracts. The same pattern applies to other fixed records: preserve types, check
domain rules, and let the caller own storage and failure policy.

## Turn a local operation into a module API

An operation that works in one file still needs a clear boundary before other
modules depend on it. Decide which module owns validation, which facts a value
guarantees, and which caller chooses the next action. A function becomes useful
public API when that division remains clear without reading its body.

The record transformation above parses and formats a retry configuration. The next
project uses the same input format but separates configuration validity from the
decision to retry. It deliberately has no timer or scheduler. A `RetryAfter`
result is a decision for a caller to act on.

A public struct with writable fields would let a consumer construct zero attempts
or zero delay without using the parser. Instead, the configuration module exports
an opaque value. Its successful parser is the construction boundary. The public
query functions reveal the information a caller needs without exposing the
representation.

Keep the public failure alternatives visible. A consumer may need to report
malformed text differently from a configuration that violates the domain rules.
Removing those distinctions in the provider would force every consumer to accept
the same reporting policy.

These three files form one project. The source fences are labeled `text` because
the modules must be checked together.

```text
retry-policy/
  wyst.project
  src/
    app.wyst
    config/
      retry.wyst
```

`src/config/retry.wyst`:

```text
module config.retry

import core.collections { Result }
import core.scan { ScanFailure, read }

pub enum ConfigFailure {
  Syntax(from ScanFailure)
  ZeroAttempts
  ZeroDelay
}

pub opaque struct RetrySettings {
  attempts: u16
  delay_ticks: u64
}

pub fn parse(input: string) -> Result<RetrySettings, ConfigFailure> {
  const fields = read<(attempts: u16, delay: u64)>(input, "attempts={attempts};delay={delay}")?
  if fields.attempts == 0 {
    return .Error(.ZeroAttempts)
  }

  if fields.delay == 0 {
    return .Error(.ZeroDelay)
  }

  return .Ok({attempts = fields.attempts, delay_ticks = fields.delay})
}

pub fn permits(settings: RetrySettings, completed: u16) -> bool {
  return completed < settings.attempts
}

pub fn delay(settings: RetrySettings) -> u64 {
  return settings.delay_ticks
}
```

The parser validates text and domain rules before it returns `RetrySettings`. Both
fields are owned scalar values, so a successful setting does not retain input
storage. The `permits` query names the decision it supports. The `delay` query
states its unit in the stored field name and uses ticks in the consumer. For a
larger public API, use a nominal quantity such as `TickDuration` when values in
several units would otherwise share the same integer type.

The application imports the whole module. At each call, `retry.parse` and
`retry.permits` keep the owner visible. A selective import remains appropriate
when a public type is clear without its module qualifier. Choose based on the
calling code; shortening every qualified name is not a goal.

`src/app.wyst`:

```text
module app

import config.retry

pub enum Decision {
  RetryAfter(u64)
  Stop
  Invalid(retry.ConfigFailure)
}

pub fn decide(input: string, completed: u16) -> Decision {
  const settings = match retry.parse(input) {
    .Ok(value) { value }
    .Error(error) {
      return .Invalid(error)
    }
  }
  if !retry.permits(settings, completed) {
    return .Stop
  }

  return .RetryAfter(retry.delay(settings))
}

pub fn example() -> bool {
  return match decide(input = "attempts=3;delay=5", completed = 2) {
    .RetryAfter(ticks) { ticks == 5 }
    .Stop { false }
    .Invalid(_) { false }
  }
}
```

`Decision` separates three outcomes: the caller can try again, its attempt budget
is exhausted, or the configuration is invalid. A zero delay never serves as a
hidden stop signal. A malformed record never silently becomes a default
configuration. If a product requires a default, introduce that policy at this
application boundary and identify which failures permit it.

`completed` means completed attempts, not the next attempt number. The boundary
case is explicit: a budget of three permits another attempt after two completed
attempts and stops after three. Parameter names help explain direct calls, which
is why the example uses named arguments for this pair of values.

The manifest selects `app` as the artifact root. The compiler discovers
`config.retry` from the import, using the path `src/config/retry.wyst`. It does
not compile every unrelated file under `src` simply because the file exists.

`wyst.project`:

```text
project "retry-policy" {
  source_root "src"
  default policy

  static_library policy for "qemu-virt-aarch64-el2" {
    root app
    output "build/libpolicy.a"
    companion "build/libpolicy.wystlib"

    debug .none
    unwind .none
    frame_pointers .minimal
  }
}
```

Run the project commands from `retry-policy`:

```sh
wync fmt . --check
wync check .
wync build .
wync explain execution . --function app.example
```

The example returns `true`. This artifact is a static library for the selected
target. It has no boot entry or layout and does not become a runnable program by
having a public function. `pub` permits Wyst imports; a required native symbol
needs an explicit `export`, with its ABI checked separately.

Keep these tests at the public boundary:

| Input | Completed attempts | Expected decision |
| --- | ---: | --- |
| `attempts=3;delay=5` | 2 | `RetryAfter(5)` |
| `attempts=3;delay=5` | 3 | `Stop` |
| `attempts=0;delay=5` | 0 | `Invalid(ZeroAttempts)` |
| `attempts=3;delay=0` | 0 | `Invalid(ZeroDelay)` |
| `attempts=3;delay=5;` | 0 | `Invalid(Syntax(...))` |

Split a module into part files when one source file becomes difficult to navigate.
Part files share the same module identity and private declarations. Each part
declares its own imports. A split does not create a new API boundary. Create a
second module only when it owns a distinct responsibility; dotted names do not
grant parent modules access to private declarations.

Use `pub import` only when the re-exported name belongs to the API you want to
maintain. Every public declaration adds a choice that future implementations must
preserve or deliberately change. Keep parsing helpers private, expose operations
that support real callers, and test through those operations. See [Modules and
Symbol Boundaries](modules-and-symbol-boundaries.md) and [Project
Builds](project-builds.md) for the exact discovery and visibility rules.

## Build evidence for the claim you make

Use the selected project configuration throughout validation:

```sh
wync fmt . --check
wync check .
wync build .
```

For a nondefault artifact, pass `--artifact NAME` to both `check` and `build`.
Project mode reads its target from the manifest.

Formatting establishes source form. Checking establishes semantic acceptance.
Building performs artifact checks and machine lowering for retained bodies. A
static-library build can omit private or `pub` functions that no native export
retains. To inspect their machine code, retain the relevant functions through
exports in a validation harness and inspect the lowering report. `pub` alone is a
Wyst visibility decision.

Reference execution establishes results for the cases it runs. Use `wync explain
execution . --function module.example` to inspect one supported function, or put
several boundary checks behind an example entry. This is compiler reference
execution; it does not execute the final native artifact. Run that artifact in an
appropriate target runner when the claim concerns actual machine behavior. None of
these steps alone proves that a new board boots or a device sequence is correct.

Test empty input, exact capacity, one item beyond capacity, malformed data,
arithmetic boundaries, and the error paths that carry resources. Use rejected
compile examples for contracts that must be enforced. Use runtime tests for
returned values, partial writes, cleanup, and device access order.

Use [compiler reports](inspection-reports.md) when the claim concerns storage,
effects, stack use, placement, or execution. Measure on the required target before
adding inlining, unrolling, or a more complicated allocation scheme. Keep a change
only when its evidence supports the requirement.

For this guide, every standalone Wyst block passes formatting, semantic checking,
and static-library construction against the compiler snapshot used by the
reference. The examples with stated ordinary results also have reference-execution
checks. Resource and API examples include expected rejections. Hardware and atomic
examples have retained lowering checks; they do not establish device behavior or
concurrent correctness through execution. Run `npm run verify:guides -- --wync
/path/to/wync` in the documentation repository to repeat the standalone
compilation checks. The verifier requires the compiler source identity recorded in
the documentation snapshot.
