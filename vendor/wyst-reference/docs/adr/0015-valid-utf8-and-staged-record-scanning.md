---
status: accepted
---

# Use valid UTF-8 strings and staged named-tuple record scans

Wyst defines `string` as a non-owning view of valid UTF-8 and keeps arbitrary
bytes in `[]u8`. Safe byte-to-string construction validates the complete byte
range before an authenticated compiler operation preserves its address,
length, and provenance. Checked string slices use byte offsets, require UTF-8
boundaries, and retain provenance from the source string. Wyst does not add a
checked string index because one byte is not one character.

`core.scan.read` uses a concrete named tuple and a compile-time template as one
scan schema. The compiler authenticates this exact bundled declaration,
validates the schema, and materializes a fixed typed function. The function
evaluates its input once, scans from left to right, consumes the complete
input, and constructs the tuple only after all captures succeed. A captured
string is a view of the input. Failure returns the first mismatch and exposes
no partial result or caller mutation.

The materialization identity includes the sealed declaration identity,
complete tuple type, exact template bytes, and scan materializer version.
WYSTIF transports that identity so separate compilation rejects stale or
different materializations. The generated runtime form has no template parser,
field-name table, allocator, or indirect parser dispatch.

## Considered options

General reflection, return packs, macros, and user-defined parser traits would
create language-wide mechanisms for one fixed-record operation. Runtime format
parsing would add metadata, validation work, and failure modes to every call.
Unchecked public string construction would make the UTF-8 invariant
unverifiable. These options are rejected. Reconsider a general parsing
abstraction only when several independent features need the same mechanism
and their type, provenance, and separate-compilation contracts are known.

## Consequences

Scalar and cursor scans remain ordinary sealed-core Wyst and share one integer
prefix parser. `scan.read` accepts only concrete named tuples with at least two
fields whose fields are supported fixed-layout movable values. Each field
occurs once, adjacent variable-length captures require a nonempty literal
delimiter, and a successful scan consumes all input. This decision adds no
locale, Unicode normalization, implicit whitespace, backtracking, allocator,
hidden cleanup, or runtime reflection system.
