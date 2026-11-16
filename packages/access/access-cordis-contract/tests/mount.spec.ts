import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { ProtocolContract } from '@omne-harness/public-contract'
import { AccessAssemblyError, type AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'

class RecordingRegistry extends AccessRegistryService {
  readonly events: string[] = []
  private readonly mounted = new Set<string>()
  private drain: () => void = () => undefined
  release(): void {
    this.drain()
  }
  protected attach(contribution: AccessContribution<ProtocolContract>): () => Promise<void> {
    const { name, major } = contribution.protocol
    if (this.mounted.has(name)) throw new AccessAssemblyError({ name, major })
    this.mounted.add(name)
    this.events.push(`attach ${name}`)
    return () => {
      this.mounted.delete(name)
      this.events.push(`take down ${name}`)
      return new Promise<void>(resolve => {
        this.drain = () => {
          this.events.push(`drained ${name}`)
          resolve()
        }
      })
    }
  }
}

const contribution = (name: string) =>
  ({
    protocol: { name, major: 1, operations: {}, observations: {} },
    operations: {},
    observations: {},
  }) as AccessContribution<ProtocolContract>

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
  it('binds the take-down to the caller and the unload waits for its promise', async () => {
    const root = new Context()
    await root.plugin(RecordingRegistry)
    const registry = root.accessRegistry as unknown as RecordingRegistry
    const fiber = await plugin(root, 'first')
    expect(registry.events).toEqual(['attach notes'])
    let unloaded = false
    const unloading = fiber?.dispose().then(() => {
      unloaded = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(registry.events).toEqual(['attach notes', 'take down notes'])
    expect(unloaded).toBe(false)
    registry.release()
    await unloading
    expect(unloaded).toBe(true)
    expect(registry.events).toEqual(['attach notes', 'take down notes', 'drained notes'])
  })

  it('passes the assembly error to the caller, whose plugin fails', async () => {
    const root = new Context()
    await root.plugin(RecordingRegistry)
    const registry = root.accessRegistry as unknown as RecordingRegistry
    await plugin(root, 'first')
    let caught: unknown
    root.plugin({
      name: 'access-second',
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
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(caught).toBeInstanceOf(AccessAssemblyError)
    expect(registry.events).toEqual(['attach notes'])
  })
})
