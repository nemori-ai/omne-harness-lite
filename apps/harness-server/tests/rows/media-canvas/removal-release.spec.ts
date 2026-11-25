// @module-tag slow
import { describe, expect, it } from 'vitest'
import {
  onReleaseTree,
  onReleaseTreeRuns,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { canvasCall, kindsOf } from '../canvas/support.ts'
import { faultyMediaKind, holdsOf, picture, type Uploaded } from './support.ts'

const UNDECLARED = { outcome: 'conflict', body: { reason: 'kind-undeclared' } }
const media = (ref: string) => ({ kind: 'media.object', ref })
const SESSION = { kind: 'session.session', ref: 'ses-on-the-sheet' }

function on(tree: ReleaseTree) {
  const call = (operation: string, body: Record<string, unknown>) =>
    canvasCall(tree.port, tree.home, operation, { canvas: 'main', ...body })
  return {
    call,
    place: (reference: object, at = { x: 0, y: 0 }) => call('place', { reference, at }),
    items: async () => (await call('look', {})).body['items'] as Record<string, any>[],
  }
}

/** Every write of the canvas on what is already there, each answered as it is with the row. */
async function everyOperation(tree: ReleaseTree, item: string, session: string) {
  const { call } = on(tree)
  for (const [operation, body] of [
    ['arrange', { items: [{ item, at: { x: 1600, y: 1600 } }] }],
    ['pile', { pile: 'p1', items: [item, session] }],
    ['arrange', { piles: [{ pile: 'p1', name: '留着' }] }],
    ['scatter', { pile: 'p1' }],
    ['lock', { items: [item], locked: true }],
    ['lock', { items: [item], locked: false }],
    ['take', { items: [item] }],
  ] as const)
    expect([operation, (await call(operation, body)).outcome]).toEqual([operation, 'succeeded'])
  const away = await call('look-away', { limit: 10 })
  expect(away.body['items'].map((each: { id: string }) => each.id)).toEqual([item])
}

describe('the release without the media-canvas row (C17, CV-05)', () => {
  it(
    'keeps the canvas whole: what was placed stays readable, and media can no longer be placed',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      let owned: Uploaded | undefined
      let later: Uploaded | undefined
      const exitCodes = await onReleaseTreeRuns(
        {
          script: toolCallsThenText(() => []),
          withoutRows: run => (run === 0 ? [] : ['media-canvas']),
        },
        [
          async tree => {
            owned = await picture(tree.port, tree.home, 6)
            later = await picture(tree.port, tree.home, 7)
            expect((await on(tree).place(media(owned.text))).outcome).toBe('succeeded')
            expect((await on(tree).place(SESSION, { x: 400, y: 0 })).outcome).toBe('succeeded')
          },
          async tree => {
            const sheet = on(tree)
            expect(Object.keys(await kindsOf(tree.port, tree.home)).sort()).toEqual([
              'canvas.app',
              'session.session',
            ])
            const [item, session] = await sheet.items()
            expect([item?.['reference'], item?.['state']]).toEqual([media(owned!.text), 'on'])
            expect(session?.['reference']).toEqual(SESSION)
            expect(await sheet.place(media(later!.text), { x: 800, y: 0 })).toMatchObject(
              UNDECLARED,
            )
            await everyOperation(tree, item!['id'], session!['id'])
            expect(await sheet.place(media(owned!.text))).toMatchObject(UNDECLARED)
            expect(holdsOf(tree.storageRoot, owned!.ref.key)).toHaveLength(1)
            for (const reference of [
              { kind: 'session.session', ref: 'ses-another' },
              { kind: 'canvas.app', ref: 'clock' },
            ])
              expect((await sheet.place(reference, { x: 1200, y: 0 })).outcome).toBe('succeeded')
            const placed = (await sheet.items()).map(each => JSON.stringify(each['reference']))
            expect(placed.sort()).toEqual(
              [
                SESSION,
                { kind: 'canvas.app', ref: 'clock' },
                { kind: 'session.session', ref: 'ses-another' },
              ]
                .map(each => JSON.stringify(each))
                .sort(),
            )
          },
        ],
      )
      expect(exitCodes).toEqual([0, 0])
    },
  )

  it(
    'withdrawn while running: the admit in flight ends before the kind goes, its place finds the kind withdrawn; after, the kind is undeclared and what was placed stays',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = { script: toolCallsThenText(() => []), withoutRows: ['media-canvas'] }
      const exitCode = await onReleaseTree(options, async tree => {
        const sheet = on(tree)
        const { seen, plugin } = faultyMediaKind()
        const fiber = tree.scope.plugin(plugin)
        await fiber.await()
        const [first, second, third] = [
          await picture(tree.port, tree.home, 6),
          await picture(tree.port, tree.home, 7),
          await picture(tree.port, tree.home, 8),
        ]
        expect((await sheet.place(media(first!.text))).outcome).toBe('succeeded')

        seen.fault = 'gate'
        const settled: string[] = []
        const placing = sheet.place(media(second!.text), { x: 400, y: 0 })
        void placing.then(() => settled.push('place'))
        await seen.entered.promise
        const disposing = fiber.dispose()
        void Promise.resolve(disposing).then(() => settled.push('withdrawn'))
        expect(await sheet.place(media(third!.text), { x: 800, y: 0 })).toMatchObject(UNDECLARED)
        await new Promise(resolve => setTimeout(resolve, 400))
        expect(settled).toEqual([])

        seen.gate.resolve()
        // Media held it and the commit found the kind withdrawn: a hold with no record (canvas SPEC, 不能声称的).
        expect(await placing).toMatchObject(UNDECLARED)
        await disposing
        expect(settled.sort()).toEqual(['place', 'withdrawn'])
        expect(holdsOf(tree.storageRoot, second!.ref.key)).toHaveLength(1)
        expect(Object.keys(await kindsOf(tree.port, tree.home))).not.toContain('media.object')
        expect(await sheet.place(media(third!.text), { x: 800, y: 0 })).toMatchObject(UNDECLARED)
        expect((await sheet.items()).map(each => each['reference'])).toEqual([media(first!.text)])
      })
      expect(exitCode).toBe(0)
    },
  )
})
