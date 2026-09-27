"""Read-only local Schema checks for model-profile/v3; not implementation acceptance."""

from copy import deepcopy
from importlib.metadata import version
from pathlib import Path
import json
import re

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource


root = Path(__file__).resolve().parents[3] / ".meta_harness/design"
package = root / "spec/data/model-profile/v3"
schema = json.loads((package / "model-profile.schema.json").read_text())
resources = []
for path in (root / "spec").rglob("*.schema.json"):
    document = json.loads(path.read_text())
    if "$id" in document:
        resources.append((document["$id"], Resource.from_contents(document)))
registry = Registry().with_resources(resources)
Draft202012Validator.check_schema(schema)
validators = {
    name: Draft202012Validator(
        {"$ref": schema["$id"] + "#/$defs/" + name},
        registry=registry,
        format_checker=FormatChecker(),
    )
    for name in schema["$defs"]
}
count = 0


def check(name, value, expected):
    global count
    actual = validators[name].is_valid(value)
    assert actual == expected, (name, value, actual, expected)
    count += 1


examples = (package / "examples.md").read_text()
blocks = [json.loads(value) for value in re.findall(r"```json\n(.*?)\n```", examples, re.S)]
profiles = [
    value
    for value in blocks
    if isinstance(value, dict) and "routeName" in value and "providers" in value
]
for profile in profiles:
    check("ModelProfile" if "registration" in profile else "ModelProfileContent", profile, True)
binding = next(value for value in blocks if isinstance(value, dict) and "implementation" in value)
check("ModelAdaptationBinding", binding, True)
for key in ("implementation", "definition", "configuration"):
    value = deepcopy(binding)
    del value[key]
    check("ModelAdaptationBinding", value, False)
    value = deepcopy(binding)
    value[key]["unknown"] = True
    check("ModelAdaptationBinding", value, False)
    for field in binding[key]:
        value = deepcopy(binding)
        del value[key][field]
        check("ModelAdaptationBinding", value, False)
for invalid in [None, [], True, 1, "not-object"]:
    value = deepcopy(binding)
    value["configuration"]["values"] = invalid
    check("ModelAdaptationBinding", value, False)
value = deepcopy(binding)
value["configuration"]["values"] = {}
check("ModelAdaptationBinding", value, True)
whitespace = (
    list(range(9, 14))
    + [0x20, 0x85, 0xA0, 0x1680]
    + list(range(0x2000, 0x200B))
    + [0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF]
)
for path in [
    ("implementation", "name"),
    ("implementation", "revision"),
    ("definition", "modelId"),
    ("definition", "revision"),
    ("configuration", "revision"),
]:
    for invalid in ["", None, 1]:
        value = deepcopy(binding)
        value[path[0]][path[1]] = invalid
        check("ModelAdaptationBinding", value, False)
    for codepoint in whitespace:
        for invalid in [chr(codepoint) + "x", "x" + chr(codepoint)]:
            value = deepcopy(binding)
            value[path[0]][path[1]] = invalid
            check("ModelAdaptationBinding", value, False)
for field in ("tenant", "credential", "fiberUid"):
    value = deepcopy(binding)
    value[field] = "example"
    check("ModelAdaptationBinding", value, False)
for profile in profiles:
    kind = "ModelProfile" if "registration" in profile else "ModelProfileContent"
    value = deepcopy(profile)
    del value["adaptation"]
    check(kind, value, False)
    value = deepcopy(profile)
    value["adaptation"]["definition"]["modelId"] = "another/model"
    check(kind, value, True)  # Documents the cross-field limit of JSON Schema.
for name in ("ModelProfileContent", "ModelProfileSnapshot"):
    properties = schema["$defs"][name]["properties"]
    assert properties["adaptation"] == {"$ref": "#/$defs/ModelProfile/properties/adaptation"}
    assert "adaptation" in schema["$defs"][name]["required"]
for profile in profiles:
    if "registration" not in profile:
        continue
    snapshot = {
        key: deepcopy(profile[key])
        for key in schema["$defs"]["ModelProfileSnapshot"]["properties"]
        if key in profile
    }
    check("ModelProfileSnapshot", snapshot, True)
    del snapshot["adaptation"]
    check("ModelProfileSnapshot", snapshot, False)
snapshot_examples = examples.split("## 9. ModelProfileSnapshot")[1].split("## 10.")[0]
for line in snapshot_examples.splitlines():
    if line.startswith("| `{"):
        check("ModelProfileSnapshot", json.loads(line.split("`")[1]), "| 通过 |" in line)
clauses = {
    int(value)
    for value in re.findall(r"^### S-(\d+)\b", (package / "contract.md").read_text(), re.M)
}
assert clauses == set(range(1, 32)), clauses
assert not any("JsonObject" in str(value.get("$ref", "")) for value in schema["$defs"].values())
print(
    f"PASS: model-profile/v3 candidate schema and examples; checks={count}; "
    f"definitions={len(validators)}; clauses=31; jsonschema={version('jsonschema')}"
)
print(
    "SCOPE: Schema only. Cross-field refusal, secret exclusion, revision immutability "
    "and runtime freeze remain unexecuted implementation obligations."
)
