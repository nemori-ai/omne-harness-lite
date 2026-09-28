"""Regenerate pinned Moonshot template/token IDs, without model/API access.

Run with Python 3.12, tiktoken==0.7.0 and Jinja2==3.1.6. The two copied
template files are byte-identical to the source commits in provenance.json.
"""

import base64
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import jinja2
import tiktoken
from jinja2.filters import htmlsafe_json_dumps


HERE = Path(__file__).resolve().parent
TOKENIZER = HERE.parents[2] / "tokenizers" / "moonshot"
assert hashlib.sha256((HERE / "encoding_k3.py").read_bytes()).hexdigest() == (
    "49ff03305fdc4be26867972788d36150b67f8a9e852e62bb7959d87482223676"
)
assert hashlib.sha256((HERE / "chat_template.jinja").read_bytes()).hexdigest() == (
    "8d21200dff7e85beaf51c8b110952e039ffd0779f615d64d63293d74773360f9"
)

# Exact public tokenization_kimi.py pattern at K2.7 Code 74797c9. K3's
# fixed tokenizer_config uses the same tiktoken.model bytes.
PATTERN = "|".join(
    [
        r"[\p{Han}]+",
        r"[^\r\n\p{L}\p{N}]?[\p{Lu}\p{Lt}\p{Lm}\p{Lo}\p{M}&&[^\p{Han}]]*[\p{Ll}\p{Lm}\p{Lo}\p{M}&&[^\p{Han}]]+(?i:'s|'t|'re|'ve|'m|'ll|'d)?",
        r"[^\r\n\p{L}\p{N}]?[\p{Lu}\p{Lt}\p{Lm}\p{Lo}\p{M}&&[^\p{Han}]]+[\p{Ll}\p{Lm}\p{Lo}\p{M}&&[^\p{Han}]]*(?i:'s|'t|'re|'ve|'m|'ll|'d)?",
        r"\p{N}{1,3}",
        r" ?[^\s\p{L}\p{N}]+[\r\n]*",
        r"\s*[\r\n]+",
        r"\s+(?!\S)",
        r"\s+",
    ]
)


def encoder(route):
    ranks = {
        base64.b64decode(parts[0]): int(parts[1])
        for line in (TOKENIZER / "tiktoken.model").read_text().splitlines()
        if (parts := line.split())
    }
    config = json.loads((TOKENIZER / f"{route}-tokenizer_config.json").read_text())
    special = {
        item["content"]: int(identifier)
        for identifier, item in config["added_tokens_decoder"].items()
    }
    return tiktoken.Encoding(
        name=route, pat_str=PATTERN, mergeable_ranks=ranks, special_tokens=special
    )


def result(ids):
    return {
        "tokens": len(ids),
        "idsSha256": hashlib.sha256(
            json.dumps(ids, separators=(",", ":")).encode()
        ).hexdigest(),
    }


fixture = json.loads((HERE / "multi-turn.json").read_text())
k3_source = HERE / "encoding_k3.py"
spec = importlib.util.spec_from_file_location("encoding_k3", k3_source)
module = importlib.util.module_from_spec(spec)
sys.modules["encoding_k3"] = module
spec.loader.exec_module(module)
k3_segments = module.build_chat_segments(
    fixture["messages"], fixture["tools"], thinking_effort="high"
)
k3 = encoder("k3")
k3_ids = []
for segment in k3_segments:
    k3_ids += k3.encode(
        segment.text,
        allowed_special={segment.text} if segment.allow_special else set(),
        disallowed_special=(),
    )
k3_split_segments = module.build_chat_segments(
    [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Hello "},
                {"type": "text", "text": "world"},
            ],
        }
    ]
)
k3_split_ids = []
for segment in k3_split_segments:
    k3_split_ids += k3.encode(
        segment.text,
        allowed_special={segment.text} if segment.allow_special else set(),
        disallowed_special=(),
    )

k27_environment = jinja2.Environment()
# Transformers' chat-template environment passes JSON kwargs through tojson;
# standalone Jinja's filter has a narrower signature.
k27_environment.filters["tojson"] = lambda value, **kwargs: htmlsafe_json_dumps(
    value, dumps=json.dumps, ensure_ascii=False, sort_keys=True, **kwargs
)
k27_template = k27_environment.from_string((HERE / "chat_template.jinja").read_text())
k27_prompt = k27_template.render(
    messages=fixture["messages"],
    tools=fixture["tools"],
    tools_ts_str=None,
    add_generation_prompt=True,
)
k27_ids = encoder("k27").encode(
    k27_prompt, allowed_special="all", disallowed_special=()
)
parallel = json.loads((HERE / "parallel-results.json").read_text())
parallel_k3_segments = module.build_chat_segments(
    parallel["messages"], parallel["tools"], thinking_effort="high"
)
parallel_k3_ids = []
for segment in parallel_k3_segments:
    parallel_k3_ids += k3.encode(
        segment.text,
        allowed_special={segment.text} if segment.allow_special else set(),
        disallowed_special=(),
    )
parallel_k27_prompt = k27_template.render(
    messages=parallel["messages"],
    tools=parallel["tools"],
    tools_ts_str=None,
    add_generation_prompt=True,
)
parallel_k27_ids = encoder("k27").encode(
    parallel_k27_prompt, allowed_special="all", disallowed_special=()
)
actual = {
    "k3": result(k3_ids),
    "k27": result(k27_ids),
    "k3Split": result(k3_split_ids),
    "parallelK3": result(parallel_k3_ids),
    "parallelK27": result(parallel_k27_ids),
}
expected = json.loads((HERE / "reference-goldens.json").read_text())
print(json.dumps(actual, indent=2))
assert actual == expected, (actual, expected)
