// The client core's HTTP transport against a real entry (#1249 C13, C14): server-entry's test
// entry runs as a process with the notes protocol and the built-in access/v1. The entry is cut
// once before a request leaves (it is gone) and once after (it dies while the handler runs).
import { afterEach, describe, expect, it } from 'vitest'
import { accessProtocol, type AvailabilityFrame } from '@omne-harness/public-contract'
import {
  createClient,
  createHttpProtocolTransport,
  type CallReport,
  type Transport,
} from '@omne-harness/sdk/core'
import { PROOF, TENANT, notesProtocol } from './support/notes-protocol.ts'
import { startPeer, type Peer } from './support/peer.ts'

const peers: Peer[] = []
afterEach(async () => {
  await Promise.all(peers.splice(0).map(peer => peer.stop()))
})

async function peer(): Promise<Peer> {
  const started = await startPeer()
  peers.push(started)
  return started
}

/** The HTTP transport, with every report of its sends kept in order. */
function counted(origin: string): { transport: Transport; reports: CallReport['kind'][] } {
  const inner = createHttpProtocolTransport({
    origin,
    credentials: () => ({ proof: PROOF, tenant: TENANT }),
  })
  const reports: CallReport['kind'][] = []
  return {
    reports,
    transport: {
      call: async request => {
        const report = await inner.call(request)
        reports.push(report.kind)
        return report
      },
      observe: request => inner.observe(request),
    },
  }
}

describe('C13: calls over HTTP to a real entry', () => {
  it('answers by the contract', async () => {
    const entry = await peer()
    const notes = createClient(notesProtocol, counted(entry.origin).transport)
    expect(await notes['read-note']({ noteId: 'n-1' })).toEqual({
      outcome: 'succeeded',
      body: { noteId: 'n-1', title: 'first note' },
    })
  })

  it('answers unavailable when the entry is gone before the request leaves: two sends', async () => {
    const entry = await startPeer()
    await entry.stop()
    const { transport, reports } = counted(entry.origin)
    const notes = createClient(notesProtocol, transport)
    expect(await notes['read-note']({ noteId: 'n-1' })).toEqual({ outcome: 'unavailable' })
    expect(reports).toEqual(['not-sent', 'not-sent'])
  })

  it('answers uncertain when the entry dies after the request left: one send', async () => {
    const entry = await startPeer()
    const { transport, reports } = counted(entry.origin)
    const notes = createClient(notesProtocol, transport)
    const answer = notes['save-note']({ noteId: 'n-1', title: 't' })
    await entry.saw({ called: 'save-note' })
    await entry.kill()
    expect(await answer).toEqual({ outcome: 'uncertain' })
    expect(reports).toEqual(['uncertain'])
  })
})

/** Reads every frame until the observation ends, and its end. */
async function drain<F, E>(frames: AsyncGenerator<F, E>): Promise<{ frames: F[]; end: E }> {
  const seen: F[] = []
  for (;;) {
    const next = await frames.next()
    if (next.done === true) return { frames: seen, end: next.value }
    seen.push(next.value)
  }
}

describe('C14: observations over HTTP to a real entry', () => {
  it('subscribes to the availability without a login, and the abort closes it', async () => {
    const entry = await peer()
    const access = createClient(
      accessProtocol,
      createHttpProtocolTransport({ origin: entry.origin }),
    )
    const controller = new AbortController()
    const frames = access.observe.availability({}, { signal: controller.signal })
    const first = await frames.next()
    expect(first.value).toEqual({
      kind: 'snapshot',
      revision: 2,
      protocols: [
        { name: 'notes', major: 1 },
        { name: 'access', major: 1 },
      ],
    } satisfies AvailabilityFrame)
    controller.abort()
    expect(await frames.next()).toEqual({ done: true, value: { kind: 'aborted' } })
  })

  it('decodes the frames by the contract and reads the reason of the ended frame', async () => {
    const entry = await peer()
    const notes = createClient(
      notesProtocol,
      createHttpProtocolTransport({ origin: entry.origin, credentials: () => ({ proof: PROOF }) }),
    )
    const result = await drain(
      notes.observe['watch-note']({ noteId: 'n-1' }, { signal: new AbortController().signal }),
    )
    expect(result).toEqual({
      frames: [1, 2, 3].map(tick => ({ noteId: 'n-1', title: `tick ${tick}` })),
      end: { kind: 'ended', reason: 'note-deleted' },
    })
  })

  it('closes the connection when the caller stops reading, and the frame source is aborted', async () => {
    const entry = await peer()
    const notes = createClient(notesProtocol, createHttpProtocolTransport({ origin: entry.origin }))
    const controller = new AbortController()
    const frames = notes.observe['watch-all']({}, { signal: controller.signal })
    expect((await frames.next()).value).toEqual({ noteId: 'n-0', title: 'ready' })
    const pending = frames.next()
    controller.abort()
    expect(await pending).toEqual({ done: true, value: { kind: 'aborted' } })
    await entry.saw({ aborted: 'watch-all' })
  })

  it('closes the connection when the caller leaves the iteration without an abort', async () => {
    const entry = await peer()
    const notes = createClient(notesProtocol, createHttpProtocolTransport({ origin: entry.origin }))
    const frames = notes.observe['watch-all']({}, { signal: new AbortController().signal })
    for await (const frame of frames) {
      expect(frame).toEqual({ noteId: 'n-0', title: 'ready' })
      break
    }
    await entry.saw({ aborted: 'watch-all' })
  })

  it('reads a refused opening as its outcome', async () => {
    const entry = await peer()
    const notes = createClient(notesProtocol, createHttpProtocolTransport({ origin: entry.origin }))
    const result = await drain(
      notes.observe['watch-note']({ noteId: 'n-1' }, { signal: new AbortController().signal }),
    )
    expect(result).toEqual({ frames: [], end: { kind: 'refused', outcome: 'denied' } })
  })
})
