from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path


TOOL = Path(__file__).resolve().parents[1] / "src/rebase_resources.py"


def write_manifest(path: Path, source: Path, *, expected_count: int = 1) -> None:
    path.write_text(json.dumps({
        "format": 1,
        "files": [{
            "source": "spec/data/core-work/v2/schema.json",
            "target": "spec/data/core-work/v1/schema.json",
            "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "replacements": [{
                "from": "/legacy/spec/data/core-work/v2/schema.json",
                "to": "/meta-harness/new/spec/data/core-work/v1/schema.json",
                "count": expected_count,
            }],
        }],
    }, indent=2) + "\n")


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(TOOL), *args], text=True, capture_output=True)


def test_explicit_rebase_checks_source_hash_rewrite_count_and_is_idempotent(tmp_path: Path) -> None:
    source_root, design_root = tmp_path / "source", tmp_path / "portable/design"
    source = source_root / "spec/data/core-work/v2/schema.json"
    source.parent.mkdir(parents=True)
    source.write_text('{"$id":"https://example.invalid/legacy/spec/data/core-work/v2/schema.json"}\n')
    manifest = tmp_path / "map.json"
    write_manifest(manifest, source)
    args = ("--source-root", str(source_root), "--design-root", str(design_root),
            "--manifest", str(manifest))
    first = run(*args)
    assert first.returncode == 0, first.stderr
    target = design_root / "spec/data/core-work/v1/schema.json"
    assert "/meta-harness/new/spec/data/core-work/v1/schema.json" in target.read_text()
    assert run(*args).returncode == 0
    assert run(*args, "--check").returncode == 0


def test_rebase_refuses_source_drift_and_inexact_replacement(tmp_path: Path) -> None:
    source_root, design_root = tmp_path / "source", tmp_path / "design"
    source = source_root / "spec/data/core-work/v2/schema.json"
    source.parent.mkdir(parents=True)
    source.write_text("/legacy/spec/data/core-work/v2/schema.json\n")
    manifest = tmp_path / "map.json"
    write_manifest(manifest, source, expected_count=2)
    result = run("--source-root", str(source_root), "--design-root", str(design_root),
                 "--manifest", str(manifest))
    assert result.returncode == 1
    assert "expected 2 occurrence(s), found 1" in result.stderr

    write_manifest(manifest, source)
    source.write_text("drifted\n")
    result = run("--source-root", str(source_root), "--design-root", str(design_root),
                 "--manifest", str(manifest))
    assert result.returncode == 1
    assert "source SHA-256 mismatch" in result.stderr


def test_rebase_preflight_prevents_writes_when_any_target_collides(tmp_path: Path) -> None:
    source_root, design_root = tmp_path / "source", tmp_path / "design"
    first = source_root / "a.txt"
    second = source_root / "b.txt"
    first.parent.mkdir(parents=True)
    first.write_text("first")
    second.write_text("second")
    manifest = tmp_path / "map.json"
    manifest.write_text(json.dumps({"format": 1, "files": [
        {"source": "a.txt", "target": "out/a.txt", "source_sha256": hashlib.sha256(first.read_bytes()).hexdigest(), "replacements": []},
        {"source": "b.txt", "target": "out/b.txt", "source_sha256": hashlib.sha256(second.read_bytes()).hexdigest(), "replacements": []},
    ]}))
    existing = design_root / "out/b.txt"
    existing.parent.mkdir(parents=True)
    existing.write_text("occupied")
    result = run("--source-root", str(source_root), "--design-root", str(design_root),
                 "--manifest", str(manifest))
    assert result.returncode == 1
    assert not (design_root / "out/a.txt").exists()
    assert "target exists with different content" in result.stderr
