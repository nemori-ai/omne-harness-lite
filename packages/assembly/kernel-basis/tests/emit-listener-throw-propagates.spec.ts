import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

type Loose = { on(name: string, cb: () => void): unknown; emit(name: string): void }

describe('emit-listener-throw-propagates', () => {
  it('监听者抛出 ⇒ emit 同步抛出，后续监听者不跑', () => {
    const ctx = new Context() as unknown as Loose
    const seen: string[] = []
    ctx.on('login.revoked', () => {
      seen.push('first')
      throw new Error('handler exploded')
    })
    ctx.on('login.revoked', () => {
      seen.push('second')
    })
    expect(() => ctx.emit('login.revoked')).toThrow('handler exploded')
    expect(seen).toEqual(['first'])
  })

  it('发方自己 try/catch 只能保住自己：被截断的后续监听者仍然不跑', () => {
    const ctx = new Context() as unknown as Loose
    const seen: string[] = []
    ctx.on('login.revoked', () => {
      throw new Error('handler exploded')
    })
    ctx.on('login.revoked', () => {
      seen.push('second')
    })
    let caught: unknown
    try {
      ctx.emit('login.revoked')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(seen).toEqual([])
  })
})
