#!/usr/bin/env python3
# Release notes generator — Step 3 of scripts/release.sh, which calls this as
#   python3 scripts/changelog.py "<prev tag or empty>" "<snapshot sha>"
# and captures stdout as the "What's Changed" body (stderr carries the note
# about commits no group claimed).
#
# It lives in its own file rather than in a release.sh heredoc so that it can be
# driven with synthetic git history: CI only ever runs release.sh --build-only,
# which exits before this step, so every rule below -- the record separators,
# the breaking-change triggers outranking the skip list, fix(security) landing
# under Security -- would otherwise first execute at the moment of a real
# publish. tests/theme-tooling-tests.mjs runs it against a fixture repository.
import sys, subprocess, re

prev_tag = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else ""
snapshot = sys.argv[2]

# Subject and body are needed: a BREAKING CHANGE footer lives in the body.
# %x1f separates subject from body, %x1e terminates each commit record — the
# same separator convention scripts/bump-version.sh uses.
LOG_FORMAT = "--pretty=format:%s%x1f%b%x1e"

if prev_tag:
    result = subprocess.run(
        ["git", "log", f"{prev_tag}..{snapshot}", LOG_FORMAT, "--no-merges"],
        capture_output=True, text=True
    )
else:
    result = subprocess.run(
        ["git", "log", snapshot, LOG_FORMAT, "--no-merges", "-20"],
        capture_output=True, text=True
    )

if result.returncode != 0:
    print(result.stderr.strip() or "git log failed", file=sys.stderr)
    sys.exit(result.returncode)

commits = []
for record in result.stdout.split("\x1e"):
    record = record.strip()
    if not record:
        continue
    subject, _, body = record.partition("\x1f")
    commits.append((subject.strip(), body))

# Skip release-infrastructure bookkeeping and internal maintenance noise.
skip_patterns = [
    re.compile(r'^docs:\s*update version badge'),
    re.compile(r'^chore(?:\([^)]+\))?:'),
]

# Same two major triggers scripts/bump-version.sh recognises, so a release that
# bumped major always renders a Breaking Changes section.
breaking_body = re.compile(r'(^|\n)BREAKING(?: CHANGE|-CHANGE):')
bang_subject = re.compile(r'^\w+(?:\([^)]+\))?!:')

groups = {
    "breaking": {"label": "Breaking Changes", "items": []},
    "feat":     {"label": "New Features",   "items": []},
    "fix":      {"label": "Bug Fixes",      "items": []},
    "perf":     {"label": "Performance",    "items": []},
    "style":    {"label": "Styling",        "items": []},
    "refactor": {"label": "Improvements",   "items": []},
    "docs":     {"label": "Documentation",  "items": []},
    "security": {"label": "Security",       "items": []},
}
order = ["breaking", "feat", "fix", "perf", "style", "refactor", "docs", "security"]

pattern = re.compile(r'^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$')

skipped = []
for msg, body in commits:
    # Breaking changes outrank both the skip list and the type grouping, and
    # keep their full subject so the `!` marker survives into the notes.
    if bang_subject.match(msg) or breaking_body.search(body):
        groups["breaking"]["items"].append(msg)
        continue
    if any(p.match(msg) for p in skip_patterns):
        continue
    m = pattern.match(msg)
    if not m:
        skipped.append(msg)
        continue
    ctype, scope, subject = m.group(1).lower(), (m.group(2) or '').lower(), m.group(3)
    if ctype == 'fix' and scope == 'security':
        ctype = 'security'
    if ctype in groups:
        groups[ctype]["items"].append(subject)
    else:
        skipped.append(msg)

# Skipped commits vanish from the release notes silently otherwise — surface
# them on stderr so the release operator can double-check nothing user-visible
# was dropped (chore/test/ci prefixes and free-form messages land here).
if skipped:
    import sys
    print(f"NOTE: {len(skipped)} commit(s) not matched into the changelog:", file=sys.stderr)
    for msg in skipped[:20]:
        print(f"  - {msg}", file=sys.stderr)

output = []
for key in order:
    items = groups[key]["items"]
    if not items:
        continue
    output.append(f"### {groups[key]['label']}")
    for item in items:
        output.append(f"- {item}")
    output.append("")

if not output:
    output = ["No significant changes."]

print("\n".join(output))
