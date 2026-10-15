# Security Policy

## Supported versions

Only the latest release gets fixes. The app updates itself, so please make sure you run the newest version before reporting.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub: *Security → Report a vulnerability* in this repository, or via [hejzlar-development.cz](https://hejzlar-development.cz).

Include what you found, how to reproduce it and the app version. You'll get a reply within a few days, and a fix will be released as soon as it's ready.

## What the app does with your system

- It runs only `adb`, `aapt2` and `scrcpy`. Missing tools are downloaded from their official sources (Google, the scrcpy GitHub releases with SHA-256 verification).
- Updates are signed; the app installs only packages that match the public key built into it.
- It collects no analytics or telemetry.
