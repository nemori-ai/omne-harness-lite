import {
  defineProtocol,
  ruleCodec,
  type Codec,
  type ProtocolContract,
  type Rule,
} from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'
import { createClient, type Transport } from '@omne-harness/sdk/core'

const codecOf = ruleCodec as unknown as (rule: Rule) => Codec<unknown>
const text = { kind: 'text' } as const
const ref = codecOf({
  kind: 'object',
  fields: { id: { rule: text }, lang: { rule: text, optional: true, since: 2 } },
})
const empty = codecOf({ kind: 'object', fields: {} })
const base = { identity: 'none', limit: 'small', outcomes: { succeeded: empty } } as const

/** `drafts/v1` at revision 3: `lang` came at 2; `pin` and `follow` came at 3. */
const drafts = defineProtocol({
  name: 'drafts',
  major: 1,
  operations: {
    read: { ...base, effect: 'read', body: ref },
    pin: { ...base, effect: 'commit', body: ref, since: 3 },
  },
  observations: {
    watch: { identity: 'none', open: ref, frame: empty, ends: ['gone'] },
    follow: { identity: 'none', open: ref, frame: empty, ends: ['gone'], since: 3 },
  },
} as never) as unknown as ProtocolContract

type Loose = Record<string, (body: object) => Promise<unknown>> & {
  observe: Record<string, (open: object, options: { signal: AbortSignal }) => AsyncGenerator>
}

function clientAt(peer: number | undefined) {
  const sent: string[] = []
  const transport: Transport = {
    call: async request => {
      sent.push(`call ${request.operation} at ${request.revision}`)
      return { kind: 'answered', outcome: 'succeeded', body: { kind: 'object', entries: [] } }
    },
    observe: request => {
      sent.push(`observe ${request.observation} at ${request.revision}`)
      const ended = { done: true as const, value: { kind: 'ended' as const, reason: 'gone' } }
      const stream = { next: async () => ended, return: async () => ended }
      return stream as unknown as ReturnType<Transport['observe']>
    },
  }
  const settings = peer === undefined ? {} : { peerRevision: () => peer }
  return { sent, client: createClient(drafts, transport, settings) as unknown as Loose }
}

const end = async (stream: AsyncGenerator): Promise<unknown> => (await stream.next()).value
const signal = new AbortController().signal
const SUCCEEDED = { outcome: 'succeeded', body: {} }
const UNAVAILABLE = { outcome: 'unavailable' }

describe('what the client sends, by what it knows of the other end', () => {
  it.each([undefined, 3, 9])('the other end at %s: everything is sent as before', async peer => {
    const { client, sent } = clientAt(peer)
    expect(await client['read']!({ id: 'a', lang: 'zh' })).toEqual(SUCCEEDED)
    expect(await client['pin']!({ id: 'a' })).toEqual(SUCCEEDED)
    expect(await end(client.observe['follow']!({ id: 'a' }, { signal }))).toEqual({
      kind: 'ended',
      reason: 'gone',
    })
    expect(sent).toEqual(['call read at 3', 'call pin at 3', 'observe follow at 3'])
  })

  it('the other end at 2: an operation and an observation that came at 3 are unavailable here', async () => {
    const { client, sent } = clientAt(2)
    expect(await client['pin']!({ id: 'a' })).toEqual(UNAVAILABLE)
    expect(await end(client.observe['follow']!({ id: 'a' }, { signal }))).toEqual({
      kind: 'unavailable',
    })
    expect(sent).toEqual([])
  })

  it('the other end at 2: what it knows is sent, with a field that came at 2', async () => {
    const { client, sent } = clientAt(2)
    expect(await client['read']!({ id: 'a', lang: 'zh' })).toEqual(SUCCEEDED)
    expect(await end(client.observe['watch']!({ id: 'a', lang: 'zh' }, { signal }))).toEqual({
      kind: 'ended',
      reason: 'gone',
    })
    expect(sent).toEqual(['call read at 3', 'observe watch at 3'])
  })

  it('the other end at 1: a request that uses a field it does not know is unavailable here, not sent without it', async () => {
    const { client, sent } = clientAt(1)
    expect(await client['read']!({ id: 'a', lang: 'zh' })).toEqual(UNAVAILABLE)
    expect(await end(client.observe['watch']!({ id: 'a', lang: 'zh' }, { signal }))).toEqual({
      kind: 'unavailable',
    })
    expect(sent).toEqual([])
    expect(await client['read']!({ id: 'a' })).toEqual(SUCCEEDED)
    expect(sent).toEqual(['call read at 3'])
  })

  it('a value that does not fit the contract still throws, whatever the other end is at', async () => {
    const { client } = clientAt(1)
    await expect(client['read']!({ id: 7 })).rejects.toThrow(
      'drafts/v1/read: id is 7; allows a text that is not empty; not sent',
    )
  })

  it('asks what the other end is at for every call: it can change while the client lives', async () => {
    let peer: number | undefined = 1
    const sent: string[] = []
    const transport: Transport = {
      call: async request => {
        sent.push(request.operation)
        return { kind: 'answered', outcome: 'succeeded', body: { kind: 'object', entries: [] } }
      },
      observe: () => {
        throw new Error('not used')
      },
    }
    const client = createClient(drafts, transport, { peerRevision: () => peer }) as unknown as Loose
    expect(await client['pin']!({ id: 'a' })).toEqual(UNAVAILABLE)
    peer = 3
    expect(await client['pin']!({ id: 'a' })).toEqual(SUCCEEDED)
    peer = undefined
    expect(await client['pin']!({ id: 'a' })).toEqual(SUCCEEDED)
    expect(sent).toEqual(['pin', 'pin'])
  })
})
