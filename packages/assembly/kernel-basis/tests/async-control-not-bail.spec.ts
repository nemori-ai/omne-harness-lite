import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'probe/decide'(input: string): boolean | undefined | Promise<boolean | undefined>
  }
}

describe('async-control-not-bail', () => {
  it('bail 把 Promise 当 bail 值：异步「无异议」也会短路，且交回的是 Promise 不是判定', async () => {
    const ctx = new Context()
    const seen: string[] = []
    ctx.on('probe/decide', async input => {
      seen.push(`async:${input}`)
      return undefined
    })
    ctx.on('probe/decide', input => {
      seen.push(`sync:${input}`)
      return false
    })

    const bailed = ctx.bail('probe/decide', 'a')
    expect(bailed).toBeInstanceOf(Promise)
    expect(seen).toEqual(['async:a'])
    await expect(bailed).resolves.toBeUndefined()
  })

  it('serial 逐个 await 并按解析值判定；emit 丢弃返回值', async () => {
    const ctx = new Context()
    const seen: string[] = []
    ctx.on('probe/decide', async input => {
      seen.push(`async:${input}`)
      return undefined
    })
    ctx.on('probe/decide', async input => {
      seen.push(`veto:${input}`)
      return false
    })
    ctx.on('probe/decide', input => {
      seen.push(`sync:${input}`)
      return true
    })

    const serial = await ctx.serial('probe/decide', 'b')
    expect(serial).toBe(true)
    expect(seen).toEqual(['async:b', 'veto:b', 'sync:b'])

    seen.length = 0
    const emitted = ctx.emit('probe/decide', 'c')
    expect(emitted).toBeUndefined()
    expect(seen).toEqual(['async:c', 'veto:c', 'sync:c'])
  })
})
