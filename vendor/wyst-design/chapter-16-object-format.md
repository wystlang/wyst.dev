---
title: "Chapter 16: Wyst Object Format"
group: chapter
chapter: 16
order: 16
summary: "Emitted artifacts, ELF sections, symbols, relocations, deterministic output, and object-format boundaries."
---

# Chapter 16: Wyst Object Format

> **Canonical scope:** binary output format, section catalog, symbol table, relocation vocabulary.
> **Cross-references:** [chapter-06-types.md](chapter-06-types.md), [chapter-08-functions.md](chapter-08-functions.md), [chapter-09-memory-model.md](chapter-09-memory-model.md), [chapter-04-modules.md](chapter-04-modules.md), [chapter-05-boot.md](chapter-05-boot.md), [chapter-01-language-design.md](chapter-01-language-design.md) (Reproducibility Model, ABI Strategy), and [appendix-b-grammar.md](appendix-b-grammar.md).

Object format describes emitted artifacts, not source syntax. It builds on
modules, layout declarations, boot entry, and ABI classification.

> **Source-version boundary.** Object and relocation behavior is current.
> Predecessor address-access, categorized-conversion, and raw-descriptor
> examples are released-v0.8 source background. Chapter 6 owns and supersedes
> those spelling classes with address methods, named conversions, and
> `address.slice(elements = count)`.

## v0.9 Semantic Object Units And Canonical Symbol Identities (Current)

`wyst.objectInterface.v2` freezes the identity and generic-ownership contract used by the current
final-image compiler and by every later semantic interface, relocatable object,
archive, or linker. The current `ET_EXEC` writer does not expose public object
output, but every build constructs this product before artifact identity and
serializes it in the authenticated `.wyst.artifact` record set. A later object
writer must transport the same identities; it may not reconstruct a smaller
key from source names or ELF fields.

Each semantic module has exactly one `wyst.semantic-interface.v2` variant for
the selected language and interface schemas, authenticated target semantic
catalog and support manifest, Native ABI, executable-environment identity,
layout/root ABI and admission identity, and safety/trust/proof/hardening tuple.
The pre-safety-profile state writes
`wyst.safety-trust-hardening.inactive.v1` into all four reserved slots. Absence
is invalid and a consumer cannot supply a default. Execution-environment and
provider/service records participate atomically, so an imported module cannot
lose an `execution_suspension` provider requirement or other authenticated
environment dependency.

The module-specific `wyst.object-member-identity.v1` digest contains the
semantic-interface identity plus the object schema, code-generation profile,
the four safety/trust/proof/hardening slots, debug/unwind/frame policies,
backend identity, and generated-input identity. The separate homogeneous
`wyst.object-compatibility-key.v1` contains language/interface/object schemas,
target semantic catalog, support manifest, Native ABI, environment/provider
tuple, profile, safety/trust/proof/hardening tuple, debug/unwind/frame policies,
and backend identity. It deliberately excludes semantic-module, interface-
content, and member digests. Thus unrelated modules built under one exact
context share a compatibility key but retain distinct member identities.
Mixing compatibility keys, or including two variants of one semantic module,
is a hard error for one archive or final artifact.

Multi-file source parts declaring the same module contribute to one semantic
module variant. File names, discovery order, source `pub`, import aliases, and
re-export paths are not declaration identities. A declaration identity under
`wyst.declaration-identity.v1` is the length-delimited tuple of semantic module,
canonical declaration name, namespace, and declaration kind. Concrete generic
arguments do not change that declaration's home identity; their complete
canonical tuple participates in its symbol identity.

Every linkable declaration or alias has one `wyst.symbol-identity.v1` digest
over declaration identity, namespace and kind, Native ABI version, calling
convention (`wyst-native`, `aapcs64`, or `none` for data), complete concrete
generic arguments, and linkage mode. The `wyst.symbol-mangling.v1` internal ELF
spelling is the unambiguous module-qualified semantic declaration spelling plus
the canonical `__wgN__...` suffix for a concrete generic instantiation. The
digest, rather than the display spelling, authenticates kind, ABI, convention,
and linkage; object consumers compare it before ELF resolution. Internal
definitions are local/hidden. `export` adds a separate exact strong or weak
external alias identity, and `import symbol` retains its exact foreign
spelling. Neither `pub` nor any external alias changes the internal identity.
Two unrelated modules therefore have distinct internal identities and
spellings; they collide only by explicitly choosing the same external spelling,
which the whole-program verifier rejects deterministically.

A `per_cpu var` has one `per_cpu-template` declaration kind, storage-class
identity, and canonical local template symbol. Its `st_value` remains the
template-relative offset described below. Runtime core instances are derived
storage selected through the target execution environment. They have no linker
symbol, export alias, or independent semantic declaration identity.

## v0.9 Generic Instantiation Ownership And Transport (Current Contract)

`wyst.generic-ownership.v1` freezes generic ownership before public semantic
interfaces, relocatable objects, and archives are implemented. It consumes
`wyst.genericInstantiationKey.v0.9` from Chapter 6 unchanged. The key is the
canonical semantic declaration identity plus the complete ordered concrete
type-argument list and complete ordered value-argument list; the latter is
empty in v0.9. No interface, object writer, archive index, linker, cache, or
backend may select a generic from source spelling, parse `__wg` mangling back
into semantics, omit an argument, or define a second key. A function-pointer
type argument includes its calling convention, parameter/result contract, and
canonical fixed effect upper bound. Thus omitted and explicit
`effects(all)` share one type identity, reordered equivalent named bounds
canonicalize together, and genuinely different fixed bounds remain different
instantiation identities through inference, transport, emission, and
deduplication.

Every generic declaration has one **semantic home**: the module owning its
canonical declaration identity. A demanded concrete identity may be physically
emitted by the home or by any consumer that possesses the exact authenticated
`wyst.generic-transport.v1` payload and shares the object's complete
compatibility key. Such definitions use canonical hidden link-once linkage;
source `pub`, an import alias, archive position, and demand origin do not alter
the identity or grant external visibility. An explicit external alias, where a
later artifact surface permits one for a concrete instantiation, remains the
separate explicit-alias ABI/linkage identity and does not replace this hidden
definition.

The deterministic survivor is the lexicographically lowest object-member
identity among definitions whose complete definition contracts are identical.
The complete comparison includes instantiation and semantic-home identities,
object compatibility, body and dependency-closure digests, role and
effect/authority identities, ABI/calling convention, generated-definition
digest, and placement/root policy. Provenance from every identical copy and
every demand is unioned in canonical order onto that one survivor. A duplicate
from the same member, or any mismatch in that tuple, is a hard diagnostic;
archive order, command-line order, and first-wins behavior cannot select around
it. Machine-code identity alone is insufficient.

### Semantic body and private dependency closure

A source-public or otherwise interface-visible generic carries a canonical
type-checked body under `wyst.generic-body.v1` and its complete authenticated
`wyst.generic-dependency-closure.v1`. Their atomic envelope is
`wyst.generic-transport.v1`. This is a semantic representation, not raw source
text, a backend IR dump, or machine code. The envelope binds the declaration
identity and semantic home, source/interface-private visibility, body digest,
ordered dependency-closure digest, `wyst.generic-placement.v1` policy, and the versioned
declaration-role and effect/authority-summary slots. `wyst.semantic-interface.v2`
reserves all three slots now:

- generic body/dependency slot: `wyst.generic-transport.v1`;
- declaration-role slot: `wyst.declaration-role-claim.v1`, authenticated against
  `wyst.declaration-role-registry.v1` and its content digest without changing
  generic identity;
- effect/authority-summary slot:
  `wyst.effect-authority-summary-slot.reserved.v1`, activated by the versioned
  effect/authority contract without weakening a callable type argument's fixed bound.

Private generic declarations needed transitively travel as
`interface-private-dependency` bodies and acquire canonical hidden link-once
identities when concretely demanded. Presence in the closure never makes their
source spelling importable. A referenced private nongeneric function or storage
declaration instead carries only its canonical hidden home symbol and home
member identities. Its definition remains home-owned: an importing consumer
must link the exact home and may not clone the function, storage, initializer,
address identity, or provenance. Missing home code or storage is a hard
unavailable-definition error, not authorization to synthesize a replacement.

Authentication covers the entire envelope. Missing bodies, unknown schema
versions, noncanonical dependency order, duplicate dependency identities,
digest corruption, cache records built from another body/closure/policy, or a
consumer requiring another transport identity are unavailable, stale, or
incompatible-body diagnostics. Consumers fail before code generation. A cache
key contains the canonical instantiation identity, transport/body/closure,
role/effect identities, placement policy, compatibility key, backend and
generated inputs; changing any component invalidates the entry rather than
relabeling it.

### Demand worklist, archives, and linker role

Only ordinary typed reachability, a transitive request in an authenticated
body/closure, or an explicit `artifact_verify` root creates a concrete demand.
The `wyst.generic-demand-worklist.v1` map is keyed and popped by the
`wyst.genericInstantiationKey.v0.9` identity digest. Repeated exact demands
merge their canonical provenance; the canonical-instantiation exact-cycle and
strictly-growing-chain rules from Chapter 6 continue to govern expansion. A
different transport/cache tuple for the same key is a stale/incompatible
diagnostic, never a competing worklist entry.

`wyst.generic-archive-index.v1` maps a
`wyst.genericInstantiationKey.v0.9` identity to canonically sorted member and
transport identities. Merely containing or indexing a generic body,
definition, custom section, or semantic root never creates a demand. A real
demand may extract the indexed interface/home member and any already-emitted
definition candidates in canonical member order. Newly authenticated body
dependencies return to the compiler worklist. The final linker only checks
identities and identical-definition contracts, merges provenance, selects the
survivor, resolves relocations, and deduplicates. It performs no name
resolution, type checking, generic substitution, monomorphization, lowering,
or other semantic code generation.

### Placement and semantic roots

`#[align]`, `#[section]`, and the out-of-line consequence of
`#[inline, section(...)]` are part of the authenticated generic transport under
`wyst.generic-placement.v1`. `section` is passive and never creates a demand.
Once a code identity is demanded, every permitted emitter must produce the
same section contribution with the declared or natural alignment and one
`wyst.generic-semantic-root.v1` record. A custom section name remains exact. A
sectioned inline declaration retains one out-of-line copy even when all direct
calls expand. Final selection keeps exactly one contribution and one root while
preserving their placement digest and merged provenance. It may not move the
copy to `.text`, retain multiple roots, or repair a body/policy/layout mismatch
by preferring another emitter. Type-only struct and enum instantiations carry
no code contribution or semantic root.

The current whole-program compiler transports the
`wyst.genericInstantiationKey.v0.9` identity from
monomorphization through typed IR and records each concrete identity, semantic
home, physical member, hidden-link-once mode, complete argument lists, and
placement policy in the authenticated final artifact. The executable model in
`wync/src/generic_ownership.rs` fixes body authentication, closure visibility,
demand order, archive lookup, duplicate validation, provenance merge, and
survivor selection. The separate interface, object, archive, and link
milestones serialize and execute this already-versioned contract; they may not
invent a body format field, placeholder body semantics, fallback key,
archive-order rule, or linker-side instantiator.

## v0.9 `per_cpu` Object Contract (Current)

Chapter 8 owns the source semantics for `language.callable-storage-contracts`.
In the current whole-program `ET_EXEC` mode, every accepted `per_cpu var`
contributes exactly one entry to
the `.percpu` initialization template. Its source type fixes the entry's size
and natural alignment; its statically representable initializer fixes the
entry bytes and internal relocation records. Entries are placed
deterministically from the resolved import closure, and final placement fixes
the byte offset returned by `#percpu_offset_of`.

The canonical ELF symbol for a `per_cpu` entry is a non-address-bearing local
`STT_OBJECT`: `st_shndx` names `.percpu`, `st_value` is the entry's byte offset
within that template, and `st_size` is its natural-layout size. `pub` does not
change that binding because it is Wyst source visibility, not linkage. No
source operation may materialize the symbol as an ELF/process address.
Debug information may retain the declaration's name and type, but its variable
DIE has no `DW_OP_addr` location: serializing the template-relative offset as
an address would invent a false process address and bypass this identity rule.
An internal function used as a callable initializer contributes a real address
relocation. An ordinary mutable callable global is therefore initialized data,
never zero-filled `.bss`; a `per_cpu` callable stores the same resolved code
address in its template entry while retaining the callable's exact typed-IR
identity for every source access and indirect call.

The `.percpu` bytes are an immutable initialization template even when the
current static-image transport marks the containing load segment writable for
a later runtime copier. The template is never the live current-core instance.
The compiler emits no copied instances, allocation metadata, base setup,
startup copy, or ordinary-global alias. A v0.9 source contributes no TLS
payload, symbol, relocation, or size export. A selected v0.9 named layout emits
no `.tls` section or `PT_TLS`; a selected released-v0.8 layout may retain its
historical empty `.tls` compatibility row without admitting v0.9 TLS storage.

## v0.9 Placement and Initialization Attributes (Current)

The active placement surface is `#[align(N)]`, `#[section("NAME")]`,
`#[init(order = N)]`, and `#[cache_isolated]`. These are hard compiler
contracts carried from typed IR through final ELF construction; they are never
discardable metadata.

`#[align(N)]` raises an emitted subject's required final-address alignment.
The ELF writer combines natural, declaration, section-start, target, and cache
isolation requirements by maximum and inserts deterministic preceding padding.
The attribute neither increases the symbol's `st_size` nor retains an otherwise
dead declaration. Field and `per_cpu` layout consequences are specified in
Chapters 14 and 8 respectively.

`#[section("NAME")]` accepts one literal matching `\.[A-Za-z0-9_.]+`. The
selected artifact layout must declare that exact non-reserved name whenever a
contribution is emitted, and that layout declaration must state the compatible
`code`, `rodata`, `data`, or `bss` kind. The current named layout surface writes
this, for example, as
`section ".state": data in ram align 64`. Functions require
`code`, constants require `rodata`, initialized mutable objects require `data`,
and zero-filled mutable objects require `bss`, which emits writable
`SHT_NOBITS` storage. A missing or incompatible kind and any attempt to mix
incompatible contributions are hard errors. Per-contribution padding and
alignment are deterministic; applying the attribute retains the produced
contribution without exporting or renaming its symbol. A zero-sized
contribution still emits its declared section and symbol with zero size; it is
not erased merely because it has no payload bytes. A sectioned `#[inline]`
function retains exactly one out-of-line copy while all direct calls still
expand.

`#[init(order = N)]` emits one retained 16-byte `.initcalls` record: the first
word is the constant `u64` order and the second carries one absolute function-
address relocation. Final records sort by `(order, canonical semantic
declaration identity)`. The table therefore does not change when module
spelling, import aliases, `pub`, or export aliases change. The body may have a
custom section, but its metadata record remains in `.initcalls`; the attribute
does not call the function or synthesize startup control flow. A nonempty table
requires an explicit `.initcalls` layout section declared as `rodata` and
aligned to at least 8 bytes.

`#[cache_isolated]` requires an explicit selected cache-line width `L`, aligns
the object to at least `L`, and reserves
`round_up(max(#size_of(T), 1), L)` bytes of placement. The final artifact must
prove that the whole padded range is writable cacheable Normal memory and
shares no cache line with another live object. Padding is not part of the
source type or symbol size, creates no retention root, and implies no atomicity,
ordering, volatility, synchronization, or visibility semantics.

## v0.9 Named Layout Object Contract (Current)

An artifact-owned manifest layout clause selects exactly one named `layout`
block from its layout file. Its `entry` member resolves one exact
module-qualified Wyst declaration. That semantic selection supplies
`e_entry` and a reachability root but emits no alias, changes no source or ELF
name, and changes no binding. The optional `at` clause pins the resolved
declaration's first byte; without it, ordinary section constraints determine
the address. The QEMU EL1 and Raspberry Pi profiles require a zero-parameter,
unpinned Wyst Native function returning `never`, or the equivalent body-bearing
terminal label. The two QEMU EL2 profiles instead require the complete
`wyst.target-entry-schema.v1` root: `pub naked`, Wyst Native, exactly
`dtb: @u8 in x0`, `-> never`, authenticated EL2, and exactly one cataloged
checked stack transition from a `u64` value in `x1`. These ABI, register,
execution-level, stack-transition, and terminal checks complete before the
writer consumes the selection.

Typed IR is the semantic authority passed to the writer. It retains the typed
target-entry schema and digest when present, as well as the layout
block identity and dialect, declaration-ordered region access contracts,
declaration-ordered section kinds and normalized constraints with operand
provenance, the entry claim, and every typed layout-symbol expression. A
syntax-backed layout adapter may retain source structure for diagnostics, but
the writer must reject any mismatch instead of silently replacing an IR fact.

Each layout `section` declaration fixes the exact ELF name and its `code`,
`rodata`, `data`, or `bss` class. `in`, every `after`, and `align` become the
normalized constraints solved under Chapter 4. A `readonly` region can contain
only non-writable allocated sections; a `readwrite` region admits either, while
section kind still determines ELF flags. Section names are never renamed by
layout. Writer-owned non-layout outputs (`.debug_*`, `.symtab`, `.strtab`,
`.shstrtab`, and every `.wyst.*` section) cannot be declared as named-layout
sections. All origin, extent, alignment, fixed-address, section-offset, and end
computations are checked in unsigned 64-bit space.

A layout `symbol` is an explicit typed placement product. For
`symbol begin: @u8 = start(".name")` and the corresponding `end`, `st_value`
is the solved virtual address, `st_shndx` identifies the referenced section,
and `st_type` is `STT_NOTYPE`. For
`symbol extent: u64 = size(".name")`, `st_value` is the solved memory extent,
`st_shndx` is `SHN_ABS`, and `st_type` is `STT_NOTYPE`. An explicit
`address<u64>(start(...))` likewise produces numeric address bits and an
absolute typed value; the source type, not ELF's untyped value field, remains
the authority for Wyst consumers.

Layout symbols use `STB_LOCAL` independently of `pub`. `pub` exposes the typed
placement product through Wyst module visibility only; it does not export or
rename it. An explicit external `export` declaration remains the sole way to
request a global or weak linker alias, and semantic entry selection never
implies one. Synthesized debugger bookends remain local and are suppressed
when an explicit layout symbol declares the same canonical bookend name.
Explicit layout symbols retain layout-member declaration order in `.symtab`;
name-map order is not an artifact-ordering authority.

If any `#[init(order = N)]` record survives, the selected layout must contain
an explicit `.initcalls` section of kind `rodata` with alignment at least 8.
The writer supplies no default. The table may be bounded by explicit typed
layout symbols, but user `#[section(".initcalls")]` attributes remain invalid.

The placement writer must preserve checked-assembly block identity. It may
insert only cataloged and reported AArch64 NOP padding authorized by a block's
`asm align N` contract before that block's first instruction. It may not place
a literal pool, relaxation, veneer, thunk, or other synthesized instruction
inside a checked block. Typed fixups and fixed-placement/range obligations are
resolved exactly or diagnosed. Thus an out-of-range checked `bl`/`CALL26`
produces a hard diagnostic that retains the source instruction; it never uses
the ordinary direct-call veneer policy.

The released-v0.8 layout-directive rows in the hash-removal audit name ordinary
invalid source. Those forms survive only in the historical grammar snapshot
and removal audit; they never enter the parser, placement/object machinery, or
editor vocabulary.

Wyst's integrated compiler reads a set of source modules and emits a single
binary image in the current implemented artifact mode. There is no separate
assembler, no separate linker, and no intermediate object files written to disk
for the implemented `ET_EXEC` mode. Relocatable object files are a
future-version normative R8 surface (`wyst.language.v0.8` target 32) and do not
override the current single-image rules until Chapter 16 is updated for that
artifact mode.

## v0.9 Suspension And Context Summary Closure (Current)

Before any body-independent callable fact is admitted, one authenticated
sidecar atomically retains its exact or conservative effect bound, the bound's
exact authority, and the closed `context_stability` provenance of every
parameter, result, reachable aggregate field, and possible enum payload.
`effects(all)` uses bound tag 0 (`None`, conservative top) and therefore
includes `execution_suspension`; its distinct authority tag preserves whether
that top was declared, asserted, or conservatively supplied. Tag 1 carries a
32-bit count followed by exact effect-name strings in closed catalog order;
tag 1 with count zero is `effects(none)`. Top is therefore never confused with
an absent sidecar or an empty exact list. Unknown context provenance is
explicit and cannot cross a strand boundary.

Current source function syntax cannot author a context classification, and the
execution-strand contract does not activate portable provider accessors. The
compiler therefore emits ordinary parameter and result facts for current
ordinary Wyst and foreign declarations. Classified facts are accepted only when
their owner is a compiler-owned operation or an authenticated provider producer;
the consumer rejects a hand-edited or otherwise unsourced classified override as
incompatible transport. This admission rule is separate from the wire format:
the same codec preserves classified facts exactly once such a producer exists.

The canonical transport is `wyst.callable-context-summary.v2`; v1 is unsupported rather than aliased.
Its body order is exactly: the eight bytes
`WYSTCTX\0`; little-endian 16-bit version 2; a length-prefixed canonical
callable identity; the effect-bound tag and optional counted canonical effect
names; one `SuspensionEffectAuthority` byte; a 32-bit parameter count and
ordered provenance entries; and one result provenance entry. Exactly 71 ASCII
bytes spelling lowercase `sha256:` plus 64 hexadecimal digits follow the body
and authenticate every preceding byte. All multibyte integers are
little-endian and counts are 32-bit. A summary is at most 1,048,576 bytes; each
parameter, effect, path, or alternative count is at most 4,096 and each encoded
string is at most 16,384 bytes.

The exact effect/authority tags are:

| Byte field | Tag | Meaning |
| ---------- | --- | ------- |
| effect bound | 0 | conservative top (`None`) |
| effect bound | 1 | exact counted catalog-ordered effect list |
| suspension authority | 0 | `InternalProved` |
| suspension authority | 1 | `InternalDeclared` |
| suspension authority | 2 | `ExternalConservative` |
| suspension authority | 3 | `ExternalAsserted` |
| suspension authority | 4 | `IndirectKnownTargetsProved` |
| suspension authority | 5 | `IndirectKnownTargetsDeclared` |
| suspension authority | 6 | `IndirectConservative` |

`semantic-db.json` pins those tags and every one-byte provenance, stability,
origin, provider-authority, detach, escape, lifetime, path-segment, and Boolean
tag; unknown tags are never version-tolerated. Each provenance leaf retains
stability, origin, authority kind and digest, target/provider/accessor,
instance and generation identities, detach/escape/lifetime contracts, and
core/address-derived bits. Decoding against an authenticated interface
requires exact equality with the canonical callable signature and authority
map. Missing or extra summaries, corruption, truncation, a bound or authority
mismatch, unknown tags, duplicate facts, noncanonical effect/path/alternative
order, erasure, upgrade, or incompatible transport fails before any call is
admitted.

The current in-memory semantic-interface consumer, and every future public
object or archive consumer, derives one `strand_suspension_boundary` from each
imported call whose decoded bound contains `execution_suspension`, at the same
post-argument/pre-transfer position as a source-visible call. The summary does
not serialize a backend instruction, runtime hook, or optional optimization
hint. Inlining, devirtualization, tail-call formation, and any future archive
extraction or final linking preserve the boundary and its target/provider
provenance. The final marker itself contributes no symbol, relocation, code
byte, stack map, or metadata-driven runtime dependency.

Known-target indirect calls join decoded target bounds in closed catalog order
and require that result to equal the typed call-site bound before consuming it.
These sidecar and verifier rules are active compiler compatibility rules in the
current in-memory semantic interface. The reserved `static_library`
archive/companion remains feature-unavailable while portable provider accessors
are unavailable, so no current public object or archive emitter is claimed.
That future producer and every consumer must use the exact v2 contract rather
than inventing a bodyless-call exception or silently accepting v1.

## v0.9 Reserved Static-Library Contract

The project-manifest grammar accepts `static_library` with one source-module
root closure, primary archive path, companion semantic-interface path, target,
and explicit artifact policies. The kind has no entry and no layout. Source
`export` declarations are the future archive's native export roots; source
`pub` declarations are the companion's Wyst-visible authenticated interface.

This is a grammar, validation, and identity reservation, not an object writer.
Selecting the kind fails with the stable unavailable-feature diagnostic before
creating or replacing either path. No ELF executable is written under the
archive name, no partial `ar` container is produced, and no companion is
serialized. The future archive/companion producer must define both products
atomically before this boundary can change.

---

## 1. Scope and Goals

For the implemented `ET_EXEC` artifact mode, the Wyst compiler is
**whole-program, single-pass with respect to its output**:

- The compiler ingests every source module named explicitly or discovered from
  the project/root import closure in one invocation (see
  [chapter-04-modules.md](chapter-04-modules.md)).
- All cross-module symbol resolution, layout, relocation, and image
  construction happen inside that one invocation.
- No per-module relocatable `.o` files are written to disk in the current
  implemented mode. `wync -c` / `--emit-object` is reserved for the R8
  relocatable-object milestone.
- No external `ld` is invoked.
- No active `ar` archive or static-library companion format is defined.

The output of a successful compilation is exactly one **ELF64
little-endian AArch64 executable**.

```text
wync src/boot/hello.wyst src/runtime/uart.wyst src/boot/layout.wyst -o kernel.elf
```

`kernel.elf` is a complete, statically linked image. It has no dependencies on
a dynamic loader, no GOT, no PLT, no `DT_NEEDED` entries.

---

## 2. Output Format

### 2.1 ELF Discipline

The output is ELF64 (`EI_CLASS = ELFCLASS64`), little-endian
(`EI_DATA = ELFDATA2LSB`), with AArch64 machine value `EM_AARCH64 = 183`, executable
(`e_type = ET_EXEC`).

Position-independent executable output (`ET_DYN` with PIE semantics) is **not
supported**. All addresses are resolved to absolute values at compile time,
driven by the selected named layout's entry, region, and section constraints.

### 2.2 ELF Header

| Field                 | Value                                                        |
| --------------------- | ------------------------------------------------------------ |
| `e_ident[EI_MAG]`     | `0x7F 'E' 'L' 'F'`                                           |
| `e_ident[EI_CLASS]`   | `ELFCLASS64` (2)                                             |
| `e_ident[EI_DATA]`    | `ELFDATA2LSB` (1)                                            |
| `e_ident[EI_VERSION]` | `EV_CURRENT` (1)                                             |
| `e_ident[EI_OSABI]`   | `ELFOSABI_NONE` (0) — bare-metal default                     |
| `e_type`              | `ET_EXEC` (2)                                                |
| `e_machine`           | `EM_AARCH64` (183)                                           |
| `e_entry`             | absolute address of the selected semantic entry declaration  |
| `e_flags`             | `0` — no AArch64-specific ABI flags defined by this contract |

### 2.3 Program Headers

The compiler emits one `PT_LOAD` segment per contiguous run of sections that
share load attributes (executable, writable, readable). Section-to-segment
mapping is deterministic and driven by the layout module:

- A run of executable sections (`.text`, `.wyst.vectors.*`) → one
  `PT_LOAD` with `p_flags = PF_R | PF_X`.
- A run of read-only data (`.rodata`) → one `PT_LOAD` with `p_flags = PF_R`.
- Non-`ALLOC` debug sections (`.debug_*`) are present only in the section
  table and are not mapped into a `PT_LOAD` segment.
- A run of read-write initialized data (`.data`) → one `PT_LOAD` with
  `p_flags = PF_R | PF_W`.
- A `.bss`-style zero-initialized run → one `PT_LOAD` with
  `p_flags = PF_R | PF_W` and `p_filesz < p_memsz`.

`PT_NOTE`, `PT_TLS`, `PT_GNU_STACK`, and `PT_GNU_EH_FRAME` are outside the
base image model.

### 2.4 Section Headers

A full section header table is emitted to support `readelf`, `objdump`, GDB,
and `gdb-multiarch` workflows. Section header content is informational; the
ELF program headers are authoritative for loading.

---

## 3. Section Catalog

Section names are **canonical**. The compiler emits its built-in artifacts
into the section names listed below; the layout module places those sections
but **cannot rename them**. User-defined section attributes (per Phase 6.3)
may add additional sections alongside this set; they cannot collide with
canonical names.

| Section               | Contents                                             | Flags         |
| --------------------- | ---------------------------------------------------- | ------------- | ---------- | ------- |
| `.text`               | Function bodies (default) and code from labels       | `ALLOC        | EXECINSTR` |
| `.rodata`             | Compile-time constants, string literals, jump tables | `ALLOC`       |
| `.initcalls`          | Kernel initcall metadata entries                     | `ALLOC`       |
| `.data`               | Initialized mutable globals                          | `ALLOC        | WRITE`     |
| `.bss`                | Zero-initialized mutable globals                     | `ALLOC        | WRITE      | NOBITS` |
| `.percpu`             | Immutable `per_cpu var` initialization template      | `ALLOC        | WRITE`     |
| `.wyst.vectors.<name>` | One target-owned section per `vector_table` declaration | `ALLOC        | EXECINSTR` |
| `.debug_info`         | DWARF 5 compilation unit DIE tree                    | (non-`ALLOC`) |
| `.debug_abbrev`       | DWARF 5 abbreviation tables for `.debug_info`        | (non-`ALLOC`) |
| `.debug_line`         | DWARF 5 line number program                          | (non-`ALLOC`) |
| `.debug_line_str`     | DWARF 5 line-program string table (file names)       | (non-`ALLOC`) |
| `.debug_str`          | DWARF 5 string table for `.debug_info`               | (non-`ALLOC`) |
| `.debug_loc`          | DWARF 5 location lists                               | (non-`ALLOC`) |
| `.debug_aranges`      | DWARF 5 PC → compilation-unit range table            | (non-`ALLOC`) |
| `.symtab`             | Symbol table (see §4)                                | (non-`ALLOC`) |
| `.strtab`             | Symbol name strings                                  | (non-`ALLOC`) |
| `.shstrtab`           | Section header name strings                          | (non-`ALLOC`) |

`.wyst.vectors.<name>` is named after its declaration. For example,
`vector_table el1_vectors: aarch64.el1 { ... }` emits to
`.wyst.vectors.el1_vectors`. Each such section carries the target profile's
2 KB alignment, exact 2 KB extent, and 16 fixed 128-byte slots described by
Chapter 14 §10.2. Source section and alignment attributes cannot rename or
weaken it.

`.percpu` is placed once in the image. A later runtime may copy its frozen bytes
to live instances, but the compiler performs no replication and the template
is not itself live storage. `.tls` is not a v0.9 section; any occurrence in a
released v0.8 artifact is historical compatibility material. See §7.

---

## 4. Symbol Table

The `.symtab` includes one entry per:

- emitted address-bearing top-level declaration (function, label, constant,
  or ordinary mutable global) as a local semantic/debug identity, independently
  of source `pub`. `per_cpu` entries are the local offset symbols defined by the
  current v0.9 contract above.
- each explicit `export` mapping as a distinct external alias of its local
  target, with the requested strong or weak binding.
- Explicit typed layout symbol (`start`, `end`, `size`, or a typed numeric
  placement expression).
- Compiler-created initcall metadata symbols named as specified in §4.3.
- Section start symbol (synthesized: `_section.text_start`, etc., for
  debugger convenience). These are local symbols.
- Function and label body starts (private and public alike), to enable
  source/debug lookup. Private functions and labels get `STB_LOCAL`.

### 4.1 Binding

| Binding      | When emitted                                                 |
| ------------ | ------------------------------------------------------------ |
| `STB_LOCAL`  | Internal semantic/debug declarations, layout symbols, every `per_cpu` offset symbol, synthesized symbols |
| `STB_GLOBAL` | Strong explicit `export` aliases and compiler-created initcall metadata |
| `STB_WEAK`   | Explicit `export weak` aliases                               |

### 4.2 Type

| Symbol kind           | `st_type`                                                                  |
| --------------------- | -------------------------------------------------------------------------- |
| Function              | `STT_FUNC`                                                                 |
| Mutable global        | `STT_OBJECT`                                                               |
| Constant in `.rodata` | `STT_OBJECT`                                                               |
| Initcall metadata     | `STT_OBJECT`                                                               |
| Label (§2.4)          | `STT_NOTYPE` — executable text symbol, but not a callable function symbol |
| Section start         | `STT_NOTYPE`                                                               |
| Layout symbol         | `STT_NOTYPE`                                                               |

A label symbol's section index points at an executable text section and its
size covers the emitted label body. Tools must not infer function-call
prologue, epilogue, or return semantics from a label symbol; source-level
`goto` legality comes from the Wyst symbol kind, not from ELF `STT_FUNC`.

`STT_TLS` is **not** used. A `per_cpu` entry is a local `STT_OBJECT` whose
value is its byte offset within `.percpu`; it is an offset identity rather than
a process address. The selected target access sequence consumes that offset.
Wyst v0.9 emits no TLS symbol.

### 4.3 Internal And External Names

An explicit `export` alias is written to `.symtab` with exactly the decoded
`as symbol "..."` bytes; an export without an alias uses the source declaration
name. `pub`, source imports, and source aliases do not participate in this
choice. Distinct explicit exports of one declaration produce distinct symbol
table entries with the same value and independently selected `STB_GLOBAL` or
`STB_WEAK` binding.

The current whole-program emitter gives every internal declaration a stable
module-qualified semantic identity for debugging and relocation resolution,
independent of `pub`, source imports, and export aliases. A separate
source-facing lookup/display spelling may remain local inside the compiler; it
is never an external claim and cannot replace the semantic identity in ELF.
The semantic-object-unit contract freezes the canonical encoding for these
identities before relocatable objects are exposed; that later encoding cannot
change the external spelling selected here.

Compiler-created initcall metadata symbols are an explicit exception. Every
`#[init(order = N)]` function emits one 16-byte `.initcalls` entry and one
metadata symbol whose value is the address of that entry and whose size is 16:

```text
initcall-symbol = "__initcall_" order-hex "_" qualified-function
order-hex       = 16 lowercase hexadecimal digits for the `u64` order
qualified-function = path-component ("__" path-component)* "__" function-component
```

`qualified-function` uses the source module path components followed by the
function name. Each component is encoded as ASCII alphanumeric bytes unchanged,
`_` as `_u`, and any other byte as `_x` plus two lowercase hexadecimal digits.
The module separator `.` is structural and becomes the `__` component separator,
not an encoded byte. For example, the current declaration
`#[init(order = 10)] fn early_console_init() {}` in module `drivers.uart`
emits:

```text
__initcall_000000000000000a_drivers__uart__early_uconsole_uinit
```

Concrete generic instantiations are the other mandatory encoding exception.
Every implementation must write the same `.symtab` name for the same generic
declaration and canonical concrete type-argument tuple in Wyst's current
type-parameter-only generic model:

```text
GenericSymbol = DeclarationName "__wg" Arity "__" TypeComponent
                ("__" TypeComponent)*
Arity         = decimal count of type arguments
```

Examples:

| Source-facing instantiation | ELF symbol name              |
| --------------------------- | ---------------------------- |
| `identity<u64>`             | `identity__wg1__u64`         |
| `Pair<u64, bool>`           | `Pair__wg2__u64__bool`       |
| `wrap<Box<u64>>`            | `wrap__wg1__Box__wg1__u64`   |
| `same<Mode>`                | `same__wg1__t_Mode`          |

The marker `__wg` is reserved for compiler-generated generic instantiation
symbols. Source top-level declarations must not contain `__wg`, including
names such as `swap__wg1__u64`, because those names occupy the generated
symbol namespace.

Type components use this canonical ASCII encoding:

| Type argument shape                 | Type component                                    |
| ----------------------------------- | ------------------------------------------------- |
| Built-in scalar type                | The built-in spelling, such as `u64`, `bool`      |
| Monomorphic nominal type            | `t_` plus the escaped canonical declaration name  |
| Concrete generic nominal type       | That type's own `GenericSymbol`                   |
| Pointer `@T`                        | `ptr_` plus `T`'s component                       |
| Volatile pointer `@volatile T`      | `vptr_` plus `T`'s component                      |
| Slice `[]T`                         | `slice_` plus `T`'s component                     |
| Dynamic array `DynamicArray<T>`     | `dyn_` plus `T`'s component                       |
| Fixed array `[N]T`                  | `array_` plus escaped `N`, `_`, then `T`          |
| Vector `[T:N]`                      | `vec_` plus escaped `N`, `_`, then `T`            |
| Tuple `(name: T, ...)`              | `tuple` plus arity, then escaped field/type pairs |
| Function pointer `fn(A, B) -> R`    | `fn` plus arity, parameters, and optional return  |
| Calling-convention function pointer | `fn_` plus escaped convention before the arity    |

Escaping leaves ASCII letters and digits unchanged, writes `_` as `_u`, `.`
as `_m`, and writes any other byte as `_xHH` using lowercase hexadecimal.
Imported exported type names first canonicalize to their declaring type name
before component encoding, so `flags.Mode` and the same type reached through
an import alias do not produce distinct ABI symbols.

The language-level canonical instantiation key also reserves a value-argument
list, which is empty in the current model because generic value parameters are
not part of Wyst. Any future feature that enables non-empty generic value
arguments must extend this public symbol encoding before it can expose such
instantiations in emitted artifacts.

This decision keeps `readelf -s kernel.elf` legible for normal source names
while still making generic instantiations stable for linkers, debuggers, and
out-of-tree tooling. Longer generic names increase `.strtab` size, but they do
not duplicate machine code beyond the monomorphizations already required by
the source program and do not add runtime-loaded data by themselves.

---

## 5. Relocation Vocabulary

Because the compiler is whole-program single-pass, **no relocations are
serialized to disk**. The output ELF has no `.rela.*` sections.

The relocation types below are the **internal** alphabet used during the
final link phase, between code generation and image write-out. They are
enumerated here so that:

- The IR specification (Phase 5.2) can reference them precisely.
- An external tool (linker, disassembler, debugger) that ever needs to
  inspect partially-linked Wyst output knows the closed set it might see.
- The relocation-origin discipline (§6) can name every source of patchable
  symbol, object, section, string, or future table references.

| Internal name  | ELF type code (AArch64 spec)          | Lowered from                                                                                  |
| -------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ADR_PG_HI21`  | `R_AARCH64_ADR_PREL_PG_HI21` (275)    | `adrp xN, sym` (high 21 bits of page-relative offset)                                         |
| `ADD_LO12`     | `R_AARCH64_ADD_ABS_LO12_NC` (277)     | `add xN, xN, :lo12:sym` (low 12 bits, no overflow check)                                      |
| `LDST8_LO12`   | `R_AARCH64_LDST8_ABS_LO12_NC` (278)   | byte load/store with `:lo12:` offset                                                          |
| `LDST16_LO12`  | `R_AARCH64_LDST16_ABS_LO12_NC` (284)  | halfword load/store                                                                           |
| `LDST32_LO12`  | `R_AARCH64_LDST32_ABS_LO12_NC` (285)  | word load/store                                                                               |
| `LDST64_LO12`  | `R_AARCH64_LDST64_ABS_LO12_NC` (286)  | doubleword load/store                                                                         |
| `LDST128_LO12` | `R_AARCH64_LDST128_ABS_LO12_NC` (299) | 128-bit load/store (NEON, `ldp`/`stp`)                                                        |
| `CALL26`       | `R_AARCH64_CALL26` (283)              | `bl sym` direct call                                                                          |
| `JUMP26`       | `R_AARCH64_JUMP26` (282)              | `b sym` unconditional branch (`goto`)                                                         |
| `CONDBR19`     | `R_AARCH64_CONDBR19` (280)            | `b.<cond> sym` (intra-function only — rarely needs relocation)                                |
| `ABS64`        | `R_AARCH64_ABS64` (257)               | 64-bit absolute pointer in `.data` / `.rodata` (function pointers, `#addr_of` stored as data) |
| `PREL32`       | `R_AARCH64_PREL32` (261)              | DWARF section-relative references                                                             |

**Out of scope** (reserved slots for future object-format extensions):

- `R_AARCH64_GOT_*` family — no GOT in static linking.
- `R_AARCH64_TLSGD_*`, `R_AARCH64_TLSDESC_*` — no dynamic TLS.
- `R_AARCH64_TLSLE_*` — no TLS storage class or TLS lowering exists in v0.9.
- `R_AARCH64_TLSIE_*` — initial-exec model not used.
- `R_AARCH64_COPY`, `R_AARCH64_GLOB_DAT`, `R_AARCH64_JUMP_SLOT` — dynamic linker only.

If future Wyst versions add dynamic linking, the GOT family slots in here
without breaking the static-only contract.

### 5.1 Page-Pair Discipline

Every code-to-data and code-to-code reference longer than ±128 MB uses the
`ADR_PG_HI21` + `ADD_LO12` page pair. Sub-±128 MB code-to-code calls use
`CALL26` or `JUMP26` directly. The choice is determined at codegen time
based on final-placement distance, which is known because the compiler is
whole-program.

The compiler synthesizes deterministic veneers for direct symbol `CALL26` and
`JUMP26` branches whose targets are outside the architectural branch range
after final placement. Each far direct symbol branch gets one veneer after the
source text chunk; the original branch targets that near veneer, and the veneer
materializes the final target address through the existing `ADR_PG_HI21` +
`ADD_LO12` relocation path before `br x16`.
This general rule excludes `.wyst.vectors.*`: a target-owned ARM64 vector table
has an exact `0x800`-byte extent with no veneer area, so an out-of-range slot
transfer is rejected instead of relaxed.
Out-of-range local backend `B26`, `CBNZ19`, and future `CONDBR19` forms still
emit hard errors until their own veneer policies are designed.

The compiler does not use literal pools for integer constants. Integer constants are
materialized deterministically with `movz` plus `movk` lanes from low to high,
omitting lanes that are zero. Symbol addresses use the page-pair discipline
above.

This means the spec **does not** define a `R_AARCH64_LDR_*` GOT-load encoding
for `#addr_of` — the load is always materialized as an `adrp` + `add` (or
`adrp` + `ldr` with `LDST*_LO12`) pair against the absolute symbol address.

---

## 6. Relocation Origins and Address-Expression Emission

Every relocation-producing operation has an explicit origin before final image
write-out. Current static `ET_EXEC` builds resolve these origins internally and
do not serialize `.rela.*` sections, but the compiler still keeps the origin
kind visible until the writer patches the emitted bytes.

| Origin | Produced by | Internal patch/relocation behavior |
| --- | --- | --- |
| Direct calls | IR `call` with a symbol callee | Emits a direct `CALL26` branch when in range; otherwise emits a deterministic veneer that materializes the target address with `ADR_PG_HI21` + `ADD_LO12`. |
| Direct symbol branches | IR `goto` / tail control transfer to a label or function symbol | Emits a direct `JUMP26` branch when in range; otherwise emits a deterministic veneer that materializes the target address with `ADR_PG_HI21` + `ADD_LO12`, except that fixed `.wyst.vectors.*` slots reject an out-of-range transfer. |
| Symbol materialization | IR `addr_of`, string-address materialization, and symbol-base materialization for constant-address `gep` | Emits `ADR_PG_HI21` + `ADD_LO12` page-pair patches in text, with byte addends folded only for constant offsets. |
| Object references | Global `ConstIr::Address`, slice/string descriptors, `per_cpu` direct-access patches, and `#percpu_offset_of` constants | Emits `ABS64` data patches for ordinary address constants or compiler-owned `.percpu` offset patches; `per_cpu` never becomes an address relocation. |
| Jump tables | Future explicit jump-table lowering records | Table entries are relocation origins. Current `switch-dispatch` mode does not emit jump tables or serialized jump-table relocations. |
| Address-bearing instructions | Checked inline assembly memory/address operands and future load/store address forms that carry a symbol target | Use the same address-materialization or low-12 load/store relocation records as ordinary compiler-generated instructions. |

`#addr_of(symbol)` (§7.1 of [chapter-05-boot.md](chapter-05-boot.md)) is the
only language-level address expression that introduces a symbol-sourced address
value. That narrower rule does not make `#addr_of` the only
relocation-producing origin in the compiler. `addr_of(local)` materializes a
stack-frame address at runtime and therefore does not participate in relocation
emission. Every other address expression in Wyst is either produced explicitly
from literal bits with `address<T>` or computed at runtime from values whose
provenance the compiler cannot trace.

The integrated linker uses the address-expression distinction directly:

| Expression form                                                    | Relocation behavior                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `#addr_of(sym)` in an expression                                   | Codegen emits `adrp` + `add` against `sym`. Linker resolves at final placement.                                                             |
| `element_offset(base, N)` for a symbol-sourced `base: @T` and constant element count `N` | One page-pair relocation against the symbol; the byte addend is `N * #size_of(T)` folded into the `ADD_LO12` immediate (or into the `ABS64` slot when stored to data). |
| `relens<@T>(byte_offset(relens<@u8>(base), B))` for constant byte count `B` | One page-pair relocation against the symbol; the byte addend is exactly `B`. |
| `element_offset(base, i)` for a runtime element count `i`          | Page-pair relocation for the symbol base only; runtime code scales `i` by `#size_of(T)` before the plain `add`, with no relocation on that add. |
| `#addr_of(sym)` in a constant initializer for a global             | Codegen emits an `ABS64` slot in `.data` / `.rodata`. Linker writes the resolved `sym + addend` into that slot.                             |
| `base.slice(elements = N)` in a global initializer                 | Codegen emits a 16-byte slice pair: an `ABS64` relocation in the `data` slot and a constant `u64` length.                                   |
| `addr_of(local)`                                                   | No relocation. Codegen emits ordinary stack-relative address materialization.                                                               |
| Integer literal conversion `address<@T>(0x40000000)`               | No relocation. The address is the literal.                                                                                                  |
| Computed `@T` (`element_offset(base, i)`, `relens<@u32>(ptr)`, `address<@T>(TPIDR_EL1.read().raw)`) | No relocation. The address is a runtime value.                                                                                              |

Global enum initializers are persisted using the representation in
[chapter-06-types.md §1.6.3](chapter-06-types.md). A payload-less enum writes
only the discriminator type's bytes. A payload enum writes 16 bytes: the tag
word at offset 0 and the payload word at offset 8. If the active variant has no
payload, the payload word is non-semantic inactive storage; the current writer
zero-fills it as part of ordinary deterministic data emission, but programs
must not rely on those bytes as a source-level value.

Typed addresses do not support plain `+` or `-`. `element_offset` counts and
scales elements exactly once, while `byte_offset` consumes an already byte-
measured count. Do not multiply `N` or `i` by `#size_of(T)` before passing it
to `element_offset`; that creates a relocation addend or runtime offset scaled
twice, and the
checker rejects the obvious `p + i * #size_of(T)` form. Relocation addends are
always measured in bytes. Byte addends must be spelled with an `@u8` lens or
with explicit `u64` arithmetic before casting back to the desired address type.

**Consequence:** Wyst does not have the C/C++ problem of "is this pointer a
relocatable symbol reference or an integer?" For address expressions, the
syntax tells the compiler whether it is materializing a symbol-sourced address
or ordinary address arithmetic. Direct calls, direct symbol branches, object
references, veneers, future jump tables, and address-bearing instructions are
separate relocation origins with separate patch records.

This is the contract that lets the integrated linker avoid carrying a full
relocation table to disk: every relocation site is a direct lowering of an
explicit IR node or lowering patch that names the target symbol, object,
string, section, or future jump-table entry, fully resolved before write-out.
Do not describe `#addr_of` or IR `addr_of` as the only relocation-producing
operation; it is only the source address-expression form that creates a
symbol-sourced address value.

See Phase 5.4 for the cross-link from [chapter-06-types.md §1.4.1](chapter-06-types.md) (Address
Types).

---

## 7. `per_cpu` Template, Offset, and Access Patches

For each entry, the integrated linker records and resolves:

1. the canonical source declaration and compiler symbol identity;
2. natural size and alignment from the source type;
3. deterministic padding and start offset within `.percpu`;
4. the exact initializer bytes and each symbol/section relocation contained in
   those bytes; and
5. every code or constant patch that consumes the final byte offset.

Relocations inside the template use the same internal relocation vocabulary as
other static initializer data and are fully resolved before `ET_EXEC` bytes are
written. No `.rela.*` section is serialized. A
`#percpu_offset_of(binding)` constant is patched to the binding's final start
offset, not to `.percpu`'s virtual address plus that offset.

A direct access patch names the entry and its source operation until final
placement. After the selected target/runtime contract has been validated, code
generation emits one fresh current-core base acquisition, adds or folds the
final byte offset plus a checked field/element offset, and emits exactly the
requested typed operation. The patch may choose an immediate or a deterministic
constant-materialization sequence, but may not become an ELF TLS relocation,
ordinary symbol address, cached-base frame slot, or address-valued export.

Template layout is deterministic for one complete build input. Offsets may
change when declarations, import closure, type layout, alignment, initializer
relocations, or layout policy change and therefore are not a stable cross-build
source ABI. Reproducibility evidence compares the complete template bytes,
symbols, relocations-before-resolution, final offsets, and consuming patches.

The object pipeline does not manufacture runtime behavior. It emits no
`__percpu_size` runtime allocator API, copied instance, startup routine, or base
installation unless a later semantic contract defines such an interface.
Before the production multicore per-CPU realization, a code patch for reachable
access is legal only with
`#target(..., per_cpu = single_instance_tpidr_el1)`: available,
`MRS TPIDR_EL1`, EL1+, 16-byte live-base alignment, reserved system state
`TPIDR_EL1`, realization `single-instance-test-runtime`. Otherwise compilation
fails. Declarations and offset constants alone do not select or imply that
realization.

The released-v0.8 TLS offset-query row, `.tls` template, `__tls_size`,
TPIDR_EL0, and associated address-materialization rules are historical and
produce no v0.9 artifact.

---

## 8. Sections from User Declarations

User code places a declaration in a custom section with the
`#[section(".name")]` attribute. The attribute itself is a retention root for
each concrete contribution it produces, but it neither exports nor renames the
declaration.

This source-level section request is checked against the layout. Under the
default documentation layout, `.modinfo` is intentionally absent, so this
contract fails until a layout declares the section:

<!-- wyst-contract: check-fail -->
```wyst
module object_demo

#[section(".modinfo")]
const MODINFO: u64 = 0x77697374
```

<!-- wyst-contract: sketch -->
```wyst
#[section(".init.text")]
fn bring_up_uart() { ... }

#[section(".modinfo")]
const UART_MODINFO: [16]u8 = "uart_pl011_v1"
```

The full semantics — legal placements, section-name constraints,
flag derivation, bookend synthesis, cross-module aggregation — are
specified in [chapter-04-modules.md](chapter-04-modules.md) under "Custom Sections from User
Declarations". The rules relevant to the object format are:

- **Reserved names:** all section names listed in §3 (`.text`,
  `.rodata`, `.data`, `.bss`, `.initcalls`, `.percpu`, `.tls`, the `.debug_*` family,
  `.symtab`, `.strtab`, `.shstrtab`) and any name starting with `.wyst.`
  are reserved. User code cannot target them with `#[section(...)]`;
  canonical sections are written by omitting the attribute. `.tls` remains
  reserved so removed v0.8 TLS syntax cannot be recreated as a misleading
  custom section, and it is not emitted by v0.9.
- **Flags are derived** from the declaration kind (function → `ALLOC |
  EXECINSTR`; constant → `ALLOC`; mutable initialized → `ALLOC | WRITE`;
  zero-filled mutable storage → `ALLOC | WRITE` with `SHT_NOBITS`). The ELF
  header is computed from this derivation, not from a user-supplied flag list,
  and incompatible contribution kinds may not share one custom section.
- **Bookend symbols** `__<section>_start` / `__<section>_end` are
  auto-synthesized with `STB_LOCAL` for every used custom section.
  Dots in the section name become underscores; the leading dot is
  dropped. Layout-module exports referencing the same range override
  these.
- **Concatenation order** is source-declaration order within a module,
  then deterministic module-import order across modules, matching the
  determinism contract in §11.

---

## 9. Out of Scope

These are explicit non-features of the object format. Each has a
documented path if needed.

| Feature                                         | Boundary                 | Future path                                                                                            |
| ----------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Per-module `.o` relocatable output              | Outside implemented base image model | Future-version normative for R8 target 32 as `wync -c` / `--emit-object`; would serialize the §5 relocation vocabulary into `.rela.*` sections |
| Dynamic linking (`ld.so`, `PT_INTERP`)          | Outside base image model | Requires GOT/PLT relocations, `R_AARCH64_GLOB_DAT`, `R_AARCH64_JUMP_SLOT`, dynamic symbol table        |
| Position-independent executables (`ET_DYN`)     | Outside base image model | Base output lowers against absolute addresses                                                          |
| Shared objects (`.so`)                          | Outside base image model | Same dependency on dynamic linking                                                                     |
| COMDAT / section groups                         | Outside base image model | `#[inline]` is the only deduplication mechanism; multiply-defined exports are a hard error             |
| Predecessor weak and hidden-visibility directives | Outside symbol model   | Use `export weak` for weak external definitions; hidden shared-object visibility remains undefined     |
| `init_array` / `fini_array`                     | Outside base image model | Wyst has no implicit static constructors; the selected layout's semantic `entry` is the only entry point |
| Exception unwinding (`.eh_frame`, `.ARM.exidx`) | Outside base image model | Wyst has no exceptions in the language sense; `vector_table` models hardware exception entry only      |
| ar archives, static-library companions          | Reserved grammar; outside implemented base image model | `static_library` selection fails before output; a future producer must emit the archive and authenticated companion atomically |
| Mach-O, PE, COFF output                         | Outside base image model | See §11.                                                                                               |

---

## 10. Determinism

Object format output is **bit-for-bit reproducible** under the
reproducibility contract (`chapter-01-language-design.md`, Reproducibility Model):
same compiler version, same build optimization mode, same target, the same
selected scheduling policies, and the same source input manifest produce byte-identical
ELF output.

Specific determinism requirements:

- Section virtual-address and file-offset order is determined by the layout
  module (`in` / `after` constraints) and Chapter 4's deterministic solve;
  declaration order remains authoritative within a section. ELF section-header
  indices use the fixed deterministic producer catalog and do not override the
  solved placement. No order depends on hashtable iteration.
- Symbol table entry zero is the null symbol. Every remaining `STB_LOCAL`
  entry precedes every `STB_GLOBAL` or `STB_WEAK` entry, and `.symtab`
  `sh_info` is the index of the first non-local entry. Within the local
  partition, internal declarations retain module-then-declaration order,
  explicit layout symbols retain layout-member order, and synthesized section
  symbols retain deterministic layout-section order. Within the non-local
  partition, compiler metadata retains its defined deterministic order,
  followed by explicit `export` aliases in module-then-declaration order;
  strong and weak aliases are not regrouped.
  Module order is the compiler source input order: explicit multi-file builds
  use command-line source order, while project and explicit-root import-closure
  builds use the canonical traversal from
  [chapter-03-project-builds.md](chapter-03-project-builds.md). Declaration
  order is source-text order.
- The `.shstrtab` and `.strtab` are built in deterministic producer order,
  never by hash-table traversal. `.shstrtab` follows the fixed section-header
  producer order (independently of solved virtual/file placement order);
  `.strtab` records internal declarations, explicit aliases, and synthesized
  section symbols in their deterministic producer order before symbol binding
  partitions are assembled. String
  deduplication is allowed only when it's an exact prefix-suffix sharing
  computed deterministically.
- No timestamps. The ELF header's `e_ident[EI_VERSION]` is the only field
  derived from "build state"; everything else is content-derived.

---

## 11. Future Object Formats

ELF64 is the base object format. Mach-O (Darwin) and PE (Windows / UEFI) are
plausible future targets — both have AArch64 variants and both are well-
documented. The §5 relocation vocabulary maps cleanly to each:

- Mach-O: `ARM64_RELOC_PAGE21`, `ARM64_RELOC_PAGEOFF12`, `ARM64_RELOC_BRANCH26`,
  `ARM64_RELOC_UNSIGNED`.
- PE (COFF): `IMAGE_REL_ARM64_PAGEBASE_REL21`, `IMAGE_REL_ARM64_PAGEOFFSET_12A`,
  `IMAGE_REL_ARM64_BRANCH26`, `IMAGE_REL_ARM64_ADDR64`.

Adding a new format does **not** require changes to the language, the IR, or
the relocation vocabulary — it requires only a new writer module that maps
§5's internal types to the foreign format's codes. The single-pass
whole-program model is preserved: the writer is the last stage.

No commitment to a release date for non-ELF formats. Listed here so that
section naming, generic-symbol encoding, and ABI choices are not made in ways
that would prevent a future port.

---

## 12. Cross-References

| Topic                                             | Canonical location                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| Module model and import resolution                | [chapter-04-modules.md](chapter-04-modules.md)                           |
| Layout module syntax                              | [chapter-04-modules.md](chapter-04-modules.md) ("Layout")                |
| Exception vector sections (alignment, slot rules) | [chapter-14-exception-vectors.md §10.2](chapter-14-exception-vectors.md) |
| `per_cpu` target/access lowering                  | [chapter-11-intrinsics.md §1.3.7](chapter-11-intrinsics.md)              |
| `#addr_of` semantics                              | [chapter-06-types.md §1.4.1](chapter-06-types.md); this document §6      |
| ABI (calling convention, register usage)          | `chapter-15-abi-spec.md`                                                 |
| Reproducibility contract                          | `chapter-01-language-design.md`, "Reproducibility Model"                 |
| IR ↔ object-format interaction                    | `appendix-a-ir.md` (Phase 5.2)                                           |
| DWARF emission (dialect, DIE set, determinism)    | [chapter-23-debug-info.md](chapter-23-debug-info.md)                     |
