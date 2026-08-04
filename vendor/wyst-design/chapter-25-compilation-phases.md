---
title: "Chapter 25: Compiler Pipeline"
group: chapter
chapter: 25
order: 25
summary: "The current compiler data flow from source input to reports and artifacts."
---

# Chapter 25: Compiler Pipeline

The compiler is an ordinary typed Rust data pipeline. Function parameters and
return types describe which results a computation consumes. One explicit
in-memory build session may memoize those closed results and derive a dependency
graph, but the session is orchestration metadata: it is never a language,
diagnostic, interface, ABI, or artifact authority.

This chapter adds no source syntax, CLI mode, ABI rule, object format, or report
kind. It describes the current implementation shape so contributors can find
the relevant code.

## Current Data Flow

The main build path is:

```text
build inputs and source files
  -> manifest validation and named-artifact build plans
  -> selected project source graph
  -> independently parsed immutable per-file products
  -> file-local normalization and derived module dependency components
  -> compile-time selection and generic instantiation
  -> semantic checking and layout evaluation
  -> per-module semantic interfaces
  -> IR construction and verification
  -> reference execution and semantic trace (inspection path), or
  -> typed artifact reference graph and root closure (artifact path)
  -> artifact-specific semantic interfaces
  -> deterministic scheduling and backend type erasure
  -> ABI classification, fragmented register allocation, and AArch64 lowering
  -> per-module native objects
  -> archive assembly or final placement and integrated linking
  -> static-library pair or final ELF artifact
```

The concrete build functions live in `wync/src/compiler/mod.rs` and are called
directly by the CLI and test helpers. `BuildSession` is the sole mutable
orchestration owner for memoized values and measurements within one process;
the compiler functions remain pure over their explicit inputs. Small state
types are used where they prevent mixing different representations, such as
parsed, normalized, and instantiated
ASTs, unverified and verified IR, machine images, placement results, and final
artifacts. The compiler alone constructs instantiated ASTs, so downstream code
cannot bypass compile-time selection or generic expansion. A state type should
remain only while that distinction makes the implementation safer or clearer.
These states are concrete compiler-owned types rather than generic product
wrappers; their names and accessors state exactly which representation they
contain.
Checked source and layout states keep each instantiated tree together with the
semantic facts derived from it, so IR construction cannot mix results from
different frontend inputs. Each parsed file retains its own source identity and
file-local spans. A mapped source is a diagnostic and inspection view over
those file owners; no frontend phase reparses a concatenated whole-program
adapter.

## Incremental Session Boundary

Per-file products retain logical path and source-graph identity, source role,
content digest, parsed syntax, canonical module identity, imports, target facts,
and normalized source facts. Parsing and file normalization are pure and
independent files may run in parallel. The session memo contains only closed
typed products: normalized ASTs, checked frontend pairs, authenticated semantic
interface graphs, verified IR, typed artifact reference graphs, type layout,
callable ABI, machine code, native objects, placement, and final artifacts. A cache hit returns the same Rust
product type that a clean computation returns; no raw representation plus a
separate checked bit, side table, or convention is admitted.

Every memo key uses `wync.semantic-fingerprint.v1`. Relevant inputs are named
individually and include the compiler identity, `wync.build-session.v1` cache
schema, catalog aggregate and semantic-interface schema digests, logical source
paths and contents, target and layout facts, safety/hardening/debug/unwind/frame
policies, direct upstream products, and every consumed semantic-interface
digest. Changed named inputs are the invalidation explanation. File parse keys
deliberately omit catalogs, target facts, and artifact policy because those are
not parser inputs.

Dependency metadata uses canonical declared module identities and import edges.
Strongly connected module components are atomic invalidation units; source byte
offsets and import-local aliases do not identify declarations or components.
The metadata can schedule work and report edge counts, but semantic-interface
resolution and typed compiler products remain authoritative.

The memo boundary is process-local. Artifact-producing builds additionally use
an advisory compiler-private cache of canonical semantic-interface/native-object
pairs across processes. It is enabled by default when a safe platform user
cache is available: `~/Library/Caches/wync` on macOS,
and `$XDG_CACHE_HOME/wync` (or `~/.cache/wync`) on other Unix hosts.
`WYNC_CACHE_DIR` selects a deterministic alternate root;
`WYNC_CACHE_MAX_BYTES` selects the byte cap, whose default is one GiB and whose
value `0` disables persistent reuse. Hosts without equivalent owner, mode, and
interprocess-lock admission treat persistent storage as unavailable. Missing,
busy, inaccessible, unsafe, or unbounded cache storage is a miss and never
changes build acceptance or diagnostics.

The persistent action fingerprint includes the SHA-256 digest of the running
`wync` executable, cache and interface schema identities, target and artifact
policies, the owning dependency-cycle component's source and interface
identities, exact owning complete interface digest, typed imported-subject
semantic identities, and typed component reachability. Selected imports use
the authenticated record closure of the selected declaration; a retained
whole-module import uses the provider semantic identity. Constant-value,
generic definition/materialization, source-mandated expansion, effect,
resource, target, layout, safety, hardening, and reachability changes therefore
flow through their typed interface or artifact-graph records rather than file
timestamps. Strongly connected components publish and reuse atomically.

The cache has two interface identities. SHA-256 of all canonical bytes binds
the paired object and detects corruption. A versioned semantic identity strips
only authenticated diagnostic locations and decides whether provider
invalidation stops. A private owner edit may leave dependents reusable only
when both that semantic identity and the typed artifact-reachability summary
remain unchanged; the owner object still changes through its component-source
input. A reachability change may invalidate an object without widening source
semantics.

Persistent state is accepted only from a user-owned tree with owner-only
permissions. Symlinks, special files, additional hard links, wrong ownership,
unsafe modes, incomplete entries, stale schemas or compiler identities, digest
or module mismatches, and decode failures are rejected. Publication writes and
syncs a complete pair before an atomic directory rename and occurs only after a
successful authenticated build. Bound enforcement and deterministic
oldest-entry/key eviction run under the same process lock; if the tree cannot
be safely measured or pruned, the compiler skips the cache. Cache content is
never trusted multi-user input and there is no remote cache protocol.

Function-granular semantic invalidation, persistent compiler-private IR,
incremental section movement, relocation or veneer repair, debug/unwind
patching, and in-place final-artifact patching are not part of this contract.
Every build still produces a fresh deterministic archive or executable from
the selected cached and rebuilt `ET_REL` products.

Project orchestration first derives all named-artifact plans from one validated
`wyst.project`, then selects a plan for build, check, report, or editor use. The
plan is a closed immutable value containing module inputs, planned interface and
object owners, layout and assembly steps, outputs and policies, and external
tools. Current external-tool steps are empty because object emission, archive
construction, and final linking are integrated. Produced interfaces and objects
must match the planned compilation-unit module identities and authenticated
digest pairs before archive or link assembly consumes them. A layout unit may
intentionally share a module name with a source unit; its distinct interface
digest preserves the pairing.

Before machine lowering, completely verified typed IR is reconciled with every
independently decoded per-module semantic interface. The artifact path then
derives `optimizer.reference-graph`, closes its typed roots and edges, prunes an
artifact-owned verified-IR value, and re-emits artifact-specific interfaces.
Each retained direct call
and inline expansion must resolve to its exact provider callable or concrete
generic definition, with matching ABI, effects, entry levels, terminality,
resource/lease relations, mandatory-inline status, and interactive protocol.
Native-object production repeats this closure check and additionally
reconciles typed calls with `CALL26` relocation intents. These are validation
gates over existing products, not a second name-resolution or type-inference
phase.

The semantic-complete verified-IR product remains available to reference
execution, effects, storage semantics, editors, and other semantic consumers.
Only the artifact path derives and consumes its pruned verified-IR value.
Scheduling and type erasure construct a backend-owned allocation product
containing scalar/vector components and a complete map to typed values, layout
pieces, and source provenance. Register allocation and instruction selection
consume that product; backend allocation and graph facts never flow back into
source semantics.

## Data Dependencies

A computation receives the values it needs directly. Adding or changing a
language rule therefore requires updating the affected Rust calls, types, and
fingerprint inputs. Session dependency metadata mirrors declared imports for
scheduling and invalidation only; it cannot supply a missing semantic fact.

Some ordering rules are language semantics rather than pipeline bookkeeping.
For example, compile-time selection and ordinary constant evaluation cannot use
final section addresses because placement has not happened and source meaning
must not depend on backend placement. Those rules are checked where the
language construct is evaluated and diagnosed in terms of that construct.

## Diagnostics

The code that detects an error creates the diagnostic. Text, JSON, and LSP
renderers only present that diagnostic and do not change whether the program is
accepted. Shared rendering helpers exist to keep the formats consistent; they
are not a second semantic authority.

## Reports and Reference Execution

Lowering, effects, and storage reports are views over completed compiler
results. Their constructors receive the specific values needed by the current
report. Report data is never passed back into parsing, semantic checking,
lowering, or artifact construction.

Reference execution is a terminal consumer of the same verified typed IR. It
also consumes the selected artifact's hardening policies, the compiler-owned
generic-instantiation identities, authenticated semantic-operation records,
materialized-sum layouts and active payload types, resource transitions, and
cleanup ranges. It neither constructs an evaluator-specific AST nor passes
execution results into ABI or AArch64 lowering. Checked A64 remains an explicit
unsupported execution result until a separate executable instruction-semantic
implementation exists.

This one-way flow follows naturally from the call graph. It does not require a
report-only phase ID, provenance envelope, or runtime dependency check.

## Timing Instrumentation

Timing events are optional observations of host work. Build-session reports use
the versioned `wync.edit-build-report.v1` JSON shape and record per-stage wall
time, peak retained session memory, work-item and dependency-edge counts,
reused/recomputed products, invalidation causes, and fingerprint input names.
Their labels are for performance investigation only and do not define compiler
semantics or a stable public phase model. The edit fixture matrix is maintained
under `wync/tools/edit-build/`; every session result is checked against a fresh
stateless computation.
