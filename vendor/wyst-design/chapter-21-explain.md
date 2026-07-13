---
title: "Chapter 21: Explain Reports"
group: chapter
chapter: 21
order: 21
summary: "Lowering, effects, storage, and provenance reports that connect source to machine behavior."
---

# Chapter 21: Explain Reports

Wyst explain reports are read-only compiler artifacts. Running an explain report
must reuse the ordinary frontend, IR, ABI, ARM64 lowering, object placement, and
metadata paths, and must not change emitted code, project output files, release
artifacts, diagnostics, or source semantics.

Read explain reports as inspection tools: they connect source code to IR,
effects, storage, object placement, and emitted bytes. They should not be used
as a second source of language semantics. The report schema bundle is
versioned as `wync.reports.v0` in [source-of-truth.md](source-of-truth.md);
individual report schemas are named below.

## Lowering Report

`wync explain lowering <project-dir|path/to/wyst.project> --function <name>`
emits the source-to-machine report for a project build. The report is
project-only so target profile, layout, source graph, and output policy all
come from `wyst.project`.

The stable schema is `wync.explain.lowering.v0`. Text and JSON forms carry the
same facts:

- source graph and source span for the selected function;
- typed IR for the selected function;
- Native ABI facts, register homes, and stack slots where the backend has them;
- final frame composition facts after ABI lowering and register allocation,
  including fixed frame bytes, maximum outgoing call bytes, maximum total stack
  bytes, spill-slot counts, and per-component source or ABI reasons for local
  stack objects, spill/reload slots, outgoing argument areas, caller-owned
  aggregate copies, indirect-result storage, alignment padding, and
  assembly-required save areas;
- ARM64 instruction offsets, encodings, emitted bytes, source-row provenance,
  and decoded operation names where the bootstrap decoder knows them;
- text relocations with symbolic and resolved operands;
- the built-in report-only target descriptor used for estimates, including
  latency/throughput entries and explicit `codegen: not-consumed` provenance;
- the selected function's read-only `critical_path` dependency estimate over
  typed IR values, with per-step latency, cumulative latency, and fallback
  markers for classes not covered by the descriptor;
- target assumptions, optimization mode, effects summary, provenance labels,
  and freshness state for reported facts.

Every reported fact names a provenance layer and uses `current-run` freshness.
Additional freshness states must not reinterpret `current-run`.

Unrecognized shapes fail closed: explain lowering accepts project builds only,
and unknown function names are diagnostics rather than empty reports.

## Effects Report

`wync explain effects <project-dir|path/to/wyst.project>` emits the memory/effect
report for a project build. The optional `--function <name>`
filter narrows the report to one typed IR function; without it the report covers
all non-vector-slot functions in deterministic symbol order.

The stable schema is `wync.explain.effects.v0`. Text and JSON forms carry the
same facts:

- active `#deny(...)` policy regions, including the function scopes they apply
  to;
- direct call sites, indirect function-pointer call sites, and explicit value
  dependencies for those calls;
- atomic operations with source memory order;
- volatile/MMIO loads and stores preserved as IR memory flags;
- `pub` API/protocol boundaries and calls crossing those boundaries;
- `[aapcs]` external ABI boundaries;
- provenance labels, fact basis (`proven` or `asserted`), freshness state,
  source spans, active denies, dependency reasons, and source lines for every
  reported effect fact;
- `trustedFact` labels on asserted trust-boundary facts, including
  `#trusted_cast`, raw-address assertions when represented in IR, foreign ABI
  declarations, ABI overrides, and inline-assembly effect/clobber assertions.

The effects report does not use aliasing folklore, optimizer deductions, or
undefined-behavior assumptions as evidence. Each reported fact is tied to source
policy, source attributes, typed IR values, or target ABI declarations and uses
`current-run` freshness. A `proven` fact is checked by the compiler pipeline for
the current run. An `asserted` fact is an unverified programmer assertion under
the Chapter 1 trust-boundary model; if it is false, the report does not treat it
as general-purpose undefined behavior.

The effects report does not report generated backend resources such as frame
bytes, compiler-owned stack slots, spills, reloads, register-class usage, code
size, veneers, or caller-owned aggregate copies. Those facts are post-lowering
constraints and belong to lowering, ABI, object, generated-manifest, or storage
reports.

## Storage Report

`wync explain storage <project-dir|path/to/wyst.project>` emits the
storage-contract, dynamic-array descriptor, typed-handle, and buffer/string API
reports for a project build. The report is read-only and uses the same project
frontend as ordinary builds; running it must not write output files or change
the emitted ELF.

The stable schema is `wync.explain.storage.v0`. Text and JSON forms carry the
same facts:

- explicit arena-storage initialization calls;
- shared byte-storage initialization, push, reserve, and reset calls;
- storage identity, capacity, alignment, zero/no-zero behavior, growth policy,
  failure policy, operation role, and source location for each recognized API
  call;
- `[dynamic]T` descriptor annotations, with explicit `annotationAllocation: none`;
- dynamic-array typed-wrapper calls for initialization, push-by-value,
  push-from-address, reserve-only, allocate-slot, initialize-slot, and
  commit-slot operation shapes;
- the ergonomic `dyn_array_init<T>(arena, capacity = ..., growth = ...)` source
  spelling and full assignable descriptor-path method surface, reported as
  typed-wrapper facts;
- data pointer, length, capacity, storage identity, growth/failure policy,
  movement policy, address-stability policy, typed wrapper, and byte-storage
  provenance for dynamic-array facts;
- read-only dynamic-array descriptor projections for those facts, with no
  typed getter API for descriptor-state reads;
- typed-handle wrapper calls for stable-index container initialization, handle
  creation, valid access, and stale-handle rejection;
- container identity, population identity, capacity when present, slot index,
  expected and observed generation, failure policy, movement policy,
  address-stability policy, stale-check rule, outcome, and source location for
  typed-handle facts;
- buffer and string wrapper calls for buffer initialization, slice append,
  string append, and string-to-C-string conversion;
- buffer descriptor, input, length, capacity, storage identity, growth/failure
  policy, byte-storage provenance, allocation boundary, scan behavior, copy
  behavior, sentinel behavior, conversion cost, and source location for
  buffer/string facts;
- the storage vocabulary boundary that arena-first storage is not arena-only,
  with fixed buffers, pools, per-CPU storage, DMA-coherent storage, and
  target/runtime storage sources reserved as visible contracts outside core
  allocation semantics;
- provenance labels, fact basis, trusted-fact labels, freshness state, and
  `artifact-writes: none`.

The storage report recognizes explicit `arena_storage_*`, `byte_storage_*`,
`dyn_array_*`, `typed_handle_*`, `buffer_*`, and `c_string_*`
standard-library-shaped API calls, plus the checked dot-syntax surface for
`[dynamic]T` descriptors. It does not add core allocation semantics, infer
allocation from type annotations, invent hidden handle checks, invent implicit
C-string conversion, or treat allocation as a core `#deny` effect category.
Recognized storage, dynamic-array, typed-handle, and buffer/string API facts are
reported as `basis: asserted` with `trustedFact: library contract not proven from
a body`; their source location identifies the assertion site under the Chapter 1
trust-boundary model.
