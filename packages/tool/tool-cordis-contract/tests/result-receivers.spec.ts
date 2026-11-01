// The result receiver registration of `ToolRuntimeService` on real Cordis 4.0.4 (XC-TOOLRESULT r2,
// the re-registration rule R1-D15). Each case names the defect it catches: a registration that
// outlives its fiber, a second live owner accepted silently, a stale registration that blocks the
// rerun of its owner, or a late disposer that removes the registration that replaced it.
import { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolResultReceiver } from '@omne-harness/tool-contract'
import { ToolRuntimeService } from '@omne-harness/tool-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState
const ACTIVE = 2 satisfies CordisFiberState['ACTIVE']
const FAILED = 3 satisfies CordisFiberState['FAILED']

/** A provider with stub operations; the test reads the push-stage lookup through `receiverOf`. */
class TestRuntime extends ToolRuntimeService<string, ContentBlock> {
  readonly invoke = stub
  readonly inspect = stub
  readonly queries = stub
  readonly commands = stub
  readonly instances = stub
  readonly observation = stub
  readonly content = stub
  readonly catalog = stub
  receiverOf(owner: string) {
    return this.resultReceiver(owner)
  }
}
const stub = undefined as never

const receiver = (): ToolResultReceiver<string, ContentBlock> => ({
  push: async () => ({ failure: { kind: 'unavailable', diagnostic: 'test receiver' } }) as never,
})

function runtimeOf(ctx: Context): TestRuntime {
  return ctx.get('toolRuntime') as TestRuntime
}

/** An agent-host-like plugin: it builds a new receiver on every run and registers it. */
function registering(owner: string, built: ToolResultReceiver<string, ContentBlock>[]) {
  return {
    name: `registers-${owner}`,
    inject: ['toolRuntime'],
    apply(ctx: Context) {
      const made = receiver()
      built.push(made)
      runtimeOf(ctx).registerResultReceiver(owner, made)
    },
  }
}

describe('ToolRuntimeService.registerResultReceiver', () => {
  it('resolves the receiver while the registering fiber lives, and removes it with the fiber', async () => {
    const root = new Context()
    const service = await root.plugin(TestRuntime)
    const built: ToolResultReceiver<string, ContentBlock>[] = []
    const host = await root.plugin(registering('agent', built))
    expect(runtimeOf(root).receiverOf('agent')).toBe(built[0])
    expect(runtimeOf(root).receiverOf('other')).toBeUndefined()
    await host.dispose()
    expect(runtimeOf(root).receiverOf('agent')).toBeUndefined()
    expect(service.state as number).toBe(ACTIVE)
  })

  it('removes the entry synchronously when the returned function is called', async () => {
    const root = new Context()
    await root.plugin(TestRuntime)
    let dispose: (() => void) | undefined
    await root.plugin({
      name: 'early',
      inject: ['toolRuntime'],
      apply(ctx: Context) {
        dispose = runtimeOf(ctx).registerResultReceiver('agent', receiver())
      },
    })
    expect(runtimeOf(root).receiverOf('agent')).toBeDefined()
    dispose?.()
    expect(runtimeOf(root).receiverOf('agent')).toBeUndefined()
  })

  it('fails the later fiber when two live fibers register the same owner, and keeps the first', async () => {
    const root = new Context()
    await root.plugin(TestRuntime)
    const first: ToolResultReceiver<string, ContentBlock>[] = []
    await root.plugin(registering('agent', first))
    const second = root.plugin(registering('agent', []))
    await second.await().catch(() => undefined)
    expect(second.state as number).toBe(FAILED)
    expect(runtimeOf(root).receiverOf('agent')).toBe(first[0])
  })

  it('replaces a registration whose fiber is unloading, and its late disposer keeps the successor', async () => {
    const root = new Context()
    await root.plugin(TestRuntime)
    const old: ToolResultReceiver<string, ContentBlock>[] = []
    const oldHost = await root.plugin(registering('agent', old))
    let successorCtx: Context | undefined
    await root.plugin({
      name: 'successor',
      inject: ['toolRuntime'],
      apply(ctx: Context) {
        successorCtx = ctx
      },
    })
    if (successorCtx === undefined) throw new Error('successor did not run')
    const next = receiver()
    // Both live: the successor may not take the owner.
    expect(() => runtimeOf(successorCtx as Context).registerResultReceiver('agent', next)).toThrow()
    // Start the disposal of the old host. Its registration is still present for a few microtasks.
    const disposal = oldHost.dispose()
    expect(runtimeOf(root).receiverOf('agent')).toBe(old[0])
    runtimeOf(successorCtx).registerResultReceiver('agent', next)
    expect(runtimeOf(root).receiverOf('agent')).toBe(next)
    await disposal
    expect(runtimeOf(root).receiverOf('agent')).toBe(next)
  })

  it('registers again when the owner fiber reruns, without failing on its old registration', async () => {
    const root = new Context()
    await root.plugin(TestRuntime)
    const built: ToolResultReceiver<string, ContentBlock>[] = []
    const host = await root.plugin(registering('agent', built))
    await host.restart()
    expect(host.state as number).toBe(ACTIVE)
    expect(built).toHaveLength(2)
    expect(runtimeOf(root).receiverOf('agent')).toBe(built[1])
  })

  it('registers on the new provider after the toolRuntime provider is replaced', async () => {
    const root = new Context()
    const firstProvider = await root.plugin(TestRuntime)
    const built: ToolResultReceiver<string, ContentBlock>[] = []
    const host = await root.plugin(registering('agent', built))
    await firstProvider.dispose()
    await root.plugin(TestRuntime)
    await host.await()
    expect(host.state as number).toBe(ACTIVE)
    expect(built).toHaveLength(2)
    expect(runtimeOf(root).receiverOf('agent')).toBe(built[1])
  })
})
