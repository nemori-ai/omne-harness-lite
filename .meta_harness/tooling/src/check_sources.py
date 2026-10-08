#!/usr/bin/env python3
"""Validate current design navigation; model execution and behavior have separate owners."""
from __future__ import annotations

import argparse
from pathlib import Path
from design_sources import check_links


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="Current design source root")
    parser.add_argument("--source-root", type=Path, help="Explicit execution checkout for module-owned links")
    args = parser.parse_args(argv)
    if not args.root.is_dir():
        parser.error("root must be an existing design directory")
    errors = check_links(args.root, args.source_root)
    for error in errors:
        print(f"ERROR: {error}")
    if errors:
        print(f"FAIL: {len(errors)} current-source navigation error(s).")
        return 1
    print("PASS: current source links and explicit owners. Not behavior or model verification.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
