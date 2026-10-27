import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import yaml


WORKFLOW = Path(__file__).resolve().parents[2] / '.github/workflows/gate-release.yml'


class ReleaseWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.steps = yaml.safe_load(WORKFLOW.read_text())['jobs']['release']['steps']
        self.env = dict(os.environ, PATH=str(self.root) + os.pathsep + os.environ['PATH'],
                        CAPTURE=str(self.root / 'calls.jsonl'), NAME='@omne-harness/repo-config',
                        VERSION='0.0.3-preview.1', TARBALL='/tmp/package.tgz', DRY_RUN='true',
                        PUBLISH_OUTCOME='success', ISSUE='865', TARGET='integration/test',
                        COMMIT='a' * 40, LOCAL='b' * 128, APPROVER='PanQiWei', NOTE='Checked',
                        GITHUB_SERVER_URL='https://github.com', GITHUB_REPOSITORY='owner/repo',
                        GITHUB_RUN_ID='123')
        shim = '''#!/usr/bin/env python3
import json, os, pathlib, sys
with open(os.environ['CAPTURE'], 'a') as f:
    f.write(json.dumps([pathlib.Path(sys.argv[0]).name, *sys.argv[1:]]) + '\\n')
if sys.argv[1] == 'view':
    if '--json' in sys.argv:
        print(json.dumps({'version': os.environ['VERSION'], 'dist': {'integrity': 'sha512-test', 'attestations': {}}}))
    else:
        print('E404', file=sys.stderr)
        sys.exit(1)
elif sys.argv[1] == 'publish':
    sys.exit(int(os.environ.get('PUBLISH_EXIT', '0')))
'''
        for name in ['npm', 'gh']:
            f = self.root / name
            f.write_text(shim)
            f.chmod(0o755)

    def run_step(self, name, **env):
        step = next(s for s in self.steps if s.get('name') == name)
        return subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', step['run']],
                              env=dict(self.env, **env), cwd=self.root,
                              text=True, capture_output=True)

    def calls(self):
        return [json.loads(x) for x in (self.root / 'calls.jsonl').read_text().splitlines()]

    def test_release_channel_and_dry_run(self):
        for version in ['1.2.3', '1.2.3-preview.1']:
            for dry in ['true', 'false']:
                with self.subTest(version=version, dry=dry):
                    result = self.run_step('Publish with provenance', VERSION=version, DRY_RUN=dry)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    args = [c for c in self.calls() if c[1] == 'publish'][-1]
                    self.assertEqual('--dry-run' in args, dry == 'true')
                    if '-' in version:
                        self.assertIn('--tag', args, 'Prerelease publication needs an explicit non-latest tag')
                        self.assertEqual(args[args.index('--tag') + 1], 'next')
                    else:
                        self.assertNotIn('--tag', args)
                    self.assertIn('--provenance', args)
                    self.assertEqual(args[args.index('--access') + 1], 'public')

    def test_publish_failure_propagates(self):
        result = self.run_step('Publish with provenance', PUBLISH_EXIT='17')
        self.assertEqual(result.returncode, 17)

    def test_decision_reports_step_outcome(self):
        for outcome in ['success', 'failure', 'skipped']:
            for dry in ['true', 'false']:
                with self.subTest(outcome=outcome, dry=dry):
                    result = self.run_step('Read back and record the decision',
                                           PUBLISH_OUTCOME=outcome, DRY_RUN=dry)
                    body = [c for c in self.calls() if c[0] == 'gh'][-1]
                    body = next(x[5:] for x in body if x.startswith('body='))
                    if outcome == 'success':
                        self.assertEqual(result.returncode, 0, result.stderr)
                        self.assertIn('dry run:' if dry == 'true' else 'published;', body)
                    else:
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('NOT CONFIRMED', body)
                        self.assertIn(outcome, body)
                        self.assertNotIn('every step ran', body)
                        self.assertNotIn('outcome: published;', body.lower())

    def test_decision_uses_actual_publish_step(self):
        publish = next(s for s in self.steps if s.get('name') == 'Publish with provenance')
        decision = next(s for s in self.steps if s.get('name') == 'Read back and record the decision')
        self.assertEqual(publish.get('id'), 'publish')
        self.assertEqual(decision.get('if'), '${{ !cancelled() }}')
        self.assertEqual(decision['env'].get('PUBLISH_OUTCOME'), '${{ steps.publish.outcome }}')


if __name__ == '__main__':
    unittest.main()
