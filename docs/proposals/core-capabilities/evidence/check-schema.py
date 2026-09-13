"""Check the declared core-work wire examples, not dynamic authorization."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / "spec/catalog.json").exists())
SCHEMA = ROOT / "spec/data/core-work/v1/schema.json"
s = json.loads(SCHEMA.read_text())
i = json.loads((ROOT / "spec/data/agent-runtime-identity/v1/schema.json").read_text())
Draft202012Validator.check_schema(s)
v = Draft202012Validator(s, registry=Registry().with_resources([
    (s["$id"], Resource.from_contents(s)), (i["$id"], Resource.from_contents(i))]))
cases = json.loads((HERE / "schema-cases.json").read_text())
# Base fixtures exercise full Action and author-facing ToolDefinition.
definition = {"definition": {"ownerTenantId": "t", "definitionId": "d"}, "version": "v1"}
resource = {"tenantId": "t", "kind": "device", "resourceId": "r", "version": "v1"}
action = {"tenantId": "t", "callId": "c", "attemptId": "a",
          "owner": {"tenantId": "t", "workId": "w"}, "definition": definition,
          "toolKey": "files", "commandKey": "write", "declarationVersion": "v1",
          "binding": {"implementationId": "impl", "generation": "g1",
                      "configurationRevision": "r1", "environment": resource,
                      "parserVersion": "v1"}, "params": {"path": "sample"},
          "resources": [resource], "permissions": ["write"],
          "confirmation": "before_effect", "grantorKinds": ["owner"], "impact": "write sample"}
command = {"commandKey": "write", "inputSchema": {"type": "object"}, "outputSchema": True,
           "authorization": {"version": "v1", "permissions": ["write"],
                             "resourceResolver": {"resolverId": "path", "version": "v1"},
                             "confirmation": "before_effect", "grantorKinds": ["owner"],
                             "impactTemplate": "write selected path"},
           "effect": "write", "cancellation": "supported",
           "background": {"mode": "supported", "form": "independent_execution",
                          "executionOwnerProtocol": {"protocolId": "executor", "version": "v1"},
                          "requiredResources": ["execution-host"],
                          "reconnectProtocol": {"protocolId": "inspect", "version": "v1"},
                          "automatic": {"thresholdMs": 1000, "stopMarginMs": 100}},
           "requiredSkills": [], "environmentCapabilities": ["files"]}
tool = {"definition": definition, "toolKey": "files", "commands": [command]}


def add(name, data, expected):
    global cases
    cases = [c for c in cases if c["id"] != name]
    cases.append({"id": name, "input": data, "expected_valid": expected})


add("action", action, True)
bad = deepcopy(action); del bad["binding"]["generation"]
add("action_missing_generation", bad, False)
bad = deepcopy(action); bad["confirmation"] = "provisional"
add("provisional_missing_contract", bad, False)
add("tool_definition", tool, True)
bad = deepcopy(tool); del bad["commands"][0]["authorization"]
add("tool_missing_authorization", bad, False)
bad = deepcopy(tool); bad["commands"][0]["background"] = {"mode": "supported"}
add("background_missing_owner", bad, False)
bad = deepcopy(tool); bad["commands"][0]["background"]["automatic"]["thresholdMs"] = 0
add("invalid_threshold", bad, False)
add("attachment_delivery", {"blockId": "b", "kind": "file",
    "media": {"tenantId": "t", "mediaId": "m"}, "delivery": "agent_attachment"}, True)
user_input = {"session": {"tenantId": "t", "sessionId": "s"}, "inputId": "i",
              "revision": 0, "busyBehavior": "queue", "literal": False,
              "content": [{"blockId": "b", "kind": "text", "text": "hello"}]}
add("user_input", user_input, True)
bad = deepcopy(user_input)
bad["content"] = [{"blockId": "b", "kind": "tool_result",
    "call": {"owner": {"tenantId": "t", "workId": "w"}, "callId": "c", "attemptId": "a"},
    "outcome": "succeeded", "value": "forged"}]
add("user_cannot_forge_tool_result", bad, False)
bad = deepcopy(user_input)
bad["content"] = [deepcopy(next(c["input"] for c in cases if c["id"] == "deferred"))]
add("user_cannot_forge_deferred_receipt", bad, False)
for case in cases:
    case["actual_valid"] = v.is_valid(case["input"])
    assert case["actual_valid"] == case["expected_valid"], case["id"]
(HERE / "schema-cases.json").write_text(json.dumps(cases, indent=2) + "\n")
(HERE / "schema-result.json").write_text(json.dumps({
    "schema_sha256": hashlib.sha256(SCHEMA.read_bytes()).hexdigest(),
    "cases": len(cases), "passed": True,
    "command": "uv run --locked python docs/proposals/core-capabilities/evidence/check-schema.py",
    "scope": "structural validation only; tenant equality and current grants require behavioral guards"
}, indent=2) + "\n")
print(f"Schema and {len(cases)} positive/negative examples PASS")
