#!/usr/bin/env python3
"""Blocks credentials from entering the repo or the app bundle.

  check-secrets.py --staged      files staged for commit (pre-commit hook)
  check-secrets.py --all         every tracked file (CI)
  check-secrets.py --path DIR    every file under DIR, e.g. the built frontend (CI)
  check-secrets.py --self-test   verify the rules

A line containing `secret-scan: allow` is skipped.
"""
import base64
import pathlib
import re
import subprocess
import sys

ALLOW_MARKER = "secret-scan: allow"
MAX_BYTES = 2_000_000

# The minisign/Tauri secret-key header is a public format constant; it is assembled at runtime so this
# file does not match its own rule.
_TAURI_SECRET_HEADER = base64.b64encode(b"untrusted comment: rsign encrypted " + b"secret key").decode()[:40]

CONTENT_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("private key block", re.compile(r"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----")),
    ("Tauri/minisign secret key", re.compile(re.escape(_TAURI_SECRET_HEADER) + "|(?:rsign|minisign) encrypted secret key")),
    ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b")),
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("AWS secret key", re.compile(r"(?i)aws_secret_access_key\s*[:=]\s*['\"]?[A-Za-z0-9/+]{40}")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("Slack webhook", re.compile(r"hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+")),
    ("Stripe live key", re.compile(r"\b[rs]k_live_[A-Za-z0-9]{20,}")),
    ("OpenAI/Anthropic key", re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_\-]{32,}")),
    ("npm token", re.compile(r"\bnpm_[A-Za-z0-9]{36}\b")),
    ("signing key in env", re.compile(r"TAURI_SIGNING_PRIVATE_KEY(?:_PASSWORD)?\s*[:=]\s*['\"]?(?!\$)[A-Za-z0-9+/=_\-]{16,}")),
    (
        "hard-coded credential",
        re.compile(
            r"(?i)\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)"
            r"\s*[:=]\s*['\"][^'\"\s$<>{}]{12,}['\"]"
        ),
    ),
]

FILENAME_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("environment file", re.compile(r"(?:^|/)\.env(?:\.(?!example$|sample$|template$)[^/]+)?$")),
    ("key or certificate file", re.compile(r"\.(?:pem|key|p12|pfx|keystore|jks|mobileprovision|asc)$", re.I)),
    ("SSH key", re.compile(r"(?:^|/)id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$")),
]


def scan_text(path: str, text: str) -> list[str]:
    findings = [f"{path}: {name}" for name, rule in FILENAME_RULES if rule.search(path)]
    for lineno, line in enumerate(text.splitlines(), 1):
        if ALLOW_MARKER in line:
            continue
        for name, rule in CONTENT_RULES:
            match = rule.search(line)
            if match:
                shown = match.group(0)[:6] + "…"
                findings.append(f"{path}:{lineno}: {name} ({shown})")
    return findings


def decode(data: bytes) -> str | None:
    if len(data) > MAX_BYTES or b"\0" in data[:8192]:
        return None
    return data.decode("utf-8", errors="replace")


def git(*args: str) -> bytes:
    return subprocess.run(["git", *args], check=True, capture_output=True).stdout


def staged_files() -> list[tuple[str, str | None]]:
    names = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").decode().split("\0")
    # Scan the staged blob, not the working copy, so partially staged files are judged by what gets committed.
    return [(n, decode(git("show", f":{n}"))) for n in names if n]


def tracked_files() -> list[tuple[str, str | None]]:
    root = pathlib.Path(git("rev-parse", "--show-toplevel").decode().strip())
    names = git("ls-files", "-z").decode().split("\0")
    return [(n, decode((root / n).read_bytes())) for n in names if n and (root / n).is_file()]


def dir_files(directory: str) -> list[tuple[str, str | None]]:
    base = pathlib.Path(directory)
    if not base.is_dir():
        sys.exit(f"{directory} is not a directory")
    return [(str(p), decode(p.read_bytes())) for p in sorted(base.rglob("*")) if p.is_file()]


def self_test() -> None:
    fake = {
        "private key block": "-----BEGIN " + "OPENSSH PRIVATE KEY-----",
        "Tauri/minisign secret key": _TAURI_SECRET_HEADER + "AAAA",
        "GitHub token": "gh" + "p_" + "a1B2" * 9,
        "AWS access key": "AKIA" + "ABCDEFGHIJKLMNOP",
        "Google API key": "AIza" + "B" * 35,
        "Slack token": "xox" + "b-1234567890-abcdef",
        "Stripe live key": "sk_" + "live_" + "x" * 24,
        "OpenAI/Anthropic key": "sk-" + "ant-" + "y" * 40,
        "signing key in env": "TAURI_SIGNING_PRIVATE_KEY=" + "Q" * 30,
        "hard-coded credential": 'api_key = "' + "z" * 20 + '"',
    }
    for name, sample in fake.items():
        assert any(name in f for f in scan_text("sample.txt", sample)), f"rule '{name}' did not fire"

    clean = "\n".join(
        [
            "TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}",
            '"pubkey": "' + base64.b64encode(b"untrusted comment: minisign public key: ABCD").decode() + '"',
            "const password: string = input;",
            'apiKey: "<your-key-here>"',
            "token = " + "gh" + "p_" + "a1B2" * 9 + "  # secret-scan: allow",
        ]
    )
    assert scan_text("src/app.ts", clean) == [], scan_text("src/app.ts", clean)
    assert scan_text(".env", "") and scan_text("release.keystore", "") and not scan_text(".env.example", "")
    print("check-secrets self-test passed")


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "--staged"
    if mode == "--self-test":
        return self_test()
    if mode == "--staged":
        files = staged_files()
    elif mode == "--all":
        files = tracked_files()
    elif mode == "--path" and len(sys.argv) == 3:
        files = dir_files(sys.argv[2])
    else:
        sys.exit(__doc__)

    findings = [f for path, text in files for f in scan_text(path, text or "")]
    if findings:
        print("Possible secrets found – commit blocked:\n", file=sys.stderr)
        for f in findings:
            print(f"  {f}", file=sys.stderr)
        print(f"\nRemove them, or mark a false positive with '{ALLOW_MARKER}' on that line.", file=sys.stderr)
        sys.exit(1)
    print(f"check-secrets: {len(files)} file(s) clean")


if __name__ == "__main__":
    main()
