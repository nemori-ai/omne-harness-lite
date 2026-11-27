import { expect, test } from 'vitest'
import { evaluationNotProductSource } from '../src/rules/evaluation-not-product-source.ts'

const check = (path: string, text: string, resolvedModules?: Record<string, string>) =>
  evaluationNotProductSource.check([
    { path, text, ...(resolvedModules === undefined ? {} : { resolvedModules }) },
  ])

test.each([
  ['benchmarks/src/trajectory.ts', "import { spawn } from 'node:child_process'"],
  ['benchmarks/src/trajectory.ts', "import type { Suite } from '@omne-harness/perf-harness'"],
  ['benchmarks/src/suites/sessions.ts', "import { runRounds } from '../trajectory.ts'"],
  ['benchmarks/src/driver/observe.ts', "import { createClient } from '@omne-harness/sdk'"],
  [
    'benchmarks/src/driver/observe.ts',
    "import { sessionProtocol } from '@omne-harness/session-protocol'",
  ],
  ['benchmarks/tests/suites.spec.ts', "import { expect } from 'vitest'"],
  ['benchmarks/vitest.config.ts', "import { testTiers } from '../vitest.tiers.mts'"],
  ['benchmarks/vitest.config.ts', "import { defineConfig } from 'vitest/config'"],
  ['tools/perf-harness/src/cli.ts', "import { watch } from './environment/collect.ts'"],
  ['tools/perf-harness/src/environment/probes.ts', "import { DatabaseSync } from 'node:sqlite'"],
  ['packages/session/session/src/x.ts', "import { x } from '@omne-harness/session-contract'"],
])('lets %s write: %s', (path, text) => {
  expect(check(path, text)).toEqual([])
})

test.each([
  ['benchmarks/src/x.ts', "import { x } from '@omne-harness/session-contract'"],
  ['benchmarks/src/x.ts', "import { x } from '@omne-harness/sqlite-provider'"],
  ['tools/perf-harness/src/x.ts', "import { createClient } from '@omne-harness/sdk'"],
  ['benchmarks/src/x.ts', "import { x } from '../../apps/harness-server/src/lab/readings.ts'"],
  [
    'benchmarks/src/x.ts',
    "const x = await import('../../packages/storage/sqlite-provider/src/readings.ts')",
  ],
  [
    'benchmarks/tests/x.spec.ts',
    "import { x } from '../../apps/harness-server/tests/r9/support.ts'",
  ],
  ['benchmarks/src/x.ts', "export * from '@omne-harness/harness-server'"],
  ['tools/perf-harness/src/x.ts', "import { SUITES } from '../../../benchmarks/src/suites.ts'"],
  ['tools/perf-harness/src/x.ts', "import { x } from '@omne-harness/sql-contract'"],
  ['tools/perf-harness/src/x.ts', "import { x } from '@omne-harness/benchmarks'"],
])('refuses %s to write: %s', (path, text) => {
  const found = check(path, text)
  expect(found).toHaveLength(1)
  expect(found[0]).toMatchObject({ rule: 'evaluation-not-product-source', path, line: 1 })
})

test('follows where a specifier really resolves, not how it is spelled', () => {
  const found = check('benchmarks/src/x.ts', "import { x } from './local.ts'", {
    './local.ts': 'packages/session/session/src/index.ts',
  })
  expect(found).toHaveLength(1)
  expect(found[0]?.message).toContain('packages/session/session/src/index.ts')
})
