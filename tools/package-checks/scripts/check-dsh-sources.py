"""Verify selected source snapshots against the fixed official archive, offline."""
import argparse
import hashlib
import json
from pathlib import Path
import tarfile


REVISION = "c291e7961a515f6d7af9304e7fd1d257929aef26"
ARCHIVE_SHA256 = "f08cfc86cb05d4186be3319670e2756375cb2788b3d2164dd7f30b885f350860"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    actual = sha256(args.archive.read_bytes())
    if actual != ARCHIVE_SHA256:
        raise ValueError("Official archive SHA-256 mismatch: " + actual)
    results = []
    with tarfile.open(args.archive, "r:gz") as archive:
        prefix = archive.getmembers()[0].name.split("/", 1)[0]
        manifests = sorted((root / "packages").glob("*/*/provenance.json"))
        if not manifests:
            raise ValueError("No responsibility package provenance found")
        for manifest in manifests:
            package = manifest.parent
            name = package.relative_to(root / "packages").as_posix()
            provenance = json.loads(manifest.read_text())
            if provenance["commit"] != REVISION:
                raise ValueError("Unexpected source revision in " + name)
            files = []
            for entry in provenance["files"]:
                member = archive.extractfile(prefix + "/" + entry["upstream_path"])
                if member is None:
                    raise ValueError("Missing regular source file: " + entry["upstream_path"])
                with member:
                    original = member.read()
                snapshot = (package / entry["snapshot"]).read_bytes()
                if original != snapshot or sha256(snapshot) != entry["sha256"]:
                    raise ValueError("Source mismatch: " + name + "/" + entry["snapshot"])
                files.append({
                    "snapshot": entry["snapshot"], "sha256": sha256(snapshot),
                    "targets": [{"path": target, "sha256": sha256((package / target).read_bytes())}
                                for target in entry["targets"]],
                })
            results.append({"package": name, "records": len(files), "files": files})
    print(json.dumps({
        "revision": REVISION, "archive_sha256": actual,
        "command": "python tools/package-checks/scripts/check-dsh-sources.py <official-archive.tar.gz>",
        "scope": "Selected regular-file bytes and recorded hashes; no mode/uid/gid or product conformance claim",
        "packages": results, "result": "pass",
    }, indent=2))


if __name__ == "__main__":
    main()
