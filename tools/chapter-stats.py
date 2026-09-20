#!/usr/bin/env python3
"""Measure each chapter and write the numbers into the CHAPTERS table in book.js.

    python3 tools/chapter-stats.py            # show what would change
    python3 tools/chapter-stats.py --write    # update assets/book.js

A page can count its own words at runtime, but the table of contents and the
previous/next cards need the numbers for chapters the reader isn't on. Rather than
fetch every page, we bake three numbers per chapter into the table: minutes to read,
build steps, and experiments. Re-run this after writing or cutting prose.
"""
import argparse
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BOOK_JS = ROOT / "assets" / "book.js"
WORDS_PER_MINUTE = 220


def stats(path: pathlib.Path) -> dict:
    html = path.read_text()
    main = re.search(r"<main[^>]*>(.*)</main>", html, re.S)
    body = main.group(1) if main else html
    body = re.sub(r"<(script|style|svg|textarea)\b.*?</\1>", " ", body, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", body)
    words = len(text.split())
    return {
        "mins": max(1, round(words / WORDS_PER_MINUTE)),
        "builds": len(re.findall(r'class="code-cell"', html)),
        "runs": len(re.findall(r'class="widget"', html)),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    source = BOOK_JS.read_text()
    changed, report = source, []
    for m in re.finditer(r"\{ id: '([^']+)'.*?\}", source):
        entry, cid = m.group(0), m.group(1)
        path = ROOT / "chapters" / f"{cid}.html"
        if not path.exists():
            continue
        s = stats(path)
        want = f", mins: {s['mins']}, builds: {s['builds']}, runs: {s['runs']} }}"
        stripped = re.sub(r", mins: \d+, builds: \d+, runs: \d+ \}$", " }", entry)
        updated = stripped[:-2] + want
        if updated != entry:
            changed = changed.replace(entry, updated)
            report.append(f"{cid}: {s['mins']} min, {s['builds']} build, {s['runs']} run")

    for line in report:
        print(line)
    print(f"\n{len(report)} chapter(s) to update.")
    if not args.write:
        print("Dry run. Re-run with --write.")
        return 0
    BOOK_JS.write_text(changed)
    print(f"wrote {BOOK_JS.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
