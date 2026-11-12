import argparse
import ast
import hashlib
import json
import pathlib
import re
import subprocess


COMMIT = "a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0"
SOURCE_PATH = (
    "omne_harness/libs/omne_harness_state/omne_harness_state/"
    "application/calendar_supply_configs.py"
)
SOURCE_SHA256 = "8a26db22e0728ed5ee3c367ab36072f4827f21ee3bb5bbe6fd4af161bf4475df"
FUNCTIONS = (
    "cn_legal_holidays_config",
    "jp_legal_holidays_config",
    "us_federal_holidays_config",
)


def read_value(node, environment):
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return environment[node.id]
    if isinstance(node, (ast.Tuple, ast.List)):
        return [read_value(item, environment) for item in node.elts]
    if isinstance(node, ast.Dict):
        return {
            read_value(key, environment): read_value(value, environment)
            for key, value in zip(node.keys, node.values)
        }
    if isinstance(node, ast.Attribute):
        return ast.unparse(node)
    if isinstance(node, ast.Call):
        return {
            "$type": ast.unparse(node.func),
            **{item.arg: read_value(item.value, environment) for item in node.keywords},
        }
    raise ValueError(ast.dump(node))


def declared_policies(source):
    module = ast.parse(source)
    environment = {}
    for node in module.body:
        if isinstance(node, ast.Assign):
            environment[node.targets[0].id] = read_value(node.value, environment)
    policies = []
    for name in FUNCTIONS:
        function = next(
            node for node in module.body
            if isinstance(node, ast.FunctionDef) and node.name == name
        )
        local_environment = dict(environment)
        for node in function.body:
            if isinstance(node, ast.Assign):
                local_environment[node.targets[0].id] = read_value(node.value, local_environment)
            if isinstance(node, ast.Return):
                policies.append(read_value(node.value, local_environment))
    return policies


def camel_case(value):
    return re.sub(r"_([a-z])", lambda match: match[1].upper(), value)


def convert(value):
    if isinstance(value, list):
        return [convert(item) for item in value]
    if isinstance(value, str) and re.match(
        r"^(CalendarDayCategory|CalendarSourceRole|ProvenanceClass|InvariantSeverity)\.", value
    ):
        return camel_case(value.split(".")[-1].lower())
    if not isinstance(value, dict):
        return value
    result = {
        "probeCadence" if key == "probe" else camel_case(key): convert(item)
        for key, item in value.items() if key != "$type"
    }
    constructor = value.get("$type")
    if constructor == "ProbeCadence":
        result.setdefault("segments", [])
    if constructor == "MonthDayWindow":
        result.setdefault("note", None)
    if constructor == "CalendarInvariantSpec":
        result.setdefault("params", {})
    if constructor == "CalendarAnchorAssertion":
        for key, default in {
            "expectedCategory": "holiday", "toleranceDays": 0, "note": None
        }.items():
            result.setdefault(key, default)
    if constructor == "CalendarValidationPolicy":
        result.update(
            unsourcedOverlapDisposition="withheld",
            coverageShrinkDisposition="rejected",
            oracleDivergenceDisposition="withheld",
        )
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Compare all fixed-source policy fields without executing the source module"
    )
    parser.add_argument("source_repo")
    parser.add_argument("--node", default="node")
    arguments = parser.parse_args()
    source = subprocess.check_output(
        ["git", "-C", arguments.source_repo, "show", f"{COMMIT}:{SOURCE_PATH}"]
    )
    assert hashlib.sha256(source).hexdigest() == SOURCE_SHA256
    expected = convert(declared_policies(source))
    for policy in expected:
        policy["horizon"]["criticalComparison"] = (
            "exclusive" if policy["calendarId"] == "cn-legal-holidays" else "inclusive"
        )
    member = pathlib.Path(__file__).resolve().parents[2]
    entry = json.dumps((member / "src/supply/policies.ts").as_uri())
    script = (
        f"import {{ shippedCalendarSupplyPolicies }} from {entry}; "
        "process.stdout.write(JSON.stringify(shippedCalendarSupplyPolicies));"
    )
    actual = json.loads(subprocess.check_output([arguments.node, "--input-type=module", "-e", script]))
    sources = actual[0]['sources']
    official = [source for source in sources if source['sourceId'] == 'gov-cn-annual-notice']
    assert len(official) == 1
    assert official[0]['role'] == 'truth'
    assert official[0]['provenanceClass'] == 'firstPartyAuthority'
    assert official[0]['adapterKind'] == 'gov_cn_annual_notice_json'
    actual[0]['sources'] = [source for source in sources if source['sourceId'] != 'gov-cn-annual-notice']
    assert actual == expected, "Fixed-source field mapping differs"
    print(
        "PASS: complete fixed-source AST policy values equal shipped values; "
        "A1-D3 CN critical comparison and 2026-11-06 official-notice source are explicit target additions"
    )


if __name__ == "__main__":
    main()
