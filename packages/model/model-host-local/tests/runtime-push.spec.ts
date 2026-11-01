// The runtime facade of `ModelRuntimeLocalPlugin` on real Cordis 4.0.4: result push, the Model's
// own ACK after `saved`, late accounts and the receiver registration.
//
// Real parts: the plugin, its host, its runtime stage, the Model runtime of `@omne-harness/model`
// with its driver and send boundary, and the in-memory ModelCommands of `@omne-harness/model/testing`
// (a store without durability; the durable commands join in the full assembly). Stand-ins, each
// named: the transport is the scripted transport of `@omne-harness/model-contract/testing`; the
// result receiver is the scripted receiver below, which stands for the Agent receiver of
// agent-host-local (`createLocalModelReceiver`, joined in integration A). The receiver keeps the
// four facts of `saved` apart and answers `saved` only when all four hold.
import { Context, type Fiber } from '@deepseek-ai/cordis'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  createModelRuntime,
  type ModelConfiguration,
  type SendResources,
} from '@omne-harness/model'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeResultVersion,
  type DurableEvidence,
  type FixedModelRequest,
  type ModelCallId,
  type ModelDelivery,
  type ModelDeliveryFailure,
  type ModelResultReceiver,
  type ModelSavedReceipt,
} from '@omne-harness/model-contract'
import {
  decodeCredentialId,
  type CallAccountReport,
  type ModelCommands,
  type ModelDriveInput,
  type TransportFact,
} from '@omne-harness/model-contract/provider'
import { createScriptedTransport } from '@omne-harness/model-contract/testing'
import {
  ModelClockService,
  ModelCommandsService,
  ModelHostAuthorityService,
  modelRuntimeKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { expect, it } from 'vitest'
import {
  createMemoryResultPushLedger,
  createModelRuntimeLocalPlugin,
  type ResultPushLedger,
  type ResultPushLimits,
} from '../src/cordis.ts'

function unbox<T>(decoded: { ok: T } | { failure: unknown }): T {
  if ('ok' in decoded) return decoded.ok
  throw new Error(`fixture: ${JSON.stringify(decoded.failure)}`)
}

const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
if (!account.ok || !organization.ok) throw new Error('fixture identity')
const TENANT: TenantId = tenant(organization.value, account.value)
const PRINCIPAL = Object.freeze({ subject: 'model-host' })
const CONSUMER = 'agent-consumer'
const callOf = (name: string): ModelCallId => unbox(decodeModelCallId(`mcall_${name}`))
const op = (name: string) => unbox(decodeModelOperationId(`mop_${name}`))
const ADOPTION = { owner: 'o', name: 'n', revision: '1', digest: '0'.repeat(64) }
const CAPACITY = { bytes: '100000', blocks: '20', attachmentBytes: '0' }
const SETTINGS = { concurrencyLimit: 4, wakeCapacity: 16, scanBatchSize: 10, scanIntervalMs: 0 }
const LIMITS: ResultPushLimits = {
  maxConcurrentCalls: 4,
  maxRedeliveries: 2,
  maxCleanupSteps: 8,
  maxPendingAccountsPerTenant: 4,
  maxPendingAccounts: 8,
}
const CONFIGURATION: ModelConfiguration = {
  outputBatchBytes: 1,
  outputBatchDelayMs: 0,
  observerBufferBytes: 4096,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 4096,
  readIdleMs: 1000,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
}

const request: FixedModelRequest = {
  profile: ADOPTION,
  suppliers: [
    {
      adoption: ADOPTION,
      recipient: 'test.invalid',
      model: 'test',
      credential: { kind: 'factory' },
    },
  ],
  fallback: false,
  retryPolicy: ADOPTION,
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'test.invalid/test', accepts: ['test.invalid/test'], foreignThinking: 'omit' },
  ],
  representation: ADOPTION,
  parameterAdoptions: [],
  source: ADOPTION,
}

const report = (revision: string): CallAccountReport => ({
  usage: [{ name: 'output', state: 'known', lexeme: revision, unit: 'token' }],
  cost: [],
  trimmed: { state: 'unknown', unit: 'token' },
  place: 'supplier',
  duration: { state: 'unknown' },
  revision,
})

// The answer ends at the output limit, so its growing text block completes as it is.
const ANSWER: readonly Exclude<TransportFact, { kind: 'ended' }>[] = [
  { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
  { kind: 'block-delta', index: '0', delta: 'kept' },
  { kind: 'account', event: 'stream', value: report('1') },
]
const ENDING = { kind: 'completed', reason: 'limit' } as const

async function until(check: () => boolean, label: string): Promise<void> {
  for (let tries = 0; tries < 1000; tries += 1) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error(`timed out waiting for ${label}`)
}

async function settled(fiber: Fiber): Promise<void> {
  try {
    await fiber
  } catch {
    // A failed fiber is read from its state.
  }
}

/** Gives the macrotask queue a few turns, so that nothing that would happen is still on its way. */
async function quiet(): Promise<void> {
  for (let n = 0; n < 5; n += 1) await new Promise(resolve => setTimeout(resolve, 5))
}

type Conjunct = 'material' | 'responsibility' | 'deduplication' | 'retention'

/**
 * The scripted receiver. It keeps the four facts of `saved` apart: the material, the consumer's
 * responsibility, the deduplication by key and the retention. A missing fact gives the answer that
 * the contract gives for it, and never `saved`. `next` answers the next pushes instead, in order.
 */
function scriptedReceiver() {
  const pushes: ModelDelivery[] = []
  const saved = new Map<string, { delivery: ModelDelivery; receipt: ModelSavedReceipt }>()
  const state = {
    missing: null as Conjunct | null,
    next: [] as ('unknown' | 'unavailable' | 'backpressured' | 'foreign-key' | 'foreign-owner')[],
    refuseAccounts: false,
  }
  const evidenceOf = (delivery: ModelDelivery): DurableEvidence => ({
    owner: delivery.consumer.owner,
    record: `saved/${JSON.stringify(delivery.key)}`,
    revision: '1',
    digest: '1'.repeat(64),
  })
  const receiver: ModelResultReceiver<unknown> = {
    async push({ delivery }) {
      pushes.push(delivery)
      const scripted = state.next.shift()
      if (scripted === 'unknown') return { failure: { kind: 'outcome-unknown' } }
      if (scripted === 'unavailable')
        return { failure: { kind: 'unavailable', dependency: 'responsibility' } }
      if (scripted === 'backpressured')
        return { failure: { kind: 'backpressured', resource: 'in-flight' } }
      const key = JSON.stringify(delivery.key)
      const known = saved.get(key)
      if (known !== undefined)
        return JSON.stringify(known.delivery) === JSON.stringify(delivery)
          ? { ok: known.receipt }
          : { failure: { kind: 'conflict' } }
      if (state.refuseAccounts && delivery.kind === 'account')
        return { failure: { kind: 'unavailable', dependency: 'material' } }
      const failure = ((): ModelDeliveryFailure | null => {
        switch (state.missing) {
          case 'material':
            return { kind: 'unavailable', dependency: 'material' }
          case 'responsibility':
            return { kind: 'unavailable', dependency: 'responsibility' }
          case 'deduplication':
            return { kind: 'outcome-unknown' }
          case 'retention':
            return { kind: 'unavailable', dependency: 'retention' }
          case null:
            return null
        }
      })()
      if (failure !== null) return { failure }
      const receipt: ModelSavedReceipt = {
        key:
          scripted === 'foreign-key' && delivery.key.kind === 'result'
            ? { ...delivery.key, result: unbox(decodeResultVersion('mrver_another')) }
            : delivery.key,
        evidence:
          scripted === 'foreign-owner'
            ? { ...evidenceOf(delivery), owner: 'another-owner' }
            : evidenceOf(delivery),
      }
      if (scripted === undefined) saved.set(key, { delivery, receipt })
      return { ok: receipt }
    },
  }
  return { receiver, pushes, state }
}

type Hooks = {
  /** `lost`: this ACK takes effect and its answer is lost; the storage knows it committed. */
  handoff?(): 'lost' | 'pass'
  advanceCleanup?(): 'fail' | 'pass'
  /** Runs before each `dispatches` of the plugin's commands; the read waits for what it returns. */
  dispatches?(): Promise<void> | void
}

/**
 * The services the plugin injects, the in-memory commands under them, and a plugin class whose
 * provider is the real Model runtime over the plugin's commands.
 */
function world(input: Readonly<{ limits?: ResultPushLimits; ledger?: ResultPushLedger }> = {}) {
  const ledger = input.ledger ?? createMemoryResultPushLedger()
  const hooks: Hooks = {}
  const handoffs: Parameters<ModelCommands<unknown>['handoff']>[0][] = []
  const memory = createTestModelDependencies<unknown>({
    start: '2026-11-02T00:00:00.000Z',
    maxWaiters: 32,
    maxQueued: 32,
    sends: [],
    owners: [{ consumerOwner: CONSUMER, work: { kind: 'exempt' }, evidence: ADOPTION }],
    authority: {
      authorize: ({ access, action }) =>
        access.principal === PRINCIPAL
          ? { ok: { owner: 'identity', subject: 'model-host', revision: '1' } }
          : { failure: { kind: 'denied', action } },
      execution: () => ({ ok: { owner: 'host', subject: 'channel', revision: '1' } }),
    },
    evidence: [
      {
        adoption: ADOPTION,
        continuity: given => ({ ok: given.source }),
        materialization: given => ({
          ok: {
            owner: 'host',
            record: `${given.call}/${given.dispatch}`,
            revision: '1',
            digest: '1'.repeat(64),
          },
        }),
        receive: given => ({
          ok: {
            window: given.window,
            batchDigest: given.batchDigest,
            paused: true,
            noPrefetch: true,
          },
        }),
        lateFact: given =>
          given.source.owner === 'supplier'
            ? { ok: given.source }
            : { failure: { kind: 'invalid', field: 'source', reason: 'untrusted' } },
        retry: () => ({
          failure: { kind: 'unavailable', dependency: 'retry', diagnostic: 'none' },
        }),
        // The custody evidence is the scripted receiver's own, for this call's frozen key only.
        handoff: given =>
          given.evidence.kind === 'retained' &&
          given.evidence.custody.owner === CONSUMER &&
          given.evidence.custody.record.startsWith('saved/') &&
          given.evidence.custody.record.includes(given.call)
            ? { ok: given.evidence.custody }
            : { failure: { kind: 'handoff-invalid', reason: 'evidence' } },
      },
    ],
    limits: {
      scanPageCalls: 10,
      resultPageParts: 4,
      resultPageTargetBytes: 4096,
      readIdleMs: 1000,
      capacity: { bytes: '1000000', blocks: '200', attachmentBytes: '0' },
    },
    sending: {
      maxRetainedAttempts: 8,
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => ({ kind: 'value', scope: 'factory', value: 'synthetic-credential' }),
      },
      sources: [
        {
          profile: ADOPTION,
          supplier: ADOPTION,
          recipient: 'test.invalid',
          model: 'test',
          credential: {
            kind: 'factory',
            official: true,
            queryId: unbox(decodeCredentialId('push-test-query')),
          },
          current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
        },
      ],
    },
  })
  const raw = memory.dependencies.commands
  const commands: ModelCommands<unknown> = {
    ...raw,
    handoff: async ack => {
      handoffs.push(structuredClone({ ...ack, principal: null }))
      if (hooks.handoff?.() !== 'lost') return raw.handoff(ack)
      memory.controls.commands.injectUnknown({ ...ack, method: 'handoff', effect: 'applied' })
      const reply = await raw.handoff(ack)
      memory.controls.commands.reveal({ ...ack, result: 'committed' })
      return reply
    },
    advanceCleanup: async step =>
      hooks.advanceCleanup?.() === 'fail'
        ? { failure: { kind: 'unavailable', dependency: 'cleanup', diagnostic: 'synthetic' } }
        : raw.advanceCleanup(step),
    dispatches: async input => {
      await hooks.dispatches?.()
      return raw.dispatches(input)
    },
  }
  const resources: SendResources<unknown> = {
    async acquire(demand) {
      const script = createScriptedTransport({
        receipt: {
          supplier: demand.supplier.adoption,
          representation: demand.request.representation,
          payloadDigest: 'a'.repeat(64),
        },
        facts: ANSWER,
        ending: { kind: 'terminated', termination: ENDING },
        rejection: null,
      })
      return {
        ok: {
          transport: script.transport,
          startWithCredential: (materialized, _value, signal) => materialized.start(signal),
          release: async () => {},
        },
      }
    },
  }
  class Authority extends ModelHostAuthorityService<unknown> {
    readonly resolve = async (target: { tenant: TenantId; call: ModelCallId }) => ({
      ok: {
        principal: PRINCIPAL,
        tenant: target.tenant,
        call: target.call,
        instance: unbox(decodeModelInstanceId(`minst_${target.call.slice('mcall_'.length)}`)),
        operation: op(`claim-${target.call.slice('mcall_'.length)}`),
        continuity: { owner: 'host', record: target.call, revision: '1', digest: '1'.repeat(64) },
      } satisfies ModelDriveInput<unknown>,
    })
  }
  class Clock extends ModelClockService {
    readonly now = () => new Date().toISOString()
    readonly waitUntil = (instant: string, signal: AbortSignal) =>
      new Promise<'elapsed' | 'cancelled'>(resolve => {
        const timer = setTimeout(
          () => resolve('elapsed'),
          Math.max(0, Date.parse(instant) - Date.now()),
        )
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          resolve('cancelled')
        })
      })
  }
  class Commands extends ModelCommandsService<unknown> {
    declare readonly admit: ModelCommands<unknown>['admit']
    declare readonly recall: ModelCommands<unknown>['recall']
    declare readonly scanPending: ModelCommands<unknown>['scanPending']
    declare readonly loadRecovery: ModelCommands<unknown>['loadRecovery']
    declare readonly claim: ModelCommands<unknown>['claim']
    declare readonly prepareDispatch: ModelCommands<unknown>['prepareDispatch']
    declare readonly recordMaterialization: ModelCommands<unknown>['recordMaterialization']
    declare readonly recordSend: ModelCommands<unknown>['recordSend']
    declare readonly openReceiveWindow: ModelCommands<unknown>['openReceiveWindow']
    declare readonly preserve: ModelCommands<unknown>['preserve']
    declare readonly recordLateFact: ModelCommands<unknown>['recordLateFact']
    declare readonly prepareRetry: ModelCommands<unknown>['prepareRetry']
    declare readonly decideRetry: ModelCommands<unknown>['decideRetry']
    declare readonly settle: ModelCommands<unknown>['settle']
    declare readonly control: ModelCommands<unknown>['control']
    declare readonly acquireRead: ModelCommands<unknown>['acquireRead']
    declare readonly nextRead: ModelCommands<unknown>['nextRead']
    declare readonly endRead: ModelCommands<unknown>['endRead']
    declare readonly handoff: ModelCommands<unknown>['handoff']
    declare readonly advanceCleanup: ModelCommands<unknown>['advanceCleanup']
    declare readonly query: ModelCommands<unknown>['query']
    declare readonly dispatches: ModelCommands<unknown>['dispatches']
    constructor(ctx: Context) {
      super(ctx)
      Object.assign(this, commands)
    }
  }
  // The commands the provider writes through: the plugin's, captured for the late-account source.
  const provided: { commands?: ModelCommands<unknown> } = {}
  const Plugin = createModelRuntimeLocalPlugin({
    provider: given => {
      provided.commands = given.commands
      const send = memory.controls.send.createSender({ resources, commands: given.commands })
      return createModelRuntime(
        {
          commands: given.commands,
          send,
          retry: memory.dependencies.retry,
          instances: given.host,
          clock: given.clock,
        },
        CONFIGURATION,
      )
    },
    qualifyObservation: async () => ({ ok: undefined }),
    results: { ledger, limits: input.limits ?? LIMITS },
  })
  const ctx = new Context()
  const messages: string[] = []
  ctx.logger.exporter({
    colors: 0,
    levels: { default: 3 },
    export: message => {
      messages.push(message.args.map(String).join(' '))
    },
  })
  return {
    ctx,
    ledger,
    hooks,
    handoffs,
    messages,
    raw,
    controls: memory.controls,
    Plugin,
    provided,
    async services() {
      await ctx.plugin(Authority)
      await ctx.plugin(Clock)
      await ctx.plugin(Commands)
    },
    load(): Fiber {
      return ctx.plugin(Plugin, { ...SETTINGS })
    },
    /** A plugin that registers `receiver` under `owner`, the way the Agent host does. */
    register(receiver: ModelResultReceiver<unknown>, owner = CONSUMER): Fiber {
      return ctx.plugin({
        name: 'receiver-stand-in',
        inject: [modelRuntimeKey],
        apply: (inner: Context) => {
          inner.modelRuntime.registerResultReceiver(owner, receiver)
        },
      })
    },
    async admit(name: string) {
      const call = callOf(name)
      return unbox(
        await ctx.modelRuntime.calls.admit({
          principal: PRINCIPAL,
          tenant: TENANT,
          call,
          operation: op(`admit-${name}`),
          request,
          consumer: { owner: CONSUMER, work: 'work', position: 'answer', purpose: 'push-test' },
          capacity: CAPACITY,
        }),
      )
    },
    async custody(name: string) {
      const lookup = unbox(
        await raw.recall({
          principal: PRINCIPAL,
          tenant: TENANT,
          call: callOf(name),
          admission: op(`admit-${name}`),
        }),
      )
      if (lookup.kind !== 'found') throw new Error('the call is not found')
      return lookup.state.custody
    },
    record(name: string) {
      return ledger.read({ tenant: TENANT, call: callOf(name) })
    },
    async dispatches(name: string) {
      return unbox(
        await raw.dispatches({ principal: PRINCIPAL, tenant: TENANT, call: callOf(name) }),
      )
    },
    /** A late account from the trusted supplier source, through the provider's commands. */
    async late(name: string, revision: string, operation = `late-${name}-${revision}`) {
      const target = provided.commands
      if (target === undefined) throw new Error('the provider was not built')
      const [dispatch] = await this.dispatches(name)
      if (dispatch === undefined) throw new Error('the call has no dispatch')
      return target.recordLateFact({
        principal: PRINCIPAL,
        tenant: TENANT,
        call: callOf(name),
        dispatch: dispatch.dispatch,
        operation: op(operation),
        source: {
          owner: 'supplier',
          record: `late/${revision}`,
          revision: '1',
          digest: '2'.repeat(64),
        },
        fact: { kind: 'account', event: `late-${revision}`, value: report(revision) },
      })
    },
  }
}

it('pushes the frozen result to the registered receiver and then acknowledges it through the retained handoff', async () => {
  const w = world()
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  const admitted = await w.admit('one')

  await until(() => w.record('one')?.cleanup === 'released', 'the push, ACK and cleanup')
  const [delivery] = scripted.pushes
  const [dispatch] = await w.dispatches('one')
  expect(delivery).toMatchObject({
    kind: 'result',
    key: { kind: 'result', reference: admitted.reference },
    consumer: { owner: CONSUMER, work: 'work', position: 'answer', purpose: 'push-test' },
    settlement: { termination: ENDING },
    parts: [{ kind: 'partial', content: 'text', value: 'kept' }],
    accounts: [{ dispatch: dispatch?.dispatch, account: dispatch?.account }],
  })
  // The payload is frozen: nothing the receiver does changes what was pushed.
  expect(Object.isFrozen(delivery)).toBe(true)
  // One ACK, retained, with the receiver's evidence, after the push.
  expect(w.handoffs).toHaveLength(1)
  expect(w.handoffs[0]?.evidence).toMatchObject({ kind: 'retained', custody: { owner: CONSUMER } })
  const custody = await w.custody('one')
  expect(custody).toMatchObject({ kind: 'acknowledged', cleanup: 'released' })
})

it.each(['material', 'responsibility', 'deduplication', 'retention'] as const)(
  'does not acknowledge while the %s fact of saved is missing',
  async missing => {
    const w = world()
    await w.services()
    await w.load()
    const scripted = scriptedReceiver()
    scripted.state.missing = missing
    await w.register(scripted.receiver)
    await w.admit('one')

    await until(() => scripted.pushes.length > 0, 'the push')
    await until(() => w.record('one')?.result?.standing.status !== 'pending', 'its answer')
    await quiet()
    expect(w.handoffs).toEqual([])
    expect(await w.custody('one')).toEqual({ kind: 'producer' })
    expect(w.record('one')?.result?.standing.status).toBe(
      missing === 'deduplication' ? 'unknown' : 'waiting',
    )
  },
)

it.each(['foreign-key', 'foreign-owner'] as const)(
  'does not take a receipt with a %s as saved and does not acknowledge',
  async kind => {
    const w = world()
    await w.services()
    await w.load()
    const scripted = scriptedReceiver()
    scripted.state.next = [kind]
    await w.register(scripted.receiver)
    await w.admit('one')

    await until(() => w.record('one')?.result?.standing.status === 'failed', 'the refused receipt')
    await quiet()
    expect(w.handoffs).toEqual([])
    expect(await w.custody('one')).toEqual({ kind: 'producer' })
    expect(w.messages.some(text => text.includes('receipt-mismatch'))).toBe(true)
  },
)

it('redelivers the same key and frozen payload after an unknown outcome and acknowledges once saved', async () => {
  const w = world()
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  scripted.state.next = ['unknown', 'unknown']
  await w.register(scripted.receiver)
  await w.admit('one')

  await until(() => w.record('one')?.acknowledgement === 'acknowledged', 'the ACK')
  expect(scripted.pushes).toHaveLength(3)
  const [first, ...again] = scripted.pushes
  for (const delivery of again) expect(delivery).toEqual(first)
  expect(w.handoffs).toHaveLength(1)
})

it.each(['unavailable', 'backpressured'] as const)(
  'keeps a delivery unknown when the redelivery after an unknown outcome is refused with %s',
  async refusal => {
    const w = world()
    await w.services()
    await w.load()
    const scripted = scriptedReceiver()
    scripted.state.next = ['unknown', refusal]
    await w.register(scripted.receiver)
    await w.admit('one')

    await until(() => w.record('one')?.result?.standing.status !== 'pending', 'the answers')
    await quiet()
    expect(scripted.pushes).toHaveLength(2)
    // A refusal cannot show that the receiver never saved the first push.
    expect(w.record('one')?.result?.standing).toEqual({ status: 'unknown' })
    expect(w.handoffs).toEqual([])
    expect(await w.custody('one')).toEqual({ kind: 'producer' })
  },
)

it('recognises an unknown ACK through the original operation and input', async () => {
  const w = world()
  await w.services()
  let lost = false
  w.hooks.handoff = () => {
    if (lost) return 'pass'
    lost = true
    return 'lost'
  }
  await w.load()
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')

  await until(() => w.record('one')?.acknowledgement === 'acknowledged', 'the ACK')
  expect(w.handoffs).toHaveLength(2)
  const [first, second] = w.handoffs
  expect(second).toEqual(first)
  expect(await w.custody('one')).toMatchObject({
    kind: 'acknowledged',
    operation: first?.operation,
  })
})

it('keeps the acknowledgement when the cleanup fails, and a successor finishes the cleanup without a second ACK', async () => {
  const w = world()
  await w.services()
  w.hooks.advanceCleanup = () => 'fail'
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')

  await until(
    () => w.messages.some(text => text.includes('cleanup stays pending')),
    'the failed cleanup',
  )
  expect(w.record('one')).toMatchObject({ acknowledgement: 'acknowledged', cleanup: 'pending' })
  expect(await w.custody('one')).toMatchObject({ kind: 'acknowledged', cleanup: 'pending' })

  w.hooks.advanceCleanup = () => 'pass'
  await first.dispose()
  await w.load()
  await until(() => w.record('one')?.cleanup === 'released', 'the cleanup of the successor')
  expect(await w.custody('one')).toMatchObject({ kind: 'acknowledged', cleanup: 'released' })
  expect(w.handoffs).toHaveLength(1)
  expect(scripted.pushes).toHaveLength(1)
})

it('keeps a result without a receiver waiting and pushes it when the consumer owner registers', async () => {
  const w = world()
  await w.services()
  await w.load()
  await w.admit('one')

  await until(() => w.record('one')?.result?.standing.status === 'waiting', 'the waiting result')
  expect(w.record('one')?.result?.standing).toEqual({ status: 'waiting', reason: 'no-receiver' })
  expect(w.messages.some(text => text.includes('no receiver'))).toBe(true)

  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await until(
    () => w.record('one')?.acknowledgement === 'acknowledged',
    'the ACK after registration',
  )
  expect(scripted.pushes).toHaveLength(1)
})

it('pushes each late account to the same consumer after the body is released, one delivery per revision', async () => {
  const w = world()
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  const admitted = await w.admit('one')
  await until(() => w.record('one')?.cleanup === 'released', 'the released body')

  expect(await w.late('one', '2')).toMatchObject({ ok: { recovered: false } })
  const [after2] = await w.dispatches('one')
  expect(await w.late('one', '3')).toMatchObject({ ok: { recovered: false } })
  const [after3] = await w.dispatches('one')
  await until(() => scripted.pushes.length === 3, 'two account deliveries')

  const [result, second, third] = scripted.pushes
  const expected = (stored: typeof after2) => ({
    kind: 'account',
    key: {
      kind: 'account',
      reference: admitted.reference,
      dispatch: stored?.dispatch,
      revision: stored?.account?.revision,
    },
    consumer: result?.consumer,
    account: stored?.account,
  })
  expect(second).toEqual(expected(after2))
  expect(third).toEqual(expected(after3))
  // The unknown parts of the account stay unknown: nothing is written as zero.
  expect(second?.kind === 'account' && second.account.trimmed).toEqual({
    state: 'unknown',
    unit: 'token',
  })
  await until(
    () => w.record('one')?.accounts.every(held => held.standing.status === 'saved') === true,
    'both accounts saved',
  )
})

it('pushes a late account only after the result is saved', async () => {
  const w = world()
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  scripted.state.missing = 'material'
  const registration = w.register(scripted.receiver)
  await registration
  await w.admit('one')
  await until(() => w.record('one')?.result?.standing.status === 'waiting', 'the waiting result')

  expect(await w.late('one', '2')).toMatchObject({ ok: { recovered: false } })
  await quiet()
  expect(scripted.pushes.every(delivery => delivery.kind === 'result')).toBe(true)

  scripted.state.missing = null
  await registration.dispose()
  await w.register(scripted.receiver)
  await until(() => scripted.pushes.at(-1)?.kind === 'account', 'the account delivery')
  const kinds = scripted.pushes.map(delivery => delivery.kind)
  expect(kinds.indexOf('account')).toBeGreaterThan(kinds.lastIndexOf('result'))
  expect(w.record('one')?.acknowledgement).toBe('acknowledged')
})

it('refuses a late account beyond the bound, says so, and accepts it from its source once there is room', async () => {
  const w = world({ limits: { ...LIMITS, maxPendingAccountsPerTenant: 1 } })
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  scripted.state.refuseAccounts = true
  const registration = w.register(scripted.receiver)
  await registration
  await w.admit('one')
  await until(() => w.record('one')?.cleanup === 'released', 'the released body')

  expect(await w.late('one', '2')).toMatchObject({ ok: { recovered: false } })
  await until(() => w.record('one')?.accounts[0]?.standing.status === 'waiting', 'the held account')
  const refused = await w.late('one', '3')
  expect(refused).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'model-result-push',
      diagnostic: 'late-account-capacity',
    },
  })
  expect(w.messages.some(text => text.includes('late account was refused'))).toBe(true)
  // The refused account was not accepted: the commands still hold revision 2.
  expect((await w.dispatches('one'))[0]?.account?.revision).toBe('2')

  scripted.state.refuseAccounts = false
  await registration.dispose()
  await w.register(scripted.receiver)
  await until(() => w.record('one')?.accounts[0]?.standing.status === 'saved', 'room again')
  expect(await w.late('one', '3')).toMatchObject({ ok: { recovered: false } })
  await until(() => w.record('one')?.accounts[1]?.standing.status === 'saved', 'the second account')
})

it('keeps the place of a late account whose acceptance is unknown, and its resubmission takes no second place', async () => {
  const w = world({ limits: { ...LIMITS, maxPendingAccountsPerTenant: 1 } })
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.record('one')?.cleanup === 'released', 'the released body')

  const unknown = { tenant: TENANT, call: callOf('one'), operation: op('late-one-2') }
  w.controls.commands.injectUnknown({ ...unknown, method: 'recordLateFact', effect: 'applied' })
  expect(await w.late('one', '2')).toMatchObject({ failure: { kind: 'commit-unknown' } })
  // The account may have been accepted, so its place stays taken: the tenant has no room left.
  expect(await w.late('one', '3')).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'model-result-push',
      diagnostic: 'late-account-capacity',
    },
  })

  w.controls.commands.reveal({ ...unknown, result: 'committed' })
  // The same operation again uses the place it holds and is not refused for capacity.
  const again = await w.late('one', '2')
  expect('ok' in again).toBe(true)
  await until(() => w.record('one')?.accounts[0]?.standing.status === 'saved', 'the account')
  expect(scripted.pushes.filter(delivery => delivery.kind === 'account')).toHaveLength(1)
})

it('fails a second live plugin that registers the same consumer owner and keeps the first', async () => {
  const w = world()
  await w.services()
  await w.load()
  const first = scriptedReceiver()
  const second = scriptedReceiver()
  const holder = w.register(first.receiver)
  await settled(holder)
  const claimant = w.register(second.receiver)
  await settled(claimant)

  // Cordis fiber states by value: ACTIVE 2, FAILED 3.
  expect(claimant.state).toBe(3)
  expect(holder.state).toBe(2)
  await w.admit('one')
  await until(() => w.record('one')?.acknowledgement === 'acknowledged', 'the ACK')
  expect(first.pushes).toHaveLength(1)
  expect(second.pushes).toEqual([])
})

it('lets a plugin that reruns for another dependency register again without failing, and pushes to the new receiver', async () => {
  const w = world()
  await w.services()
  await w.load()
  const receivers: ReturnType<typeof scriptedReceiver>[] = []
  const agent = w.ctx.plugin({
    name: 'agent-host-stand-in',
    inject: [modelRuntimeKey, 'otherDependency'],
    apply: (inner: Context) => {
      const scripted = scriptedReceiver()
      receivers.push(scripted)
      inner.modelRuntime.registerResultReceiver(CONSUMER, scripted.receiver)
    },
  })
  const dependency = (name: string) =>
    w.ctx.plugin({
      name,
      apply: (inner: Context) => {
        inner.provide('otherDependency', { name })
      },
    })
  const generation = dependency('dependency-1')
  await settled(generation)
  await settled(agent)
  await generation.dispose()
  await settled(dependency('dependency-2'))
  await settled(agent)

  expect(receivers).toHaveLength(2)
  expect(agent.state).toBe(2)
  await w.admit('one')
  await until(() => w.record('one')?.acknowledgement === 'acknowledged', 'the ACK')
  expect(receivers[0]?.pushes).toEqual([])
  expect(receivers[1]?.pushes).toHaveLength(1)
})

it('hands an unfinished push to a successor on unload, with the original key and frozen payload', async () => {
  const w = world()
  await w.services()
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  scripted.state.missing = 'responsibility'
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.record('one')?.result?.standing.status === 'waiting', 'the waiting result')
  const [before] = scripted.pushes

  await first.dispose()
  expect(w.ctx.modelRuntime).toBeUndefined()
  expect(w.record('one')?.acknowledgement).toBe('none')

  scripted.state.missing = null
  await w.load()
  await until(() => w.record('one')?.acknowledgement === 'acknowledged', 'the ACK of the successor')
  expect(scripted.pushes.at(-1)).toEqual(before)
  expect(w.handoffs).toHaveLength(1)
})

it('waits on unload for a late account that is being accepted and hands it to the successor', async () => {
  const w = world()
  await w.services()
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.record('one')?.cleanup === 'released', 'the released body')

  // The acceptance commits the account, then stops while it reads the revision back.
  let reached = false
  let resume = () => {}
  const gate = new Promise<void>(resolve => {
    resume = resolve
  })
  w.hooks.dispatches = () => {
    delete w.hooks.dispatches
    reached = true
    return gate
  }
  const late = w.late('one', '2')
  await until(() => reached, 'the read-back of the accepted revision')
  expect((await w.dispatches('one'))[0]?.account?.revision).toBe('2')

  let unloaded = false
  const unloading = first.dispose().then(() => {
    unloaded = true
  })
  await quiet()
  expect(unloaded).toBe(false)
  resume()
  await unloading
  expect(await late).toMatchObject({ ok: { recovered: false } })
  // The account is owed in the ledger, not lost with the stopped stage.
  expect(w.record('one')?.accounts.map(held => held.delivery.key)).toMatchObject([
    { kind: 'account', revision: '2' },
  ])
  // The stopped stage accepts no more accounts: the source keeps them for the successor.
  expect(await w.late('one', '3')).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'model-result-push',
      diagnostic: 'result-push-stopped',
    },
  })
  expect((await w.dispatches('one'))[0]?.account?.revision).toBe('2')

  await w.load()
  await until(
    () => w.record('one')?.accounts[0]?.standing.status === 'saved',
    'the account pushed by the successor',
  )
  expect(scripted.pushes.map(delivery => delivery.kind)).toEqual(['result', 'account'])
})
