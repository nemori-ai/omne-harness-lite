// The construction and the close of the local Model assembly. The whole send path runs in the slow
// layer (local-model.spec.ts); here only what the assembly decides before any send, and how its
// close ends the preparation resources. The preparation tests use the real families: a lease
// needs no network.
import { describe, expect, it } from 'vitest'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import type { ModelPreparationLease, ModelProfile } from '@omne-harness/model-contract'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import {
  assembleLocalModel,
  type LocalModelConfig,
  type PiSendResources,
} from '@omne-harness/model-host-local'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { decoded, FAMILIES } from './support/local-host.ts'
import { factorySupplier, officialProfile } from './support/profiles.ts'
import { readRecordFixture } from './support/records.ts'
import { assembleOver, type AssemblyFactories } from '../src/assembly.ts'

type Principal = Readonly<{ subject: string }>

const MODEL = 'openai/gpt-6-sol'
const ACCESS = (() => {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  return { principal: { subject: 'tests' }, tenant: tenant(organization.value, account.value) }
})()

function openAiProfile(): ModelProfile {
  return officialProfile({
    family: 'pi-ai-openai',
    model: MODEL,
    retryPolicy: { owner: 'tests', name: 'retry', revision: '1', digest: '0'.repeat(64) },
  })
}

/** Plans the recorded request of MODEL with the lease's rules and measures it with its meter. */
function measureOn(lease: ModelPreparationLease, profile: ModelProfile) {
  const record = OPENAI_RECORDS.find(item => item.name === MODEL)
  if (record === undefined) throw new Error(`no record ${MODEL}`)
  const { request } = readRecordFixture('pi-ai-openai', record)
  const assembled = {
    system: request.system,
    messages: request.messages,
    tools: request.tools,
    toolChoice: request.toolChoice,
    parameters: request.parameters,
    representation: request.representation,
    source: request.source,
  }
  const [binding] = lease.bindings
  const planned = decoded(binding.rules.plan({ profile, supplier: binding.supplier, assembled }))
  return binding.meter.measure({
    profile: profile.adoption,
    supplier: profile.definition.suppliers[0],
    context: profile.definition.context,
    limits: profile.definition.limits,
    assembled,
    parameters: planned.parameters,
    representation: planned.representation,
  })
}

function config(overrides: Partial<LocalModelConfig<Principal>> = {}): LocalModelConfig<Principal> {
  const memory = createTestModelDependencies<Principal>({
    start: '2026-10-23T00:00:00.000Z',
    maxWaiters: 1,
    maxQueued: 1,
    sends: [],
    owners: [],
    authority: {
      authorize: ({ action }) => ({ failure: { kind: 'denied', action } }),
      execution: () => ({ failure: { kind: 'denied', action: 'execution-channel' } }),
    },
    evidence: [],
    limits: {
      scanPageCalls: 1,
      resultPageParts: 1,
      resultPageTargetBytes: 1024,
      readIdleMs: 1000,
      capacity: { bytes: '1', blocks: '1', attachmentBytes: '0' },
    },
  })
  return {
    credentials: {
      present: () => ({ kind: 'unavailable' }),
      resolve: () => ({ kind: 'unavailable' }),
    },
    commands: memory.dependencies.commands,
    coordinator: memory.controls.send.coordinator,
    families: composeFamilies([]),
    network: { maxConnections: 1, idleConnectionTimeoutMs: 1_000 },
    routes: {
      openrouter: { url: 'https://gateway.invalid/api/v1/chat/completions', endMarker: '[DONE]' },
    },
    transportLimits: {
      connectTimeoutMs: null,
      maxErrorBodyBytes: 1_024,
      maxEventBytes: 1_024,
      json: {
        maxBytes: 1_024,
        maxDepth: 8,
        maxItems: 8,
        maxMembers: 8,
        maxStringLength: 1_024,
        maxNumberLength: 8,
      },
    },
    maxRetainedAttempts: 1,
    preparation: { maxCitedCalls: 4, supplierOf: factorySupplier() },
    ...overrides,
  }
}

describe('assembleLocalModel', () => {
  it('refuses a route that is not a plain https URL when it is built', () => {
    expect(() =>
      assembleLocalModel(
        config({ routes: { openrouter: { url: 'http://gateway.invalid/', endMarker: null } } }),
      ),
    ).toThrow(RangeError)
  })

  it('refuses a limit that the send boundary refuses when it is built', () => {
    expect(() => assembleLocalModel(config({ maxRetainedAttempts: 0 }))).toThrow(RangeError)
  })

  it('refuses a network configuration that the network refuses when it is built', () => {
    expect(() =>
      assembleLocalModel(
        config({ network: { maxConnections: 0, idleConnectionTimeoutMs: 1_000 } }),
      ),
    ).toThrow(RangeError)
  })

  it('refuses a preparation limit that the preparation resources refuse when it is built', () => {
    expect(() =>
      assembleLocalModel(
        config({ preparation: { maxCitedCalls: 0, supplierOf: factorySupplier() } }),
      ),
    ).toThrow(RangeError)
    // A missing or null preparation is refused by name, before anything reads its members.
    for (const preparation of [Reflect.get({}, 'preparation'), JSON.parse('null')]) {
      const assemble = () => assembleLocalModel(config({ preparation }))
      expect(assemble).toThrow(RangeError)
      expect(assemble).toThrow(/preparation/u)
    }
  })

  it('takes the bindings of a preparation lease from the configured families', async () => {
    const asked: string[] = []
    const local = assembleLocalModel(
      config({
        preparation: {
          maxCitedCalls: 4,
          supplierOf: input => (asked.push(input.supplier.model), factorySupplier()(input)),
        },
      }),
    )
    const profile = openAiProfile()
    // The configured families hold no family, so the family table answers for the adoption.
    expect(await local.preparation.acquire({ ...ACCESS, profile })).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: profile.definition.suppliers[0].adoption.owner,
        diagnostic: 'adoption-not-installed',
      },
    })
    expect(asked).toEqual([MODEL])
    await local.close()
  })

  it('refuses a preparation lease after close starts, with the name of the assembly', async () => {
    const asked: string[] = []
    const local = assembleLocalModel(
      config({
        families: FAMILIES,
        preparation: {
          maxCitedCalls: 4,
          supplierOf: input => (asked.push(input.supplier.model), factorySupplier()(input)),
        },
      }),
    )
    const closed = local.close()
    const refused = await local.preparation.acquire({ ...ACCESS, profile: openAiProfile() })
    expect(refused).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-host-local',
        diagnostic: 'assembly-closed',
      },
    })
    expect(asked).toEqual([])
    await closed
    expect(await local.preparation.acquire({ ...ACCESS, profile: openAiProfile() })).toEqual(
      refused,
    )
  })

  it('leaves a lease acquired before close usable: it still meters and releases', async () => {
    const local = assembleLocalModel(config({ families: FAMILIES }))
    const profile = openAiProfile()
    const lease = decoded(await local.preparation.acquire({ ...ACCESS, profile }))
    const before = measureOn(lease, profile)
    expect('ok' in before).toBe(true)
    await local.close()
    expect(measureOn(lease, profile)).toEqual(before)
    expect(await lease.release()).toEqual({})
  })

  it('closes once, however often close is called', async () => {
    const local = assembleLocalModel(config())
    const first = local.close()
    expect(local.close()).toBe(first)
    await expect(first).resolves.toBeUndefined()
  })
})

/** A network and send resources that only record their closes, and fail them on request. */
function observedFactories(
  failures: Readonly<{ network?: Error; resources?: Error; build?: Error }> = {},
) {
  const events: string[] = []
  type Network = Readonly<{ close(): Promise<void> }>
  const factories: AssemblyFactories<Principal, Network> = {
    createNetwork() {
      events.push('network')
      return {
        async close() {
          events.push('network-close')
          if (failures.network !== undefined) throw failures.network
        },
      }
    },
    createSendResources(): PiSendResources<Principal> {
      events.push('resources')
      if (failures.build !== undefined) throw failures.build
      return {
        acquire: async () => ({
          failure: { kind: 'unavailable', dependency: 'tests', diagnostic: 'not-used' },
        }),
        async close() {
          events.push('resources-close')
          if (failures.resources !== undefined) throw failures.resources
        },
      }
    },
  }
  return { events, factories }
}

/** The unhandled rejections while `body` runs and a few turns of the loop after it. */
async function unhandledDuring(body: () => void): Promise<readonly unknown[]> {
  const seen: unknown[] = []
  const listener = (reason: unknown) => seen.push(reason)
  process.on('unhandledRejection', listener)
  try {
    body()
    for (let turn = 0; turn < 5; turn += 1) await new Promise(resolve => setImmediate(resolve))
  } finally {
    process.off('unhandledRejection', listener)
  }
  return seen
}

describe('the resources of the assembly', () => {
  it('creates no network when the preparation configuration is refused', () => {
    const { events, factories } = observedFactories()
    expect(() =>
      assembleOver({
        config: config({ preparation: { maxCitedCalls: 0, supplierOf: factorySupplier() } }),
        factories,
      }),
    ).toThrow(RangeError)
    expect(events).toEqual([])
  })

  it('closes the network of a refused assembly and keeps a failed close out of the unhandled rejections', async () => {
    const refused = new RangeError('route refused')
    const { events, factories } = observedFactories({
      build: refused,
      network: new Error('network close failed'),
    })
    const unhandled = await unhandledDuring(() => {
      expect(() => assembleOver({ config: config(), factories })).toThrow(refused)
    })
    expect(events).toEqual(['network', 'resources', 'network-close'])
    expect(unhandled).toEqual([])
  })

  it('closes the built send resources and then the network when the send boundary refuses the configuration', async () => {
    const { events, factories } = observedFactories()
    expect(() => assembleOver({ config: config({ maxRetainedAttempts: 0 }), factories })).toThrow(
      RangeError,
    )
    for (let turn = 0; turn < 5; turn += 1) await new Promise(resolve => setImmediate(resolve))
    expect(events).toEqual(['network', 'resources', 'resources-close', 'network-close'])
  })

  it('runs both closes to the end and throws both failures as one AggregateError', async () => {
    const released = new Error('send resources close failed')
    const stopped = new Error('network close failed')
    const { events, factories } = observedFactories({ resources: released, network: stopped })
    const local = assembleOver({ config: config(), factories })
    const closing = local.close()
    await expect(closing).rejects.toBeInstanceOf(AggregateError)
    await closing.catch((error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError)
      expect(Reflect.get(Object(error), 'errors')).toEqual([released, stopped])
    })
    expect(events).toEqual(['network', 'resources', 'resources-close', 'network-close'])
  })

  it('closes the network after a failed release of the send resources and rejects with that failure', async () => {
    const released = new Error('send resources close failed')
    const { events, factories } = observedFactories({ resources: released })
    const local = assembleOver({ config: config(), factories })
    await expect(local.close()).rejects.toBe(released)
    expect(events).toEqual(['network', 'resources', 'resources-close', 'network-close'])
  })
})
