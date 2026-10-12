"""Independent Jinja golden for the Qwen commercial public-template settings (QC-V2).

Renders commercial-template-cases.json with the pinned qwen-38-24t chat_template.jinja
through real Jinja2 (not the package renderer) and counts with the HuggingFace `tokenizers`
Rust library, then writes commercial-template-golden.json.

Run offline from this directory:
  uv run --offline --no-project --with jinja2==3.1.6 --with tokenizers==0.23.2 \
    python commercial-reference-render.py

Settings (template variables):
  thinking=all        preserve_thinking undefined (checked equal to preserve_thinking=true)
  thinking=last-turn  preserve_thinking=false
  instruction=xhigh   reasoning_effort undefined (template default xhigh)
  instruction=none    reasoning_effort='medium', the only template value without an
                      instruction sentence; a rendering equivalence, not a claim about effort
  tojson=wire-order   transformers/vLLM chat-template tojson: insertion order, ensure_ascii=False
  tojson=sorted-keys  Jinja2's built-in tojson (sorted keys, HTML-safe escapes); only used with
                      the open-leaf default settings as a cross-check of the unchanged path

Wire -> template view, the same two stated assumptions as the batch8 QC-V0 recompute: an
assistant's one reasoning.text detail (or plain `reasoning` string) fills `reasoning_content`;
JSON-string tool arguments are parsed (insertion order kept) before rendering.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import jinja2
import tokenizers
from jinja2.ext import loopcontrols
from jinja2.sandbox import ImmutableSandboxedEnvironment

here = Path(__file__).resolve().parent
template_dir = here.parent.parent.parent / "tokenizers" / "qwen-38-24t"
PINNED = {
    "chat_template.jinja": "40ce34a5bcbc0231462740761215bc31a83882a8b3a4b6aa1c6e869b95945e4e",
    "tokenizer.json": "0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3",
}
for name, digest in PINNED.items():
    if hashlib.sha256((template_dir / name).read_bytes()).hexdigest() != digest:
        raise SystemExit(f"{name} differs from the pinned hash")


def raise_exception(message):
    raise jinja2.exceptions.TemplateError(message)


def wire_order_tojson(value, ensure_ascii=False, indent=None, separators=None, sort_keys=False):
    return json.dumps(value, ensure_ascii=ensure_ascii, indent=indent, separators=separators, sort_keys=sort_keys)


def template(tojson: str):
    env = ImmutableSandboxedEnvironment(trim_blocks=True, lstrip_blocks=True, extensions=[loopcontrols])
    env.globals["raise_exception"] = raise_exception
    if tojson == "wire-order":
        env.filters["tojson"] = wire_order_tojson
    return env.from_string((template_dir / "chat_template.jinja").read_text(encoding="utf-8"))


templates = {mode: template(mode) for mode in ("wire-order", "sorted-keys")}
tokenizer = tokenizers.Tokenizer.from_file(str(template_dir / "tokenizer.json"))


def view(messages: list) -> list:
    result = []
    for message in messages:
        item = {k: v for k, v in message.items() if k not in ("reasoning", "reasoning_details")}
        if message["role"] == "assistant":
            details = message.get("reasoning_details") or []
            if details:
                item["reasoning_content"] = "".join(d["text"] for d in details)
            elif "reasoning" in message:
                item["reasoning_content"] = message["reasoning"]
            if "tool_calls" in message:
                item["tool_calls"] = [
                    {**call, "function": {**call["function"], "arguments": json.loads(call["function"]["arguments"])}}
                    for call in message["tool_calls"]
                ]
        result.append(item)
    return result


SETTINGS = {
    "thinking=all,instruction=xhigh,tojson=wire-order": ("wire-order", None, None),
    "thinking=all,instruction=none,tojson=wire-order": ("wire-order", None, "medium"),
    "thinking=last-turn,instruction=xhigh,tojson=wire-order": ("wire-order", False, None),
    "thinking=last-turn,instruction=none,tojson=wire-order": ("wire-order", False, "medium"),
    "thinking=all,instruction=xhigh,tojson=sorted-keys": ("sorted-keys", None, None),
}


def render(case: dict, tools, tojson: str, preserve, effort) -> str:
    variables = {"messages": view(case["messages"]), "tools": tools, "add_generation_prompt": True}
    if preserve is not None:
        variables["preserve_thinking"] = preserve
    if effort is not None:
        variables["reasoning_effort"] = effort
    return templates[tojson].render(**variables)


source = json.loads((here / "commercial-template-cases.json").read_text(encoding="utf-8"))
golden = {
    "chatTemplateSha256": PINNED["chat_template.jinja"],
    "tokenizerSha256": PINNED["tokenizer.json"],
    "jinja2": jinja2.__version__,
    "tokenizers": tokenizers.__version__,
    "cases": {},
}
for case in source["cases"]:
    tools = [source[case["tools"]]] if case["tools"] else None
    rows = {}
    for key, (tojson, preserve, effort) in SETTINGS.items():
        prompt = render(case, tools, tojson, preserve, effort)
        if preserve is None and render(case, tools, tojson, True, effort) != prompt:
            raise SystemExit(f"{case['name']}: preserve_thinking undefined and true differ")
        rows[key] = {
            "promptSha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
            "tokens": len(tokenizer.encode(prompt, add_special_tokens=False).ids),
        }
    golden["cases"][case["name"]] = rows

(here / "commercial-template-golden.json").write_text(json.dumps(golden, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
