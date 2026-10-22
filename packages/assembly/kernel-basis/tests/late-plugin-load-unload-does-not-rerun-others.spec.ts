// basis `late-plugin-load-unload-does-not-rerun-others`（@deepseek-ai/cordis 4.0.4）。
// 根已经 ACTIVE 之后，再装载一个带登记的插件，然后撤除它。
// 登记随该插件的 fiber 出现和消失；注册表提供者与已有消费者的插件体都不重跑，fiber uid 不变。
import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

const ACTIVE = 2 satisfies CordisFiberState['ACTIVE']
const DISPOSED = 4 satisfies CordisFiberState['DISPOSED']

it('loads a registering plugin after the root is active and withdraws it without rerunning others', async () => {
  const counts = { registry: 0, consumer: 0, author: 0 }
  class BindingRegistry extends Service {
    readonly entries = new Map<string, string>()
    constructor(ctx: Context) {
      super(ctx, 'bindings')
      counts.registry += 1
    }
  }

  const root = new Context()
  const registryFiber = await root.plugin(BindingRegistry)
  const consumerFiber = await root.plugin({
    name: 'existing-consumer',
    inject: ['bindings'],
    apply() {
      counts.consumer += 1
    },
  })
  const registry = root.get('bindings') as BindingRegistry
  expect(root.fiber.state as number).toBe(ACTIVE)
  expect(registryFiber.state as number).toBe(ACTIVE)
  expect(consumerFiber.state as number).toBe(ACTIVE)
  const before = {
    registryUid: registryFiber.uid,
    consumerUid: consumerFiber.uid,
    runs: { registry: counts.registry, consumer: counts.consumer },
  }
  expect(before.runs).toEqual({ registry: 1, consumer: 1 })

  const authorFiber = await root.plugin({
    name: 'author',
    inject: ['bindings'],
    apply(ctx: Context) {
      counts.author += 1
      const bindings = ctx.get('bindings') as BindingRegistry
      ctx.effect(() => {
        bindings.entries.set('tool:report', 'author')
        return () => void bindings.entries.delete('tool:report')
      })
    },
  })
  expect(authorFiber.state as number).toBe(ACTIVE)
  expect(counts.author).toBe(1)
  expect(registry.entries.get('tool:report')).toBe('author')
  expect({ registry: counts.registry, consumer: counts.consumer }).toEqual(before.runs)

  await authorFiber.dispose()
  expect(authorFiber.state as number).toBe(DISPOSED)
  expect(registry.entries.has('tool:report')).toBe(false)

  await new Promise(resolve => setTimeout(resolve, 0))
  expect({ registry: counts.registry, consumer: counts.consumer }).toEqual(before.runs)
  expect(counts.author).toBe(1)
  expect(registryFiber.uid).toBe(before.registryUid)
  expect(consumerFiber.uid).toBe(before.consumerUid)
  expect(root.fiber.state as number).toBe(ACTIVE)
  expect(registryFiber.state as number).toBe(ACTIVE)
  expect(consumerFiber.state as number).toBe(ACTIVE)
})
