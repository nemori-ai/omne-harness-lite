// 成员测试一层失败后的定向重跑：失败 ≤ 10 处且都落在测试文件里时，同一次运行内低并发只重跑那些文件一次；
// 全过记通过并保留 retried，仍失败按现语义失败，超过 10 处或有成员一级的失败不重跑。失败原因分类进记录，断言失败分开计。
// 运行与重跑都换成假函数，这里只核编排、分类与记录；真的起 vitest 在 steps.ts 里接线。
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseAdmissionRun } from '../src/testing/admission-run.ts'
import type { Failure } from '../src/testing/ledger.ts'
import {
  failureKind,
  readTestStepReport,
  RETRY_LIMIT,
  tierWithRetry,
  writeTestStepReport,
  type FailedFile,
  type RerunOutcome,
} from '../src/testing/test-retry.ts'

const failure = (file: string, message: string, test = 'a case'): Failure => ({
  member: file.split('/').slice(0, 2).join('/'),
  file,
  test,
  message,
})

/** 一次假的层运行：按给定的失败结束；再一次假的重跑：按文件给结果并记下被叫到的顺序。 */
function harness(failures: readonly Failure[], outcomes: Record<string, RerunOutcome>) {
  const reruns: string[] = []
  const notes: string[] = []
  const run = async () => ({ exitCode: failures.length === 0 ? 0 : 1, failures })
  const rerun = async (file: FailedFile) => {
    reruns.push(file.file)
    return outcomes[file.file] ?? 'failed'
  }
  return { reruns, notes, go: () => tierWithRetry('fast', run, rerun, line => notes.push(line)) }
}

describe('失败原因分类', () => {
  it('超时、STACK_TRACE_ERROR、进程起不来各归一类，其余是断言失败', () => {
    expect(failureKind('Error: Test timed out in 5000ms.')).toBe('timeout')
    expect(failureKind('Hook timed out in 10000ms.')).toBe('timeout')
    expect(failureKind('Error: STACK_TRACE_ERROR')).toBe('stack-trace')
    expect(failureKind('Error: Worker exited unexpectedly')).toBe('startup')
    expect(failureKind('Error: spawn EBUSY')).toBe('startup')
    expect(failureKind('Error: Timeout starting the worker')).toBe('startup')
    expect(failureKind('AssertionError: expected 1 to be 2')).toBe('assertion')
    expect(failureKind('')).toBe('assertion')
  })
})

describe('一层失败后的定向重跑', () => {
  it('失败 ≤ 10 处、都在文件里：按文件去重、串行重跑一次，全过就这一步通过并保留 retried', async () => {
    const h = harness(
      [
        failure('packages/a/tests/x.spec.ts', 'Error: Test timed out in 5000ms.', 'one'),
        failure('packages/a/tests/x.spec.ts', 'AssertionError: expected', 'two'),
        failure('tools/b/tests/y.spec.ts', 'Error: STACK_TRACE_ERROR'),
      ],
      { 'packages/a/tests/x.spec.ts': 'passed', 'tools/b/tests/y.spec.ts': 'passed' },
    )
    const result = await h.go()
    expect(result.exitCode).toBe(0)
    expect(h.reruns).toEqual(['packages/a/tests/x.spec.ts', 'tools/b/tests/y.spec.ts'])
    expect(result.retried).toEqual([
      {
        member: 'packages/a',
        file: 'packages/a/tests/x.spec.ts',
        tier: 'fast',
        kind: 'timeout',
        firstError: 'Error: Test timed out in 5000ms.',
        retryResult: 'passed',
      },
      {
        member: 'tools/b',
        file: 'tools/b/tests/y.spec.ts',
        tier: 'fast',
        kind: 'stack-trace',
        firstError: 'Error: STACK_TRACE_ERROR',
        retryResult: 'passed',
      },
    ])
    expect(result.failures).toEqual([])
    expect(h.notes.join('\n')).toContain('定向重跑')
    expect(h.notes.join('\n')).toContain('通过')
  })

  it('重跑仍失败：这一步失败，failures 只剩仍失败的文件，retried 记下各自结果', async () => {
    const h = harness(
      [
        failure('packages/a/tests/x.spec.ts', 'Error: Test timed out in 5000ms.'),
        failure('tools/b/tests/y.spec.ts', 'AssertionError: expected 1 to be 2'),
      ],
      { 'packages/a/tests/x.spec.ts': 'passed', 'tools/b/tests/y.spec.ts': 'failed' },
    )
    const result = await h.go()
    expect(result.exitCode).toBe(1)
    expect(result.retried.map(entry => [entry.file, entry.retryResult])).toEqual([
      ['packages/a/tests/x.spec.ts', 'passed'],
      ['tools/b/tests/y.spec.ts', 'failed'],
    ])
    expect(result.failures).toEqual([
      {
        member: 'tools/b',
        file: 'tools/b/tests/y.spec.ts',
        tier: 'fast',
        kind: 'assertion',
        firstError: 'AssertionError: expected 1 to be 2',
      },
    ])
  })

  it('失败超过 10 处：不重跑，按现语义失败，failures 全部列出并带分类', async () => {
    const many = Array.from({ length: RETRY_LIMIT + 1 }, (_, index) =>
      failure(`packages/a/tests/t${index}.spec.ts`, 'Error: Test timed out in 5000ms.'),
    )
    const h = harness(many, {})
    const result = await h.go()
    expect(result.exitCode).toBe(1)
    expect(h.reruns).toEqual([])
    expect(result.retried).toEqual([])
    expect(result.failures).toHaveLength(RETRY_LIMIT + 1)
    expect(result.failures.every(entry => entry.kind === 'timeout')).toBe(true)
    expect(h.notes.join('\n')).toContain(`超过 ${RETRY_LIMIT}`)
  })

  it('有成员一级的失败（没有文件）：不重跑；通过的层不叫重跑', async () => {
    const h = harness(
      [{ member: 'packages/a', message: '没有执行记录：turbo 的输出里没有 Summary 行' }],
      {},
    )
    const result = await h.go()
    expect(result.exitCode).toBe(1)
    expect(h.reruns).toEqual([])
    expect(result.failures).toEqual([])
    expect(h.notes.join('\n')).toContain('不在任何测试文件里')
    const passed = harness([], {})
    expect((await passed.go()).exitCode).toBe(0)
    expect(passed.reruns).toEqual([])
  })

  it('重跑没选中文件（not-run）算没过', async () => {
    const h = harness([failure('packages/a/tests/x.spec.ts', 'boom')], {
      'packages/a/tests/x.spec.ts': 'not-run',
    })
    expect((await h.go()).exitCode).toBe(1)
  })
})

describe('步骤报告与运行记录', () => {
  let dir: string
  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'omne-test-retry-')))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const retried = {
    member: 'packages/a',
    file: 'packages/a/tests/x.spec.ts',
    tier: 'slow',
    kind: 'timeout',
    firstError: 'Error: Test timed out in 5000ms.',
    retryResult: 'passed',
  } as const

  it('test 步写的报告读回相同；坏文件读作没有', () => {
    const path = join(dir, 'test-step.json')
    const report = { head: 'a'.repeat(40), failures: [], retried: [retried] }
    writeTestStepReport(path, report)
    expect(readTestStepReport(path)).toEqual(report)
    expect(readTestStepReport(join(dir, 'missing.json'))).toBeUndefined()
  })

  it('运行记录的 retried 与 testFailures 两栏：写进去能读回，形状不对的记录不是记录', () => {
    const base = {
      schemaVersion: 1,
      kind: 'admission-run',
      head: 'a'.repeat(40),
      tree: 'c'.repeat(40),
      dirty: false,
      worktree: '/work/tree',
      admission: true,
      caches: { test: 'off', depGraph: 'on', mutation: 'unknown' },
      fullRequested: true,
      mode: 'full',
      base: null,
      resumeFrom: null,
      steps: [{ name: 'test', ran: true, exit: 0, seconds: 1 }],
      failedStep: null,
      startedAt: '2026-11-01T01:00:00.000Z',
      finishedAt: '2026-11-01T01:05:00.000Z',
    }
    const { retryResult: _result, ...failed } = retried
    const parsed = parseAdmissionRun({ ...base, retried: [retried], testFailures: [failed] })
    expect(parsed?.retried).toEqual([retried])
    expect(parsed?.testFailures).toEqual([failed])
    expect(parseAdmissionRun(base)?.retried).toBeUndefined()
    expect(parseAdmissionRun({ ...base, retried: [{ file: 'x' }] })).toBeUndefined()
    expect(parseAdmissionRun({ ...base, testFailures: 'none' })).toBeUndefined()
  })
})
