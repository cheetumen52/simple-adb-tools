#!/usr/bin/env python3
"""Prints release notes for a version from the changelogs (exit 1 if a section is missing).

  release-notes.py v1.2.0             English and Czech, as the app expects them (default)
  release-notes.py v1.2.0 --lang cs   one language only (cs = CHANGELOG.md, en = CHANGELOG.en.md)

The bilingual form is English, then `<!-- cs -->` and Czech, closed by `<!-- end -->`;
the app shows the part matching its language (src/lib/changelog.ts → localizedNotes).
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = {"cs": "CHANGELOG.md", "en": "CHANGELOG.en.md"}


def section(changelog: str, version: str) -> str | None:
    version = version.lstrip("v")
    lines = changelog.splitlines()
    start = next((i for i, l in enumerate(lines) if re.match(rf"^## \[{re.escape(version)}\]", l)), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## [")), len(lines))
    return "\n".join(lines[start + 1 : end]).strip()


def notes(version: str, lang: str) -> str:
    text = section((ROOT / FILES[lang]).read_text(encoding="utf-8"), version)
    if text is None:
        sys.exit(f"{FILES[lang]} has no section for {version}")
    return text


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # Windows runners default to cp1252 when piped
    args = sys.argv[1:]
    lang = "both"
    if len(args) == 3 and args[1] == "--lang" and args[2] in FILES:
        lang = args[2]
    elif len(args) != 1:
        sys.exit(__doc__)
    version = args[0]
    if lang == "both":
        print(f"{notes(version, 'en')}\n\n<!-- cs -->\n#### Česky\n\n{notes(version, 'cs')}\n<!-- end -->")
    else:
        print(notes(version, lang))
