import { describe, expect, it } from 'vitest'
import type { AdmitInput, TenantId } from '@omne-harness/canvas-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { Holder } from '@omne-harness/media-contract'
import { referenceText } from '@omne-harness/media-protocol'
import { fail, succeed } from '@omne-harness/operation-result'
import { testingTenant } from '@omne-harness/session-contract/testing'
import { rowDeclarationOf } from '../../../src/row.ts'
import {
  mediaCanvasRow,
  mediaObjectKind,
  type MediaCustody,
} from '../../../src/rows/media-canvas/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'

const legal = testingTenant('org_cmed0000000000000000000000', 'acc_cmed0000000000000000000000')
const encoded = tenantCodec.encode(legal)
if (!encoded.ok) throw new Error('the testing tenant does not encode')
const TENANT = encoded.value as TenantId

const REF = {
  storage: 'local',
  key: 'a'.repeat(32),
  mediaType: 'image/png',
  bytes: '2048',
  digest: `sha256:${'b'.repeat(64)}`,
}
const input = (ref = referenceText(REF), holder = 'canvas/t/main/media.object/x'): AdmitInput => ({
  tenant: TENANT,
  subject: { principal: 'p' },
  ref,
  holder,
})

type Hold = Parameters<MediaCustody['hold']>[0]
type Answer = Awaited<ReturnType<MediaCustody['hold']>>

/** A custody that answers each hold with the given answer and keeps what it was asked. */
function custody(answer: () => Answer) {
  const asked: Hold[] = []
  const face: MediaCustody = {
    async hold(request) {
      asked.push(request)
      return answer()
    },
  }
  return { face, asked }
}
const HELD: Answer = succeed({ facts: {} as never })

describe('the media-canvas row', () => {
  it('needs the registry and the canvas, takes media at every admit, and provides nothing', () => {
    const declared = rowDeclarationOf(mediaCanvasRow)
    expect(declared).toMatchObject({
      row: 'media-canvas',
      implementation: 'real',
      lifecycle: { kind: 'none' },
      manifest: { provides: [], injects: ['dynamis', 'canvas'] },
    })
    expect(rowManifests.get(declared!.row)).toMatchObject({
      provides: [],
      injects: ['s0.dynamis', 's0.canvas'],
    })
  })
})

describe('the kind media.object', () => {
  it('tells how its reference is written: the five fields of a content reference, in their order', () => {
    const kind = mediaObjectKind(() => undefined)
    expect(kind.name).toBe('media.object')
    const named = ['storage', 'key', 'mediaType', 'bytes', 'digest'].map(field =>
      kind.reference.indexOf(field),
    )
    expect(named.every(at => at >= 0)).toBe(true)
    expect([...named].sort((a, b) => a - b)).toEqual(named)
    expect(typeof kind.admit).toBe('function')
  })

  it("holds the object for the tenant that acts, with the canvas's holder, and then admits", async () => {
    const { face, asked } = custody(() => HELD)
    const kind = mediaObjectKind(() => face)
    expect(await kind.admit!(input())).toEqual({ kind: 'admitted' })
    expect(asked).toHaveLength(1)
    const [hold] = asked
    expect(tenantCodec.encode(hold!.tenant)).toEqual({ ok: true, value: TENANT })
    expect(hold!.ref).toEqual(REF)
    expect(hold!.holder).toEqual({
      owner: 'canvas',
      work: 'canvas/t/main/media.object/x',
      position: referenceText(REF),
      purpose: 'placement',
    } satisfies Holder)
  })

  it('asks with the same holder when the canvas asks again for the same reference', async () => {
    const { face, asked } = custody(() => HELD)
    const kind = mediaObjectKind(() => face)
    await kind.admit!(input())
    await kind.admit!(input())
    expect(asked[1]).toEqual(asked[0])
  })

  it.each([
    ['not JSON', 'not a reference'],
    ['written with spaces', JSON.stringify(REF, null, 1)],
    [
      'its fields in another order',
      JSON.stringify(Object.fromEntries(Object.entries(REF).reverse())),
    ],
    ['a field too many', JSON.stringify({ ...REF, more: 'x' })],
  ])('refuses a reference %s and does not ask media', async (_name, text) => {
    const { face, asked } = custody(() => HELD)
    expect(await mediaObjectKind(() => face).admit!(input(text))).toEqual({ kind: 'refused' })
    expect(asked).toEqual([])
  })

  it('refuses a reference media does not take (absent, of another tenant or being deleted) with the same answer', async () => {
    const { face } = custody(() => fail({ kind: 'invalid-reference' }))
    const kind = mediaObjectKind(() => face)
    const unreadable = await kind.admit!(input('not a reference'))
    expect(await kind.admit!(input())).toEqual(unreadable)
  })

  it('answers basis-unavailable when media is not there, or its custody cannot be reached', async () => {
    expect(await mediaObjectKind(() => undefined).admit!(input())).toEqual({
      kind: 'basis-unavailable',
    })
    const { face } = custody(() => fail({ kind: 'unavailable', dependency: 'index' }))
    expect(await mediaObjectKind(() => face).admit!(input())).toEqual({
      kind: 'basis-unavailable',
    })
  })

  it('answers unknown when the outcome of the hold is not known', async () => {
    const { face } = custody(() => fail({ kind: 'outcome-unknown' }))
    expect(await mediaObjectKind(() => face).admit!(input())).toEqual({ kind: 'unknown' })
  })

  it('lets a hold that throws throw: the canvas answers basis-unavailable for it', async () => {
    const face: MediaCustody = {
      hold: () => Promise.reject(new Error('custody broke')),
    }
    await expect(mediaObjectKind(() => face).admit!(input())).rejects.toThrow('custody broke')
  })
})
