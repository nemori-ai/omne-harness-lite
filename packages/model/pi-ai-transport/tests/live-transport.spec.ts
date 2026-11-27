import {
  LIVE_REPRESENTATION,
  type LiveModelRequest,
  type Supplier,
} from '@omne-harness/model-contract'
import type { MaterializedLiveTransport } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import { defineLiveFamily } from '../src/family-kit/index.ts'
import { composeFamilies, recordAdoption, recordProvider } from '../src/family-table.ts'
import type { PiRoute } from '../src/index.ts'
import type { LiveSocket } from '../src/live/session.ts'
import { createPiTransport } from '../src/transport.ts'
import { network } from './support/exchange.ts'
import { LIMITS, REQUEST } from './support/test-family.ts'

const MODEL = 'gpt-live-1.1'
const OWNER = 'test-live'
const RECORD = {
  name: MODEL,
  revision: '1',
  route: { provider: 'openai', model: MODEL },
  status: 'current',
  live: { voices: ['marin'], audioFormats: ['pcm16'], maxSessionSeconds: null },
  profile: { input: ['voice', 'text'], output: ['voice', 'text'], evidence: 'a test record' },
} as const
const SUPPLIER: Supplier = {
  adoption: recordAdoption(OWNER, RECORD),
  provider: recordProvider(RECORD),
  model: MODEL,
  credential: { layer: 'official' },
}
const URL_OF = 'wss://live.test.invalid/v1/live/sessions'

function requestOf(overrides: Partial<LiveModelRequest> = {}): LiveModelRequest {
  return {
    kind: 'live',
    profile: REQUEST.profile,
    suppliers: [SUPPLIER],
    fallback: false,
    retryPolicy: REQUEST.retryPolicy,
    source: REQUEST.source,
    input: ['voice', 'text'],
    instructions: 'Be concise.',
    history: [],
    voice: 'marin',
    media: { via: 'link', audio: 'pcm16' },
    ...overrides,
  }
}

function world(route: Partial<PiRoute> = {}) {
  const sockets: { url: string; headers: Readonly<Record<string, string>>; sent: unknown[] }[] = []
  const emitters: ((type: string) => void)[] = []
  let secrets: ReadonlyMap<string, string> | undefined
  const built = createPiTransport({
    network: network(Buffer.from('')).handle,
    families: composeFamilies([
      defineLiveFamily({ owner: OWNER, endpoint: 'live-sessions', records: [RECORD] }),
    ]),
    routes: {
      openai: {
        endpoints: { 'live-sessions': { url: URL_OF, endMarker: null } },
        accounting: { place: 'openai', costUnit: 'USD' },
        auth: { kind: 'bearer', item: 'apiKey' },
        ...route,
      },
    },
    credential: { read: () => secrets },
    limits: LIMITS,
    liveSocket: (url, headers) => {
      const listeners = new Map<string, ((event: { data?: unknown }) => void)[]>()
      const made = { url: url.href, headers, sent: [] as unknown[] }
      sockets.push(made)
      emitters.push(type => listeners.get(type)?.forEach(listener => listener({})))
      const socket: LiveSocket = {
        send: data => void made.sent.push(JSON.parse(data)),
        close: () => listeners.get('close')?.forEach(listener => listener({})),
        addEventListener: (type, listener) =>
          void listeners.set(type, [...(listeners.get(type) ?? []), listener]),
      }
      return socket
    },
  })
  async function materialized(request = requestOf()): Promise<MaterializedLiveTransport> {
    const prepared = await built.transport.prepare(request, SUPPLIER, { resent: [] })
    if (!('ok' in prepared)) throw new Error(JSON.stringify(prepared))
    const done = await prepared.ok.materialize(new AbortController().signal)
    if (!('ok' in done) || !('open' in done.ok)) throw new Error(JSON.stringify(done))
    return done.ok
  }
  /** Opens inside the window in which the send boundary lets the credential be read. */
  function opened(live: MaterializedLiveTransport, secret: string | null = 'live-secret') {
    secrets = secret === null ? new Map() : new Map([['apiKey', secret]])
    try {
      return live.open(new AbortController().signal)
    } finally {
      secrets = undefined
    }
  }
  const pending = <T>(promise: Promise<T>) =>
    Promise.race([promise.then(() => false), new Promise(resolve => setTimeout(resolve, 20, true))])
  return { built, sockets, emitters, materialized, opened, pending }
}

describe('a live session through the transport', () => {
  it('opens with the credential of the window, says the start once open, and receipts the live representation', async () => {
    const w = world()
    const live = await w.materialized()
    expect(live.receipt).toMatchObject({
      supplier: SUPPLIER.adoption,
      representation: LIVE_REPRESENTATION,
    })
    expect(live.receipt.payloadDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(w.sockets).toEqual([])
    w.opened(live)
    expect(w.sockets[0]).toMatchObject({
      url: URL_OF,
      headers: { authorization: 'Bearer live-secret' },
    })
    w.emitters[0]?.('open')
    expect(w.sockets[0]?.sent).toEqual([
      {
        type: 'session.start',
        event_id: 'start',
        session: {
          model: MODEL,
          instructions: 'Be concise.',
          audio: { format: { type: 'audio/pcm', rate: 24000 }, output: { voice: 'marin' } },
          delegation: { type: 'client' },
        },
      },
    ])
    await w.built.close()
  })

  it('holds its connection seat until the socket is gone', async () => {
    const w = world()
    const first = await w.materialized()
    const session = w.opened(first)
    const second = w.materialized()
    expect(await w.pending(second)).toBe(true)
    await session.facts[Symbol.asyncIterator]().return?.()
    expect(await w.pending(second)).toBe(false)
    await w.built.close()
  })

  it('frees the seat of a session that never opened when it is closed, and opens a session once', async () => {
    const w = world()
    const never = await w.materialized()
    const second = w.materialized()
    expect(await w.pending(second)).toBe(true)
    await never.close()
    const live = await second
    w.opened(live)
    const again = w.opened(live)
    expect(w.sockets).toHaveLength(1)
    expect(again.input.send(undefined as never, undefined as never)).toBe('closed')
    await w.built.close()
  })

  it('opens no socket without the secret of its route, and frees the seat', async () => {
    const w = world()
    const live = await w.materialized()
    const session = w.opened(live, null)
    expect(w.sockets).toEqual([])
    expect(await session.facts[Symbol.asyncIterator]().next()).toEqual({
      done: true,
      value: undefined,
    })
    expect(await w.pending(w.materialized())).toBe(false)
    await w.built.close()
  })

  it.each([
    ['a history', { history: [{} as never] }, 'request.history'],
    ['a standby', { standby: { idleSeconds: '30' } }, 'request.standby'],
    [
      'an audio format it does not know',
      { media: { via: 'link', audio: 'opus' } },
      'request.media.audio',
    ],
  ] as const)('refuses %s before anything is sent', async (_case, overrides, field) => {
    const w = world()
    const request = requestOf(overrides as Partial<LiveModelRequest>)
    expect(await w.built.transport.prepare(request, SUPPLIER, { resent: [] })).toEqual({
      failure: { kind: 'unsupported', field, adapter: SUPPLIER.adoption },
    })
    await w.built.close()
  })
})

describe('the route of a live session', () => {
  it('takes only a wss: url for the live interface, and only https: for the others', () => {
    expect(() =>
      world({
        endpoints: {
          'live-sessions': { url: 'https://live.test.invalid/v1/live/sessions', endMarker: null },
        },
      }),
    ).toThrow('each live route url must be a wss: URL without credentials, query or fragment')
    expect(() =>
      world({
        endpoints: { responses: { url: 'wss://live.test.invalid/v1/responses', endMarker: null } },
      }),
    ).toThrow('each route url must be an https: URL without credentials, query or fragment')
  })
})
