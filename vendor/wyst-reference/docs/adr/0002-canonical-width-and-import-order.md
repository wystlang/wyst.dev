---
status: accepted
---

# Bound canonical source width and order module imports

Wyst's formatter limits breakable source syntax to 100 columns and orders
module imports into private `core.*`, private project, and public re-export
groups, with lexicographic module paths and original-name ordering inside
selective imports. This makes canonical source stable and scannable across
tools and generated files; standalone versus explicit-group syntax remains an
author choice, comments move with the entries they describe, and indivisible
source text plus linker `import symbol` declarations remain outside the policy.

## Consequences

The formatter may reorder module-import AST items and their attached comments,
so round-trip validation compares their canonical order rather than raw source
order. Non-empty import groups are separated by one blank line, and syntax is
rendered multiline whenever its breakable representation would exceed the
100-column limit.
