#!/usr/bin/env python3
"""Generate and expose project assets before the first local or Cloud session."""
import argparse
from pathlib import Path

import compile_agents
import link_agents
from host_layout import HOSTS


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--host", choices=(*HOSTS, "all"), default="all")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    project = args.project_root.absolute()
    common = ["--host", args.host, *(["--check"] if args.check else [])]
    result = compile_agents.main(["--source", str(project / ".meta_harness/agents"),
                                  "--output", str(project / ".meta_harness"), *common])
    if result:
        return result
    return link_agents.main(["--project-root", str(project), *common])


if __name__ == "__main__":
    raise SystemExit(main())
