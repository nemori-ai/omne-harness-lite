"""Recreate the offline benchmark in a NEW scratch directory; never build source."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("checkout", type=Path, help="matching, already-built checkout with dependencies")
parser.add_argument("scratch", type=Path, help="new directory, must not exist")
args = parser.parse_args()
archive = Path(__file__).resolve().parent
manifest = json.loads((archive / "source-manifest.json").read_text())
old_root = Path(manifest["hub"])
checkout = args.checkout.resolve()


def checked(path, expected):
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit(f"source hash mismatch: {path}")


# Verify everything before creating output; the caller must freeze these files
# during preparation. External transitive dependencies remain package-managed.
for entry in manifest["files"]:
    checked(checkout / Path(entry["source"]).relative_to(old_root), entry["sha256"])
for dep in manifest["external_dependencies"].values():
    dependency = checkout / Path(dep["path"]).relative_to(old_root)
    for name, expected in dep["sha256_files"].items():
        checked(dependency / name, expected)

scratch = args.scratch.resolve()
scratch.mkdir(parents=True, exist_ok=False)
for entry in manifest["files"]:
    if "snapshot" not in entry:
        continue
    target = scratch / entry["snapshot"]
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(checkout / Path(entry["source"]).relative_to(old_root), target)
    checked(target, entry["copied_sha256"])
for name, dep in manifest["external_dependencies"].items():
    target = scratch / "snapshot/node_modules" / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.symlink_to(checkout / Path(dep["path"]).relative_to(old_root), target_is_directory=True)
for name in ("snapshot/bench.mjs", "snapshot/bench-v1.mjs", "summarize.py"):
    shutil.copy2(archive / name, scratch / name)
(scratch / "snapshot/package.json").write_text('{"type":"module"}\n')
print(json.dumps({"scratch": str(scratch), "verified_checkout": str(checkout),
                  "copied_files": sum("snapshot" in e for e in manifest["files"]),
                  "note": "Keep symlinked dependencies immutable while running."}))
