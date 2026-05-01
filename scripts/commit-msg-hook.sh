#!/bin/sh
# Cumulative-release mode: auto-bump on commit is DISABLED.
#
# Rationale:
#   Per-commit version bumps produce many same-day CWS releases (e.g. 2.53.1..5
#   in one day), which the Enhanced Safe Browsing trust model penalises.
#
# New workflow:
#   1. Commit normally (no version change per commit).
#   2. When ready to ship (e.g. weekly), run:
#        scripts/bump-version.sh          # one bump for the whole batch
#        scripts/release.sh               # build ZIP + GitHub release
#
# To restore per-commit bumping, see git history of this file.

exit 0
