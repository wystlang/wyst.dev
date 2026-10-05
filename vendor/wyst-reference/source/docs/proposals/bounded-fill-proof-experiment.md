# Bounded fill functional-proof experiment

Status: implemented and verified. The full inspection release gate passed
before implementation. General proof syntax, user proof libraries, and
extensible automation remain gated. The
[tool and commands](../../wync/tools/functional-proof/README.md) are separate
from normal compiler checking.

## Required behavior

The fixture is `bounded_fill.fill`, with one exclusive, initialized four-byte
array, two `u64` endpoints, and a `u8` fill value. The interval is half open. The fixture must explicitly export the native
function; `pub` alone does not retain a native body.

- If `first <= limit <= 4`, return true, write the fill value to every byte in
  `[first, limit)`, and preserve every byte outside it.
- Otherwise return false before any input-array write and leave the array unchanged.
- Every input terminates normally. Empty valid intervals succeed.

The [coding-agent pilot](../../wync/tools/review-evaluation/records/2026-09-30/report.md)
provides the motivating gap. Its initial fill passes checking while changing
bytes before returning failure. Memory safety and storage preservation do not
establish the required byte contents or failure atomicity.

## Bounded checker

The checker uses a closed source fragment for this fixture: its exact signature, unsigned
comparisons, the two rejection guards, one cursor loop, byte stores, cursor
increments, and Boolean returns. Reject every unsupported source construct.
Fresh compiler proof inspection must authenticate the same source and report
successful semantic and typed-IR checking. The added proof applies to the
closed source model. It does not establish source-to-IR or IR-to-ARM64
correctness.

Generate candidate evidence separately from checking. Evidence binds the exact
source, executable, inspection snapshot, and selected experimental guarantees.
The checker must reconstruct all required cases and reject missing, duplicate,
stale, malformed, or forged evidence.

The loop invariant is `first <= cursor <= limit <= 4`. Bytes in
`[first, cursor)` equal the fill value; all other bytes equal their entry values.
Represent the four entry bytes and fill value as uninterpreted byte symbols.
Equality of symbolic cells establishes equality for every assignment of these
symbols to `u8`, including assignments where symbols have equal values.

Enumerate every valid endpoint/cursor combination, not selected examples.
Check invariant initialization, each loop transition, the strict decrease of
`limit - cursor`, and the success postcondition. Use unsigned modulo-`2^64`
cursor arithmetic and reject any bounds fault or unexpected completion.

For rejection, partition the entire `u64` endpoint domain into singleton values
0 through 4 and the interval 5 through `u64.MAX`. For the two large intervals,
retain each possible endpoint ordering. Evaluate guards over these exact
partitions; do not substitute representative integers. Require false return
with zero writes for every invalid partition. An unsupported or indeterminate
operation must fail checking.

Keep the experimental guarantee declarations and evidence in sidecar JSON.
They have no language or runtime representation. The adapter composes the
existing `explain proof` result with separately labeled functional obligations,
assumptions, and operation identities. It preserves the stable compiler report schema and keeps compiler assertions
separate from functional proof.

## Required evidence

The correct fixture must pass. Wrong-byte, skipped-byte, outside-range-write,
write-before-rejection, invalid-invariant, missing-evidence, forged-evidence,
and stale-evidence controls must fail. Existing compiler checking should still
accept the memory-safe functional defects; record any defect rejected earlier.

Repeated inspection must be deterministic. A comparison must report a removed
or weakened selected experimental guarantee, while retaining the existing
compiler-fact comparison and its unknown-strength rule. Build the native
archive and interface before and after inspection and evidence generation;
compare their bytes. Record the source guards, emitted instruction cost, proof
checker cost, and every trust boundary. Equal artifact bytes establish that
this sidecar adds no proof runtime overhead to this fixture; they do not prove
that the generated machine program implements the source theorem.

## Proof obligations fixed before implementation

Let `B0[j]` be entry byte `j` and `v` the fill value. The invariant requires:

```text
0 <= first <= cursor <= limit <= 4
B[j] = v      when first <= j < cursor
B[j] = B0[j]  otherwise
```

There are 35 triples `(first, limit, cursor)` in this domain. There are 15
initial states, 20 states that require one more loop step, and 15 exit states.
The checker must establish all of these obligations:

1. For each valid endpoint pair, the rejection guards permit execution and
   cursor initialization establishes the corresponding invariant state.
2. Each of the 20 loop steps completes without a fault or return, establishes
   another invariant state, and strictly decreases `limit - cursor`.
3. Each of the 15 exit states returns true and establishes the selected
   byte-content and outside-range postconditions.
4. Every invalid endpoint partition returns false before the loop with zero
   writes and unchanged bytes.

The endpoint partition has 38 elements: 25 pairs of singleton values in
`0..4`, five singleton/large pairs, five large/singleton pairs, and three
large/large orderings. Fifteen are valid; 23 require rejection. A large value
means the complete interval `[5, u64.MAX]`, not one example from that interval.
If an expression needs a distinction that this partition does not represent,
the checker must reject it as unsupported instead of guessing its value.

The byte terms are independent symbolic inputs. The source fragment permits
assignment of the fill symbol or a byte constant, with no hidden calls or
byte arithmetic. Structural equality of the resulting terms is sufficient
for equality under every assignment of the five byte inputs. Evidence cannot
add premises that restrict those inputs or remove an endpoint partition.

## Verified results

The [release-gate record](../../wync/tools/functional-proof/records/inspection-gate.json)
covers the ordinary and extended compiler suites, release-mode differential
checks, 10,000 proof-aware fuzz inputs, 2,000 differential inputs, 1,000 text-scan
inputs, native reproducibility, and direct memory-safety invariants. All 40
inspection/comparison tests also passed against the frozen evaluation compiler.

The [functional records](../../wync/tools/functional-proof/records/results.json)
show all six test groups passing. The correct fixture establishes 15 invariant
initializations, 20 transitions with a decreasing rank, 15 successful exits,
and 23 invalid endpoint partitions. The checker consumes 35 invariant states.
The [inspection envelope](../../wync/tools/functional-proof/records/inspection.json)
contains the exact snapshot, six memory operation IDs, selected guarantees,
assumptions, and checker identity.

All six source defects pass ordinary compiler checking and fail functional
checking: wrong byte, skipped byte, a write outside the requested range, a write
before rejection, wrapping cursor increment, and a wrong rejection result.
The checker also rejects missing evidence, an invalid invariant, omitted or
duplicate invariant states, an omitted rejection partition, forged compiler,
source, or inspection bindings, an invented premise, and stale source or
contract evidence. Unsupported source and contract forms fail closed.

Thirty-six independent Wyst reference executions agree with the source model.
They include empty and full intervals, invalid intervals, maximum `u64`
endpoints, fill values 0, 9, and 255, and complete input-array readback. These
probes test model consistency; the static argument uses all invariant states
and exact endpoint partitions with symbolic byte values.

Repeated and relocated checks produce identical records. Removing `frame`
reports a weakened selected conjunction. Removing every selected claim reports
its removal. The normal compiler-fact comparison remains unchanged for these
sidecar changes. This relation concerns the experimental declarations, not a
new Wyst language contract.

The explicitly exported ARM64 body has 34 instructions and 136 code bytes.
Its native frame composition is 32 bytes for two slice descriptors. The ABI
summary alone says zero bytes and excludes these materialized local objects;
the frame composition and emitted stack adjustment supply the full cost.
The source contains two rejection comparisons, the loop comparison, and the
per-iteration bounds comparison. The
[lowering record](../../wync/tools/functional-proof/records/lowering.json)
retains their instructions and source origins. Array rejection has zero input
writes, but still has normal local-view and frame work.

The native archive and semantic interface are byte-identical before and after
candidate generation and checking. The sidecar has no proof runtime overhead
in this fixture. This comparison does not prove source-to-machine correctness.

Checker-only timing uses five retained in-process samples on the development
host with Node 24.15.0. It excludes compiler inspection, process startup, file
I/O, and native building. See the recorded samples for the measured cost;
these observations are not a performance bound or hardware timing claim.

The evidence producer and checker are separate modules. The checker trusts its
closed parser, symbolic semantics, and JavaScript runtime. It also relies on
valid Wyst entry storage and no external mutation during the call. Source
parsing, compiler lowering, ABI conformance, and hardware remain independent
trust boundaries. The prototype covers this four-byte fixture and this closed
fragment only. A concrete consumer and further evidence are still required
before general proof syntax or user proof automation can begin.
