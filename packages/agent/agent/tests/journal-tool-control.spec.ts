import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryAgentJournal } from '@omne-harness/agent/testing'
import {
  decodeActionId,
  type AgentJournal,
  type PendingCall,
  type AgentEvent,
  type EventPage,
} from '@omne-harness/agent-contract'
import { encodeModelInvocationRef, decodeModelOperationId } from '@omne-harness/model-contract'
import * as tools from '@omne-harness/tool-contract'
import {
  access,
  acceptedInput,
  afterTerminalPassage,
  finishInput,
  producedResult,
  takeInputs,
  checkpoint,
  commitAt,
  consumption,
  evidence,
  failure,
  load,
  modelCall,
  ok,
  open,
  operation,
  otherTenant,
} from './journal-support.ts'

const call = ok(tools.decodeToolCallId(modelCall('shared')))
const admission = ok(tools.decodeToolOperationId('admission'))
const parts = { tenant: access.tenant, call, admission }
const invocation = ok(tools.encodeToolInvocationRef(parts))
const toolOperation = ok(
  tools.encodeToolOperationRef({
    ...parts,
    operation: ok(tools.decodeToolOperationId('control')),
  }),
)
const common = {
  action: ok(decodeActionId('action')),
  consumption: consumption('result'),
  position: { owner: 'agent', work: 'exec-1', position: 'T0', purpose: 'action' },
  fixed: evidence('request'),
}
const intent = { ...common, kind: 'tool', purpose: 'action', association: 'intent' } as const
const associated = {
  ...common,
  kind: 'tool',
  purpose: 'action',
  association: 'associated',
  reference: invocation,
} as const satisfies PendingCall
const model = {
  ...common,
  kind: 'model',
  purpose: 'main',
  reference: ok(
    encodeModelInvocationRef({
      tenant: access.tenant,
      call: modelCall('shared'),
      admission: ok(decodeModelOperationId('mop_admission')),
    }),
  ),
} as const satisfies PendingCall

type Recording = Parameters<AgentJournal<string>['recordControl']>[0]

async function setup(
  calls: readonly PendingCall[] = [associated],
  options: Parameters<typeof createMemoryAgentJournal<string>>[0] = {},
) {
  const memory = createMemoryAgentJournal<string>(options)
  const journal = memory.port
  const opened = await open(journal)
  ok(
    await journal.commit(
      commitAt(await load(journal, opened.execution), opened.authority, 'calls', {
        checkpoint: { ...checkpoint(), calls },
      }),
    ),
  )
  const control = {
    ...access,
    execution: opened.execution,
    operation: operation('C'),
    command: { kind: 'interrupt-tool', call, reason: evidence('interrupt') },
  } as const
  const recording: Recording = {
    ...access,
    execution: opened.execution,
    operation: operation('R'),
    target: control.operation,
    stage: 'producer-confirmed',
    state: 'reached',
    source: evidence('producer-confirmed'),
  }
  return { memory, journal, opened, control, recording }
}

async function observe(journal: AgentJournal<string>, execution: Recording['execution']) {
  return {
    snapshot: await load(journal, execution),
    events: ok(await journal.output.read({ ...access, execution, after: null, limit: 100 })),
  }
}

function operationRef(overrides: Partial<tools.ToolOperationParts>) {
  return ok(
    tools.encodeToolOperationRef({
      ...parts,
      operation: ok(tools.decodeToolOperationId('control')),
      ...overrides,
    }),
  )
}

afterEach(() => vi.restoreAllMocks())

async function observeRetained(journal: AgentJournal<string>, execution: Recording['execution']) {
  const events: AgentEvent[] = []
  let after: string | null = null
  for (;;) {
    const page: EventPage = ok(await journal.output.read({ ...access, execution, after, limit: 1 }))
    if (page.kind !== 'page') throw new Error('retained fixture must have complete events')
    events.push(...page.events)
    if (page.caughtUp) break
    after = page.next
  }
  return { snapshot: await load(journal, execution), events }
}

describe('public retained invocation faults', () => {
  const faults = [
    { kind: 'malformed' },
    {
      kind: 'foreign-tenant',
      reference: ok(tools.encodeToolInvocationRef({ ...parts, tenant: otherTenant.tenant })),
    },
  ] as const

  describe.each(['interrupt-tool', 'background-tool'] as const)('%s', kind => {
    describe.each(faults)('$kind', fault => {
      it.each([true, false])('observes S0/S1/S2 with attachment=%s', async attachment => {
        const { memory, journal, opened, control, recording } = await setup([associated], {
          retainedToolInvocationFaults: true,
        })
        const other = await open(journal, 'other-execution')
        const otherBefore = await observeRetained(journal, other.execution)
        const otherQuery = {
          ...access,
          execution: other.execution,
          operation: operation('open-other-execution'),
        }
        const accepted = { ...control, command: { ...control.command, kind } }
        const acceptedReceipt = ok(await journal.control(accepted))
        const originalReceipt = ok(await journal.recordControl(recording))
        const s0 = await observeRetained(journal, opened.execution)
        expect(
          tools.resolveToolInvocationRef(s0.snapshot.controls[0]?.toolInvocation, access.tenant),
        ).toEqual({ ok: parts })
        const selector = {
          tenant: access.tenant,
          execution: opened.execution,
          control: accepted.operation,
        }
        expect(memory.setRetainedToolInvocationFault({ ...selector, fault })).toEqual({
          kind: 'applied',
        })
        const badReference =
          fault.kind === 'malformed'
            ? 'memory-journal:malformed-retained-tool-invocation'
            : fault.reference
        const s1 = await observeRetained(journal, opened.execution)
        expect(await observeRetained(journal, other.execution)).toEqual(otherBefore)
        expect(ok(await journal.query(otherQuery))).toEqual({
          kind: 'committed',
          receipt: other.receipt,
        })
        expect(s1).toEqual({
          ...s0,
          snapshot: {
            ...s0.snapshot,
            controls: s0.snapshot.controls.map(record => ({
              ...record,
              toolInvocation: badReference,
            })),
          },
        })
        expect(
          failure(
            tools.resolveToolInvocationRef(s1.snapshot.controls[0]?.toolInvocation, access.tenant),
          ),
        ).toMatchObject({ kind: fault.kind })
        expect(s0.snapshot.controls[0]?.toolInvocation).toBe(invocation)

        expect(ok(await journal.recordControl(recording))).toEqual(originalReceipt)
        const changes: readonly Partial<Recording>[] = [
          { toolOperation },
          { target: operation('missing-control') },
          { stage: 'physically-stopped' },
        ]
        for (const change of changes) {
          expect(failure(await journal.recordControl({ ...recording, ...change }))).toEqual({
            kind: 'conflict',
            operation: recording.operation,
          })
        }
        expect(
          await Reflect.apply(journal.recordControl, journal, [
            { ...recording, toolOperation: 'invalid' },
          ]),
        ).toEqual({ failure: { kind: 'conflict', operation: recording.operation } })
        expect(
          failure(
            await journal.recordControl({
              ...recording,
              toolOperation: operationRef({ tenant: otherTenant.tenant }),
            }),
          ),
        ).toEqual({ kind: 'denied', action: 'recordControl' })

        const next = {
          ...recording,
          operation: operation('new-R'),
          ...(attachment ? { toolOperation } : {}),
        }
        expect(failure(await journal.recordControl(next))).toEqual(
          fault.kind === 'malformed'
            ? {
                kind: 'unavailable',
                owner: 'AgentJournal',
                diagnostic: 'invalid-retained-tool-invocation',
              }
            : { kind: 'denied', action: 'recordControl' },
        )
        expect(await observeRetained(journal, opened.execution)).toEqual(s1)
        expect(await observeRetained(journal, other.execution)).toEqual(otherBefore)
        expect(ok(await journal.query(otherQuery))).toEqual({
          kind: 'committed',
          receipt: other.receipt,
        })
        expect(ok(await journal.query(next))).toEqual({ kind: 'unknown' })
        expect(ok(await journal.query(accepted))).toEqual({
          kind: 'committed',
          receipt: acceptedReceipt,
        })
        expect(ok(await journal.query(recording))).toEqual({
          kind: 'committed',
          receipt: originalReceipt,
        })

        expect(memory.setRetainedToolInvocationFault({ ...selector, fault: null })).toEqual({
          kind: 'cleared',
        })
        expect(await observeRetained(journal, opened.execution)).toEqual(s0)
        const restored = ok(await journal.recordControl({ ...next, toolOperation }))
        const after = await observeRetained(journal, opened.execution)
        expect(after.snapshot.controls[0]?.toolInvocation).toBe(invocation)
        expect(after.snapshot.controls[0]?.toolOperation).toBe(toolOperation)
        expect(Number(after.snapshot.revision)).toBe(Number(s0.snapshot.revision) + 1)
        expect(after.events).toEqual(s0.events)
        expect(ok(await journal.query(next))).toEqual({ kind: 'committed', receipt: restored })
        expect(ok(await journal.query(recording))).toEqual({
          kind: 'committed',
          receipt: originalReceipt,
        })
      })
    })
  })
})

describe('pending control operation custody', () => {
  const retries = [undefined, 'applied', 'dropped', 'pending'] as const

  it.each(retries)(
    'rejects a replacement call under pending C with retry fault %s',
    async retry => {
      const secondCall = ok(tools.decodeToolCallId('second-call'))
      const secondReference = ok(tools.encodeToolInvocationRef({ ...parts, call: secondCall }))
      const { memory, journal, opened, control } = await setup([
        associated,
        { ...associated, reference: secondReference },
      ])
      memory.failNext('control', { kind: 'commit-unknown', outcome: 'pending' })
      expect(failure(await journal.control(control))).toEqual({
        kind: 'commit-unknown',
        operation: control.operation,
      })
      const held = await observe(journal, opened.execution)
      expect(held.snapshot.unresolved).toContain(control.operation)
      if (retry !== undefined)
        memory.failNext('control', { kind: 'commit-unknown', outcome: retry })
      expect(
        failure(
          await journal.control({ ...control, command: { ...control.command, call: secondCall } }),
        ),
      ).toEqual({ kind: 'conflict', operation: control.operation })
      expect(await observe(journal, opened.execution)).toEqual(held)
      expect(ok(await journal.query(control))).toEqual({ kind: 'unknown' })
      expect(memory.settle(opened.execution, control.operation, 'applied')).toBe(true)
      const settled = await observe(journal, opened.execution)
      expect(settled.snapshot.controls).toHaveLength(1)
      expect(settled.snapshot.controls[0]).toMatchObject({
        operation: control.operation,
        command: control.command,
        toolInvocation: invocation,
        toolOperation: null,
      })
      expect(settled.snapshot.unresolved).not.toContain(control.operation)
      expect(Number(settled.snapshot.revision)).toBe(Number(held.snapshot.revision) + 1)
      expect(Number(settled.snapshot.output.emittedThrough)).toBe(
        Number(held.snapshot.output.emittedThrough) + 1,
      )
      const receipt = ok(await journal.control(control))
      expect(ok(await journal.query(control))).toEqual({ kind: 'committed', receipt })
      expect(memory.settle(opened.execution, control.operation, 'applied')).toBe(false)
      expect(await observe(journal, opened.execution)).toEqual(settled)
    },
  )

  it.each(retries)(
    'rejects a replacement attachment under pending R with retry fault %s',
    async retry => {
      const { memory, journal, opened, control, recording } = await setup()
      ok(await journal.control(control))
      const original = { ...recording, toolOperation }
      memory.failNext('recordControl', { kind: 'commit-unknown', outcome: 'pending' })
      expect(failure(await journal.recordControl(original))).toEqual({
        kind: 'commit-unknown',
        operation: original.operation,
      })
      const held = await observe(journal, opened.execution)
      expect(held.snapshot.unresolved).toContain(original.operation)
      if (retry !== undefined)
        memory.failNext('recordControl', { kind: 'commit-unknown', outcome: retry })
      expect(
        failure(
          await journal.recordControl({
            ...original,
            toolOperation: operationRef({
              operation: ok(tools.decodeToolOperationId('replacement')),
            }),
          }),
        ),
      ).toEqual({ kind: 'conflict', operation: original.operation })
      expect(await observe(journal, opened.execution)).toEqual(held)
      expect(ok(await journal.query(original))).toEqual({ kind: 'unknown' })
      expect(memory.settle(opened.execution, original.operation, 'applied')).toBe(true)
      const settled = await observe(journal, opened.execution)
      expect(settled.snapshot.controls[0]).toMatchObject({
        toolInvocation: invocation,
        toolOperation,
      })
      expect(settled.snapshot.unresolved).not.toContain(original.operation)
      expect(Number(settled.snapshot.revision)).toBe(Number(held.snapshot.revision) + 1)
      expect(Number(settled.snapshot.output.emittedThrough)).toBe(
        Number(held.snapshot.output.emittedThrough) + 1,
      )
      const receipt = ok(await journal.recordControl(original))
      expect(ok(await journal.query(original))).toEqual({ kind: 'committed', receipt })
      expect(memory.settle(opened.execution, original.operation, 'applied')).toBe(false)
      expect(await observe(journal, opened.execution)).toEqual(settled)
    },
  )

  it('keeps the original pending C until settlement when its input is resubmitted', async () => {
    const { memory, journal, opened, control } = await setup()
    memory.failNext('control', { kind: 'commit-unknown', outcome: 'pending' })
    const unknown = await journal.control(control)
    expect(failure(unknown)).toEqual({ kind: 'commit-unknown', operation: control.operation })
    const held = await observe(journal, opened.execution)
    expect(await journal.control({ ...control, command: { ...control.command } })).toEqual(unknown)
    expect(await observe(journal, opened.execution)).toEqual(held)
    expect(ok(await journal.query(control))).toEqual({ kind: 'unknown' })
    expect(memory.settle(opened.execution, control.operation, 'applied')).toBe(true)
    const settled = await observe(journal, opened.execution)
    const receipt = ok(await journal.control(control))
    expect(ok(await journal.query(control))).toEqual({ kind: 'committed', receipt })
    expect(await observe(journal, opened.execution)).toEqual(settled)
  })

  it('keeps pending R for a canonical equivalent reference and prioritizes tenant rejection', async () => {
    const { memory, journal, opened, control, recording } = await setup()
    ok(await journal.control(control))
    const original = { ...recording, toolOperation }
    memory.failNext('recordControl', { kind: 'commit-unknown', outcome: 'pending' })
    const unknown = await journal.recordControl(original)
    expect(failure(unknown)).toEqual({ kind: 'commit-unknown', operation: original.operation })
    const held = await observe(journal, opened.execution)
    const equivalent = ` ${toolOperation} ` as tools.ToolOperationRef
    expect(tools.resolveToolOperationRef(equivalent, access.tenant)).toEqual({
      ok: tools.readToolOperationRef(toolOperation),
    })
    expect(await journal.recordControl({ ...original, toolOperation: equivalent })).toEqual(unknown)
    expect(failure(await journal.recordControl({ ...original, ...otherTenant }))).toEqual({
      kind: 'denied',
      action: 'recordControl',
    })
    expect(
      failure(
        await journal.recordControl({
          ...original,
          toolOperation: operationRef({ tenant: otherTenant.tenant }),
        }),
      ),
    ).toEqual({ kind: 'denied', action: 'recordControl' })
    expect(
      failure(await journal.recordControl({ ...original, target: operation('absent') })),
    ).toEqual({
      kind: 'conflict',
      operation: original.operation,
    })
    expect(await observe(journal, opened.execution)).toEqual(held)
    expect(ok(await journal.query(original))).toEqual({ kind: 'unknown' })
    expect(memory.settle(opened.execution, original.operation, 'applied')).toBe(true)
    const settled = await observe(journal, opened.execution)
    const receipt = ok(await journal.recordControl({ ...original, toolOperation: equivalent }))
    expect(ok(await journal.query(original))).toEqual({ kind: 'committed', receipt })
    expect(settled.snapshot.controls[0]?.toolOperation).toBe(toolOperation)
    expect(await observe(journal, opened.execution)).toEqual(settled)
  })

  it.each(['command', 'identity'] as const)(
    'retains pending C when its caller mutates %s',
    async part => {
      const { memory, journal, opened, control } = await setup()
      const input = {
        ...control,
        command: { ...control.command, reason: { ...control.command.reason } },
      }
      memory.failNext('control', { kind: 'commit-unknown', outcome: 'pending' })
      expect(failure(await journal.control(input))).toEqual({
        kind: 'commit-unknown',
        operation: control.operation,
      })
      const held = await observe(journal, opened.execution)
      if (part === 'command') {
        input.command.call = ok(tools.decodeToolCallId('absent'))
        input.command.reason.record = 'changed-reason'
      } else {
        input.operation = operation('changed-operation')
        input.tenant = otherTenant.tenant
      }
      expect(memory.settle(opened.execution, control.operation, 'applied')).toBe(true)
      const settled = await observe(journal, opened.execution)
      expect(settled.snapshot.controls[0]).toMatchObject({
        operation: control.operation,
        command: control.command,
        toolInvocation: invocation,
      })
      expect(settled.snapshot.unresolved).not.toContain(control.operation)
      expect(Number(settled.snapshot.revision)).toBe(Number(held.snapshot.revision) + 1)
      const receipt = ok(await journal.control(control))
      expect(ok(await journal.query(control))).toEqual({ kind: 'committed', receipt })
      expect(await observe(journal, opened.execution)).toEqual(settled)
    },
  )
})

describe('shared pending recognition prerequisites', () => {
  it('checks participant support before pending commit identity', async () => {
    const memory = createMemoryAgentJournal<string>()
    const journal = memory.port
    const opened = await open(journal)
    const original = commitAt(await load(journal, opened.execution), opened.authority, 'pending')
    memory.failNext('commit', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await journal.commit(original)).kind).toBe('commit-unknown')
    const held = await observe(journal, opened.execution)
    expect(
      failure(
        await journal.commit({
          ...original,
          caller: {
            kind: 'message',
            message: acceptedInput('caller').content,
            source: evidence('source'),
            admission: evidence('admission'),
          },
        }),
      ),
    ).toEqual({ kind: 'unsupported' })
    expect(await observe(journal, opened.execution)).toEqual(held)
    expect(ok(await journal.query(original))).toEqual({ kind: 'unknown' })
    expect(memory.settle(opened.execution, original.operation, 'applied')).toBe(true)
    const receipt = ok(await journal.commit(original))
    expect(ok(await journal.query(original))).toEqual({ kind: 'committed', receipt })
  })

  it('rechecks custody before pending and committed recognition and settlement', async () => {
    let allowed = true
    const memory = createMemoryAgentJournal<string>({ custodian: () => allowed })
    const journal = memory.port
    const opened = await open(journal)
    const original = {
      ...access,
      execution: opened.execution,
      operation: operation('pending-result'),
      result: producedResult('result'),
      consumption: consumption('result'),
      transfer: { kind: 'none' },
      release: { kind: 'pending' },
    } as const
    const before = await observe(journal, opened.execution)
    memory.failNext('recordResult', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await journal.recordResult(original)).kind).toBe('commit-unknown')
    const held = await observe(journal, opened.execution)
    allowed = false
    for (const request of [original, { ...original, consumption: consumption('other') }]) {
      expect(failure(await journal.recordResult(request))).toEqual({
        kind: 'denied',
        action: 'recordResult',
      })
    }
    expect(await observe(journal, opened.execution)).toEqual(held)
    expect(ok(await journal.query(original))).toEqual({ kind: 'unknown' })
    expect(memory.settle(opened.execution, original.operation, 'applied')).toBe(true)
    expect(ok(await journal.query(original)).kind).toBe('excluded')
    expect(await observe(journal, opened.execution)).toEqual(before)
    allowed = true
    const separate = { ...original, operation: operation('committed-result') }
    const receipt = ok(await journal.recordResult(separate))
    const committed = await observe(journal, opened.execution)
    allowed = false
    expect(failure(await journal.recordResult(separate))).toEqual({
      kind: 'denied',
      action: 'recordResult',
    })
    expect(ok(await journal.query(separate))).toEqual({ kind: 'committed', receipt })
    expect(ok(await journal.query(original)).kind).toBe('excluded')
    expect(await observe(journal, opened.execution)).toEqual(committed)
  })

  it('rechecks observation qualification before pending and committed recognition and settlement', async () => {
    let allowed = true
    const memory = createMemoryAgentJournal<string>({ observer: () => allowed })
    const journal = memory.port
    const opened = await open(journal)
    ok(
      await journal.commit(
        commitAt(await load(journal, opened.execution), opened.authority, 'with-passage', {
          checkpoint: checkpoint('F2', [afterTerminalPassage('observer')]),
        }),
      ),
    )
    ok(await takeInputs(journal, opened))
    expect(ok(await journal.tryFinish(await finishInput(journal, opened))).kind).toBe('ended')
    const item = (await load(journal, opened.execution)).terminalObservations[0]
    if (item === undefined) throw new Error('expected one terminal observation')
    const original = {
      ...access,
      execution: opened.execution,
      operation: operation('pending-observation'),
      terminal: item.terminal,
      passage: item.passage,
      implementation: item.implementation,
      observed: evidence('seen'),
    }
    const before = await observe(journal, opened.execution)
    memory.failNext('recordTerminalObservation', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await journal.recordTerminalObservation(original)).kind).toBe('commit-unknown')
    const held = await observe(journal, opened.execution)
    allowed = false
    for (const request of [original, { ...original, observed: evidence('other') }]) {
      expect(failure(await journal.recordTerminalObservation(request))).toEqual({
        kind: 'denied',
        action: 'recordTerminalObservation',
      })
    }
    expect(await observe(journal, opened.execution)).toEqual(held)
    expect(ok(await journal.query(original))).toEqual({ kind: 'unknown' })
    expect(memory.settle(opened.execution, original.operation, 'applied')).toBe(true)
    expect(ok(await journal.query(original)).kind).toBe('excluded')
    expect(await observe(journal, opened.execution)).toEqual(before)
    allowed = true
    const separate = { ...original, operation: operation('committed-observation') }
    const receipt = ok(await journal.recordTerminalObservation(separate))
    const committed = await observe(journal, opened.execution)
    allowed = false
    expect(failure(await journal.recordTerminalObservation(separate))).toEqual({
      kind: 'denied',
      action: 'recordTerminalObservation',
    })
    expect(ok(await journal.query(separate))).toEqual({ kind: 'committed', receipt })
    expect(ok(await journal.query(original)).kind).toBe('excluded')
    expect(await observe(journal, opened.execution)).toEqual(committed)
  })
})

describe('Tool control association', () => {
  it.each([
    ['absent', []],
    ['intent', [intent]],
    ['Model only', [model]],
    [
      'different Tool call',
      [
        {
          ...associated,
          reference: ok(
            tools.encodeToolInvocationRef({
              ...parts,
              call: ok(tools.decodeToolCallId('different-call')),
            }),
          ),
        },
      ],
    ],
  ] as const)('rejects %s without changing the execution or its events', async (_, calls) => {
    const { journal, opened, control } = await setup(calls)
    const before = await observe(journal, opened.execution)
    expect(failure(await journal.control(control))).toEqual({
      kind: 'invalid',
      field: 'command.call',
      reason: 'no-associated-tool-call',
    })
    expect(await observe(journal, opened.execution)).toEqual(before)
  })

  it('filters the producer kind before comparing identical call text', async () => {
    const { journal, opened, control } = await setup([associated, model])
    ok(await journal.control(control))
    ok(
      await journal.control({
        ...control,
        operation: operation('model-control'),
        command: { ...control.command, kind: 'interrupt-model', call: modelCall('shared') },
      }),
    )
    const snapshot = await load(journal, opened.execution)
    expect(snapshot.controls[0]).toMatchObject({ toolInvocation: invocation, toolOperation: null })
    expect(snapshot.controls[1]?.command).toEqual({
      ...control.command,
      kind: 'interrupt-model',
      call: modelCall('shared'),
    })
    expect(snapshot.controls[1]).not.toHaveProperty('toolInvocation')
    const onlyTool = await setup([associated])
    expect(
      failure(
        await onlyTool.journal.control({
          ...onlyTool.control,
          command: { ...control.command, kind: 'interrupt-model', call: modelCall('shared') },
        }),
      ),
    ).toEqual({ kind: 'invalid', field: 'command.call', reason: 'not a call of this execution' })
  })

  it.each([
    ['different Model call', model.reference, modelCall('different')],
    ['malformed Model reference', 'invalid' as typeof model.reference, modelCall('shared')],
  ])('rejects %s without accepting a Model control', async (_, reference, requested) => {
    const { journal, opened, control } = await setup([{ ...model, reference }])
    const before = await observe(journal, opened.execution)
    expect(
      failure(
        await journal.control({
          ...control,
          command: { ...control.command, kind: 'interrupt-model', call: requested },
        }),
      ),
    ).toEqual({ kind: 'invalid', field: 'command.call', reason: 'not a call of this execution' })
    expect(await observe(journal, opened.execution)).toEqual(before)
  })

  it('does not interpret another producer kind through its own reference resolver', async () => {
    const misplaced = {
      ...associated,
      reference: model.reference as unknown as tools.ToolInvocationRef,
    }
    const { journal, opened, control } = await setup([misplaced])
    const before = await observe(journal, opened.execution)
    expect(
      failure(
        await journal.control({
          ...control,
          command: { ...control.command, kind: 'interrupt-model', call: modelCall('shared') },
        }),
      ),
    ).toEqual({ kind: 'invalid', field: 'command.call', reason: 'not a call of this execution' })
    expect(await observe(journal, opened.execution)).toEqual(before)

    const extendedModel = { ...model, association: 'associated' } as const
    const tool = await setup([extendedModel, associated])
    ok(await tool.journal.control(tool.control))
    expect((await load(tool.journal, tool.opened.execution)).controls[0]).toMatchObject({
      command: tool.control.command,
      toolInvocation: invocation,
    })
  })

  it('accepts repeated canonical identity and rejects two admissions for one call', async () => {
    const spaced = ` ${invocation} ` as tools.ToolInvocationRef
    const duplicate = await setup([associated, { ...associated, reference: spaced }])
    ok(
      await duplicate.journal.control({
        ...duplicate.control,
        command: { ...duplicate.control.command, kind: 'background-tool' },
      }),
    )
    const different = ok(
      tools.encodeToolInvocationRef({
        ...parts,
        admission: ok(tools.decodeToolOperationId('other-admission')),
      }),
    )
    const { journal, opened, control } = await setup([
      associated,
      { ...associated, reference: different },
    ])
    const before = await observe(journal, opened.execution)
    expect(failure(await journal.control(control))).toEqual({
      kind: 'invalid',
      field: 'command.call',
      reason: 'ambiguous-associated-tool-call',
    })
    expect(await observe(journal, opened.execution)).toEqual(before)
  })

  it.each([
    [
      'malformed',
      'invalid' as tools.ToolInvocationRef,
      { kind: 'invalid', field: 'command.call', reason: 'invalid-tool-invocation-reference' },
    ],
    [
      'foreign',
      ok(tools.encodeToolInvocationRef({ ...parts, tenant: otherTenant.tenant })),
      { kind: 'denied', action: 'control' },
    ],
  ])('rejects a %s associated reference without mutation', async (_, reference, expected) => {
    const { journal, opened, control } = await setup([{ ...associated, reference }])
    const before = await observe(journal, opened.execution)
    expect(failure(await journal.control(control))).toEqual(expected)
    expect(await observe(journal, opened.execution)).toEqual(before)
  })

  it('keeps the original invocation and recognizes C after the checkpoint removes it', async () => {
    const { journal, opened, control, recording } = await setup()
    const receipt = ok(await journal.control(control))
    ok(
      await journal.commit(
        commitAt(await load(journal, opened.execution), opened.authority, 'advance'),
      ),
    )
    const before = await observe(journal, opened.execution)
    expect(ok(await journal.control(control))).toEqual(receipt)
    expect(
      failure(
        await journal.control({
          ...control,
          command: { ...control.command, reason: evidence('changed') },
        }),
      ),
    ).toEqual({ kind: 'conflict', operation: control.operation })
    expect(ok(await journal.query(control))).toEqual({ kind: 'committed', receipt })
    expect(await observe(journal, opened.execution)).toEqual(before)
    expect(failure(await journal.control({ ...control, ...otherTenant }))).toEqual({
      kind: 'denied',
      action: 'control',
    })
    ok(await journal.recordControl({ ...recording, toolOperation }))
    expect((await load(journal, opened.execution)).controls[0]).toMatchObject({
      toolInvocation: invocation,
      toolOperation,
    })
    expect(before.snapshot.controls[0]).toMatchObject({
      toolInvocation: invocation,
      toolOperation: null,
    })
  })
})

describe('Tool operation attachment', () => {
  it.each([
    [
      'malformed',
      'invalid' as tools.ToolOperationRef,
      { kind: 'invalid', field: 'toolOperation', reason: 'malformed-tool-operation-reference' },
    ],
    [
      'foreign',
      operationRef({ tenant: otherTenant.tenant }),
      { kind: 'denied', action: 'recordControl' },
    ],
    [
      'wrong call',
      operationRef({ call: ok(tools.decodeToolCallId('other-call')) }),
      { kind: 'conflict', operation: operation('R') },
    ],
    [
      'wrong admission',
      operationRef({ admission: ok(tools.decodeToolOperationId('other-admission')) }),
      { kind: 'conflict', operation: operation('R') },
    ],
  ])('rejects %s before stage recognition and saves nothing', async (_, reference, expected) => {
    const { journal, opened, control, recording } = await setup()
    ok(await journal.control(control))
    ok(await journal.recordControl({ ...recording, operation: operation('first-stage') }))
    const before = await observe(journal, opened.execution)
    expect(
      failure(await journal.recordControl({ ...recording, toolOperation: reference })),
    ).toEqual(expected)
    expect(await observe(journal, opened.execution)).toEqual(before)
    expect(ok(await journal.query(recording))).toEqual({ kind: 'unknown' })
  })

  it('rejects foreign input before target lookup and before original operation recognition', async () => {
    const { journal, opened, control, recording } = await setup()
    ok(await journal.control(control))
    ok(await journal.recordControl(recording))
    const before = await observe(journal, opened.execution)
    for (const target of [control.operation, operation('missing')]) {
      expect(
        failure(
          await journal.recordControl({
            ...recording,
            target,
            toolOperation: operationRef({ tenant: otherTenant.tenant }),
          }),
        ),
      ).toEqual({ kind: 'denied', action: 'recordControl' })
    }
    expect(
      failure(await journal.recordControl({ ...recording, ...otherTenant, toolOperation })),
    ).toEqual({ kind: 'denied', action: 'recordControl' })
    const unread = () => {
      throw new Error('foreign input read the operation or target')
    }
    expect(
      failure(
        await journal.recordControl({
          ...recording,
          get operation() {
            return unread()
          },
          get target() {
            return unread()
          },
          toolOperation: operationRef({ tenant: otherTenant.tenant }),
        }),
      ),
    ).toEqual({ kind: 'denied', action: 'recordControl' })
    expect(
      failure(
        await journal.recordControl({
          ...recording,
          ...otherTenant,
          get toolOperation(): never {
            throw new Error('denied caller read the attachment')
          },
        }),
      ),
    ).toEqual({ kind: 'denied', action: 'recordControl' })
    expect(await observe(journal, opened.execution)).toEqual(before)
  })

  it('rejects attachments on nonTool targets but gives old R changed input precedence', async () => {
    const { journal, opened, control, recording } = await setup()
    ok(
      await journal.control({
        ...control,
        command: { kind: 'cancel', reason: evidence('cancel') },
      }),
    )
    const before = await observe(journal, opened.execution)
    expect(failure(await journal.recordControl({ ...recording, toolOperation }))).toEqual({
      kind: 'invalid',
      field: 'toolOperation',
      reason: 'not-applicable-to-control',
    })
    expect(await observe(journal, opened.execution)).toEqual(before)
    ok(await journal.recordControl(recording))
    const saved = await observe(journal, opened.execution)
    expect(failure(await journal.recordControl({ ...recording, toolOperation }))).toEqual({
      kind: 'conflict',
      operation: recording.operation,
    })
    expect(await observe(journal, opened.execution)).toEqual(saved)
  })

  it('conflicts when original R adds a valid or malformed attachment, or changes its stage fact', async () => {
    const { journal, opened, control, recording } = await setup()
    ok(await journal.control(control))
    const original = ok(await journal.recordControl(recording))
    const before = await observe(journal, opened.execution)
    for (const changed of [
      { toolOperation },
      { toolOperation: 'invalid' as tools.ToolOperationRef },
      { source: evidence('different') },
      { state: 'unresolved' as const },
      { target: operation('missing') },
      { stage: 'physically-stopped' as const },
    ]) {
      expect(failure(await journal.recordControl({ ...recording, ...changed }))).toEqual({
        kind: 'conflict',
        operation: recording.operation,
      })
    }
    expect(ok(await journal.recordControl(recording))).toEqual(original)
    expect(await observe(journal, opened.execution)).toEqual(before)
  })

  it('compares all semantic input when original R already attached a reference', async () => {
    const { journal, opened, control, recording } = await setup()
    ok(await journal.control(control))
    const attached = { ...recording, toolOperation }
    const original = ok(await journal.recordControl(attached))
    const before = await observe(journal, opened.execution)
    for (const changed of [
      { source: evidence('changed') },
      { state: 'unresolved' as const },
      { target: operation('missing') },
      {
        toolOperation: operationRef({ operation: ok(tools.decodeToolOperationId('replacement')) }),
      },
    ]) {
      expect(failure(await journal.recordControl({ ...attached, ...changed }))).toEqual({
        kind: 'conflict',
        operation: attached.operation,
      })
    }
    expect(ok(await journal.recordControl(attached))).toEqual(original)
    expect(await observe(journal, opened.execution)).toEqual(before)
  })

  it('attaches a background operation while advancing an unresolved stage to reached', async () => {
    const { journal, opened, control, recording } = await setup()
    ok(
      await journal.control({
        ...control,
        command: { ...control.command, kind: 'background-tool' },
      }),
    )
    ok(await journal.recordControl({ ...recording, state: 'unresolved' }))
    const before = await observe(journal, opened.execution)
    const r2 = { ...recording, operation: operation('reached'), toolOperation }
    const receipt = ok(await journal.recordControl(r2))
    const after = await observe(journal, opened.execution)
    expect(Number(after.snapshot.revision)).toBe(Number(before.snapshot.revision) + 1)
    expect(after.snapshot.controls[0]).toMatchObject({
      toolInvocation: invocation,
      toolOperation,
      stages: { 'producer-confirmed': { state: 'reached', source: recording.source } },
    })
    expect(Number(after.snapshot.output.emittedThrough)).toBe(
      Number(before.snapshot.output.emittedThrough) + 1,
    )
    expect(ok(await journal.query(r2))).toEqual({ kind: 'committed', receipt })
    expect(before.snapshot.controls[0]).toMatchObject({
      toolOperation: null,
      stages: { 'producer-confirmed': { state: 'unresolved' } },
    })
  })

  it.each([
    [
      'another local operation',
      operationRef({ operation: ok(tools.decodeToolOperationId('changed')) }),
    ],
    ['foreign operation', operationRef({ tenant: otherTenant.tenant })],
  ])(
    'retains the validated attachment when the caller replaces it with %s before settlement',
    async (_, replacement) => {
      const { memory, journal, opened, control, recording } = await setup()
      ok(await journal.control(control))
      const original = { ...recording, toolOperation }
      const input = { ...original }
      memory.failNext('recordControl', { kind: 'commit-unknown', outcome: 'pending' })
      expect(failure(await journal.recordControl(input))).toEqual({
        kind: 'commit-unknown',
        operation: original.operation,
      })
      const held = await observe(journal, opened.execution)
      expect(held.snapshot.controls[0]?.toolOperation).toBeNull()
      expect(ok(await journal.query(original))).toEqual({ kind: 'unknown' })
      input.toolOperation = replacement
      expect(memory.settle(opened.execution, original.operation, 'applied')).toBe(true)
      const after = await observe(journal, opened.execution)
      expect(after.snapshot.controls[0]?.toolOperation).toEqual(toolOperation)
      expect(Number(after.snapshot.revision)).toBe(Number(held.snapshot.revision) + 1)
      const receipt = ok(await journal.recordControl(original))
      expect(ok(await journal.query(original))).toEqual({ kind: 'committed', receipt })
      expect(
        ok(
          await journal.recordControl({
            ...original,
            toolOperation: ` ${toolOperation} ` as tools.ToolOperationRef,
          }),
        ),
      ).toEqual(receipt)
      expect(await observe(journal, opened.execution)).toEqual(after)
      expect(input.toolOperation).toBe(replacement)
      expect(held.snapshot.controls[0]?.toolOperation).toBeNull()
    },
  )

  it('retains recording identity, stage and source when a pending caller input is mutated', async () => {
    const { memory, journal, opened, control, recording } = await setup()
    ok(await journal.control(control))
    const original = { ...recording, toolOperation }
    const input = { ...original, source: { ...original.source } }
    memory.failNext('recordControl', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await journal.recordControl(input))).toEqual({
      kind: 'commit-unknown',
      operation: original.operation,
    })
    const before = await observe(journal, opened.execution)
    input.operation = operation('changed-operation')
    input.target = operation('changed-target')
    input.tenant = otherTenant.tenant
    input.stage = 'physically-stopped'
    input.state = 'unresolved'
    input.source.record = 'changed-source'
    expect(memory.settle(opened.execution, original.operation, 'applied')).toBe(true)
    const after = await observe(journal, opened.execution)
    expect(after.snapshot.controls[0]).toMatchObject({
      toolOperation,
      stages: { 'producer-confirmed': { state: 'reached', source: original.source } },
    })
    expect(after.snapshot.controls[0]?.stages).not.toHaveProperty('physically-stopped')
    expect(Number(after.snapshot.revision)).toBe(Number(before.snapshot.revision) + 1)
    const receipt = ok(await journal.recordControl(original))
    expect(ok(await journal.query(original))).toEqual({ kind: 'committed', receipt })
    expect(await observe(journal, opened.execution)).toEqual(after)
    expect(input.source.record).toBe('changed-source')
    expect(original.source.record).toBe('producer-confirmed')
    expect(before.snapshot.controls[0]?.toolOperation).toBeNull()
  })

  it('atomically attaches with R2, retains the original stage receipt and emits no duplicate event', async () => {
    const { memory, journal, opened, control, recording } = await setup()
    ok(await journal.control(control))
    const first = ok(await journal.recordControl(recording))
    const before = await observe(journal, opened.execution)
    const r2 = { ...recording, operation: operation('R2'), toolOperation }
    memory.failNext('recordControl', { kind: 'commit-unknown', outcome: 'applied' })
    expect(failure(await journal.recordControl(r2))).toEqual({
      kind: 'commit-unknown',
      operation: r2.operation,
    })
    const after = await observe(journal, opened.execution)
    const query = ok(await journal.query(r2))
    expect(query).toMatchObject({
      kind: 'committed',
      receipt: { operation: r2.operation, revision: after.snapshot.revision },
    })
    const second = ok(await journal.recordControl(r2))
    expect(query).toEqual({ kind: 'committed', receipt: second })
    expect(second).not.toEqual(first)
    expect(Number(after.snapshot.revision)).toBe(Number(before.snapshot.revision) + 1)
    expect(after.events).toEqual(before.events)
    expect(after.snapshot.controls[0]).toMatchObject({ toolInvocation: invocation, toolOperation })
    expect(ok(await journal.recordControl(recording))).toEqual(first)
    expect(
      ok(await journal.recordControl({ ...recording, operation: operation('same-stage') })),
    ).toEqual(first)
    expect(
      ok(
        await journal.recordControl({
          ...r2,
          toolOperation: ` ${toolOperation} ` as tools.ToolOperationRef,
        }),
      ),
    ).toEqual(second)
    expect(
      ok(await journal.recordControl({ ...r2, operation: operation('same-reference') })),
    ).toEqual(first)
    expect(await observe(journal, opened.execution)).toEqual(after)
    expect(before.snapshot.controls[0]).toMatchObject({ toolOperation: null })
    expect(recording).not.toHaveProperty('toolOperation')
  })

  it('preserves an omitted attachment across a new stage, and rejects replacement before stage recognition', async () => {
    const { journal, opened, control, recording } = await setup()
    ok(await journal.control(control))
    ok(await journal.recordControl({ ...recording, toolOperation }))
    const before = await observe(journal, opened.execution)
    expect(
      failure(
        await journal.recordControl({
          ...recording,
          operation: operation('replacement'),
          toolOperation: operationRef({
            operation: ok(tools.decodeToolOperationId('another-control')),
          }),
        }),
      ),
    ).toEqual({ kind: 'conflict', operation: operation('replacement') })
    expect(await observe(journal, opened.execution)).toEqual(before)
    const next = ok(
      await journal.recordControl({
        ...recording,
        operation: operation('stopped'),
        stage: 'physically-stopped',
      }),
    )
    const after = await load(journal, opened.execution)
    expect(after.controls[0]?.toolOperation).toEqual(toolOperation)
    expect(after.revision).toBe(next.revision)
    expect(Number(after.output.emittedThrough)).toBe(
      Number(before.snapshot.output.emittedThrough) + 1,
    )
  })

  it('maps malformed input before missing target and validates target before stage', async () => {
    const { journal, opened, recording } = await setup()
    const before = await observe(journal, opened.execution)
    expect(
      failure(
        await journal.recordControl({
          ...recording,
          toolOperation: 'invalid' as tools.ToolOperationRef,
        }),
      ),
    ).toEqual({
      kind: 'invalid',
      field: 'toolOperation',
      reason: 'malformed-tool-operation-reference',
    })
    expect(failure(await journal.recordControl({ ...recording, toolOperation }))).toEqual({
      kind: 'invalid',
      field: 'target',
      reason: 'not a control of this execution',
    })
    expect(await observe(journal, opened.execution)).toEqual(before)
  })

  it.each([
    [
      'malformed',
      'invalid' as tools.ToolInvocationRef,
      {
        kind: 'unavailable',
        owner: 'AgentJournal',
        diagnostic: 'invalid-retained-tool-invocation',
      },
    ],
    [
      'foreign',
      ok(tools.encodeToolInvocationRef({ ...parts, tenant: otherTenant.tenant })),
      { kind: 'denied', action: 'recordControl' },
    ],
  ])(
    'contains injected %s retained-snapshot corruption at a new R',
    async (_, reference, expected) => {
      const { journal, opened, control, recording } = await setup([{ ...associated, reference }])
      const resolver = vi
        .spyOn(tools, 'resolveToolInvocationRef')
        .mockReturnValueOnce({ ok: parts })
      ok(await journal.control(control))
      resolver.mockReturnValueOnce({ ok: parts })
      const original = ok(await journal.recordControl(recording))
      resolver.mockRestore()
      const before = await observe(journal, opened.execution)
      expect(ok(await journal.recordControl(recording))).toEqual(original)
      expect(
        failure(
          await journal.recordControl({
            ...recording,
            operation: operation('new-R'),
            toolOperation,
          }),
        ),
      ).toEqual(expected)
      expect(await observe(journal, opened.execution)).toEqual(before)
    },
  )
})

it('does not attach a reference when the stage is inapplicable or a reached fact changes', async () => {
  const { journal, opened, control, recording } = await setup()
  ok(await journal.control(control))
  const before = await observe(journal, opened.execution)
  expect(
    failure(
      await journal.recordControl({ ...recording, stage: 'qualification-revoked', toolOperation }),
    ),
  ).toEqual({ kind: 'invalid', field: 'stage', reason: 'not a stage of interrupt-tool' })
  expect(await observe(journal, opened.execution)).toEqual(before)
  ok(await journal.recordControl(recording))
  const saved = await observe(journal, opened.execution)
  expect(
    failure(
      await journal.recordControl({
        ...recording,
        operation: operation('changed-stage'),
        source: evidence('changed'),
        toolOperation,
      }),
    ),
  ).toEqual({ kind: 'conflict', operation: operation('changed-stage') })
  expect(await observe(journal, opened.execution)).toEqual(saved)
})
