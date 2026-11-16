import { describe, expect, it } from 'vitest'
import type { AgentEventBody, EventPage } from '@omne-harness/agent-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  encodeToolOperationRef,
  resolveToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolState,
} from '@omne-harness/tool-contract'
import {
  acceptedInput,
  evidence,
  execution,
  inputId,
  loadWithEntries,
  ok,
  operation,
} from './journal-support.ts'
import { alice, eventually, invoke, loopAssembly } from './loop-support.ts'
import {
  associatedTools,
  deliverToolSuggestion,
  pushToolResult,
  toolAssembly,
  toolDelivery,
  toolPlaceholder,
  toolReceiver,
  type AssociatedTool,
} from './fixtures/tool-call.ts'

type Assembly = Pick<Awaited<ReturnType<typeof toolAssembly>>, 'dependencies'>

const input = { ...alice, execution: execution() }

const urgent = (name: string) => ({ ...acceptedInput(name), priority: 'urgent' as const })

function accepted(name: string): ToolInvokeOutcome {
  const reference = ok(
    encodeToolInvocationRef({
      tenant: alice.tenant,
      call: ok(decodeToolCallId(`tcall_${name}`)),
      admission: ok(decodeToolOperationId(`top_${name}`)),
    }),
  )
  return { kind: 'accepted', reference, state: {} as ToolState, recovered: false }
}

function acceptedControl(pending: AssociatedTool, name: string) {
  const parts = ok(resolveToolInvocationRef(pending.reference, alice.tenant))
  const id = ok(decodeToolOperationId(`top_${name}`))
  return {
    kind: 'committed' as const,
    operation: ok(encodeToolOperationRef({ ...parts, operation: id })),
    receipt: {
      operation: id,
      state: {} as ToolState,
      progress: { kind: 'accepted' as const, evidence: evidence(`${name}-accepted`) },
    },
  }
}

async function events(assembly: Assembly): Promise<readonly AgentEventBody[]> {
  const bodies: AgentEventBody[] = []
  let after: string | null = null
  for (;;) {
    const page: EventPage = ok(
      await assembly.dependencies.journal.output.read({ ...input, after, limit: 100 }),
    )
    if (page.kind !== 'page') throw new Error('event gap')
    bodies.push(...page.events.map(event => event.body))
    if (page.caughtUp || page.events.length === 0) return bodies
    after = page.next
  }
}

const taken = async (assembly: Assembly) =>
  (await events(assembly)).flatMap(body => (body.kind === 'input-taken' ? body.batch.ordered : []))

const nextStepAsked = async (assembly: Assembly) =>
  (await loadWithEntries(assembly.dependencies, input)).checkpoint.calls.some(
    call => call.kind === 'model' && call.action.startsWith('step-2/'),
  )

async function waitingOnTool() {
  const assembly = await toolAssembly()
  assembly.controls.tools.invoke.always(async () => accepted('call-1'))
  const handle = ok(await invoke(assembly))
  await deliverToolSuggestion(assembly)
  const [pending] = await associatedTools(assembly, 1)
  if (pending === undefined) throw new Error('no associated Tool call')
  assembly.controls.tools.commands.control.always(() => acceptedControl(pending, 'release'))
  return { assembly, handle, pending }
}

describe('an urgent input releases the foreground wait of the current step', () => {
  it('asks Tool to move the foreground call to the background, or else withdraw it, and ends the step on the placeholder without a physical stop', async () => {
    const { assembly, handle, pending } = await waitingOnTool()
    ok(await handle.input.submit({ ...input, operation: operation('urgent'), value: urgent('u') }))
    await eventually(async () => assembly.controls.tools.commands.control.calls.length === 1)
    expect(assembly.controls.tools.commands.control.calls).toEqual([
      expect.objectContaining({
        reference: pending.reference,
        intent: { kind: 'background', otherwise: 'withdraw' },
      }),
    ])
    // The Tool double never stops the execution: only its placeholder reaches the slot.
    const moved = { kind: 'control', operation: ok(decodeToolOperationId('top_release')) } as const
    ok(await pushToolResult(toolReceiver(assembly), toolPlaceholder(pending, moved)))
    await eventually(async () => nextStepAsked(assembly))
    expect(await taken(assembly)).toContainEqual(inputId('u'))
    expect(assembly.controls.tools.commands.control.calls).toHaveLength(1)
  })

  it('ends the step on the withdrawn foreground final when Tool cannot move the call', async () => {
    const { assembly, handle, pending } = await waitingOnTool()
    ok(await handle.input.submit({ ...input, operation: operation('urgent'), value: urgent('u') }))
    await eventually(async () => assembly.controls.tools.commands.control.calls.length === 1)
    const withdrawn = toolDelivery(pending, {
      name: 'withdrawn',
      terminal: {
        kind: 'interrupted',
        cause: {
          kind: 'control',
          operation: ok(decodeToolOperationId('top_release')),
          withdrawn: true,
        },
      },
    })
    ok(await pushToolResult(toolReceiver(assembly), withdrawn))
    await eventually(async () => nextStepAsked(assembly))
    expect(await taken(assembly)).toContainEqual(inputId('u'))
  })

  it('sends no control for an ordinary input; the input waits for the next batch', async () => {
    const { assembly, handle, pending } = await waitingOnTool()
    ok(
      await handle.input.submit({
        ...input,
        operation: operation('ordinary'),
        value: acceptedInput('o'),
      }),
    )
    ok(await pushToolResult(toolReceiver(assembly), toolDelivery(pending, { name: 'done' })))
    await eventually(async () => nextStepAsked(assembly))
    expect(await taken(assembly)).toContainEqual(inputId('o'))
    expect(assembly.controls.tools.commands.control.calls).toHaveLength(0)
  })

  it('asks Model to interrupt the foreground Model call', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    await eventually(async () =>
      (await loadWithEntries(assembly.dependencies, input)).checkpoint.calls.some(
        call => call.kind === 'model',
      ),
    )
    const pending = (await loadWithEntries(assembly.dependencies, input)).checkpoint.calls.find(
      call => call.kind === 'model',
    )
    if (pending?.kind !== 'model') throw new Error('the model call was not saved')
    ok(await handle.input.submit({ ...input, operation: operation('urgent'), value: urgent('u') }))
    const control = async () => {
      const state = ok(
        await assembly.dependencies.models.calls.inspect({
          ...alice,
          reference: pending.reference,
        }),
      )
      return state.kind === 'found' ? state.state.control.kind : null
    }
    await eventually(async () => (await control()) === 'requested')
    const controls = (await loadWithEntries(assembly.dependencies, input)).controls
    expect(controls.map(record => record.command.kind)).toEqual(['interrupt-model'])
  })
})
