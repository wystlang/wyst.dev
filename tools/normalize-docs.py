#!/usr/bin/env python3
"""
One-time migration: normalize Wyst design-manual markdown for site generation.

Two fixes, applied in place to the canonical docs in the wystlang/wyst repo:

  1. Heading levels — a page should have exactly one H1 (its title). Several
     chapters misuse repeated `# ` as section headers. For any file with more
     than one top-level H1, keep the first H1 and demote every later heading by
     one level. Files that already have a single H1 are left untouched.

  2. Frontmatter — prepend minimal YAML (title / order / group / summary) so the
     generator never has to scrape prose. Summaries come from the README TOC so
     no copy is invented. Idempotent: files that already start with `---` are
     skipped.

Code fences are tracked so `#`-prefixed lines *inside* fenced blocks (shell
comments, Wyst examples) are never mistaken for headings.

Usage:  python3 tools/normalize-docs.py /path/to/wyst/design
"""

import re
import sys
from pathlib import Path

FENCE_RE = re.compile(r"^(`{3,}|~{3,})")
HEADING_RE = re.compile(r"^(#{1,6})(\s+\S.*)$")


def iter_lines_with_fence_state(lines):
    """Yield (index, line, in_fence) tracking fenced code blocks."""
    in_fence = False
    marker = None
    for i, line in enumerate(lines):
        m = FENCE_RE.match(line)
        if m:
            ch = m.group(1)[0]
            if not in_fence:
                in_fence, marker = True, ch
            elif line.lstrip().startswith(marker * 3):
                in_fence, marker = False, None
            yield i, line, True  # the fence line itself is "code"
            continue
        yield i, line, in_fence


def first_h1_text(lines):
    for _, line, in_fence in iter_lines_with_fence_state(lines):
        if in_fence:
            continue
        m = HEADING_RE.match(line)
        if m and len(m.group(1)) == 1:
            return m.group(2).strip()
    return None


def count_h1(lines):
    n = 0
    for _, line, in_fence in iter_lines_with_fence_state(lines):
        if in_fence:
            continue
        m = HEADING_RE.match(line)
        if m and len(m.group(1)) == 1:
            n += 1
    return n


def demote(lines):
    """Keep the first heading as-is; demote every later heading by one level."""
    out = list(lines)
    seen_first = False
    for i, line, in_fence in iter_lines_with_fence_state(lines):
        if in_fence:
            continue
        m = HEADING_RE.match(line)
        if not m:
            continue
        if not seen_first:
            seen_first = True
            continue
        out[i] = "#" + line  # add one level
    return out


def parse_readme(readme: Path):
    """Return {filename: (id, purpose)} parsed from the README TOC tables."""
    meta = {}
    link = re.compile(r"\[[^\]]+\]\(([^)#]+\.md)[^)]*\)")
    for raw in readme.read_text(encoding="utf-8").splitlines():
        if not raw.lstrip().startswith("|"):
            continue
        cells = [c.strip() for c in raw.strip().strip("|").split("|")]
        if len(cells) < 3:
            continue
        ident = cells[0]
        m = link.search(cells[1])
        if not m:
            continue
        fname = m.group(1)
        purpose = cells[-1]
        meta[fname] = (ident, purpose)
    return meta


def yaml_quote(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def build_frontmatter(fname, title, readme_meta):
    ident, summary = readme_meta.get(fname, ("", ""))
    fm = ["---", f"title: {yaml_quote(title)}"]
    if fname == "README.md":
        fm += ["group: manual", "order: 0"]
    elif ident.isdigit():
        fm += ["group: chapter", f"chapter: {int(ident)}", f"order: {int(ident)}"]
    elif ident:  # appendix letter
        letter = ident.strip().upper()
        idx = ord(letter) - ord("A") + 1
        fm += ["group: appendix", f"appendix: {yaml_quote(letter)}", f"order: {24 + idx}"]
    if summary:
        fm.append(f"summary: {yaml_quote(summary)}")
    fm += ["---", ""]
    return "\n".join(fm) + "\n"


def main():
    design = Path(sys.argv[1] if len(sys.argv) > 1 else ".").expanduser().resolve()
    readme_meta = parse_readme(design / "README.md")

    for path in sorted(design.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        if text.startswith("---\n") or text.startswith("---\r\n"):
            print(f"  skip  {path.name}  (already has frontmatter)")
            continue
        lines = text.splitlines(keepends=True)

        title = first_h1_text([l.rstrip("\n") for l in lines]) or path.stem
        n_h1 = count_h1([l.rstrip("\n") for l in lines])

        demoted = False
        if n_h1 > 1:
            new = demote([l.rstrip("\n") for l in lines])
            lines = [l + "\n" for l in new]
            demoted = True

        fm = build_frontmatter(path.name, title, readme_meta)
        path.write_text(fm + "".join(lines), encoding="utf-8")
        flag = "demote+fm" if demoted else "fm-only "
        print(f"  {flag}  {path.name}  (H1s={n_h1})  title={title!r}")


if __name__ == "__main__":
    main()
