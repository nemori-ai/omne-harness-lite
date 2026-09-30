#!/usr/bin/env python3
"""Revision 2 entry: adds the high-effort Opus and Fable arms on top of evalrun.py.

The original runner is imported unchanged; this file only registers two more arms.
Each arm needs <role>.<arm>.json under the agents directory, see prepare-arms below.

  evalrun_r2.py prepare-arms        write the role definitions for the two arms
  evalrun_r2.py run TASK ARM REPEAT
  evalrun_r2.py summary
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evalrun  # noqa: E402

ARMS = {'opus-high': 'claude-opus-5-5', 'fable-high': 'claude-fable-5-1'}
ROLES = ('application-developer', 'tui-developer')
evalrun.MODELS.update(ARMS)


def prepare_arms():
    for role in ROLES:
        base = json.loads((evalrun.AGENTS / ('%s.baseline.json' % role)).read_text())
        for arm, model in ARMS.items():
            definition = dict(base[role], model=model, effort='high')
            path = evalrun.AGENTS / ('%s.%s.json' % (role, arm))
            path.write_text(json.dumps({role: definition}, ensure_ascii=False, indent=1))
            print(path.name, evalrun.sha256(path))


if __name__ == '__main__':
    if sys.argv[1:] == ['prepare-arms']:
        prepare_arms()
    else:
        evalrun.main()
