import { agentEvaluator } from '@omne-harness/agent'
import { testAdoption } from '@omne-harness/agent/testing'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  type AcceptedInput,
  type AgentExecutionId,
  type ExecutionSnapshot,
  type RuntimeConditions,
  type SelectedModel,
} from '@omne-harness/agent-contract'
import {
  createTestCancellationPolicy,
  testCancellationPolicyInstallation,
} from '@omne-harness/agent-contract/testing'
import type { BlockId } from '@omne-harness/content-block'
import { judgeMessage } from '@omne-harness/message'
import {
  decodeDispatchId,
  decodeProviderName,
  decodeResultVersion,
  resolveModelInvocationRef,
} from '@omne-harness/model-contract'
import { afterEach, describe, expect, it } from 'vitest'
import {
  caller,
  definitions,
  entriesOf,
  ok,
  openWorld,
  slotOf,
  type World,
} from './host-support.ts'

const opened: World[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.dispose()
})

const evidence = (record: string) => ({
  owner: 'host-test',
  record,
  revision: '1',
  digest: `test:${record}`,
})
const adoption = (name: string) => ({
  owner: 'host-test',
  name,
  revision: '1',
  digest: `test:${name}`,
})
const operation = (text: string) => ok(decodeAgentOperationId(text))
const EXECUTION: AgentExecutionId = ok(decodeAgentExecutionId('controlled-execution'))
const REPLY = 'the reply that was in flight'

const conditions: RuntimeConditions = {
  source: evidence('conditions'),
  configuration: adoption('configuration'),
  progression: { kind: 'continue', basis: evidence('progression') },
  model: adoption('model'),
  context: evidence('context'),
  bindings: [],
}

const selected = {
  recipient: { route: 'route-1', profile: testAdoption('profile') },
  resolution: { kind: 'resolved', selectable: true },
  parameters: [],
  tools: evidence('tools'),
  evidence: evidence('selected'),
} as unknown as SelectedModel

function input(): AcceptedInput {
  const judged = judgeMessage({
    id: `msg_${'c'.repeat(24)}`,
    role: 'user',
    blocks: [
      { kind: 'text', id: 'blk_1', visibility: { toHuman: true, toModel: true }, text: 'go' },
    ],
  })
  if (!('ok' in judged)) throw new Error('fixture message refused')
  return {
    id: ok(decodeInputId('control-input')),
    content: judged.ok,
    source: null,
    priority: 'ordinary',
  }
}

async function until(probe: () => boolean | Promise<boolean>, ms = 10_000): Promise<void> {
  const end = Date.now() + ms
  while (!(await probe())) {
    if (Date.now() > end) throw new Error('the condition never held')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

const cancel = (tenant: 'a' | 'b', name: string) => ({
  ...caller(tenant),
  execution: EXECUTION,
  operation: operation(name),
  command: { kind: 'cancel' as const, reason: evidence(name) },
})

async function running() {
  const host = await openWorld({
    stages: true,
    dependencies: {
      journal: {
        cancellation: {
          installation: testCancellationPolicyInstallation,
          policy: createTestCancellationPolicy(),
        },
      },
      receivingPrincipal: caller('a').principal,
    },
  })
  opened.push(host)
  host.controls.adoptions.define(definitions.first, {
    definition: { category: 'AgentDefinition', name: 'control', references: [], attributes: [] },
    evaluator: agentEvaluator,
    extensions: [],
  })
  host.controls.conditions.define(EXECUTION, conditions)
  host.controls.selection.select.always(() => ({ ok: selected }))
  const { instance } = ok(await host.provision.acquire(slotOf('a')))
  const runtime = ok(await host.directory.resolve({ ...caller('a'), instance }))
  ok(
    await runtime.invoke({
      ...caller('a'),
      execution: EXECUTION,
      operation: operation('controlled-invoke'),
      initial: input(),
      grant: null,
    }),
  )
  const load = async (): Promise<ExecutionSnapshot> =>
    ok(await host.controls.journal.port.load({ ...caller('a'), execution: EXECUTION }))
  await until(async () => {
    const snapshot = await load()
    return snapshot.state.kind === 'waiting' && snapshot.checkpoint.calls.length > 0
  })
  return { host, instance, load }
}

async function deliverReply(host: World, snapshot: ExecutionSnapshot) {
  const pending = snapshot.checkpoint.calls.find(call => call.kind === 'model')
  if (pending?.kind !== 'model') throw new Error('no Model call is open')
  const { call, admission } = ok(resolveModelInvocationRef(pending.reference, caller('a').tenant))
  const dispatch = ok(decodeDispatchId('mdisp_control'))
  host.controls.models.start({ ...caller('a'), call, dispatch, firstContent: 'observed' })
  host.controls.models.recordDispatch({
    ...caller('a'),
    call,
    record: {
      dispatch,
      supplier: {
        adoption: adoption('supplier'),
        provider: ok(decodeProviderName('recipient')),
        model: 'model',
        credential: { layer: 'official' },
      },
      intent: admission,
      send: 'started',
      firstContent: 'observed',
      terminal: { kind: 'completed', reason: 'stop' },
      account: {
        subject: { kind: 'model_call', id: call },
        usage: [{ name: 'input', state: 'known', lexeme: '17', unit: 'token' }],
        cost: [],
        trimmed: { state: 'unknown', unit: 'token' },
        place: 'suite',
        duration: { state: 'unknown' },
        receipt: 'received',
        revision: '0',
      },
      materialization: null,
    },
  })
  host.controls.models.settle({
    ...caller('a'),
    call,
    version: ok(decodeResultVersion('mrver_control')),
    termination: { kind: 'completed', reason: 'stop' },
    parts: [
      {
        kind: 'sealed',
        trims: [],
        block: {
          kind: 'text',
          id: 'blk_r' as BlockId,
          visibility: { toHuman: true, toModel: true },
          text: REPLY,
        },
      },
    ],
    source: evidence('model-control'),
    pageSize: 10,
    pageTargetBytes: 65536,
  })
  if (host.controls.pusher === null) throw new Error('the Model pusher is missing')
  await host.controls.pusher.settled({ ...caller('a'), call })
  return call
}

describe('the control entry on an execution that a runtime of this host runs', () => {
  it('establishes a cancellation before it answers, and the Loop sends no further Model request', async () => {
    const { host, load } = await running()
    expect(host.admits).toHaveLength(1)
    const sent = host.admits.length

    const receipt = ok(await host.control.control(cancel('a', 'cancel-live')))
    expect(receipt.operation).toBe(operation('cancel-live'))
    const established = (await load()).controls.find(
      record => record.operation === operation('cancel-live'),
    )
    expect(established?.stages['intent-established']?.state).toBe('reached')
    expect(established?.stages['qualification-revoked']?.state).toBe('reached')

    await until(async () => (await load()).settlement.judgments.length > 0)
    const call = await deliverReply(host, await load())
    await until(async () => (await load()).state.kind === 'ended')
    const ended = await load()
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'cancelled' } })
    expect(host.admits.length - sent).toBe(0)

    const entries = await entriesOf(host.controls.journal.provider.entries, {
      ...caller('a'),
      execution: EXECUTION,
    })
    const received = entries.find(
      entry => entry.kind === 'received' && entry.delivery.key.kind === 'result',
    )
    if (received?.kind !== 'received') throw new Error('the in-flight result was not kept')
    const material = ok(
      await host.controls.journal.provider.materials.read({
        ...caller('a'),
        source: received.material,
      }),
    )
    expect(JSON.stringify(material)).toContain(REPLY)
    const models = host.root.get('modelRuntime')
    if (models === undefined) throw new Error('no Model runtime is provided')
    const dispatches = ok(await models.calls.dispatches({ ...caller('a'), call }))
    expect(dispatches.map(record => record.account?.usage)).toEqual([
      [{ name: 'input', state: 'known', lexeme: '17', unit: 'token' }],
    ])
  })

  it('writes nothing again on a retry of the same control operation', async () => {
    const { host, load } = await running()
    const first = ok(await host.control.control(cancel('a', 'cancel-retried')))
    await until(async () => (await load()).settlement.judgments.length > 0)
    await deliverReply(host, await load())
    await until(async () => (await load()).state.kind === 'ended')
    const before = await load()

    const retry = () => host.control.control(cancel('a', 'cancel-retried'))
    expect(await retry()).toEqual({ ok: first })
    expect(await retry()).toEqual({ ok: first })
    const after = await load()
    expect(after.revision).toBe(before.revision)
    expect(after.controls).toEqual(before.controls)
  })

  it('still refuses another tenant and a refused principal, and saves no control', async () => {
    const { host, load } = await running()
    expect(await host.control.control(cancel('b', 'cancel-foreign'))).toMatchObject({
      failure: { kind: 'denied' },
    })
    host.refuseNext('control')
    expect(await host.control.control(cancel('a', 'cancel-refused'))).toEqual({
      failure: { kind: 'denied', action: 'control' },
    })
    const snapshot = await load()
    expect(snapshot.controls).toEqual([])
    expect(snapshot.state.kind).toBe('waiting')
  })

  it('advances nothing for a request the principal check refused: the Journal is not asked at all', async () => {
    const { host, load } = await running()
    const intruder = { ...caller('a'), principal: 'intruder' }
    host.refuseNext('control', intruder.principal)
    expect(await host.control.control({ ...cancel('a', 'cancel-intruder'), ...intruder })).toEqual({
      failure: { kind: 'denied', action: 'control' },
    })
    expect(host.journalCalls.filter(call => call.principal === intruder.principal)).toEqual([])
    expect((await load()).controls).toEqual([])
  })
})
