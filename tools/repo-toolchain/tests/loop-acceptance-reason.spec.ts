import { afterEach, expect, it } from 'vitest'
import { readAcceptanceTiming } from '../src/loop/sensors/acceptance.ts'
import {
  removeTemporaries,
  temporaryDirectory,
  write as put,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

it('有验收却没有这个提交的记录：没数据，原因指到跑验收的入口', () => {
  const root = temporaryDirectory('acceptance-reason-')
  const ledgers = temporaryDirectory('acceptance-reason-ledgers-')
  put(root, 'pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n")
  put(
    root,
    'apps/cli/package.json',
    JSON.stringify({ name: '@x/cli', scripts: { test: 'vitest run', acceptance: 'vitest run' } }),
  )
  put(ledgers, 'other0000/20261002-000000/ledger.json', '{}')
  const reading = readAcceptanceTiming({
    root,
    mainRoot: root,
    shortHead: 'abc123456',
    dirty: false,
    env: { OMNE_ACCEPTANCE_LEDGER_HOME: ledgers },
    excludeRoots: ['examples'],
  })
  expect(reading.status).toBe('no-data')
  expect(reading.status === 'no-data' ? reading.reason : '').toMatch(
    /^有 1 个成员有验收，这个提交（abc123456）却没有跑全它们的耗时记录（.*）：先跑 pnpm run acceptance$/u,
  )
})
