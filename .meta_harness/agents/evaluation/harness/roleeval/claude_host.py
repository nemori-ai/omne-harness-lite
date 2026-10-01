"""Run one role once as a fresh Claude Code process and read back what the host recorded.

The role runs from its compiled definition, passed with ``--agents`` and started as
the main session, so the process under test is what a dispatch would start. Nothing
here calls the model API directly.
"""
from __future__ import annotations

import json
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

TOOL_RESULT_CLIP = 20_000


@dataclass
class Episode:
    turns: list[dict[str, Any]] = field(default_factory=list)
    final: str = ""
    model: str | None = None
    models_observed: list[str] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)
    cost_usd: float | None = None
    stop_reason: str | None = None
    terminal: str | None = None
    is_error: bool | None = None
    tool_calls: int = 0
    tool_names: dict[str, int] = field(default_factory=dict)
    tool_inputs: list[tuple[str, str]] = field(default_factory=list)
    api_seconds: float | None = None
    wall_seconds: float | None = None
    timed_out: bool = False
    exit_code: int | None = None

    def failure(self, requested_model: str) -> tuple[str, str] | None:
        """(failure class, detail) when this run produced nothing that may be scored."""
        if self.timed_out:
            return ("timeout", f"wall-clock ceiling hit after {self.wall_seconds:.0f}s")
        if self.terminal is None:
            return ("harness", f"host ended without a result event (exit code {self.exit_code})")
        if self.terminal == "error_max_budget_usd":
            return ("budget", "per-run budget ceiling hit")
        if self.is_error or self.terminal != "success":
            return ("harness", f"host reported {self.terminal}")
        if requested_model not in self.models_observed:
            return ("model-mismatch", f"asked for {requested_model}, host recorded {self.models_observed}")
        if not self.final.strip():
            return ("harness", "host reported success with an empty final message")
        return None

    def truncated(self) -> bool:
        return self.stop_reason == "max_tokens"


def definition(generated: Path, *, model: str | None = None, tools: list[str] | None = None) -> dict[str, Any]:
    """A compiled Claude Code agent file as an ``--agents`` entry, with optional dispatch overrides."""
    _, front, body = generated.read_text(encoding="utf-8").split("---\n", 2)
    fields: dict[str, str] = {}
    key = None
    for line in front.splitlines():
        if line.startswith(" ") and key:
            fields[key] += " " + line.strip()
        elif ":" in line:
            key, _, value = line.partition(":")
            fields[key] = value.strip()
    fields = {k: v.strip("'").replace("''", "'") for k, v in fields.items()}
    entry: dict[str, Any] = {
        "description": fields["description"], "prompt": body.strip(),
        "model": model or fields["model"],
        "tools": tools or [tool.strip() for tool in fields["tools"].split(",")],
    }
    for optional in ("permissionMode", "effort"):
        if optional in fields:
            entry[optional] = fields[optional]
    return {fields["name"]: entry}


def command(agents_json: Path, role: str, *, model: str, effort: str, allowed: list[str], disallowed: list[str],
            permission_mode: str, budget_usd: float) -> list[str]:
    return ["claude", "-p", "--agents", str(agents_json), "--agent", role, "--model", model, "--effort", effort,
            "--setting-sources", "project", "--permission-mode", permission_mode, "--permission-prompts", "none",
            "--output-format", "stream-json", "--verbose", "--max-budget-usd", str(budget_usd),
            "--no-session-persistence", "--disallowedTools", *disallowed, "--allowedTools", *allowed]


def run(cmd: list[str], *, cwd: Path, brief: str, wall_seconds: int, evidence: Path) -> Episode:
    """Start the host, feed the brief on stdin, keep the raw stream under ``evidence``."""
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "brief.md").write_text(brief, encoding="utf-8")
    started = time.monotonic()
    timed_out = False
    with open(evidence / "trajectory.jsonl", "w", encoding="utf-8") as out, \
            open(evidence / "stderr.log", "w", encoding="utf-8") as err:
        process = subprocess.Popen(cmd, cwd=str(cwd), stdin=subprocess.PIPE, stdout=out, stderr=err, text=True)
        try:
            process.communicate(brief, timeout=wall_seconds)
        except subprocess.TimeoutExpired:
            # Stream liveness says nothing about progress; only total time reclaims the slot.
            timed_out = True
            process.kill()
            process.communicate()
    episode = parse(evidence / "trajectory.jsonl", brief=brief)
    episode.wall_seconds = time.monotonic() - started
    episode.timed_out = timed_out
    episode.exit_code = process.returncode
    return episode


def parse(trajectory: Path, *, brief: str) -> Episode:
    """Turn the host's stream-json into transcript turns plus the figures the host itself reports."""
    episode = Episode(turns=[{"role": "user", "content": brief}])
    for line in trajectory.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        kind = event.get("type")
        if kind == "assistant":
            _assistant(episode, event.get("message", {}).get("content", []))
        elif kind == "user":
            _tool_results(episode, event.get("message", {}).get("content", []))
        elif kind == "result":
            _result(episode, event)
    return episode


def _assistant(episode: Episode, blocks: list[dict[str, Any]]) -> None:
    thinking = None
    for block in blocks:
        if block.get("type") == "thinking":
            thinking = block.get("thinking") or None
        elif block.get("type") == "text" and block.get("text"):
            turn = {"role": "assistant", "content": block["text"]}
            if thinking:
                turn["thinking"], thinking = thinking, None
            episode.turns.append(turn)
        elif block.get("type") == "tool_use":
            name = str(block.get("name"))
            args = json.dumps(block.get("input", {}), ensure_ascii=False, indent=2)
            episode.tool_calls += 1
            episode.tool_names[name] = episode.tool_names.get(name, 0) + 1
            episode.tool_inputs.append((name, args))
            turn = {"role": "tool_call", "name": name, "content": args}
            if thinking:
                turn["thinking"], thinking = thinking, None
            episode.turns.append(turn)


def _tool_results(episode: Episode, blocks: Any) -> None:
    if not isinstance(blocks, list):
        return
    for block in blocks:
        if block.get("type") != "tool_result":
            continue
        content = block.get("content")
        if isinstance(content, list):
            content = "\n".join(str(part.get("text", "")) for part in content if isinstance(part, dict))
        text = str(content or "")
        if len(text) > TOOL_RESULT_CLIP:
            text = text[:TOOL_RESULT_CLIP] + f"\n… [{len(text) - TOOL_RESULT_CLIP} more characters in trajectory.jsonl]"
        episode.turns.append({"role": "tool_result", "content": text})


def _result(episode: Episode, event: dict[str, Any]) -> None:
    usage = event.get("usage") or {}
    episode.usage = {key: int(usage.get(key, 0)) for key in (
        "input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")}
    by_model = event.get("modelUsage") or {}
    episode.models_observed = sorted(by_model)
    if by_model:
        episode.model = max(by_model, key=lambda name: by_model[name].get("outputTokens", 0))
    episode.cost_usd = event.get("total_cost_usd")
    episode.stop_reason = event.get("stop_reason")
    episode.terminal = event.get("subtype")
    episode.is_error = event.get("is_error")
    episode.final = event.get("result") or ""
    if event.get("duration_api_ms") is not None:
        episode.api_seconds = event["duration_api_ms"] / 1000
