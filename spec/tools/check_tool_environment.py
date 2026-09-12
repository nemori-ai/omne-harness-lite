#!/usr/bin/env python3
"""Report local Java/JAR readiness separately from model coverage; install nothing."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

from doc_support import digest


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
        else:
            print(f"FOUND: {variable}={path.resolve()} sha256={digest(path)}")
    print("NOTE: environment readiness does not execute TLC/Alloy or establish model coverage.")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
