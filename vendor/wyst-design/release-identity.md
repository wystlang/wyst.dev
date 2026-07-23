---
title: "Wyst Exact Identity Contract"
group: manual
order: 2
summary: "Content-derived language and compiler identities."
---

# Exact Identity Contract

Wyst uses content-derived identities to prevent artifacts built from different
contracts or compiler inputs from being combined accidentally. These
identities describe exact content; they do not make a language or compiler
decision permanent.

## Language identity

The language identity covers the vocabulary, manual authority, semantic
database, catalogs, and bundled core declarations selected by the checked-in
language identity input manifest. The manifest itself is an input. Roadmaps,
tests, generated reports, publication records, and the computed identity are
excluded.

Each input path is canonical, repository-relative, unique, and sorted by UTF-8
bytes. Symlinks, missing files, duplicate paths, and noncanonical paths are
rejected. Every record carries the path and a digest of the exact file bytes.
A change to any language-authority input therefore changes the language
identity.

## Compiler identity

The compiler identity covers the compiler sources, dependencies, selected
language inputs, generators, machine-authority inputs, execution witnesses,
toolchain, target, features, profile, flags, and build configuration.
Absolute checkout, output, and temporary paths are excluded.

Two builds with identical canonical records have the same identity. Changing
any source, dependency, tool fact, target, feature, profile, flag, or
configuration changes the identity.

## Artifact binding

Compiler outputs carry both identities. Consumers compare the complete
identity tuple before reusing an interface, object, archive member, cached
product, report, or final artifact. A missing, malformed, unsupported, or
mismatched identity fails closed.

Generated identity constants and the final executable bytes are outputs and
are not inputs to their own identity. Independent builds may additionally
compare executable digests.

## Publication gate

Publication qualifies one clean commit, exact tree, compiler build, artifact
set, and evidence set. The gate builds once, runs the required portable,
documentation, interoperability, reproducibility, runtime, efficiency, and
architecture-conformance checks, then rechecks the commit, tree, cleanliness,
artifact bytes, and identities.

Publication is a deliberate maintainer action after the gate passes. Roadmap
completion does not publish artifacts or change either exact identity.
