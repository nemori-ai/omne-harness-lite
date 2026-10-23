// The credential seam of the production send resources. A transport factory that observes the
// credential slot stands in for the pi transport where a send would leave the process; the
// foreign-materialization check also runs against the real pi transport, which encodes without I/O.
import { afterEach, describe, expect, it } from 'vitest'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import type { SendResources } from '@omne-harness/model'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelInstanceId,
  type FixedModelRequest,
  type MaterializedTransport,
  type SendDemand,
  type TransportFact,
  type TransportFailure,
} from '@omne-harness/model-contract'
import {
  composeFamilies,
  createNetworkResources,
  type NetworkResources,
  type PiTransport,
  type PiTransportConfig,
} from '@omne-harness/pi-ai-transport'
import { GATEWAY_END_MARKER } from '@omne-harness/pi-ai-transport/testing'
import {
  createOpenAiFamily,
  OPENAI_RECORDS,
  openAiTokenizerResources,
} from '@omne-harness/pi-ai-openai'
import { createPiSendResources, SendResourceDefect } from '@omne-harness/model-host-local'
// The observing factory reaches the module itself; its defect class is the module's own.
import { SendResourceDefect as ModuleDefect, sendResourcesOver } from '../src/send-resources.ts'
import { readRecordFixture } from './support/records.ts'

const LIMITS = {
  connectTimeoutMs: 5_000,
  maxErrorBodyBytes: 4_096,
  maxEventBytes: 1_048_576,
  json: {
    maxBytes: 1_048_576,
    maxDepth: 64,
    maxItems: 4_096,
    maxMembers: 1_024,
    maxStringLength: 1_048_576,
    maxNumberLength: 64,
  },
}
const ROUTES = {
  openrouter: { url: 'https://gateway.invalid/api/v1/chat/completions', endMarker: '[DONE]' },
}

/** One transport the observing factory made: its slot and what each start read from it. */
type Observed = {
  config: PiTransportConfig
  /** The slot value each start read, in order. */
  reads: (string | undefined)[]
  closes: number
  /** How often a prepared transport of this transport was closed. */
  preparedCloses: number
}

/** What the next transport the observing factory makes does instead of succeeding. */
type Faults = {
  /** `prepare` answers this failure. */
  prepare?: TransportFailure
  /** `materialize` answers this failure. */
  materialize?: TransportFailure
  /** `close` of the transport rejects with this reason. */
  close?: { reason: unknown }
}

/** What the next start of an observed transport does after it reads the slot. */
type StartPlan = (starting: Observed, transports: readonly Observed[]) => void

const NO_FACTS: AsyncIterable<TransportFact> = {
  [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
}

/** A transport factory whose materialized transports read the slot at start, as pi does. */
function observingFactory() {
  const transports: Observed[] = []
  let plan: StartPlan = () => {}
  /** The faults of each transport, by its position in `transports`. */
  const faults = new Map<number, Faults>()
  function createTransport(config: PiTransportConfig): PiTransport {
    const observed: Observed = { config, reads: [], closes: 0, preparedCloses: 0 }
    const fault = faults.get(transports.length) ?? {}
    transports.push(observed)
    return {
      transport: {
        async prepare(request) {
          if (fault.prepare !== undefined) return { failure: fault.prepare }
          return {
            ok: {
              async materialize() {
                if (fault.materialize !== undefined) return { failure: fault.materialize }
                const materialized: MaterializedTransport = {
                  receipt: {
                    supplier: request.suppliers[0].adoption,
                    representation: request.representation,
                    payloadDigest: 'a'.repeat(64),
                  },
                  start() {
                    observed.reads.push(config.credential.read())
                    plan(observed, transports)
                    return NO_FACTS
                  },
                  close: async () => {},
                }
                return { ok: materialized }
              },
              close: async () => {
                observed.preparedCloses++
              },
            },
          }
        },
      },
      async close() {
        observed.closes++
        if (fault.close !== undefined) throw fault.close.reason
      },
    }
  }
  return {
    transports,
    /** The transport at `position` (0 is the configuration probe) answers with these faults. */
    fail(position: number, next: Faults) {
      faults.set(position, next)
    },
    /** The transports of acquired resources, without the configuration probe. */
    acquired: () => transports.slice(1),
    onStart(next: StartPlan) {
      plan = next
    },
    createTransport,
  }
}

const REQUEST = readRecordFixture('pi-ai-openai', OPENAI_RECORDS[0]).request

type Principal = Readonly<{ subject: string }>

/** A send demand; these resources do not read it, every acquire builds a fresh transport. */
const DEMAND: SendDemand<Principal> = demandOf(REQUEST)

function demandOf(request: FixedModelRequest): SendDemand<Principal> {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  const call = decodeModelCallId('mcall_send-resources')
  const dispatch = decodeDispatchId('mdisp_send-resources')
  const instance = decodeModelInstanceId('minst_send-resources')
  if (
    !account.ok ||
    !organization.ok ||
    !('ok' in call) ||
    !('ok' in dispatch) ||
    !('ok' in instance)
  )
    throw new Error('fixture identity')
  const scope = tenant(organization.value, account.value)
  return {
    principal: { subject: 'test' },
    tenant: scope,
    call: call.ok,
    dispatch: dispatch.ok,
    execution: { tenant: scope, call: call.ok, instance: instance.ok, generation: '1' },
    request,
    supplier: request.suppliers[0],
    consumer: { owner: 'test-consumer', work: 'work', position: 'position', purpose: 'test' },
    initiator: { owner: 'test', subject: 'test', revision: '1' },
  }
}

async function materializedOf(
  resource: Awaited<ReturnType<typeof acquired>>,
): Promise<MaterializedTransport> {
  const prepared = await resource.transport.prepare(REQUEST, REQUEST.suppliers[0], { resent: [] })
  if (!('ok' in prepared)) throw new Error(`prepare: ${JSON.stringify(prepared.failure)}`)
  const materialized = await prepared.ok.materialize(new AbortController().signal)
  if (!('ok' in materialized))
    throw new Error(`materialize: ${JSON.stringify(materialized.failure)}`)
  return materialized.ok
}

async function acquired(resources: SendResources<Principal>) {
  const result = await resources.acquire(DEMAND)
  if (!('ok' in result)) throw new Error(`acquire: ${JSON.stringify(result.failure)}`)
  return result.ok
}

let network: NetworkResources | undefined
afterEach(async () => {
  await network?.close()
  network = undefined
})

function observed(faults: readonly (readonly [number, Faults])[] = []) {
  network = createNetworkResources({ maxConnections: 2, idleConnectionTimeoutMs: 1_000 })
  const factory = observingFactory()
  for (const [position, fault] of faults) factory.fail(position, fault)
  const resources = sendResourcesOver<Principal>({
    config: { network, families: composeFamilies([]), routes: ROUTES, limits: LIMITS },
    createTransport: factory.createTransport,
  })
  return { factory, resources }
}

describe('the credential slot', () => {
  it('holds the value only while start runs and is empty after it returns', async () => {
    const { factory, resources } = observed()
    const resource = await acquired(resources)
    const [transport] = factory.acquired()
    const materialized = await materializedOf(resource)
    expect(transport?.config.credential.read()).toBeUndefined()
    resource.startWithCredential(materialized, 'placeholder-a', new AbortController().signal)
    expect(transport?.reads).toEqual(['placeholder-a'])
    expect(transport?.config.credential.read()).toBeUndefined()
    await resources.close()
  })

  it('is empty after a start that throws, and the throw reaches the caller', async () => {
    const { factory, resources } = observed()
    const resource = await acquired(resources)
    const materialized = await materializedOf(resource)
    const failure = new Error('start failed')
    factory.onStart(() => {
      throw failure
    })
    expect(() =>
      resource.startWithCredential(materialized, 'placeholder-a', new AbortController().signal),
    ).toThrow(failure)
    const [transport] = factory.acquired()
    expect(transport?.reads).toEqual(['placeholder-a'])
    expect(transport?.config.credential.read()).toBeUndefined()
    await resources.close()
  })

  it('of one resource is never seen by another resource', async () => {
    const { factory, resources } = observed()
    const first = await acquired(resources)
    const second = await acquired(resources)
    const firstMaterialized = await materializedOf(first)
    const secondMaterialized = await materializedOf(second)
    const seenByOthers: (string | undefined)[][] = []
    factory.onStart((starting, transports) => {
      const others = transports.slice(1).filter(other => other !== starting)
      seenByOthers.push(others.map(other => other.config.credential.read()))
    })
    first.startWithCredential(firstMaterialized, 'placeholder-a', new AbortController().signal)
    second.startWithCredential(secondMaterialized, 'placeholder-b', new AbortController().signal)
    const [firstTransport, secondTransport] = factory.acquired()
    expect(firstTransport?.reads).toEqual(['placeholder-a'])
    expect(secondTransport?.reads).toEqual(['placeholder-b'])
    // While either start ran, the slot of the other resource was empty.
    expect(seenByOthers).toEqual([[undefined], [undefined]])
    expect(firstTransport?.config.credential).not.toBe(secondTransport?.config.credential)
    await resources.close()
  })
})

describe('the ownership of a materialized transport', () => {
  it('refuses a materialized transport of another resource and never fills either slot', async () => {
    const { factory, resources } = observed()
    const first = await acquired(resources)
    const second = await acquired(resources)
    const foreign = await materializedOf(first)
    const start = () =>
      second.startWithCredential(foreign, 'placeholder-b', new AbortController().signal)
    expect(start).toThrow(ModuleDefect)
    // The defect names its reason, and only its reason: never the credential value.
    expect(start).toThrow(
      expect.objectContaining({ name: 'SendResourceDefect', reason: 'foreign-materialization' }),
    )
    expect(start).toThrow(/foreign-materialization/u)
    expect(start).not.toThrow(/placeholder/)
    expect(factory.acquired().map(item => item.reads)).toEqual([[], []])
    await resources.close()
  })

  it('refuses a start after the release of the resource', async () => {
    const { factory, resources } = observed()
    const resource = await acquired(resources)
    const materialized = await materializedOf(resource)
    await resource.release()
    expect(() =>
      resource.startWithCredential(materialized, 'placeholder-a', new AbortController().signal),
    ).toThrow(expect.objectContaining({ reason: 'resource-released' }))
    expect(factory.acquired()[0]?.reads).toEqual([])
    await resources.close()
  })

  it('refuses a pi materialized transport of another resource of the real pi transport', async () => {
    network = createNetworkResources({ maxConnections: 2, idleConnectionTimeoutMs: 1_000 })
    const family = createOpenAiFamily({
      tokenizer: openAiTokenizerResources(),
      limits: {
        toolArguments: LIMITS.json,
        maxReasoningText: 65_536,
      },
      margin: {
        percent: '10',
        source: {
          owner: 'model-host-local-tests',
          name: 'margin',
          revision: '1',
          digest: 'a'.repeat(64),
        },
      },
    })
    const resources = createPiSendResources<Principal>({
      network,
      families: composeFamilies([family]),
      routes: { openrouter: { ...ROUTES.openrouter, endMarker: GATEWAY_END_MARKER } },
      limits: LIMITS,
    })
    const first = await acquired(resources)
    const second = await acquired(resources)
    const foreign = await materializedOf(first)
    expect(() =>
      second.startWithCredential(foreign, 'placeholder-b', new AbortController().signal),
    ).toThrow(SendResourceDefect)
    expect(() =>
      second.startWithCredential(foreign, 'placeholder-b', new AbortController().signal),
    ).toThrow(expect.objectContaining({ reason: 'foreign-materialization' }))
    await resources.close()
  })
})

describe('release and close', () => {
  it('closes the transport of a resource once, however often it is released', async () => {
    const { factory, resources } = observed()
    const resource = await acquired(resources)
    await Promise.all([resource.release(), resource.release()])
    await resource.release()
    expect(factory.acquired()[0]?.closes).toBe(1)
    await resources.close()
    expect(factory.acquired()[0]?.closes).toBe(1)
  })

  it('releases every open resource on close, then refuses new acquires', async () => {
    const { factory, resources } = observed()
    await acquired(resources)
    await acquired(resources)
    await Promise.all([resources.close(), resources.close()])
    expect(factory.transports.map(item => item.closes)).toEqual([1, 1, 1])
    expect(await resources.acquire(DEMAND)).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'pi-send-resources',
        diagnostic: 'send-resources-closed',
      },
    })
  })

  it('refuses a configuration that the transport refuses when it is built', () => {
    const shared = createNetworkResources({ maxConnections: 2, idleConnectionTimeoutMs: 1_000 })
    network = shared
    expect(() =>
      createPiSendResources({
        network: shared,
        families: composeFamilies([]),
        routes: { openrouter: { url: 'http://gateway.invalid/', endMarker: null } },
        limits: LIMITS,
      }),
    ).toThrow(RangeError)
  })
})

describe('the transport of a resource', () => {
  const failure: TransportFailure = {
    kind: 'unavailable',
    dependency: 'pi-ai-transport',
    diagnostic: 'fixture-down',
  }

  it('passes a failed prepare through unchanged', async () => {
    const { resources } = observed([[1, { prepare: failure }]])
    const resource = await acquired(resources)
    expect(await resource.transport.prepare(REQUEST, REQUEST.suppliers[0], { resent: [] })).toEqual(
      { failure },
    )
    await resources.close()
  })

  it('passes a failed materialize through unchanged', async () => {
    const { resources } = observed([[1, { materialize: failure }]])
    const resource = await acquired(resources)
    const prepared = await resource.transport.prepare(REQUEST, REQUEST.suppliers[0], {
      resent: [],
    })
    if (!('ok' in prepared)) throw new Error('fixture prepare')
    expect(await prepared.ok.materialize(new AbortController().signal)).toEqual({ failure })
    await resources.close()
  })

  it('closes the prepared transport of the pi transport when its own is closed', async () => {
    const { factory, resources } = observed()
    const resource = await acquired(resources)
    const prepared = await resource.transport.prepare(REQUEST, REQUEST.suppliers[0], {
      resent: [],
    })
    if (!('ok' in prepared)) throw new Error('fixture prepare')
    await prepared.ok.close()
    expect(factory.acquired()[0]?.preparedCloses).toBe(1)
    await resources.close()
  })
})

describe('close failures', () => {
  it('rejects close with the failure of a resource that close released', async () => {
    const reason = new Error('transport close failed')
    const { factory, resources } = observed([[1, { close: { reason } }]])
    await acquired(resources)
    await acquired(resources)
    await expect(resources.close()).rejects.toBe(reason)
    // The other resource was released all the same.
    expect(factory.acquired().map(item => item.closes)).toEqual([1, 1])
  })

  it('does not report again the failed release of a resource that its caller released', async () => {
    const reason = new Error('transport close failed')
    const { factory, resources } = observed([[1, { close: { reason } }]])
    const resource = await acquired(resources)
    await expect(resource.release()).rejects.toBe(reason)
    await expect(resources.close()).resolves.toBeUndefined()
    expect(factory.acquired()[0]?.closes).toBe(1)
  })

  it('rejects close with the failure of the configuration probe', async () => {
    const reason = new Error('probe close failed')
    const { resources } = observed([[0, { close: { reason } }]])
    await expect(resources.close()).rejects.toBe(reason)
  })

  it('rejects close with an error when the probe close rejects without a reason', async () => {
    const { resources } = observed([[0, { close: { reason: undefined } }]])
    await expect(resources.close()).rejects.toThrow(/probe close failed/u)
  })
})
