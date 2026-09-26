import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { definePlugin, fail, isSuccess, succeed } from '../src/index.ts'
import { FIBER_STATE, bootAssembly } from '../src/testing/index.ts'

describe('bootAssembly', () => {
  it('先 provide 装配层服务，再装插件；撤除后服务消失', async () => {
    let seenClock: unknown
    const plugin = definePlugin({
      name: 'uses-clock',
      inject: ['clock'],
      Config: z.object({}),
      apply(ctx) {
        seenClock = ctx.get('clock')
        ctx.provide('accounts', {})
      },
    })
    const assembly = await bootAssembly({
      services: [{ name: 'clock', value: { now: () => 1 } }],
      plugins: [{ plugin, config: {} }],
    })
    expect(seenClock).toEqual({ now: expect.any(Function) })
    expect(assembly.fibers.every(f => (f.state as number) === FIBER_STATE.ACTIVE)).toBe(true)
    await assembly.dispose()
    expect(assembly.ctx.get('accounts')).toBeUndefined()
    expect(assembly.ctx.get('clock')).toBeUndefined()
  })

  it('任一插件启动失败 ⇒ 装配整体抛出', async () => {
    const bad = definePlugin({
      name: 'bad',
      Config: z.object({ key: z.string().min(1) }),
      apply() {},
    })
    await expect(bootAssembly({ plugins: [{ plugin: bad, config: { key: '' } }] })).rejects.toThrow(
      /invalid config/,
    )
  })
})

describe('Outcome', () => {
  it('成功与失败形状互斥', () => {
    const a = succeed(1)
    const b = fail('storage-unavailable' as const)
    expect(isSuccess(a)).toBe(true)
    expect(isSuccess(b)).toBe(false)
  })
})

describe('bootAssembly · 清单错误', () => {
  it('必需服务缺席 ⇒ PENDING 即启动失败并撤已装的', async () => {
    const needsMissing = definePlugin({
      name: 'needs-missing',
      inject: ['nothing'],
      Config: z.object({}),
      apply() {},
    })
    await expect(bootAssembly({ plugins: [{ plugin: needsMissing, config: {} }] })).rejects.toThrow(
      /PENDING/,
    )
  })
})

describe('bootAssembly · 部分失败先撤已装的', () => {
  it('第二个插件启动失败 ⇒ 第一个插件的 disposer 已执行', async () => {
    const disposed: string[] = []
    const first = definePlugin({
      name: 'first',
      Config: z.object({}),
      apply(ctx) {
        ctx.effect(() => () => {
          disposed.push('first')
        })
      },
    })
    const second = definePlugin({
      name: 'second',
      Config: z.object({}),
      apply() {
        throw new Error('second failed')
      },
    })
    await expect(
      bootAssembly({
        plugins: [
          { plugin: first, config: {} },
          { plugin: second, config: {} },
        ],
      }),
    ).rejects.toThrow('second failed')
    expect(disposed).toEqual(['first'])
  })
})
