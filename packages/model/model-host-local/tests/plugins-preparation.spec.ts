// The request preparation plugin and its metering leases on real Cordis 4.0.4. Doubles, each with
// its source:
// - ModelCommands: `createMemoryModelCommands` of `@omne-harness/model/testing` (no durability),
//   served through a `ModelCommandsService` test class. The durable commands join with the storage
//   member; until then nothing here proves a restart.
// - The family: a stub `PreparationBindingSource` with a recording meter, the same shape as the
//   stub in `model/tests/preparation.spec.ts`. The real pi families join at the assembly.
// - The credential completion `supplierOf` is a test function (the assembly supplies the real one).
// No network and no `modelRuntime` is loaded anywhere in this file.
import { Context } from '@deepseek-ai/cordis'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  createMemoryModelCommands,
  type MemoryModelCommandsOptions,
} from '@omne-harness/model/testing'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeRevision,
  type Adoption,
  type AssembledModelInput,
  type FixedModelRequest,
  type ModelCallId,
  type ModelCountingBasis,
  type ModelProfile,
  type ModelPreparationLease,
  type RequestBudget,
} from '@omne-harness/model-contract'
import {
  judgeFixedModelRequest,
  type CalibratedInputMeter,
  type ModelCommands,
  type TransportFact,
} from '@omne-harness/model-contract/provider'
import { ModelCommandsService } from '@omne-harness/model-cordis-contract/cordis'
import type { PreparationBinding } from '@omne-harness/model'
import { expect, it } from 'vitest'
import { createModelRequestPreparationPlugin } from '../src/cordis.ts'

const ADOPTION: Adoption = { owner: 'o', name: 'n', revision: '1', digest: '0'.repeat(64) }
const EVIDENCE = { owner: 'host', record: 'r', revision: '1', digest: '1'.repeat(64) }

function unbox<T>(decoded: { ok: T } | { failure: unknown }): T {
  if ('ok' in decoded) return decoded.ok
  throw new Error(`fixture: ${JSON.stringify(decoded.failure)}`)
}

const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
if (!account.ok || !organization.ok) throw new Error('fixture identity')
const TENANT = tenant(organization.value, account.value)
const PRINCIPAL = Object.freeze({ subject: 'trusted' })
const principals = new WeakSet<object>([PRINCIPAL])
const callOf = (name: string): ModelCallId => unbox(decodeModelCallId(`mcall_${name}`))
const opOf = (name: string) => unbox(decodeModelOperationId(`mop_${name}`))

// --- fixtures: a profile, requests with messages, a stub family ------------------------------------

const SUPPLIER = {
  adoption: ADOPTION,
  recipient: 'test.invalid',
  model: 'test',
  credential: { kind: 'factory' as const },
}
const PROFILE: ModelProfile = {
  identity: { scope: { kind: 'factory' }, route: 'test' },
  adoption: ADOPTION,
  revision: unbox(decodeRevision('1')),
  updatedAt: '2026-10-23T00:00:00Z',
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
const REQUIRED = { modalities: ['text'] as ['text'], source: EVIDENCE }

const SHOWN = { toHuman: true, toModel: true }
const user = (id: string, text = 'hello') => ({
  id: `msg_${id.padEnd(22, '0')}`,
  role: 'user',
  blocks: [{ kind: 'text', id: `b-${id}`, visibility: SHOWN, text }],
})
function requestWith(messages: readonly unknown[]): FixedModelRequest {
  const judged = judgeFixedModelRequest({
    profile: ADOPTION,
    suppliers: [SUPPLIER],
    fallback: false,
    retryPolicy: ADOPTION,
    parameters: [],
    system: [],
    messages,
    tools: [],
    toolChoice: 'none',
    declarations: [
      { produces: 'test.invalid/test', accepts: ['test.invalid/test'], foreignThinking: 'omit' },
    ],
    representation: ADOPTION,
    parameterAdoptions: [],
    source: ADOPTION,
  })
  return unbox(judged as { ok: FixedModelRequest } | { failure: unknown })
}
function assembledOf(fixed: FixedModelRequest): AssembledModelInput {
  return {
    system: fixed.system,
    messages: fixed.messages,
    tools: fixed.tools,
    toolChoice: fixed.toolChoice,
    parameters: fixed.parameters,
    representation: fixed.representation,
    source: fixed.source,
  }
}
const TWO = [user('u1'), user('u2')]
const THREE = [...TWO, user('u3')]

const BASIS: ModelCountingBasis = {
  supplier: SUPPLIER,
  meter: ADOPTION,
  tokenization: { kind: 'not-used', method: ADOPTION },
  prompt: { kind: 'provider-private', estimation: ADOPTION },
  projection: ADOPTION,
  mediaTransform: ADOPTION,
  replay: ADOPTION,
  evidence: ADOPTION,
}

function stubFamily() {
  const released = { count: 0 }
  // What the test switches on: a release that rejects, and a planning rule that throws.
  const faults = { releaseRejects: false, planThrows: false }
  const meter: CalibratedInputMeter = {
    basis: BASIS,
    measure: input => meter.measureCalibrated(input, { anchor: null, outputs: [] }),
    measureCalibrated: (_input, calibration) => {
      const budget: RequestBudget = {
        kind: 'complete',
        inputDigest: 'stub',
        checks: [],
        counting: [BASIS],
        ...(calibration.anchor === null ? {} : { calibration: { anchor: { kind: 'hit' } } }),
      }
      return { ok: budget }
    },
  }
  return {
    released,
    faults,
    bindings: {
      async acquire(supplier: PreparationBinding['supplier']) {
        const binding: PreparationBinding = {
          supplier,
          rules: {
            plan: ({ assembled }) => {
              if (faults.planThrows) throw new Error('rule defect')
              return {
                ok: {
                  parameters: [],
                  representation: {
                    kind: 'materialized',
                    adoption: ADOPTION,
                    tokenInput: { kind: 'null' },
                    media: [],
                    requestBytes: '0',
                    units: assembled.messages.map(message => message.id),
                  },
                },
              }
            },
          },
          meter,
          release: async () => {
            released.count += 1
            if (faults.releaseRejects) throw new Error('resource still held')
          },
        }
        return { ok: binding }
      },
    },
  }
}

const supplierOf = ({
  supplier,
}: {
  supplier: { adoption: Adoption; recipient: string; model: string }
}) => ({
  ok: {
    adoption: supplier.adoption,
    recipient: supplier.recipient,
    model: supplier.model,
    credential: { kind: 'factory' as const },
  },
})

// --- the memory commands and a settled call ------------------------------------------------------

function memoryCommands(): ModelCommands<unknown> {
  const options: MemoryModelCommandsOptions<unknown> = {
    owners: [{ consumerOwner: 'consumer', work: { kind: 'exempt' }, evidence: ADOPTION }],
    authority: {
      authorize: ({ access, action }) =>
        typeof access.principal === 'object' &&
        access.principal !== null &&
        principals.has(access.principal)
          ? { ok: { owner: 'identity', subject: 'trusted', revision: '1' } }
          : { failure: { kind: 'denied', action } },
      execution: () => ({ ok: { owner: 'host', subject: 'channel', revision: '1' } }),
    },
    evidence: [
      {
        adoption: ADOPTION,
        continuity: input =>
          input.source.owner === 'host' && input.source.record === input.call
            ? { ok: structuredClone(input.source) }
            : { failure: { kind: 'invalid', field: 'continuity', reason: 'untrusted' } },
        materialization: input => ({
          ok: { ...EVIDENCE, owner: 'materializer', record: `${input.call}/${input.dispatch}` },
        }),
        lateFact: input => ({ ok: input.source }),
        retry: input => ({ ok: input.source }),
        handoff: () => ({ ok: EVIDENCE }),
        receive: () => ({ failure: { kind: 'denied', action: 'receive' } }),
      },
    ],
    clock: { now: () => '2026-11-02T00:00:00.000Z' },
    limits: {
      scanPageCalls: 10,
      resultPageParts: 1,
      resultPageTargetBytes: 1024,
      readIdleMs: 1000,
      capacity: { bytes: '1000000', blocks: '1000', attachmentBytes: '1000000' },
    },
  }
  return createMemoryModelCommands(options).commands
}

function counted(name: string, lexeme: string) {
  return { name, state: 'known' as const, lexeme, unit: 'token' as const }
}
const ACCOUNT_FACT: TransportFact = {
  kind: 'account',
  event: 'usage',
  value: {
    usage: [
      counted('input', '100'),
      counted('output', '18'),
      counted('cache-read', '20'),
      counted('cache-write', '3'),
      counted('reasoning', '11'),
    ],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'test',
    duration: { state: 'unknown' },
    revision: '1',
  },
}

/** Settles call `call` with an account of 123 real input tokens, through the commands alone. */
async function settleCall(
  commands: ModelCommands<unknown>,
  call: ModelCallId,
  request: FixedModelRequest,
) {
  const access = { principal: PRINCIPAL, tenant: TENANT, call }
  unbox(
    await commands.admit({
      ...access,
      operation: opOf(`admit-${call}`),
      request,
      consumer: { owner: 'consumer', work: 'work', position: 'position', purpose: 'test' },
      capacity: { bytes: '100000', blocks: '100', attachmentBytes: '100000' },
    }),
  )
  const execution = unbox(
    await commands.claim({
      ...access,
      operation: opOf(`claim-${call}`),
      instance: unbox(decodeModelInstanceId('minst_one')),
      continuity: { ...EVIDENCE, record: call },
    }),
  )
  let serial = 0
  const write = async () => ({
    ...execution,
    operation: opOf(`write-${call}-${++serial}`),
    expected: unbox(await commands.loadRecovery(access)).state.revision,
  })
  const dispatch = unbox(decodeDispatchId(`mdisp_${call.slice('mcall_'.length)}`))
  unbox(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: request.suppliers[0],
      policyDecision: null,
    }),
  )
  unbox(
    await commands.recordMaterialization({
      ...(await write()),
      dispatch,
      receipt: {
        supplier: ADOPTION,
        representation: request.representation,
        payloadDigest: 'a'.repeat(64),
      },
    }),
  )
  unbox(await commands.recordSend({ ...(await write()), dispatch, state: 'started' }))
  unbox(await commands.openReceiveWindow({ ...(await write()), dispatch, window: 'w' }))
  // A sealed block of the contract's own shape: the first block of a judged request message.
  const sealed = requestWith([user('reply', 'answer')]).messages[0]?.blocks[0]
  if (sealed?.kind !== 'text') throw new Error('fixture block')
  const facts: TransportFact[] = [
    { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
    { kind: 'block-delta', index: '0', delta: 'answer' },
    { kind: 'block-seal', index: '0', block: sealed },
    ACCOUNT_FACT,
    { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
  ]
  unbox(await commands.preserve({ ...(await write()), dispatch, window: 'w', facts }))
  unbox(
    await commands.settle({
      ...(await write()),
      termination: { kind: 'completed', reason: 'stop' },
    }),
  )
}

// --- the Cordis side ----------------------------------------------------------------------------

function commandsServiceOver(commands: ModelCommands<unknown>) {
  return class extends ModelCommandsService<unknown> {
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
}

const CONFIG = { maxCitedCalls: 4 }

async function loaded(commands: ModelCommands<unknown> = memoryCommands()) {
  const family = stubFamily()
  const { plugin, resources } = createModelRequestPreparationPlugin({
    bindings: family.bindings,
    supplierOf,
  })
  const ctx = new Context()
  const commandsFiber = await ctx.plugin(commandsServiceOver(commands))
  const fiber = await ctx.plugin(plugin, CONFIG)
  return { ctx, fiber, commandsFiber, plugin, resources, family, commands }
}

const access = { principal: PRINCIPAL, tenant: TENANT }

function measure(lease: ModelPreparationLease, request: FixedModelRequest) {
  const [binding] = lease.bindings
  const assembled = assembledOf(request)
  const planned = binding.rules.plan({ profile: PROFILE, supplier: binding.supplier, assembled })
  if (!('ok' in planned)) throw new Error('plan')
  return binding.meter.measure({
    profile: ADOPTION,
    supplier: PROFILE.definition.suppliers[0],
    context: PROFILE.definition.context,
    limits: [],
    assembled,
    parameters: planned.ok.parameters,
    representation: planned.ok.representation,
  })
}

function anchorOf(measured: ReturnType<typeof measure>) {
  if (!('ok' in measured)) throw new Error('measure')
  return measured.ok.calibration?.anchor
}

// --- C4: the service, with no runtime and no network ---------------------------------------------

it('serves modelRequestPreparation with no runtime and no network, and forms the request from the assembled input', async () => {
  const { ctx } = await loaded()
  expect(ctx.modelRuntime).toBeUndefined()
  const fixed = requestWith(TWO)

  const prepared = await ctx.modelRequestPreparation.prepare({
    ...access,
    profile: PROFILE,
    required: REQUIRED,
    assembled: assembledOf(fixed),
  })
  expect(prepared).toEqual({ ok: fixed })
})

it('refuses a profile that cannot serve the input before it takes a lease', async () => {
  const { ctx, family } = await loaded()
  const base = { ...access, required: REQUIRED, assembled: assembledOf(requestWith(TWO)) }
  const withdrawn = { ...PROFILE, availability: 'withdrawn' as const }
  expect(await ctx.modelRequestPreparation.prepare({ ...base, profile: withdrawn })).toEqual({
    failure: { kind: 'invalid', field: 'profile', reason: 'withdrawn' },
  })
  const foreign = {
    ...PROFILE,
    identity: { scope: { kind: 'tenant' as const, tenant: { ...TENANT } }, route: 'x' },
  }
  expect(await ctx.modelRequestPreparation.prepare({ ...base, profile: foreign })).toMatchObject({
    failure: { kind: 'denied' },
  })
  expect(
    await ctx.modelRequestPreparation.prepare({
      ...base,
      profile: PROFILE,
      required: { ...REQUIRED, modalities: ['image'] },
    }),
  ).toMatchObject({ failure: { kind: 'invalid', field: 'required.modalities' } })
  expect(family.released.count).toBe(0)
})

it('gives back the lease that prepare took, so no binding stays open after a prepare', async () => {
  const { ctx, family } = await loaded()
  await ctx.modelRequestPreparation.prepare({
    ...access,
    profile: PROFILE,
    required: REQUIRED,
    assembled: assembledOf(requestWith(TWO)),
  })
  expect(family.released.count).toBe(1)
})

it('leaves an admitted call queryable when the plugin is unloaded, and prepare answers unavailable through an old reference', async () => {
  const commands = memoryCommands()
  const { ctx, fiber } = await loaded(commands)
  const call = callOf('x')
  await settleCall(commands, call, requestWith(TWO))
  const old = ctx.modelRequestPreparation

  await fiber.dispose()
  expect(ctx.modelRequestPreparation).toBeUndefined()
  const lookup = await commands.dispatches({ ...access, call })
  expect('ok' in lookup && lookup.ok.length).toBe(1)
  expect(
    await old.prepare({
      ...access,
      profile: PROFILE,
      required: REQUIRED,
      assembled: assembledOf(requestWith(TWO)),
    }),
  ).toMatchObject({ failure: { kind: 'unavailable', diagnostic: 'preparation-plugin-unloaded' } })
})

it('rejects a missing or out-of-range maxCitedCalls and loads nothing', async () => {
  for (const config of [undefined, { maxCitedCalls: 0 }, { maxCitedCalls: 1.5 }, {}]) {
    const family = stubFamily()
    const { plugin } = createModelRequestPreparationPlugin({
      bindings: family.bindings,
      supplierOf,
    })
    const ctx = new Context()
    await ctx.plugin(commandsServiceOver(memoryCommands()))
    // The values are wrong on purpose: the cast only lets them through the type of the class.
    const fiber = ctx.plugin(plugin, config as typeof CONFIG)
    await expect(Promise.resolve(fiber).then(() => 'loaded')).rejects.toBeInstanceOf(Error)
    expect(ctx.modelRequestPreparation).toBeUndefined()
  }
})

// --- C5: the lease and the commands it shares with the host --------------------------------------

it('a second-round lease on the same commands reads the first round, and one on other commands does not', async () => {
  const commands = memoryCommands()
  await settleCall(commands, callOf('x'), requestWith(TWO))

  const shared = await loaded(commands)
  const sharedLease = unbox(
    await shared.resources.acquire({
      ...access,
      profile: PROFILE,
      lineage: { continues: callOf('x') },
    }),
  )
  expect(anchorOf(measure(sharedLease, requestWith(THREE)))).toEqual({ kind: 'hit' })
  await sharedLease.release()

  // The same plugin over another store: the first round is not in it.
  const other = await loaded(memoryCommands())
  const otherLease = unbox(
    await other.resources.acquire({
      ...access,
      profile: PROFILE,
      lineage: { continues: callOf('x') },
    }),
  )
  expect(anchorOf(measure(otherLease, requestWith(THREE)))).toEqual({
    kind: 'miss',
    reason: 'call-unreadable',
  })
  await otherLease.release()
})

it('refuses a new lease once the plugin is unloaded, while a lease taken before keeps working until it is released', async () => {
  const commands = memoryCommands()
  await settleCall(commands, callOf('x'), requestWith(TWO))
  const { fiber, resources, family } = await loaded(commands)
  const lease = unbox(
    await resources.acquire({ ...access, profile: PROFILE, lineage: { continues: callOf('x') } }),
  )

  await fiber.dispose()
  expect(await resources.acquire({ ...access, profile: PROFILE })).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'model-request-preparation',
      diagnostic: 'preparation-plugin-unloaded',
    },
  })
  expect(anchorOf(measure(lease, requestWith(THREE)))).toEqual({ kind: 'hit' })
  expect(family.released.count).toBe(0)

  expect(await lease.release()).toEqual({})
  expect(await lease.release()).toEqual({})
  expect(family.released.count).toBe(1)
  const after = measure(lease, requestWith(THREE))
  expect(after).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'preparation-lease-released' },
  })
})

it('the leases are given again once the plugin is loaded again, over the commands of the new load', async () => {
  const { fiber, resources, ctx, plugin } = await loaded()
  await fiber.dispose()
  expect('failure' in (await resources.acquire({ ...access, profile: PROFILE }))).toBe(true)

  await ctx.plugin(plugin, CONFIG)
  const lease = await resources.acquire({ ...access, profile: PROFILE })
  expect('ok' in lease).toBe(true)
  if ('ok' in lease) await lease.ok.release()
})

// --- C6: replacement and loss of the commands ----------------------------------------------------

it('a lease taken before the commands were replaced keeps the facts it read, and a new lease reads the successor', async () => {
  const first = memoryCommands()
  await settleCall(first, callOf('x'), requestWith(TWO))
  const { ctx, resources, commandsFiber } = await loaded(first)
  const old = unbox(
    await resources.acquire({ ...access, profile: PROFILE, lineage: { continues: callOf('x') } }),
  )

  // Another store takes the place of the commands service: Cordis unloads the plugin and loads it
  // again over the successor, which does not know call x.
  await commandsFiber.dispose()
  await ctx.plugin(commandsServiceOver(memoryCommands()))
  await new Promise(resolve => setTimeout(resolve, 20))

  expect(anchorOf(measure(old, requestWith(THREE)))).toEqual({ kind: 'hit' })
  const fresh = unbox(
    await resources.acquire({ ...access, profile: PROFILE, lineage: { continues: callOf('x') } }),
  )
  expect(anchorOf(measure(fresh, requestWith(THREE)))).toEqual({
    kind: 'miss',
    reason: 'call-unreadable',
  })
  await old.release()
  await fresh.release()
})

it('with the commands lost, the preparation service is gone and the lease source refuses instead of reading nothing', async () => {
  const { ctx, resources, commandsFiber } = await loaded()
  await commandsFiber.dispose()
  await new Promise(resolve => setTimeout(resolve, 20))

  expect(ctx.modelRequestPreparation).toBeUndefined()
  expect(await resources.acquire({ ...access, profile: PROFILE })).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'preparation-plugin-unloaded' },
  })
})

// --- the lease ends with the request, and only the plugin's own resources end with it ----------------

it('fails the prepare when the lease cannot be given back: the provider still owes the resource', async () => {
  const { ctx, family } = await loaded()
  family.faults.releaseRejects = true
  const answer = await ctx.modelRequestPreparation.prepare({
    ...access,
    profile: PROFILE,
    required: REQUIRED,
    assembled: assembledOf(requestWith(TWO)),
  })
  expect(answer).toMatchObject({ failure: { kind: 'unavailable', diagnostic: 'release-failed' } })
  expect(family.released.count).toBe(1)
})

it('gives the lease back before a throwing rule surfaces, and the throw is not hidden', async () => {
  const { ctx, family } = await loaded()
  family.faults.planThrows = true
  await expect(
    ctx.modelRequestPreparation.prepare({
      ...access,
      profile: PROFILE,
      required: REQUIRED,
      assembled: assembledOf(requestWith(TWO)),
    }),
  ).rejects.toThrow('rule defect')
  expect(family.released.count).toBe(1)
})

it('keeps the leases of a successor that loaded first when the earlier load is unloaded', async () => {
  const commands = memoryCommands()
  const family = stubFamily()
  const { plugin, resources } = createModelRequestPreparationPlugin({
    bindings: family.bindings,
    supplierOf,
  })
  const earlier = new Context()
  await earlier.plugin(commandsServiceOver(commands))
  const earlierFiber = await earlier.plugin(plugin, CONFIG)
  const successor = new Context()
  await successor.plugin(commandsServiceOver(commands))
  await successor.plugin(plugin, CONFIG)

  await earlierFiber.dispose()
  const lease = await resources.acquire({ ...access, profile: PROFILE })
  expect('ok' in lease).toBe(true)
  if ('ok' in lease) await lease.ok.release()
})
