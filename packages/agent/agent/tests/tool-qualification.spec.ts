import { expect, it } from 'vitest'
import { createAgentToolQualification } from '../src/index.ts'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
} from '@omne-harness/tool-contract'
import { ok } from './journal-support.ts'
import { alice, eventually, gate, invoke } from './loop-support.ts'
import { deliverToolSuggestion, toolAssembly } from './fixtures/tool-call.ts'

it('recognizes an allowed saved intent at Tool startup, without widening A0 qualification', async () => {
  const assembly = await toolAssembly()
  const held = gate()
  assembly.controls.tools.invoke.always(async () => {
    await held.opened
    return { kind: 'association-unknown' }
  })
  try {
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    await eventually(async () => assembly.controls.tools.invoke.calls.length === 1)
    const sent = assembly.controls.tools.invoke.calls[0]
    if (sent === undefined) throw new Error('Tool must have received the saved request')
    const input = {
      ...alice,
      call: ok(decodeToolCallId('first-tool')),
      admission: ok(decodeToolOperationId('first-admission')),
      request: sent.request,
    }
    const qualifier = createAgentToolQualification({
      ...assembly.dependencies,
      targets: {
        async resolve() {
          return { ok: null }
        },
      },
    })
    const qualified = ok(await qualifier.qualify(input))
    const original = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: qualified.execution }),
    )
    expect(qualified).toMatchObject({
      association: 'intent',
      agentDefinition: original.checkpoint.definition,
      revision: original.revision,
      request: { request: sent.request },
    })
    expect(qualified.request).not.toHaveProperty('principal')
    const pending = original.checkpoint.batch?.actions[0]?.call
    if (pending?.kind !== 'tool' || original.executionAttachment === null)
      throw new Error('saved Tool intent required')
    const target = {
      execution: original.execution,
      instance: original.executionAttachment.instance,
      definition: original.checkpoint.definition,
      pending: {
        ...pending,
        association: 'associated' as const,
        reference: ok(encodeToolInvocationRef(input)),
      },
    }
    // The real SQLite target test covers persistence; this fixture isolates Agent's binding interpretation.
    const associated = createAgentToolQualification({
      materials: assembly.dependencies.materials,
      journal: {
        async load() {
          return {
            ok: {
              ...original,
              checkpoint: {
                ...original.checkpoint,
                batch: null,
                calls: [],
                definition: { ...original.checkpoint.definition, revision: 'later' },
              },
            },
          }
        },
      },
      targets: {
        async resolve() {
          return { ok: target }
        },
      },
    })
    expect(ok(await associated.qualify(input))).toMatchObject({
      association: 'associated',
      agentDefinition: original.checkpoint.definition,
    })
    expect(
      await associated.qualify({ ...input, call: ok(decodeToolCallId('wrong-call')) }),
    ).toHaveProperty('failure.kind', 'denied')
    expect(
      await associated.qualify({
        ...input,
        request: {
          ...input.request,
          arguments: { ...input.request.arguments, effective: 'changed' },
        },
      }),
    ).toHaveProperty('failure.kind', 'denied')
    const denied = createAgentToolQualification({
      ...assembly.dependencies,
      journal: {
        async load() {
          return { failure: { kind: 'denied' as const, action: 'load' } }
        },
      },
      targets: {
        async resolve() {
          throw new Error('must not read private binding after denied access')
        },
      },
    })
    expect(await denied.qualify(input)).toEqual({ failure: { kind: 'denied', action: 'load' } })
    const broken = createAgentToolQualification({
      ...assembly.dependencies,
      targets: {
        async resolve() {
          throw new Error('private provider detail')
        },
      },
    })
    expect(await broken.qualify(input)).toEqual({
      failure: {
        kind: 'unavailable',
        owner: 'agentToolQualification',
        diagnostic: 'The original Tool binding is unavailable.',
      },
    })

    for (const request of [
      { ...sent.request, arguments: { ...sent.request.arguments, effective: '{"other":true}' } },
      { ...sent.request, batchDecision: null },
      { ...sent.request, consumer: { ...sent.request.consumer, position: 'another-action' } },
      { ...sent.request, consumer: { ...sent.request.consumer, owner: 'another-owner' } },
    ])
      expect(await qualifier.qualify({ ...input, request })).toHaveProperty(
        'failure.kind',
        'denied',
      )
  } finally {
    held.open()
  }
})
