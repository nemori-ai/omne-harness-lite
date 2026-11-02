// Real Cordis and runtime. The memory commands and manual clock come from model/testing.
// The named authority and send boundary below stand in for the application adapters.
import { Context } from '@deepseek-ai/cordis'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type FixedModelRequest,
} from '@omne-harness/model-contract'
import type { ModelCommands, ModelSendBoundary } from '@omne-harness/model-contract/provider'
import {
  ModelClockService,
  ModelCommandsService,
  ModelHostAuthorityService,
  modelClockKey,
  modelCommandsKey,
  modelHostAuthorityKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { expect, it } from 'vitest'
import {
  createConfiguredModelRuntimeLocalPlugin,
  createMemoryResultPushLedger,
} from '../src/cordis.ts'

function unbox<T>(value: { ok: T } | { failure: unknown }): T {
  if ('ok' in value) return value.ok
  throw new Error('invalid fixture')
}
const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
if (!account.ok || !organization.ok) throw new Error('fixture identity')
const TENANT = tenant(organization.value, account.value)
const PRINCIPAL = Object.freeze({ subject: 'configured-host-test' })
const CALL = unbox(decodeModelCallId('mcall_configured'))
const ADOPTION = { owner: 'test', name: 'test', revision: '1', digest: '0'.repeat(64) }
// Values from runtime-push.spec.ts, for a bounded in-process fixture. No production defaults.
const CONFIG = {
  host: { concurrencyLimit: 4, wakeCapacity: 16, scanBatchSize: 10, scanIntervalMs: 0 },
  runtime: {
    outputBatchBytes: 1,
    outputBatchDelayMs: 0,
    observerBufferBytes: 4096,
    observerCheckIntervalMs: 25,
    readIdleMs: 1000,
    resultPageTargetBytes: 4096,
    retryBackoffMs: 0,
    cleanupRetryMs: 0,
  },
  results: {
    maxConcurrentCalls: 4,
    maxRedeliveries: 2,
    maxCleanupSteps: 8,
    maxPendingAccountsPerTenant: 4,
    maxPendingAccounts: 8,
  },
}
const REQUEST: FixedModelRequest = {
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

function fixture() {
  const memory = createTestModelDependencies<unknown>({
    start: '2026-11-02T00:00:00.000Z',
    maxWaiters: 32,
    maxQueued: 32,
    sends: [],
    owners: [{ consumerOwner: 'test', work: { kind: 'exempt' }, evidence: ADOPTION }],
    authority: {
      authorize: ({ access, action }) =>
        access.principal === PRINCIPAL
          ? { ok: { owner: 'test', subject: 'configured-host-test', revision: '1' } }
          : { failure: { kind: 'denied', action } },
      execution: () => ({ ok: { owner: 'test', subject: 'channel', revision: '1' } }),
    },
    evidence: [
      {
        adoption: ADOPTION,
        continuity: given => ({ ok: given.source }),
        materialization: () => ({ failure: { kind: 'denied', action: 'materialization' } }),
        receive: () => ({ failure: { kind: 'denied', action: 'receive' } }),
        lateFact: () => ({ failure: { kind: 'denied', action: 'lateFact' } }),
        retry: () => ({
          failure: { kind: 'unavailable', dependency: 'test', diagnostic: 'no-retry' },
        }),
        handoff: () => ({ failure: { kind: 'denied', action: 'handoff' } }),
      },
    ],
    limits: {
      scanPageCalls: 10,
      resultPageParts: 4,
      resultPageTargetBytes: 4096,
      readIdleMs: 1000,
      capacity: { bytes: '1000000', blocks: '200', attachmentBytes: '0' },
    },
  })
  const commands = memory.dependencies.commands
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
  const resolved: unknown[] = []
  class Authority extends ModelHostAuthorityService<unknown> {
    readonly resolve: ModelHostAuthorityService<unknown>['resolve'] = async target => {
      resolved.push(target)
      return {
        ok: {
          ...target,
          principal: PRINCIPAL,
          instance: unbox(decodeModelInstanceId('minst_configured')),
          operation: unbox(decodeModelOperationId('mop_claim')),
          continuity: { owner: 'test', record: 'call', revision: '1', digest: '1'.repeat(64) },
        },
      }
    }
  }
  class Clock extends ModelClockService {
    readonly now = memory.dependencies.clock.now
    readonly waitUntil = memory.dependencies.clock.waitUntil
  }
  const observed: unknown[] = []
  const sends: unknown[] = []
  const send: ModelSendBoundary<unknown> = {
    send: async input => {
      sends.push(input)
      return {
        kind: 'not-started',
        failure: { kind: 'unavailable', dependency: 'test-send', diagnostic: 'synthetic' },
      }
    },
  }
  const ledger = createMemoryResultPushLedger()
  const Plugin = createConfiguredModelRuntimeLocalPlugin({
    send,
    ledger,
    qualifyObservation: async access => {
      observed.push(access)
      return access.principal === PRINCIPAL
        ? { ok: undefined }
        : { failure: { kind: 'denied', action: 'observe' } }
    },
  })
  const ctx = new Context()
  ctx.logger.exporter({ colors: 0, levels: { default: 0 }, export() {} })
  return {
    ctx,
    Plugin,
    ledger,
    observed,
    resolved,
    sends,
    async services() {
      await ctx.plugin(Commands)
      await ctx.plugin(Clock)
      return ctx.plugin(Authority)
    },
  }
}

it('rejects every missing or invalid numeric setting through the Cordis configuration boundary', async () => {
  const f = fixture()
  await f.services()
  try {
    for (const [group, values] of Object.entries(CONFIG)) {
      for (const value of [undefined, null, [], 1]) {
        const fiber = f.ctx.plugin(f.Plugin, { ...CONFIG, [group]: value })
        await expect(
          (async () => {
            await fiber
          })(),
          `${group} must be an object`,
        ).rejects.toThrow()
      }
      for (const field of Object.keys(values)) {
        const lower = [
          'scanIntervalMs',
          'outputBatchDelayMs',
          'retryBackoffMs',
          'cleanupRetryMs',
          'maxRedeliveries',
        ].includes(field)
          ? 0
          : 1
        for (const value of [
          undefined,
          null,
          '1',
          -1,
          0.5,
          NaN,
          Infinity,
          ...(lower === 1 ? [0] : []),
          ...(group !== 'runtime' || field === 'observerCheckIntervalMs'
            ? [Number.MAX_SAFE_INTEGER + 1]
            : []),
        ]) {
          const config = { ...CONFIG, [group]: { ...values, [field]: value } }
          const fiber = f.ctx.plugin(f.Plugin, config)
          await expect(
            (async () => {
              await fiber
            })(),
            `${group}.${field}=${String(value)}`,
          ).rejects.toThrow()
          expect(f.ctx.modelRuntime).toBeUndefined()
          expect(f.ctx.modelInstanceHost).toBeUndefined()
        }
      }
    }
  } finally {
    await f.ctx.fiber.dispose()
  }
})

it('publishes ACTIVE services, checks the supplied observer authority and closes the old host on dependency loss', async () => {
  const f = fixture()
  const authority = await f.services()
  try {
    expect(f.Plugin.inject).toEqual([modelCommandsKey, modelClockKey, modelHostAuthorityKey])
    const fiber = await f.ctx.plugin(f.Plugin, CONFIG)
    expect(fiber.state).toBe(2) // Cordis 4.0.4: FiberState.ACTIVE is an erased const enum.
    expect(f.ctx.modelRuntime.calls.admit).toBeTypeOf('function')
    const old = f.ctx.modelInstanceHost
    const access = { principal: PRINCIPAL, tenant: TENANT, call: CALL }
    const publication = unbox(
      await old.publish(
        { ...access, instance: unbox(decodeModelInstanceId('minst_observed')), generation: '1' },
        {
          instance: unbox(decodeModelInstanceId('minst_observed')),
          observe: () => (async function* () {})(),
        },
      ),
    )
    expect(await old.directory.connect(access)).toMatchObject({ ok: { kind: 'live' } })
    const denied = { ...access, principal: { ...PRINCIPAL } }
    expect(await old.directory.connect(denied)).toEqual({
      failure: { kind: 'denied', action: 'observe' },
    })
    expect(f.observed).toEqual([access, denied])
    unbox(await old.withdraw(publication))
    await authority.dispose()
    await expect.poll(() => f.ctx.modelInstanceHost).toBeUndefined()
    expect(f.ctx.modelRuntime).toBeUndefined()
    expect(await old.schedule(access)).toMatchObject({ failure: { diagnostic: 'host-closed' } })
    const release = f.ledger.claim()
    release()
  } finally {
    await f.ctx.fiber.dispose()
  }
})

it('drives with the injected authority principal and delegates the complete send boundary', async () => {
  const f = fixture()
  await f.services()
  try {
    await f.ctx.plugin(f.Plugin, CONFIG)
    unbox(
      await f.ctx.modelRuntime.calls.admit({
        principal: PRINCIPAL,
        tenant: TENANT,
        call: CALL,
        operation: unbox(decodeModelOperationId('mop_admit')),
        request: REQUEST,
        consumer: { owner: 'test', work: 'work', position: 'position', purpose: 'test' },
        capacity: { bytes: '100000', blocks: '20', attachmentBytes: '0' },
      }),
    )
    await expect.poll(() => f.sends.length).toBe(1)
    expect(f.resolved).toContainEqual({ tenant: TENANT, call: CALL })
    expect(f.sends[0]).toMatchObject({ principal: PRINCIPAL, tenant: TENANT, call: CALL })
  } finally {
    await f.ctx.fiber.dispose()
  }
})
