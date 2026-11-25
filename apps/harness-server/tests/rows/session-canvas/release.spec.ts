import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { sessionCanvasRow, sessionKind } from '../../../src/rows/session-canvas/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { onReleaseTree, toolCallsThenText } from '../../support/release-tree.ts'
import { canvasCall, kindsOf } from '../canvas/support.ts'

describe('the session-canvas row', () => {
  it('needs the registry and the canvas and provides nothing, as the stub table says', () => {
    const declared = rowDeclarationOf(sessionCanvasRow)
    expect(declared).toMatchObject({
      row: 'session-canvas',
      implementation: 'real',
      lifecycle: { kind: 'none' },
      manifest: { provides: [], injects: ['dynamis', 'canvas'] },
    })
    expect(rowManifests.get(declared!.row)).toMatchObject({
      provides: [],
      injects: ['s0.dynamis', 's0.canvas'],
    })
  })

  it('declares session.session with no admit: a session has nothing to hold first', () => {
    expect(sessionKind).toEqual({
      name: 'session.session',
      label: '会话',
      summary: expect.any(String),
      reference: '标识就是会话标识。',
    })
  })

  it(
    'lists session.session on the release tree and puts a session on the sheet without asking whether it is there',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script: toolCallsThenText(() => []) },
        async ({ port, home, startSession }) => {
          expect(await kindsOf(port, home)).toMatchObject({
            'canvas.app': expect.any(String),
            'session.session': '标识就是会话标识。',
          })
          const session = await startSession('hello')
          for (const [ref, at] of [
            [session, { x: 0, y: 0 }],
            ['a session that never was', { x: 400, y: 0 }],
          ] as const) {
            const reference = { kind: 'session.session', ref }
            const placed = await canvasCall(port, home, 'place', {
              canvas: 'main',
              reference,
              at,
            })
            expect([placed.outcome, placed.body['item']?.reference]).toEqual([
              'succeeded',
              reference,
            ])
          }
          const look = await canvasCall(port, home, 'look', { canvas: 'main' })
          expect(look.body['items'].map((item: { reference: unknown }) => item.reference)).toEqual([
            { kind: 'session.session', ref: session },
            { kind: 'session.session', ref: 'a session that never was' },
          ])
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
