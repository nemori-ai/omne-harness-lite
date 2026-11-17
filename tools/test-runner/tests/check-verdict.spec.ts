import { describe, expect, it } from 'vitest'
import type { StepResult } from '../src/testing/check-graph.ts'
import { INTERRUPTED_EXIT, checkVerdict } from '../src/testing/check.ts'

const step = (name: string, exitCode: number, endedMs: number, cancelled = false): StepResult => ({
  name,
  exitCode,
  startedMs: 0,
  endedMs,
  logPath: `${name}.log`,
  cancelled,
})

describe('一次检查的退出码', () => {
  it('每一步都跑完且退出 0：通过', () => {
    expect(checkVerdict([step('build', 0, 10), step('test', 0, 20)])).toEqual({
      exitCode: 0,
      failed: [],
      interrupted: [],
    })
  })

  it('有步骤失败：取最早结束的那一步的退出码；它带倒的被终止的步骤不算被外面终止', () => {
    const verdict = checkVerdict([
      step('lint', 3, 30),
      step('test', 143, 25, true),
      step('typecheck', 2, 20),
    ])
    expect(verdict.exitCode).toBe(2)
    expect(verdict.failed.map(result => result.name)).toEqual(['typecheck', 'lint'])
    expect(verdict.interrupted).toEqual([])
  })

  it('失败步骤的退出码不是正数（被信号结束）时记 1', () => {
    expect(checkVerdict([step('test', -1, 10)]).exitCode).toBe(1)
  })

  it('没有步骤失败、却有步骤被终止：整次是被外面终止的，不是通过', () => {
    const verdict = checkVerdict([step('build', 0, 10), step('test', 143, 50, true)])
    expect(verdict).toEqual({ exitCode: INTERRUPTED_EXIT, failed: [], interrupted: ['test'] })
    expect(INTERRUPTED_EXIT).toBe(130)
  })
})
