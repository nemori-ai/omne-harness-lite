import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  rememberAdmittedTarget,
  wasAdmittedTarget,
} from '../../../src/rows/authorization/admitted-targets.ts'

const adoption = (digest: string) => ({
  owner: '@omne-harness/assets',
  name: 'wordcount',
  revision: 'tool/wordcount',
  digest: `sha256:${digest.repeat(64)}`,
})
const call = (position: string) => ({ work: 'execution-1', position })

describe('what a Tools call was admitted to carry', () => {
  it('is the target of its last judging, for that call alone', () => {
    const ctx = new Context()
    const first = adoption('a')
    const second = adoption('b')
    expect(wasAdmittedTarget(ctx, call('1'), first)).toBe(false)
    rememberAdmittedTarget(ctx, call('1'), first)
    expect(wasAdmittedTarget(ctx, call('1'), first)).toBe(true)
    expect(wasAdmittedTarget(ctx, call('1'), second)).toBe(false)
    expect(wasAdmittedTarget(ctx, call('2'), first)).toBe(false)
    expect(wasAdmittedTarget(ctx, { work: 'execution-2', position: '1' }, first)).toBe(false)
    rememberAdmittedTarget(ctx, call('1'), second)
    expect(wasAdmittedTarget(ctx, call('1'), first)).toBe(false)
    expect(wasAdmittedTarget(ctx, call('1'), second)).toBe(true)
  })

  it('is nothing for a call that was judged to carry no target, whatever its name stands for later', () => {
    const ctx = new Context()
    rememberAdmittedTarget(ctx, call('1'), adoption('a'))
    rememberAdmittedTarget(ctx, call('1'), null)
    expect(wasAdmittedTarget(ctx, call('1'), adoption('a'))).toBe(false)
  })

  it('is kept apart for each tree, and forgets the oldest calls first', () => {
    const ctx = new Context()
    const target = adoption('a')
    rememberAdmittedTarget(ctx, call('first'), target)
    expect(wasAdmittedTarget(new Context(), call('first'), target)).toBe(false)
    for (let at = 0; at < 4096; at++) rememberAdmittedTarget(ctx, call(String(at)), target)
    expect(wasAdmittedTarget(ctx, call('first'), target)).toBe(false)
    expect(wasAdmittedTarget(ctx, call('0'), target)).toBe(true)
    expect(wasAdmittedTarget(ctx, call('4095'), target)).toBe(true)
  })
})
