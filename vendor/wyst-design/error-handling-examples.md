---
title: "Error-Handling Examples"
group: appendix
order: 730
summary: "Executable failure composition, local recovery, and resource retry examples."
---

# Error-Handling Examples

Use `?` when the current function cannot continue after a stored error. Use
`match` where the caller must select a policy. These examples use the existing
[stored forwarding rules](functions-and-control-flow.md#stored-result-forwarding).
The documentation tests compile these exact blocks and execute their success,
absence, recovery, and failure paths.

## Read, parse, validate, and allocate

This example reads a one-digit buffer size and reserves that many bytes from
caller-owned storage. The input source is a deterministic test source: mode
`0` supplies a byte, `1` fails, `2` reports absence, and `3` reports a busy
source. The busy case uses a cached value. Absence selects a default. Other
failures leave the function with their typed payload intact.

The stage trace records read (`1`), parse (`2`), validate (`3`), and allocate
(`4`). The counters record cleanup and recovery. They are test observations,
not a logging API. `ConfigSource` requires resolution so that a missed close
is also a compile-time error.

<!-- wyst-contract: check-pass -->
```wyst
module error_examples.pipeline

import core.collections { Option, Result }
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

var STAGES: u64 = 0
var SOURCE_CLOSES: u64 = 0
var BUFFER_CLOSES: u64 = 0
var RECOVERIES: u64 = 0
var BACKING: [4]u8 = [0xa5; 4]

must_resolve struct ConfigSource {
  mode: u8
  raw: u8
}

enum ReadFailure {
  Unavailable(u8)
  Busy
}

enum ParseFailure {
  InvalidDigit(u8)
}

enum ValidationFailure {
  ZeroCount
}

enum SetupFailure {
  Read(from ReadFailure)
  Parse(from ParseFailure)
  Validate(from ValidationFailure)
  Attach(from FixedBufferAttachFailure)
  Reserve(from DirectReserveFailure)
}

fn close_source(source: var ConfigSource) effects(none) {
  SOURCE_CLOSES += 1
  resolve(xfer source)
}

fn read(source: ConfigSource) -> must_observe Result<Option<u8>, ReadFailure> effects(none) {
  STAGES = STAGES * 10 + 1
  if source.mode == 1 {
    return .Error(.Unavailable(7))
  }

  if source.mode == 2 {
    return .Ok(.None)
  }

  if source.mode == 3 {
    return .Error(.Busy)
  }

  return .Ok(.Some(source.raw))
}

fn read_with_cache(
  source: ConfigSource,
) -> must_observe Result<Option<u8>, ReadFailure>
  effects(none)
{
  return match read(source) {
    .Ok(value) { .Ok(value) }
    .Error(problem) {
      match problem {
        .Busy {
          RECOVERIES += 1
          return .Ok(.Some(50))
        }
        .Unavailable(_) { .Error(problem) }
      }
    }
  }
}

fn parse(raw: u8) -> must_observe Result<u64, ParseFailure> effects(none) {
  STAGES = STAGES * 10 + 2
  if raw < 48 || raw > 57 {
    return .Error(.InvalidDigit(raw))
  }

  return .Ok(widen<u64>(raw) - 48)
}

fn validate(count: u64) -> must_observe Result<u64, ValidationFailure> effects(none) {
  STAGES = STAGES * 10 + 3
  if count == 0 {
    return .Error(.ZeroCount)
  }

  return .Ok(count)
}

fn fill(
  buffer: mut FixedBuffer,
  count: u64,
) -> must_observe Result<u64, DirectReserveFailure>
  effects(none)
{
  var reservation = FixedBuffer.reserve(mut buffer, 0, count, #align_of(u8))?
  var initialized = destination_initialize_zero(xfer reservation)
  var region = InitializedDestination.finish(xfer initialized)
  const length = WrittenRegion.view(region).len
  written_region_close(xfer region)
  return .Ok(length)
}

fn allocate(count: u64) -> must_observe Result<u64, SetupFailure> effects(none) {
  STAGES = STAGES * 10 + 4

  var backing: []u8 = BACKING[..]
  var buffer = FixedBuffer.attach(mut backing, .OutputOrSubsystem)?
  const outcome = fill(mut buffer, count)
  fixed_buffer_close(xfer buffer)
  BUFFER_CLOSES += 1

  const length = outcome?
  return .Ok(length)
}

fn configure(source: var ConfigSource) -> must_observe Result<u64, SetupFailure> effects(none) {
  const pending = read_with_cache(source)
  defer {
    close_source(xfer source)
  }

  const optional = pending?
  const raw = match optional {
    .Some(value) { value }
    .None { numeric<u8>(50) }
  }
  const parsed = parse(raw)?
  const count = validate(parsed)?
  return allocate(count)
}
```

`read_with_cache` recovers only from `.Busy`. The returned `Option` keeps
absence separate from failure until `configure` selects its default. A caller
that requires a value can instead return a domain error in the `.None` arm.
A caller with a `Result<Option<T>, E>` return type can preserve absence by
returning `.Ok(.None)` from that arm.

| Input | Outcome | Stage trace | Source closes | Buffer closes |
| --- | --- | --- | --- | --- |
| Byte `52` (`4`) | Four zeroed bytes | `1234` | 1 | 1 |
| Absent | Two zeroed bytes | `1234` | 1 | 1 |
| Busy | Cached size, two zeroed bytes | `1234` | 1 | 1 |
| Unavailable | `Read(Unavailable(7))` | `1` | 1 | 0 |
| Byte `120` (`x`) | `Parse(InvalidDigit(120))` | `12` | 1 | 0 |
| Byte `48` (`0`) | `Validate(ZeroCount)` | `123` | 1 | 0 |
| Byte `53` (`5`) | `Reserve(InvalidRange)` | `1234` | 1 | 1 |

The first unrecovered failure skips later stages. It does not undo earlier
writes: the stage trace remains populated. `configure` reads before it transfers
the source to deferred cleanup, then examines the stored result. `allocate`
captures the result of its borrowed storage work, closes the buffer, and then
forwards any error. Both owners close on success and failure. Cleanup does not
restore the bytes written on success. The failed reservation leaves the backing
bytes unchanged because that operation checks its bounds before it writes, not
because `?` provides rollback.

This sequence returns the first failure. To collect independent validation
errors, evaluate the checks explicitly and store their results. Such collection
is a different caller policy from sequential forwarding.

## Retry with returned resource authority

An error can carry the resource required for recovery. This function first
tries an eight-byte representation of a counter. For a wrong-length rejection,
it tries a four-byte representation once. Both representations preserve the
`u32` value. A misaligned destination is returned without a retry.

<!-- wyst-contract: check-pass -->
```wyst
module error_examples.retry

import core.collections { Result }
import core.storage {
  DestinationInitializationRejected,
  DestinationReservation,
  InitializationFailure,
  InitializedDestination,
}

fn initialize_counter(
  reservation: var DestinationReservation,
  value: u32,
) -> must_observe Result<InitializedDestination, DestinationInitializationRejected>
  from reservation
  effects(none)
{
  var attempted = DestinationReservation.initialize_value<u64>(xfer reservation, widen<u64>(value))
  return match xfer attempted {
    .Ok(initialized) { .Ok(xfer initialized) }
    .Error(rejected) {
      if rejected.reason == InitializationFailure.WrongLength {
        return DestinationReservation.initialize_value<u32>(xfer rejected.reservation, value)
      }

      .Error(xfer rejected)
    }
  }
}
```

The first attempt consumes `reservation`. Only the returned rejection permits
the retry. If the retry also fails, its rejection returns that authority to the
caller. The caller must transfer or explicitly abandon it. Retrying an unrelated
operation is safe only when its contract permits repetition; a typed error alone
does not establish that property.

## Absence needs an explicit policy

A second `?` cannot turn `None` into an error or return it through an enclosing
`Result`. This example must fail with the diagnostic that Option forwarding
needs an enclosing authentic Option return type.

<!-- wyst-contract: check-fail -->
```wyst
module error_examples.absence

import core.collections { Option, Result }

enum ReadFailure {
  Unavailable
}

fn required(pending: Result<Option<u8>, ReadFailure>) -> Result<u8, ReadFailure> {
  const optional = pending?
  return .Ok(optional?)
}
```

## Keep the control boundaries explicit

Stored forwarding performs lexical return. Interactive failure forwarding
selects a live failure offer. Cancellation is a separate terminal outcome.
Fatal traps have no recovery handler. These boundaries follow
[Outcomes, Progress, and Terminal Control](outcomes-and-progress.md).

`effects(none)` excludes compiler-classified effects such as `trap`; it does
not assert mathematical purity or prohibit ordinary memory writes. The first
example intentionally changes its trace and backing storage. Its
`must_observe` contracts require callers to consume or explicitly discard the
results; they do not require every caller to recover from every error.
