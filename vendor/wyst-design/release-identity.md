---
title: "Wyst Release And Exact Identity Contract"
group: manual
order: 2
summary: "Independent semantic release versions and exact language-snapshot/compiler-build identities."
---

# Release And Exact Identity Contract

This document owns the distinction between publication versions and exact
development identities. Schema identifiers, target architecture releases, and
external tool versions remain identifiers in their own domains; none is a Wyst
language or compiler semantic version.

## Terms

- A **selected snapshot** is the exact language contract selected by one source
  tree. Its `wyst.language-snapshot.v1` identity changes with its canonical
  contract inputs and carries no publication claim.
- A **compiler build** is one compiler executable produced from an exact source,
  dependency, toolchain, target, feature, profile, flag, and release-state
  closure. Its `wync.compiler-build.v1` identity is exact and is not a semantic
  version.
- A **language release version** and a **compiler release version** are
  independent semantic versions assigned only by publication. A development
  build has neither. A nominated candidate carries proposed values, which are
  not released values.
- A **release** is publication of the exact candidate artifacts and evidence
  accepted by a passing gate. It is an event, not a roadmap milestone.
- The **release gate** qualifies one explicitly nominated clean commit, tree,
  candidate build, proposed version pair, artifacts, and evidence. It validates
  the claims implemented in that snapshot and never consults roadmap completion.

## Canonical identities

Both roots use SHA-256 and `wyst.length-prefixed-records.v1`. A field is encoded
as the little-endian `u64` byte length of its ASCII field name, the name bytes,
the little-endian `u64` length of its value, and the value bytes. Consumers
reject duplicate paths, noncanonical paths, missing files, symlinks, and an
unknown algorithm or encoding.

The language root begins with `domain = wyst.language-snapshot.v1` and
`encoding = wyst.length-prefixed-records.v1`. It then contains, in ascending
UTF-8 path order, `file.path` followed by `file.digest` for every entry selected
by [`language-snapshot-inputs-v1.txt`](language-snapshot-inputs-v1.txt), including
that manifest itself. Each leaf is `sha256:` plus lowercase SHA-256 of the exact
file bytes. The set contains the vocabulary, manual authority, semantic
database, catalogs, and bundled core declaration. It excludes `ROADMAP.md`,
tests, coverage evidence, generated reports, publication history, and the
computed root. Thus a meaning-affecting authority change changes the root, while
test-only or publication-record changes do not pretend to change language
meaning.

The compiler-build root begins with `domain = wync.compiler-build.v1` and the
same encoding field. Its ordered file records cover `wync/Cargo.toml`,
`wync/Cargo.lock`, `wync/build.rs`, every regular non-symlink file under
`wync/src/` and `wync/core/`, the selected language inputs, and the exact
generator, machine-authority, and execution-witness closures enumerated by
`wync/build.rs`. Ordered fact records bind the language snapshot identity,
`rustc -vV`, content digests and version output for the compiler/linker/archiver
tools and configured Rust wrappers, Cargo host/target/profile/optimization/
debug/features/configuration, encoded Rust flags, and release state. Absolute
checkout, output, and temporary paths are not inputs. The generated Rust
constants and final executable bytes are outputs and are excluded, avoiding a
self-referential digest. Publication history and the identity/release record
schemas are also excluded: changing a record of an event must not change the
identity of otherwise identical compiler bytes.

Two builds with the same canonical records have the same identity. A changed
leaf, compiler/tool fact, target, feature, profile, flag, release state, or
proposed version changes the compiler-build identity. Independent build copies
may compare their executable digest in addition to the build identity; the
embedded identity never claims to hash the bytes that contain it.

## Release version policy

Language and compiler deltas are classified independently from their respective
previous published releases:

| Version range | Incompatible change | Compatible feature | Compatible fix | Documentation, tests, or evidence only |
| --- | --- | --- | --- | --- |
| `< 1.0.0` | next minor, patch zero | next minor, patch zero | next patch | unchanged |
| `>= 1.0.0` | next major, minor and patch zero | next minor, patch zero | next patch | unchanged |

A compiler-only publication leaves the language version unchanged. A language
change does not prescribe a compiler bump category: the compiler delta is
classified independently. No roadmap edit, feature-state edit, schema revision,
target release, or package-manifest version performs a semantic-version bump.

## Development, nomination, gate, and publication

Ordinary builds have `releaseStatus = development`, null language/compiler
release versions, and exact snapshot/build identities. Supplying only part of a
candidate tuple is a build error. The generic release tooling accepts a clean
40-hex commit, its exact tree, prior published versions, independently selected
change classes, and proposed versions. It rejects a dirty or changing tree,
wrong commit/tree, invalid or noncanonical semantic version, incorrect bump,
failed command, mismatched candidate identity, or fuzz evidence for another
snapshot.

`wync identity` emits `wync.compilerIdentity.v1`, validated by
[`compiler-identity-v1.schema.json`](compiler-identity-v1.schema.json).
Current generated and release-evidence projections are
`wync.generatedManifest.v1`, `wync.releaseEvidence.v1`,
`wync.releaseHostFacts.v1`, and `wync.releaseArchiveFacts.v1`; each carries the
release status, nullable release versions, and both exact identities. The
compiler-owned editor projection is `wync.editorCatalog.v1` and carries the
same tuple.
Nomination, passing-candidate, and publication records use the closed schemas in
[`release-records-v1.schema.json`](release-records-v1.schema.json). The workflow
is `wync/tools/release-gate.sh nominate`, `verify`, then the deliberately
separate `publish` command; nomination and evidence destinations must be outside
the repository so they cannot alter the nominated tree.

The gate builds the candidate once with the complete proposed tuple, records
the candidate executable digest and exact identities, runs all portable,
generated-authority, documentation/editor, interoperability, build-twice,
runtime/QEMU, compiler-efficiency, and A64 conformance gates, authenticates the
closed release-fuzz verdict for the same commit and tree, then
rechecks the commit, tree, cleanliness, candidate bytes, and identities. A
passing record is only publication-ready. The proposed versions become released
only when maintainers publish those exact bytes and evidence and record the
publication event. A failed or abandoned candidate changes no released version.
Publication records the canonical tag
`wyst-release/language-v<language>/compiler-v<compiler>` on the nominated
commit. The `publish` command revalidates the passing record, independent bump
policy, exact clean commit/tree, latest release baselines, and pre-existing
canonical tag before it emits the publication record; creating that tag and
publishing the gated bytes are deliberate maintainer actions, not effects of a
roadmap edit. In the first later repository snapshot that records the event,
maintainers preserve the gate and publication records below
`design/release-records/<tag>/`, append the authenticated entry to
`release-history.json`, and advance each baseline to the corresponding value
(including an unchanged value for the side whose delta was `none`). History
verification rejects a tag, record linkage, or terminal baseline that does not
match. This bookkeeping records a publication already made; it does not create
one by editing the repository.

Historical tags, peeled commits, and source trees are recorded in
[`release-history.json`](release-history.json). Those bounded records retain
the pre-separation unified version labels where they describe actual past
publication; they do not retroactively claim independent historical language
and compiler versions. Current
compiler, report, artifact, cache, benchmark, debug, LSP, or editor data must not
reuse them as an exact identity.
