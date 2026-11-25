import { AGENT_CONSUMER_OWNER, agentEvaluator } from '@omne-harness/agent'
import { testAdoption } from '@omne-harness/agent/testing'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  type AcceptedInput,
  type AgentClock,
  type AgentExecutionId,
  type AgentJournalEntries,
  type AgentJournalEntry,
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
  hostConfig,
  ok,
  openWorld,
  slotOf,
  type World,
  entriesOf,
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
const REJECTED_400 = {
  cause: 'input-rejected' as const,
  diagnostic: 'the supplier answered 400',
  upstreamStatus: '400',
}

const conditions: RuntimeConditions = {
  source: evidence('conditions'),
  configuration: adoption('configuration'),
  progression: { kind: 'evaluate-completion', basis: evidence('progression') },
  model: adoption('model'),
  context: evidence('context'),
  bindings: [],
  segments: [],
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

type HostOptions = Readonly<{
  clock?: (port: AgentClock) => AgentClock
  reception?: Partial<typeof RECEPTION>
}>

async function waitingAtM1(given: HostOptions = {}) {
  const host = await openWorld({
    stages: true,
    pushTo: 'host',
    config: { ...hostConfig, reception: { ...RECEPTION, ...given.reception } },
    ...(given.clock === undefined ? {} : { clock: given.clock }),
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
    definition: {
      category: 'AgentDefinition',
      type: 'master',
      summary: 'Works on what the person asks for.',
      name: 'reception',
      references: [],
      attributes: [],
    },
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

type Answer = 'reply' | 'rejected-400'

async function settleReply(host: World, snapshot: ExecutionSnapshot, answer: Answer = 'reply') {
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
        provider: ok(decodeProviderName('recipient')),
        model: 'model',
        credential: { layer: 'official' },
      },
      intent: admission,
      send: 'started',
      firstContent: 'observed',
      terminal:
        answer === 'reply'
          ? { kind: 'completed', reason: 'stop' }
          : { kind: 'failed', fault: REJECTED_400 },
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
    termination:
      answer === 'reply'
        ? { kind: 'completed', reason: 'stop' }
        : { kind: 'failed', fault: REJECTED_400 },
    parts:
      answer === 'rejected-400'
        ? []
        : [
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

const entries = (
  host: Readonly<{
    controls: { journal: { provider: { entries: AgentJournalEntries<unknown> } } }
  }>,
) => entriesOf(host.controls.journal.provider.entries, { ...caller('a'), execution: EXECUTION })

const receivedResults = (entries: readonly AgentJournalEntry[]) =>
  entries.filter(entry => entry.kind === 'received' && entry.delivery.key.kind === 'result')

describe('the Model result receiver of the host plugin', () => {
  it('registers under the Agent consumer owner, and a pushed reply takes the execution past M1', async () => {
    const { host, load } = await waitingAtM1()
    expect(host.receivers.resolve(AGENT_CONSUMER_OWNER)).not.toBeNull()
    const { record } = await settleReply(host, await load())
    expect(record.status).toBe('saved')
    await until(async () => (await load()).state.kind === 'ended')
    const ended = await load()
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(receivedResults(await entries(host))).toHaveLength(1)
    expect(ended.checkpoint.calls.filter(call => call.kind === 'model')).toEqual([])
  })

  it('a call the supplier rejected with 400 is saved, and the execution fails with no reply', async () => {
    const { host, load } = await waitingAtM1()
    const { record, call } = await settleReply(host, await load(), 'rejected-400')
    expect(record.status).toBe('saved')
    await until(async () => (await load()).state.kind === 'ended')
    const ended = await load()
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
    expect(ended.settlement.candidates.at(-1)?.failure).toMatchObject({ kind: 'no-reply', call })
    expect(receivedResults(await entries(host))).toHaveLength(1)
  })

  it('the ordered stop removes the registration; a reply pushed afterwards finds no receiver', async () => {
    const { host, load } = await waitingAtM1()
    await host.plugin.quiesceAll({ signal: AbortSignal.timeout(2000) })
    expect(host.receivers.resolve(AGENT_CONSUMER_OWNER)).toBeNull()
    const { record } = await settleReply(host, await load())
    expect(record).toMatchObject({ status: 'failed', failure: { kind: 'no-receiver' } })
    expect(receivedResults(await entries(host))).toEqual([])
  })

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
    expect(receivedResults(await entries(host))).toHaveLength(1)
  })
})

// The next commit of a received result answers unknown and stays pending in the journal, so one
// reception stays pending in the host receiver, through pushes and retries, until it is settled.
function leaveCommitUnknown(host: World) {
  host.controls.journal.failNext('received', { kind: 'commit-unknown', outcome: 'pending' })
}

// The journal finishes the commit that was left unknown; the next retry then finds it saved.
function settleUnknownCommit(host: World) {
  for (const { operation } of receiverOf(host).inspect().diagnostics)
    host.controls.journal.settle(EXECUTION, ok(decodeAgentOperationId(operation)), 'applied')
}

type Inspectable = {
  inspect(): { pending: number; diagnostics: readonly { operation: string }[] }
  push: (input: never) => Promise<unknown>
}
const receiverOf = (host: World) =>
  host.receivers.resolve(AGENT_CONSUMER_OWNER) as unknown as Inspectable

const plus = (instant: string, ms: number) => new Date(Date.parse(instant) + ms).toISOString()

const waitsFor = (host: World, instant: string) =>
  until(() => host.controls.clock.pending().includes(instant))

describe('the maintenance driver of the host receiver', () => {
  it('goes on after agentClock gave no reading once', async () => {
    let failNext = false
    const { host, load } = await waitingAtM1({
      reception: { retryMs: 20, retryMaxMs: 160 },
      clock: port => ({
        async now() {
          if (!failNext) return port.now()
          failNext = false
          return { failure: { kind: 'unavailable', owner: 'test-clock', diagnostic: 'once' } }
        },
        waitUntil: (instant, signal) => port.waitUntil(instant, signal),
      }),
    })
    leaveCommitUnknown(host)
    const start = host.controls.clock.now()
    await settleReply(host, await load())
    await waitsFor(host, plus(start, 20))
    failNext = true
    ok(host.controls.clock.advanceTo(plus(start, 20)))
    await until(() => host.errors.some(text => text.includes('agentClock gave no reading')))
    await waitsFor(host, plus(start, 100))
    settleUnknownCommit(host)
    ok(host.controls.clock.advanceTo(plus(start, 100)))
    await until(() => receiverOf(host).inspect().pending === 0)
    expect(receiverOf(host).inspect().pending).toBe(0)
    expect(host.errors.some(text => text.includes('agentClock gave no reading'))).toBe(true)
  })

  it('doubles the wait after each run with pending work, up to retryMaxMs', async () => {
    const { host, load } = await waitingAtM1({
      reception: { retryMs: 1000, retryMaxMs: 4000 },
    })
    leaveCommitUnknown(host)
    const start = host.controls.clock.now()
    await settleReply(host, await load())
    let at = start
    for (const wait of [1000, 2000, 4000, 4000]) {
      at = plus(at, wait)
      await waitsFor(host, at)
      ok(host.controls.clock.advanceTo(at))
    }
    await waitsFor(host, plus(at, 4000))
    expect(receiverOf(host).inspect().pending).toBe(1)
  })

  it('stops driving an execution whose maintenance is denied, with a warning', async () => {
    const { host, load } = await waitingAtM1()
    leaveCommitUnknown(host)
    const start = host.controls.clock.now()
    await settleReply(host, await load())
    await waitsFor(host, plus(start, RETRY_MS))
    host.controls.access.check.always(input =>
      input.operation === 'receive-result'
        ? { kind: 'denied' }
        : { kind: 'allowed', evidence: evidence(`access/${input.operation}`) },
    )
    ok(host.controls.clock.advanceTo(plus(start, RETRY_MS)))
    await until(() => host.warnings.some(text => text.includes('was denied')))
    await new Promise(resolve => setTimeout(resolve, 50))
    const next = plus(start, 3 * RETRY_MS)
    expect(host.controls.clock.pending()).not.toContain(next)
    expect(receiverOf(host).inspect().pending).toBe(1)
  })

  it('a body that runs again drives the pending work it found in the state', async () => {
    const { host, load } = await waitingAtM1()
    leaveCommitUnknown(host)
    await settleReply(host, await load())
    expect(receiverOf(host).inspect().pending).toBe(1)
    await host.host.dispose()
    const again = host.root.plugin(host.plugin, { ...hostConfig, reception: RECEPTION })
    await again
    const now = host.controls.clock.now()
    await waitsFor(host, plus(now, RETRY_MS))
    settleUnknownCommit(host)
    ok(host.controls.clock.advanceTo(plus(now, RETRY_MS)))
    await until(() => receiverOf(host).inspect().pending === 0)
  })

  it('keeps the access of the admitted push when a later push is refused', async () => {
    const { host, load } = await waitingAtM1()
    leaveCommitUnknown(host)
    const start = host.controls.clock.now()
    const { record } = await settleReply(host, await load())
    await waitsFor(host, plus(start, RETRY_MS))
    host.controls.access.check.always(input =>
      input.access.principal === 'intruder'
        ? { kind: 'denied' }
        : { kind: 'allowed', evidence: evidence(`access/${input.operation}`) },
    )
    const refused = await receiverOf(host).push({
      access: { principal: 'intruder', tenant: caller('a').tenant },
      delivery: record.delivery,
      signal: new AbortController().signal,
    } as never)
    expect(refused).toMatchObject({ failure: { kind: 'denied' } })
    settleUnknownCommit(host)
    ok(host.controls.clock.advanceTo(plus(start, RETRY_MS)))
    await until(() => receiverOf(host).inspect().pending === 0)
  })
})
