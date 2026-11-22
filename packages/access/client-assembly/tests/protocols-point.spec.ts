import { Context } from '@deepseek-ai/cordis'
import { ask, list, standingOf } from '@omne-harness/dynamis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import type { AvailabilityFrame } from '@omne-harness/public-contract'
import { afterEach, describe, expect, it } from 'vitest'
import { CONNECTION_PROTOCOLS_POINT, needStanding } from '@omne-harness/client-assembly'
import {
  connectionPlugin,
  defineProtocolClient,
  type LoginStateSource,
} from '@omne-harness/client-assembly/cordis'
import { fakeTransport, settle } from './support/fake-transport.ts'
import { ACCESS, NOTES, OTHER, notesProtocol } from './support/notes.ts'

const NOTES_2 = { name: 'notes', major: 2 } as const
const signedOut: LoginStateSource = { state: () => 'signed-out', subscribe: () => () => undefined }

type Key = { name: string; major: number }
const snapshot = (revision: number, protocols: Key[], conflicts: Key[] = []) =>
  ({ kind: 'snapshot', revision, protocols, conflicts }) satisfies AvailabilityFrame
const change = (revision: number, added: Key[], removed: Key[], conflicts: Key[] = []) =>
  ({ kind: 'change', revision, added, removed, conflicts }) satisfies AvailabilityFrame

const roots: Context[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await root.fiber.dispose()
})

async function tree() {
  const root = new Context()
  roots.push(root)
  const fake = fakeTransport()
  await root.plugin(DynamisService)
  await root.plugin(connectionPlugin({ transport: fake.transport, login: signedOut }))
  await root.plugin(defineProtocolClient(notesProtocol))
  await settle()
  const connection = root.get('connection')!
  const keys = () => {
    const read = list(root.dynamis.registry(), CONNECTION_PROTOCOLS_POINT, null, [])
    if (read.kind !== 'read') throw new Error(`the point is ${read.kind}`)
    return read.items.map(item => item.entry.key)
  }
  const push = async (frame: AvailabilityFrame) => {
    fake.push(frame)
    await settle()
  }
  return { root, fake, connection, keys, push, client: connection.client(notesProtocol) }
}

describe('the point connection.protocols on the client tree', () => {
  it('is declared by the connection: on the client tree, one item a key, keys not public', async () => {
    const t = await tree()
    const declared = standingOf(t.root.dynamis.registry(), CONNECTION_PROTOCOLS_POINT, [])
    expect(declared.kind === 'declared' && declared.contract).toMatchObject({
      tree: 'client',
      arity: 'keyed-one',
      resolve: 'conflict',
      keys: 'private',
    })
    expect(t.keys()).toEqual([])
  })

  it('holds one item for each protocol the server serves and this client has a client of', async () => {
    const t = await tree()
    await t.push(snapshot(1, [ACCESS, NOTES, OTHER]))
    expect(t.keys()).toEqual(['notes/v1'])
    const answer = ask(t.root.dynamis.registry(), CONNECTION_PROTOCOLS_POINT, 'notes/v1', [])
    expect(answer.kind === 'one' && answer.entry.item).toMatchObject({
      protocol: 'notes',
      major: 1,
    })
  })

  it('takes the item when the protocol is withdrawn and puts it again when it is back', async () => {
    const t = await tree()
    await t.push(snapshot(1, [ACCESS, NOTES]))
    await t.push(change(2, [], [NOTES]))
    expect(t.keys()).toEqual([])
    await t.push(change(3, [NOTES], []))
    expect(t.keys()).toEqual(['notes/v1'])
  })

  it('a protocol two servers hold at once is not served, so it has no item', async () => {
    const t = await tree()
    await t.push(snapshot(1, [ACCESS], [NOTES]))
    expect(t.keys()).toEqual([])
  })

  it('another major of the same name is another key: it gives this client no item', async () => {
    const t = await tree()
    await t.push(snapshot(1, [ACCESS, NOTES_2]))
    expect(t.keys()).toEqual([])
  })
})

type Row = Readonly<{
  state: string
  frames: readonly AvailabilityFrame[]
  optional?: true
  standing: ReturnType<typeof needStanding>
  pinned: boolean
}>

const ROWS: readonly Row[] = [
  { state: 'no availability yet', frames: [], standing: { kind: 'connecting' }, pinned: false },
  {
    state: 'pinned',
    frames: [snapshot(1, [ACCESS, NOTES])],
    standing: { kind: 'pinned' },
    pinned: true,
  },
  {
    state: 'absent, and another major of the same name is served',
    frames: [snapshot(1, [ACCESS, NOTES_2])],
    standing: { kind: 'other-major', served: [2] },
    pinned: false,
  },
  {
    state: 'absent',
    frames: [snapshot(1, [ACCESS])],
    standing: { kind: 'absent' },
    pinned: false,
  },
  {
    state: 'conflict on the server',
    frames: [snapshot(1, [ACCESS], [NOTES])],
    standing: { kind: 'conflict' },
    pinned: false,
  },
  {
    state: 'optional, and absent',
    frames: [snapshot(1, [ACCESS])],
    optional: true,
    standing: { kind: 'optional-absent' },
    pinned: false,
  },
]

describe('the client that is always there: six standings of a need, four things that happen', () => {
  for (const row of ROWS) {
    describe(row.state, () => {
      const arrive = async () => {
        const t = await tree()
        for (const frame of row.frames) await t.push(frame)
        return t
      }
      const need = { key: NOTES, ...(row.optional === true ? { optional: true as const } : {}) }

      it('the page is told this standing', async () => {
        const t = await arrive()
        expect(needStanding(need, t.connection.availability.standing(NOTES))).toEqual(row.standing)
      })

      it(`a call ${row.pinned ? 'goes out' : 'answers unavailable and the transport is not touched'}`, async () => {
        const t = await arrive()
        const answer = await t.client.ping({})
        if (row.pinned) expect(t.fake.calls.map(call => call.operation)).toEqual(['ping'])
        else {
          expect(answer).toEqual({ outcome: 'unavailable' })
          expect(t.fake.calls).toEqual([])
          expect(t.fake.sent).toEqual([])
        }
      })

      it(`an observation ${row.pinned ? 'opens' : 'ends unavailable and the transport is not touched'}`, async () => {
        const t = await arrive()
        const stop = new AbortController()
        const frames = t.client.observe['watch-all']({}, { signal: stop.signal })
        const first = frames.next()
        await settle()
        if (row.pinned) {
          expect(t.fake.observed.map(seen => seen.observation)).toEqual(['watch-all'])
          stop.abort()
          await first
        } else {
          expect(await first).toEqual({ done: true, value: { kind: 'unavailable' } })
          expect(t.fake.observed).toEqual([])
        }
      })

      it('when the availability changes, the same client follows it', async () => {
        const t = await arrive()
        const next = (t.connection.availability.revision() ?? 0) + 1
        const frame = row.pinned
          ? change(next, [], [NOTES])
          : row.frames.length === 0
            ? snapshot(1, [ACCESS, NOTES])
            : change(next, [NOTES], row.standing.kind === 'other-major' ? [NOTES_2] : [])
        await t.push(frame)
        const answer = await t.client.ping({})
        if (row.pinned) {
          expect(answer).toEqual({ outcome: 'unavailable' })
          expect(t.fake.calls).toEqual([])
          expect(t.connection.availability.standing(NOTES)).toEqual({ kind: 'absent' })
        } else {
          expect(t.fake.calls.map(call => call.operation)).toEqual(['ping'])
          expect(t.connection.availability.standing(NOTES)).toEqual({ kind: 'open' })
        }
      })
    })
  }

  it('a client asked for before its protocol client is on the tree is the same one afterwards', async () => {
    const root = new Context()
    roots.push(root)
    const fake = fakeTransport()
    await root.plugin(DynamisService)
    await root.plugin(connectionPlugin({ transport: fake.transport, login: signedOut }))
    const early = root.get('connection')!.client(notesProtocol)
    expect(await early.ping({})).toEqual({ outcome: 'unavailable' })
    await root.plugin(defineProtocolClient(notesProtocol))
    fake.push(snapshot(1, [ACCESS, NOTES]))
    await settle()
    expect(root.get('connection')!.client(notesProtocol)).toBe(early)
    await early.ping({})
    expect(fake.calls.map(call => call.operation)).toEqual(['ping'])
  })
})
