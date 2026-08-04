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

## `per_cpu` Object Contract

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
startup copy, or ordinary-global alias. A Wyst source contributes no TLS
payload, symbol, relocation, or size export. A Wyst named layout emits no
`.tls` section or `PT_TLS`.

## Placement and Initialization Attributes

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

## Named Layout Object Contract

An artifact-owned manifest layout clause selects exactly one named `layout`
block from its layout file. Its `entry` member resolves one exact
module-qualified Wyst declaration. That semantic selection supplies
`e_entry` and a reachability root but emits no alias, changes no source or ELF
name, and changes no binding. The optional `at` clause pins the resolved
declaration's first byte; without it, ordinary section constraints determine
the address. The QEMU EL1 and Raspberry Pi profiles require a zero-parameter,
unpinned Wyst Native function returning `never`, or the equivalent body-bearing
terminal label. The two QEMU EL2 profiles instead require `pub naked`, Wyst
Native, exactly `dtb: @u8 in x0`, `-> never`, initial EL2, and exactly one cataloged
checked stack transition from a `u64` value in `x1`. These ABI, register,
execution-level, stack-transition, and terminal checks complete before the
writer consumes the selection.

Typed IR is the semantic authority passed to the writer. It retains the current
target entry when present, as well as the layout
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

Wyst's integrated compiler reads a set of source modules and emits either one
final binary image or a paired static-library archive and semantic bundle. There
is no separate assembler or linker, and no intermediate object files are
written to disk for `ET_EXEC` mode. The compiler emits, independently decodes,
and validates canonical native objects in memory before final placement or
archive packaging, one paired with each checked source/layout semantic
interface. This does not make `-c` / `--emit-object` available.

An in-memory build session may reuse these exact authenticated interface and
native-object products when all named semantic fingerprint inputs match. An
artifact-producing compiler invocation may also read or publish the pair in a
compiler-private, content-addressed local cache. A persistent hit is admitted
only after the canonical interface and `ET_REL` bytes have been independently
decoded, schema-checked, digest-checked, paired, and reconstructed as the same
closed typed products returned by ordinary emission. No consumer receives raw
cache bytes plus a validation flag or side-table claim.

The complete canonical interface-byte digest remains the object-pairing and
corruption identity. Invalidation separately uses an authenticated semantic
identity that excludes only the `source_location` record family and embedded
diagnostic spans; target, ABI, declaration, type/layout, constant, generic,
expansion, effect, resource, safety, hardening, and reachability facts remain
observable. A native object is reusable only when its exact complete interface
digest and complete backend action fingerprint match. Cache paths, timestamps,
and hit/miss state never enter those products or final bytes.

Persistent reuse does not weaken eager decoding and digest validation, change
any serialized byte, member order, pairing rule, or whole-program final-link
contract in this chapter. Cached and rebuilt objects enter the same ordinary
symbol resolution, section merge, placement, relocation, checked-fixup, and
final-artifact validation path.

## Static-Library Availability

The project-manifest grammar accepts `static_library` with one source-module
root closure, primary archive path, companion semantic-interface path, target,
and explicit artifact policies. The kind has no entry and no layout. Source
`export` declarations are the archive's native export roots; source `pub`
declarations are the companion's Wyst-visible content-bound interface.

The compiler implements the archive and bundle formats below. It emits one
deterministic AArch64 `ET_REL` member per source module in the selected root
closure and one complete paired semantic interface per member. The products
are built and validated together; a build never intentionally publishes only
one newly generated half.

Both outputs are staged and synchronized before installation. The companion is
installed first and the archive is the pair's commit point. A reported failure
restores both prior regular files or removes both newly created files. This is
a defined compiler rollback protocol, not a cross-path filesystem transaction
or a stronger host-crash atomicity promise than the filesystem provides.

The same semantic-interface and native-object representations remain internal
compiler products for final executable builds. There is no standalone
interface-file or object-file CLI.

## Complete Static Link Boundary

This section is the normative boundary shared by the interface emitter, object
emitter, archive producer, and final linker. It prevents those separate stages
from selecting incompatible formats or changing Wyst semantics at native-link
time.

### Artifact Set and Compatibility

The boundary has four representations:

1. A **semantic interface** is the canonical Wyst binary interface described
   below. It contains every fact required to type-check and instantiate an
   imported module without source. It contains no backend IR or final address.
2. A **native object** is restricted deterministic AArch64 ELF64 `ET_REL`.
   Relocations are `SHT_RELA` only. A Wyst object carries the SHA-256 of its
   semantic interface.
3. A native **archive** is deterministic GNU/System V regular `ar`. Thin,
   BSD-dialect, nested, and dynamically linked archives are rejected. A Wyst
   static library additionally has a canonical Wyst-native `.wystlib`
   companion containing semantic interfaces, lookup indexes, and object /
   interface SHA-256 bindings.
4. A **final artifact** is the deterministic static AArch64 ELF64 `ET_EXEC`
   defined by the rest of this chapter. `ET_DYN`, GOT, PLT, TLS, dynamic
   relocations, and runtime loading remain outside this boundary.

When explicit hardening is enabled, every Wyst semantic interface ends in the
authenticated hardening trailer described below. Its paired object embeds the
digest of those complete bytes, and a `.wystlib` member embeds both the
complete interface and that digest. All Wyst members in one archive or final
link closure must carry the same `(catalog version, enabled-row bitset)`.
Absence is the only disabled identity. Mixed absence/presence, versions, or
bitsets are rejected. Foreign inputs are opaque to this identity and remain
forbidden from impersonating it through `.wyst.*` sections.

Every input states hard target requirements. Architecture (`aarch64`), little
endianness, LP64 static ABI revision, and link-schema revision match exactly.
Feature, minimum exception level, environment, layout, and `per_cpu`
requirements form a union; the final target must satisfy the whole union.
Inputs need not use the same target-profile name. Unsupported AArch64 ELF flags
or GNU properties, including a BTI requirement for which the current veneer
recipe is invalid, are rejected rather than ignored.

SHA-256 fields are content bindings, not signatures or publisher-identity
claims. Signature, key, and provenance policy is separate from this format. A
digest mismatch is corruption and a hard error.

### Canonical Semantic Interface

The interface begins with the eight bytes `WYSTIF 00 05`, followed by the raw
32-byte SHA-256 of the exact `design/link-interface-schema.tsv` bytes, then the
record count as the shortest unsigned LEB128 encoding of a `u64`. Each record
is encoded as:

```text
record-tag:ULEB  key-length:ULEB  key:bytes  field-count:ULEB
    (field-tag:ULEB  value-length:ULEB  canonical-value:bytes)*
```

Records sort by `(record-tag, key bytes)` and are unique. Fields use their
one-based position in the catalog's `required_fields` column as `field-tag`,
sort by tag, and occur exactly once. Missing, duplicate, unknown, out-of-order,
or trailing data is malformed. Keys and identities use the canonical binary
spelling from the owning design chapter; display names and source locations do
not participate unless the catalog explicitly makes them the canonical key.

A canonical value starts with one byte: `0` false, `1` true, `2` unsigned
`u64` followed by shortest ULEB128, `3` signed `i64` followed by zig-zag ULEB128,
`4` byte string (`length`, bytes), `5` Unicode text (`length`, exact valid UTF-8),
`6` record reference (`record-tag`, `key-length`, key), `7` sequence (`count`,
values), or `8` map (`count`, key/value pairs). Sequences preserve semantic
order. Map entries sort uniquely by the complete encoded key bytes. There are
no alternate integer widths, null value, indefinite lengths, or ignored
extension tags. Graphs use record references rather than recursive record
embedding; cyclic graphs are legal.

All counts, lengths, tags, and indexes are semantically `u64` and have no
format-level small limit. Every decoder nevertheless accepts caller-set budgets
for input bytes, decoded bytes, records, reference edges, and work steps, and
traverses graphs iteratively. Exhausting a budget is a resource-limit failure
distinct from malformed input. Arithmetic overflow, truncation, non-shortest
ULEB128, invalid UTF-8, an unknown tag, or a dangling reference is
malformed. Producers emit the unique shortest representation.

The closed, content-addressed schema catalog includes module and declaration
identities, full types and callable ABIs, imports and exports, layout and
effects, inline and generic semantic bodies with private dependencies, generic
demands and canonical materializations, `per_cpu` templates, section
ownership, checked fixups and relocation authority, interactive/resumable
contracts, roots, and diagnostic locations. Adding or changing a record
changes the schema digest and requires an explicit schema revision. The
interface never serializes compiler-private backend IR.

`design/link-interface-schema.tsv` is also the machine-readable revision-5
field-shape authority. Its `field_shapes` column has one shape for each
`required_fields` entry. The primitive shapes are `bool`, `u64`, `i64`,
`bytes`, `text`, and the closed semantic shapes named by the catalog.
`ref(record)` requires that exact record kind; `ref_one_of(a,b)` requires one
of the listed kinds; `seq(shape)` is ordered; and `opt(shape)` is a zero-or-one
sequence. `visibility` admits only `public` and `interface_private`.
`semantic_map` has unique text keys, `logical_path` excludes absolute paths,
drive prefixes, backslashes, empty components, and `.` / `..`, and
`source_span` carries only normalized byte offsets. An incompatible field
shape or meaning change requires a new magic/schema revision, not merely a new
digest under revision 5. Revision-1, revision-2, revision-3, and revision-4 interface bytes are rejected rather than
upgraded implicitly: these products are compiler-internal and every paired
object/interface or archive/bundle set must be rebuilt atomically.

The revision-5 `callable_contract` record has the exact ordered fields
`calling_convention`, `parameters`, `result`, `effects`, `registers`,
`ownership`, and `entry_levels`. `entry_levels` is the canonical ordered set of
authenticated direct-entry exception levels; it is not part of ordinary
function-pointer identity. Decoding validates each callable against its
effect, resource, inline, protocol, and interactive-ABI record family,
including parameter modes and `noescape`, `never`, returned-lease sources,
effective offers, handler ceilings, and recovery parameters. After typed IR
exists, the consumer independently compares every cross-module direct target
with this decoded family. Missing, stale, or wider data is malformed rather
than permission to lower an indirect call.

An interface with enabled explicit hardening appends exactly 44 bytes after
the canonical revision-5 record stream: eight-byte magic
`WYSTH 00 01 00`, little-endian `u16` hardening-catalog version,
little-endian `u16` enabled-row bitset, and SHA-256 of the complete interface
through the bitset. The trailer is absent when hardening is disabled. Unknown
versions or bits, a zero enabled bitset, truncation, or digest disagreement are
malformed. The trailer changes the complete interface digest embedded by the
paired object and `.wystlib`; it does not add a source semantic-interface
record or backend IR.

An inline or generic `semantic_body` is a canonical typed semantic tree after
top-level compile-time selection and generic-capability authentication but
before monomorphization. Within its revision-bound record, the root map
contains the ordered binder table, ordered statement tree, and typed result;
the sibling `requirements` field carries its direct requirements.
Names in the tree are canonical declaration references or declaration-local
binder ordinals. Checked assembly is represented by authenticated catalog
form identity, typed operands, effects, and semantic fixup authority; raw
assembly source, backend IR, instruction bytes, and concrete ELF relocations
are excluded. The body record references the exact transitive
`private_dependency` closure needed to consume it. Those private declaration
identities are interface-visible but never enter source-name lookup.

The ordinary compiler forms one interface per source module and processes the
import graph in dependency order. A strongly connected component is one
atomic compilation unit: all member interfaces must encode, decode, validate,
and resolve their public selections before any member is finalized. Sealed
`core` imports are authenticated against the compiler-bundled catalog. A
consumer substitutes an imported generic callable signature, validates its
typed body and private closure, and emits a canonical demand plus the source
selector that authenticated the import edge; it does not materialize an
imported concrete definition at that immediate boundary. Public re-export
aliases canonicalize to the original declaring identity before the demand key
is formed. Mandatory
inline bodies remain available for normal expansion. `resource_contract` and
`resumable_frame` are losslessly supported revision-5 records, and a producer
emits them only from authenticated source semantics.

Each function's `resource_contract` records ordered parameter modes and
structural abilities, result access and ordered origins, checked returned-view
leases with result last use, and terminal obligations. The ordinary
`callable_contract` carries the matching callable modes and origins so direct
and indirect consumers compare one exact identity. Type and declaration
records retain `no_copy`, `must_account`, `must_resolve`, the ordered
structural terminal-origin set, `opaque`, and `agent_local` facts.
Generic-body records retain every explicit bound. An absent bound authenticates
neither movement nor copying; `fixed_layout_movable` authenticates movement but
not copying or discard; and every stronger closed bound retains its specified
entailments. The `fixed_layout_movable` and `copyable_discardable` type
capabilities are derived structurally after concrete substitution from fields,
variant payloads, and declaration abilities; neither is granted by a nominal
spelling or by an unused phantom argument. Mandatory-inline bodies, generic
demands and definitions, paired objects, and archive companions carry the same
facts, and consumption rechecks the concrete type argument before selecting a
body or definition. Within one compilation unit, returned-borrow
provenance also retains field, tuple, variant-payload, and fixed-index paths.
Revision 4 intentionally authenticates only the whole originating parameter
at an opaque callable boundary. A separately compiled consumer must therefore
keep that entire parameter borrowed until the returned value's last use; it
must not infer a narrower field path from source spelling or layout.
These records authorize no behavior by source spelling and add no runtime lease
field, cleanup hook, or object section.

`E0804` reports a malformed, incompatible, dangling, or semantically invalid
interface. `E0805` reports exhaustion of a caller-supplied interface decode
budget. Neither failure is recoverable by ignoring records or falling back to
private producer source.

### Native AArch64 Object

A native object has `ELFCLASS64`, `ELFDATA2LSB`, `EV_CURRENT`,
`ELFOSABI_NONE`, `ET_REL`, `EM_AARCH64`, `e_flags = 0`, no program headers,
and a complete section-header table. It uses `Elf64_Sym` and `Elf64_Rela`;
`SHT_REL` is rejected because all addends are explicit signed byte counts.
Wyst producers emit only relocation codes in
`design/a64-link-relocations.tsv`.

Content sections occur in this order: `.text` family, `.rodata` family,
`.data` family, `.bss` family, `.percpu`, then exact layout-declared custom
sections. Within a family, canonical interface section identity orders
sections; within a section, canonical owner identity and source declaration
order order contributions. Zero-sized owned contributions remain. Every
`.rela.<target>` follows all content sections in target-section order; records
sort by `(r_offset, relocation code, symbol-table index, addend)`. Then come
`.wyst.interface`, `.wyst.reloc`, admitted unwind/debug sections, `.symtab`,
`.strtab`, and `.shstrtab`. The null section is index zero.

`.wyst.interface` is non-allocated `SHT_PROGBITS` containing exactly the raw
32-byte SHA-256 of the paired canonical interface. Pairing is supplied by the
build plan; filename discovery is forbidden. The plan also binds the SHA-256
of the complete object and interface, so a substitution is rejected.

`.wyst.reloc` is a non-allocated Wyst sidecar; it invents no private ELF
relocation numbers. Its eight-byte magic is `WYSTREL 01`, followed by the
interface digest and a shortest-ULEB record count. Records sort by
`(target-section index, target offset, kind, RELA ordinal)` and contain those
four ULEBs followed by `origin`, `flags`, `pair-id`, and a length-delimited
canonical semantic target identity. `kind = 0` annotates one `SHT_RELA` entry,
whose ordinal must exist. `kind = 1` is the Wyst-only `per_cpu` template-offset
patch and has RELA ordinal zero. Origins are `1` ordinary Wyst, `2` checked
assembly, or `3` linker-generated veneer. Flag bit zero means
`no_relaxation`; every checked-assembly record sets it. Unknown kinds, origins,
or flag bits are rejected. Nonzero pair IDs occur exactly twice and bind the
standard `ADRP` plus low-12 relocation for one address expression.

Foreign objects and archives must not contain `.wyst.*` sections. Accepting
such a section from an unpaired foreign input would let native bytes impersonate
Wyst semantics.

### Native Archive and Wyst Bundle

The accepted native archive is GNU/System V regular `ar` with global magic
`!<arch>\n`, fixed 60-byte member headers, decimal fields, and even-byte
newline padding. The `/` symbol index and `//` long-name table are supported;
ordinary short names use a trailing `/`. Thin archives, BSD `#1/` names,
nested archives, duplicate normalized member names, absolute or parent-relative
names, non-UTF-8 names, invalid indexes, and overlapping or truncated members
are rejected. Deterministic producers write zero timestamp, UID, and GID, mode
`0644`, canonical UTF-8 NFC member names, a complete symbol index, and members
sorted by `(normalized name, SHA-256 of member bytes)`.

The companion `.wystlib` is not an `ar` variant. It starts with eight bytes
`WYSTLIB 02`, the interface-schema digest, then member count and index count as
shortest ULEBs. Each member, sorted uniquely by normalized archive-member name,
contains the name, raw object SHA-256, raw interface SHA-256, and a
length-delimited complete canonical interface. The corresponding `ar` member
has the named object digest and embeds the same interface digest. Indexes
follow members and sort uniquely by `(kind, key bytes, member ordinal)`: kind
`1` module identity, `2` semantic declaration identity, `3` canonical generic
instantiation key, and `4` native link symbol. An index target must exist and
its interface/object must define the key. Revision 2 has no timestamp,
compression, signature, optional member, or opaque extension field.
Revision-1 companions are rejected and must be rebuilt together with their
paired objects and interfaces.

Archive structure, names, indexes, member boundaries, digests, and bundle
bindings are validated eagerly. Object and interface semantic parsing is lazy
for unselected members, but every extracted member is fully validated before
it contributes a definition. A malformed unused object does not fail a link if
its enclosing archive and bundle are structurally valid; a bad index or digest
always fails.

Decoders have no arbitrary format-level size ceiling. The caller supplies
budgets for input bytes, members, indexes, decoded interface bytes, and work
steps; arithmetic is checked and budget exhaustion is distinct from malformed
or incompatible input. `E0806` reports an invalid or incompatible archive pair
with the member or boundary involved. `E0807` reports the exhausted resource
budget.

### Symbols, Visibility, Resolution, and Extraction

`pub` controls Wyst source visibility only. A definition referenced only inside
its own object is `STB_LOCAL`. A canonical semantic definition required by a
different Wyst object is a compiler-private `STB_GLOBAL` + `STV_HIDDEN` bridge;
both its definition and its undefined references carry that hidden visibility.
The paired interfaces authenticate that identity, and the bridge creates no
source-visible or default-visible native export. Explicit strong exports and
imports are `STB_GLOBAL`; defined weak exports are `STB_WEAK`. Accepted
visibility is `STV_DEFAULT` or `STV_HIDDEN`. `STV_INTERNAL`, `STV_PROTECTED`, GNU unique,
common symbols, symbol versioning, undefined weak imports, and unknown symbol
types are rejected. Hidden definitions can satisfy references inside the final
static link but do not create a public native export.

All direct objects load in build-plan order. A strong definition wins over any
weak definitions. Two loaded strong definitions of one link name are a
duplicate-symbol error naming both providers. With only weak providers, the
smallest `(normalized member name, member SHA-256)` wins; direct-object
providers use canonical build-plan identity in the same rank. Local symbols
are never candidates. After extraction, every unresolved strong import is an
error with the originating semantic declaration and searched inputs. There is
no last-wins behavior.

Archives are searched in build-plan order and are not revisited. Within one
archive, extraction runs to a fixed point. A member is eligible only if it
strongly defines a currently unresolved strong symbol; weak definitions never
trigger extraction. Among eligible members, the smallest normalized member
name and then member SHA-256 wins, making selection independent of physical
member order. Loading that member adds its strong undefined symbols and can
make another member of the same archive eligible.

That rule is the native unresolved-symbol search only. Generic semantic demand
discovery is a compiler phase and runs a global canonical-key worklist over all
validated direct interfaces and kind-`2` / kind-`3` Wyst bundle indexes. It may
revisit an earlier bundle after a body from a later bundle introduces a
transitive demand. Every selected member is fully authenticated before its
interface contributes a body or definition. Merely containing a generic body,
definition, weak symbol, or section never creates a demand.

Root demands come from concrete source applications, explicit concrete generic
exports, address-taken concrete functions, retained data/callback references,
and the existing artifact roots below. A body-relative demand remains a
template until its owning concrete application is reached; the compiler then
substitutes the parent's canonical arguments and enqueues the resulting key.
Exact-key revisits close, strictly growing chains fail with their canonical
trace, and caller work budgets fail separately as resource exhaustion.

For each key, a direct semantic home may emit the definition. If that home is
not a direct compiler input, the smallest compatible demanding module is the
physical emitter. An already materialized archive definition participates in
the same deterministic selection. All candidates must have the identical
revision-5 definition contract: canonical identity, checked body and private
closure, callable ABI, effects, type/layout and sum representation,
interactive protocol and handler/recovery facts, placement, and generated
definition identity. Identical candidates collapse to one selected member;
any mismatch is a hard semantic-interface error. A missing body, private home,
or required definition contract is also a hard error. Only the selected
ordinary symbols reach native linking; the linker never substitutes types,
instantiates a body, repairs placement, or chooses among semantic definitions.

Before any artifact-specific interface or native product is emitted, the
compiler constructs one typed reference graph from completely checked and
materialized IR. Roots are the selected semantic entry, explicit exports,
`#[init]` functions, concrete `#[section]` contributions, vector tables,
artifact-verification references, source-level address materialization, and
every accepted `per_cpu var` initialization-template entry. Weak definitions
and source `pub` do not create native roots. Static-library companion files
still retain their public semantic records under the separate source-visibility
contract; those records do not force native archive members or bodies.

The graph then closes over typed direct calls and tail transfers, retained data
and initializer references, vector slots, checked-assembly symbol/call
contracts, callable initializers, generic materializations, and foreign imports
used by retained Wyst subjects. A foreign definition or unresolved foreign
reference cannot independently root Wyst code. Alignment and cache-isolation
requirements constrain placement only after their declarations are retained;
they do not create roots. Debug and unwind records are derived only for retained
subjects and never keep a subject alive.

Artifact-specific interfaces, native objects, archive members, and the final
link all consume this same closure; none recovers reachability from emitted
symbols, relocations, debug records, or archive contents. Every retained node,
root, and edge carries a closed source-attributed reason. A canonical digest and
deterministic added/removed node, root, and edge summary are build-session
invalidation data, not a second semantic authority.

### Foreign Inputs

A foreign object or archive member can satisfy only an explicit `extern "C"`
native import. Its machine code is opaque and accepted under the source
author's foreign-code assertion; it cannot supply a Wyst module, type, callable
contract, inline/generic body, generic identity, `per_cpu` object, layout fact,
root, or checked-assembly provenance. It cannot override a canonical Wyst
generic materialization. Semantic instantiation remains a compiler phase
before native linking.

For compiler-produced objects, each retained typed `call` has exactly one
ordinary `R_AARCH64_CALL26` intent in its authenticated machine value range,
and that relocation resolves to the same `SymbolId` and canonical semantic
target. An ordinary `CALL26` with no retained direct-call authority, a missing
call relocation, or a retargeted relocation is a compiler error. Mandatory
inline expansions have no retained `call` and therefore no such relocation;
their expansion record retains the callee authority instead.

Foreign input is restricted to admitted symbols, sections, and mandatory
static AArch64 relocations. GOT, PLT (including `PLT32`), TLS, dynamic,
pointer-authentication, and vendor/platform-extension relocations are rejected.
The Structure Protection Extension's `PATCHINST` is additionally forbidden
because it rewrites an instruction, and `FUNCINIT64` is forbidden because it
creates a run-time `IRELATIVE` relocation. Constructors/destructors, COMDAT,
`SHT_GROUP`, `.gnu.linkonce.*`, merge/string sections, executable-stack
requests, unknown processor flags, and unknown allocated sections are hard
errors. There is no COMDAT-equivalent selection; canonical Wyst generic
identity is the only semantic deduplication rule.

Compatible `.text*`, `.rodata*`, `.data*`, and `.bss*` contributions fold into
their Wyst classes. A custom allocated section is accepted only when the
selected named layout declares that exact name and compatible kind. Every
other allocated section is an orphan error. Safe non-allocated metadata is
limited to symbol/string tables, `SHT_RELA`, `.comment`, empty
`.note.GNU-stack`, `.ARM.attributes`, admitted DWARF, and admitted `.eh_frame`.

Debug policy `none` intentionally discards structurally valid debug sections;
`line` retains the supported DWARF 5 line subset; `full` retains that subset
plus supported DWARF 5 type/location data. DWARF 2--4, DWARF64, split DWARF,
GNU extensions, and unsupported forms are rejected rather than partially
interpreted. Unwind policy `none` discards valid backtrace CFI. When unwind
tables are requested, `.eh_frame` is accepted only for structurally validated
backtrace CFI without personality, LSDA, language-exception semantics, or
unknown CFI operations. `.ARM.exidx` is rejected. Debug and unwind policy never
adds a code or storage root; their records are projections of retained subjects.

### Section Ownership and Final Placement

Every allocated contribution has exactly one semantic/interface owner or one
foreign `(input ordinal, archive member key, section index)` owner.
Contributions sort first by selected layout section order, then Wyst canonical
owner identity or foreign owner tuple, then source declaration / ELF offset.
Input order chooses archives and direct-object precedence but never leaks
physical archive order or hash-table order into placement. Alignment is the
maximum of natural, source, input-section, target, layout, and cache-isolation
requirements. Padding is deterministic zero fill except for cataloged code NOP
padding explicitly allowed by the checked-block rule.

The selected layout alone assigns final virtual addresses, file offsets,
memory extents, entry, permissions, and bookends. Every normalized constraint
and all `u64` arithmetic are checked; overlap, wraparound, contradictory order,
misalignment, permission mismatch, or orphan ownership is a hard error. No
input section address or archive position is a placement hint.

Ordinary generic demands and bodies travel through the semantic interface. The
compiler selects canonical instantiation identity and unique definition owner
before object emission; the native linker only resolves the resulting ordinary
symbol. `per_cpu` entries travel as interface template records plus object
template bytes and Wyst sidecar offset patches. Final placement assigns their
deterministic template offsets, never process/TLS addresses, and applies only
authenticated sidecar patches.

### Relocations, Overflow, and Relaxation

`design/a64-link-relocations.tsv` is the exhaustive admitted mandatory static
LP64 AArch64 relocation catalog after the explicit GOT, PLT, TLS, dynamic,
proxy, pointer-authentication, and platform-extension exclusions above. An
unlisted code is rejected. `operation` defines `X` from
ELF `S` (symbol), signed RELA `A` (always bytes), and `P` (place); page uses
4-KiB pages and Euclidean rounding. `field_program` entries have the form
`field@destination-bit+width=source-bit` and copy those two's-complement bits
from `X`. The range is inclusive and independent of place/target alignments.
`truncate` applies the specified low field bits; `checked` diagnoses every
out-of-range or misaligned result before modifying bytes. `R_AARCH64_NONE` and
withdrawn code 256 retain dependency edges and write no field. `ABS64` and
`PREL64` use the AAELF64 truncating 64-bit result; an authenticated Wyst typed
address additionally rejects a value outside its source type before it becomes
a RELA addend.

For `movw_signed_gN`, nonnegative `X` selects `MOVZ` and copies the cataloged
field; negative `X` selects `MOVN` and copies the complement of that field.
`movw_checked_gN` selects a valid `MOVZ`/`MOVK` form after its unsigned range
check, while `movw_keep_gN` requires and preserves `MOVK`. Every `gN` place has
the matching `hw = N`; a mismatch is an invalid-place failure rather than an
opportunity to rewrite the instruction.

Every relocation failure uses `E0803` and reports relocation name, input and
owner, target, `S`, byte addend `A`, `P`, computed `X`, required inclusive
range, place alignment, and target alignment. Invalid opcode class, target
class, pair, sidecar authority, or unknown use is also `E0803`. No optional
AAELF64 instruction-sequence optimization is performed.

Foreign relocations never relax. Authenticated ordinary Wyst `CALL26` and
`JUMP26` are the only veneerable relocations, and each uses its exact row in
`design/a64-link-veneers.tsv`. The three instruction words and encoding IDs are
validated against `design/a64-active-encoding-catalog.tsv`; the paired `ADRP`
and `ADD` are ordinary standard relocations. Placement is the unique veneer
slot immediately after the source text chunk. If that branch or page pair
cannot encode, `E0601` reports the original branch and final target; no second
veneer, literal pool, different scratch register, or alternate sequence is
chosen.

Every checked-assembly fixup is one cataloged instruction with
`no_relaxation`. The linker patches only declared fields after opcode, operand,
target, range, and alignment validation. It cannot rewrite the instruction,
insert inside its checked block, redirect through a veneer, pair it with a
synthesized instruction, or convert it to another addressing mode. Linking
therefore cannot silently relax code, alter control flow, or change Wyst
language semantics.

---

## 1. Scope and Goals

For the implemented `ET_EXEC` artifact mode, the Wyst compiler is
**whole-program, single-pass with respect to its output**:

- The compiler ingests every source module named explicitly or discovered from
  the project/root import closure in one invocation (see
  [chapter-04-modules.md](chapter-04-modules.md)).
- All cross-module symbol resolution, layout, relocation, and image
  construction happen inside that one invocation.
- Canonical per-module relocatable objects are emitted and validated in memory,
  but no `.o` files are written to disk. `wync -c` / `--emit-object` remains
  reserved for a future public object-output policy.
- No external `ld` is invoked.

The output of a successful final-artifact compilation is exactly one **ELF64
little-endian AArch64 executable**. A successful `static_library` compilation
instead emits the specified GNU/System V archive and `.wystlib` companion pair.

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
| `.wyst.hardening`     | Enabled hardening catalog version and row bitset      | (non-`ALLOC`) |
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

`.wyst.hardening` is emitted only in a hardened final executable. Its exact
12-byte payload is eight-byte magic `WYSTHARD`, little-endian `u16` catalog
version, and little-endian `u16` enabled-row bitset. It is non-allocated,
read-only metadata with alignment 2 and must exactly match the hardening
identity authenticated by every paired Wyst interface in the link closure.
The section is absent when hardening is disabled.

`.percpu` is placed once in the image. A later runtime may copy its immutable template bytes
to live instances, but the compiler performs no replication and the template
is not itself live storage. `.tls` is not a Wyst section.

---

## 4. Symbol Table

The `.symtab` includes one entry per:

- emitted address-bearing top-level declaration (function, label, constant,
  or ordinary mutable global) as a semantic/debug identity, independently of
  source `pub`. The identity is local unless another paired Wyst object needs
  the hidden bridge defined above. `per_cpu` entries are always the local offset
  symbols defined by the Wyst contract above.
- each explicit `export` mapping as a distinct external alias of its local
  target, with the requested strong or weak binding.
- Explicit typed layout symbol (`start`, `end`, `size`, or a typed numeric
  placement expression).
- Compiler-created initcall metadata symbols named as specified in §4.3.
- Section start symbol (synthesized: `_section.text_start`, etc., for
  debugger convenience). These are local symbols.
- Function and label body starts (private and public alike), to enable
  source/debug lookup. Private functions and labels get `STB_LOCAL` unless they
  are compiler-private cross-object bridges.

### 4.1 Binding

| Binding      | When emitted                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `STB_LOCAL`  | Object-local semantic/debug declarations, layout symbols, every `per_cpu` offset symbol, synthesized symbols      |
| `STB_GLOBAL` | Hidden cross-object Wyst bridges, strong explicit `export` aliases, and compiler-created initcall metadata       |
| `STB_WEAK`   | Explicit `export weak` aliases                                                                                    |

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
Wyst emits no TLS symbol.

### 4.3 Internal And External Names

An explicit `export` alias is written to `.symtab` with exactly the decoded
`as symbol "..."` bytes; an export without an alias uses the source declaration
name. `pub`, source imports, and source aliases do not participate in this
choice. Distinct explicit exports of one declaration produce distinct symbol
table entries with the same value and independently selected `STB_GLOBAL` or
`STB_WEAK` binding.

The whole-program emitter gives every internal declaration a stable
module-qualified semantic identity for debugging and relocation resolution,
independent of `pub`, source imports, and export aliases. A separate
source-facing lookup/display spelling may remain local inside the compiler; it
does not replace the semantic identity in ELF. The compiler uses one canonical
internal encoding for these identities; it does not change the external
spelling selected here.

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

The implemented whole-program `ET_EXEC` writer serializes no relocations and
has no `.rela.*` sections. The implemented compiler-internal `ET_REL`
representation serializes its unresolved subset of the complete catalog below
as `SHT_RELA`; later foreign-object linking accepts the complete catalog.

`design/a64-link-relocations.tsv` is the exhaustive alphabet shared by internal
whole-program patches and `ET_REL`. The table below calls out the subset the
current Wyst backend produces most commonly; it does not narrow the catalog
accepted from conforming static AArch64 foreign inputs. The alphabet exists so
that:

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
- `R_AARCH64_TLSLE_*` — no TLS storage class or TLS lowering exists in Wyst.
- `R_AARCH64_TLSIE_*` — initial-exec model not used.
- `R_AARCH64_COPY`, `R_AARCH64_GLOB_DAT`, `R_AARCH64_JUMP_SLOT` — dynamic linker only.

Wyst has no dynamic linking, so the GOT relocation family is unused.

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
| Jump tables | Future explicit jump-table lowering records | Table entries are relocation origins. The universal optimizer does not currently emit jump tables or serialized jump-table relocations. |
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
only the discriminator type's bytes. A payload enum writes its exact concrete
size: the discriminator at offset 0, zeroed padding/inactive storage, and the
active variant's inline fields at the computed aligned payload offset. Programs
must not treat inactive bytes as source-level fields even though deterministic
emission zero-fills them.

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
const UART_MODINFO: [16]u8 = "uart_pl011"
```

The full semantics — legal placements, section-name constraints,
flag derivation, bookend synthesis, cross-module aggregation — are
specified in [chapter-04-modules.md](chapter-04-modules.md) under "Custom Sections from User
Declarations". The rules relevant to the object format are:

- **Reserved names:** all section names listed in §3 (`.text`,
  `.rodata`, `.data`, `.bss`, `.initcalls`, `.percpu`, `.tls`, the `.debug_*` family,
  `.symtab`, `.strtab`, `.shstrtab`) and any name starting with `.wyst.`
  are reserved. User code cannot target them with `#[section(...)]`;
  canonical sections are written by omitting the attribute. `.tls` is reserved
  and is not emitted by Wyst.
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
| Public per-module `.o` output                   | Internal producer only | `wync -c` / `--emit-object` requires an explicit output/pairing policy; the compiler already serializes and validates the §5 object in memory |
| Dynamic linking (`ld.so`, `PT_INTERP`)          | Outside base image model | Requires GOT/PLT relocations, `R_AARCH64_GLOB_DAT`, `R_AARCH64_JUMP_SLOT`, dynamic symbol table        |
| Position-independent executables (`ET_DYN`)     | Outside base image model | Base output lowers against absolute addresses                                                          |
| Shared objects (`.so`)                          | Outside base image model | Same dependency on dynamic linking                                                                     |
| COMDAT / section groups                         | Rejected by the complete boundary | Canonical Wyst generic identity is semantic deduplication; multiply-defined exports are a hard error |
| `init_array` / `fini_array`                     | Outside base image model | Wyst has no implicit static constructors; the selected layout's semantic `entry` is the only entry point |
| Language exception unwinding                    | Outside base image model | Backtrace-only `.eh_frame` CFI is policy-controlled; personality/LSDA exception semantics and `.ARM.exidx` are rejected |
| ar archives, static-library companions          | Implemented for compiler-produced Wyst objects | `static_library` emits the specified archive and content-bound `.wystlib` companion; foreign-member admission remains outside this producer |
| Mach-O, PE, COFF output                         | Outside base image model | See §11.                                                                                               |

---

## 10. Determinism

Object format output is **bit-for-bit reproducible** under the
reproducibility contract (`chapter-01-language-design.md`, Reproducibility Model):
the same checked-out compiler source, target, selected scheduling policies, and
source input manifest produce byte-identical ELF output.

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
