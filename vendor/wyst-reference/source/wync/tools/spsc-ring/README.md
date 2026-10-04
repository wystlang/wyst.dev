# Scalar SPSC validation

Run the selected M4 wake-inbox checks from the Wyst repository:

```sh
cargo build --locked --manifest-path wync/Cargo.toml
cargo test --locked --manifest-path wync/Cargo.toml --test integration spsc_ring::
cargo test --locked --manifest-path wync/Cargo.toml --test integration memory_model_litmus::
cargo test --locked --manifest-path wync/Cargo.toml --test integration execution_suspension::
WYNC="$PWD/wync/target/debug/wync" node wync/tools/spsc-ring/run.mjs
WYNC="$PWD/wync/target/debug/wync" WYNC_SKIP_CARGO_TESTS=1 \
  ./wync/tests/fixtures/qemu/virt/run.sh cooperative-tasks suspension-identity
```

The native command requires Darwin ARM64 and Clang. It builds repository Wyst
ELFs in a temporary directory, checks deterministic output and exact stack
bounds, and executes their actual push, pop, close, finish, and reset functions.
It removes temporary files on success or failure. Each executable has a
60-second watchdog and finite attempt budgets. A timeout or incorrect value
fails validation. QEMU is used only for correctness, never for timing.

The native harness checks FIFO order, initialized publication, close racing
with a consumer, full/empty results, final-payload drain, counter exhaustion,
stale endpoints, and generation exhaustion. Its fault-injection cases create
invalid old descriptors in C to test the runtime defense; ordinary Wyst cannot
copy those affine values. The host retains all admitted backing until exit.
The ABI bridge adapts Wyst's three-register 24-byte return. Layout assertions
and an integer-only artifact check protect the C/Wyst call boundary.

Three producers each publish 10,000 tokens into one capacity-four ring. One
consumer polls the three rings in order. Caller retries and scheduling yields
are explicit harness code, not ring behavior. Each successful pop verifies its
producer's sequence and a timestamp written before the release publication.
The model litmus tests separately establish slot publication, slot reuse, and
close-before-final-tail ordering, including the incorrect close-order control.
Interpreted library tests cover zero capacity, repeated slot wrap, partial
batches, attachment bounds, returned authority, and reset mismatch. Rejection
tests cover outgoing references, aggregate graphs, forged and copied endpoints,
and endpoint use after close.

The fixture-local references are single-producer SPSC, three sharded SPSC
rings, shared MPSC with per-slot sequences and one weak CAS attempt, and a
bounded shared queue with one mutex try-lock attempt. Shared queues have twelve
slots; each shard has four. Single-producer SPSC is a topology control, not a
valid shared three-producer implementation. Reference payloads include their
timestamp; Wyst transfers one token and publishes an external timestamp. The
comparison therefore informs topology, not a compiler optimization threshold.
The MPSC reservation can delay its consumer while that producer is descheduled.
Try-lock and CAS failure return to the harness; weak LL/SC failure has no
internal compiler retry. The runner checks actual `ldxr` or `cas` assembly for
these two reference builds.

## Native observation

Five trials per profile on Apple M1 Ultra, 128-byte cache lines, Darwin 25.6.0,
and Apple Clang 21.0.0 gave the following medians. These are discovery results;
threads are not pinned and there is no kernel latency guarantee. Batch size is
one. Hardware cache-contention counters are unavailable. Producer and consumer
metadata use separate 128-byte lines; payload slots still share cache lines.

| Build / topology | Accepted/s | p99 ns | Failed pushes | Collision retries |
| --- | ---: | ---: | ---: | ---: |
| Base / Wyst directed SPSC | 9,584,665 | 1,375 | 208,945 | 0 |
| Base / C SPSC, one producer | 17,317,247 | 1,208 | 847 | 0 |
| Base / C sharded SPSC | 17,966,320 | 792 | 112,667 | 0 |
| Base / C MPSC | 7,872,896 | 1,625 | 48,446 | 40,824 |
| Base / C try-mutex | 789,556 | 87,292 | 854,964 | 837,856 |
| LSE / Wyst directed SPSC | 13,878,448 | 917 | 209,930 | 0 |
| LSE / C SPSC, one producer | 17,198,147 | 2,167 | 1,068 | 0 |
| LSE / C sharded SPSC | 17,854,932 | 792 | 111,308 | 0 |
| LSE / C MPSC | 11,129,144 | 1,084 | 45,994 | 42,409 |
| LSE / C try-mutex | 868,727 | 23,667 | 868,923 | 863,464 |

The runner also prints p50, maximum latency, empty attempts, host facts, and
exact stack roots for every run. It runs five trials for each profile. The
Wyst atomic instructions are the same `ldar`/`stlr` operations in both profiles;
the observed throughput difference is not an LSE improvement. The C sharded
reference has fewer checks and call boundaries. Wyst additionally validates
generation and closure, constructs typed outcomes and slot views, and uses
out-of-line generic helpers. Its exact push/pop call chains use 240 stack
bytes each. There is no earlier Wyst SPSC baseline and no speedup claim.
The first maintained results expose this cost for later measured work.

The choice remains directed SPSC because M4 has one serialized producer per
CPU pair and does not require order between different producers. It avoids a
shared reservation and internal retry, at the explicit cost of twelve inboxes
and three consumer inspections. The comparison does not justify broadening
M4 to MPSC or adding a fallback lock.

## Kernel boundary

The cooperative QEMU fixture alternates two integer-only EL1 tasks through 32
SVC/ERET transfers on separate stacks. It checks live local address identity,
values, a placed callee-saved register, selection order, and stack range. The
compiler regression builds separate provider and caller module objects, checks
imported suspension effects, and requires exact bounds within a 16 KiB stack
with a 2 KiB reserve. Existing suspension tests reject exclusion, raw loans,
and stale current-context use. Kernel stack guards, remote wake races, idle
notification, teardown, and the authenticated compiler pin remain kernel
integration work. These fixtures are not a scheduler implementation.
