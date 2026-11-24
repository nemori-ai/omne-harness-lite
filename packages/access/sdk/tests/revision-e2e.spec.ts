import { afterEach, describe, expect, it } from 'vitest'
import {
  defineProtocol,
  revisionOf,
  ruleCodec,
  type Codec,
  type FieldRule,
  type OperationContract,
  type ProtocolContract,
  type Rule,
} from '@omne-harness/public-contract'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { startPeer, type Peer } from './support/peer.ts'

const peers: Peer[] = []
afterEach(async () => {
  await Promise.all(peers.splice(0).map(peer => peer.stop()))
})

const codecOf = ruleCodec as unknown as (rule: Rule) => Codec<unknown>
const text = { kind: 'text' } as const
const later = (since: number) => ({ rule: text, optional: true, since }) as const
const object = (fields: Record<string, FieldRule>): Codec<unknown> =>
  codecOf({ kind: 'object', fields })

/** The contract of `drafts/v1` as three builds have it. The server in the peer process is at revision 2. */
function draftsAt(revision: 1 | 2 | 3): ProtocolContract {
  const ref: Record<string, FieldRule> = { id: { rule: text } }
  const draft: Record<string, FieldRule> = { id: { rule: text }, title: { rule: text } }
  if (revision >= 2) Object.assign(ref, { lang: later(2) })
  if (revision >= 2) Object.assign(draft, { colour: later(2) })
  if (revision >= 3) Object.assign(ref, { deep: later(3) })
  const operations: Record<string, OperationContract> = {
    read: {
      identity: 'none',
      effect: 'read',
      limit: 'small',
      body: object(ref),
      outcomes: { succeeded: object(draft) },
    },
  }
  if (revision >= 3)
    operations['pin'] = {
      identity: 'none',
      effect: 'commit',
      limit: 'small',
      body: object({}),
      outcomes: { succeeded: object({}) },
      since: 3,
    }
  const protocol = { name: 'drafts', major: 1, operations, observations: {} }
  return defineProtocol(protocol as never) as unknown as ProtocolContract
}

type Loose = Record<string, (body: Record<string, string>) => Promise<unknown>>

async function clientOf(revision: 1 | 2 | 3, peerRevision?: number): Promise<Loose> {
  const peer = await startPeer(['--drafts'])
  peers.push(peer)
  const protocol = draftsAt(revision)
  expect(revisionOf(protocol)).toBe(revision)
  const transport = createHttpProtocolTransport({ origin: peer.origin })
  const settings = peerRevision === undefined ? {} : { peerRevision: () => peerRevision }
  return createClient(protocol, transport, settings) as unknown as Loose
}

const clientAt = async (revision: 1 | 2 | 3) => (await clientOf(revision))['read']!

describe('two ends at different revisions of one major, over real HTTP (V1, V2)', () => {
  it('an older client reads the answer of a newer server: the server leaves out what the client does not know', async () => {
    const read = await clientAt(1)
    expect(await read({ id: 'd-1' })).toEqual({
      outcome: 'succeeded',
      body: { id: 'd-1', title: 'T' },
    })
  })

  it('a client at the revision of the server gets and sends everything', async () => {
    const read = await clientAt(2)
    expect(await read({ id: 'd-1', lang: 'zh' })).toEqual({
      outcome: 'succeeded',
      body: { id: 'd-1', title: 'zh', colour: 'red' },
    })
  })

  it('a newer client that sends what the older server does not know gets a certain protocol rejection', async () => {
    const read = await clientAt(3)
    expect(await read({ id: 'd-1', deep: 'x' })).toEqual({ outcome: 'protocol-rejected' })
  })

  it('a newer client that keeps to what the older server knows is served', async () => {
    const read = await clientAt(3)
    expect(await read({ id: 'd-1', lang: 'zh' })).toEqual({
      outcome: 'succeeded',
      body: { id: 'd-1', title: 'zh', colour: 'red' },
    })
  })

  it('a newer client that calls an operation the older server does not have learns for certain that nothing ran (V3)', async () => {
    const client = await clientOf(3)
    expect(await client['pin']!({})).toEqual({ outcome: 'unavailable' })
  })
})

describe('a newer client that knows what the older server is at (V2, the other half)', () => {
  it('does not send what the server does not know: the call is unavailable here, and the server never sees it', async () => {
    const client = await clientOf(3, 2)
    expect(await client['read']!({ id: 'd-1', deep: 'x' })).toEqual({ outcome: 'unavailable' })
    expect(await client['pin']!({})).toEqual({ outcome: 'unavailable' })
    expect(await client['read']!({ id: 'seen' })).toEqual({
      outcome: 'succeeded',
      body: { id: 'seen', title: 'T', colour: 'red' },
    })
    expect(await client['read']!({ id: 'count' })).toEqual({
      outcome: 'succeeded',
      body: { id: 'count', title: '1' },
    })
  })

  it('keeps to what the server knows and is served as before', async () => {
    const client = await clientOf(3, 2)
    expect(await client['read']!({ id: 'd-1', lang: 'zh' })).toEqual({
      outcome: 'succeeded',
      body: { id: 'd-1', title: 'zh', colour: 'red' },
    })
  })
})
