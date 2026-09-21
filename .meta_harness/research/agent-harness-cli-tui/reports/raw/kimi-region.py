#!/usr/bin/env python3
"""List or print rolldown `//#region <module>` blocks in an extracted kimi-code bundle.

The native binary's JS payload is bundled by tsdown/rolldown and is NOT minified:
every source module is delimited by `//#region <path>` / `//#endregion`, so the
bundle can be read as (reformatted) source.

Usage:
  python3 kimi-region.py <main.cjs> '<regex>'      # list matching regions
  python3 kimi-region.py <main.cjs> '<regex>' -p   # print their bodies
"""
import re
import sys


def main(bundle: str, pattern: str, show: bool) -> None:
    lines = open(bundle, encoding="utf-8", errors="replace").read().split("\n")
    idx = [(i, l[10:]) for i, l in enumerate(lines) if l.startswith("//#region ")]
    for n, (i, name) in enumerate(idx):
        if not re.search(pattern, name):
            continue
        end = idx[n + 1][0] if n + 1 < len(idx) else len(lines)
        body = lines[i + 1 : end]
        while body and (body[-1].startswith("//#endregion") or body[-1] == ""):
            body.pop()
        print(f"########## {name}  ({len(body)} lines) ##########")
        if show:
            print("\n".join(body))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], len(sys.argv) > 3 and sys.argv[3] == "-p")
