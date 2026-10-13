import copy
from pathlib import Path

import yaml

from cursor_projection import cursor_role_prompt
from cursor_qualification import GENERATION_SCOPES, digest, subject_digest


def pending_record(role: Path) -> dict:
    return {"version": 1, "role": role.name,
            "binding": {"native_sha256": digest((role / "cursor.yaml").read_bytes()),
                        "prompt_sha256": digest(cursor_role_prompt(role).encode())},
            "host_versions": {"cli": ["fixture-cli"], "ide": [], "cloud": []},
            "status": "pending",
            "scope": {"generation": sorted(GENERATION_SCOPES), "dispatch": []},
            "evidence": [], "missing": ["Synthetic fixture has no runtime proof."],
            "adoption": None, "reason": "Test fixture only."}


def limited_record(role: Path) -> dict:
    record = pending_record(role)
    record["status"] = "limited"
    record["scope"]["dispatch"] = [{"environment": "cli", "deployment": "project", "version": "fixture-cli",
                                      "mode": "interactive", "purpose": "qualification-probe"}]
    return adopt(record)


def adopt(record: dict) -> dict:
    record = copy.deepcopy(record)
    record["adoption"] = {"owner": "PanQiWei",
                          "reference": "https://github.com/nemori-ai/omne-harness-lite/issues/198#issuecomment-1",
                          "subject_sha256": subject_digest(record)}
    return record


def write_record(role: Path, record: dict) -> None:
    (role / "cursor-qualification.yaml").write_text(yaml.safe_dump(record, allow_unicode=True, sort_keys=False))


def qualify_roles(source: Path) -> None:
    for native in (source / "roles").glob("*/cursor.yaml"):
        write_record(native.parent, limited_record(native.parent))
