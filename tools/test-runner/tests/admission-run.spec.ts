// 准入运行记录：写入是原子的、读回与写入相同；坏文件按「没有记录」；由步骤图运行写成记录时跑完、被终止、没开始各记成什么；
// 挑某个提交能作接续起点的最近一次记录。
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  admissionRunFrom,
  allStepsPassed,
  collectAdmissionRuns,
  latestResumeOrigin,
  parseAdmissionRun,
  readAdmissionRun,
  recordPathBesideLog,
  worktreeRoot,
  writeAdmissionRun,
  type AdmissionRun,
} from '../src/testing/admission-run.ts'
import type { CheckStep, GraphRun, StepResult } from '../src/testing/check-graph.ts'

const H1 = 'a'.repeat(40)
const H2 = 'b'.repeat(40)
const TREE = 'c'.repeat(40)

const BASE = {
  schemaVersion: 1,
  kind: 'admission-run',
  head: H1,
  tree: TREE,
  dirty: false,
  worktree: '/work/tree',
  admission: true,
  caches: { test: 'off', depGraph: 'off', mutation: 'unknown' },
  fullRequested: true,
  mode: 'full',
  base: null,
  resumeFrom: null,
  steps: [
    { name: 'check:docs', ran: true, exit: 0, seconds: 1.5 },
    { name: 'lint:oxlint', ran: true, exit: 1, seconds: 3 },
    { name: 'test', ran: false, exit: null, seconds: 12 },
  ],
  failedStep: 'lint:oxlint',
  startedAt: '2026-10-30T01:00:00.000Z',
  finishedAt: '2026-10-30T01:05:00.000Z',
} as const satisfies Record<string, unknown>

/** 夹具记录：改几栏后经解析器进门，夹具自己就得是合法记录。 */
const run = (over: Record<string, unknown> = {}): AdmissionRun => {
  const parsed = parseAdmissionRun({ ...BASE, ...over })
  if (parsed === undefined) throw new Error('夹具不是合法记录')
  return parsed
}

let dir: string
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'omne-admission-run-')))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('写入与读取', () => {
  it('写出的记录读回相同，目录里不留临时文件；再写一次覆盖旧的', () => {
    const path = join(dir, 'tmp/admission/20261030-010000-aaaaaaaaa.json')
    writeAdmissionRun(path, run())
    expect(readdirSync(join(dir, 'tmp/admission'))).toEqual(['20261030-010000-aaaaaaaaa.json'])
    expect(readAdmissionRun(path)).toEqual(run())
    writeAdmissionRun(path, run({ failedStep: null }))
    expect(readAdmissionRun(path)?.failedStep).toBeNull()
  })

  it('文件不存在、不是 JSON、形状不对都读作没有记录', () => {
    expect(readAdmissionRun(join(dir, 'missing.json'))).toBeUndefined()
    const broken = join(dir, 'broken.json')
    writeFileSync(broken, '{ "schemaVersion": 1, ')
    expect(readAdmissionRun(broken)).toBeUndefined()
    const wrong = join(dir, 'wrong.json')
    writeFileSync(wrong, JSON.stringify({ ...run(), head: 'abc' }))
    expect(readAdmissionRun(wrong)).toBeUndefined()
  })

  it.each([
    ['schemaVersion 不是 1', { schemaVersion: 2 }],
    ['kind 不对', { kind: 'check-run' }],
    ['head 不是 40 位', { head: 'abcdef' }],
    ['mode 未知', { mode: 'partial' }],
    ['resume 模式没有来源', { mode: 'resume' }],
    [
      'resume 的来源没写 H1 的范围',
      { mode: 'resume', resumeFrom: { head: H1, tree: TREE, failedStep: 'x' } },
    ],
    [
      'resume 的来源范围不认得',
      {
        mode: 'resume',
        resumeFrom: { head: H1, tree: TREE, failedStep: 'x', mode: 'resume', fullRequested: true },
      },
    ],
    [
      'resume 的来源没写 H1 带没带 FULL=1',
      { mode: 'resume', resumeFrom: { head: H1, tree: TREE, failedStep: 'x', mode: 'full' } },
    ],
    ['没写带没带 FULL=1', { fullRequested: undefined }],
    ['带没带 FULL=1 不是布尔', { fullRequested: 'yes' }],
    ['没写工作树', { worktree: undefined }],
    ['工作树是空串', { worktree: '' }],
    ['非 resume 模式带来源', { resumeFrom: { head: H1, tree: TREE, failedStep: 'x' } }],
    ['failedStep 是空串', { failedStep: '' }],
    ['没有 admission', { admission: undefined }],
    ['没有 finishedAt', { finishedAt: undefined }],
    ['caches 缺一项', { caches: { test: 'on', depGraph: 'off' } }],
    ['caches 的值不认得', { caches: { test: 'yes', depGraph: 'off', mutation: 'off' } }],
    ['步骤跑了却没有退出码', { steps: [{ name: 'a', ran: true, exit: null, seconds: 1 }] }],
    ['步骤没跑却有退出码', { steps: [{ name: 'a', ran: false, exit: 0, seconds: 1 }] }],
    ['步骤没有名字', { steps: [{ name: '', ran: true, exit: 0, seconds: 1 }] }],
  ])('%s 时不是记录', (_name, over) => {
    expect(parseAdmissionRun({ ...run(), ...over })).toBeUndefined()
  })

  it('resume 模式带完整来源时是记录', () => {
    const resumed = run({
      mode: 'resume',
      resumeFrom: {
        head: H1,
        tree: TREE,
        failedStep: 'lint:oxlint',
        mode: 'full',
        fullRequested: true,
      },
      head: H2,
    })
    expect(parseAdmissionRun(JSON.parse(JSON.stringify(resumed)))).toEqual(resumed)
  })

  it('工作树根记成真实路径：经软链（Windows 上是目录联接）到达同一棵树也相同', () => {
    const tree = join(dir, 'tree')
    mkdirSync(tree)
    const link = join(dir, 'link')
    symlinkSync(tree, link, 'junction')
    expect(worktreeRoot(link)).toBe(worktreeRoot(tree))
    expect(worktreeRoot(link)).not.toBe(worktreeRoot(dir))
  })

  it('记录放在文本准入日志旁边、同名换扩展名', () => {
    expect(recordPathBesideLog('tmp/admission/20261030-010000-aaaaaaaaa.log')).toBe(
      'tmp/admission/20261030-010000-aaaaaaaaa.json',
    )
  })
})

describe('由步骤图运行写成记录', () => {
  const step = (name: string, planned = false): CheckStep => ({
    name,
    command: ['x'],
    after: [],
    heavy: false,
    ...(planned ? { planned: true } : {}),
  })
  const result = (
    name: string,
    exitCode: number,
    startedMs: number,
    endedMs: number,
    cancelled = false,
  ): StepResult => ({ name, exitCode, startedMs, endedMs, logPath: `${name}.log`, cancelled })

  it('步骤按表的顺序；跑完的记退出码，被终止与没开始的记 ran: false；快速失败是最早结束的失败', () => {
    const graph: GraphRun = {
      results: [
        result('check:docs', 0, 0, 1000),
        result('lint:deps', 2, 0, 9000),
        result('lint:oxlint', 1, 0, 3000),
        result('test', -1, 500, 3100, true),
      ],
      skipped: ['acceptance'],
      wallMs: 9000,
    }
    const record = admissionRunFrom({
      steps: [
        step('check:docs'),
        step('lint:oxlint'),
        step('lint:deps'),
        step('test', true),
        step('acceptance', true),
      ],
      run: graph,
      head: H1,
      tree: TREE,
      dirty: false,
      worktree: '/work/tree',
      admission: true,
      caches: { test: 'off', depGraph: 'off', mutation: 'off' },
      fullRequested: true,
      base: null,
      startedAt: new Date('2026-10-30T01:00:00Z'),
      finishedAt: new Date('2026-10-30T01:00:09Z'),
      origin: { mode: 'full' },
    })
    expect(record.steps).toEqual([
      { name: 'check:docs', ran: true, exit: 0, seconds: 1 },
      { name: 'lint:oxlint', ran: true, exit: 1, seconds: 3 },
      { name: 'lint:deps', ran: true, exit: 2, seconds: 9 },
      { name: 'test', ran: false, exit: null, seconds: 2.6 },
      { name: 'acceptance', ran: false, exit: null, seconds: 0 },
    ])
    expect(record.failedStep).toBe('lint:oxlint')
    expect(record.mode).toBe('full')
    expect(record.fullRequested).toBe(true)
    expect(record.worktree).toBe('/work/tree')
    expect(record.resumeFrom).toBeNull()
    expect(allStepsPassed(record)).toBe(false)
    // 写出去再读回来仍是同一份：记录的形状与解析器对得上。
    const path = join(dir, 'run.json')
    writeAdmissionRun(path, record)
    expect(readAdmissionRun(path)).toEqual(record)
  })

  it('全部通过时没有失败步骤；接续模式带来源', () => {
    const record = admissionRunFrom({
      steps: [step('check:docs')],
      run: { results: [result('check:docs', 0, 0, 10)], skipped: [], wallMs: 10 },
      head: H2,
      tree: TREE,
      dirty: false,
      worktree: '/work/tree',
      admission: true,
      caches: { test: 'on', depGraph: 'unknown', mutation: 'off' },
      fullRequested: false,
      base: H1,
      startedAt: new Date(0),
      finishedAt: new Date(10),
      origin: {
        mode: 'resume',
        from: {
          head: H1,
          tree: TREE,
          failedStep: 'lint:oxlint',
          mode: 'affected',
          fullRequested: false,
        },
      },
    })
    expect(record.failedStep).toBeNull()
    expect(allStepsPassed(record)).toBe(true)
    expect(record.caches).toEqual({ test: 'on', depGraph: 'unknown', mutation: 'off' })
    expect(record.mode).toBe('resume')
    expect(record.resumeFrom).toEqual({
      head: H1,
      tree: TREE,
      failedStep: 'lint:oxlint',
      mode: 'affected',
      fullRequested: false,
    })
  })
})

describe('找某个提交能作接续起点的记录', () => {
  const resumed = (startedAt: string) =>
    run({
      mode: 'resume',
      base: H2,
      resumeFrom: {
        head: H2,
        tree: TREE,
        failedStep: 'check:docs',
        mode: 'full',
        fullRequested: true,
      },
      startedAt,
    })

  it('取最近一次干净的准入，全量或按影响面；非准入的、带未提交改动的、接续的、别的提交的都不算', () => {
    const older = run({ startedAt: '2026-10-29T00:00:00.000Z' })
    const newer = run({ startedAt: '2026-10-30T00:00:00.000Z', failedStep: null })
    const runs = [
      run({ head: H2, startedAt: '2026-10-31T00:00:00.000Z' }),
      run({ dirty: true, startedAt: '2026-10-31T00:00:00.000Z' }),
      run({ admission: false, startedAt: '2026-10-31T00:00:00.000Z' }),
      resumed('2026-10-31T00:00:00.000Z'),
      older,
      newer,
    ]
    expect(latestResumeOrigin(runs, H1)).toBe(newer)
    expect(latestResumeOrigin([runs[1] ?? older], H1)).toBeUndefined()
    expect(latestResumeOrigin([resumed('2026-10-31T00:00:00.000Z')], H1)).toBeUndefined()
    const affected = run({ mode: 'affected', base: H2, startedAt: '2026-10-31T00:00:00.000Z' })
    expect(latestResumeOrigin([...runs, affected], H1)).toBe(affected)
  })

  it('从 tmp/admission 与 tmp/check-run/*/run.json 两处收集，读不出的跳过', () => {
    writeAdmissionRun(join(dir, 'tmp/admission/one.json'), run())
    writeAdmissionRun(join(dir, 'tmp/check-run/bbbbbbbbb/run.json'), run({ head: H2 }))
    mkdirSync(join(dir, 'tmp/check-run/empty'))
    writeFileSync(join(dir, 'tmp/admission/junk.json'), 'not json')
    writeFileSync(join(dir, 'tmp/admission/x.log'), 'text log')
    const found = collectAdmissionRuns(dir)
    expect(found.map(entry => entry.head).sort()).toEqual([H1, H2])
    expect(existsSync(join(dir, 'tmp/check-run/empty/run.json'))).toBe(false)
    expect(collectAdmissionRuns(join(dir, 'nowhere'))).toEqual([])
  })
})
