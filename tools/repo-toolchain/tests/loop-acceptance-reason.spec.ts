// 验收耗时传感器没数据时的原因文字：它指向的入口随本包发布，所以断言放在本包，与源码里的文字一起改。
// 读数的其余行为由 test-runner 的 loop-acceptance.spec.ts 在它写出的真实账本上核对。
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readAcceptanceTiming } from '../src/loop/sensors/acceptance.ts'
import { removeTemporaries, temporaryDirectory } from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const put = (root: string, path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

it('有验收却没有这个提交的记录：没数据，原因指到跑验收的入口', () => {
  const root = temporaryDirectory('acceptance-reason-')
  const ledgers = temporaryDirectory('acceptance-reason-ledgers-')
  put(root, 'pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n")
  put(
    root,
    'apps/cli/package.json',
    JSON.stringify({ name: '@x/cli', scripts: { test: 'vitest run', acceptance: 'vitest run' } }),
  )
  // 别的提交的记录不算这个提交的。
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
    /^有 1 个成员有验收，这个提交（abc123456）却没有跑全它们的耗时记录（.*）：先跑 make acceptance$/u,
  )
})
