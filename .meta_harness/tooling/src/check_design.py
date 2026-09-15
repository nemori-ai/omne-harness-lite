#!/usr/bin/env python3
"""Validate an independently copied meta-harness design information tree."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from design_validation import DesignValidator


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path,
                        help="Design root containing baseline/catalog/frozen/formal/rebase manifests")
    parser.add_argument("--previous-frozen", type=Path,
                        help="Earlier frozen manifest in the same baseline; registrations are append-only")
    parser.add_argument("--formal", choices=("registered", "skip", "run"), default="registered",
                        help="Report registration, explicitly skip, or actually execute formal tasks")
    args = parser.parse_args(argv)
    validator = DesignValidator(args.root, previous_frozen=args.previous_frozen, formal=args.formal)
    errors, notes = validator.validate()
    for note in notes:
        print(note)
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        print(f"FAIL: design validation found {len(errors)} error(s).", file=sys.stderr)
        return 1
    print(f"PASS: design tree {args.root.resolve()} is internally consistent; formal={args.formal}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
