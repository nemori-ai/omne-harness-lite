from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import yaml

from projection import UniqueLoader

GENERATION_SCOPES = {"cli-project", "cli-plugin", "ide-project", "ide-plugin", "cloud-project"}
CLAIMS = {"role-behavior", "actual-model", "permissions", "lifecycle"}
FIELDS = {"version", "role", "binding", "host_versions", "status", "scope", "evidence", "missing", "adoption", "reason"}
DISPATCH_FIELDS = {"environment", "deployment", "version", "mode", "purpose"}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def subject_digest(record: dict) -> str:
    subject = {key: value for key, value in record.items() if key != "adoption"}
    return digest(json.dumps(subject, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode())


def strings(value, label: str, nonempty=False) -> list[str]:
    if (not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value)
            or len(value) != len(set(value)) or (nonempty and not value)):
        raise ValueError(f"cursor qualification: invalid {label}")
    return value


def dispatch_scopes(value, versions: dict, *, readonly: bool) -> list[dict]:
    if not isinstance(value, list):
        raise ValueError("cursor qualification: dispatch scopes must be a list")
    seen = set()
    non_cli_mode = "ask" if readonly else "agent"
    for item in value:
        if (not isinstance(item, dict) or set(item) != DISPATCH_FIELDS
                or any(not isinstance(field, str) or not field.strip() for field in item.values())):
            raise ValueError("cursor qualification: invalid dispatch scope shape")
        host = item["environment"]
        if (host not in versions or item["version"] not in versions[host]
                or item["deployment"] not in {"project", "plugin"}
                or item["mode"] not in {"interactive", "headless", "agent", "ask"}
                or item["purpose"] not in {"qualification-probe", "accepted-role-duty"}
                or (host != "cli" and item["mode"] != non_cli_mode)
                or (host == "cli" and item["mode"] not in {"interactive", "headless"})
                or (host == "cloud" and item["deployment"] != "project")):
            raise ValueError("cursor qualification: invalid or unversioned dispatch scope")
        key = json.dumps(item, sort_keys=True)
        if key in seen:
            raise ValueError("cursor qualification: duplicate dispatch scope")
        seen.add(key)
    return value


def native_readonly(native: bytes) -> bool:
    config = yaml.load(native.decode(), Loader=UniqueLoader)
    if not isinstance(config, dict) or type(config.get("readonly")) is not bool:
        raise ValueError("cursor qualification: native readonly must be a boolean")
    return config["readonly"]


def read_qualification(source: Path, native: bytes, prompt: str, *, require_binding: bool = True) -> dict:
    prefix = f"cursor qualification {source.name}"
    path = source / "cursor-qualification.yaml"
    if not path.is_file():
        raise ValueError(f"{prefix}: missing qualification record")
    record = yaml.load(path.read_text(encoding="utf-8"), Loader=UniqueLoader)
    if (not isinstance(record, dict) or set(record) != FIELDS
            or type(record["version"]) is not int or record["version"] != 1
            or record["role"] != source.name):
        raise ValueError(f"{prefix}: invalid schema or identity")
    if require_binding and record["binding"] != {"native_sha256": digest(native), "prompt_sha256": digest(prompt.encode())}:
        raise ValueError(f"{prefix}: source binding is stale")
    status = record["status"]
    if not isinstance(status, str) or status not in {"pending", "unsupported", "limited", "proved"}:
        raise ValueError(f"{prefix}: invalid status")
    if not isinstance(record["reason"], str) or not record["reason"].strip():
        raise ValueError(f"{prefix}: reason is required")
    versions = record["host_versions"]
    if not isinstance(versions, dict) or set(versions) != {"cli", "ide", "cloud"}:
        raise ValueError(f"{prefix}: explicit host versions are required")
    for host, values in versions.items():
        strings(values, f"{host} versions")
    scope = record["scope"]
    if not isinstance(scope, dict) or set(scope) != {"generation", "dispatch"}:
        raise ValueError(f"{prefix}: separate generation and dispatch scopes are required")
    if set(strings(scope["generation"], "generation scopes")) != GENERATION_SCOPES:
        raise ValueError(f"{prefix}: generation must cover the shared bundle's five deployment shapes")
    dispatch = dispatch_scopes(scope["dispatch"], versions, readonly=native_readonly(native))
    missing = strings(record["missing"], "missing guarantees")
    if not isinstance(record["evidence"], list):
        raise ValueError(f"{prefix}: evidence must be a list")
    root = source.parent.parent.resolve()
    for evidence in record["evidence"]:
        if (not isinstance(evidence, dict) or set(evidence) != {"reference", "sha256", "claims", "dispatch"}
                or not isinstance(evidence["reference"], str) or not evidence["reference"].strip()
                or not isinstance(evidence["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", evidence["sha256"])):
            raise ValueError(f"{prefix}: invalid evidence reference or digest")
        reference = Path(evidence["reference"])
        actual = (root / reference).resolve()
        if (reference.is_absolute() or not actual.is_relative_to(root) or not actual.is_file()
                or digest(actual.read_bytes()) != evidence["sha256"]):
            raise ValueError(f"{prefix}: evidence file is missing, outside source or stale")
        claims = strings(evidence["claims"], "evidence claims", nonempty=True)
        if not set(claims).issubset(CLAIMS | {"catalog", "structure"}):
            raise ValueError(f"{prefix}: unknown evidence claim")
        for evidenced in dispatch_scopes(evidence["dispatch"], versions, readonly=native_readonly(native)):
            if evidenced not in dispatch:
                raise ValueError(f"{prefix}: evidence scope is outside qualification scope")
    if status in {"pending", "unsupported"}:
        if record["adoption"] is not None:
            raise ValueError(f"{prefix}: {status} cannot carry adoption")
        if status == "unsupported":
            raise ValueError(f"{prefix}: unsupported: {record['reason']}")
        return record
    adoption = record["adoption"]
    if (not isinstance(adoption, dict) or set(adoption) != {"owner", "reference", "subject_sha256"}
            or adoption["owner"] != "PanQiWei" or not isinstance(adoption["reference"], str)
            or not re.fullmatch(r"https://github\.com/nemori-ai/omne-harness-lite/issues/[1-9][0-9]*#issuecomment-[1-9][0-9]*", adoption["reference"])
            or adoption["subject_sha256"] != subject_digest(record)):
        raise ValueError(f"{prefix}: exact named owner adoption is required")
    if status == "limited":
        if not missing or not dispatch or any(item["purpose"] != "qualification-probe" for item in dispatch):
            raise ValueError(f"{prefix}: limited roles require gaps and bounded qualification-probe scope")
    elif missing or not dispatch or any(item["purpose"] != "accepted-role-duty" for item in dispatch):
        raise ValueError(f"{prefix}: proved role requires empty gaps and accepted-role-duty dispatch")
    return record


def qualification_footer(record: dict) -> str:
    adoption = record["adoption"]
    decision = "none" if adoption is None else adoption["reference"]
    return ("\n\n## Cursor qualification scope\n\n"
            + f"Status: {record['status']}. Owner decision: {decision}.\n"
            + "Generation covers structural assets for CLI, IDE and Cloud. It does not qualify runtime use.\n"
            + "Allowed dispatch scopes: " + json.dumps(record["scope"]["dispatch"], ensure_ascii=False) + ".\n"
            + "Stop and report when a task falls outside these scopes. This is a dispatcher contract, not host access control.\n"
            + "Unproved guarantees: " + "; ".join(record["missing"]) + ".\n")


def require_dispatch(source: Path, native: bytes, prompt: str, scope: dict) -> None:
    record = read_qualification(source, native, prompt)
    if record["status"] not in {"limited", "proved"}:
        raise ValueError(f"cursor qualification {source.name}: dispatch scope is not adopted")
    dispatch_scopes([scope], record["host_versions"], readonly=native_readonly(native))
    if scope not in record["scope"]["dispatch"]:
        raise ValueError(f"cursor qualification {source.name}: dispatch scope is not adopted")
