#!/usr/bin/env python3
"""Revision 3 entry: serial acceptance reruns with a 90 minute wall limit.

The original runner is imported unchanged. This file registers two arms that use
the same role definitions as baseline/candidate, raises the wall limit, and lets
QA-2 accept either result for C8 (the second seeded defect violates it as well).

  evalrun_r3.py prepare-arms
  evalrun_r3.py run TASK ARM REPEAT
"""

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evalrun  # noqa: E402

ARMS = {'opus-serial': ('baseline', 'claude-opus-5-5'), 'sonnet-serial': ('candidate', 'claude-sonnet-5-5')}
EITHER = {'QA-2': ['C8']}
evalrun.WALL_SECONDS = 90 * 60
evalrun.MODELS.update({arm: model for arm, (_, model) in ARMS.items()})
judge = evalrun.oracle_acceptance


def oracle_acceptance(task, dest, ev, dist_before):
    result = judge(task, dest, ev, dist_before)
    either = EITHER.get(task['id'], [])
    if either and 'criteria' in result:
        failing = set(task['expected']['failing_criteria'])
        ids = ['C%d' % i for i in range(1, 11)]
        criteria = result['criteria']
        correct = [i for i in ids if (criteria.get(i) in ('pass', 'fail') if i in either
                                      else criteria.get(i) == ('fail' if i in failing else 'pass'))]
        false_alarms = [i for i in result['false_alarms'] if i not in either]
        result.update(criteria_correct=len(correct), false_alarms=false_alarms, either=either,
                      success=result['verdict_ok'] and not result['missed_defects'] and not false_alarms)
    return result


evalrun.oracle_acceptance = oracle_acceptance


def prepare_arms():
    for arm, (source, _) in ARMS.items():
        path = evalrun.AGENTS / ('tui-qa.%s.json' % arm)
        shutil.copyfile(str(evalrun.AGENTS / ('tui-qa.%s.json' % source)), str(path))
        print(path.name, evalrun.sha256(path))


if __name__ == '__main__':
    if sys.argv[1:] == ['prepare-arms']:
        prepare_arms()
    else:
        evalrun.main()
