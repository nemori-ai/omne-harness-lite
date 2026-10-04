"""Check candidate messages/v4 shape examples; no production validator claims."""
from pathlib import Path
from decimal import Decimal
from urllib.parse import urldefrag, urljoin
from importlib.metadata import version
import hashlib
import json
import re

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

WORKTREE = Path(__file__).resolve().parents[3]
ROOT = WORKTREE / ".meta_harness/design"
PACKAGE = ROOT / "spec/data/messages/v4"
EVIDENCE = Path(__file__).resolve().parent
registry = Registry()
schemas = {}
for path in ROOT.rglob("*.schema.json"):
    value = json.loads(path.read_text(), parse_float=Decimal)
    if "$id" in value:
        schemas[value["$id"]] = (path, value)
        registry = registry.with_resource(value["$id"], Resource.from_contents(value))
schema = json.loads((PACKAGE / "messages.schema.json").read_text())
Draft202012Validator.check_schema(schema)


def json_equal(left, right):
    numbers = (int, Decimal)
    if isinstance(left, numbers) and not isinstance(left, bool):
        return isinstance(right, numbers) and not isinstance(right, bool) and left == right
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(json_equal(left[k], right[k]) for k in left)
    if isinstance(left, list):
        return len(left) == len(right) and all(json_equal(a, b) for a, b in zip(left, right))
    return left == right


def valid(value, definition):
    return Draft202012Validator(
        {"$ref": schema["$id"] + "#/$defs/" + definition}, registry=registry
    ).is_valid(value)


text = (PACKAGE / "examples.md").read_text()
current = None
section = ""
skip = False
counts = {"table_schema": 0, "v4_cross_field": 0, "scenario_messages": 0, "core_regressions": 0}
for line in text.splitlines():
    if line.startswith("## "):
        section = line
        skip = line.startswith("## 13.")
    if line.startswith("### 10.2"):
        skip = True
    if "校验对象" in line:
        match = re.search(r"\$defs/([A-Za-z]+)", line)
        if match:
            current = match.group(1)
    if line.startswith("| `") and not skip:
        match = re.match(r"\| `([^`]+)` \| (通过|拒绝) \|", line)
        if match:
            value = json.loads(match.group(1), parse_float=Decimal)
            actual = valid(value, current)
            assert actual == (match.group(2) == "通过"), (section, current, line)
            counts["table_schema"] += 1
            if section.startswith("## 15.") and actual:
                equal = json_equal(value["adaptation"], value["profileSnapshot"]["adaptation"])
                equal = equal and value["adaptation"]["definition"]["modelId"] == value["profile"]["routeName"]
                assert equal == ("| `malformed` |" not in line), line
                counts["v4_cross_field"] += 1
    if section.startswith("## 11."):
        match = re.match(r"\| m[1-5] \| `([^`]+)` \|", line)
        if match:
            assert valid(json.loads(match.group(1), parse_float=Decimal), "Message")
            counts["scenario_messages"] += 1

inherited = text.split("## v3 窄修订的规范对照", 1)[1].split("## 15.", 1)[0]
for heading, expected in [("坏名调用留在回复", True), ("正常参数坏名仍拒", False)]:
    part = inherited.split("### " + heading, 1)[1].split("### ", 1)[0]
    raw = re.search(r"```json\n(.*?)\n```", part, re.S).group(1)
    assert valid(json.loads(raw, parse_float=Decimal), "AssistantMessage") == expected
    counts["core_regressions"] += 1
assert counts == {"table_schema": 152, "v4_cross_field": 11, "scenario_messages": 5, "core_regressions": 2}, counts

source = json.loads((PACKAGE.parent / "v3/messages.schema.json").read_text())
def structural(value):
    if isinstance(value, dict):
        return {key: structural(child) for key, child in value.items() if key not in {"title", "description", "$comment", "examples"}}
    if isinstance(value, list):
        return [structural(child) for child in value]
    return value
changed = [name for name, value in source["$defs"].items() if structural(schema["$defs"][name]) != structural(value)]
assert changed == ["ModelCallDispatchedRecord", "ModelSelectionChangedRecord"], changed
peer = json.loads((ROOT / "spec/data/model-response/v4/model-response.schema.json").read_text())
for name in ["SelectedBy", "CredentialScope", "ParameterAdjustment"]:
    assert structural(schema["$defs"][name]) == structural(peer["$defs"][name]), name
assert structural(schema["$defs"]["ModelCallDispatchedRecord"]["properties"]["droppedParameters"]) == structural(peer["$defs"]["Route"]["properties"]["droppedParameters"])
assert (PACKAGE / "formal/Readable.als").read_bytes() == (PACKAGE.parent / "v3/formal/Readable.als").read_bytes()

# Record only the actually relevant transitive schema closure, plus normative inputs.
visited = set()
def visit(uri):
    document_uri, _ = urldefrag(uri)
    if document_uri in visited:
        return
    visited.add(document_uri)
    _, value = schemas[document_uri]
    def walk(node):
        if isinstance(node, dict):
            if "$ref" in node:
                visit(urljoin(document_uri, node["$ref"]))
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)
    walk(value)
visit(schema["$id"])
paths = {schemas[uri][0] for uri in visited}
paths.update(path for path in PACKAGE.rglob("*") if path.is_file())
paths.update([Path(__file__).resolve(), PACKAGE.parent / "v3/messages.schema.json", PACKAGE.parent / "v3/formal/Readable.als"])
paths.add(ROOT / "spec/data/model-response/v4/model-response.schema.json")
hashes = {str(path.relative_to(WORKTREE)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(paths)}
(EVIDENCE / "input-hashes.json").write_text(json.dumps(hashes, ensure_ascii=False, indent=2) + "\n")
print("jsonschema", version("jsonschema"), "referencing", version("referencing"))
print(json.dumps(counts, ensure_ascii=False, sort_keys=True))
print("Schema outcomes: 159 matched; cross-field pure-value outcomes: 11 matched")
print("Inherited Message definitions unchanged; Readable.als byte-identical to v3")
print("Shared shape constraints aligned with model-response/v4 (annotations excluded)")
print("Schema closure resources:", len(visited), "; hashed inputs:", len(paths))
print("PASS candidate shape/value checks; production boundaries, durability, logs and Alloy NOT RUN")
