import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

type Loose = {
  on(name: string, cb: () => void): unknown
  emit(name: string): void
  parallel(name: string): Promise<void>
}

describe('parallel-calls-every-listener', () => {
  it('parallel 在调用的那一刻同步调每个监听者；一个抛错不挡后面的，错在返回的 Promise 里', async () => {
    const ctx = new Context() as unknown as Loose
    const seen: string[] = []
    ctx.on('probe/changed', () => void seen.push('first'))
    ctx.on('probe/changed', () => {
      seen.push('second')
      throw new Error('second exploded')
    })
    ctx.on('probe/changed', () => void seen.push('third'))
    const pending = ctx.parallel('probe/changed')
    expect(seen).toEqual(['first', 'second', 'third'])
    await expect(pending).rejects.toThrow(AggregateError)
  })

  it('emit 不是这样：一个抛错，后面的监听者不跑', () => {
    const ctx = new Context() as unknown as Loose
    const seen: string[] = []
    ctx.on('probe/changed', () => {
      throw new Error('first exploded')
    })
    ctx.on('probe/changed', () => void seen.push('second'))
    expect(() => ctx.emit('probe/changed')).toThrow('first exploded')
    expect(seen).toEqual([])
  })
})
