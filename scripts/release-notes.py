#!/usr/bin/env python3
"""Prints the CHANGELOG.md section for a version: `release-notes.py v1.2.0` (exit 1 if missing)."""
import pathlib
import re
import sys


def section(changelog: str, version: str) -> str | None:
    version = version.lstrip("v")
    lines = changelog.splitlines()
    start = next((i for i, l in enumerate(lines) if re.match(rf"^## \[{re.escape(version)}\]", l)), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## [")), len(lines))
    return "\n".join(lines[start + 1 : end]).strip()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: release-notes.py <version>")
    root = pathlib.Path(__file__).resolve().parent.parent
    notes = section((root / "CHANGELOG.md").read_text(encoding="utf-8"), sys.argv[1])
    if notes is None:
        sys.exit(f"CHANGELOG.md has no section for {sys.argv[1]}")
    print(notes)
