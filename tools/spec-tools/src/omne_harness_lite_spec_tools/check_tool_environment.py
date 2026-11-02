#!/usr/bin/env python3
"""Report local Java/JAR readiness separately from model coverage; install nothing."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

from .doc_support import digest

# The release asset digest pins the exact JAR; the manifest version alone does not identify the build.
PINNED_JARS = {
    "TLA2TOOLS_JAR": (
        "tla2tools v1.7.4 (https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4)",
        "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88",
    ),
}


def main():
    missing = False
    if not shutil.which("java"):
        print("MISSING: Java 11+ (use a version supported by the selected TLC and Alloy releases).")
        missing = True
    else:
        run = subprocess.run(["java", "-version"], capture_output=True, text=True)
        version = run.stdout + run.stderr
        match = re.search(r'version "(\d+)', version)
        print(version.strip())
        if run.returncode or not match or int(match[1]) < 11:
            print("MISSING: usable Java 11+ runtime.")
            missing = True
    for variable in ("TLA2TOOLS_JAR", "ALLOY_ANALYZER_JAR"):
        path = Path(os.environ.get(variable, ""))
        if not os.environ.get(variable) or not path.is_file() or not zipfile.is_zipfile(path):
            print(f"MISSING: {variable} must point to an installed tool JAR.")
            missing = True
            continue
        found = digest(path)
        print(f"FOUND: {variable}={path.resolve()} sha256={found}")
        pinned = PINNED_JARS.get(variable)
        if pinned and found != pinned[1]:
            print(f"MISMATCH: {variable} must be {pinned[0]} with sha256={pinned[1]}.")
            missing = True
    print("NOTE: environment readiness does not execute TLC/Alloy or establish model coverage.")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
