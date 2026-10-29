#!/usr/bin/env python3
"""Reject exit-only, truncated, wrong-target, and malformed TLC evidence."""
import json
from pathlib import Path

namespace = {'__name__': 'runner_library', '__file__': str(Path(__file__).with_name('classify.py'))}
exec(compile(Path(__file__).with_name('classify.py').read_text(), 'classify.py', 'exec'), namespace)
classify = namespace['classify']
success = ('Model checking completed. No error has been found.\n'
           '10 states generated, 5 distinct states found, 0 states left on queue.\n'
           'The depth of the complete state graph search is 4.\n')
trace = ('Error: Invariant SessionIsolation is violated.\n'
         'Error: The behavior up to this point is:\n'
         'State 1: <Initial predicate>\nx = 0\nState 2: <Publish>\nx = 1\n')
checks = [
    ('positive-complete', (0, False, success, None), True),
    ('exit-only', (0, False, '', None), False),
    ('completion-only', (0, False, success.splitlines()[0], None), False),
    ('positive-timeout', (0, True, success, None), False),
    ('nonzero-success-text', (1, False, success, None), False),
    ('unfinished-queue', (0, False, success.replace('0 states left', '4 states left'), None), False),
    ('missing-depth', (0, False, '\n'.join(success.splitlines()[:2]), None), False),
    ('error-in-success', (0, False, success + 'Error: Evaluation failed.', None), False),
    ('named-counterexample', (12, False, trace, 'SessionIsolation'), True),
    ('wrong-invariant', (12, False, trace, 'OldPreparedIsolated'), False),
    ('parse-failure', (150, False, 'Parsing or semantic analysis failed.', 'SessionIsolation'), False),
    ('missing-trace', (12, False, trace.splitlines()[0], 'SessionIsolation'), False),
    ('trace-header-only', (12, False, '\n'.join(trace.splitlines()[:2]), 'SessionIsolation'), False),
    ('wrong-exit', (1, False, trace, 'SessionIsolation'), False),
    ('negative-timeout', (12, True, trace, 'SessionIsolation'), False),
    ('negative-passes', (0, False, success, 'SessionIsolation'), False),
    ('conflicting-completion', (12, False, trace + success, 'SessionIsolation'), False),
    ('multiple-violations', (12, False, trace + 'Invariant Other is violated.', 'SessionIsolation'), False),
    ('runtime-error-with-trace', (12, False, trace + 'Error: TLC threw an unexpected exception.', 'SessionIsolation'), False),
]

# Keep the adopted checks above intact; these cover incomplete state evidence.
checks.extend([
    ('empty-state-headings', (12, False, trace.split('State 1:')[0] + 'State 1:\nState 2:\n', 'SessionIsolation'), False),
    ('action-headings-only', (12, False, trace.replace('x = 0\n', '').replace('x = 1\n', ''), 'SessionIsolation'), False),
    ('second-state-body-missing', (12, False, trace.replace('x = 1\n', ''), 'SessionIsolation'), False),
    ('second-value-missing', (12, False, trace.replace('x = 1\n', 'x =\n'), 'SessionIsolation'), False),
    ('second-record-truncated', (12, False, trace.replace('x = 1\n', 'x = [field |-> 1\n'), 'SessionIsolation'), False),
    ('second-record-value-missing', (12, False, trace.replace('x = 1\n', 'x = [field |-> ]\n'), 'SessionIsolation'), False),
    ('second-string-truncated', (12, False, trace.replace('x = 1\n', 'x = "unfinished\n'), 'SessionIsolation'), False),
    ('second-sequence-truncated', (12, False, trace.replace('x = 1\n', 'x = <<1,\n'), 'SessionIsolation'), False),
    ('second-variable-missing', (12, False, trace.replace('x = 0\n', 'x = 0\ny = 2\n'), 'SessionIsolation'), False),
    ('second-variable-duplicated', (12, False, trace.replace('x = 1\n', 'x = 1\nx = 2\n'), 'SessionIsolation'), False),
    ('second-action-missing', (12, False, trace.replace('State 2: <Publish>', 'State 2:'), 'SessionIsolation'), False),
    ('wrong-state-order', (12, False, trace.replace('State 2:', 'State 3:'), 'SessionIsolation'), False),
    ('third-state-truncated', (12, False, trace + 'State 3: <Publish>\nx = [\n', 'SessionIsolation'), False),
    ('garbage-state-value', (12, False, trace.replace('x = 1\n', 'x = not a value\n'), 'SessionIsolation'), False),

    ('unescaped-newline-in-value', (12, False, trace.replace('x = 1\n', 'x = "line\nbreak"\n'), 'SessionIsolation'), False),
    ('invalid-string-escape', (12, False, trace.replace('x = 1\n', 'x = "bad\\q"\n'), 'SessionIsolation'), False),
    ('states-before-counterexample-banner', (12, False, 'State 1: <Init>\nx = 0\nState 2: <Publish>\nx = 1\n' + trace.split('State 1:')[0], 'SessionIsolation'), False),
    ('complete-nested-values', (12, False, trace.replace('x = 0', '/\\ x = [items |-> <<{}, 1..2, "<tag>">>]').replace('x = 1', '/\\ x = [items |-> <<{1}, 2..3, "[tag]">>]'), 'SessionIsolation'), True),
])

results = [{'case': name, 'expected': want, 'actual': classify(*args), 'pass': classify(*args) == want}
           for name, args, want in checks]
report = {'checks': results, 'all_pass': all(item['pass'] for item in results)}

print(json.dumps(report, indent=2))
raise SystemExit(0 if report['all_pass'] else 1)
