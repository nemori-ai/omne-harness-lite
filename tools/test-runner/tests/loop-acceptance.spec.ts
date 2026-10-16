// 验收耗时传感器：没有成员有验收是「0 份」的数据；有验收却找不到这个提交跑全了的记录是没数据；
// 只认全量的验收运行，或带 scope、写明计划跳过了谁的按计划运行；取最新的一次，实测优先于「跳过」；没出报告的成员按一份计。
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acceptanceMeasured } from '@omne-harness/repo-toolchain/loop/run'
import {
  acceptanceRun,
  readAcceptanceTiming,
  timingOf,
} from '@omne-harness/repo-toolchain/loop/sensors/acceptance'
import type { Coordinates } from '@omne-harness/repo-toolchain/core/git'
import { planCheck } from '../src/testing/scope.ts'
import type { LedgerFile } from '../src/testing/ledger.ts'
import { recordSkippedAcceptance } from '../src/testing/steps.ts'
import {
  removeTemporaries,
  temporaryDirectory,
} from '../../repo-toolchain/tests/fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const put = (root: string, path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

const ledger = (overrides: Partial<LedgerFile['meta']> = {}, seconds = 12): LedgerFile => ({
  meta: {
    script: 'acceptance',
    tier: 'all',
    head: 'a'.repeat(40),
    branch: 'main',
    dirty: false,
    base: null,
    startedAt: '2026-10-02T00:00:00.000Z',
    parallel: { memberConcurrency: 2, vitestMaxWorkers: 4 },
    cores: 8,
    plan: null,
    members: ['apps/cli'],
    wallSeconds: seconds + 1,
    ...overrides,
  },
  members: [
    {
      member: 'apps/cli',
      exitCode: 0,
      wallSeconds: seconds,
      files: 1,
      tests: 6,
      skipped: 0,
      failed: 0,
      fileSeconds: seconds,
    },
  ],
  files: [
    {
      member: 'apps/cli',
      file: 'apps/cli/acceptance/PF-016.a.acceptance.ts',
      seconds,
      tests: 6,
      slowTests: 0,
      fastSeconds: seconds,
      longestSeconds: seconds,
    },
  ],
  nearTimeout: [],
  fastOverBudget: [],
  failures: [],
})

/** 一个带工作区清单的检出；`accepting` 为真时 apps/cli 有 acceptance 脚本。 */
function checkout(accepting: boolean): { root: string; ledgers: string } {
  const root = temporaryDirectory('acceptance-sensor-')
  put(root, 'pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n")
  put(
    root,
    'apps/cli/package.json',
    JSON.stringify({
      name: '@x/cli',
      scripts: { test: 'vitest run', ...(accepting ? { acceptance: 'vitest run' } : {}) },
    }),
  )
  return { root, ledgers: temporaryDirectory('acceptance-ledgers-') }
}

const read = (root: string, ledgers: string, dirty = false) =>
  readAcceptanceTiming({
    root,
    mainRoot: root,
    shortHead: 'abc123456',
    dirty,
    env: { OMNE_ACCEPTANCE_LEDGER_HOME: ledgers },
    excludeRoots: ['examples'],
  })

describe('验收耗时传感器', () => {
  it('没有工作区清单、或没有成员有 acceptance 脚本：读数是 0 份，算有数据', () => {
    const bare = temporaryDirectory('acceptance-sensor-')
    expect(read(bare, bare)).toEqual({
      status: 'data',
      data: { members: 0, files: 0, totalSeconds: 0 },
    })
    const { root, ledgers } = checkout(false)
    expect(read(root, ledgers)).toEqual({
      status: 'data',
      data: { members: 0, files: 0, totalSeconds: 0 },
    })
  })

  it('有验收却没有这个提交的记录：没数据，原因指到 make acceptance', () => {
    const { root, ledgers } = checkout(true)
    put(ledgers, 'other0000/20261002-000000/ledger.json', JSON.stringify(ledger()))
    const reading = read(root, ledgers)
    expect(reading.status).toBe('no-data')
    expect(reading.status === 'no-data' ? reading.reason : '').toMatch(
      /^有 1 个成员有验收，这个提交（abc123456）却没有跑全它们的耗时记录（.*）：先跑 make acceptance$/u,
    )
  })

  it('只认全量的验收运行、且跑全了现在有验收的成员；取最新的一次', () => {
    const { root, ledgers } = checkout(true)
    const cell = 'abc123456'
    put(ledgers, `${cell}/20261002-010000/ledger.json`, JSON.stringify(ledger({}, 30)))
    put(ledgers, `${cell}/20261002-020000/ledger.json`, JSON.stringify(ledger({}, 12)))
    put(
      ledgers,
      `${cell}/20261002-030000/ledger.json`,
      JSON.stringify(ledger({ script: 'test' }, 99)),
    )
    put(
      ledgers,
      `${cell}/20261002-040000/ledger.json`,
      JSON.stringify(ledger({ base: { ref: 'main', mergeBase: 'b'.repeat(40) } }, 98)),
    )
    put(ledgers, `${cell}/20261002-050000/ledger.json`, JSON.stringify(ledger({ members: [] }, 97)))
    put(ledgers, `${cell}/20261002-060000/ledger.json`, '{ 写了一半')
    expect(read(root, ledgers)).toEqual({
      status: 'data',
      data: {
        members: 1,
        files: 1,
        totalSeconds: 13,
        slowest: { path: 'apps/cli/acceptance/PF-016.a.acceptance.ts', seconds: 12 },
        ledger: {
          path: join(ledgers, cell, '20261002-020000', 'ledger.json'),
          startedAt: '2026-10-02T00:00:00.000Z',
        },
      },
    })
  })

  it('工作树不干净时读带 -dirty 的那一格', () => {
    const { root, ledgers } = checkout(true)
    put(ledgers, 'abc123456/20261002-010000/ledger.json', JSON.stringify(ledger()))
    expect(read(root, ledgers, true).status).toBe('no-data')
    put(ledgers, 'abc123456-dirty/20261002-010000/ledger.json', JSON.stringify(ledger()))
    expect(read(root, ledgers, true).status).toBe('data')
  })

  it('没出报告的成员只有成员一级的耗时，按一份计', () => {
    const run = acceptanceRun({
      ...ledger(),
      files: [],
      members: [{ ...ledger().members[0], wallSeconds: 41 }],
    })
    expect(run === undefined ? undefined : timingOf(run, 1, '/l')).toMatchObject({
      files: 1,
      slowest: { path: 'apps/cli', seconds: 41 },
    })
  })

  const BASE = { ref: 'main', mergeBase: 'b'.repeat(40) }
  const skipLedger = (skipped: string[] = ['apps/cli']): LedgerFile => ({
    ...ledger({
      base: BASE,
      members: [],
      scope: { reason: '本次影响面不含带验收的成员', skipped },
    }),
    members: [],
    files: [],
  })

  it('按计划跳过的记录：交代了全部有验收的成员才认；读数带上跳过，耗时指标没数据而不是 0 秒', () => {
    const { root, ledgers } = checkout(true)
    put(ledgers, 'abc123456/20261002-010000-skipped/ledger.json', JSON.stringify(skipLedger([])))
    expect(read(root, ledgers).status).toBe('no-data')
    put(ledgers, 'abc123456/20261002-020000-skipped/ledger.json', JSON.stringify(skipLedger()))
    const reading = read(root, ledgers)
    expect(reading).toMatchObject({
      status: 'data',
      data: {
        members: 1,
        files: 0,
        skipped: { members: ['apps/cli'], reason: '本次影响面不含带验收的成员' },
      },
    })
    const seconds = acceptanceMeasured(reading, timing => timing.totalSeconds)
    expect(seconds.status).toBe('no-data')
    expect(seconds.status === 'no-data' ? seconds.reason : '').toContain(
      '这个提交的验收被跳过：本次影响面不含带验收的成员（apps/cli；',
    )
  })

  it('带基线却没有 scope 的运行（受影响范围的运行）不认；scope 形状不对也不认', () => {
    expect(acceptanceRun(ledger({ base: BASE }))).toBeUndefined()
    expect(
      acceptanceRun({
        ...ledger({ base: BASE }),
        meta: { ...ledger().meta, scope: { reason: 1 } },
      }),
    ).toBeUndefined()
  })

  it('同一个提交上既有实测又有更新的跳过记录：读数取实测，耗时指标照常有值', () => {
    const { root, ledgers } = checkout(true)
    put(ledgers, 'abc123456/20261002-010000/ledger.json', JSON.stringify(ledger({}, 12)))
    put(ledgers, 'abc123456/20261002-020000-skipped/ledger.json', JSON.stringify(skipLedger()))
    const reading = read(root, ledgers)
    expect(reading).toMatchObject({ status: 'data', data: { files: 1, totalSeconds: 13 } })
    expect(reading.status === 'data' ? reading.data.skipped : 'x').toBeUndefined()
    expect(acceptanceMeasured(reading, timing => timing.totalSeconds)).toEqual({
      status: 'data',
      data: 13,
    })
  })

  it('make check 的验收一步跳过时写下的账本，传感器认得', () => {
    const { root, ledgers } = checkout(true)
    const at: Coordinates = {
      root,
      mainRoot: root,
      head: 'c'.repeat(40),
      shortHead: 'abc123456',
      branch: 'x',
      dirty: true,
    }
    const plan = planCheck(
      [],
      [],
      {
        excludeRoots: [],
        globalPaths: [],
        readers: [],
        memberDocuments: [],
        pythonPaths: [],
        residentPaths: [],
        residentBuild: [],
      },
      new Set(),
    )
    const path = recordSkippedAcceptance(at, { OMNE_ACCEPTANCE_LEDGER_HOME: ledgers }, plan, BASE, [
      'apps/cli',
    ])
    expect(path.startsWith(join(ledgers, 'abc123456-dirty'))).toBe(true)
    expect(read(root, ledgers, true)).toMatchObject({
      status: 'data',
      data: { files: 0, skipped: { members: ['apps/cli'] }, ledger: { path } },
    })
  })
})
