// 过滤守卫的判定：带过滤的运行一条用例都没跑时失败并说明过滤条件；被打断、watch 模式、文件失败时不出声。
// 真起 vitest 的组合见 test-tiers.spec.ts；这里直接调报告器的两个回调。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FilterGuard from '../src/testing/filter-guard.ts'

/** 一个测试模块：`states` 是各用例的结果，`failed` 为真时模块本身失败（如加载出错）。 */
const module = (states: readonly string[], failed = false) => ({
  ok: () => !failed,
  children: { allTests: () => states.map(state => ({ result: () => ({ state }) })) },
})

let written: string[] = []
let exitCode: typeof process.exitCode
beforeEach(() => {
  exitCode = process.exitCode
  written = []
  vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
    written.push(String(chunk))
    return true
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = exitCode
})

function end(
  options: ConstructorParameters<typeof FilterGuard>[0],
  modules: ReturnType<typeof module>[],
  { reason = 'passed', watch = false, errors = [] as unknown[] } = {},
) {
  process.exitCode = undefined
  const guard = new FilterGuard(options)
  guard.onInit({ config: { watch } })
  guard.onTestRunEnd(modules, errors, reason === 'interrupted' ? 'interrupted' : 'passed')
  return { exitCode: process.exitCode, stderr: written.join('') }
}

describe('过滤守卫', () => {
  it('一条用例都没跑：判失败，说明里写出用例名与文件两种过滤条件', () => {
    const result = end({ testNames: ['某条'], files: ['tests/a.spec.ts'] }, [module(['skipped'])])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('没有选中任何用例')
    expect(result.stderr).toContain('用例名 -t "某条"')
    expect(result.stderr).toContain('文件 "tests/a.spec.ts"')
  })

  it('一个文件都没剩（模块列表为空）：同样判失败', () => {
    expect(end({ files: ['tests/a.spec.ts'] }, []).exitCode).toBe(1)
  })

  it('有用例真跑了（通过或失败）：不出声', () => {
    expect(end({ files: ['x'] }, [module(['skipped', 'passed'])])).toEqual({
      exitCode: undefined,
      stderr: '',
    })
    expect(end({ files: ['x'] }, [module(['failed'])]).stderr).toBe('')
  })

  it('运行被打断、watch 模式：不出声', () => {
    expect(end({ files: ['x'] }, [], { reason: 'interrupted' })).toEqual({
      exitCode: undefined,
      stderr: '',
    })
    expect(end({ files: ['x'] }, [], { watch: true })).toEqual({ exitCode: undefined, stderr: '' })
  })

  it('文件失败或有未处理的错误：留给 vitest 自己的失败，不叠「没选中」', () => {
    expect(end({ files: ['x'] }, [module([], true)])).toEqual({ exitCode: undefined, stderr: '' })
    expect(end({ files: ['x'] }, [], { errors: [new Error('坏了')] })).toEqual({
      exitCode: undefined,
      stderr: '',
    })
  })
})
