import { requestRepresentation } from '@omne-harness/model-contract/provider'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantEquals,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  createModelRuntime,
  type LiveEventPort,
  type ModelConfiguration,
  type SendResources,
} from '@omne-harness/model'
import { createTestModelDependencies, testLiveHosting } from '@omne-harness/model/testing'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeResultVersion,
  type DurableEvidence,
  type LlmModelRequest,
  type ModelCallId,
  type ModelDelivery,
  type ModelDeliveryFailure,
  type ModelResultReceiver,
  type ModelSavedReceipt,
} from '@omne-harness/model-contract'
import {
  MODEL_SEND,
  type CallAccountReport,
  type CostLookupAnswer,
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
import { afterEach, expect, it, vi } from 'vitest'
import {
  createMemoryResultPushLedger,
  createModelRuntimeLocalPlugin,
  type ResultPushLedger,
  type ResultPushLimits,
  type ResultPushOptions,
  type ResultPushRecovery,
} from '../src/cordis.ts'
import { COST_LOOKUP_OWNER } from '../src/plugins/cost-lookups.ts'
import { providerName } from './support/credentials.ts'

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
const SETTINGS = { concurrencyLimit: 4, wakeCapacity: 16, scanBatchSize: 10, scanIntervalMs: 25 }
const LIMITS: ResultPushLimits = {
  maxConcurrentCalls: 4,
  maxRedeliveries: 2,
  maxCleanupSteps: 8,
  maxPendingAccountsPerTenant: 4,
  maxPendingAccounts: 8,
  maxCostMisses: 3,
  delaysMs: [1000, 5000, 30000],
}
const CONFIGURATION: ModelConfiguration = {
  outputBatchBytes: 1,
  outputBatchDelayMs: 0,
  observerBufferBytes: 4096,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 4096,
  readIdleMs: 1000,
}

const request: LlmModelRequest = {
  kind: 'llm',
  profile: ADOPTION,
  suppliers: [
    {
      adoption: ADOPTION,
      provider: providerName('test.invalid'),
      model: 'test',
      credential: { layer: 'official' },
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

const ANSWER: readonly Exclude<TransportFact, { kind: 'ended' }>[] = [
  { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
  { kind: 'block-delta', index: '0', delta: 'kept' },
  { kind: 'account', event: 'stream', value: report('1') },
]
const ENDING = { kind: 'completed', reason: 'limit' } as const

async function until(check: () => boolean | Promise<boolean>, label: string): Promise<void> {
  for (let tries = 0; tries < 1000; tries += 1) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error(`timed out waiting for ${label}`)
}

async function settled(fiber: Fiber): Promise<void> {
  try {
    await fiber
  } catch {}
}

async function quiet(): Promise<void> {
  for (let n = 0; n < 5; n += 1) await new Promise(resolve => setTimeout(resolve, 5))
}

type Conjunct = 'material' | 'responsibility' | 'deduplication' | 'retention'

function scriptedReceiver() {
  const pushes: ModelDelivery[] = []
  const saved = new Map<string, { delivery: ModelDelivery; receipt: ModelSavedReceipt }>()
  const state = {
    missing: null as Conjunct | null,
    next: [] as (
      | 'unknown'
      | 'unavailable'
      | 'backpressured'
      | 'denied'
      | 'foreign-key'
      | 'foreign-owner'
    )[],
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
      if (scripted === 'denied') return { failure: { kind: 'denied' } }
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
  handoff?(): 'lost' | 'pass'
  advanceCleanup?(): 'fail' | 'pass'
  dispatches?(): Promise<void> | void
  scanPending?(): 'unavailable' | 'denied' | 'pass' | Promise<void>
  loadRecovery?(): 'unavailable' | 'pass'
  loadOrigin?(): 'unavailable' | 'pass'
  settle?(): 'unavailable' | 'pass'
}

function world(
  input: Readonly<{
    limits?: ResultPushLimits
    ledger?: ResultPushLedger
    custodyEvidence?: 'verified' | 'unavailable'
    share?: number
    recovery?: ResultPushRecovery
    lostContact?: boolean
    answer?: readonly Exclude<TransportFact, { kind: 'ended' }>[]
    lookup?: ResultPushOptions['lookup']
    /** Whether this process still holds the live body of a call. */
    holdsLiveBody?: (call: ModelCallId) => boolean
    scanIntervalMs?: number
  }> = {},
) {
  let ledger = input.ledger ?? createMemoryResultPushLedger()
  const evidence = { mode: input.custodyEvidence ?? 'verified' }
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
          given.source.owner === 'supplier' || given.source.owner === COST_LOOKUP_OWNER
            ? { ok: given.source }
            : { failure: { kind: 'invalid', field: 'source', reason: 'untrusted' } },
        retry: () => ({
          failure: { kind: 'unavailable', dependency: 'retry', diagnostic: 'none' },
        }),
        handoff: given =>
          evidence.mode === 'unavailable'
            ? {
                failure: {
                  kind: 'unavailable',
                  dependency: 'consumer-evidence',
                  diagnostic: 'received-records-absent',
                },
              }
            : given.evidence.kind === 'retained' &&
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
      unacknowledgedResults: input.share ?? 10,
    },
    sending: {
      maxRetainedAttempts: 8,
      credentials: {
        layerOf: () => ({ failure: { kind: 'unavailable' } }),
        resolve: input => {
          expect(input.provider).toBe('test.invalid')
          expect(input.layer).toEqual({ layer: 'official' })
          expect(input.purpose).toBe(MODEL_SEND)
          expect(input.access.principal).toBe(PRINCIPAL)
          expect(tenantEquals(input.access.tenant, TENANT)).toBe(true)
          return { ok: new Map([['apiKey', 'synthetic-credential']]) }
        },
      },
      sources: [
        {
          profile: ADOPTION,
          supplier: ADOPTION,
          provider: providerName('test.invalid'),
          model: 'test',
          official: true,
          current: () => ({ ok: { authorized: true } }),
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
    settle: async input =>
      hooks.settle?.() === 'unavailable'
        ? { failure: { kind: 'unavailable', dependency: 'storage', diagnostic: 'settle-down' } }
        : raw.settle(input),
    advanceCleanup: async step =>
      hooks.advanceCleanup?.() === 'fail'
        ? { failure: { kind: 'unavailable', dependency: 'cleanup', diagnostic: 'synthetic' } }
        : raw.advanceCleanup(step),
    dispatches: async input => {
      await hooks.dispatches?.()
      return raw.dispatches(input)
    },
    scanPending: async input => {
      const answer = await hooks.scanPending?.()
      if (answer === 'unavailable')
        return {
          failure: { kind: 'unavailable', dependency: 'storage', diagnostic: 'queue_timeout' },
        }
      if (answer === 'denied') return { failure: { kind: 'denied', action: 'scan' } }
      return raw.scanPending(input)
    },
    loadRecovery: async input =>
      hooks.loadRecovery?.() === 'unavailable'
        ? { failure: { kind: 'unavailable', dependency: 'storage', diagnostic: 'queue_timeout' } }
        : raw.loadRecovery(input),
    loadOrigin: async input =>
      hooks.loadOrigin?.() === 'unavailable'
        ? { failure: { kind: 'unavailable', dependency: 'storage', diagnostic: 'queue_timeout' } }
        : raw.loadOrigin(input),
  }
  const resources: SendResources<unknown> = {
    async acquire(demand) {
      const script = createScriptedTransport({
        receipt: {
          supplier: demand.supplier.adoption,
          representation: requestRepresentation(demand.request),
          payloadDigest: 'a'.repeat(64),
        },
        facts: input.answer ?? ANSWER,
        ending: { kind: 'terminated', termination: ENDING },
        rejection: null,
      })
      return {
        ok: {
          transport: script.transport,
          openWithCredential() {
            throw new Error('this fixture has no live binding')
          },
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
    declare readonly loadControl: ModelCommands<unknown>['loadControl']
    declare readonly loadOrigin: ModelCommands<unknown>['loadOrigin']
    declare readonly loadRequest: ModelCommands<unknown>['loadRequest']
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
    declare readonly abandon: ModelCommands<unknown>['abandon']
    declare readonly confirmAccount: ModelCommands<unknown>['confirmAccount']
    declare readonly advanceCleanup: ModelCommands<unknown>['advanceCleanup']
    declare readonly query: ModelCommands<unknown>['query']
    declare readonly dispatches: ModelCommands<unknown>['dispatches']
    constructor(ctx: Context) {
      super(ctx)
      Object.assign(this, commands)
    }
  }
  const provided: { commands?: ModelCommands<unknown>; liveEvents?: LiveEventPort } = {}
  const pluginClass = () =>
    createModelRuntimeLocalPlugin({
      provider: given => {
        provided.commands = given.commands
        provided.liveEvents = given.liveEvents
        const send = memory.controls.send.createSender({ resources, commands: given.commands })
        const runtime = createModelRuntime(
          {
            commands: given.commands,
            send,
            retry: memory.dependencies.retry,
            instances: given.host,
            clock: given.clock,
            liveness: given.liveness,
            live: testLiveHosting({ events: given.liveEvents }),
          },
          CONFIGURATION,
        )
        const holds = input.holdsLiveBody
        return holds === undefined
          ? runtime
          : { ...runtime, holdsLiveBody: target => holds(target.call) }
      },
      qualifyObservation: async () => ({ ok: undefined }),
      ...(input.lostContact === true && {
        lostContact: (call: string) => ({
          owner: 'test',
          record: 'state-lock',
          revision: '1',
          digest: `call:${call}`,
        }),
      }),
      results: {
        ledger,
        limits: input.limits ?? LIMITS,
        ...(input.recovery !== undefined && { recovery: input.recovery }),
        ...(input.lookup !== undefined && { lookup: input.lookup }),
      },
    })
  let Plugin = pluginClass()
  const ctx = new Context()
  const messages: string[] = []
  const warnings: string[] = []
  ctx.logger.exporter({
    colors: 0,
    levels: { default: 3 },
    export: message => {
      const text = message.args.map(String).join(' ')
      messages.push(text)
      if (message.type === 'warn') warnings.push(text)
    },
  })
  return {
    ctx,
    hooks,
    handoffs,
    messages,
    warnings,
    raw,
    controls: memory.controls,
    evidence,
    provided,
    restart() {
      ledger = createMemoryResultPushLedger()
      Plugin = pluginClass()
    },
    async services() {
      await ctx.plugin(Authority)
      await ctx.plugin(Clock)
      await ctx.plugin(Commands)
    },
    load(): Fiber {
      return ctx.plugin(Plugin, {
        ...SETTINGS,
        scanIntervalMs: input.scanIntervalMs ?? SETTINGS.scanIntervalMs,
      })
    },
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
      return unbox(await this.tryAdmit(name))
    },
    tryAdmit(name: string) {
      return ctx.modelRuntime.calls.admit({
        principal: PRINCIPAL,
        tenant: TENANT,
        call: callOf(name),
        operation: op(`admit-${name}`),
        request,
        consumer: { owner: CONSUMER, work: 'work', position: 'answer', purpose: 'push-test' },
      })
    },
    access(name: string) {
      return { principal: PRINCIPAL, tenant: TENANT, call: callOf(name) }
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
    async route(name: string) {
      return unbox(
        await ctx.modelInstanceHost.directory.connect({
          principal: PRINCIPAL,
          tenant: TENANT,
          call: callOf(name),
        }),
      ).kind
    },
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
  expect(Object.isFrozen(delivery)).toBe(true)
  expect(w.handoffs).toHaveLength(1)
  expect(w.handoffs[0]?.evidence).toMatchObject({ kind: 'retained', custody: { owner: CONSUMER } })
  const custody = await w.custody('one')
  expect(custody).toMatchObject({ kind: 'acknowledged', cleanup: 'released' })
})

it('retires the route of a call once its result body is released (defect: every call keeps a route for the life of the host)', async () => {
  const w = world()
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.record('one')?.cleanup === 'released', 'the push, ACK and cleanup')
  expect(await w.route('one')).toBe('no-live-route')
})

it('gives the share of a call back after the ACK and the cleanup, so the same tenant admits its next call', async () => {
  const w = world({ share: 1 })
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('first')

  await until(() => w.record('first')?.cleanup === 'released', 'the push, ACK and cleanup')
  expect(await w.custody('first')).toMatchObject({ kind: 'acknowledged', cleanup: 'released' })
  const second = await w.tryAdmit('second')
  expect(second).toMatchObject({ ok: { call: callOf('second'), recovered: false } })
  await until(() => w.record('second')?.cleanup === 'released', 'the second call to its cleanup')
  expect(w.handoffs).toHaveLength(2)
})

it('keeps the custody and the share of a saved call while the consumer evidence is unavailable', async () => {
  const w = world({ share: 1, custodyEvidence: 'unavailable' })
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('first')

  await until(() => w.handoffs.length > 0, 'the ACK attempt after saved')
  await quiet()
  expect(w.record('first')?.result?.standing.status).toBe('saved')
  expect(await w.custody('first')).toEqual({ kind: 'producer' })
  expect(
    w.warnings.some(text => text.includes('acknowledgement did not complete (unavailable)')),
  ).toBe(true)
  expect(await w.tryAdmit('second')).toMatchObject({
    failure: { kind: 'unavailable', dependency: 'model-capacity' },
  })
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
  'takes a receipt with a %s as an unknown outcome: it pushes the same delivery again, acknowledges once saved and gives the share back (#1421)',
  async kind => {
    const w = world({ share: 1 })
    await w.services()
    await w.load()
    const scripted = scriptedReceiver()
    scripted.state.next = [kind]
    await w.register(scripted.receiver)
    await w.admit('one')

    await until(() => w.record('one')?.cleanup === 'released', 'the ACK and its cleanup')
    expect(scripted.pushes).toHaveLength(2)
    expect(scripted.pushes[1]).toEqual(scripted.pushes[0])
    expect(w.handoffs).toHaveLength(1)
    expect(await w.custody('one')).toMatchObject({ kind: 'acknowledged' })
    expect(w.messages.some(text => text.includes('receipt-mismatch'))).toBe(true)
    expect(await w.tryAdmit('second')).toMatchObject({ ok: { call: callOf('second') } })
  },
)

it.each(['foreign-key', 'foreign-owner'] as const)(
  'keeps a delivery unknown, not failed, while every receipt of the round has a %s (#1421)',
  async kind => {
    const w = world({ limits: { ...LIMITS, maxRedeliveries: 1, delaysMs: [60_000] } })
    await w.services()
    await w.load()
    const scripted = scriptedReceiver()
    scripted.state.next = [kind, kind]
    await w.register(scripted.receiver)
    await w.admit('one')

    await until(() => scripted.pushes.length === 2, 'the round of pushes')
    await quiet()
    expect(w.record('one')?.result?.standing).toEqual({ status: 'unknown' })
    expect(w.handoffs).toEqual([])
    expect(await w.custody('one')).toEqual({ kind: 'producer' })
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
  expect(w.messages.some(text => text.includes('receipt-mismatch'))).toBe(false)
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
    expect(w.record('one')?.result?.standing).toEqual({ status: 'unknown' })
    expect(w.handoffs).toEqual([])
    expect(await w.custody('one')).toEqual({ kind: 'producer' })
  },
)

it('records an abandonment when the receiver refuses the result for good, cleans it up and gives the share back (C8)', async () => {
  const w = world({ share: 1 })
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  scripted.state.next = ['denied']
  await w.register(scripted.receiver)
  const admitted = await w.admit('first')

  await until(() => w.record('first')?.cleanup === 'released', 'the abandonment and its cleanup')
  const custody = await w.custody('first')
  expect(custody).toMatchObject({
    kind: 'abandoned',
    basis: { kind: 'refused', refusal: 'denied' },
    cleanup: 'released',
  })
  expect(scripted.pushes).toHaveLength(1)
  expect(w.handoffs).toEqual([])
  const contact = await w.ctx.modelRuntime.calls.contact({
    principal: PRINCIPAL,
    tenant: TENANT,
    reference: admitted.reference,
  })
  expect(contact).toEqual({
    ok: { kind: 'lost', evidence: custody.kind === 'abandoned' ? custody.record : null },
  })
  expect(await w.tryAdmit('second')).toMatchObject({ ok: { call: callOf('second') } })
})

it('keeps producer custody when the outcome stays unknown through the round, and waits the configured interval before pushing again (C8, C9)', async () => {
  const w = world({ limits: { ...LIMITS, maxRedeliveries: 0, delaysMs: [60_000] } })
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  scripted.state.next = ['unknown']
  await w.register(scripted.receiver)
  await w.admit('one')

  await until(() => w.record('one')?.result?.standing.status === 'unknown', 'the unknown outcome')
  await new Promise(resolve => setTimeout(resolve, 1500))
  expect(scripted.pushes).toHaveLength(1)
  expect(await w.custody('one')).toEqual({ kind: 'producer' })
})

it('pushes an unknown result again with the same key after the configured interval and acknowledges it once saved (C8, C9)', async () => {
  const w = world({ limits: { ...LIMITS, maxRedeliveries: 0, delaysMs: [5] } })
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  scripted.state.next = ['unknown']
  await w.register(scripted.receiver)
  await w.admit('one')

  await until(
    () => w.record('one')?.acknowledgement === 'acknowledged',
    'the ACK after a second push',
  )
  const [first, second] = scripted.pushes
  expect(scripted.pushes).toHaveLength(2)
  expect(second).toEqual(first)
})

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

it('holds the result while this process holds the live body of the call, and pushes it as soon as the body is gone', async () => {
  let held = true
  // Neither a scan nor a pause ends within the test: only the exit of the body can wake the push.
  const w = world({
    holdsLiveBody: () => held,
    scanIntervalMs: 600_000,
    limits: { ...LIMITS, delaysMs: [600_000] },
  })
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(
    () => w.record('one')?.result !== null && w.record('one') !== undefined,
    'the frozen result',
  )
  await quiet()
  expect(scripted.pushes).toEqual([])
  expect(w.record('one')?.result?.standing).toEqual({ status: 'pending' })
  held = false
  w.provided.liveEvents?.exited({ tenant: TENANT, call: callOf('one') })
  await until(() => w.record('one')?.cleanup === 'released', 'the push once the body is gone')
  expect(scripted.pushes).toMatchObject([{ kind: 'result' }])
})

it('pushes a run of live events to the consumer frozen at admission, keyed by the reference of the call', async () => {
  const w = world()
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  const admitted = await w.admit('one')
  const consumer = { owner: CONSUMER, work: 'work', position: 'answer', purpose: 'push-test' }
  const run = { tenant: TENANT, call: callOf('one'), consumer, from: 1, to: 1 }
  const answer = await w.provided.liveEvents?.deliver(
    { ...run, frames: [{ gap: { from: 1, to: 1 } }] },
    new AbortController().signal,
  )
  expect(answer).toBe('saved')
  expect(scripted.pushes.find(each => each.kind === 'live')).toMatchObject({
    key: { kind: 'live', reference: admitted.reference, from: 1, to: 1 },
    consumer,
  })
})

it('keeps a result without a receiver waiting and pushes it when the consumer owner registers', async () => {
  const w = world()
  await w.services()
  await w.load()
  await w.admit('one')

  await until(() => w.record('one')?.result?.standing.status === 'waiting', 'the waiting result')
  expect(w.record('one')?.result?.standing).toEqual({ status: 'waiting', reason: 'no-receiver' })
  expect(w.messages.some(text => text.includes('no receiver'))).toBe(true)
  expect(w.warnings.some(text => text.includes('no receiver'))).toBe(true)

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
  expect(await w.late('one', '3')).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'model-result-push',
      diagnostic: 'late-account-capacity',
    },
  })

  w.controls.commands.reveal({ ...unknown, result: 'committed' })
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
  expect(w.record('one')?.accounts.map(held => held.delivery.key)).toMatchObject([
    { kind: 'account', revision: '2' },
  ])
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

const SCAN_TENANT: ResultPushRecovery = {
  scopes: async () => ({ ok: [{ principal: PRINCIPAL, tenant: TENANT }] }),
}

it('pushes again after a restart that lost the ledger, acknowledges, and gives the share back', async () => {
  const w = world({ share: 1, custodyEvidence: 'unavailable', recovery: SCAN_TENANT })
  await w.services()
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('first')
  await until(() => w.handoffs.length > 0, 'the ACK attempt after saved')
  expect(await w.custody('first')).toEqual({ kind: 'producer' })
  expect(await w.tryAdmit('second')).toMatchObject({
    failure: { kind: 'unavailable', dependency: 'model-capacity' },
  })

  await first.dispose()
  w.restart()
  expect(w.record('first')).toBeUndefined()
  w.evidence.mode = 'verified'
  await w.load()
  await until(() => w.record('first')?.cleanup === 'released', 'the push, ACK and cleanup')
  expect(scripted.pushes).toHaveLength(2)
  expect(scripted.pushes[1]).toEqual(scripted.pushes[0])
  expect(await w.custody('first')).toMatchObject({ kind: 'acknowledged', cleanup: 'released' })
  expect(w.messages.some(text => text.includes('start scan woke 1 owed calls'))).toBe(true)
  expect(await w.tryAdmit('second')).toMatchObject({ ok: { call: callOf('second') } })
})

it('cleans up after a restart that lost the ledger a result the last process abandoned, without pushing it again (C8)', async () => {
  const w = world({ share: 1, recovery: SCAN_TENANT })
  await w.services()
  w.hooks.advanceCleanup = () => 'fail'
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  scripted.state.next = ['denied']
  await w.register(scripted.receiver)
  await w.admit('first')
  await until(
    () => w.messages.some(text => text.includes('cleanup stays pending')),
    'the abandonment and the failed cleanup',
  )
  expect(await w.custody('first')).toMatchObject({ kind: 'abandoned', cleanup: 'pending' })

  await first.dispose()
  w.restart()
  w.hooks.advanceCleanup = () => 'pass'
  await w.load()
  await until(() => w.record('first')?.cleanup === 'released', 'the cleanup of the successor')
  expect(w.record('first')?.acknowledgement).toBe('abandoned')
  expect(scripted.pushes).toHaveLength(1)
  expect(w.handoffs).toEqual([])
  expect(await w.tryAdmit('second')).toMatchObject({ ok: { call: callOf('second') } })
})

it('looks a cost the stream did not carry up again on later wakes, and records it late once found (C14)', async () => {
  const answers: CostLookupAnswer[] = [
    { kind: 'missed' },
    { kind: 'unavailable', diagnostic: 'status-502' },
    {
      kind: 'found',
      cost: [
        { state: 'known', lexeme: '0.0000916', unit: 'openrouter-credit', source: 'billable' },
      ],
      place: 'openrouter',
    },
  ]
  const asked: unknown[] = []
  const w = world({
    limits: { ...LIMITS, delaysMs: [5, 5, 5] },
    answer: [{ kind: 'response', request: 'gen-push-1' }, ...ANSWER.slice(0, 2)],
    lookup: input => {
      asked.push(input)
      return Promise.resolve(answers.shift() ?? { kind: 'missed' })
    },
  })
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(
    async () => (await w.dispatches('one'))[0]?.account?.receipt === 'late',
    'the cost found on the third wake',
  )
  expect(asked).toHaveLength(3)
  expect((await w.dispatches('one'))[0]).toMatchObject({
    lookup: { misses: 1, exhausted: false },
    account: { cost: [{ lexeme: '0.0000916' }] },
  })
  expect(
    w.warnings.some(text => text.includes('cost lookup stays pending (unavailable status-502)')),
  ).toBe(true)
})

it('delivers after a restart a late account the last process accepted and did not deliver, confirms it, and only then cleans up (C15)', async () => {
  const w = world({ recovery: SCAN_TENANT })
  await w.services()
  w.hooks.advanceCleanup = () => 'fail'
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.record('one')?.acknowledgement === 'acknowledged', 'the ACK')
  scripted.state.refuseAccounts = true
  expect(await w.late('one', '2')).toMatchObject({ ok: { recovered: false } })
  await until(
    () => w.record('one')?.accounts.some(held => held.standing.status === 'waiting') === true,
    'the late account waiting for its receiver',
  )
  expect((await w.dispatches('one'))[0]?.lateDelivered).toBeUndefined()

  await first.dispose()
  w.restart()
  scripted.state.refuseAccounts = false
  w.hooks.advanceCleanup = () => 'pass'
  const before = scripted.pushes.length
  await w.load()
  await until(
    async () => (await w.dispatches('one'))[0]?.lateDelivered === '2',
    'the late account delivered again and confirmed',
  )
  const again = scripted.pushes.slice(before)
  expect(again.some(push => push.kind === 'account' && push.key.revision === '2')).toBe(true)
  await until(() => w.record('one')?.cleanup === 'released', 'the cleanup once delivered')
})

it('looks a cost up again after a restart for a call already cleaned up while the lookup was pending (T1)', async () => {
  const asked: unknown[] = []
  let found = false
  const w = world({
    recovery: SCAN_TENANT,
    limits: { ...LIMITS, delaysMs: [5, 5, 5] },
    answer: [{ kind: 'response', request: 'gen-released-1' }, ...ANSWER.slice(0, 2)],
    lookup: input => {
      asked.push(input)
      return Promise.resolve(
        found
          ? {
              kind: 'found',
              cost: [
                {
                  state: 'known',
                  lexeme: '0.0000916',
                  unit: 'openrouter-credit',
                  source: 'billable',
                },
              ],
              place: 'openrouter',
            }
          : { kind: 'missed' },
      )
    },
  })
  await w.services()
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(
    () => w.record('one')?.cleanup === 'released',
    'the cleanup while the lookup is pending',
  )
  await until(() => asked.length >= 1, 'the first lookup')
  await first.dispose()

  w.restart()
  const before = asked.length
  found = true
  await w.load()
  await until(() => asked.length > before, 'a lookup after the restart')
  await until(
    async () => (await w.dispatches('one'))[0]?.lateDelivered === '1',
    'the cost found after the restart, delivered and confirmed',
  )
  expect((await w.dispatches('one'))[0]).toMatchObject({
    account: { receipt: 'late', revision: '1', cost: [{ lexeme: '0.0000916' }] },
  })
})

it('delivers after a restart a late account recorded after the cleanup and not yet confirmed, once per revision (T1)', async () => {
  const w = world({ recovery: SCAN_TENANT })
  await w.services()
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.record('one')?.cleanup === 'released', 'the released body')
  scripted.state.refuseAccounts = true
  expect(await w.late('one', '2')).toMatchObject({ ok: { recovered: false } })
  expect(await w.late('one', '3')).toMatchObject({ ok: { recovered: false } })
  await until(
    () => w.record('one')?.accounts.some(held => held.standing.status === 'waiting') === true,
    'the late accounts waiting for their receiver',
  )
  expect((await w.dispatches('one'))[0]?.lateDelivered).toBeUndefined()
  await first.dispose()

  w.restart()
  scripted.state.refuseAccounts = false
  const before = scripted.pushes.length
  await w.load()
  await until(
    async () => (await w.dispatches('one'))[0]?.lateDelivered === '3',
    'the latest revision delivered again and confirmed',
  )
  const again = scripted.pushes.slice(before).filter(push => push.kind === 'account')
  expect(again.map(push => push.kind === 'account' && push.key.revision)).toEqual(['3'])
})

it('keeps a released call owing while its origin cannot be read, and delivers once it can (T1)', async () => {
  const w = world({ recovery: SCAN_TENANT, limits: { ...LIMITS, delaysMs: [5, 5, 5] } })
  await w.services()
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.record('one')?.cleanup === 'released', 'the released body')
  scripted.state.refuseAccounts = true
  expect(await w.late('one', '2')).toMatchObject({ ok: { recovered: false } })
  await until(
    () => w.record('one')?.accounts.some(held => held.standing.status === 'waiting') === true,
    'the late account waiting for its receiver',
  )
  await first.dispose()

  w.restart()
  scripted.state.refuseAccounts = false
  let reads = 0
  w.hooks.loadOrigin = () => (reads++ < 2 ? 'unavailable' : 'pass')
  await w.load()
  await until(
    () => w.warnings.some(text => text.includes('could not be frozen (late-account-origin)')),
    'the origin it could not read',
  )
  await until(
    async () => (await w.dispatches('one'))[0]?.lateDelivered === '2',
    'the late account delivered once the origin answered',
  )
  expect(reads).toBeGreaterThan(2)
})

it('does not deliver after a restart a late account of an abandoned call, and still records a found cost (T1)', async () => {
  const asked: unknown[] = []
  let found = false
  const w = world({
    recovery: SCAN_TENANT,
    limits: { ...LIMITS, delaysMs: [5, 5, 5] },
    answer: [{ kind: 'response', request: 'gen-abandoned-1' }, ...ANSWER.slice(0, 2)],
    lookup: input => {
      asked.push(input)
      return Promise.resolve(
        found
          ? {
              kind: 'found',
              cost: [
                {
                  state: 'known',
                  lexeme: '0.0000916',
                  unit: 'openrouter-credit',
                  source: 'billable',
                },
              ],
              place: 'openrouter',
            }
          : { kind: 'missed' },
      )
    },
  })
  await w.services()
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  scripted.state.next = ['denied']
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.record('one')?.cleanup === 'released', 'the abandonment and its cleanup')
  expect(await w.custody('one')).toMatchObject({ kind: 'abandoned' })
  await until(() => asked.length >= 1, 'the first lookup')
  await first.dispose()

  w.restart()
  found = true
  const before = scripted.pushes.length
  await w.load()
  await until(
    async () => (await w.dispatches('one'))[0]?.account?.receipt === 'late',
    'the cost recorded after the restart',
  )
  expect(scripted.pushes.slice(before)).toEqual([])
  expect((await w.dispatches('one'))[0]?.lateDelivered).toBeUndefined()
})

it('drives after a restart a call the last process left unsettled, then pushes and gives the share back', async () => {
  const w = world({ share: 1, recovery: SCAN_TENANT })
  await w.services()
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  w.hooks.settle = () => 'unavailable'
  await w.admit('first')
  await until(
    async () => unbox(await w.raw.dispatches(w.access('first')))[0]?.terminal != null,
    'the dispatch ended and the settle refused',
  )
  await first.dispose()
  w.restart()
  w.hooks.settle = () => 'pass'
  await w.load()
  await until(() => w.record('first')?.cleanup === 'released', 'the drive, push, ACK and cleanup')
  expect(scripted.pushes).toHaveLength(1)
  expect(await w.custody('first')).toMatchObject({ kind: 'acknowledged', cleanup: 'released' })
  expect(await w.tryAdmit('second')).toMatchObject({ ok: { call: callOf('second') } })
})

it('wakes nothing on a later restart once the call is acknowledged and cleaned', async () => {
  const w = world({ recovery: SCAN_TENANT })
  await w.services()
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.record('one')?.cleanup === 'released', 'the push, ACK and cleanup')

  await first.dispose()
  w.restart()
  await w.load()
  await until(
    () => w.messages.filter(text => text.includes('start scan woke')).length === 2,
    'the scan of the restart',
  )
  await quiet()
  expect(w.messages.at(-1)).toContain('start scan woke 0 owed calls')
  expect(scripted.pushes).toHaveLength(1)
  expect(w.handoffs).toHaveLength(1)
  expect(w.record('one')).toBeUndefined()
})

it('acknowledges after a restart when the result was saved but the ACK answer was lost, without a second push', async () => {
  const w = world({ recovery: SCAN_TENANT, limits: { ...LIMITS, maxRedeliveries: 0 } })
  await w.services()
  w.hooks.handoff = () => 'lost'
  w.hooks.advanceCleanup = () => 'fail'
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.handoffs.length > 0, 'the ACK attempt')
  await until(async () => (await w.custody('one')).kind === 'acknowledged', 'the committed ACK')

  await first.dispose()
  w.restart()
  w.hooks.handoff = () => 'pass'
  w.hooks.advanceCleanup = () => 'pass'
  await w.load()
  await until(() => w.record('one')?.cleanup === 'released', 'the cleanup after the restart')
  expect(await w.custody('one')).toMatchObject({ kind: 'acknowledged', cleanup: 'released' })
  expect(scripted.pushes).toHaveLength(1)
  expect(w.handoffs).toHaveLength(1)
})

it('says so when the start scan cannot run, and the call stays with the producer', async () => {
  const refusing: ResultPushRecovery = {
    scopes: async () => ({ ok: [{ principal: { subject: 'stranger' }, tenant: TENANT }] }),
  }
  const w = world({ custodyEvidence: 'unavailable', recovery: refusing })
  await w.services()
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.handoffs.length > 0, 'the ACK attempt after saved')

  await first.dispose()
  w.restart()
  w.evidence.mode = 'verified'
  await w.load()
  await until(
    () => w.warnings.some(text => text.includes('start scan stopped at scan (denied)')),
    'the refused scan',
  )
  await quiet()
  expect(scripted.pushes).toHaveLength(1)
  expect(await w.custody('one')).toEqual({ kind: 'producer' })
})

it('answers the contact of a call the start scan has not reached as unknown, never as lost (C7)', async () => {
  const w = world({ recovery: SCAN_TENANT, lostContact: true })
  await w.services()
  const first = w.load()
  await first
  w.hooks.settle = () => 'unavailable'
  const admitted = await w.admit('first')
  await until(
    async () => unbox(await w.raw.dispatches(w.access('first')))[0]?.terminal != null,
    'the dispatch ended and the settle refused',
  )
  await first.dispose()
  w.restart()
  let scan = () => {}
  w.hooks.scanPending = () => new Promise<void>(resolve => (scan = resolve))
  await w.load()
  const contact = () =>
    w.ctx.modelRuntime.calls.contact({
      principal: PRINCIPAL,
      tenant: TENANT,
      reference: admitted.reference,
    })
  expect(await contact()).toEqual({ ok: { kind: 'unknown' } })
  w.hooks.settle = () => 'pass'
  w.hooks.scanPending = () => 'pass'
  scan()
  await until(async () => {
    const answer = await contact()
    return 'ok' in answer && answer.ok.kind !== 'unknown'
  }, 'an answer once the scan reached the call')
  expect(await contact()).not.toEqual({ ok: { kind: 'unknown' } })
})

it('answers lost at once, on a host without a start scan, for a call no drive holds', async () => {
  const w = world({ lostContact: true })
  await w.services()
  const admitted = unbox(
    await w.raw.admit({
      principal: PRINCIPAL,
      tenant: TENANT,
      call: callOf('left'),
      operation: op('admit-left'),
      request,
      consumer: { owner: CONSUMER, work: 'work', position: 'answer', purpose: 'push-test' },
    }),
  )
  await w.load()
  expect(
    await w.ctx.modelRuntime.calls.contact({
      principal: PRINCIPAL,
      tenant: TENANT,
      reference: admitted.reference,
    }),
  ).toMatchObject({ ok: { kind: 'lost' } })
})

it('drives a call that was only admitted when the last process died, once, to its settle', async () => {
  const w = world({ recovery: SCAN_TENANT })
  await w.services()
  unbox(
    await w.raw.admit({
      principal: PRINCIPAL,
      tenant: TENANT,
      call: callOf('running'),
      operation: op('admit-running'),
      request,
      consumer: { owner: CONSUMER, work: 'work', position: 'answer', purpose: 'push-test' },
    }),
  )
  await w.load()
  await until(
    () => w.messages.some(text => text.includes('start scan woke 1 owed calls')),
    'the start scan',
  )
  await until(async () => {
    const found = unbox(
      await w.raw.recall({ ...w.access('running'), admission: op('admit-running') }),
    )
    return found.kind === 'found' && found.state.phase === 'settled'
  }, 'the drive the scan woke')
  expect(unbox(await w.raw.dispatches(w.access('running')))).toHaveLength(1)
})

afterEach(() => {
  vi.useRealTimers()
})

async function owedAfterRestart(recovery: ResultPushRecovery) {
  const w = world({ custodyEvidence: 'unavailable', recovery })
  await w.services()
  const first = w.load()
  await first
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  await w.admit('one')
  await until(() => w.handoffs.length > 0, 'the ACK attempt after saved')
  await first.dispose()
  w.restart()
  w.evidence.mode = 'verified'
  return { w, scripted }
}

const PAUSES = [1000, 5000, 30000, 30000]

it('scans a tenant it could not read again after 1 s, 5 s and 30 s, without waiting for the next start', async () => {
  const { w, scripted } = await owedAfterRestart(SCAN_TENANT)
  const scan = { attempts: 0, readable: false, at: [] as number[] }
  w.hooks.scanPending = () => {
    scan.attempts += 1
    scan.at.push(Date.now())
    return scan.readable ? 'pass' : 'unavailable'
  }
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.load()
  await until(
    () => w.warnings.some(text => text.includes('start scan stopped at scan (unavailable)')),
    'the unreadable scan',
  )
  expect(scan.attempts).toBe(1)
  for (const [done, pause] of PAUSES.entries()) {
    await vi.advanceTimersByTimeAsync(pause)
    await until(() => scan.attempts >= done + 2, 'the next scan')
  }
  expect(scan.attempts).toBe(PAUSES.length + 1)
  const gaps = scan.at.slice(1).map((at, index) => at - (scan.at[index] ?? at))
  gaps.forEach((gap, index) => expect(gap).toBeGreaterThanOrEqual(PAUSES[index] ?? 0))
  expect(scripted.pushes).toHaveLength(1)
  scan.readable = true
  await vi.advanceTimersByTimeAsync(30000)
  await until(() => w.record('one')?.cleanup === 'released', 'the push, ACK and cleanup')
  expect(scripted.pushes).toHaveLength(2)
  expect(scripted.pushes[1]).toEqual(scripted.pushes[0])
  expect(w.messages.at(-1)).toContain('start scan woke 1 owed calls')
  const attempts = scan.attempts
  await vi.advanceTimersByTimeAsync(120000)
  expect(scan.attempts).toBe(attempts)
})

it('lists the tenants again when the list cannot be read', async () => {
  const list = { readable: true }
  const flaky: ResultPushRecovery = {
    scopes: async () =>
      list.readable
        ? { ok: [{ principal: PRINCIPAL, tenant: TENANT }] }
        : { failure: { kind: 'unavailable', dependency: 'tenants', diagnostic: 'synthetic' } },
  }
  const { w, scripted } = await owedAfterRestart(flaky)
  list.readable = false
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.load()
  await until(
    () => w.warnings.some(text => text.includes('start scan stopped at scopes (unavailable)')),
    'the unreadable list',
  )
  list.readable = true
  await vi.advanceTimersByTimeAsync(1000)
  await until(() => w.record('one')?.cleanup === 'released', 'the push, ACK and cleanup')
  expect(scripted.pushes).toHaveLength(2)
})

it('scans a tenant again when one of its calls could not be loaded', async () => {
  const { w, scripted } = await owedAfterRestart(SCAN_TENANT)
  const load = { readable: false }
  w.hooks.loadRecovery = () => (load.readable ? 'pass' : 'unavailable')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.load()
  await until(
    () => w.warnings.some(text => text.includes('start scan stopped at load (unavailable)')),
    'the unreadable call',
  )
  load.readable = true
  await vi.advanceTimersByTimeAsync(1000)
  await until(() => w.record('one')?.cleanup === 'released', 'the push, ACK and cleanup')
  expect(scripted.pushes).toHaveLength(2)
})

it('does not scan again after a definite refusal; the tenant waits for the next start', async () => {
  const { w, scripted } = await owedAfterRestart(SCAN_TENANT)
  const scan = { attempts: 0 }
  w.hooks.scanPending = () => {
    scan.attempts += 1
    return 'denied'
  }
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.load()
  await until(
    () => w.warnings.some(text => text.includes('the rest waits for the next start')),
    'the refused scan',
  )
  await vi.advanceTimersByTimeAsync(120000)
  expect(scan.attempts).toBe(1)
  expect(scripted.pushes).toHaveLength(1)
})

it('stops scanning again when the plugin is unloaded, without waiting for the pause', async () => {
  const { w } = await owedAfterRestart(SCAN_TENANT)
  const scan = { attempts: 0 }
  w.hooks.scanPending = () => {
    scan.attempts += 1
    return 'unavailable'
  }
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const second = w.load()
  await second
  await until(() => scan.attempts === 1, 'the unreadable scan')
  let unloaded = false
  void second.dispose().then(() => {
    unloaded = true
  })
  await vi.advanceTimersByTimeAsync(600)
  expect(unloaded).toBe(true)
  await vi.advanceTimersByTimeAsync(120000)
  expect(scan.attempts).toBe(1)
})
