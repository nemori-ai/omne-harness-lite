#!/usr/bin/env python3
"""Revision 4 entry: Sonnet 5.5 at high effort on the application-developer tasks.

Registers one more arm on top of evalrun.py so the default effort of the role can be
chosen on evidence rather than carried over from Sonnet 5.

  evalrun_r4.py prepare-arms
  evalrun_r4.py run TASK sonnet-high REPEAT
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evalrun  # noqa: E402

ARM = 'sonnet-high'
evalrun.MODELS[ARM] = 'claude-sonnet-5-5'


def prepare_arms():
    role = 'application-developer'
    base = json.loads((evalrun.AGENTS / ('%s.candidate.json' % role)).read_text())
    definition = dict(base[role], effort='high')
    path = evalrun.AGENTS / ('%s.%s.json' % (role, ARM))
    path.write_text(json.dumps({role: definition}, ensure_ascii=False, indent=1))
    print(path.name, evalrun.sha256(path))


if __name__ == '__main__':
    if sys.argv[1:] == ['prepare-arms']:
        prepare_arms()
    else:
        evalrun.main()
