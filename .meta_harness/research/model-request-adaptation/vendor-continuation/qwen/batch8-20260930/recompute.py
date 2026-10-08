#!/usr/bin/env python3
"""QC-V0: independent offline recompute of the batch8 Qwen commercial six-leaf three-turn counts.

Zero network, zero paid requests, no credentials. Inputs are read-only paths given on the
command line; nothing is written except the optional output file and prompt dump.

Method (as written in the research page section "本仓库 batch8 的离线复算"):
  1. Rebuild each round's request from the approved scenario plus the previous rounds'
     streamed outputs (raw SSE), and check the rebuild against the run's recorded
     wire hashes (firstWireSha256 / plannedWireSha256 / assistantReplaySha256).
  2. Render the rebuilt request with the pinned public Qwen3.8 chat_template.jinja through a
     real Jinja2 engine (not the package's hand-written renderer), per-leaf switches:
       3.8 leaves: preserve_thinking undefined, reasoning_effort undefined (template default xhigh)
       3.7 leaves: preserve_thinking=false, reasoning_effort='medium' (the template branch
                   that emits no effort sentence; not a claim that 3.7 runs at medium)
     The template's `tojson` filter is rendered both ways (see TOJSON_MODES); both are reported.
  3. Count with the pinned tokenizer.json through the HuggingFace `tokenizers` (Rust)
     library, add_special_tokens=False, and compare with upstream usage.prompt_tokens.
  4. Negative control: each leaf is also rendered with the other family's switches, which must
     not fit.

Run (offline, packages from the local uv cache; nothing is added to the repo lock):
  uv run --offline --no-project --with jinja2==3.1.6 --with tokenizers==0.23.2 \
    python recompute.py --private-dir <batch8-f8e55130> --scenario-dir <r6-families/qwen> \
    --tokenizer-dir <packages/model/pi-ai-transport/resources/tokenizers/qwen-38-24t> --out recompute-output.json
"""

from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import json
import sys
from pathlib import Path

import jinja2
import tokenizers
from jinja2.ext import loopcontrols
from jinja2.sandbox import ImmutableSandboxedEnvironment

# Per-leaf template switches, from the candidate page's per-leaf table
# (qwen-commercial-visible-reasoning-estimate-design.md, 逐叶设定). None = variable left undefined.
LEAVES = {
    "qwen3.7-flash": {"preserve_thinking": False, "reasoning_effort": "medium", "family": "3.7"},
    "qwen3.7-max": {"preserve_thinking": False, "reasoning_effort": "medium", "family": "3.7"},
    "qwen3.7-plus": {"preserve_thinking": False, "reasoning_effort": "medium", "family": "3.7"},
    "qwen3.8-flash": {"preserve_thinking": None, "reasoning_effort": None, "family": "3.8"},
    "qwen3.8-max-0902": {"preserve_thinking": None, "reasoning_effort": None, "family": "3.8"},
    "qwen3.8-max-prime": {"preserve_thinking": None, "reasoning_effort": None, "family": "3.8"},
}

# Numbers printed in the research page table (2026-09-30-community-harness-commercial-reasoning.md,
# 本仓库 batch8 的离线复算). Used only to report agreement; never fed into any prediction.
PAGE_TABLE = {
    "qwen3.7-flash": {"upstream": [1147, 1218, 1283], "surrogate": [999, 1559, 1892], "template": [1148, 1219, 1284]},
    "qwen3.7-max": {"upstream": [1147, 1218, 1283], "surrogate": [1013, 1193, 1382], "template": [1148, 1219, 1284]},
    "qwen3.7-plus": {"upstream": [1144, 1215, 1280], "surrogate": [1010, 1190, 1634], "template": [1145, 1216, 1281]},
    "qwen3.8-flash": {"upstream": [1185, 1283, 1367], "surrogate": [999, 1172, 1331], "template": [1186, 1284, 1368]},
    "qwen3.8-max-0902": {"upstream": [1188, 1366, 1528], "surrogate": [1029, 1289, 1528], "template": [1189, 1367, 1529]},
    "qwen3.8-max-prime": {"upstream": [1186, 1284, 1383], "surrogate": [1016, 1192, 1366], "template": [1187, 1285, 1384]},
}

PINNED = {
    "chat_template.jinja": "40ce34a5bcbc0231462740761215bc31a83882a8b3a4b6aa1c6e869b95945e4e",
    "tokenizer.json": "0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3",
}

DETAIL_KEYS = ("type", "text", "format", "index")

# The template calls `tool | tojson`. Two runtimes give that filter different semantics:
#   jinja: Jinja2's built-in filter (json.dumps sort_keys=True, HTML-safe escapes); this is what
#          the package renderer (src/input-meters/qwen.ts jinjaJson) emulates.
#   hf:    transformers' chat-template override (insertion order, ensure_ascii=False), the
#          environment HF apply_chat_template / vLLM render chat_template.jinja with.
# Neither is known to be Alibaba's; both are computed and reported side by side.
TOJSON_MODES = ("jinja", "hf")


class Fail(Exception):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def wire_json(value) -> str:
    """Compact JSON in insertion order, the same text JSON.stringify produces for these values."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


# ---------------------------------------------------------------- raw SSE


def dechunk(body: bytes) -> bytes:
    out, i = bytearray(), 0
    while True:
        j = body.index(b"\r\n", i)
        size = int(body[i:j].split(b";")[0], 16)
        i = j + 2
        if size == 0:
            return bytes(out)
        out += body[i : i + size]
        if body[i + size : i + size + 2] != b"\r\n":
            raise Fail("chunk framing broken")
        i += size + 2


def parse_sse(path: Path) -> dict:
    raw = path.read_bytes()
    head, sep, body = raw.partition(b"\r\n\r\n")
    if not sep or not head.startswith(b"HTTP/1.1 200"):
        raise Fail(f"{path.name}: unexpected HTTP head")
    headers = head.decode("latin-1").lower()
    payload = dechunk(body) if "transfer-encoding: chunked" in headers else body
    reasoning, detail_text, content = [], [], []
    calls: dict[int, dict] = {}
    opened: list[str] = []  # output block open order: "thinking", "text", "tool:<index>"
    usage = None

    def open_block(name: str) -> None:
        if name not in opened:
            opened.append(name)

    frames = {"detailFrames": 0, "detailShapeViolations": [], "reasoningMismatchFrames": 0}
    for line in payload.decode("utf-8").split("\n"):
        line = line.rstrip("\r")
        if not line.startswith("data: ") or line == "data: [DONE]":
            continue
        event = json.loads(line[6:])
        if "error" in event:
            raise Fail(f"{path.name}: in-band error")
        if event.get("usage") is not None:
            usage = event["usage"]
        for choice in event.get("choices", []):
            delta = choice.get("delta") or {}
            if delta.get("content"):
                open_block("text")
                content.append(delta["content"])
            frame_reasoning = delta.get("reasoning")
            if frame_reasoning or delta.get("reasoning_details"):
                open_block("thinking")
            if frame_reasoning:
                reasoning.append(frame_reasoning)
            frame_detail_text = ""
            for detail in delta.get("reasoning_details") or []:
                frames["detailFrames"] += 1
                shape_ok = (
                    tuple(detail.keys()) == DETAIL_KEYS
                    and detail["type"] == "reasoning.text"
                    and detail["format"] == "unknown"
                    and detail["index"] == 0
                    and isinstance(detail["text"], str)
                )
                if not shape_ok:
                    frames["detailShapeViolations"].append(sorted(detail.keys()))
                frame_detail_text += detail.get("text") or ""
            if frame_detail_text != (frame_reasoning or ""):
                frames["reasoningMismatchFrames"] += 1
            if frame_detail_text:
                detail_text.append(frame_detail_text)
            for call in delta.get("tool_calls") or []:
                slot = calls.setdefault(call["index"], {"id": None, "name": None, "arguments": ""})
                if call.get("id"):
                    slot["id"] = call["id"]
                fn = call.get("function") or {}
                if fn.get("name"):
                    open_block(f"tool:{call['index']}")
                    slot["name"] = fn["name"]
                slot["arguments"] += fn.get("arguments") or ""
    if usage is None:
        raise Fail(f"{path.name}: no usage frame")
    for key, slot in calls.items():
        slot["blockIndex"] = opened.index(f"tool:{key}")
    return {
        "reasoning": "".join(reasoning),
        "detailText": "".join(detail_text),
        "content": "".join(content),
        "toolCalls": [calls[k] for k in sorted(calls)],
        "usage": usage,
        "frames": frames,
    }


# ---------------------------------------------------------------- wire rebuild (plan.ts semantics)


def text_parts(text: str) -> list:
    return [{"type": "text", "text": text}]


def first_request(scenario: dict) -> dict:
    system = {"role": "system", "content": text_parts(scenario["firstTurn"]["systemText"])}
    cache = scenario.get("cache") or {}
    if cache.get("mode") == "explicit":
        if cache.get("breakpoints") != ["system"]:
            raise Fail("only the system breakpoint layout is rebuilt")
        system["content"][-1]["cache_control"] = {"type": "ephemeral", "ttl": cache["ttl"]}
    body = {
        "model": scenario["modelId"],
        "provider": {"order": [scenario["provider"]], "allow_fallbacks": False, "require_parameters": True},
        "stream": True,
        "store": False,
        "messages": [system, {"role": "user", "content": text_parts(scenario["firstTurn"]["userText"])}],
    }
    tool = scenario["tool"]
    body["tools"] = [
        {"type": "function", "function": {"name": tool["name"], "description": tool["description"], "parameters": tool["parameters"]}}
    ]
    # Route rules (official-models/qwen.ts): only 0902 carries reasoning effort (select high/max);
    # the other five drop it. max_tokens passes on all six.
    if scenario["modelId"] == "qwen/qwen3.8-max-0902" and scenario["reasoningEffort"] in ("high", "max"):
        body["reasoning"] = {"effort": scenario["reasoningEffort"]}
    body["max_tokens"] = scenario["maxOutputTokens"]
    return body


def wire_call_id(call: dict) -> str:
    """Tool-call id as replayed on the wire. The upstream id is not replayed: the stream reader
    derives `call_` + base64url(sha256(JSON [target callId, dispatch, block index]))[:32]
    (pi-ai-transport src/stream.ts generatedCallId; integers in its canonical `<digits>e<exp>`
    form). The certification driver's target is callId 'current-family', dispatch 1 on every
    round (family.mjs familyRequest). Ids are not rendered by the template; this only serves the
    wire hash check."""
    if not 0 <= call["blockIndex"] <= 9:
        raise Fail("only single-digit block indexes are rebuilt in canonical integer form")
    encoded = json.dumps(["current-family", "1e0", f"{call['blockIndex']}e0"], separators=(",", ":"))
    digest = base64.urlsafe_b64encode(hashlib.sha256(encoded.encode("utf-8")).digest()).decode().rstrip("=")
    return "call_" + digest[:32]


def assistant_row(output: dict) -> dict:
    row = {"role": "assistant", "content": output["content"]}
    if output["toolCalls"]:
        row["tool_calls"] = [
            {
                "id": wire_call_id(call),
                "type": "function",
                "function": {"name": call["name"], "arguments": wire_json(json.loads(call["arguments"]))},
            }
            for call in output["toolCalls"]
        ]
    if output["detailText"]:
        row["reasoning_details"] = [
            {"type": "reasoning.text", "text": output["detailText"], "format": "unknown", "index": 0}
        ]
    return row


def next_request(previous: dict, output: dict, scenario: dict, turn: dict) -> dict:
    body = copy.deepcopy(previous)
    messages = body["messages"]
    messages.append(assistant_row(output))
    for call in output["toolCalls"]:
        messages.append({"role": "tool", "tool_call_id": wire_call_id(call), "content": scenario["toolResultText"]})
    messages.append({"role": "user", "content": text_parts(turn["userText"])})
    return body


# ---------------------------------------------------------------- template + tokenizer


def hf_tojson(value, ensure_ascii=False, indent=None, separators=None, sort_keys=False):
    # transformers' chat-template tojson override (the canonical runtime for chat_template.jinja).
    return json.dumps(value, ensure_ascii=ensure_ascii, indent=indent, separators=separators, sort_keys=sort_keys)


def make_template(source: str, tojson_mode: str):
    env = ImmutableSandboxedEnvironment(trim_blocks=True, lstrip_blocks=True, extensions=[loopcontrols])

    def raise_exception(message):
        raise jinja2.exceptions.TemplateError(message)

    env.globals["raise_exception"] = raise_exception
    if tojson_mode == "hf":
        env.filters["tojson"] = hf_tojson
    elif tojson_mode != "jinja":
        raise Fail("tojson mode must be hf or jinja")
    return env.from_string(source)


def template_messages(body: dict) -> list:
    """Wire → template view. Two stated assumptions, nothing else changes:
    - the assistant's reasoning_details text reaches the template's `reasoning_content` slot;
    - JSON-string tool arguments are parsed to a mapping before rendering (vLLM does this; the
      template iterates `arguments|items`)."""
    result = []
    for message in body["messages"]:
        view = {k: v for k, v in message.items() if k != "reasoning_details"}
        if message["role"] == "assistant":
            details = message.get("reasoning_details") or []
            if details:
                view["reasoning_content"] = "".join(d["text"] for d in details)
            if "tool_calls" in message:
                view["tool_calls"] = [
                    {**call, "function": {**call["function"], "arguments": json.loads(call["function"]["arguments"])}}
                    for call in message["tool_calls"]
                ]
        result.append(view)
    return result


def render(template, body: dict, preserve_thinking, reasoning_effort) -> str:
    variables = {"messages": template_messages(body), "tools": body.get("tools"), "add_generation_prompt": True}
    if preserve_thinking is not None:
        variables["preserve_thinking"] = preserve_thinking
    if reasoning_effort is not None:
        variables["reasoning_effort"] = reasoning_effort
    return template.render(**variables)


# ---------------------------------------------------------------- main


def load_leaf(private_dir: Path, scenario_dir: Path, leaf: str) -> dict:
    directory = private_dir / f"qwenc-{leaf}"
    manifest = json.loads((directory / "manifest.json").read_text())
    summary = json.loads((directory / "summary.json").read_text())
    if manifest["modelId"] != f"qwen/{leaf}":
        raise Fail(f"{leaf}: manifest model mismatch")
    matches = [p for p in sorted(scenario_dir.glob(f"{leaf}-three-turn*.json")) if sha256_file(p) == manifest["scenarioSha256"]]
    if len(matches) != 1:
        raise Fail(f"{leaf}: no unique scenario file with manifest scenarioSha256")
    scenario = json.loads(matches[0].read_text())
    rounds = sorted(summary["completed"], key=lambda r: r["round"])
    if [r["round"] for r in rounds] != [1, 2, 3] or summary.get("stoppedByDeclaredRefusal") is not None:
        raise Fail(f"{leaf}: expected three completed rounds")
    outputs = []
    for record in rounds:
        sse = directory / record["rawResponse"]["file"]
        if sha256_file(sse) != record["rawResponse"]["sha256"]:
            raise Fail(f"{leaf}: raw SSE hash differs from summary")
        output = parse_sse(sse)
        u = record["usage"]
        if output["usage"]["prompt_tokens"] != u["input_tokens"] + u["cache_read_tokens"] + u["cache_write_tokens"]:
            raise Fail(f"{leaf}: SSE prompt_tokens != summary input+cache_read+cache_write")
        outputs.append(output)
    return {"manifest": manifest, "scenario": scenario, "scenarioFile": matches[0].name, "rounds": rounds, "outputs": outputs}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--private-dir", required=True, type=Path)
    parser.add_argument("--scenario-dir", required=True, type=Path)
    parser.add_argument("--tokenizer-dir", required=True, type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--dump-prompts", type=Path, help="optional directory for rendered prompts (not for the repo)")
    args = parser.parse_args()

    template_path = args.tokenizer_dir / "chat_template.jinja"
    tokenizer_path = args.tokenizer_dir / "tokenizer.json"
    for path, name in ((template_path, "chat_template.jinja"), (tokenizer_path, "tokenizer.json")):
        if sha256_file(path) != PINNED[name]:
            raise Fail(f"{name} differs from the pinned hash")
    source = template_path.read_text()
    templates = {mode: make_template(source, mode) for mode in TOJSON_MODES}
    tokenizer = tokenizers.Tokenizer.from_file(str(tokenizer_path))

    def count(text: str) -> int:
        return len(tokenizer.encode(text, add_special_tokens=False).ids)

    rows, wire_checks, frame_checks, controls = [], [], [], []
    leaf_data = {}
    for leaf, setting in LEAVES.items():
        data = load_leaf(args.private_dir, args.scenario_dir, leaf)
        leaf_data[leaf] = data
        scenario, outputs = data["scenario"], data["outputs"]
        bodies = [first_request(scenario)]
        for index in range(2):
            bodies.append(next_request(bodies[-1], outputs[index], scenario, scenario["turns"][index]))
        for index, (body, record, output) in enumerate(zip(bodies, data["rounds"], outputs)):
            round_no = index + 1
            wire_sha = sha256_bytes(wire_json(body).encode("utf-8"))
            assistants = [m for m in body["messages"] if m["role"] == "assistant"]
            replay_sha = sha256_bytes(wire_json(assistants).encode("utf-8")) if assistants else None
            wire_checks.append(
                {
                    "leaf": leaf,
                    "round": round_no,
                    "plannedWireSha256Match": wire_sha == record["plannedWireSha256"],
                    "firstWireSha256Match": (wire_sha == data["manifest"]["firstWireSha256"]) if round_no == 1 else None,
                    "assistantReplaySha256Match": (replay_sha == record["assistantReplaySha256"]) if assistants else None,
                    "assistantRowsCarry": sorted({k for a in assistants for k in a if k in ("reasoning", "reasoning_details", "reasoning_content")}),
                    "outcome": record["outcome"],
                    "servingProvider": record["servingProvider"],
                }
            )
            frame_checks.append(
                {
                    "leaf": leaf,
                    "round": round_no,
                    "detailFrames": output["frames"]["detailFrames"],
                    "detailShapeViolations": len(output["frames"]["detailShapeViolations"]),
                    "reasoningMismatchFrames": output["frames"]["reasoningMismatchFrames"],
                    "reasoningEqualsDetailText": output["reasoning"] == output["detailText"],
                }
            )
            upstream = output["usage"]["prompt_tokens"]
            row = {
                "leaf": leaf,
                "round": round_no,
                "upstreamPromptTokens": upstream,
                "upstreamReasoningTokens": output["usage"]["completion_tokens_details"]["reasoning_tokens"],
                "reasoningTextTokensTrimmed": count(output["detailText"].strip()),
                "surrogatePredicted": int(record["plannedMeasurement"]["predictedInput"]),
            }
            prompts = {}
            for mode in TOJSON_MODES:
                prompt = render(templates[mode], body, setting["preserve_thinking"], setting["reasoning_effort"])
                prompts[mode] = prompt
                if args.dump_prompts:
                    args.dump_prompts.mkdir(parents=True, exist_ok=True)
                    (args.dump_prompts / f"{leaf}-r{round_no}-{mode}.txt").write_text(prompt)
                row[f"predicted_{mode}"] = count(prompt)
                row[f"residual_{mode}"] = row[f"predicted_{mode}"] - upstream
                row[f"promptSha256_{mode}"] = sha256_bytes(prompt.encode("utf-8"))
            rows.append(row)
            # Negative control: the other family's switches must not fit.
            swapped = (None, None) if setting["family"] == "3.7" else (False, "medium")
            differing = [
                (a, b) for a, b in zip(prompts["jinja"].split("\n"), prompts["hf"].split("\n")) if a != b
            ]
            controls.append(
                {
                    "leaf": leaf,
                    "round": round_no,
                    **{
                        f"residualSwappedBranch_{mode}": count(render(templates[mode], body, *swapped)) - upstream
                        for mode in TOJSON_MODES
                    },
                    "tojsonVariantsDifferOnlyInToolLine": len(prompts["jinja"].split("\n")) == len(prompts["hf"].split("\n"))
                    and len(differing) == 1
                    and all(line.startswith('{"') for line in differing[0]),
                }
            )

    by_key = {(r["leaf"], r["round"]): r for r in rows}
    for row in rows:
        prev = by_key.get((row["leaf"], row["round"] - 1))
        row["incrementUpstream"] = row["upstreamPromptTokens"] - prev["upstreamPromptTokens"] if prev else None
        for mode in TOJSON_MODES:
            row[f"incrementResidual_{mode}"] = (
                (row[f"predicted_{mode}"] - prev[f"predicted_{mode}"]) - row["incrementUpstream"] if prev else None
            )

    # Page claim: 3.8 increment = 3.7 increment + previous round's reasoning tokens + 5.
    inc37 = {}
    for r in (2, 3):
        values = {by_key[(leaf, r)]["incrementUpstream"] for leaf in LEAVES if LEAVES[leaf]["family"] == "3.7"}
        inc37[r] = sorted(values)
    increment_identity = []
    for leaf in LEAVES:
        if LEAVES[leaf]["family"] != "3.8":
            continue
        for r in (2, 3):
            if len(inc37[r]) != 1:
                increment_identity.append({"leaf": leaf, "round": r, "defined": False})
                continue
            prev = by_key[(leaf, r - 1)]
            inc = by_key[(leaf, r)]["incrementUpstream"]
            increment_identity.append(
                {
                    "leaf": leaf,
                    "round": r,
                    "increment38": inc,
                    "increment37": inc37[r][0],
                    "prevReasoningTokensUsage": prev["upstreamReasoningTokens"],
                    "prevReasoningTextTokensTrimmed": prev["reasoningTextTokensTrimmed"],
                    "remainderUsingUsage": inc - inc37[r][0] - prev["upstreamReasoningTokens"],
                    "remainderUsingTokenizer": inc - inc37[r][0] - prev["reasoningTextTokensTrimmed"],
                }
            )

    page_compare = []
    for row in rows:
        page = PAGE_TABLE[row["leaf"]]
        i = row["round"] - 1
        page_compare.append(
            {
                "leaf": row["leaf"],
                "round": row["round"],
                "upstreamMatchesPage": row["upstreamPromptTokens"] == page["upstream"][i],
                "surrogateMatchesPage": row["surrogatePredicted"] == page["surrogate"][i],
                **{f"predicted_{mode}MatchesPage": row[f"predicted_{mode}"] == page["template"][i] for mode in TOJSON_MODES},
            }
        )

    def mode_summary(mode: str) -> dict:
        residuals = [r[f"residual_{mode}"] for r in rows]
        increments = [r[f"incrementResidual_{mode}"] for r in rows if r[f"incrementResidual_{mode}"] is not None]
        return {
            "residualValues": sorted(set(residuals)),
            "allResidualsPlusOne": all(r == 1 for r in residuals),
            "allResidualsZero": all(r == 0 for r in residuals),
            "incrementResidualCount": len(increments),
            "allIncrementResidualsZero": all(r == 0 for r in increments),
            "predictionsMatchPageTemplateColumn": all(c[f"predicted_{mode}MatchesPage"] for c in page_compare),
            "swappedBranchResidualRange": [
                min(c[f"residualSwappedBranch_{mode}"] for c in controls),
                max(c[f"residualSwappedBranch_{mode}"] for c in controls),
            ],
        }

    surrogate_residuals = [r["surrogatePredicted"] - r["upstreamPromptTokens"] for r in rows]
    result = {
        "tool": {
            "script": "recompute.py",
            "python": sys.version.split()[0],
            "jinja2": jinja2.__version__,
            "tokenizers": tokenizers.__version__,
            "chatTemplateSha256": PINNED["chat_template.jinja"],
            "tokenizerSha256": PINNED["tokenizer.json"],
        },
        "inputs": {
            leaf: {
                "scenarioFile": d["scenarioFile"],
                "scenarioSha256": d["manifest"]["scenarioSha256"],
                "sourceCommit": d["manifest"]["sourceCommit"],
                "rawResponseSha256": [r["rawResponse"]["sha256"] for r in d["rounds"]],
            }
            for leaf, d in leaf_data.items()
        },
        "rows": rows,
        "summary": {
            "requests": len(rows),
            "byTojson": {mode: mode_summary(mode) for mode in TOJSON_MODES},
            "tojsonVariantsDifferOnlyInToolLine": all(c["tojsonVariantsDifferOnlyInToolLine"] for c in controls),
            "upstreamMatchesPage": all(c["upstreamMatchesPage"] for c in page_compare),
            "surrogateMatchesPage": all(c["surrogateMatchesPage"] for c in page_compare),
            "surrogateResidualRange": [min(surrogate_residuals), max(surrogate_residuals)],
            "increment37ByRound": {str(k): v for k, v in inc37.items()},
            "incrementIdentityRemaindersUsingUsage": sorted({x.get("remainderUsingUsage") for x in increment_identity}),
            "incrementIdentityRemaindersUsingTokenizer": sorted({x.get("remainderUsingTokenizer") for x in increment_identity}),
            "reasoningTokensEqualTokenizerCountOfTrimmedText": all(
                r["upstreamReasoningTokens"] == r["reasoningTextTokensTrimmed"] for r in rows
            ),
            "wireAllMatch": all(
                c["plannedWireSha256Match"] and c["firstWireSha256Match"] is not False and c["assistantReplaySha256Match"] is not False
                for c in wire_checks
            ),
            "allRoundsCompleteFromAlibaba": all(
                c["outcome"] == "complete" and c["servingProvider"] == "Alibaba" for c in wire_checks
            ),
            "replayedAssistantRowsCarryOnlyReasoningDetails": all(
                c["assistantRowsCarry"] in ([], ["reasoning_details"]) for c in wire_checks
            ),
            "detailFramesAllFourKeyShape": all(c["detailShapeViolations"] == 0 and c["reasoningMismatchFrames"] == 0 and c["reasoningEqualsDetailText"] for c in frame_checks),
        },
        "incrementIdentity": increment_identity,
        "pageComparison": page_compare,
        "wireChecks": wire_checks,
        "sseFrameChecks": frame_checks,
        "controls": controls,
    }
    text = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.out:
        args.out.write_text(text)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Fail as error:
        print(f"recompute failed: {error}", file=sys.stderr)
        sys.exit(2)
