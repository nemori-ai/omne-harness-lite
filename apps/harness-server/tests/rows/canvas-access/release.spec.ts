import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { canvasAccessRow } from '../../../src/rows/canvas-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { CANVAS_POLICY, runOmne, savedLoginProof, savedTenant } from '../../r9/support.ts'
import {
  onReleaseTreeRuns,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

type Reply = Readonly<{ status: number; text: string; outcome: string; body: Record<string, any> }>
type Client = Readonly<{
  tenant: string
  /** One call of `<protocol>/<operation>` as the given tenant, with the raw text of the reply. */
  call(path: string, body: Record<string, unknown>, tenant?: string): Promise<Reply>
}>

function clientOf(port: number, home: string): Client {
  const tenant = savedTenant(home)
  return {
    tenant,
    async call(path, body, as = tenant) {
      const response = await fetch(`http://127.0.0.1:${String(port)}/api/${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${savedLoginProof(home)}`,
          'omne-message-id': 'm-canvas',
        },
        body: JSON.stringify({ tenant: as, ...body }),
      })
      const text = await response.text()
      const json = JSON.parse(text) as { outcome: string; body?: Record<string, any> }
      return { status: response.status, text, outcome: json.outcome, body: json.body ?? {} }
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

const EMPTY = { sheet: CANVAS_POLICY.sheet, items: [], piles: [], revision: 0 }

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
    'give a tenant its empty canvas and the kinds now declared, and refuse another tenant as everything else does',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const exitCodes = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
        async tree => {
          const owner = clientOf(tree.port, tree.home)
          expect(await owner.call('canvas/v1/look', { canvas: 'main' })).toMatchObject({
            status: 200,
            outcome: 'succeeded',
            body: EMPTY,
          })
          expect(await owner.call('canvas/v1/look', { canvas: 'second' })).toMatchObject({
            outcome: 'invalid',
            body: { reason: 'canvas' },
          })
          const kinds = await owner.call('canvas/v1/kinds', {})
          expect(kinds.outcome).toBe('succeeded')
          expect(kinds.body['kinds']).toContainEqual(
            expect.objectContaining({ kind: 'declared', name: 'canvas.app', label: '画布小应用' }),
          )

          const other = await stranger(tree)
          expect(other.tenant).not.toBe(owner.tenant)
          expect(await other.call('canvas/v1/look', { canvas: 'main' })).toMatchObject({
            outcome: 'succeeded',
            body: EMPTY,
          })
          const refused = await other.call('canvas/v1/look', { canvas: 'main' }, owner.tenant)
          expect(refused).toMatchObject({ status: 403, outcome: 'denied', body: {} })
          const elsewhere = await other.call('notification/v2/list-sources', {}, owner.tenant)
          expect(elsewhere.outcome).toBe('denied')
          expect(refused.text).toBe(elsewhere.text)
          expect((await other.call('canvas/v1/kinds', {}, owner.tenant)).text).toBe(refused.text)
        },
      ])
      expect(exitCodes).toEqual([0])
    },
  )
})
