// @module-tag slow
// Slow: it starts a child vitest run. The run proves that the resolution and read check suites
// go red on a double that discloses whether an identity exists, and only on that case.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const member = fileURLToPath(new URL('..', import.meta.url))
const vitest = join(
  dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
  'vitest.mjs',
)
const NO_DISCLOSURE =
  'answers a principal without the right the same for an existing and a missing identity'

type Assertion = Readonly<{ ancestorTitles: string[]; title: string; status: string }>
type Report = Readonly<{ testResults: readonly Readonly<{ assertionResults: Assertion[] }>[] }>

it('the suites fail a double that discloses a missing identity, on the non-disclosure case only', () => {
  const run = spawnSync(
    process.execPath,
    [vitest, 'run', '--config', 'tests/fixtures/violations/vitest.config.ts', '--reporter=json'],
    {
      cwd: member,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', OMNE_TEST_REPORT_DIR: '' },
    },
  )
  expect(run.status, run.stderr).toBe(1)
  const report: Report = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')))
  const results = report.testResults.flatMap(file => file.assertionResults)
  const failed = results.filter(result => result.status === 'failed')
  expect(failed.map(result => [result.ancestorTitles.join(' > '), result.title])).toEqual([
    ['SkillResolution conformance: resolution that discloses a missing identity', NO_DISCLOSURE],
    ['SkillReadCheck conformance: read check that discloses a missing identity', NO_DISCLOSURE],
  ])
  expect(results.filter(result => result.status === 'passed').length).toBe(results.length - 2)
})
