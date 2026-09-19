#!/usr/bin/env python3
"""Apply edits exported from tools/edit-mode.js back into the chapter files.

    python3 tools/apply-edits.py edits.json            # show what would change
    python3 tools/apply-edits.py edits.json --write    # actually change the files

Each edit carries the exact HTML it replaces, so an edit made against an older
version of a paragraph is reported rather than guessed at. Nothing is written
unless every edit in the file can be placed unambiguously, or --force is given.
"""
import argparse
import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def changed_part(before: str, after: str, context: int = 30):
    """Trim the identical head and tail so the preview shows what actually changed."""
    head = 0
    while head < min(len(before), len(after)) and before[head] == after[head]:
        head += 1
    tail = 0
    while tail < min(len(before), len(after)) - head and before[-1 - tail] == after[-1 - tail]:
        tail += 1
    lead = before[max(0, head - context):head]
    trail = before[len(before) - tail:len(before) - tail + context]
    mark = lambda mid: (("…" if head > context else "") + lead + "[" + mid + "]" + trail + ("…" if tail > context else "")).replace("\n", " ")
    return mark(before[head:len(before) - tail]), mark(after[head:len(after) - tail])


def normalize(s: str) -> str:
    """Browser innerHTML and file source differ in incidental whitespace."""
    return re.sub(r"\s+", " ", s).strip()


def find(source: str, needle: str):
    """Return (start, end) of needle in source, tolerant of whitespace differences."""
    if source.count(needle) == 1:
        i = source.index(needle)
        return i, i + len(needle)
    # Fall back to a whitespace-insensitive search.
    pattern = re.compile(r"\s+".join(re.escape(w) for w in needle.split()), re.S)
    hits = list(pattern.finditer(source))
    if len(hits) == 1:
        return hits[0].start(), hits[0].end()
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("edits", help="edits.json exported from edit mode")
    ap.add_argument("--write", action="store_true", help="write the changes to disk")
    ap.add_argument("--root", default=str(ROOT), help="project root (default: this repo)")
    ap.add_argument("--force", action="store_true", help="apply the edits that matched, even if others failed")
    args = ap.parse_args()

    root = pathlib.Path(args.root).resolve()
    data = json.loads(pathlib.Path(args.edits).read_text())
    edits = data["edits"] if isinstance(data, dict) else data

    by_file: dict[str, list] = {}
    for e in edits:
        by_file.setdefault(e["file"], []).append(e)

    planned, failed = [], []
    for rel, items in sorted(by_file.items()):
        path = root / rel
        if not path.exists():
            failed.append((rel, "no such file", ""))
            continue
        source = path.read_text()
        updated = source
        for e in items:
            span = find(updated, e["before"])
            if not span:
                failed.append((rel, "could not place this edit (the paragraph changed since you edited it?)",
                               html.unescape(re.sub("<[^>]+>", "", e["before"]))[:100]))
                continue
            start, end = span
            updated = updated[:start] + e["after"] + updated[end:]
            was, now = (html.unescape(re.sub("<[^>]+>", "", x)) for x in (e["before"], e["after"]))
            planned.append((rel,) + changed_part(was, now))
        if updated != source:
            by_file[rel] = updated  # type: ignore[assignment]
        else:
            by_file[rel] = None  # type: ignore[assignment]

    for rel, before, after in planned:
        print(f"\n{rel}\n  - {before}\n  + {after}")
    if failed:
        print("\nCould not apply:")
        for rel, why, what in failed:
            print(f"  {rel}: {why}\n    {what}")

    print(f"\n{len(planned)} edit(s) ready, {len(failed)} stuck.")
    if not args.write:
        print("Dry run. Re-run with --write to apply.")
        return 1 if failed else 0
    if failed and not args.force:
        print("Nothing written. Fix the stuck edits, or re-run with --force to apply the rest.")
        return 1
    for rel, updated in by_file.items():
        if updated:
            (root / rel).write_text(updated)
            print(f"wrote {rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
