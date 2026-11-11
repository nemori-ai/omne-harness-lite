#!/usr/bin/env python3
"""Write the pinned pqw-skills resident card into the managed block of the root AGENTS.md, or check it."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pqw_contract

CARD =Path(".meta_harness/agents/vendor/pqw-skills/skills/single-session-dev-flow/resident-card.md")
ENTRY = Path("AGENTS.md")
BEGIN = "<!-- BEGIN:pqw-skills-resident-card -->"
END = "<!-- END:pqw-skills-resident-card -->"
SEPARATOR = "---"


def card_text(source: str) -> str:
    """The card is everything below the one separator line of the released file."""
    lines = source.splitlines()
    if lines.count(SEPARATOR) != 1:
        raise ValueError(f"{CARD} must have exactly one '{SEPARATOR}' line above the card")
    body = "\n".join(lines[lines.index(SEPARATOR) + 1:]).strip("\n")
    if not body:
        raise ValueError(f"{CARD} has no card below its '{SEPARATOR}' line")
    return body + "\n"


def with_card(entry: str, card: str) -> str:
    """The entry text with the card as the only content between the one ordered marker pair."""
    if entry.count(BEGIN) != 1 or entry.count(END) != 1 or entry.index(BEGIN) > entry.index(END):
        raise ValueError(f"{ENTRY} must have one '{BEGIN}' line followed by one '{END}' line")
    head, rest = entry.split(BEGIN)
    tail = rest.split(END)[1]
    return f"{head}{BEGIN}\n\n{card}\n{END}{tail}"


def sync(project: Path, check: bool) -> None:
    source = pqw_contract.root(project) / CARD.relative_to(pqw_contract.VENDOR)
    if not source.is_file():
        raise ValueError(f"missing pinned resident card {CARD}; run `git submodule update --init`")
    entry = project / ENTRY
    current = entry.read_text(encoding="utf-8")
    expected = with_card(current, card_text(source.read_text(encoding="utf-8")))
    if current == expected:
        return
    if check:
        raise ValueError(f"the resident card in {ENTRY} differs from {CARD}; "
                         "run initialize_agents.py to copy the pinned card")
    entry.write_text(expected, encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--check", action="store_true", help="Read-only check that the block equals the pinned card")
    args = parser.parse_args(argv)
    try:
        sync(args.project_root, args.check)
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("PASS: resident card in AGENTS.md equals the pinned pqw-skills card.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
