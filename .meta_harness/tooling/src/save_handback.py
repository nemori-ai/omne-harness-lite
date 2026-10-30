#!/usr/bin/env python3
"""Save the report that a read-only subagent handed back from its transcript to a file.

Read-only roles cannot write files, so the report exists only in the host transcript.
The report text is taken from, in this order:

1. the last `SubagentHandback` tool call, from its `message` field (the shape that
   `agents/evaluation/harness/roleeval/claude_host.py` already reads);
2. the closing assistant message of the transcript, when it ended the turn
   (`stop_reason` is `end_turn`; host error messages end with `stop_sequence`). Claude Code subagent transcripts on
   the observed hosts end this way and carry no `SubagentHandback` call.

Both come from the current turn only. A `SubagentHandback` call counts when it comes after the last prompt. When
user records follow the closing assistant message, the report of this turn is not in the transcript: exit status 1.

Records are split at line feeds (U+000A) only. A line that is not a JSON object stops the script with exit status 2
and its line number. The one exception is an unterminated last line, which a host that is still writing the
transcript can leave half written: the script ignores it and names it on standard error.

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


class Unusable(Exception):
    """The transcript cannot be read as records; the message says where."""


class NotThisTurn(Exception):
    """The transcript holds no report for its current turn, though an earlier turn may have one."""


def _records(text: str) -> tuple[list[dict[str, Any]], int | None]:
    """The JSON object on each line, and the number of an unterminated last line that was ignored, if any.

    ``str.splitlines`` also splits at U+2028, U+2029, U+0085 and other separators that a JSON string may hold
    unescaped, so a record would come apart there. JSON Lines ends a record at a line feed (U+000A) only.
    """
    lines = text.split("\n")
    records, ignored = [], None
    for number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            if number == len(lines):  # No newline after it: the writer can still be in the middle of this record.
                ignored = number
                continue
            raise Unusable(f"line {number} is not valid JSON ({error.msg})") from None
        if not isinstance(value, dict):
            raise Unusable(f"line {number} is not a JSON object")
        records.append(value)
    return records, ignored


def _blocks(record: dict[str, Any]) -> list[dict[str, Any]]:
    message = record.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    return [block for block in content if isinstance(block, dict)] if isinstance(content, list) else []


def _assistant(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [record for record in records if record.get("type") == "assistant"
            and isinstance(record.get("message"), dict)]


def _is_prompt(record: dict[str, Any]) -> bool:
    """A user record that starts a turn: not only tool results handed back, not a record the host added (isMeta)."""
    if record.get("type") != "user" or record.get("isMeta"):
        return False
    message = record.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, list):
        return any(not (isinstance(block, dict) and block.get("type") == "tool_result") for block in content)
    return True


def _current_turn(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    starts = [index for index, record in enumerate(records) if _is_prompt(record)]
    return records[starts[-1] + 1:] if starts else records


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
    after = next(index for index in range(len(records) - 1, -1, -1) if records[index] is last) + 1
    if any(record.get("type") == "user" for record in records[after:]):
        raise NotThisTurn("user records follow the closing assistant message, so it answers an earlier turn")
    message = last["message"]
    if message.get("stop_reason") != "end_turn":
        return None
    identity = message.get("id")
    group = [record for record in assistant if record["message"].get("id") == identity] if identity else [last]
    texts = [block["text"] for record in group for block in _blocks(record)
             if block.get("type") == "text" and isinstance(block.get("text"), str)]
    return "".join(texts)


def extract(records: list[dict[str, Any]]) -> tuple[str, str] | None:
    """The report and where it came from (`handback-call` or `closing-message`), or None.

    Raises ``NotThisTurn`` when only an earlier turn can hold one.
    """
    report = _last_handback_call(_current_turn(records))
    if report is not None and report.strip():
        return report, "handback-call"
    report = _closing_message(records)
    if report is not None and report.strip():
        return report, "closing-message"
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
    try:
        records, ignored = _records(text)
    except Unusable as error:
        print(f"ERROR: cannot read transcript {args.transcript}: {error}. Nothing was written.", file=sys.stderr)
        return EXIT_UNUSABLE
    if ignored is not None:
        print(f"NOTE: ignored line {ignored} of {args.transcript}: no newline follows it and it is not valid JSON, "
              "so the host can still be writing it.", file=sys.stderr)
    try:
        found = extract(records)
    except NotThisTurn as error:
        print(f"ERROR: no report of this turn in {args.transcript}: {error}. Nothing was written.", file=sys.stderr)
        return EXIT_NOT_FOUND
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
