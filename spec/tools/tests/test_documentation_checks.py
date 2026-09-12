import hashlib
import json
import subprocess
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DOCS = ROOT / "spec/tools/check_docs.py"
SPECS = ROOT / "spec/tools/check_specs.py"


def run(script, root):
    return subprocess.run([sys.executable, str(script), "--root", str(root)], text=True, capture_output=True)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def decision(source=True, supersedes="[]"):
    sources = "  - ../proposals/p.md" if source else "  - ../misc.md"
    return "---\nkind: decision\nid: D-001\nstatus: accepted\nscope: x\ndate: 2026-01-01\nsources:\n" + sources + "\nacceptance: ../proposals/p.md\nsupersedes: " + supersedes + "\n---\n# Decision\n"


def base(tmp_path):
    write(tmp_path / "README.md", "# Root\n")
    write(tmp_path / "docs/proposals/p.md", "# Proposal\n")
    write(tmp_path / "spec/catalog.json", '{"catalog_version":1,"contracts":[]}')
    write(tmp_path / "spec/frozen.json", '{"format":1,"files":{}}')
    write(tmp_path / "spec/formal-tasks.json", '{"format":1,"tasks":[]}')
    shutil.copytree(ROOT / "spec/tools/formats", tmp_path / "spec/tools/formats")


def test_docs_rejects_bad_link_and_anchor(tmp_path):
    base(tmp_path)
    write(tmp_path / "docs/a.md", "[missing](no.md) [bad](../README.md#none)\n```\n[ignored](nope.md)\n```")
    result = run(DOCS, tmp_path)
    assert result.returncode == 1
    assert "broken link" in result.stdout and "broken anchor" in result.stdout


def test_docs_rejects_accepted_decision_without_eligible_source(tmp_path):
    base(tmp_path)
    write(tmp_path / "docs/decisions/D-001.md", decision(source=False))
    write(tmp_path / "docs/misc.md", "# Misc")
    result = run(DOCS, tmp_path)
    assert result.returncode == 1 and "no proposal/research source" in result.stdout


def test_docs_rejects_supersession_without_causal_evidence(tmp_path):
    base(tmp_path)
    write(tmp_path / "docs/decisions/D-001.md", decision(supersedes="[{id: D-000, scope: x}]"))
    result = run(DOCS, tmp_path)
    assert result.returncode == 1 and "change_basis" in result.stdout


def test_docs_rejects_frozen_content_tampering(tmp_path):
    base(tmp_path)
    write(tmp_path / "spec/data/x/v1/model.md", "original")
    digest = hashlib.sha256(b"original").hexdigest()
    write(tmp_path / "spec/frozen.json", json.dumps({"format": 1, "files": {"spec/data/x/v1/model.md": digest}}))
    write(tmp_path / "spec/data/x/v1/model.md", "changed")
    result = run(DOCS, tmp_path)
    assert result.returncode == 1 and "frozen file changed" in result.stdout


def test_docs_baseline_detects_content_and_manifest_tampering(tmp_path):
    base(tmp_path)
    write(tmp_path / "spec/data/x/v1/model.md", "original")
    digest = hashlib.sha256(b"original").hexdigest()
    write(tmp_path / "spec/frozen.json", json.dumps({"format": 1, "files": {"spec/data/x/v1/model.md": digest}}))
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "add", "."], cwd=tmp_path, check=True)
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-qm", "baseline"], cwd=tmp_path, check=True)
    write(tmp_path / "spec/data/x/v1/model.md", "changed")
    write(tmp_path / "spec/frozen.json", json.dumps({"format": 1, "files": {"spec/data/x/v1/model.md": hashlib.sha256(b"changed").hexdigest()}}))
    result = subprocess.run([sys.executable, str(DOCS), "--root", str(tmp_path), "--baseline", "HEAD"], text=True, capture_output=True)
    assert result.returncode == 1 and "baseline frozen file changed" in result.stdout


def test_specs_rejects_invalid_catalog_and_invalid_example(tmp_path):
    base(tmp_path)
    write(tmp_path / "spec/catalog.json", json.dumps({"catalog_version": 1, "contracts": [{"id": "wrong", "current_version": 2, "versions": [{"version": 1, "status": "accepted", "path": "none.md", "acceptance": "none.md"}]}]}))
    write(tmp_path / "docs/proposals/x/v1/a.schema.json", json.dumps({"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://example.invalid/a", "type": "object", "required": ["x"]}))
    write(tmp_path / "docs/proposals/x/v1/a.example.json", "{}")
    result = run(SPECS, tmp_path)
    assert result.returncode == 1
    assert "catalog schema" in result.stdout and "schema example invalid" in result.stdout
