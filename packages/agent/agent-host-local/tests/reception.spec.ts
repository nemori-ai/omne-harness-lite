// The Model result receiver of the `agent-host` plugin on real Cordis 4.0.4 (SPEC "结果接收"; IC-13;
// R2-D237): the plugin body registers it with the Model runtime under the Agent consumer owner, the
// ordered stop and the fiber end remove the registration, and the host drives its maintenance.
//
// The Model is the scripted provider and pusher of `@omne-harness/model-contract/testing`, made to
// resolve its receiver from the Model runtime's table as a Model runtime does (`pushTo: 'host'`), so
// a push reaches only what the host registered. Journal, access check and outlet are the memory
// doubles of `@omne-harness/agent/testing` and agent-contract. Nothing here proves the real Model
// host, the session-log Journal or a process restart; `apps/harness-server` composes those.
import { AGENT_CONSUMER_OWNER, agentEvaluator } from '@omne-harness/agent'
import { testAdoption } from '@omne-harness/agent/testing'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  type AcceptedInput,
  type AgentAccountOutcome,
  type AgentAccountOutlet,
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
  decodeResultVersion,
  resolveModelInvocationRef,
} from '@omne-harness/model-contract'
import { afterEach, describe, expect, it } from 'vitest'
import {
  caller,
  definitions,
  hostConfig,
  ok,
  openWorld,
  slotOf,
  type Principal,
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
const EXECUTION: AgentExecutionId = ok(decodeAgentExecutionId('reception-execution'))
const REPLY = 'the reply the receiver saved'
const RETRY_MS = 1000

const conditions: RuntimeConditions = {
  source: evidence('conditions'),
  configuration: adoption('configuration'),
  progression: { kind: 'evaluate-completion', basis: evidence('progression') },
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
    id: `msg_${'e'.repeat(24)}`,
    role: 'user',
    blocks: [
      { kind: 'text', id: 'blk_1', visibility: { toHuman: true, toModel: true }, text: 'go' },
    ],
  })
  if (!('ok' in judged)) throw new Error('fixture message refused')
  return {
    id: ok(decodeInputId('reception-input')),
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

/** A host whose pusher resolves from the Model runtime's table, with EXECUTION waiting at M1. */
async function waitingAtM1(outlet?: AgentAccountOutlet<Principal>) {
  const host = await openWorld({
    stages: true,
    pushTo: 'host',
    config: { ...hostConfig, reception: { ...RECEPTION, retryMs: RETRY_MS } },
    ...(outlet === undefined ? {} : { outlet }),
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
  await host.host
  host.controls.adoptions.define(definitions.first, {
    definition: { category: 'AgentDefinition', name: 'reception', references: [], attributes: [] },
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
      operation: ok(decodeAgentOperationId('reception-invoke')),
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
  return { host, load }
}

const RECEPTION = {
  records: 64,
  bytes: 1 << 20,
  attachments: 64,
  inFlight: 8,
  retryMs: RETRY_MS,
  retryMaxMs: 8 * RETRY_MS,
}

/** Settles the open Model call with one text and an account; the pusher pushes it at once. */
async function settleReply(host: World, snapshot: ExecutionSnapshot) {
  const pending = snapshot.checkpoint.calls.find(call => call.kind === 'model')
  if (pending?.kind !== 'model') throw new Error('no Model call is open')
  const { call, admission } = ok(resolveModelInvocationRef(pending.reference, caller('a').tenant))
  const dispatch = ok(decodeDispatchId('mdisp_reception'))
  host.controls.models.start({ ...caller('a'), call, dispatch, firstContent: 'observed' })
  host.controls.models.recordDispatch({
    ...caller('a'),
    call,
    record: {
      dispatch,
      supplier: {
        adoption: adoption('supplier'),
        recipient: 'recipient',
        model: 'model',
        credential: { kind: 'factory' },
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
    version: ok(decodeResultVersion('mrver_reception')),
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
    source: evidence('model-reception'),
    pageSize: 10,
    pageTargetBytes: 65536,
  })
  const pusher = host.controls.pusher
  if (pusher === null) throw new Error('the Model pusher is missing')
  return { call, pusher, record: await pusher.settled({ ...caller('a'), call }) }
}

const receivedResults = (snapshot: ExecutionSnapshot) =>
  (snapshot.entries ?? []).filter(
    entry => entry.kind === 'received' && entry.delivery.key.kind === 'result',
  )

describe('the Model result receiver of the host plugin', () => {
  // Red when the plugin body stops registering the receiver: the push then finds none and the
  // execution stays waiting at M1 on its Model call.
  it('registers under the Agent consumer owner, and a pushed reply takes the execution past M1', async () => {
    const { host, load } = await waitingAtM1()
    expect(host.receivers.resolve(AGENT_CONSUMER_OWNER)).not.toBeNull()
    const { record } = await settleReply(host, await load())
    expect(record.status).toBe('saved')
    await until(async () => (await load()).state.kind === 'ended')
    const ended = await load()
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(receivedResults(ended)).toHaveLength(1)
    expect(ended.checkpoint.calls.filter(call => call.kind === 'model')).toEqual([])
  })

  // Red when the ordered stop leaves the registration in place: a push during the shutdown would
  // still reach a host that is stopping.
  it('the ordered stop removes the registration; a reply pushed afterwards finds no receiver', async () => {
    const { host, load } = await waitingAtM1()
    await host.plugin.quiesceAll({ signal: AbortSignal.timeout(2000) })
    expect(host.receivers.resolve(AGENT_CONSUMER_OWNER)).toBeNull()
    const { record } = await settleReply(host, await load())
    expect(record).toMatchObject({ status: 'failed', failure: { kind: 'no-receiver' } })
    expect(receivedResults(await load())).toEqual([])
  })

  // Red when the receiver state or the registration does not come back with the plugin body, or
  // when the saved delivery is committed a second time on the redelivery.
  it('a reply pushed while the host was down is saved once after the host comes back', async () => {
    const { host, load } = await waitingAtM1()
    await host.host.dispose()
    expect(host.receivers.resolve(AGENT_CONSUMER_OWNER)).toBeNull()
    const { record, pusher } = await settleReply(host, await load())
    expect(record).toMatchObject({ status: 'failed', failure: { kind: 'no-receiver' } })

    const again = host.root.plugin(host.plugin, {
      ...hostConfig,
      reception: RECEPTION,
    })
    await again
    expect(host.receivers.resolve(AGENT_CONSUMER_OWNER)).not.toBeNull()
    expect((await pusher.redeliver(record.key)).status).toBe('saved')
    expect((await pusher.redeliver(record.key)).status).toBe('saved')
    expect(receivedResults(await load())).toHaveLength(1)
  })

  // Red when the host does not drive the maintenance: the account the outlet could not take stays
  // pending. It also shows that the outlet's `unavailable` (the release outlet answers
  // `scope-unresolved`) does not keep the receiver from answering `saved`.
  it('answers saved while the outlet is unavailable, and the driven retry delivers the account later', async () => {
    const answers: AgentAccountOutcome[] = [
      { kind: 'unavailable', diagnostic: 'scope-unresolved' },
      { kind: 'received' },
    ]
    const delivered: unknown[] = []
    const outlet: AgentAccountOutlet<Principal> = {
      async deliver(given) {
        delivered.push(given.handoff)
        return answers.shift() ?? { kind: 'received' }
      },
    }
    const { host, load } = await waitingAtM1(outlet)
    const { record } = await settleReply(host, await load())
    expect(record.status).toBe('saved')
    await until(() => delivered.length === 1)
    // Nothing happens before the clock reaches the first wait of the driver.
    host.advance(RETRY_MS - 1)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(delivered).toHaveLength(1)
    host.advance(1)
    await until(() => delivered.length === 2)
    expect(delivered[1]).toEqual(delivered[0])
    const receiver = host.receivers.resolve(AGENT_CONSUMER_OWNER) as unknown as {
      inspect(): { pending: number }
    }
    await until(() => receiver.inspect().pending === 0)
  })
})
