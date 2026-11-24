import { afterEach, describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type { DecisionValue, ToolWaitId } from '@omne-harness/tool-contract'
import {
  CLOSED_RESULT,
  asking,
  askingAuthor,
  checkpointBinding,
  scriptedBridge,
} from './checkpoint-values.ts'
import { decideControl } from '../src/ledger-control.ts'
import { controlCommand } from './control-decider-values.ts'
import {
  committed,
  mintOf,
  snapshotOfCall,
  withCall,
  type Record_,
} from './resumption-decider-values.ts'
import { callId, evidence, ok, operationId, principalA, tenantA } from './runtime-values.ts'
import { askContract } from './scope-values.ts'
import { admitCall, auditQueues, startHarness, testAuthority } from './start-values.ts'

afterEach(auditQueues)

const WAIT = 'op-c1/start/wait' as ToolWaitId
const ACCESS = { principal: principalA, tenant: tenantA, call: callId('c1') }
const text = (value: string) => ({ kind: 'string', value }) as const

/** Two request contracts of the same kind of wait: the one of a person's decision, and the one of another agent's report. */
const CONTRACTS = [
  ['the decision of a person', 'person-decision'],
  ['the report of another agent', 'agent-report'],
] as const

type Options = Parameters<typeof startHarness>[0]

function setup(name: string, options: Partial<Options> = {}) {
  const contract = askContract(1_024, name)
  const authority = testAuthority()
  const author = askingAuthor(() => Promise.resolve(asking('{"waiting":true}', 'go on?', contract)))
  const checkpoint = checkpointBinding(authority, author)
  const bridge = scriptedBridge('registers')
  const released = { kind: 'released', evidence: evidence('environment-released') } as const
  const harness = startHarness({
    authority,
    bindingsPort: () => checkpoint.bindings,
    decisions: bridge,
    driverRetryDelayMs: 5,
    environmentsPort: base =>
      Object.assign(base, {
        release: () => Promise.resolve(succeed(released)),
        inspectRelease: () => Promise.resolve(succeed(released)),
      }),
    ...options,
  })
  return { harness, bridge, author, contract }
}

type Built = ReturnType<typeof setup>

async function settle(harness: Built['harness']): Promise<void> {
  for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 2))
    quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
  }
}

async function suspended(name: string, options: Partial<Options> = {}): Promise<Built> {
  const built = setup(name, options)
  await admitCall(built.harness, 'c1')
  await built.harness.drive('c1')
  await settle(built.harness)
  expect((await built.harness.state('c1')).phase).toBe('suspended')
  return built
}

const recovery = async (harness: Built['harness']) =>
  ok(await harness.commands.loadRecovery(ACCESS))

const cancel = async (commands: Built['harness']['commands']) =>
  ok(
    await commands.control({
      ...ACCESS,
      operation: operationId('stop-c1'),
      intent: { kind: 'stop' },
    }),
  )

const accept = (commands: Built['harness']['commands']) =>
  commands.acceptDecision({
    ...ACCESS,
    operation: operationId(`${WAIT}/accept`),
    wait: WAIT,
    decision: evidence(`decision/${WAIT}`, 'test-decisions'),
  })

describe.each(CONTRACTS)('a wait for %s goes the one path of a wait', (_label, name) => {
  it('suspends under its own request contract and registers the wait with the owner of the decision', async () => {
    const { harness, bridge, contract } = await suspended(name)
    const read = await recovery(harness)
    expect(read.waits).toMatchObject([
      {
        phase: 'open',
        intent: { kind: 'ask', wait: WAIT, schemas: { contract: contract.adoption } },
      },
    ])
    expect(contract.adoption.name).toBe(name)
    expect(bridge.ensured.map(item => item.wait)).toEqual([WAIT])
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'parked' }])
  })

  it('resumes once with the answer the owner resolved, and closes the wait as continued', async () => {
    const built = await suspended(name)
    const decision: DecisionValue = { kind: 'answer', value: text('the answer') }
    built.bridge.decide(WAIT, decision)
    await built.harness.drive('c1')
    await settle(built.harness)
    await built.harness.drive('c1')
    await settle(built.harness)
    expect(await built.harness.state('c1')).toMatchObject({
      phase: 'settled',
      terminal: { kind: 'completed' },
    })
    expect(built.author.resumed.map(input => input.response)).toEqual([decision])
    expect(built.bridge.resolved).toEqual([WAIT])
    expect((await recovery(built.harness)).waits).toMatchObject([
      { phase: 'closed', cause: 'continued' },
    ])
  })

  it('does not go to the background while it waits, although its definition permits the background', async () => {
    const built = await suspended(name)
    const snapshot = withCall(await snapshotOfCall(built.harness), record => {
      const request = record.request as Record_
      const availability = request.availability as Record_
      const definition = { ...(availability.definition as Record_), backgroundAllowed: true }
      return { ...record, request: { ...request, availability: { ...availability, definition } } }
    })
    const decision = decideControl(
      snapshot,
      controlCommand({ kind: 'background', otherwise: 'reject' }, {}),
      null,
      mintOf(snapshot),
    )
    if (decision.kind === 'prepare-synthetic')
      throw new Error('a background control prepares no result')
    expect(committed(decision).value.progress).toMatchObject({
      kind: 'rejected',
      reason: 'ask-wait',
    })
    expect((await recovery(built.harness)).waits).toMatchObject([{ phase: 'open' }])
  })

  it('ends as interrupted with the closing text when control closes the wait, and tells the owner', async () => {
    const built = await suspended(name)
    await cancel(built.harness.commands)
    await built.harness.drive('c1')
    await settle(built.harness)
    const state = await built.harness.state('c1')
    expect(state).toMatchObject({ phase: 'settled', terminal: { kind: 'interrupted' } })
    if (state.phase !== 'settled') throw new Error('the call is not settled')
    const result = await built.harness.ledger.reads.result({
      ...ACCESS,
      result: state.result,
      after: null,
    })
    expect(JSON.stringify(ok(result))).toContain(CLOSED_RESULT)
    expect((await recovery(built.harness)).waits).toMatchObject([
      { phase: 'closed', cause: 'cancelled' },
    ])
    expect(built.bridge.invalidated.map(item => item.wait)).toEqual([WAIT])
    expect(built.author.resumed).toEqual([])
  })

  it('does not take an answer that comes after the wait was closed', async () => {
    const built = await suspended(name)
    built.bridge.decide(WAIT, { kind: 'answer', value: text('late') })
    await cancel(built.harness.commands)
    expect(await accept(built.harness.commands)).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'phase:settled' },
    })
    expect(built.bridge.resolved).toEqual([])
    expect(built.author.resumed).toEqual([])
  })

  it('lets exactly one of the two hold when the wait closes while the answer is being taken', async () => {
    const bridge = scriptedBridge('registers')
    const late: { commands: Built['harness']['commands'] | null } = { commands: null }
    const built = await suspended(name, {
      decisions: {
        ...bridge,
        resolve: async input => {
          const resolved = await bridge.resolve(input)
          if (late.commands === null) throw new Error('the harness is not built')
          await cancel(late.commands)
          return resolved
        },
      },
    })
    late.commands = built.harness.commands
    bridge.decide(WAIT, { kind: 'answer', value: text('late') })
    expect(await accept(built.harness.commands)).toMatchObject({
      failure: { kind: 'invalid', reason: 'phase:settled' },
    })
    const read = await recovery(built.harness)
    expect(read.waits).toMatchObject([{ phase: 'closed', cause: 'cancelled' }])
    await built.harness.drive('c1')
    await settle(built.harness)
    expect(built.author.resumed).toEqual([])
    expect(await built.harness.state('c1')).toMatchObject({
      terminal: { kind: 'interrupted' },
    })
  })
})
