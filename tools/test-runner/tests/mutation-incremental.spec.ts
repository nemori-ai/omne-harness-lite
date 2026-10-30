// 增量的纯函数部分（incremental.ts）：快照放在哪、怎样关、读不出时按没有快照处理、交给 Stryker 的只有上次被杀的、
// 去掉 Stryker 带回来的范围外变异体、补回复用的 static 变异体的运行记录。真起 Stryker 的见 mutation-stryker-incremental.spec.ts。
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { TestMember } from '@omne-harness/repo-toolchain/core/workspace'
import {
  branchDirectory,
  dropCarriedOver,
  inScope,
  incrementalMode,
  nextStore,
  readStore,
  reusedCount,
  seedReport,
  storeFingerprint,
  storePath,
  withCarriedRuns,
  writeStore,
  type Store,
} from '../src/mutation/incremental.ts'
import type { MutationReport, ReportMutant } from '../src/mutation/report.ts'
import type { RunRecord } from '../src/mutation/run-reporter.ts'
import type { MutationTarget } from '../src/mutation/scope.ts'
import { temporary } from './fixtures/mutation.ts'

const MEMBER: TestMember = {
  path: 'packages/core/alpha',
  name: '@x/alpha',
  script: 'vitest run',
  dependencies: [],
}
/** a.ts 变异第 3～4 行，b.ts 整份变异。 */
const TARGET: MutationTarget = {
  member: MEMBER,
  lines: new Map([
    ['packages/core/alpha/src/a.ts', [[3, 4]] as const],
    ['packages/core/alpha/src/b.ts', [[1, Number.POSITIVE_INFINITY]] as const],
  ]),
}

const mutant = (
  id: string,
  line: number,
  status: ReportMutant['status'],
  extra: Partial<ReportMutant> = {},
): ReportMutant => ({
  id,
  mutatorName: 'ConditionalExpression',
  replacement: `r${id}`,
  status,
  location: { start: { line, column: 1 }, end: { line, column: 5 } },
  ...extra,
})

describe('快照的位置与开关', () => {
  it('分支名转成一层目录：斜杠与 Windows 不认的字符编码，. 与 .. 另起名字', () => {
    expect(branchDirectory('PanQiWei/cl-mutation')).toBe('PanQiWei%2Fcl-mutation')
    expect(branchDirectory('a\\b:c*d?e"f<g>h|i')).not.toMatch(/[\\/:*?"<>|]/u)
    expect(branchDirectory('..')).toBe('%..')
    expect(branchDirectory('a/b')).not.toBe(branchDirectory('a_b'))
  })

  it('缺省放在主检出的 tmp/mutation-incremental/<分支>/；参数或环境变量关掉；环境变量可改根目录', () => {
    const base = { disabled: false, force: false, mainRoot: '/main', branch: 'u/x', env: {} }
    expect(incrementalMode(base)).toEqual({
      kind: 'on',
      dir: join('/main', 'tmp', 'mutation-incremental', 'u%2Fx'),
      force: false,
    })
    expect(incrementalMode({ ...base, disabled: true })).toEqual({ kind: 'off' })
    expect(incrementalMode({ ...base, env: { OMNE_MUTATION_INCREMENTAL: '0' } })).toEqual({
      kind: 'off',
    })
    expect(incrementalMode({ ...base, env: { OMNE_MUTATION_INCREMENTAL: '1' } }).kind).toBe('on')
    expect(
      incrementalMode({ ...base, force: true, env: { OMNE_MUTATION_INCREMENTAL_HOME: '/h' } }),
    ).toEqual({ kind: 'on', dir: join('/h', 'u%2Fx'), force: true })
    expect(storePath('/s', 'packages/core/alpha')).toBe(join('/s', 'packages__core__alpha.json'))
  })

  it('指纹随用例时限变', () => {
    expect(storeFingerprint(60)).toBe(storeFingerprint(60))
    expect(storeFingerprint(60)).not.toBe(storeFingerprint(61))
  })
})

const STORE: Store = {
  report: {
    schemaVersion: '1.0',
    files: {
      'src/a.ts': {
        language: 'typescript',
        source: 'a',
        mutants: [
          mutant('1', 3, 'Killed', { killedBy: ['0'] } as Partial<ReportMutant>),
          mutant('2', 3, 'Survived'),
          mutant('3', 4, 'Timeout'),
          mutant('4', 4, 'RuntimeError'),
          mutant('5', 4, 'NoCoverage'),
        ],
      },
      'src/gone.ts': { language: 'typescript', source: 'g', mutants: [mutant('6', 1, 'Killed')] },
    },
    testFiles: { 'tests/a.spec.ts': { source: 't', tests: [{ id: '0', name: 'a' }] } },
  },
  meta: { fingerprint: 'f', seconds: 12, mutants: 5, staticRuns: {} },
}

describe('读快照', () => {
  it('写了再读回来；没有、读不出、形状不对、指纹对不上都按没有快照处理并给出原因', () => {
    const dir = temporary('mutation-store-')
    const path = storePath(dir, MEMBER.path)
    expect(readStore(path, 'f')).toEqual({ miss: '没有快照' })
    expect(writeStore(path, STORE)).toBeUndefined()
    expect(readStore(path, 'f')).toEqual({ store: STORE })
    expect(readStore(path, 'other')).toEqual({ miss: expect.stringContaining('版本') })
    writeFileSync(path, '{ not json')
    expect(readStore(path, 'f')).toEqual({ miss: expect.stringContaining('读不出') })
    writeFileSync(path, JSON.stringify({ files: {}, omne: { fingerprint: 'f' } }))
    expect(readStore(path, 'f')).toEqual({ miss: '快照形状不对' })
  })

  it('写不进去时返回原因，不抛，也不留半份', () => {
    const dir = temporary('mutation-store-')
    // 目标路径是一个目录：改名失败。
    const path = join(dir, 'blocked.json')
    mkdirSync(path)
    expect(writeStore(path, STORE)).toEqual(expect.any(String))
    expect(readdirSync(dir)).toEqual(['blocked.json'])
  })
})

describe('交给 Stryker 的 incremental 文件', () => {
  it('只给这次要变异的文件里上次被杀的变异体，测试文件原样给', () => {
    const seed = seedReport(TARGET, STORE) as {
      files: Record<string, { mutants: ReportMutant[] }>
      testFiles: unknown
    }
    expect(Object.keys(seed.files)).toEqual(['src/a.ts'])
    expect(seed.files['src/a.ts']?.mutants.map(m => m.id)).toEqual(['1'])
    expect(seed.files['src/a.ts']?.mutants[0]).toMatchObject({ killedBy: ['0'] })
    expect(seed.testFiles).toEqual(STORE.report['testFiles'])
    expect(seed).not.toHaveProperty('omne')
  })

  it('范围与 Stryker 一样：整个变异体在要变异的某一段行里，整份变异的文件全算', () => {
    expect(inScope(TARGET, 'src/a.ts', mutant('1', 3, 'Killed'))).toBe(true)
    expect(inScope(TARGET, 'src/a.ts', mutant('1', 4, 'Killed'))).toBe(true)
    expect(inScope(TARGET, 'src/a.ts', mutant('1', 5, 'Killed'))).toBe(false)
    expect(inScope(TARGET, 'src/a.ts', mutant('1', 2, 'Killed'))).toBe(false)
    // 跨出范围的不算：Stryker 不为它生成变异体。
    expect(
      inScope(TARGET, 'src/a.ts', {
        ...mutant('1', 4, 'Killed'),
        location: { start: { line: 4, column: 1 }, end: { line: 5, column: 2 } },
      }),
    ).toBe(false)
    expect(inScope(TARGET, 'src/b.ts', mutant('1', 999, 'Killed'))).toBe(true)
    expect(inScope(TARGET, 'src/c.ts', mutant('1', 1, 'Killed'))).toBe(false)
  })

  it('去掉 Stryker 带回来的范围外变异体，这次生成的一个不少', () => {
    const report: MutationReport = {
      files: {
        'src/a.ts': {
          source: 'a',
          mutants: [mutant('1', 3, 'Killed'), mutant('src/a.ts@9:1-9:5', 9, 'Killed')],
        },
        'src/c.ts': { source: 'c', mutants: [mutant('src/c.ts@1:1-1:5', 1, 'RuntimeError')] },
      },
    }
    const kept = dropCarriedOver(TARGET, report)
    expect(kept.files['src/a.ts']?.mutants.map(m => m.id)).toEqual(['1'])
    expect(kept.files['src/c.ts']?.mutants).toEqual([])
  })
})

describe('写回快照', () => {
  it('只留落在这次范围里的被杀变异体，记下耗时、生成的变异体数与 static 变异体的运行记录', () => {
    const written = {
      ...STORE.report,
      files: {
        'src/a.ts': {
          source: 'a',
          mutants: [
            mutant('1', 3, 'Killed', { static: true }),
            mutant('2', 3, 'Survived', { static: true }),
            mutant('3', 9, 'Killed'),
          ],
        },
      },
    }
    const runs: RunRecord[] = [
      { mode: 'dry-run', typeTests: 2, typecheck: true },
      { mode: 'mutant', activeMutant: '1', typeTests: 0, typecheck: true },
      { mode: 'mutant', activeMutant: '2', typeTests: 0, typecheck: true },
    ]
    const store = nextStore(TARGET, written, runs, { fingerprint: 'f', seconds: 7 })
    const files = store.report['files'] as Record<string, { mutants: ReportMutant[] }>
    expect(files['src/a.ts']?.mutants.map(m => m.id)).toEqual(['1'])
    expect(store.meta).toMatchObject({ fingerprint: 'f', seconds: 7, mutants: 2 })
    expect(Object.values(store.meta.staticRuns)).toEqual([[runs[1]]])
  })

  it('复用的 static 变异体这次没有运行记录：按身份带回快照里的，换成这次的 id；这次跑了的不带', () => {
    const killed = mutant('1', 3, 'Killed', { static: true })
    const written = { files: { 'src/a.ts': { source: 'a', mutants: [killed] } } }
    const old: RunRecord = { mode: 'mutant', activeMutant: '1', typeTests: 0, typecheck: true }
    const store = nextStore(TARGET, written, [old], { fingerprint: 'f', seconds: 1 })
    const now: MutationReport = {
      files: { 'src/a.ts': { source: 'a', mutants: [{ ...killed, id: '17' }] } },
    }
    const dry: RunRecord = { mode: 'dry-run', typeTests: 2, typecheck: true }
    expect(withCarriedRuns(now, [dry], store)).toEqual([dry, { ...old, activeMutant: '17' }])
    const ran: RunRecord = { mode: 'mutant', activeMutant: '17', typeTests: 2, typecheck: true }
    expect(withCarriedRuns(now, [dry, ran], store)).toEqual([dry, ran])
    expect(withCarriedRuns(now, 'unreadable', store)).toBe('unreadable')
    expect(withCarriedRuns(now, [dry], undefined)).toEqual([dry])
  })
})

it('复用数取自 Stryker 的日志，颜色码不碍事；没有那一行时为 undefined', () => {
  expect(
    reusedCount(
      '\u001B[32mINFO\u001B[39m Result:\t\t\u001B[93m189\u001B[39m of 210 mutant result(s) are reused.',
    ),
  ).toBe(189)
  expect(reusedCount('No incremental result file found')).toBeUndefined()
})
