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
  type ModelConfiguration,
  type SendResources,
} from '@omne-harness/model'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeResultVersion,
  encodeModelInvocationRef,
  type DurableEvidence,
  type FixedModelRequest,
  type ModelCallId,
  type ModelDelivery,
  type ModelDeliveryFailure,
  type ModelResultReceiver,
  type ModelSavedReceipt,
} from '@omne-harness/model-contract'
import {
  MODEL_SEND,
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
import { expect } from 'vitest'
import {
  createMemoryResultPushLedger,
  createModelRuntimeLocalPlugin,
  type ResultPushLedger,
  type ResultPushLimits,
} from '../../src/cordis.ts'
import { providerName } from './credentials.ts'

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
export const LIMITS: ResultPushLimits = {
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

export async function until(check: () => boolean, label: string): Promise<void> {
  for (let tries = 0; tries < 1000; tries += 1) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error(`timed out waiting for ${label}`)
}

export async function quiet(): Promise<void> {
  for (let n = 0; n < 5; n += 1) await new Promise(resolve => setTimeout(resolve, 5))
}

type Conjunct = 'material' | 'responsibility' | 'deduplication' | 'retention'

export function scriptedReceiver() {
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
  handoff?(): 'lost' | 'pass'
  advanceCleanup?(): 'fail' | 'pass'
  dispatches?(): Promise<void> | void
  resolve?(): Promise<'pass' | 'refuse'> | 'pass' | 'refuse'
  loadRecovery?(): 'fail' | 'pass'
}

export function world(
  input: Readonly<{
    limits?: ResultPushLimits
    ledger?: ResultPushLedger
    custodyEvidence?: 'verified' | 'unavailable'
    share?: number
    lostContact?: (instance: string) => DurableEvidence | null
  }> = {},
) {
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
        handoff: given =>
          input.custodyEvidence === 'unavailable'
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
    loadRecovery: async target =>
      hooks.loadRecovery?.() === 'fail'
        ? { failure: { kind: 'unavailable', dependency: 'records', diagnostic: 'synthetic' } }
        : raw.loadRecovery(target),
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
    readonly resolve = async (target: { tenant: TenantId; call: ModelCallId }) =>
      (await hooks.resolve?.()) === 'refuse'
        ? ({
            failure: { kind: 'unavailable', dependency: 'host', diagnostic: 'refused' },
          } as const)
        : this.trusted(target)
    readonly trusted = (target: { tenant: TenantId; call: ModelCallId }) => ({
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
    declare readonly advanceCleanup: ModelCommands<unknown>['advanceCleanup']
    declare readonly query: ModelCommands<unknown>['query']
    declare readonly dispatches: ModelCommands<unknown>['dispatches']
    constructor(ctx: Context) {
      super(ctx)
      Object.assign(this, commands)
    }
  }
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
          liveness: given.liveness,
        },
        CONFIGURATION,
      )
    },
    qualifyObservation: async () => ({ ok: undefined }),
    results: { ledger, limits: input.limits ?? LIMITS },
    ...(input.lostContact === undefined ? {} : { lostContact: input.lostContact }),
  })
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
    ledger,
    hooks,
    handoffs,
    messages,
    warnings,
    raw,
    controls: memory.controls,
    Plugin,
    provided,
    contact(name: string) {
      return ctx.modelRuntime.calls.contact({
        principal: PRINCIPAL,
        tenant: TENANT,
        reference: unbox(
          encodeModelInvocationRef({
            tenant: TENANT,
            call: callOf(name),
            admission: op(`admit-${name}`),
          }),
        ),
      })
    },
    admitBehind(name: string) {
      return raw.admit({
        principal: PRINCIPAL,
        tenant: TENANT,
        call: callOf(name),
        operation: op(`admit-${name}`),
        request,
        consumer: { owner: CONSUMER, work: 'work', position: 'answer', purpose: 'push-test' },
      })
    },
    async services() {
      await ctx.plugin(Authority)
      await ctx.plugin(Clock)
      await ctx.plugin(Commands)
    },
    load(): Fiber {
      return ctx.plugin(Plugin, { ...SETTINGS })
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
