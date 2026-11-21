import { describe, expect, it } from 'vitest'
import type {
  AgentEventBody,
  CommandReceipt,
  EventPage,
  Failure,
} from '@omne-harness/agent-contract'
import { fail, type Outcome } from '@omne-harness/operation-result'
import { releaseForeground } from '../src/control.ts'
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
  toolCall,
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

  it('hands each port the access alone: no request of a material or Tool command carries the control operation', async () => {
    const preserved: object[] = []
    const assembly = await toolAssembly({}, {}, {}, dependencies => ({
      ...dependencies,
      materials: {
        ...dependencies.materials,
        preserve: request => {
          preserved.push(request)
          return dependencies.materials.preserve(request)
        },
      },
    }))
    assembly.controls.tools.invoke.always(async () => accepted('call-1'))
    const handle = ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    const [pending] = await associatedTools(assembly, 1)
    if (pending === undefined) throw new Error('no associated Tool call')
    assembly.controls.tools.commands.control.always(() => acceptedControl(pending, 'release'))
    const before = preserved.length
    ok(await handle.input.submit({ ...input, operation: operation('urgent'), value: urgent('u') }))
    await eventually(async () => assembly.controls.tools.commands.control.calls.length === 1)
    const [command] = assembly.controls.tools.commands.control.calls
    expect(Object.keys(command ?? {}).sort()).toEqual([
      'intent',
      'principal',
      'reference',
      'tenant',
    ])
    const stages = preserved.slice(before)
    expect(stages.length).toBeGreaterThan(0)
    for (const request of stages) expect(request).not.toHaveProperty('operation')
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

  it('releases each foreground Tool call with its own control, answers the receipt of the submit and recognizes a resend', async () => {
    const assembly = await toolAssembly({ toolConcurrency: 2 })
    let count = 0
    assembly.controls.tools.invoke.always(async () => accepted(`call-${(count += 1)}`))
    const handle = ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    const pending = await associatedTools(assembly, 2)
    assembly.controls.tools.commands.control.always(input => {
      const found = pending.find(call => call.reference === input.reference)
      if (found === undefined) throw new Error('a control of an unknown call')
      return acceptedControl(found, `release-${pending.indexOf(found)}`)
    })
    const submit = () =>
      handle.input.submit({ ...input, operation: operation('urgent'), value: urgent('u') })
    const answer = ok(await submit())
    expect(answer.operation).toBe(operation('urgent'))
    await eventually(async () => assembly.controls.tools.commands.control.calls.length === 2)
    expect(
      assembly.controls.tools.commands.control.calls.map(call => call.reference).sort(),
    ).toEqual(pending.map(call => call.reference).sort())
    expect(ok(await submit())).toEqual(answer)
    const records = (await loadWithEntries(assembly.dependencies, input)).controls
    expect(records.map(record => record.command.kind)).toEqual(['release-tool', 'release-tool'])
    expect(assembly.controls.tools.commands.control.calls).toHaveLength(2)
  })
})

describe('the release of an urgent input, read straight off the journal', () => {
  const receipt = {
    operation: operation('urgent'),
    execution: execution(),
    revision: 'revision-1',
    evidence: evidence('urgent-submitted'),
  } as unknown as CommandReceipt
  const modelPending = { kind: 'model', reference: 'unresolvable' } as const
  const cancelling = {
    command: { kind: 'cancel' },
    stages: { 'intent-established': { state: 'reached' } },
  }

  function ports(snapshot: Outcome<unknown, Failure>, refusal: Failure = { kind: 'busy' }) {
    const loads: unknown[] = []
    const writes: unknown[] = []
    const journal = {
      load: async (input: unknown) => {
        loads.push(input)
        return snapshot
      },
      control: async (input: unknown) => {
        writes.push(input)
        return fail(refusal)
      },
    }
    return { loads, writes, ports: { journal, models: {}, tools: {}, materials: {} } as never }
  }

  const released = (
    made: ReturnType<typeof ports>,
    priority: 'ordinary' | 'urgent',
    answer: Outcome<CommandReceipt, Failure> = { ok: receipt },
  ) => releaseForeground(made.ports, { ...input, value: { ...urgent('u'), priority } }, answer)

  it('reads nothing for an ordinary input or a refused submit', async () => {
    const made = ports({ ok: {} })
    expect(await released(made, 'ordinary')).toEqual({ ok: receipt })
    const refused = fail({ kind: 'terminal' } as Failure)
    expect(await released(made, 'urgent', refused)).toBe(refused)
    expect(made.loads).toEqual([])
  })

  it.each([
    ['has ended', { state: { kind: 'ended' }, controls: [] }],
    ['is being cancelled', { state: { kind: 'open' }, controls: [cancelling] }],
  ])('writes no control once the execution %s', async (_name, read) => {
    const made = ports({ ok: { ...read, checkpoint: { calls: [modelPending] } } })
    expect(await released(made, 'urgent')).toEqual({ ok: receipt })
    expect(made.writes).toEqual([])
  })

  it('answers the failure of the journal read', async () => {
    const unavailable = fail({
      kind: 'unavailable',
      owner: 'journal',
      diagnostic: 'down',
    } as Failure)
    expect(await released(ports(unavailable), 'urgent')).toEqual(unavailable)
  })

  it('answers invalid for a pending Model call whose reference does not resolve, before any write', async () => {
    const made = ports({
      ok: { state: { kind: 'open' }, controls: [], checkpoint: { calls: [modelPending] } },
    })
    expect(await released(made, 'urgent')).toMatchObject({
      failure: { kind: 'invalid', field: 'checkpoint.calls' },
    })
    expect(made.writes).toEqual([])
  })

  const toolPending = (association: 'associated' | 'unassociated') => ({
    kind: 'tool',
    association,
    reference: (accepted('held') as Extract<ToolInvokeOutcome, { kind: 'accepted' }>).reference,
  })
  const open = (calls: readonly unknown[]) => ({
    ok: { state: { kind: 'open' }, controls: [], checkpoint: { calls } },
  })

  it('writes nothing for a Tool call that is not associated yet', async () => {
    const made = ports(open([toolPending('unassociated')]))
    expect(await released(made, 'urgent')).toEqual({ ok: receipt })
    expect(made.writes).toEqual([])
  })

  it('answers a write the journal refuses, and lets one through whose call or execution already ended', async () => {
    const busy = ports(open([toolPending('associated')]))
    expect(await released(busy, 'urgent')).toEqual({ failure: { kind: 'busy' } })
    expect(busy.writes).toHaveLength(1)
    for (const refusal of [
      { kind: 'invalid', field: 'command.call', reason: 'no-associated-tool-call' },
      { kind: 'terminal' },
    ] as Failure[])
      expect(await released(ports(open([toolPending('associated')]), refusal), 'urgent')).toEqual({
        ok: receipt,
      })
  })
})
