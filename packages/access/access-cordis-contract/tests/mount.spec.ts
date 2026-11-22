import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { Entry, Instance } from '@omne-harness/dynamis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'

type Drain = (instance: Instance) => Promise<void>

/** Stands for the `dynamis` service: it makes the entries for the caller and keeps the drain. */
class StubDynamis extends Service {
  readonly events: string[] = []
  refuse = false
  constructor(ctx: Context) {
    super(ctx, 'dynamis')
  }
  put(made: (instance: Instance) => readonly Entry[], options: { drain: Drain }): void {
    const fiber = this.ctx.fiber
    if (this.refuse) throw new Error('refused by the registry')
    const instance = { fiber: fiber.name, generation: 1 }
    const keys = made(instance).map(entry => entry.key)
    fiber.effect(() => {
      this.events.push(`put ${keys.join(',')} by ${fiber.name}`)
      return () => options.drain(instance).then(() => void this.events.push(`taken ${keys}`))
    }, 'stub.put')
  }
}

class RecordingRegistry extends AccessRegistryService {
  static readonly inject = ['dynamis']
  readonly events: string[] = []
  private done: () => void = () => undefined
  release(): void {
    this.done()
  }
  protected entry(contribution: AccessContribution<ProtocolContract>, instance: Instance): Entry {
    const { name, major } = contribution.protocol
    return {
      point: 'access.protocols',
      key: `${name}/v${major}`,
      id: '',
      scope: [],
      rank: 0,
      digest: `${name}@${instance.fiber}`,
      item: contribution,
    }
  }
  protected drained(
    contribution: AccessContribution<ProtocolContract>,
    instance: Instance,
  ): Promise<void> {
    this.events.push(`draining ${contribution.protocol.name} of ${instance.fiber}`)
    return new Promise<void>(resolve => {
      this.done = resolve
    })
  }
}

const contribution = (name: string) =>
  ({
    protocol: { name, major: 1, operations: {}, observations: {} },
    operations: {},
    observations: {},
  }) as AccessContribution<ProtocolContract>

async function tree(): Promise<
  Readonly<{ root: Context; dynamis: StubDynamis; registry: RecordingRegistry }>
> {
  const root = new Context()
  await root.plugin(StubDynamis)
  await root.plugin(RecordingRegistry)
  return {
    root,
    dynamis: root.get('dynamis' as never) as unknown as StubDynamis,
    registry: root.accessRegistry as unknown as RecordingRegistry,
  }
}

async function plugin(root: Context, name: string): Promise<Fiber | undefined> {
  let fiber: Fiber | undefined
  await root.plugin({
    name: `access-${name}`,
    inject: ['accessRegistry'],
    apply(ctx: Context) {
      fiber = ctx.fiber
      ctx.accessRegistry.mount(contribution('notes'))
    },
  })
  return fiber
}

describe('mount', () => {
  it('puts the protocol through the dynamis service as the caller, and the unload waits for the drain', async () => {
    const { root, dynamis, registry } = await tree()
    const fiber = await plugin(root, 'first')
    expect(dynamis.events).toEqual(['put notes/v1 by access-first'])
    let unloaded = false
    const unloading = fiber?.dispose().then(() => {
      unloaded = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(registry.events).toEqual(['draining notes of access-first'])
    expect(unloaded).toBe(false)
    registry.release()
    await unloading
    expect(unloaded).toBe(true)
    expect(dynamis.events).toEqual(['put notes/v1 by access-first', 'taken notes/v1'])
  })

  it('a second plugin that mounts the same protocol loads as the first did: a clash is not an error here', async () => {
    const { root, dynamis } = await tree()
    await plugin(root, 'first')
    const second = await plugin(root, 'second')
    expect(second?.state).toBe(2)
    expect(dynamis.events).toEqual([
      'put notes/v1 by access-first',
      'put notes/v1 by access-second',
    ])
  })

  it('passes what the dynamis service refuses to the caller, whose plugin fails', async () => {
    const { root, dynamis } = await tree()
    dynamis.refuse = true
    let caught: unknown
    await root
      .plugin({
        name: 'access-first',
        inject: ['accessRegistry'],
        apply(ctx: Context) {
          try {
            ctx.accessRegistry.mount(contribution('notes'))
          } catch (error) {
            caught = error
            throw error
          }
        },
      })
      .then(
        () => undefined,
        () => undefined,
      )
    expect(caught).toEqual(new Error('refused by the registry'))
    expect(dynamis.events).toEqual([])
  })
})
