// The commands that suspend a call, take its decision and resume it answer `denied` to a principal
// the access guard does not allow on the call, before they judge a field or write a record. The
// value the decision owner resolves is one of three closed shapes; any other one is refused.
import { afterEach, describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type { ToolWaitId } from '@omne-harness/tool-contract'
import { askingAuthor, checkpointBinding, scriptedBridge } from './checkpoint-values.ts'
import {
  callId,
  evidence,
  ok,
  operationId,
  principalA,
  principalB,
  tenantA,
} from './runtime-values.ts'
import { admitCall, auditQueues, startHarness, testAuthority } from './start-values.ts'

afterEach(auditQueues)

const FIRST = 'op-c1/start/wait' as ToolWaitId
const OWNER = { principal: principalA, tenant: tenantA, call: callId('c1') }
/** The same tenant and call, named by a principal of another tenant. */
const STRANGER = { ...OWNER, principal: principalB }

/** `c1` admitted and run to its first wait: suspended, with the wait registered. */
async function suspended() {
  const authority = testAuthority()
  const checkpoint = checkpointBinding(authority, askingAuthor())
  const released = { kind: 'released', evidence: evidence('environment-released') } as const
  const bridge = scriptedBridge('registers')
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
  })
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 2))
    quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
  }
  expect((await harness.state('c1')).phase).toBe('suspended')
  return Object.assign(harness, { bridge })
}

describe('a principal the guard does not allow on the call', () => {
  it('is denied by every suspension and resumption command, and nothing is written', async () => {
    const harness = await suspended()
    const recovery = ok(await harness.commands.loadRecovery(OWNER))
    const state = await harness.state('c1')
    /** The write fields of the suspended call as its owner would send them. */
    const write = (operation: string) => ({
      ...STRANGER,
      instance: recovery.execution?.instance as never,
      generation: '1',
      operation: operationId(operation),
      expected: state.revision,
    })
    const checkpoint = evidence('checkpoint/op-c1/start', 'test-host')
    const commits = harness.memory.commits
    const answers = {
      planSuspension: await harness.commands.planSuspension({
        ...write(`${FIRST}/resume/suspension`),
        start: evidence('start'),
        schema: { id: 'state', revision: '1', digest: 'sha256:state' },
      } as never),
      suspend: await harness.commands.suspend({
        ...write(`${FIRST}/resume/suspended`),
        suspension: {},
        checkpoint: {},
        state: '',
      } as never),
      attachRegistration: await harness.commands.attachRegistration({
        ...write(`${FIRST}/attach`),
        wait: FIRST,
        registration: evidence('registration', 'test-decisions'),
      }),
      acceptDecision: await harness.commands.acceptDecision({
        ...STRANGER,
        operation: operationId(`${FIRST}/accept`),
        wait: FIRST,
        decision: evidence(`decision/${FIRST}`, 'test-decisions'),
      }),
      prepareResume: await harness.commands.prepareResume({
        ...write(`${FIRST}/resume`),
        checkpoint,
      }),
      closeWait: await harness.commands.closeWait({
        ...write(`${FIRST}/close`),
        wait: FIRST,
        continuation: evidence('continued'),
      }),
    }
    for (const [command, answer] of Object.entries(answers))
      expect(answer, command).toMatchObject({ failure: { kind: 'denied' } })
    expect(harness.memory.commits).toBe(commits)
    expect(await harness.state('c1')).toEqual(state)
  })

  it('the owner of the call is not denied by the same commands', async () => {
    // The same fields under the owner pass the guard: each answer is the judgment of its fields.
    const harness = await suspended()
    const recovery = ok(await harness.commands.loadRecovery(OWNER))
    const state = await harness.state('c1')
    const closed = await harness.commands.closeWait({
      ...OWNER,
      instance: recovery.execution?.instance as never,
      generation: '1',
      operation: operationId(`${FIRST}/close`),
      expected: state.revision,
      wait: FIRST,
      continuation: evidence('continued'),
    })
    expect(closed).toHaveProperty('failure')
    expect(closed).not.toMatchObject({ failure: { kind: 'denied' } })
  })
})

describe('a field of the owner that is not what the command takes', () => {
  it('is named by the command, and nothing is written', async () => {
    const harness = await suspended()
    const recovery = ok(await harness.commands.loadRecovery(OWNER))
    const state = await harness.state('c1')
    const write = (operation: string) => ({
      ...OWNER,
      instance: recovery.execution?.instance as never,
      generation: '1',
      operation: operationId(operation),
      expected: state.revision,
    })
    const decision = evidence(`decision/${FIRST}`, 'test-decisions')
    const accept = { ...OWNER, operation: operationId(`${FIRST}/accept`), wait: FIRST, decision }
    const close = { ...write(`${FIRST}/close`), wait: FIRST, continuation: evidence('continued') }
    const commits = harness.memory.commits
    const answers = [
      ['wait', await harness.commands.acceptDecision({ ...accept, wait: 7 as never })],
      ['decision', await harness.commands.acceptDecision({ ...accept, decision: 'x' as never })],
      ['operation', await harness.commands.acceptDecision({ ...accept, operation: '' as never })],
      [
        'checkpoint',
        await harness.commands.prepareResume({
          ...write(`${FIRST}/resume`),
          checkpoint: 'checkpoint' as never,
        }),
      ],
      ['wait', await harness.commands.closeWait({ ...close, wait: 7 as never })],
      ['continuation', await harness.commands.closeWait({ ...close, continuation: null as never })],
    ] as const
    for (const [field, answer] of answers)
      expect(answer).toMatchObject({ failure: { kind: 'invalid', field } })
    expect(harness.memory.commits).toBe(commits)
  })
})

describe('the value the decision owner resolves', () => {
  const accept = async (value: unknown) => {
    const harness = await suspended()
    harness.bridge.decide(FIRST, value as never)
    const commits = harness.memory.commits
    const answer = await harness.commands.acceptDecision({
      ...OWNER,
      operation: operationId(`${FIRST}/accept`),
      wait: FIRST,
      decision: evidence(`decision/${FIRST}`, 'test-decisions'),
    })
    return { answer, wrote: harness.memory.commits !== commits }
  }
  const refused = (field: string, reason: string) => ({
    answer: { failure: { kind: 'invalid', field, reason } },
    wrote: false,
  })

  it.each([
    ['a text', 'answer', refused('decision', 'type')],
    ['a number', 7, refused('decision', 'type')],
    ['null', null, refused('decision', 'type')],
    ['an unknown kind', { kind: 'timeout' }, refused('decision', 'not-a-decision')],
    ['no kind', {}, refused('decision', 'not-a-decision')],
    [
      'a decline with a second member',
      { kind: 'declined', value: 1 },
      refused('decision', 'not-a-decision'),
    ],
    [
      'a no-answer with a second member',
      { kind: 'no-answer', note: '' },
      refused('decision', 'not-a-decision'),
    ],
    ['an answer without a value', { kind: 'answer' }, refused('decision', 'not-a-decision')],
    [
      'an answer whose second member is not the value',
      { kind: 'answer', text: 'a' },
      refused('decision', 'not-a-decision'),
    ],
    [
      'an answer with a third member',
      { kind: 'answer', value: { kind: 'string', value: 'a' }, note: '' },
      refused('decision', 'not-a-decision'),
    ],
  ])('%s is refused and nothing is written', async (_name, value, expected) => {
    expect(await accept(value)).toEqual(expected)
  })

  it('an answer whose value is not a tagged JSON tree names the value', async () => {
    const { answer, wrote } = await accept({ kind: 'answer', value: 'bare text' })
    expect(answer).toMatchObject({ failure: { kind: 'invalid', field: 'decision.value' } })
    expect(wrote).toBe(false)
  })

  it.each([
    [{ kind: 'declined' }],
    [{ kind: 'no-answer' }],
    [{ kind: 'answer', value: { kind: 'string', value: 'a.txt' } }],
  ])('%j is accepted', async value => {
    const { answer, wrote } = await accept(value)
    expect(answer).toHaveProperty('ok')
    expect(wrote).toBe(true)
  })
})
