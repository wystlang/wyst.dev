# Compare compiler facts

Run both source snapshots with the same compiler binary:

```sh
node wync/tools/compare-compiler-facts/run.mjs \
  --compiler wync/target/debug/wync \
  --before /path/to/before \
  --after /path/to/after \
  --artifact kernel \
  --format text
```

Use `--format json` for `wync.compare-compiler-facts.v1` records. Select revisions
and prepare source snapshots outside this tool. Keep those snapshots unchanged
while capture runs. The tool invokes fresh `wync explain effects` checks; it does
not accept stored reports as proof of a successful check. It hashes the selected
executable before capture and after each check. A failed check, missing checked
identity, incompatible report, or changed compiler is an error with exit status 1.

The compiler supplies the selected artifact, manifest digest, layout digest, and
target facts. These must match. Manifest and layout comparisons use exact input
bytes, so even a configuration-only formatting change requires matching snapshots.
Source formatting and line movement do not change callable matching.

Text output puts explanations beside the relevant change. Effect permissions
are labeled as allowed effects. A permission change with unchanged inferred
effects states that result explicitly. Introduced effects identify a checked
operation, an assumed external bound, or a possible call-bound effect. Changed
contracts retain an explicit unknown-strength explanation. An empty comparison
states that behavior was not compared. Text output has no general footer;
JSON retains the full comparison limits.

Changed contracts are shown field by field, with unchanged fields omitted.
Parameter and returned-view indices are zero-based. Each changed precondition
or postcondition includes its declaration-wide proof status and runtime-check
reason. Parameter types, modes, noescape, return requirements, returned-view
sources, trust bounds, and unrecognized metadata remain visible when changed.
Callable additions and removals show their present and absent fields.

A simple parameter-preservation outcome change reads:

```text
storage guarantee for parameter(0): .Ready removed; .Gone added
  Backing storage remains usable; bytes may change.
```

This explanation requires a complete canonical contract with one preservation
clause for the same parameter, two explicit outcomes, and unchanged simple
access clauses. Projections, premises, unconditional preservation, overlapping
guarantees, and other forms keep the exact contract text. The formatter does
not infer a strength relation or reinterpret an unknown form.

A raw callable assertion identifies the source location, states the
programmer's assertion, and explains that construction does not call the
function. It does not present address validity as compiler proof. Other
assertion kinds retain their reported authority, operation, and asserted fact.

Callable identities come from checked module-qualified symbols. The tool reports
added and removed callables, direct and proved transitive effects, declared and
propagated effect bounds, denied effects, and trusted assertion changes. Assertions
are multisets of compiler facts: a changed assertion appears as a removal and an
addition. Source positions locate evidence but do not identify an assertion.
For each introduced effect, the tool follows reported call edges to a source
operation or an explicit callable bound. It does not infer new effects.

Each source origin has an explicit variant. A `source` origin carries a mapped
path, byte span, and start and end coordinates. An `unavailable` origin contains
only `kind` and the reason `source span is unavailable in the authenticated source map`.
The tool rejects unknown variants, malformed coordinates, and any path or
coordinates attached to `unavailable`. It retains known effects, checked callable
identities, and dependency paths when a location is unavailable. Text output
prints `source unavailable` and the reason. It does not invent a file or position.
Location availability and line movement alone do not change semantic facts.

Each callable also exposes checked parameter modes, noescape, result types and
origins, result-observation requirements, preconditions, postconditions, canonical
storage/concurrency contracts, and structural trust bounds. The comparison reports
changed contracts independently from effects. It preserves declaration-wide proof
status and runtime-check reasons. It reports contract strength as unknown: neither
expression text nor an effect set supplies a proof of strengthening or weakening.

An unchanged effect set does not establish unchanged program behavior, purity,
allocation, or storage guarantees. A declared upper bound is permission; it does
not mean every call performs all permitted effects. Proved effects describe
static checked operations and retain external or indirect call bounds. They do
not report runtime frequency. Inspection does not write artifact output.

Run the tests with the current compiler:

```sh
cargo build --locked --manifest-path wync/Cargo.toml
node --test wync/tools/compare-compiler-facts/*.test.mjs
```

Set `WYNC_BINARY` to select another built candidate. Unit tests cover matching,
bound and checked-contract changes, source variants, trust changes, incomplete inputs, and deterministic
rendering. Capture tests run actual checks, reject invalid source and incompatible
layouts, and compare artifact bytes before inspection, after inspection, and
after a rebuild. A bundled generic trap retains its known operation and dependency
path when its source span is unavailable; ordinary and imported user generic
operations retain their mapped locations. These tests do not measure reader comprehension.

`proof.test.mjs` also checks the shared source-position query:

```sh
wync explain proof PROJECT --artifact NAME --source src/module.wyst \
  --line 12 --column 8 --format json
```

The CLI uses one-based UTF-8 byte positions. The `wync/proof` editor request uses
zero-based UTF-16 positions. The tests require identical checked records, exact
`first_if_kept` evidence, explicit unavailable states, current dependency hashes,
and unchanged archive and interface bytes. The owning specification is
[Inspection reports](../../../design/inspection-reports.md).

To inspect a function without finding a source position, use its exact qualified
name. Select an `operationId` from the JSON result for a focused query:

```sh
wync explain proof PROJECT --artifact NAME \
  --function MODULE.FUNCTION --format json
wync explain proof PROJECT --artifact NAME \
  --function MODULE.FUNCTION --operation ID --format json
```

Keep the same compiler executable and checked inputs between these commands.
A changed dependency or artifact configuration invalidates the operation ID.
The query repeats checking; it does not read an earlier report as proof.

[Compiler-assisted review](../../../docs/compiler-assisted-review.md) combines
the comparison, proof, resource, and execution reports for a Wyst program change.
