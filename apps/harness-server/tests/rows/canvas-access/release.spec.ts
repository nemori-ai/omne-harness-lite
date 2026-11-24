import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { AdmitInput, KindDeclaration, KindName } from '@omne-harness/canvas-contract'
import { canvasKey, putKind } from '@omne-harness/canvas-cordis-contract/cordis'
import { dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import { describe, expect, it } from 'vitest'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { canvasAccessRow } from '../../../src/rows/canvas-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { CANVAS_POLICY, runOmne, savedLoginProof, savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import {
  onReleaseTreeRuns,
  toolCallsThenText,
  type AddedRow,
  type ReleaseTree,
} from '../../support/release-tree.ts'

type Reply = Readonly<{ status: number; text: string; outcome: string; body: Record<string, any> }>
type Watch = Readonly<{ frames: unknown[]; refused: () => Reply | undefined; close(): void }>
type Client = Readonly<{
  tenant: string
  /** One call of `canvas/v1/<operation>` (or of another protocol by its path) as the given tenant. */
  call(path: string, body: Record<string, unknown>, tenant?: string): Promise<Reply>
  /** Opens observe-changes on the given tenant and keeps the frames it gives. */
  observe(tenant?: string): Watch
}>

const url = (port: number, path: string) =>
  `http://127.0.0.1:${String(port)}/api/${path.includes('/') ? path : `canvas/v1/${path}`}`

async function replyOf(response: Response): Promise<Reply> {
  const text = await response.text()
  const json = JSON.parse(text) as { outcome: string; body?: Record<string, any> }
  return { status: response.status, text, outcome: json.outcome, body: json.body ?? {} }
}

/** Reads server-sent frames off a response until it ends or is aborted. */
async function pump(response: Response, frames: unknown[]): Promise<void> {
  const reader = response.body?.getReader()
  if (reader === undefined) return
  const decoder = new TextDecoder()
  let buffered = ''
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) return
    buffered += decoder.decode(chunk.value, { stream: true })
    for (let end = buffered.indexOf('\n\n'); end !== -1; end = buffered.indexOf('\n\n')) {
      const block = buffered.slice(0, end)
      buffered = buffered.slice(end + 2)
      if (!block.startsWith('data: ')) continue
      const event = JSON.parse(block.slice('data: '.length)) as { kind: string; frame?: unknown }
      if (event.kind === 'frame') frames.push(event.frame)
    }
  }
}

function clientOf(port: number, home: string): Client {
  const tenant = savedTenant(home)
  const request = (body: Record<string, unknown>, signal?: AbortSignal) => ({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${savedLoginProof(home)}`,
      'omne-message-id': 'm-canvas',
    },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  })
  return {
    tenant,
    async call(path, body, as = tenant) {
      return replyOf(await fetch(url(port, path), request({ tenant: as, ...body })))
    },
    observe(as = tenant) {
      const frames: unknown[] = []
      let refused: Reply | undefined
      const controller = new AbortController()
      void fetch(url(port, 'observe-changes'), request({ tenant: as }, controller.signal))
        .then(async response => {
          if (response.headers.get('content-type')?.includes('text/event-stream') === true)
            return pump(response, frames)
          refused = await replyOf(response)
        })
        .catch(() => {})
      return { frames, refused: () => refused, close: () => controller.abort() }
    },
  }
}

/** A second account on its own client state, registered and logged in against the same server. */
async function stranger(tree: ReleaseTree): Promise<Client> {
  const base = dirname(tree.home)
  const home = join(base, 'gina')
  const credential = 'gina-pw-canvas-release-4c2e'
  for (const command of ['register', 'login'])
    expect(
      (
        await runOmne({
          args: [command, '--login-identifier', 'gina'],
          home,
          server: `http://127.0.0.1:${String(tree.port)}`,
          cwd: base,
          credential,
        })
      ).status,
    ).toBe(0)
  return clientOf(tree.port, home)
}

const admitted: AdmitInput[] = []
const probe = (name: string, admit?: KindDeclaration['admit']): KindDeclaration => ({
  name: name as KindName,
  label: name,
  summary: `${name}, declared by a test`,
  reference: 'any text',
  ...(admit === undefined ? {} : { admit }),
})
const NOTE = probe('probe.note')
const HELD = probe('probe.held', async input => {
  admitted.push(input)
  return { kind: 'admitted' }
})

/** Two kinds only this test declares on canvas.kinds: one without admit, one whose owner accepts. */
const PROBE_KINDS: AddedRow = {
  id: 'canvas-probe-kinds',
  plugin: 'canvasProbeKindsRow',
  config: {},
  definition: defineRow({
    row: 'canvas-probe-kinds',
    implementation: 'real',
    manifest: { provides: [], injects: [dynamisKey, canvasKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'canvas-probe-kinds',
      inject: [dynamisKey, canvasKey],
      apply(ctx: Context) {
        putKind(ctx, NOTE)
        putKind(ctx, HELD)
      },
    },
  }),
}

const EMPTY = { sheet: CANVAS_POLICY.sheet, items: [], piles: [], revision: 0 }
const HUMAN = { kind: 'human' }
const OPERATIONS = [
  'look',
  'look-away',
  'kinds',
  'place',
  'arrange',
  'take',
  'pile',
  'scatter',
  'lock',
]
const BODIES: Record<string, Record<string, unknown>> = {
  look: { canvas: 'main' },
  'look-away': { canvas: 'main', limit: 10 },
  kinds: {},
  place: { canvas: 'main', reference: { kind: 'probe.note', ref: 'n1' } },
  arrange: { canvas: 'main', items: [{ item: 'i1', top: true }] },
  take: { canvas: 'main', items: ['i1'] },
  pile: { canvas: 'main', pile: 'p1', items: ['i1'] },
  scatter: { canvas: 'main', pile: 'p1' },
  lock: { canvas: 'main', items: ['i1'], locked: true },
}

/** Each write that changed the canvas is heard once; one that did not is not heard at all. */
function writer(owner: Client, watching: Watch) {
  return {
    async changed(operation: string, body: Record<string, unknown>) {
      const heard = watching.frames.length
      const reply = await owner.call(operation, { canvas: 'main', ...body })
      expect([operation, reply.status, reply.outcome]).toEqual([operation, 200, 'succeeded'])
      await until(() => watching.frames.length > heard, `a frame after ${operation}`, 10_000)
      expect(watching.frames).toHaveLength(heard + 1)
      return reply
    },
    async unheard(operation: string, body: Record<string, unknown>) {
      const heard = watching.frames.length
      const reply = await owner.call(operation, { canvas: 'main', ...body })
      await new Promise(resolve => setTimeout(resolve, 400))
      expect([operation, watching.frames.length]).toEqual([operation, heard])
      return reply
    },
  }
}

describe('canvas and canvas-access rows', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(canvasAccessRow)
    expect(declared).toMatchObject({
      row: 'canvas-access',
      implementation: 'real',
      lifecycle: { kind: 'none' },
      manifest: { provides: [], injects: ['accessRegistry', 'principalIssuer'] },
    })
    expect(rowManifests.get(declared!.row)?.injects).toEqual([
      's0.accessRegistry',
      's0.principalIssuer',
    ])
  })

  it(
    'let a person do every thing on the canvas through canvas/v1, each change heard by an observer (C5)',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const exitCodes = await onReleaseTreeRuns(
        { script: toolCallsThenText(() => []), addedRows: [PROBE_KINDS] },
        [
          async tree => {
            const owner = clientOf(tree.port, tree.home)
            const watching = owner.observe()
            try {
              await until(() => watching.frames.length >= 1, 'the opening frame', 10_000)
              expect(watching.frames).toEqual([{ kind: 'changed' }])
              const write = writer(owner, watching)

              const note = await write.changed('place', {
                reference: { kind: 'probe.note', ref: 'n1' },
                at: { x: 0, y: 0 },
              })
              expect(note.body).toMatchObject({
                revision: 1,
                item: { id: 'i1', by: HUMAN, rank: 1 },
              })
              expect(admitted).toEqual([])
              const held = await write.changed('place', {
                reference: { kind: 'probe.held', ref: 'h1' },
                at: { x: 400, y: 0 },
              })
              expect(held.body['item']).toMatchObject({
                id: 'i2',
                reference: { kind: 'probe.held', ref: 'h1' },
              })
              expect(admitted).toHaveLength(1)
              expect(admitted[0]).toMatchObject({ tenant: owner.tenant, ref: 'h1' })

              const look = await owner.call('look', { canvas: 'main' })
              expect(look.body['items'].map((item: { id: string }) => item.id)).toEqual([
                'i1',
                'i2',
              ])

              await write.changed('arrange', { items: [{ item: 'i1', at: { x: 80, y: 80 } }] })
              await write.changed('arrange', {
                items: [{ item: 'i1', size: { width: 200, height: 120 } }],
              })
              await write.changed('pile', { pile: 'p1', items: ['i1', 'i2'] })
              await write.changed('arrange', { piles: [{ pile: 'p1', name: '下周' }] })
              const piled = await owner.call('look', { canvas: 'main' })
              expect(piled.body['piles']).toMatchObject([{ id: 'p1', name: '下周', by: HUMAN }])
              await write.changed('scatter', { pile: 'p1' })
              await write.changed('lock', { items: ['i1'], locked: true })

              const moved = await write.unheard('arrange', {
                items: [{ item: 'i1', at: { x: 8, y: 8 } }],
              })
              expect([moved.outcome, moved.body]).toEqual([
                'conflict',
                { reason: 'locked', entry: { item: 'i1' } },
              ])
              await write.changed('lock', { items: ['i1'], locked: false })
              expect((await write.unheard('lock', { items: ['i1'], locked: false })).outcome).toBe(
                'no-change',
              )

              const before = await owner.call('look', { canvas: 'main' })
              const spot = before.body['items'].find((item: { id: string }) => item.id === 'i1').at
              await write.changed('take', { items: ['i1'] })
              const away = await owner.call('look-away', { canvas: 'main', limit: 10 })
              expect(away.body).toMatchObject({
                items: [{ id: 'i1', state: 'off', at: spot, by: HUMAN }],
                next: null,
              })
              const back = await write.changed('place', {
                reference: { kind: 'probe.note', ref: 'n1' },
              })
              expect(back.body['item']).toMatchObject({
                id: 'i1',
                state: 'on',
                at: spot,
                by: HUMAN,
              })

              const said = await write.unheard('arrange', {
                items: [{ item: 'i2', top: true }],
                by: { kind: 'agent', session: 's-1' },
              })
              expect([said.status, said.outcome]).toEqual([400, 'protocol-rejected'])
              const after = await owner.call('look', { canvas: 'main' })
              expect(after.body['revision']).toBe(back.body['revision'])
              for (const item of after.body['items']) expect(item.by).toEqual(HUMAN)
            } finally {
              watching.close()
            }
          },
        ],
      )
      expect(exitCodes).toEqual([0])
    },
  )

  it(
    'keep each tenant to its own canvas, and refuse another tenant on every operation as everything else does (C4)',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const exitCodes = await onReleaseTreeRuns(
        { script: toolCallsThenText(() => []), addedRows: [PROBE_KINDS] },
        [
          async tree => {
            const owner = clientOf(tree.port, tree.home)
            expect(await owner.call('look', { canvas: 'main' })).toMatchObject({
              status: 200,
              outcome: 'succeeded',
              body: EMPTY,
            })
            expect(await owner.call('look', { canvas: 'second' })).toMatchObject({
              outcome: 'invalid',
              body: { reason: 'canvas' },
            })
            const kinds = await owner.call('kinds', {})
            expect(kinds.body['kinds']).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  kind: 'declared',
                  name: 'canvas.app',
                  label: '画布小应用',
                }),
                expect.objectContaining({ kind: 'declared', name: 'probe.note' }),
              ]),
            )

            const other = await stranger(tree)
            expect(other.tenant).not.toBe(owner.tenant)
            const mine = owner.observe()
            const theirs = other.observe()
            try {
              await until(
                () => mine.frames.length >= 1 && theirs.frames.length >= 1,
                'the opening frames',
                10_000,
              )
              expect((await owner.call('place', BODIES['place']!)).outcome).toBe('succeeded')
              await until(() => mine.frames.length >= 2, 'the owner hearing its own place', 10_000)
              expect(await other.call('look', { canvas: 'main' })).toMatchObject({
                outcome: 'succeeded',
                body: EMPTY,
              })
              expect((await other.call('take', { canvas: 'main', items: ['i1'] })).outcome).toBe(
                'not-found',
              )

              const heard = mine.frames.length
              expect((await other.call('place', BODIES['place']!)).outcome).toBe('succeeded')
              await until(
                () => theirs.frames.length >= 2,
                'the stranger hearing its own place',
                10_000,
              )
              await new Promise(resolve => setTimeout(resolve, 400))
              expect(mine.frames).toHaveLength(heard)
            } finally {
              mine.close()
              theirs.close()
            }

            const elsewhere = await other.call('notification/v2/list-sources', {}, owner.tenant)
            expect(elsewhere).toMatchObject({ status: 403, outcome: 'denied', body: {} })
            for (const operation of OPERATIONS) {
              const refused = await other.call(operation, BODIES[operation]!, owner.tenant)
              expect([operation, refused.text]).toEqual([operation, elsewhere.text])
              expect([operation, refused.status]).toEqual([operation, elsewhere.status])
            }
            const watching = other.observe(owner.tenant)
            try {
              await until(
                () => watching.refused() !== undefined,
                'the refusal of the observation',
                10_000,
              )
              expect(watching.refused()).toMatchObject({ status: 403, outcome: 'denied', body: {} })
              expect(watching.refused()?.text).toBe(elsewhere.text)
              expect(watching.frames).toEqual([])
            } finally {
              watching.close()
            }
            const look = await owner.call('look', { canvas: 'main' })
            expect(look.body['items']).toHaveLength(1)
          },
        ],
      )
      expect(exitCodes).toEqual([0])
    },
  )
})
