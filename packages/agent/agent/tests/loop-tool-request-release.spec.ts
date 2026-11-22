import { describe, expect, it } from 'vitest'
import type { DurableEvidence } from '@omne-harness/agent-contract'
import { fail } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolState,
} from '@omne-harness/tool-contract'
import { execution, ok } from './journal-support.ts'
import { alice, eventually, invoke } from './loop-support.ts'
import { associatedTools, deliverToolSuggestion, toolAssembly } from './fixtures/tool-call.ts'

const reference = (name: string) =>
  ok(
    encodeToolInvocationRef({
      tenant: alice.tenant,
      call: ok(decodeToolCallId(`tcall_${name}`)),
      admission: ok(decodeToolOperationId(`top_${name}`)),
    }),
  )

const accepted: ToolInvokeOutcome = {
  kind: 'accepted',
  reference: reference('accepted'),
  state: {} as ToolState,
  recovered: false,
}

describe('the request an allowed Tool action was fixed on', () => {
  it.each([
    ['accepted', accepted],
    ['unknown', { kind: 'commit-unknown', reference: reference('unknown') }],
  ] as const)('records the acceptance %s on the associated call', async (acceptance, outcome) => {
    const assembly = await toolAssembly()
    assembly.controls.tools.invoke.always(async () => outcome)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    const [pending] = await associatedTools(assembly, 1)
    expect(pending?.acceptance).toBe(acceptance)
    const read = ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(read.checkpoint.calls).toContainEqual(expect.objectContaining({ acceptance }))
  })

  it('is preserved as a material with no reader once its holding ends', async () => {
    const assembly = await toolAssembly()
    assembly.controls.tools.invoke.always(async () => accepted)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    await associatedTools(assembly, 1)
    const preserved = assembly.controls.materials.preserve.calls
    const request = preserved.filter(call => call.identity.endsWith('/request'))
    expect(request).toHaveLength(1)
    expect(request[0]?.readers).toBe('until-release')
    expect(preserved.filter(call => call !== request[0]).map(call => call.readers)).not.toContain(
      'until-release',
    )
  })

  it('is a fault when its content was reclaimed while the checkpoint still sends it: no invoke, no acceptance', async () => {
    const requests: DurableEvidence[] = []
    const assembly = await toolAssembly({}, {}, {}, dependencies => {
      const { materials } = dependencies
      return {
        ...dependencies,
        materials: {
          ...materials,
          async preserve(input) {
            const stored = await materials.preserve(input)
            if ('ok' in stored && input.identity.endsWith('/request')) requests.push(stored.ok)
            return stored
          },
          async read(input) {
            return requests.some(source => source.record === input.source.record)
              ? fail({ kind: 'reclaimed' })
              : materials.read(input)
          },
        },
      }
    })
    assembly.controls.tools.invoke.always(async () => accepted)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    await eventually(async () => {
      const read = ok(
        await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
      )
      return read.settlement.candidate?.failure !== undefined
    })
    const read = ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(read.settlement.candidate?.failure).toMatchObject({
      kind: 'node-failed',
      category: 'invariant',
    })
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(read.checkpoint.calls).not.toContainEqual(
      expect.objectContaining({ association: 'associated' }),
    )
  })
})
