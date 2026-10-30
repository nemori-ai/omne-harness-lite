#!/usr/bin/env python3
"""Save the report that a read-only subagent handed back from its transcript to a file.

Read-only roles cannot write files, so the report exists only in the host transcript.
The report text is taken from, in this order:

1. the last `SubagentHandback` tool call, from its `message` field (the shape that
   `agents/evaluation/harness/roleeval/claude_host.py` already reads);
2. the closing assistant message of the transcript, when it ended the turn
   (`stop_reason` is `end_turn`; host error messages end with `stop_sequence`). Claude Code subagent transcripts on
   the observed hosts end this way and carry no `SubagentHandback` call.

An empty file is never written: when no report is found the exit status is non-zero.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

HANDBACK = "SubagentHandback"
EXIT_NOT_FOUND = 1
EXIT_UNUSABLE = 2


def _records(text: str) -> tuple[list[dict[str, Any]], int]:
    """Parsed JSON objects, one per line, and the count of lines skipped as unreadable."""
    records, skipped = [], 0
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            skipped += 1  # A transcript still being written can end on a partial line.
            continue
        if isinstance(value, dict):
            records.append(value)
        else:
            skipped += 1
    return records, skipped


def _blocks(record: dict[str, Any]) -> list[dict[str, Any]]:
    message = record.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    return [block for block in content if isinstance(block, dict)] if isinstance(content, list) else []


def _assistant(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [record for record in records if record.get("type") == "assistant"
            and isinstance(record.get("message"), dict)]


def _last_handback_call(records: list[dict[str, Any]]) -> str | None:
    found = None
    for record in _assistant(records):
        for block in _blocks(record):
            if block.get("type") == "tool_use" and block.get("name") == HANDBACK:
                payload = block.get("input")
                message = payload.get("message") if isinstance(payload, dict) else None
                found = message if isinstance(message, str) else None
    return found


def _closing_message(records: list[dict[str, Any]]) -> str | None:
    """Text of the last assistant message when it ended the turn normally.

    One API message is stored as several records (one per content block) that share the
    message id, so every record of the closing message contributes its text blocks.
    """
    assistant = _assistant(records)
    if not assistant:
        return None
    last = assistant[-1]
    message = last["message"]
    if message.get("stop_reason") != "end_turn":
        return None
    identity = message.get("id")
    group = [record for record in assistant if record["message"].get("id") == identity] if identity else [last]
    texts = [block["text"] for record in group for block in _blocks(record)
             if block.get("type") == "text" and isinstance(block.get("text"), str)]
    return "".join(texts)


def extract(text: str) -> tuple[str, str] | None:
    """The report and where it came from (`handback-call` or `closing-message`), or None."""
    records, _ = _records(text)
    for source, report in (("handback-call", _last_handback_call(records)),
                           ("closing-message", _closing_message(records))):
        if report is not None and report.strip():
            return report, source
    return None


def _write_atomically(out: Path, report: str) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(dir=out.parent, prefix=f".{out.name}.", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(report if report.endswith("\n") else report + "\n")
        os.replace(name, out)
    except BaseException:
        Path(name).unlink(missing_ok=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--transcript", required=True, type=Path,
                        help="Subagent transcript, ~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl")
    parser.add_argument("--out", required=True, type=Path, help="Markdown file to write the report to")
    args = parser.parse_args(argv)
    try:
        text = args.transcript.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        print(f"ERROR: cannot read transcript {args.transcript}: {error}", file=sys.stderr)
        return EXIT_UNUSABLE
    found = extract(text)
    if found is None:
        print(f"ERROR: no handed-back report in {args.transcript}: no {HANDBACK} call and no "
              "closing assistant message that ended the turn. Nothing was written.", file=sys.stderr)
        return EXIT_NOT_FOUND
    report, source = found
    try:
        _write_atomically(args.out, report)
    except OSError as error:
        print(f"ERROR: cannot write {args.out}: {error}", file=sys.stderr)
        return EXIT_UNUSABLE
    print(f"PASS: wrote {len(report.encode('utf-8'))} bytes to {args.out} (source: {source}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
