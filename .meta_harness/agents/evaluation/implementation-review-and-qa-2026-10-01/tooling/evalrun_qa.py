#!/usr/bin/env python3
"""Rerun the held-out acceptance tasks of the Sonnet 5.5 comparison with the generalised `qa` role.

The original runner and its revision-3 oracle are imported unchanged. This file registers one arm whose
role definition is the compiled `qa` agent, keeps the task files, briefs, template checkout, wall limit
and judging rules of revision 3, and writes evidence to the main checkout.

  evalrun_qa.py prepare-arm GENERATED_QA_MD    freeze the role definition for the arm
  evalrun_qa.py run TASK qa-general REPEAT
"""

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SONNET55 = HERE.parents[1] / 'role-model-sonnet55' / 'tooling'
sys.path.insert(0, str(SONNET55))
import evalrun  # noqa: E402
import evalrun_r3  # noqa: E402,F401  (installs the revision-3 oracle and the 90 minute wall limit)

ARM = 'qa-general'
MAIN = Path(os.environ.get('EVAL_MAIN_CHECKOUT', str(evalrun.REPO)))
evalrun.MODELS[ARM] = 'claude-sonnet-5-5'
evalrun.EVIDENCE = MAIN / 'tmp' / 'qa-generalised' / 'runs'


def front_matter(text):
    """Front matter of a generated agent file: plain `key: value` lines, long values folded onto indented lines."""
    _, front, body = text.split('---\n', 2)
    fields, key = {}, None
    for line in front.splitlines():
        if line.startswith(' ') and key:
            fields[key] += ' ' + line.strip()
        else:
            key, _, value = line.partition(':')
            fields[key] = value.strip()
    return {k: v.strip("'").replace("''", "'") for k, v in fields.items()}, body.strip()


def prepare_arm(generated):
    fields, prompt = front_matter(Path(generated).read_text())
    assert fields['name'] == 'qa', fields['name']
    # The tasks address the role as `tui-qa`; the definition under that key is the generalised one.
    definition = {'description': fields['description'], 'model': evalrun.MODELS[ARM],
                  'tools': [t.strip() for t in fields['tools'].split(',')],
                  'permissionMode': fields['permissionMode'], 'effort': fields['effort'], 'prompt': prompt}
    path = evalrun.AGENTS / ('tui-qa.%s.json' % ARM)
    path.write_text(json.dumps({'tui-qa': definition}, ensure_ascii=False, indent=1))
    print(path.name, evalrun.sha256(path), len(prompt))


if __name__ == '__main__':
    if sys.argv[1:2] == ['prepare-arm']:
        prepare_arm(sys.argv[2])
    else:
        evalrun.main()
