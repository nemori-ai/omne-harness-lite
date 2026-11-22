import { afterEach, describe, expect, it } from 'vitest'
import { defineProtocol, revisionOf, ruleCodec } from '@omne-harness/public-contract'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { startPeer, type Peer } from './support/peer.ts'

const peers: Peer[] = []
afterEach(async () => {
  await Promise.all(peers.splice(0).map(peer => peer.stop()))
})

/** The contract of `drafts/v1` as three builds have it. The server in the peer process is at revision 2. */
function draftsAt(revision: 1 | 2 | 3) {
  const later = <S extends number>(since: S) => ({ optional: true, since }) as const
  const text = { kind: 'text' } as const
  const ref = {
    id: { rule: text },
    ...(revision >= 2 ? { lang: { rule: text, ...later(2) } } : {}),
    ...(revision >= 3 ? { deep: { rule: text, ...later(3) } } : {}),
  }
  const draft = {
    id: { rule: text },
    title: { rule: text },
    ...(revision >= 2 ? { colour: { rule: text, ...later(2) } } : {}),
  }
  return defineProtocol({
    name: 'drafts',
    major: 1,
    operations: {
      read: {
        identity: 'none',
        effect: 'read',
        limit: 'small',
        body: ruleCodec({ kind: 'object', fields: ref }),
        outcomes: { succeeded: ruleCodec({ kind: 'object', fields: draft }) },
      },
    },
    observations: {},
  })
}

async function clientAt(revision: 1 | 2 | 3) {
  const peer = await startPeer(['--drafts'])
  peers.push(peer)
  const protocol = draftsAt(revision)
  expect(revisionOf(protocol)).toBe(revision)
  const read = createClient(protocol, createHttpProtocolTransport({ origin: peer.origin })).read
  return read as (body: Record<string, string>) => Promise<unknown>
}

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
})
