"""Read back what Claude Code recorded about one run of a role.

Nothing here starts a model. A run is a subagent that a main session dispatched; this
module reads the transcript the host keeps of it (``<session>/subagents/agent-<id>.jsonl``).
The stream format of the earlier headless runs is still read, for records taken before
that way of running was dropped.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

TOOL_RESULT_CLIP = 20_000
HANDBACK = "SubagentHandback"      # how a subagent returns its report; host plumbing, not a tool the role chose
USAGE_KEYS = ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")


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
    tool_outputs: list[str] = field(default_factory=list)
    api_seconds: float | None = None
    wall_seconds: float | None = None
    timed_out: bool = False
    exit_code: int | None = None
    prompt: str = ""
    efforts_observed: list[str] = field(default_factory=list)
    cwd: str | None = None             # the session's working directory, as the first event of the transcript gives it

    def failure(self, requested_model: str, requested_effort: str | None = None) -> tuple[str, str] | None:
        """(failure class, detail) when this run produced nothing that may be scored."""
        if self.timed_out:
            return ("timeout", f"wall-clock ceiling hit after {self.wall_seconds:.0f}s")
        if self.terminal is None:
            return ("harness", "the transcript does not end in a report")
        if self.terminal == "error_max_budget_usd":
            return ("budget", "per-run budget ceiling hit")
        if self.is_error or self.terminal != "success":
            return ("harness", f"host reported {self.terminal}")
        if requested_model not in self.models_observed:
            return ("model-mismatch", f"asked for {requested_model}, host recorded {self.models_observed}")
        # A transcript without effort events cannot show a mismatch; one that records another effort can.
        if requested_effort and self.efforts_observed and requested_effort not in self.efforts_observed:
            return ("effort-mismatch", f"asked for {requested_effort}, host recorded {self.efforts_observed}")
        if not self.final.strip():
            return ("harness", "host reported success with an empty final message")
        return None

    def touched(self, needles: list[str]) -> list[str]:
        """Which of ``needles`` the run's tool calls asked for or got back: where it reached that it should not have."""
        asked = [f"{name} asked for {needle}" for name, args in self.tool_inputs for needle in needles if needle in args]
        got = [f"a tool result mentions {needle}" for needle in needles
               if any(needle in text for text in self.tool_outputs)]
        return asked + got

    def asked(self, needles: list[str]) -> list[str]:
        """Which of ``needles`` the run's tool calls asked for; what came back is not looked at."""
        return [f"{name} asked for {needle}" for name, args in self.tool_inputs for needle in needles if needle in args]

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


def parse(trajectory: Path, *, brief: str) -> Episode:
    """Read a recorded run: a subagent transcript, or the stream of an earlier headless run.

    The two differ in how they end. A headless stream closes with one ``result`` event that carries
    the report and the totals. A subagent transcript has no such event: the report is what the
    subagent handed back, and the figures are read off its messages.
    """
    episode = Episode(turns=[{"role": "user", "content": brief}])
    usage: dict[str, tuple[str | None, dict[str, Any]]] = {}
    said: tuple[str | None, list[str]] = (None, [])
    handed_back: str | None = None
    stamps: list[str] = []
    thinking: str | None = None
    headless = False
    for line in trajectory.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        kind, message = event.get("type"), event.get("message") or {}
        if episode.cwd is None and event.get("cwd"):
            episode.cwd = str(event["cwd"])
        if event.get("timestamp"):
            stamps.append(event["timestamp"])
        if kind == "assistant":
            blocks = message.get("content", [])
            # One message arrives as several events, one per block; they share an id and repeat the usage.
            # A thinking block therefore waits for the block it led to, which is in a later event.
            thinking = _assistant(episode, blocks, thinking)
            identity = message.get("id") or event.get("uuid")
            usage[identity] = (message.get("model"), message.get("usage") or {})
            texts = [block["text"] for block in blocks if block.get("type") == "text" and block.get("text")]
            if texts:
                said = (identity, (said[1] if said[0] == identity else []) + texts)
            for block in blocks:
                if block.get("type") == "tool_use" and block.get("name") == HANDBACK:
                    handed_back = str((block.get("input") or {}).get("message") or "")
            if message.get("stop_reason"):
                episode.stop_reason = message["stop_reason"]
            if event.get("effort") and event["effort"] not in episode.efforts_observed:
                episode.efforts_observed.append(event["effort"])
        elif kind == "user":
            if not episode.prompt and isinstance(message.get("content"), str):
                episode.prompt = message["content"]
            _tool_results(episode, message.get("content", []))
        elif kind == "result":
            headless = True
            _result(episode, event)
    if not headless:
        _from_messages(episode, usage, handed_back if handed_back is not None else "\n\n".join(said[1]), stamps)
    return episode


def _from_messages(episode: Episode, usage: dict[str, tuple[str | None, dict[str, Any]]], final: str,
                   stamps: list[str]) -> None:
    """Figures of a subagent run. Token counts are what the transcript shows per message, which can
    undercount output: the host writes a message's usage as it starts streaming."""
    episode.usage = {key: sum(int(spent.get(key) or 0) for _, spent in usage.values()) for key in USAGE_KEYS}
    produced: dict[str, int] = {}
    for model, spent in usage.values():
        if model:
            produced[model] = produced.get(model, 0) + int(spent.get("output_tokens") or 0)
    episode.models_observed = sorted(produced)
    episode.model = max(produced, key=lambda name: produced[name]) if produced else None
    episode.final = final
    episode.terminal = "success" if final.strip() else None
    episode.is_error = False
    if len(stamps) >= 2:
        first, last = (datetime.fromisoformat(stamp.replace("Z", "+00:00")) for stamp in (stamps[0], stamps[-1]))
        episode.wall_seconds = (last - first).total_seconds()


def _assistant(episode: Episode, blocks: list[dict[str, Any]], thinking: str | None) -> str | None:
    """Add the turns of one event; return the thinking that no turn has taken yet."""
    for block in blocks:
        if block.get("type") == "thinking":
            thinking = block.get("thinking") or None
        elif block.get("type") == "text" and block.get("text"):
            turn = {"role": "assistant", "content": block["text"]}
            if thinking:
                turn["thinking"], thinking = thinking, None
            episode.turns.append(turn)
        elif block.get("type") == "tool_use" and block.get("name") == HANDBACK:
            turn = {"role": "assistant", "content": str((block.get("input") or {}).get("message") or "")}
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
    return thinking


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
        episode.tool_outputs.append(text)
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
