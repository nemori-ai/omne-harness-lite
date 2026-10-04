import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    result = subprocess.run([sys.executable, str(ROOT / "verify_results.py")], cwd=ROOT, check=True, capture_output=True, text=True)
    manifest = json.loads((ROOT / "HASHES.json").read_text())
    listed = manifest["files"]
    actual = {path.relative_to(ROOT).as_posix() for path in ROOT.rglob("*") if path.is_file()}
    expected = set(listed) | {"HASHES.json"}
    if actual != expected:
        raise ValueError(f"unexpected or missing package files: {sorted(actual ^ expected)}")
    if any("meta/" in name or "TTrace" in name or name.endswith((".bin", ".pyc")) for name in actual):
        raise ValueError("TLC metadata, generated trace, or cache included")
    for name, item in listed.items():
        data = (ROOT / name).read_bytes()
        if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
            raise ValueError(f"file hash or length mismatch: {name}")
    if sum(item["bytes"] for item in listed.values()) != manifest["total_bytes"]:
        raise ValueError("manifest byte total mismatch")
    print(result.stdout.strip())
    print(f"PASS: {len(actual)} package files, {manifest['total_bytes']} payload bytes, all SHA-256 values verified")


if __name__ == "__main__":
    main()
