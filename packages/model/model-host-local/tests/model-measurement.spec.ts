import { Context, Service } from '@deepseek-ai/cordis'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import type { PreparationBinding } from '@omne-harness/model'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelInstanceId,
  decodeRevision,
  type Adoption,
  type ModelProfile,
} from '@omne-harness/model-contract'
import {
  judgeFixedModelRequest,
  type ModelRequestPreparation,
  type SendDemand,
} from '@omne-harness/model-contract/provider'
import { expect, it } from 'vitest'
import { createModelRequestPreparationPlugin } from '../src/cordis.ts'
import {
  createMeasuredFixedDelayModel,
  measureModelPreparation,
  type MeasurementContext,
  type ModelMeasurementEvent,
  type MonotonicReading,
} from './support/model-measurement.ts'

const ADOPTION: Adoption = {
  owner: 'measurement-test',
  name: 'test',
  revision: '1',
  digest: '0'.repeat(64),
}
const SECRET = 'measurement-secret-body-sentinel'
const supplier = {
  adoption: ADOPTION,
  recipient: 'test.invalid',
  model: 'test',
  credential: { kind: 'factory' as const },
}
const identity = () => {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  if (!account.ok || !organization.ok) throw new Error('fixture identity')
  return tenant(organization.value, account.value)
}
const TENANT = identity()
const revision = decodeRevision('1')
if (!('ok' in revision)) throw new Error('fixture revision')
const PROFILE: ModelProfile = {
  identity: { scope: { kind: 'factory' }, route: 'test' },
  adoption: ADOPTION,
  revision: revision.ok,
  updatedAt: '2026-11-02T00:00:00Z',
  availability: 'active',
  definition: {
    suppliers: [{ adoption: ADOPTION, recipient: 'test.invalid', model: 'test' }],
    fallback: false,
    input: ['text'],
    output: ['text'],
    context: {
      window: { provided: '1000', upstream: [] },
      input: null,
      output: { provided: '100', upstream: [] },
      compactionTriggerPercent: '80',
    },
    limits: [],
    parameters: [],
    representation: ADOPTION,
    meter: ADOPTION,
    retryPolicy: ADOPTION,
  },
}
const judged = judgeFixedModelRequest({
  profile: ADOPTION,
  suppliers: [supplier],
  fallback: false,
  retryPolicy: ADOPTION,
  parameters: [],
  system: [],
  messages: [
    {
      id: 'msg_0000000000000000000001',
      role: 'user',
      blocks: [
        { kind: 'text', id: 'body', visibility: { toHuman: true, toModel: true }, text: SECRET },
      ],
    },
  ],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'test.invalid/test', accepts: ['test.invalid/test'], foreignThinking: 'omit' },
  ],
  representation: ADOPTION,
  parameterAdoptions: [],
  source: ADOPTION,
})
if (!('ok' in judged)) throw new Error('fixture request')
const REQUEST = judged.ok
const INPUT: Parameters<ModelRequestPreparation<unknown>['prepare']>[0] = {
  principal: { secret: SECRET },
  tenant: TENANT,
  profile: PROFILE,
  required: {
    modalities: ['text'],
    source: { owner: 'test', record: 'r', revision: '1', digest: '0'.repeat(64) },
  },
  assembled: REQUEST,
}

function recorder() {
  const events: ModelMeasurementEvent[] = []
  let reading: MonotonicReading = {
    process: 'test-process',
    clock: 'test-monotonic',
    generation: 'g1',
    atMs: 10,
  }
  const measurement: MeasurementContext = {
    runId: 'e9-test',
    round: 11,
    logCount: 27,
    clock: { read: () => ({ ...reading }) },
    emit: event => {
      events.push(event)
    },
  }
  return {
    events,
    measurement,
    set: (next: Partial<MonotonicReading>) => {
      reading = { ...reading, ...next }
    },
  }
}

async function realPreparation(hooks: { plan?: () => void; release?: () => Promise<void> } = {}) {
  const commands = createMemoryModelCommands({
    owners: [],
    evidence: [],
    authority: {
      authorize: () => ({ failure: { kind: 'denied', action: 'test' } }),
      execution: () => ({ failure: { kind: 'denied', action: 'test' } }),
    },
    clock: { now: () => '2026-11-02T00:00:00Z' },
    limits: {
      scanPageCalls: 10,
      resultPageParts: 1,
      resultPageTargetBytes: 1024,
      readIdleMs: 1000,
      capacity: { bytes: '1000000', blocks: '1000', attachmentBytes: '1000000' },
    },
  }).commands
  class Commands extends Service {
    static readonly provide = 'modelCommands'
    constructor(ctx: Context) {
      super(ctx, 'modelCommands')
      Object.assign(this, commands)
    }
  }
  const basis = {
    supplier,
    meter: ADOPTION,
    tokenization: { kind: 'not-used' as const, method: ADOPTION },
    prompt: { kind: 'provider-private' as const, estimation: ADOPTION },
    projection: ADOPTION,
    mediaTransform: ADOPTION,
    replay: ADOPTION,
    evidence: ADOPTION,
  }
  const binding: PreparationBinding = {
    supplier,
    rules: {
      plan: () => {
        hooks.plan?.()
        return {
          ok: {
            parameters: [],
            representation: {
              kind: 'materialized',
              adoption: ADOPTION,
              tokenInput: { kind: 'null' },
              media: [],
              requestBytes: '0',
            },
          },
        }
      },
    },
    meter: {
      basis,
      measure: () => ({ failure: { kind: 'unavailable', dependency: 'test-meter' } }),
      measureCalibrated: () => ({ failure: { kind: 'unavailable', dependency: 'test-meter' } }),
    },
    release: hooks.release ?? (async () => {}),
  }
  const { plugin } = createModelRequestPreparationPlugin({
    bindings: { acquire: async () => ({ ok: binding }) },
    supplierOf: () => ({ ok: supplier }),
  })
  const ctx = new Context()
  const commandsFiber = await ctx.plugin(Commands)
  const preparationFiber = await ctx.plugin(plugin, { maxCitedCalls: 4 })
  return {
    preparation: ctx.modelRequestPreparation,
    close: async () => {
      await preparationFiber.dispose()
      await commandsFiber.dispose()
    },
  }
}

it('measures the real prepare through request formation and awaited lease release without content', async () => {
  const recorded = recorder()
  const releaseEntered = Promise.withResolvers<void>()
  const finishRelease = Promise.withResolvers<void>()
  const real = await realPreparation({
    plan: () => recorded.set({ atMs: 18 }),
    release: async () => {
      releaseEntered.resolve()
      await finishRelease.promise
      recorded.set({ atMs: 26 })
    },
  })
  try {
    const pending = measureModelPreparation({
      preparation: real.preparation,
      input: INPUT,
      measurement: recorded.measurement,
    })
    await releaseEntered.promise
    expect(recorded.events).toEqual([])
    finishRelease.resolve()
    expect(await pending).toEqual({ ok: REQUEST })
    expect(recorded.events).toEqual([
      expect.objectContaining({
        eventKind: 'stage-interval',
        stage: 'model-request-preparation',
        outcome: 'completed',
        runId: 'e9-test',
        round: 11,
        start: { process: 'test-process', clock: 'test-monotonic', generation: 'g1', atMs: 10 },
        end: { process: 'test-process', clock: 'test-monotonic', generation: 'g1', atMs: 26 },
        elapsedMs: { state: 'measured', value: 16 },
        logCount: { state: 'measured', value: 27 },
      }),
    ])
    expect(JSON.stringify(recorded.events)).not.toContain(SECRET)
  } finally {
    finishRelease.resolve()
    await real.close()
  }
})

it('closes real preparation failures and thrown defects without copying diagnostics', async () => {
  const recorded = recorder()
  const real = await realPreparation({
    plan: () => {
      recorded.set({ atMs: 17 })
      throw new Error(SECRET)
    },
  })
  try {
    await expect(
      measureModelPreparation({
        preparation: real.preparation,
        input: INPUT,
        measurement: recorded.measurement,
      }),
    ).rejects.toThrow(SECRET)
    expect(recorded.events).toMatchObject([{ outcome: 'failed', end: { atMs: 17 } }])
    await measureModelPreparation({
      preparation: real.preparation,
      input: { ...INPUT, profile: { ...PROFILE, availability: 'withdrawn' } },
      measurement: recorded.measurement,
    })
    expect(recorded.events).toHaveLength(2)
    expect(recorded.events[1]).toMatchObject({ outcome: 'failed' })
    expect(JSON.stringify(recorded.events)).not.toContain(SECRET)
  } finally {
    await real.close()
  }
})

it.each(['process', 'clock', 'generation'] as const)(
  'preserves raw %s mismatch and missing counts as unmeasured',
  async field => {
    const recorded = recorder()
    const real = await realPreparation({
      plan: () => recorded.set({ [field]: 'different', atMs: 19 }),
    })
    try {
      await measureModelPreparation({
        preparation: real.preparation,
        input: INPUT,
        measurement: { ...recorded.measurement, logCount: undefined },
      })
      expect(recorded.events).toMatchObject([
        {
          start: {
            [field]:
              field === 'process' ? 'test-process' : field === 'clock' ? 'test-monotonic' : 'g1',
          },
          end: { [field]: 'different', atMs: 19 },
          elapsedMs: { state: 'unmeasured', reason: 'clock-mismatch' },
          logCount: { state: 'unmeasured', reason: 'not-provided' },
        },
      ])
    } finally {
      await real.close()
    }
  },
)

it('copies only clock coordinates, including when the clock carries private metadata', async () => {
  const recorded = recorder()
  const real = await realPreparation()
  const sample = { process: 'p', clock: 'c', generation: 'g', atMs: 10, privateMetadata: SECRET }
  try {
    await measureModelPreparation({
      preparation: real.preparation,
      input: INPUT,
      measurement: { ...recorded.measurement, clock: { read: () => sample } },
    })
    expect(recorded.events[0]?.start).toEqual({
      process: 'p',
      clock: 'c',
      generation: 'g',
      atMs: 10,
    })
    expect(JSON.stringify(recorded.events)).not.toContain(SECRET)
  } finally {
    await real.close()
  }
})

it.each([Number.NaN, -1, 9])(
  'retains invalid timing %s without fabricating a zero duration',
  async atMs => {
    const recorded = recorder()
    const real = await realPreparation({ plan: () => recorded.set({ atMs }) })
    try {
      await measureModelPreparation({
        preparation: real.preparation,
        input: INPUT,
        measurement: { ...recorded.measurement, logCount: -1 },
      })
      expect(recorded.events[0]).toMatchObject({
        elapsedMs: { state: 'unmeasured', reason: 'invalid-time' },
        logCount: { state: 'unmeasured', reason: 'invalid-count' },
      })
    } finally {
      await real.close()
    }
  },
)

function demand(): SendDemand<unknown> {
  const call = decodeModelCallId('mcall_measurement')
  const instance = decodeModelInstanceId('minst_measurement')
  const dispatch = decodeDispatchId('mdisp_measurement')
  if (!('ok' in call) || !('ok' in instance) || !('ok' in dispatch)) throw new Error('fixture ids')
  return {
    principal: { secret: SECRET },
    tenant: TENANT,
    call: call.ok,
    dispatch: dispatch.ok,
    execution: { tenant: TENANT, call: call.ok, instance: instance.ok, generation: '1' },
    request: REQUEST,
    supplier,
    consumer: { owner: 'test', work: 'w', position: 'p', purpose: 'measurement' },
    initiator: { owner: 'test', subject: SECRET, revision: '1' },
  }
}

it('records actual stub wait independently of its defined delay and streams one terminal fact', async () => {
  const recorded = recorder()
  const model = createMeasuredFixedDelayModel({
    definedDelayMs: 100,
    measurement: recorded.measurement,
    wait: async () => {
      recorded.set({ atMs: 147 })
    },
  })
  const result = await model.send(demand(), new AbortController().signal)
  expect(result.kind).toBe('started')
  if (result.kind !== 'started') throw new Error('fixture send')
  const facts = []
  for await (const fact of result.facts) facts.push(fact)
  expect(facts).toEqual([{ kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }])
  expect(recorded.events).toMatchObject([
    {
      eventKind: 'external-wait-interval',
      provider: 'measured-fixed-delay-model',
      definedDelay: { value: 100, unit: 'ms' },
      actualStart: { atMs: 10 },
      actualEnd: { atMs: 147 },
      elapsedMs: { state: 'measured', value: 137 },
    },
  ])
  expect(JSON.stringify(recorded.events)).not.toContain(SECRET)
})

it('closes cancelled and exceptional waits and gives overlapping calls distinct invocation identities', async () => {
  const recorded = recorder()
  const cancelled = new AbortController()
  const model = createMeasuredFixedDelayModel({
    definedDelayMs: 50,
    measurement: recorded.measurement,
    wait: async () => {
      recorded.set({ atMs: 13 })
      cancelled.abort(SECRET)
      throw new Error(SECRET)
    },
  })
  expect(await model.send(demand(), cancelled.signal)).toMatchObject({ kind: 'not-started' })
  const broken = createMeasuredFixedDelayModel({
    definedDelayMs: 50,
    measurement: recorded.measurement,
    wait: async () => {
      recorded.set({ atMs: 16 })
      throw new Error(SECRET)
    },
  })
  await expect(broken.send(demand(), new AbortController().signal)).rejects.toThrow(SECRET)
  expect(recorded.events).toMatchObject([
    { outcome: 'cancelled', actualEnd: { atMs: 13 } },
    { outcome: 'failed', actualEnd: { atMs: 16 } },
  ])
  const concurrent = createMeasuredFixedDelayModel({
    definedDelayMs: 0,
    measurement: recorded.measurement,
    wait: async () => {},
  })
  await Promise.all([
    concurrent.send(demand(), new AbortController().signal),
    concurrent.send(demand(), new AbortController().signal),
  ])
  const ids = recorded.events
    .filter(event => event.eventKind === 'external-wait-interval')
    .map(event => event.invocationId)
  expect(new Set(ids).size).toBe(4)
  expect(JSON.stringify(recorded.events)).not.toContain(SECRET)
})

it('keeps invocation correlation when a caller advances the round before the wait ends', async () => {
  const recorded = recorder()
  const frame = { ...recorded.measurement }
  const waiting = Promise.withResolvers<void>()
  const model = createMeasuredFixedDelayModel({
    definedDelayMs: 50,
    measurement: () => frame,
    wait: () => waiting.promise,
  })
  const pending = model.send(demand(), new AbortController().signal)
  frame.round = 12
  frame.logCount = 28
  waiting.resolve()
  await pending
  expect(recorded.events).toMatchObject([{ round: 11, logCount: { state: 'measured', value: 27 } }])
})

// Uses a real timer and the real preparation plugin to produce raw interval evidence.
it(
  'uses the real monotonic clock and abortable timer without a wait injection',
  { tags: ['slow'] },
  async () => {
    const recorded = recorder()
    const measurement = { ...recorded.measurement, clock: undefined, logCount: undefined }
    const real = await realPreparation()
    try {
      expect(
        await measureModelPreparation({ preparation: real.preparation, input: INPUT, measurement }),
      ).toEqual({ ok: REQUEST })
    } finally {
      await real.close()
    }
    const model = createMeasuredFixedDelayModel({
      definedDelayMs: 1,
      measurement,
    })
    await model.send(demand(), new AbortController().signal)
    const event = recorded.events[1]
    expect(event?.elapsedMs.state).toBe('measured')
    if (event?.elapsedMs.state !== 'measured') throw new Error('expected real measurement')
    expect(event.elapsedMs.value).toBeGreaterThan(0)
    expect(event.start.process).toBe(String(process.pid))
    expect(event.end.clock).toBe(event.start.clock)
    expect(event.end.generation).toBe(event.start.generation)
    const cancelled = new AbortController()
    const pending = createMeasuredFixedDelayModel({
      definedDelayMs: 60_000,
      measurement,
    }).send(demand(), cancelled.signal)
    cancelled.abort(SECRET)
    expect(await pending).toMatchObject({ kind: 'not-started' })
    expect(recorded.events[2]).toMatchObject({ outcome: 'cancelled' })
    expect(recorded.events).toHaveLength(3)
    const raw = recorded.events.map(event => JSON.stringify(event)).join('\n') + '\n'
    expect(raw).not.toContain(SECRET)
    const evidence = process.env['OMNE_E9_EVIDENCE_OUT']
    if (evidence !== undefined) appendFileSync(evidence, raw, 'utf8')
  },
)
import { appendFileSync } from 'node:fs'
