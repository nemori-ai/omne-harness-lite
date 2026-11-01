// @module-tag slow
// 慢：每个用例启动 dist/bin.js 子进程，并装载 45 行替身树。
// S0 进程级验收（s0-spec-r2 §7、§8、§10）。慢层：直接启动 dist/bin.js，用绝对 fixture 路径，
// 断言退出码与 stdout JSON 记录，不经 POSIX shell。S0-7 与 G-3 的装载前拒绝用同进程 runS0，因为
// 替身清单与可见表是代码事实，CLI 不暴露它们。
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runS0, type S0Record } from '../src/run.ts'
import { rowIds } from '../src/s0/rows.ts'
import { rowManifests } from '../src/s0/stubs.ts'
import type { RowId, RowManifest } from '../src/types.ts'

const memberDir = fileURLToPath(new URL('..', import.meta.url))
const bin = join(memberDir, 'dist', 'bin.js')
const distributionPath = join(memberDir, 'config', 's0.distribution.json')
const fixture = JSON.parse(
  readFileSync(join(memberDir, 'tests', 'fixtures', 'process', 's0.json'), 'utf8'),
) as { operators: Record<string, unknown> }

type Row = { id: string; plugin: string; config: unknown }
type Distribution = { rows: Row[] }
type Rec = { kind: string } & Record<string, any>

const baseDistribution = JSON.parse(readFileSync(distributionPath, 'utf8')) as Distribution
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 's0-process-')))
let counter = 0
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
beforeAll(() => {
  expect(baseDistribution.rows.map(row => row.id)).toEqual(rowIds)
})

function writeJson(value: unknown): string {
  const path = join(scratch, `input-${++counter}.json`)
  writeFileSync(path, JSON.stringify(value))
  return path
}

type Outcome = { code: number | null; stdout: string; stderr: string; records: Rec[] }

function runBin(args: readonly string[]): Promise<Outcome> {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [bin, ...args],
      { env: { ...process.env, NO_COLOR: '1' }, timeout: 60_000 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null
        const records = stdout
          .split('\n')
          .filter(line => line.length > 0)
          .map(line => JSON.parse(line) as Rec)
        resolve({ code, stdout, stderr, records })
      },
    )
  })
}

function runS0Process(
  distribution: unknown,
  options: { operator?: unknown; readinessMs?: number; shutdownMs?: number } = {},
): Promise<Outcome> {
  const args = [
    's0',
    '--distribution',
    typeof distribution === 'string' ? distribution : writeJson(distribution),
    '--readiness-timeout-ms',
    String(options.readinessMs ?? 5000),
    '--shutdown-deadline-ms',
    String(options.shutdownMs ?? 2000),
  ]
  if (options.operator !== undefined) args.push('--operator', writeJson(options.operator))
  return runBin(args)
}

const of = (out: Outcome, kind: string) => out.records.filter(r => r.kind === kind)
const startup = (out: Outcome) => of(out, 'startup-result')[0]!
const states = (out: Outcome) => new Map(of(out, 'row-state').map(r => [r['id'] as string, r]))

function withConfig(id: string, config: unknown, base: Distribution = baseDistribution) {
  return { rows: base.rows.map(row => (row.id === id ? { ...row, config } : row)) }
}
function withoutRow(id: string): Distribution {
  return { rows: baseDistribution.rows.filter(row => row.id !== id) }
}

const phased = [...rowManifests].filter(([, m]) => m.phase !== null).map(([id]) => id)

/** 按 stubs.ts 的清单算：哪些行永远得不到全部 inject。入口对象是没有任何行提供的名。 */
function pendingClosure(enabled: readonly string[]) {
  const providedByRows = new Set([...rowManifests.values()].flatMap(m => m.provides))
  const entryNames = new Set(
    [...rowManifests.values()].flatMap(m => m.injects).filter(n => !providedByRows.has(n)),
  )
  const active = new Set<string>()
  const available = new Set(entryNames)
  for (let changed = true; changed;) {
    changed = false
    for (const id of enabled) {
      const manifest = rowManifests.get(id as RowId)!
      if (active.has(id) || !manifest.injects.every(n => available.has(n))) continue
      active.add(id)
      manifest.provides.forEach(n => available.add(n))
      changed = true
    }
  }
  return enabled.filter(id => !active.has(id))
}

describe('S0-1 完整发行替身树', () => {
  it('行序与快照一致，全部 ACTIVE，barrier 一次，每个 start 一次，退出 0', async () => {
    const out = await runS0Process(distributionPath)
    expect(out.code).toBe(0)
    expect(of(out, 'tree').map(r => r['id'])).toEqual(rowIds)
    expect(of(out, 'row-state').map(r => r['id'])).toEqual(rowIds)
    expect(of(out, 'row-state').every(r => r['state'] === 'ACTIVE')).toBe(true)
    const result = startup(out)
    expect(result).toMatchObject({
      profile: 's0',
      scope: 'loader-only',
      accepting: false,
      enabledRows: rowIds.length,
      outcome: 'ready',
      barrierCalls: 1,
    })
    expect([...result['startedRows']].sort()).toEqual([...phased].sort())
    // R-2：阶段间启动次序是关闭次序的逆序 storage → composition → business → entry。
    const rank = ['storage', 'composition', 'business', 'entry']
    const phaseOf = (id: string) => rank.indexOf(rowManifests.get(id as RowId)!.phase!)
    const ranks = (result['startedRows'] as string[]).map(phaseOf)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(new Set(ranks).size).toBe(rank.length)
    expect(of(out, 'shutdown-result')[0]).toMatchObject({ overall: 'settled' })
  })
})

describe('S0-2 缺 storage', () => {
  const check = (out: Outcome) => {
    expect(out.code).toBe(4)
    const s = states(out)
    const pending = pendingClosure(rowIds.filter(id => id !== 'storage'))
    for (const id of ['identity', 'session-storage', 'agent-journal']) {
      expect(s.get(id)).toMatchObject({ state: 'PENDING' })
      expect(s.get(id)!['missing']).toContain('s0.storage')
    }
    const pendingNow = [...s.values()].filter(r => r['state'] === 'PENDING').map(r => r['id'])
    expect(pendingNow.sort()).toEqual([...pending].sort())
    const lost = new Set(
      [...rowManifests]
        .filter(([id]) => id === 'storage' || pending.includes(id))
        .flatMap(([, m]) => m.provides),
    )
    for (const id of pending) {
      const row = s.get(id)!
      expect(row['missing'].length).toBeGreaterThan(0)
      for (const name of row['missing']) expect(lost.has(name)).toBe(true)
    }
    expect([...s.values()].some(r => r['state'] === 'FAILED')).toBe(false)
    const result = startup(out)
    expect(result['barrierCalls']).toBe(0)
    expect(result['startedRows']).toEqual([])
    expect(result['outcome']).toBe('pending')
    for (const id of pending) expect(result['appliedRows']).not.toContain(id)
  }

  it('S0-2 删除 storage 行', async () => {
    check(await runS0Process(withoutRow('storage')))
  })

  it('S0-2b 运维停用 storage：同样的阻塞，最终树打印停用与 operator 来源', async () => {
    const out = await runS0Process(distributionPath, {
      operator: fixture.operators['disableStorage'],
    })
    check(out)
    const disabled = of(out, 'tree').find(r => r['id'] === 'storage')
    expect(disabled).toMatchObject({ disabled: true, source: 'operator' })
  })
})

describe('S0-3 插件失败', () => {
  it('无缺项的行 FAILED，依赖方 PENDING，两类都报告，barrier 零次，退出 3', async () => {
    const out = await runS0Process(withConfig('model-profiles', { failOnApply: 'boom-tag' }))
    expect(out.code).toBe(3)
    const s = states(out)
    expect(s.get('model-profiles')).toMatchObject({ state: 'FAILED', error: { tag: 'boom-tag' } })
    expect(s.get('agent-model-selection')).toMatchObject({ state: 'PENDING' })
    expect(s.get('agent-model-selection')!['blockedBy']).toContain('model-profiles')
    expect(startup(out)).toMatchObject({ outcome: 'failed', barrierCalls: 0, startedRows: [] })
  })
})

describe('S0-4 配置失败', () => {
  it('行对象含未知键：装载前退出 2，没有任何行状态', async () => {
    const rows = baseDistribution.rows.map(row =>
      row.id === 'identity' ? { ...row, surprise: true } : row,
    )
    const out = await runS0Process({ rows })
    expect(out.code).toBe(2)
    expect(of(out, 'row-state')).toEqual([])
    expect(of(out, 'startup-result')).toEqual([])
  })

  it('插件自身 schema 拒绝的值：该行 FAILED，退出 3', async () => {
    const out = await runS0Process(withConfig('model-profiles', { failOnApply: 7 }))
    expect(out.code).toBe(3)
    expect(states(out).get('model-profiles')).toMatchObject({ state: 'FAILED' })
  })
})

describe('S0-5 运维目标错误', () => {
  it.each([
    ['unknownReplace', 'replace'],
    ['unknownDisable', 'disable'],
    ['unknownInsertAnchor', 'insert'],
    ['duplicateInsert', 'insert'],
  ])('%s：退出 2，诊断写明操作，零个插件体运行', async (name, kind) => {
    const out = await runS0Process(distributionPath, { operator: fixture.operators[name] })
    expect(out.code).toBe(2)
    expect(out.stderr).toContain(kind)
    expect(of(out, 'startup-result')).toEqual([])
    expect(of(out, 'row-state')).toEqual([])
  })

  it('发行层重复行 id：退出 2', async () => {
    const out = await runS0Process({ rows: [...baseDistribution.rows, baseDistribution.rows[0]] })
    expect(out.code).toBe(2)
    expect(out.stderr).toContain('duplicate')
  })
})

describe('S0-6 层叠', () => {
  it('替换、停用、插入后的顺序、配置与来源；插入行可见集合为空', async () => {
    const out = await runS0Process(distributionPath, { operator: fixture.operators['layering'] })
    expect(out.code).toBe(0)
    const expected: string[] = rowIds.filter(id => id !== 'model-credential')
    expected.splice(expected.indexOf('model-profiles') + 1, 0, 'extra-stub')
    const rows = of(out, 'tree').filter(r => r['disabled'] !== true)
    expect(rows.map(r => r['id'])).toEqual(expected)
    expect(of(out, 'tree').filter(r => r['disabled'] === true)).toMatchObject([
      { id: 'model-credential', source: 'operator' },
    ])
    const byId = new Map(rows.map(r => [r['id'], r]))
    expect(byId.get('model-profiles')).toMatchObject({
      source: 'operator',
      configSource: 'operator',
    })
    expect(byId.get('extra-stub')).toMatchObject({ source: 'operator', visible: [] })
    expect(byId.get('storage')).toMatchObject({
      source: 'distribution',
      configSource: 'distribution',
    })
    for (const r of rows) {
      expect(r).toMatchObject({
        plugin: 'stubPlugin',
        visibleSource: 'release-code',
        implementation: 's0-double',
      })
    }
    expect(states(out).size).toBe(expected.length)
  })
})

describe('S0-7 恢复', () => {
  it('同一进程起新根，结果恢复，旧根撤除，不遗留定时器', async () => {
    const run = async () => {
      const records: S0Record[] = []
      const result = await runS0({
        distribution: baseDistribution,
        readinessTimeoutMs: 5000,
        shutdownDeadlineMs: 2000,
        write: r => records.push(r),
        stderr: () => {},
      })
      return { result, records }
    }
    const timers = () => process.getActiveResourcesInfo().filter(r => r === 'Timeout').length
    const before = timers()
    const first = await run()
    const second = await run()
    expect(first.result.exitCode).toBe(0)
    expect(second.result).toEqual(first.result)
    const rowStates = (rs: S0Record[]) => rs.filter(r => r['kind'] === 'row-state')
    expect(rowStates(second.records)).toEqual(rowStates(first.records))
    expect(rowStates(second.records)).toHaveLength(rowIds.length)
    expect(timers()).toBeLessThanOrEqual(before)
  })
})

describe('G 启动门控', () => {
  it('G-1 构造检查在启动时以 FAILED 可见', async () => {
    const out = await runS0Process(
      withConfig('agent-host', { constructionCheck: 'joint-commits-mismatch' }),
    )
    expect(out.code).toBe(3)
    expect(states(out).get('agent-host')).toMatchObject({
      state: 'FAILED',
      error: { tag: 'joint-commits-mismatch' },
    })
    expect(startup(out)['barrierCalls']).toBe(0)
    expect(startup(out)['startedRows']).toEqual([])
  })

  const mappingRun = (selection: string) => {
    const base = withConfig('agent-adoptions', { mappingIds: ['map-a', 'map-b'] })
    return runS0Process(
      withConfig(
        'server-entry',
        {
          expectIn: {
            service: 's0.definitionMappings',
            field: 'mappingIds',
            value: selection,
            tag: 'mapping-selection-unknown',
          },
        },
        base,
      ),
    )
  }

  it('G-2 映射选择不在映射列表：server-entry 启动时 FAILED', async () => {
    const out = await mappingRun('map-zzz')
    expect(out.code).toBe(3)
    expect(states(out).get('server-entry')).toMatchObject({
      state: 'FAILED',
      error: { tag: 'mapping-selection-unknown' },
    })
  })

  it('G-2 对照：选择在列表中则退出 0', async () => {
    expect((await mappingRun('map-b')).code).toBe(0)
  })

  it('G-3 T-05：运维插入行 inject 不可见的受信名 → 退出 2，零个插件体运行', async () => {
    const manifests = new Map<RowId, RowManifest>(rowManifests)
    manifests.set('intruder' as RowId, {
      provides: [],
      injects: ['s0.storage'],
      phase: null,
      sameProviderGroup: null,
    })
    const records: S0Record[] = []
    const result = await runS0({
      distribution: baseDistribution,
      operator: fixture.operators['intruder'],
      manifests,
      visibility: new Map([['storage' as RowId, ['s0.storage']]]),
      readinessTimeoutMs: 1000,
      shutdownDeadlineMs: 1000,
      write: r => records.push(r),
      stderr: () => {},
    })
    expect(result).toMatchObject({ exitCode: 2, appliedRows: [] })
    expect(records.filter(r => r['kind'] === 'row-state')).toEqual([])
  })

  it('G-3 T-08：同提供者组的名由两行提供 → 退出 2', async () => {
    const manifests = new Map<RowId, RowManifest>(rowManifests)
    const journal = manifests.get('agent-journal' as RowId)!
    manifests.set('agent-journal' as RowId, {
      ...journal,
      provides: ['s0.agentJournal'],
      sameProviderGroup: 'agent-journal',
    })
    manifests.set('agent-materials' as RowId, {
      provides: ['s0.agentJournalEntries'],
      injects: [],
      phase: null,
      sameProviderGroup: 'agent-journal',
    })
    const result = await runS0({
      distribution: {
        rows: [
          ...baseDistribution.rows,
          { id: 'agent-materials', plugin: 'stubPlugin', config: {} },
        ],
      },
      manifests,
      readinessTimeoutMs: 1000,
      shutdownDeadlineMs: 1000,
      write: () => {},
      stderr: () => {},
    })
    expect(result).toMatchObject({ exitCode: 2, appliedRows: [] })
  })
})

describe('关闭', () => {
  it('启动期某个 start 抛出：退出 3，startup-result 为 start-failed，整套有序关闭，该句柄 failed', async () => {
    const out = await runS0Process(withConfig('agent-host', { startBehavior: 'fail' }))
    expect(out.code).toBe(3)
    expect(startup(out)).toMatchObject({
      outcome: 'start-failed',
      startFailure: { row: 'agent-host' },
    })
    const steps = of(out, 'shutdown-step').filter(r => r['action'] === 'stop-call')
    expect(steps.length).toBe(phased.length)
    const closing = ['entry', 'business', 'composition', 'storage']
    const order = steps.map(r => closing.indexOf(r['phase']))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(of(out, 'shutdown-step').some(r => r['action'] === 'dispose-root')).toBe(true)
    const report = of(out, 'shutdown-result')[0]!
    expect(report['outcomes']).toContainEqual(
      expect.objectContaining({
        row: 'agent-host',
        result: expect.objectContaining({ kind: 'failed' }),
      }),
    )
    expect(out.stderr).not.toContain('internal error')
  })

  it('替身 stopBehavior hang：退出 5，shutdown-result 为 incomplete，进程自然退出', async () => {
    const out = await runS0Process(withConfig('agent-host', { stopBehavior: 'hang' }), {
      shutdownMs: 300,
    })
    expect(out.code).toBe(5)
    const report = of(out, 'shutdown-result')[0]!
    expect(report['overall']).toBe('incomplete')
    expect(report['outcomes']).toContainEqual(
      expect.objectContaining({
        row: 'agent-host',
        result: expect.objectContaining({ kind: 'incomplete' }),
      }),
    )
    expect(of(out, 'shutdown-step').length).toBeGreaterThan(0)
  })

  it('启动码非零时取启动码，FAILED 之后关闭仍执行', async () => {
    const out = await runS0Process(withConfig('model-profiles', { failOnApply: 'x' }))
    expect(out.code).toBe(3)
    expect(of(out, 'shutdown-result')).toHaveLength(1)
  })
})

describe('命令行', () => {
  const tail = ['--readiness-timeout-ms', '10', '--shutdown-deadline-ms', '10']
  it.each([
    ['无子命令', []],
    ['缺 distribution', ['s0', ...tail]],
    ['相对路径', ['s0', '--distribution', 'x.json', ...tail]],
    ['不存在的文件', ['s0', '--distribution', join(scratch, 'none.json'), ...tail]],
    [
      '非正整数',
      ['s0', '--distribution', distributionPath, '--readiness-timeout-ms', '0', tail[2]!, '10'],
    ],
  ])('%s：退出 2', async (_name, args) => {
    const out = await runBin(args)
    expect(out.code).toBe(2)
    expect(out.stdout).toBe('')
  })

  it('不是 JSON 的发行文件：退出 2', async () => {
    const path = join(scratch, 'bad.json')
    writeFileSync(path, '{ nope')
    expect((await runS0Process(path)).code).toBe(2)
  })
})
