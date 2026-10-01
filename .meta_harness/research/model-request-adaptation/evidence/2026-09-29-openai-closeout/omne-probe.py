"""Execute only named pure AST functions from the frozen local omne-next source."""
import ast
import json
from pathlib import Path
from typing import Any

source = Path(__file__).parent / "sources/omne-next/omne_openrouter/omne_openrouter/chat_models.py"
names = {"_merge_reasoning_run", "_merge_reasoning_details", "_strip_ephemeral_reasoning_ids"}
tree = ast.parse(source.read_text())
selected = ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[])
scope = {"Any": Any}
exec(compile(selected, str(source), "exec"), scope)
merge = scope["_merge_reasoning_details"]
strip = scope["_strip_ephemeral_reasoning_ids"]
opaque = [{"type": "reasoning.encrypted", "data": "cipher-A", "id": "rs_synthetic"},
          {"type": "reasoning.encrypted", "data": "cipher-B", "id": "rs_synthetic"}]
assert merge(opaque) == opaque
assert strip(opaque)[0] == {"type": "reasoning.encrypted", "data": "cipher-A"}
indexed = [dict(item, index=0) for item in opaque]
assert len(merge(indexed)) == 1
assert merge(indexed)[0]["data"] == "cipher-B"
print(json.dumps({"network": False, "credentials": False, "checks": [
    "unindexed encrypted objects preserve order/data",
    "rs_ IDs stripped (not verbatim complete replay)",
    "same-index encrypted objects merge last-data-wins (synthetic counterexample)"
], "passed": 3, "scope": "pure functions only; no claim that upstream emits synthetic duplicate-index pair"}, indent=2))
