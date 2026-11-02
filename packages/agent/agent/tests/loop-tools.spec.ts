import { describe, expect, it } from 'vitest'
import type { ExecutionSnapshot, Material, PendingCall } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { execution, ok } from './journal-support.ts'
import { alice, eventually, invoke } from './loop-support.ts'
import { deliverToolSuggestion, toolAssembly } from './fixtures/tool-call.ts'

describe('tool action dispatch', () => {
  it('preserves the original request and intent before Tool receives it', async () => {
    const assembly = await toolAssembly()
    const observed: {
      snapshot: ExecutionSnapshot | null
      pending: PendingCall | null
      material: Material<ContentBlock> | null
    } = { snapshot: null, pending: null, material: null }
    assembly.controls.tools.invoke.always(async () => {
      const snapshot = ok(
        await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
      )
      const pending = snapshot.checkpoint.calls.find(call => call.kind === 'tool')
      if (pending === undefined) throw new Error('missing Tool intent')
      const material = ok(
        await assembly.dependencies.materials.read({ ...alice, source: pending.fixed }),
      )
      observed.snapshot = snapshot
      observed.pending = pending
      observed.material = material
      return { kind: 'association-unknown' }
    })
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    await eventually(async () => observed.material !== null)
    expect(observed.pending).toMatchObject({
      association: 'intent',
      position: assembly.controls.tools.invoke.calls[0]?.request.consumer,
    })
    expect(observed.material).toMatchObject({
      kind: 'facts',
      schema: { owner: 'agent', name: 'fixed-tool-request', revision: '1' },
    })
    expect(
      observed.snapshot?.effects.some(effect => effect.pending.action === observed.pending?.action),
    ).toBe(true)
    expect(assembly.controls.tools.invoke.calls[0]?.request.arguments).toEqual({
      original: '{}',
      effective: '{}',
      complete: true,
    })
  })
})
