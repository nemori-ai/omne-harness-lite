"""Facts about realization nodes as intent: node count, bindings.yaml top-level keys, nodes without a package,
and nodes whose README still says 尚未建包 although the package exists.

Run from the repository root: uv run --locked python .meta_harness/research/architecture-judgment-aids/probes/realization-node-facts.py
"""

import glob
import os

import yaml

R = ".meta_harness/design/realization"
nodes = sorted(
    os.path.dirname(p)[len(R) + 1 :]
    for p in glob.glob(f"{R}/packages/*/*/bindings.yaml") + glob.glob(f"{R}/apps/*/bindings.yaml")
)
print("nodes", len(nodes))
keys = set()
for n in nodes:
    keys |= set((yaml.safe_load(open(f"{R}/{n}/bindings.yaml")) or {}).keys())
print("top keys", sorted(keys))
nopkg = [n for n in nodes if not os.path.exists(f"{n}/package.json")]
print("no package", len(nopkg), nopkg)
stale = [n for n in nodes if os.path.exists(f"{n}/package.json") and "尚未建包" in open(f"{R}/{n}/README.md").read()]
print("says 尚未建包 but package exists", len(stale))
for s in stale:
    print("  ", s)
