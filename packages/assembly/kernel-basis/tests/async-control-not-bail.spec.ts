// basis: async-control-not-bail（@deepseek-ai/cordis 4.0.4）
// 断言：`ctx.bail` 同步派发，`isBailed` 只排除 null/false/undefined，于是异步监听者返回的 Promise 本身被当作 bail 值——
// 不管它将来解析成什么，派发都在这里停下并把 Promise 交回调用方；`ctx.serial` 逐个 await 后按解析值判定；`ctx.emit` 丢弃返回值。
// 上游若改为 await Promise 再判定，「Promise 即 bail 值」的断言失败——那就是本条目失效的信号。
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
      return undefined // 异步「无异议」
    })
    ctx.on('probe/decide', input => {
      seen.push(`sync:${input}`)
      return false // 同步「否决」
    })

    const bailed = ctx.bail('probe/decide', 'a')
    expect(bailed).toBeInstanceOf(Promise) // 交回的是 Promise，不是任何一方的判定
    expect(seen).toEqual(['async:a']) // 在 Promise 处短路，后面的同步否决者根本没跑
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
    expect(serial).toBe(true) // undefined/false 都不是 bail 值，第三个监听者的 true 才是
    expect(seen).toEqual(['async:b', 'veto:b', 'sync:b'])

    seen.length = 0
    const emitted = ctx.emit('probe/decide', 'c')
    expect(emitted).toBeUndefined()
    expect(seen).toEqual(['async:c', 'veto:c', 'sync:c'])
  })
})
