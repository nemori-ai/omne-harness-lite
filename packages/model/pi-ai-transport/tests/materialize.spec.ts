import { createHash } from 'node:crypto'
import {
  judgeContentBlock,
  type ContentBlock,
  type ContentReference,
} from '@omne-harness/content-block'
import type { FixedModelRequest, ReplayDeclaration, Supplier } from '@omne-harness/model-contract'
import type {
  MaterializedTransport,
  PreparedTransport,
  TransportDispatch,
} from '@omne-harness/model-contract/provider'
import { afterEach, describe, expect, it } from 'vitest'
import { openNetwork, type NetworkInternals } from '../src/network.ts'
import type { PiMediaReader } from '../src/config.ts'
import { createPiTransport, type PiTransport } from '../src/transport.ts'
import {
  createTestFamily,
  END_MARKER,
  LIMITS,
  REQUEST,
  SUPPLIER,
  type FamilyProbe,
} from './support/test-family.ts'
import { slotFree } from './support/transport.ts'
import { fixedRequest, testRecord } from './support/chat-record.ts'

const ROUTE_URL = 'https://127.0.0.1:9/v1/chat/completions'
const EXPECTED_BODY = '{"model":"test-model","messages":0}'

const networks: NetworkInternals[] = []
const transports: PiTransport[] = []

afterEach(async () => {
  await Promise.all(transports.splice(0).map(transport => transport.close()))
  await Promise.all(networks.splice(0).map(network => network.close()))
})

function setup(
  maxConnections = 1,
  media?: PiMediaReader,
): {
  network: NetworkInternals
  probe: FamilyProbe
  prepare(request?: FixedModelRequest, dispatch?: TransportDispatch): Promise<PreparedTransport>
} {
  const network = openNetwork({ maxConnections, idleConnectionTimeoutMs: 1_000 })
  networks.push(network)
  const family = createTestFamily()
  const built = createPiTransport({
    network: network.handle,
    families: family.families,
    routes: {
      [SUPPLIER.provider]: {
        endpoints: { 'chat-completions': { url: ROUTE_URL, endMarker: END_MARKER } },
        accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
        auth: { kind: 'bearer', item: 'apiKey' },
      },
    },
    credential: { read: () => new Map([['apiKey', 'test-secret']]) },
    limits: LIMITS,
    ...(media === undefined ? {} : { media }),
  })
  transports.push(built)
  return {
    network,
    probe: family.probe,
    async prepare(request = REQUEST, dispatch = { resent: [] }) {
      const prepared = await built.transport.prepare(request, SUPPLIER, dispatch)
      if (!('ok' in prepared)) throw new Error('expected a prepared transport')
      return prepared.ok
    },
  }
}

async function materialized(
  prepared: PreparedTransport,
  signal = new AbortController().signal,
): Promise<MaterializedTransport> {
  const outcome = await prepared.materialize(signal)
  if (!('ok' in outcome)) throw new Error(`expected a materialization: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

const REFERENCE = { storage: 'store', key: 'key', mediaType: 'image/png', bytes: '10', digest: 'd' }
function referenceBlock(toModel: boolean, key = REFERENCE.key): ContentBlock {
  const judged = judgeContentBlock({
    kind: 'image',
    id: `block-${key}`,
    visibility: { toHuman: true, toModel },
    ref: { ...REFERENCE, key },
    transcript: null,
  })
  if (!('ok' in judged)) throw new Error(`the test built a refused block: ${judged.rejected}`)
  return judged.ok
}

describe('materialize', () => {
  it('names the supplier, the representation and the SHA-256 of the encoded body in a stable receipt', async () => {
    const { prepare } = setup()
    const first = await materialized(await prepare())
    const digest = createHash('sha256').update(EXPECTED_BODY).digest('hex')
    expect(first.receipt).toEqual({
      supplier: SUPPLIER.adoption,
      representation: REQUEST.representation,
      payloadDigest: digest,
    })
    expect(first.receipt).toBe(first.receipt)
    await first.close()
    const second = await materialized(await prepare())
    expect(second.receipt).toEqual(first.receipt)
  })

  it('names the replay format that the binding of the supplier produces in the receipt', async () => {
    const { prepare, probe } = setup()
    probe.replayFormat = 'test-format-v1'
    const sent = await materialized(await prepare())
    expect(sent.receipt).toEqual({
      supplier: SUPPLIER.adoption,
      representation: REQUEST.representation,
      payloadDigest: createHash('sha256').update(EXPECTED_BODY).digest('hex'),
      replayFormat: 'test-format-v1',
      replayPrefix: 'h:test.s:test.t:test.p:test',
    })
    await sent.close()
  })

  it('says in the receipt that the request carried reasoning state back, and only when it did', async () => {
    const { prepare, probe } = setup()
    probe.replayFormat = 'test-format-v1'
    probe.replayCarried = true
    const carried = await materialized(await prepare())
    expect(carried.receipt).toMatchObject({ replayFormat: 'test-format-v1', replayCarried: true })
    await carried.close()
    probe.replayCarried = false
    const plain = await materialized(await prepare())
    expect(Object.hasOwn(plain.receipt, 'replayCarried')).toBe(false)
    await plain.close()
  })

  it('leaves the replay format out of the receipt when the binding produces none', async () => {
    const { prepare, probe } = setup()
    probe.replayFormat = null
    const sent = await materialized(await prepare())
    expect(Object.hasOwn(sent.receipt, 'replayFormat')).toBe(false)
    await sent.close()
  })

  it('gives the family the request, no media, the declaration of the supplier and no resent message', async () => {
    const { prepare, probe } = setup()
    await materialized(await prepare())
    expect(probe.encoded).toEqual({
      request: REQUEST,
      media: [],
      declaration: REQUEST.declarations[0],
      resent: [],
    })
  })

  it('takes the declaration at the position of the supplier, and the resent messages of the dispatch', async () => {
    const { prepare, probe } = setup()
    const other: Supplier = { ...SUPPLIER, model: 'other-model' }
    const otherDeclaration: ReplayDeclaration = {
      produces: 'test-provider/other-model',
      accepts: ['test-provider/other-model'],
      foreignThinking: 'text',
    }
    const [own] = REQUEST.declarations
    const request: FixedModelRequest = {
      ...REQUEST,
      suppliers: [other, SUPPLIER],
      declarations: [otherDeclaration, own],
    }
    const resent = fixedRequest(testRecord()).messages.map(message => message.id)
    await materialized(await prepare(request, { resent }))
    expect(probe.encoded?.declaration).toBe(own)
    expect(probe.encoded?.resent).toEqual(resent)
  })

  it('holds the slot until close returns it', async () => {
    const { prepare, network } = setup()
    const held = await materialized(await prepare())
    expect(await slotFree(network)).toBe(false)
    await held.close()
    expect(await slotFree(network)).toBe(true)
    await held.close()
    expect(await slotFree(network)).toBe(true)
  })

  it('answers unsupported with the path of a content reference the model takes no medium for, and returns the slot', async () => {
    const reads: unknown[] = []
    const { prepare, network, probe } = setup(1, async reference => {
      reads.push(reference)
      return { failure: { kind: 'material-unavailable' } }
    })
    const request = { ...REQUEST, system: [referenceBlock(true)] }
    const outcome = await (await prepare(request)).materialize(new AbortController().signal)
    expect(outcome).toEqual({
      failure: { kind: 'unsupported', field: '/system/0', adapter: expect.anything() },
    })
    expect(probe.encoded).toBeUndefined()
    expect(reads).toEqual([])
    expect(await slotFree(network)).toBe(true)
  })

  it('materializes a request whose content reference the model does not see', async () => {
    const { prepare } = setup()
    const request = { ...REQUEST, system: [referenceBlock(false)] }
    expect((await materialized(await prepare(request))).receipt.payloadDigest).toMatch(
      /^[0-9a-f]{64}$/,
    )
  })

  it('gives an encode failure unchanged and returns the slot', async () => {
    const { prepare, network, probe } = setup()
    const failure = { kind: 'invalid', field: 'messages', reason: 'test' } as const
    probe.encodeFailure = failure
    expect(await (await prepare()).materialize(new AbortController().signal)).toEqual({ failure })
    expect(await slotFree(network)).toBe(true)
  })

  it('answers invalid to a second materialize of the same prepared transport, without a reservation', async () => {
    const { prepare } = setup(1)
    const prepared = await prepare()
    await materialized(prepared)
    expect(await prepared.materialize(new AbortController().signal)).toEqual({
      failure: { kind: 'invalid', field: 'materialize', reason: 'repeated' },
    })
  })

  it('answers unavailable when the signal is already aborted, and takes no slot', async () => {
    const { prepare, network } = setup()
    const aborted = new AbortController()
    aborted.abort()
    expect(await (await prepare()).materialize(aborted.signal)).toEqual({
      failure: { kind: 'unavailable', dependency: 'connection-capacity', diagnostic: 'cancelled' },
    })
    expect(await slotFree(network)).toBe(true)
  })
})

describe('waiting for capacity', () => {
  it('waits while the slot is held, and a cancel ends the wait with unavailable and no reservation', async () => {
    const { prepare, network } = setup(1)
    const held = await materialized(await prepare())
    const controller = new AbortController()
    const waiting = (await prepare()).materialize(controller.signal)
    controller.abort()
    expect(await waiting).toEqual({
      failure: { kind: 'unavailable', dependency: 'connection-capacity', diagnostic: 'cancelled' },
    })
    await held.close()
    expect(await slotFree(network)).toBe(true)
  })

  it('a waiting materialize gets the slot that the close of another materialization returns', async () => {
    const { prepare } = setup(1)
    const held = await materialized(await prepare())
    const waiting = (await prepare()).materialize(new AbortController().signal)
    await held.close()
    expect(await waiting).toMatchObject({ ok: { receipt: held.receipt } })
  })

  it('the close of the network resources ends the wait with unavailable', async () => {
    const { prepare, network } = setup(1)
    await materialized(await prepare())
    const waiting = (await prepare()).materialize(new AbortController().signal)
    await network.close()
    expect(await waiting).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'connection-capacity',
        diagnostic: 'network-closed',
      },
    })
  })

  it('the close of the prepared transport ends its waiting materialize and then releases the binding', async () => {
    const { prepare, probe } = setup(1)
    await materialized(await prepare())
    const prepared = await prepare()
    const waiting = prepared.materialize(new AbortController().signal)
    const closed = prepared.close()
    expect(await waiting).toMatchObject({ failure: { kind: 'unavailable' } })
    await closed
    expect(probe.released).toBe(1)
  })

  it('the close of the prepared transport returns the slot of its materialization', async () => {
    const { prepare, network } = setup(1)
    const prepared = await prepare()
    await materialized(prepared)
    await prepared.close()
    expect(await slotFree(network)).toBe(true)
  })

  describe('the media of a request are read by reference when it is materialized (MD-45)', () => {
    const LIMITS_OF_MODEL = { mediaTypes: ['image/png', 'image/webp'], maxBytes: 16, image: null }
    const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const reference = (key: string) => ({ ...REFERENCE, key })
    const picture = (key: string, toModel = true): ContentBlock => referenceBlock(toModel, key)
    const read = (reference: ContentReference, bytes = BYTES, mediaType = 'image/png') => ({
      ok: {
        mediaType,
        bytes,
        measurement: {
          reference,
          bytes: String(bytes.byteLength),
          mediaType,
          kind: 'image' as const,
          widthPixels: '4',
          heightPixels: '3',
        },
      },
    })
    const user = (...blocks: ContentBlock[]) =>
      ({ id: 'msg_0123456789abcdefghjkmnpqrs', role: 'user', blocks }) as never
    function reading(answer: (reference: ContentReference) => ReturnType<PiMediaReader>) {
      const asked: unknown[] = []
      const given = setup(1, (reference, limits, signal) => {
        asked.push({ reference, limits, aborted: signal.aborted })
        return answer(reference)
      })
      given.probe.mediaLimits = LIMITS_OF_MODEL
      return { ...given, asked }
    }

    it('reads each reference the model sees once, with the limits of the model, and hands the bytes to the encoder', async () => {
      const { prepare, probe, asked } = reading(async given => read(given))
      const request = {
        ...REQUEST,
        system: [picture('a')],
        messages: [user(picture('b'), picture('a'), picture('hidden', false))],
      }
      await (await materialized(await prepare(request))).close()
      expect(asked).toEqual([
        { reference: reference('a'), limits: LIMITS_OF_MODEL, aborted: false },
        { reference: reference('b'), limits: LIMITS_OF_MODEL, aborted: false },
      ])
      expect(probe.encoded?.media).toEqual([
        {
          reference: reference('a'),
          mime: 'image/png',
          bytes: BYTES,
          measurement: read(reference('a')).ok.measurement,
        },
        {
          reference: reference('b'),
          mime: 'image/png',
          bytes: BYTES,
          measurement: read(reference('b')).ok.measurement,
        },
      ])
    })

    it('names in the receipt each medium read, with the type and byte count of what was encoded, in reading order', async () => {
      const fitted = new Uint8Array([1, 2, 3])
      const { prepare, probe } = reading(async given =>
        given.mediaType === 'audio/wav'
          ? read(given, BYTES, 'audio/wav')
          : read(given, fitted, 'image/webp'),
      )
      probe.mediaLimits = { ...LIMITS_OF_MODEL, mediaTypes: ['image/webp', 'audio/wav'] }
      const voice = judgeContentBlock({
        kind: 'voice',
        id: 'block-voice',
        visibility: { toHuman: true, toModel: true },
        ref: { ...reference('voice'), mediaType: 'audio/wav' },
        transcript: null,
      })
      if (!('ok' in voice)) throw new Error(`the test built a refused block: ${voice.rejected}`)
      const request = { ...REQUEST, messages: [user(picture('a'), voice.ok, picture('a'))] }
      const sent = await materialized(await prepare(request))
      expect(sent.receipt.media).toEqual([
        { reference: reference('a'), mediaType: 'image/webp', bytes: '3' },
        {
          reference: { ...reference('voice'), mediaType: 'audio/wav' },
          mediaType: 'audio/wav',
          bytes: '10',
        },
      ])
      await sent.close()
      const plain = await materialized(await prepare())
      expect(Object.hasOwn(plain.receipt, 'media')).toBe(false)
      await plain.close()
    })

    it('takes two references for one medium only when storage, key and digest are all the same', async () => {
      const { prepare, asked } = reading(async given => read(given))
      const elsewhere = { ...picture('a'), ref: { ...reference('a'), storage: 'elsewhere' } }
      const changed = { ...picture('a'), ref: { ...reference('a'), digest: 'e'.repeat(64) } }
      const request = {
        ...REQUEST,
        messages: [user(picture('a'), elsewhere as ContentBlock, changed as ContentBlock)],
      }
      await (await materialized(await prepare(request))).close()
      expect(asked.map(each => (each as { reference: ContentReference }).reference)).toEqual([
        reference('a'),
        elsewhere.ref,
        changed.ref,
      ])
    })

    it('a medium of exactly the byte limit is within it', async () => {
      const { prepare, probe } = reading(async given => read(given, new Uint8Array(16)))
      await (await materialized(await prepare({ ...REQUEST, system: [picture('a')] }))).close()
      expect(probe.encoded?.media).toHaveLength(1)
    })

    it('a reference this model takes nothing of is unsupported at the path of its block, and nothing is read', async () => {
      const { prepare, probe, asked } = reading(async given => read(given))
      probe.mediaLimits = null
      const request = { ...REQUEST, messages: [user(picture('hidden', false), picture('a'))] }
      const outcome = await (await prepare(request)).materialize(new AbortController().signal)
      expect(outcome).toEqual({
        failure: { kind: 'unsupported', field: '/messages/0/blocks/1', adapter: expect.anything() },
      })
      expect(asked).toEqual([])
    })

    it('reads again at every materialization: nothing of an earlier read is kept', async () => {
      const { prepare, asked } = reading(async given => read(given))
      const request = { ...REQUEST, system: [picture('a')] }
      await (await materialized(await prepare(request))).close()
      await (await materialized(await prepare(request))).close()
      expect(asked).toHaveLength(2)
    })

    it.each([
      [
        'that cannot be read',
        { failure: { kind: 'material-unavailable' } },
        { kind: 'media', reference: REFERENCE, reason: 'material-unavailable' },
      ],
      [
        'no version of which fits the model',
        { failure: { kind: 'too-large' } },
        { kind: 'media', reference: REFERENCE, reason: 'over-limit', limit: '16' },
      ],
      [
        'whose source is not there now',
        { failure: { kind: 'unavailable', diagnostic: 'the store is away' } },
        { kind: 'unavailable', dependency: 'model-media', diagnostic: 'the store is away' },
      ],
    ] as const)(
      'a medium %s is refused as such, nothing is encoded and the slot returns',
      async (_, answer, failure) => {
        const { prepare, network, probe } = reading(async () => answer)
        const request = { ...REQUEST, system: [referenceBlock(true)] }
        const outcome = await (await prepare(request)).materialize(new AbortController().signal)
        expect(outcome).toEqual({ failure })
        expect(probe.encoded).toBeUndefined()
        expect(await slotFree(network)).toBe(true)
      },
    )

    it.each([
      ['more bytes than the model takes', new Uint8Array(17), 'image/png'],
      ['a media type the model does not take', BYTES, 'image/tiff'],
    ])(
      'a read that answers %s is over the limit, whatever the source said',
      async (_, bytes, mediaType) => {
        const { prepare } = reading(async given => read(given, bytes, mediaType))
        const request = { ...REQUEST, system: [referenceBlock(true)] }
        expect(await (await prepare(request)).materialize(new AbortController().signal)).toEqual({
          failure: { kind: 'media', reference: REFERENCE, reason: 'over-limit', limit: '16' },
        })
      },
    )

    it('with no source of media, or one that throws, the request is unavailable: not unsupported, not sent without the medium', async () => {
      const absent = setup()
      absent.probe.mediaLimits = LIMITS_OF_MODEL
      const request = { ...REQUEST, system: [referenceBlock(true)] }
      expect(
        await (await absent.prepare(request)).materialize(new AbortController().signal),
      ).toEqual({
        failure: {
          kind: 'unavailable',
          dependency: 'model-media',
          diagnostic: 'media-source-absent',
        },
      })
      const throwing = reading(() => Promise.reject(new Error('broke')))
      expect(
        await (await throwing.prepare(request)).materialize(new AbortController().signal),
      ).toEqual({
        failure: {
          kind: 'unavailable',
          dependency: 'model-media',
          diagnostic: 'media-source-failed',
        },
      })
      expect(throwing.probe.encoded).toBeUndefined()
    })
  })
})
