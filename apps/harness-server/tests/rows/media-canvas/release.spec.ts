// @module-tag slow
import { describe, expect, it } from 'vitest'
import { holderOf, type CanvasId, type TenantId } from '@omne-harness/canvas-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { referenceText } from '@omne-harness/media-protocol'
import { mediaObjectKind } from '../../../src/rows/media-canvas/index.ts'
import { sessionKind } from '../../../src/rows/session-canvas/index.ts'
import { savedTenant } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { canvasCall, kindsOf, type CanvasReply } from '../canvas/support.ts'
import { MEDIA_ROWS } from '../media-access/support.ts'
import { faultyMediaKind, holdsOf, picture, stateOf, stranger } from './support.ts'

const MEDIA = 'media.object'
const NOT_ADMITTED = { outcome: 'conflict', body: { reason: 'not-admitted' } }
const media = (ref: string) => ({ kind: MEDIA, ref })
const REFERENCE = mediaObjectKind(() => undefined).reference

/** The canvas of a client state: its revision, and its items and the items taken away. */
async function canvasOf(port: number, home: string) {
  const look = await canvasCall(port, home, 'look', { canvas: 'main' })
  const away = await canvasCall(port, home, 'look-away', { canvas: 'main', limit: 50 })
  return { revision: look.body['revision'], items: look.body['items'], away: away.body['items'] }
}

const placeAs = (tree: ReleaseTree, home: string, ref: string, at = { x: 0, y: 0 }) =>
  canvasCall(tree.port, home, 'place', { canvas: 'main', reference: media(ref), at })

/** Three references media does not take for this tenant: unreadable, absent, another tenant's. */
async function refusals(tree: ReleaseTree, foreign: string): Promise<CanvasReply[]> {
  const before = await canvasOf(tree.port, tree.home)
  const absent = referenceText({
    storage: 'local',
    key: 'z'.repeat(32),
    mediaType: 'image/png',
    bytes: '64',
    digest: `sha256:${'0'.repeat(64)}`,
  })
  const replies: CanvasReply[] = []
  for (const ref of ['not a reference', absent, foreign])
    replies.push(await placeAs(tree, tree.home, ref, { x: 800, y: 800 }))
  expect(await canvasOf(tree.port, tree.home)).toEqual(before)
  return replies
}

async function placesAndHolds(tree: ReleaseTree) {
  const { port, home, storageRoot } = tree
  const owned = await picture(port, home, 6)
  expect([await stateOf(port, home, owned.ref), holdsOf(storageRoot, owned.ref.key)]).toEqual([
    'staged',
    [],
  ])
  const placed = await placeAs(tree, home, owned.text)
  expect(placed.outcome).toBe('succeeded')
  const item = placed.body['item'].id as string
  const holder = {
    owner: 'canvas',
    work: holderOf(savedTenant(home) as TenantId, 'main' as CanvasId, media(owned.text)),
    position: owned.text,
    purpose: 'placement',
  }
  expect([await stateOf(port, home, owned.ref), holdsOf(storageRoot, owned.ref.key)]).toEqual([
    'held',
    [holder],
  ])
  const again = await placeAs(tree, home, owned.text, { x: 400, y: 400 })
  expect([again.outcome, again.body['item'].id]).toEqual(['no-change', item])
  const taken = await canvasCall(port, home, 'take', { canvas: 'main', items: [item] })
  expect(taken.outcome).toBe('succeeded')
  expect(holdsOf(storageRoot, owned.ref.key)).toEqual([holder])
  const back = await placeAs(tree, home, owned.text)
  expect([back.outcome, back.body['item'].id, back.body['item'].state]).toEqual([
    'succeeded',
    item,
    'on',
  ])
  expect([await stateOf(port, home, owned.ref), holdsOf(storageRoot, owned.ref.key)]).toEqual([
    'held',
    [holder],
  ])
}

/** The JSON the Canvas tool answered `kinds` with in a session of the tree. */
async function toolKinds(tree: ReleaseTree): Promise<unknown> {
  const session = await tree.startSession('canvas: kinds')
  const entries = await pollUntil(
    'the Run to end',
    () => historyOf(tree, session),
    found => found.some(entry => entry.kind === 'run.terminal'),
  )
  const said = toolResults(entries).find(text => text.startsWith('done Canvas kinds'))
  expect(said).toBeDefined()
  return JSON.parse(said!.slice(said!.indexOf('\n') + 1))
}

const KINDS_CALL = {
  id: 'call_kinds',
  tool: 'Canvas',
  arguments: '{"command":"kinds","params":{}}',
}

describe('the media-canvas row on the release tree', () => {
  it(
    'holds before it puts on, once per reference, keeps the hold when taken away, and refuses alike what it cannot hold (ME-4, CV-13)',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const script = toolCallsThenText(body => (body.includes('canvas: kinds') ? [KINDS_CALL] : []))
      const exitCode = await onReleaseTree({ script }, async tree => {
        expect(await kindsOf(tree.port, tree.home)).toEqual({
          'canvas.app': expect.any(String),
          'session.session': sessionKind.reference,
          [MEDIA]: REFERENCE,
        })
        expect(await toolKinds(tree)).toEqual({
          kinds: expect.arrayContaining([
            expect.objectContaining({ name: 'canvas.app' }),
            expect.objectContaining({ name: 'session.session', ref: sessionKind.reference }),
            expect.objectContaining({ name: MEDIA, ref: REFERENCE }),
          ]),
        })
        await placesAndHolds(tree)

        const gina = await stranger(tree)
        const theirs = await picture(tree.port, gina, 7)
        const replies = await refusals(tree, theirs.text)
        for (const reply of replies) expect(reply).toMatchObject(NOT_ADMITTED)
        expect(new Set(replies.map(reply => reply.text)).size).toBe(1)
        expect([
          await stateOf(tree.port, gina, theirs.ref),
          holdsOf(tree.storageRoot, theirs.ref.key),
        ]).toEqual(['staged', []])
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'answers basis-unavailable without media, and still refuses a reference it cannot read',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = { script: toolCallsThenText(() => []), withoutRows: MEDIA_ROWS }
      const exitCode = await onReleaseTree(options, async tree => {
        expect(Object.keys(await kindsOf(tree.port, tree.home))).toContain(MEDIA)
        const readable = referenceText({
          storage: 'local',
          key: 'a'.repeat(32),
          mediaType: 'image/png',
          bytes: '64',
          digest: `sha256:${'0'.repeat(64)}`,
        })
        const missing = await placeAs(tree, tree.home, readable)
        expect([missing.outcome, missing.body]).toEqual(['basis-unavailable', {}])
        expect(await placeAs(tree, tree.home, 'not a reference')).toMatchObject(NOT_ADMITTED)
        expect(await canvasOf(tree.port, tree.home)).toEqual({ revision: 0, items: [], away: [] })
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'holds as the tenant that places and no other, and leaves no record when the hold throws or its outcome is unknown',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = { script: toolCallsThenText(() => []), withoutRows: ['media-canvas'] }
      const exitCode = await onReleaseTree(options, async tree => {
        const { seen, plugin } = faultyMediaKind()
        const fiber = tree.scope.plugin(plugin)
        await fiber.await()
        const owned = await picture(tree.port, tree.home, 6)
        expect((await placeAs(tree, tree.home, owned.text)).outcome).toBe('succeeded')
        const gina = await stranger(tree)
        expect(await placeAs(tree, gina, owned.text)).toMatchObject(NOT_ADMITTED)
        const tenants = [tree.home, gina].map(home => savedTenant(home))
        expect(seen.admits.map(admit => admit.tenant)).toEqual(tenants)
        expect(seen.holds.map(hold => tenantCodec.encode(hold.tenant))).toEqual(
          tenants.map(value => ({ ok: true, value })),
        )
        expect(seen.admits[0]!.subject).not.toEqual(seen.admits[1]!.subject)
        expect(holdsOf(tree.storageRoot, owned.ref.key)).toHaveLength(1)

        const before = await canvasOf(tree.port, tree.home)
        const other = await picture(tree.port, tree.home, 8)
        for (const [fault, outcome] of [
          ['throw', 'basis-unavailable'],
          ['unknown', 'unknown'],
        ] as const) {
          seen.fault = fault
          expect([fault, (await placeAs(tree, tree.home, other.text)).outcome]).toEqual([
            fault,
            outcome,
          ])
        }
        expect(await canvasOf(tree.port, tree.home)).toEqual(before)
        await fiber.dispose()
      })
      expect(exitCode).toBe(0)
    },
  )
})
