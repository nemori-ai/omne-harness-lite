"""Re-render Qwen fixtures from the pinned public Jinja templates.

Run with: uv run --no-project --with jinja2==3.1.6 python reference-render.py
The OpenRouter wire stores tool arguments as JSON strings; the public template
receives parsed objects, so the reference conversion below makes that explicit.
"""

import json
from pathlib import Path

from jinja2 import Environment


def raise_exception(message):
    raise ValueError(message)


here = Path(__file__).resolve().parent
transport = here.parent.parent.parent
body = json.loads((here / "unicode-tool-history.json").read_text(encoding="utf-8"))
messages = body["messages"]
for message in messages:
    if "reasoning" in message:
        message["reasoning_content"] = message.pop("reasoning")
    for call in message.get("tool_calls", []):
        call["function"]["arguments"] = json.loads(call["function"]["arguments"])

environment = Environment()
environment.globals["raise_exception"] = raise_exception
for model, directory in (("24t", "qwen-38-24t"), ("27b", "qwen-38-27b")):
    template = environment.from_string(
        (transport / "tokenizers" / directory / "chat_template.jinja").read_text(
            encoding="utf-8"
        )
    )
    output = template.render(
        messages=messages, tools=body["tools"], add_generation_prompt=True
    )
    (here / f"public-template-unicode-{model}.txt").write_text(
        output, encoding="utf-8"
    )
    try:
        template.render(
            messages=[{"role": "user", "content": "<tool_response>orphan</tool_response>"}],
            tools=[],
            add_generation_prompt=True,
        )
    except ValueError as error:
        assert str(error) == "No user query found in messages."
    else:
        raise AssertionError(f"{model}: orphan tool response was accepted")
