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
import { providerName } from './support/credentials.ts'

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
const CONFIG = {
  host: { concurrencyLimit: 4, wakeCapacity: 16, scanBatchSize: 10, scanIntervalMs: 25 },
  runtime: {
    outputBatchBytes: 1,
    outputBatchDelayMs: 0,
    observerBufferBytes: 4096,
    observerCheckIntervalMs: 25,
    readIdleMs: 1000,
    resultPageTargetBytes: 4096,
  },
  retry: {
    adoption: ADOPTION,
    policy: { maxAttempts: 2, maxElapsedMs: 1000, delaysMs: [0], jitter: 0 },
    replayResend: { max: 1 },
  },
  results: {
    maxConcurrentCalls: 4,
    maxRedeliveries: 2,
    maxCleanupSteps: 8,
    maxPendingAccountsPerTenant: 4,
    maxPendingAccounts: 8,
    maxCostMisses: 3,
    delaysMs: [1000, 5000, 30000],
  },
}
const REQUEST: FixedModelRequest = {
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
      unacknowledgedResults: 10,
    },
  })
  const commands = memory.dependencies.commands
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

it('rejects a result push interval table that is empty or lists anything but integers of at least 1 (C9)', async () => {
  const f = fixture()
  await f.services()
  try {
    for (const delaysMs of [[], [0], [1.5], ['1'], [1, -1]] as unknown as number[][]) {
      const fiber = f.ctx.plugin(f.Plugin, { ...CONFIG, results: { ...CONFIG.results, delaysMs } })
      await expect(
        (async () => {
          await fiber
        })(),
        `results.delaysMs=${JSON.stringify(delaysMs)}`,
      ).rejects.toThrow()
      expect(f.ctx.modelRuntime).toBeUndefined()
    }
  } finally {
    await f.ctx.fiber.dispose()
  }
})

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
        const lower = ['scanIntervalMs', 'outputBatchDelayMs', 'maxRedeliveries'].includes(field)
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

it('the schema gives the retry settings as they are, and names what is wrong with them', () => {
  const f = fixture()
  const validate = (config: unknown) => f.Plugin.Config['~standard'].validate(config)
  const { adoption, policy, replayResend } = CONFIG.retry
  expect(validate(CONFIG)).toMatchObject({ value: { retry: CONFIG.retry } })
  const unnamed = {
    issues: [{ message: 'retry.adoption must name owner, name, revision and digest' }],
  }
  for (const field of ['owner', 'name', 'revision', 'digest'] as const)
    for (const value of ['', 1, undefined])
      expect(
        validate({
          ...CONFIG,
          retry: { adoption: { ...adoption, [field]: value }, policy, replayResend },
        }),
        `${field}=${String(value)}`,
      ).toEqual(unnamed)
  expect(
    validate({ ...CONFIG, retry: { adoption, policy: { ...policy, delaysMs: [] }, replayResend } }),
  ).toEqual({
    issues: [{ message: 'retry.policy: retry policy field delaysMs is missing or out of range' }],
  })
  expect(validate({ ...CONFIG, retry: { adoption, policy: 1, replayResend } })).toEqual({
    issues: [{ message: 'retry.policy: retry policy is not an object' }],
  })
  expect(validate({ ...CONFIG, retry: { adoption, policy } })).toEqual({
    issues: [{ message: 'retry.replayResend must be an object' }],
  })
  for (const max of [-1, 1.5, '1'])
    expect(validate({ ...CONFIG, retry: { adoption, policy, replayResend: { max } } })).toEqual({
      issues: [
        {
          message: 'retry.replayResend.max must be an integer of at least 0 within the safe range',
        },
      ],
    })
  expect(
    validate({ ...CONFIG, retry: { adoption, policy, replayResend: { max: 0 } } }),
  ).toMatchObject({ value: { retry: { replayResend: { max: 0 } } } })
  void f.ctx.fiber.dispose()
})

it('rejects a retry policy out of range and an adoption without a name', async () => {
  const f = fixture()
  await f.services()
  try {
    const { adoption, policy, replayResend } = CONFIG.retry
    for (const retry of [
      { adoption, policy: { ...policy, maxAttempts: 0 }, replayResend },
      { adoption, policy: { ...policy, delaysMs: [] }, replayResend },
      { adoption, policy: { ...policy, delaysMs: [-1] }, replayResend },
      { adoption, policy: { ...policy, jitter: 2 }, replayResend },
      { adoption, policy: { ...policy, maxElapsedMs: -1 }, replayResend },
      { adoption: { ...adoption, name: '' }, policy, replayResend },
      { adoption: { ...adoption, digest: undefined }, policy, replayResend },
    ]) {
      const fiber = f.ctx.plugin(f.Plugin, { ...CONFIG, retry: retry as typeof CONFIG.retry })
      await expect(
        (async () => {
          await fiber
        })(),
        JSON.stringify(retry),
      ).rejects.toThrow()
      expect(f.ctx.modelRuntime).toBeUndefined()
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
    expect(fiber.state).toBe(2)
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
      }),
    )
    await expect.poll(() => f.sends.length).toBe(1)
    expect(f.resolved).toContainEqual({ tenant: TENANT, call: CALL })
    expect(f.sends[0]).toMatchObject({ principal: PRINCIPAL, tenant: TENANT, call: CALL })
  } finally {
    await f.ctx.fiber.dispose()
  }
})
