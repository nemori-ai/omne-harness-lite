import { describe, expect, it } from 'vitest'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { rowDeclarationOf } from '../../../src/row.ts'
import { createCanvasAuthority } from '../../../src/rows/canvas/authority.ts'
import { canvasCombination, canvasConfig, canvasRow } from '../../../src/rows/canvas/index.ts'
import { canvasMovers } from '../../../src/rows/canvas/movers.ts'
import { productionStorageCatalog } from '../../../src/rows/storage/production-catalog.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { CANVAS_POLICY } from '../../r9/support.ts'

describe('the canvas row', () => {
  it('provides the canvas and needs the storage, the registry and the tenant domains, as the stub table says', () => {
    const declared = rowDeclarationOf(canvasRow)
    expect(declared).toMatchObject({
      row: 'canvas',
      implementation: 'real',
      lifecycle: { kind: 'body', phase: 'composition' },
      manifest: {
        provides: ['canvas'],
        injects: ['storage', 'dynamis', 'tenantDomainLookup'],
      },
    })
    expect(rowManifests.get(declared!.row)).toMatchObject({
      provides: ['s0.canvas'],
      injects: ['s0.storage', 's0.dynamis', 's0.tenantDomainLookup'],
    })
  })

  it('takes one whole policy and nothing else', () => {
    expect(canvasConfig.parse({ policy: CANVAS_POLICY }).policy).toEqual(CANVAS_POLICY)
    expect(canvasConfig.safeParse({ policy: CANVAS_POLICY, more: 1 }).success).toBe(false)
  })

  it.each([
    ['no policy at all', {}, 'policy'],
    [
      'a policy without its sheet',
      { policy: { ...CANVAS_POLICY, sheet: undefined } },
      'policy.sheet',
    ],
    [
      'a footprint outside the sizes',
      { policy: { ...CANVAS_POLICY, footprint: { width: 1000, height: 80 } } },
      'policy.footprint',
    ],
  ])('refuses %s and names where', (_name, config, path) => {
    const parsed = canvasConfig.safeParse(config)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map(issue => issue.path.join('.'))).toContain(path)
  })

  it('registers its storage combination from the catalogue of the running code', async () => {
    const catalog = await productionStorageCatalog()
    const manifest = combinationManifest({ catalog, participants: ['canvas.persistence'] })
    if (manifest.kind !== 'manifest') throw new Error('the catalogue lacks the participant')
    const digest = manifestDigest(manifest.manifest)
    expect(await canvasCombination()).toEqual({
      combinationVersion: `harness-canvas/${digest.slice(0, 16)}`,
      manifestDigest: digest,
    })
  })
})

describe('who changes the canvas', () => {
  const origin = { actorRef: 'principal/p', session: 's-1', call: 'c-1' }
  const unread = () => {
    throw new Error('not to be read')
  }

  it('is the person for a call that carries no tool call', async () => {
    const port = canvasMovers(unread)
    expect(await port.moverOf({ tenant: 't1', subject: null } as never)).toEqual({ kind: 'human' })
  })

  it('is the agent of the session its live tool call runs in, read by tenant and call', async () => {
    const asked: [string, string][] = []
    const port = canvasMovers((tenant, call) => {
      asked.push([tenant, call])
      return origin
    })
    expect(await port.moverOf({ tenant: 't1', subject: null, call: 'c-1' } as never)).toEqual({
      kind: 'agent',
      session: 's-1',
    })
    expect(asked).toEqual([['t1', 'c-1']])
  })

  it('cannot be told for a tool call that is not live', async () => {
    const port = canvasMovers(() => undefined)
    expect(await port.moverOf({ tenant: 't1', subject: null, call: 'c-1' } as never)).toBeNull()
  })
})

describe('who may read and change the canvas', () => {
  it('is whoever the trusted adapter says acts for the tenant', async () => {
    const authority = createCanvasAuthority()
    const ctx = { tenant: 't1', subject: { principal: 'p' } } as never
    expect(await authority.decide(ctx, 'read')).toBe('allowed')
    expect(await authority.decide(ctx, 'change')).toBe('allowed')
  })
})
