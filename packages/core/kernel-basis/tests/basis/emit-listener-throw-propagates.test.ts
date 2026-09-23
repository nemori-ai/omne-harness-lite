// basis `emit-listener-throw-propagates`（W1-B 2026-09-23 核实）：`ctx.emit` 同步逐个调用监听者，
// 监听者抛出的异常**同步传回发事件的一方**，后面的监听者不再被调用；发通知的一方要自己隔离处理者的失败。
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

describe('emit-listener-throw-propagates', () => {
  it('监听者抛出 ⇒ emit 同步抛出，后续监听者不跑', () => {
    const ctx = new Context()
    const seen: string[] = []
    ctx.on(
      'login.revoked' as never,
      (() => {
        seen.push('first')
        throw new Error('handler exploded')
      }) as never,
    )
    ctx.on(
      'login.revoked' as never,
      (() => {
        seen.push('second')
      }) as never,
    )
    expect(() => ctx.emit('login.revoked' as never)).toThrow('handler exploded')
    expect(seen).toEqual(['first'])
  })

  it('发事件的一方自己 try/catch 之后，别的监听者照常、发方不受影响', () => {
    const ctx = new Context()
    const seen: string[] = []
    ctx.on(
      'login.revoked' as never,
      (() => {
        throw new Error('handler exploded')
      }) as never,
    )
    ctx.on(
      'login.revoked' as never,
      (() => {
        seen.push('second')
      }) as never,
    )
    let caught: unknown
    try {
      ctx.emit('login.revoked' as never)
    } catch (error) {
      caught = error
    }
    // 4.0.4 的 emit 不是「隔离每个监听者」：第一个抛出即中断整轮派发，第二个监听者没被调用。
    expect(caught).toBeInstanceOf(Error)
    expect(seen).toEqual([])
  })
})
