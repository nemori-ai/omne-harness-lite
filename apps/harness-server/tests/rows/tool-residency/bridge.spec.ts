import { afterEach, describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { encodeResidentKey } from '@omne-harness/tool-contract'
import {
  residentKeyRoundTripConformance,
  toolResidencyReaderConformance,
} from '@omne-harness/tool-cordis-contract/testing'
import { assembly, emptyPage, key, shape, tenantA, tenantB } from './support.ts'

const live: Awaited<ReturnType<typeof assembly>>[] = []
afterEach(async () => {
  for (const app of live.splice(0).reverse()) await app.dispose()
})
async function start(pageSize = 1) {
  const app = await assembly(pageSize)
  live.push(app)
  return app
}

describe('the real tool-residency bridge with Session memory transactions', () => {
  for (const scenario of toolResidencyReaderConformance())
    it(scenario.name, async () => {
      const app = await start()
      const at = key()
      await app.write({ tenant: tenantA(), key: at, shape: shape() })
      await app.write({ tenant: tenantB(), key: at, shape: shape() })
      await app.write({ tenant: tenantA(), key: at, shape: shape() })
      // Three holders at page size 1: a first page that is complete would leave the paging cases vacuous.
      expect(await app.reader.referencing({ scope: 'system', key: at, after: null })).toMatchObject(
        {
          ok: { items: [expect.anything()], next: expect.any(String) },
        },
      )
      await expect(
        scenario.run({
          reader: app.reader,
          key: at,
          references: [
            { holder: 'holder-0', tenant: tenantA(), shape: shape() },
            { holder: 'holder-0', tenant: tenantB(), shape: shape() },
            { holder: 'holder-1', tenant: tenantA(), shape: shape() },
          ],
          interrupt: () =>
            app.setRead(async () =>
              fail({ kind: 'unavailable', owner: 'test', diagnostic: 'source-secret' }),
            ),
        }),
      ).resolves.toBeUndefined()
    })

  for (const scenario of residentKeyRoundTripConformance())
    it(scenario.name, async () => {
      const app = await start()
      await expect(scenario.run(app)).resolves.toBeUndefined()
      // Whatever the case wrote, the bridge still reads a fresh holder back with its tenant and shape.
      const probe = key('probe_tool')
      await app.write({ tenant: tenantA(), key: probe, shape: shape('probe_tool') })
      expect(
        await app.reader.referencing({ scope: 'system', key: probe, after: null }),
      ).toMatchObject({
        ok: { items: [{ tenant: tenantA(), shape: shape('probe_tool') }], next: null },
      })
    })

  it('uses the maintainer face, the original entry principal, system scope, codec key, cursor and limit', async () => {
    const app = await start(7)
    app.setRead(async () => succeed(emptyPage()))
    const encoded = encodeResidentKey(key())
    if ('failure' in encoded) throw new Error('invalid fixture key')
    expect(
      await app.reader.referencing({ scope: 'system', key: key(), after: 'opaque-cursor' }),
    ).toEqual(succeed({ items: [], next: null }))
    expect(app.inputs).toEqual([
      {
        principal: app.principal,
        scope: 'system',
        key: encoded.ok,
        after: 'opaque-cursor',
        limit: 7,
      },
    ])
    expect(app.inputs[0]?.principal).toBe(app.principal)
  })

  it('closes failed and throwing reads without exposing source diagnostics or principal', async () => {
    const app = await start()
    for (const mode of ['failure', 'throw'] as const) {
      app.setRead(async () => {
        if (mode === 'throw') throw new Error('source-secret')
        return fail({ kind: 'unavailable', owner: 'source-secret', diagnostic: 'source-secret' })
      })
      const result = await app.reader.referencing({ scope: 'system', key: key(), after: null })
      expect(result).toMatchObject({ failure: { kind: 'unavailable' } })
      expect(JSON.stringify(result)).not.toMatch(/source-secret|toolResidencyPrincipal|component/u)
    }
    const session = app.root.reflect.get('session')
    if (session === undefined) throw new Error('missing test session')
    Object.defineProperty(session, 'reconciliation', {
      configurable: true,
      get() {
        throw new Error('source-secret')
      },
    })
    const thrown = await app.reader.referencing({ scope: 'system', key: key(), after: null })
    expect(thrown).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'tool-residency: read failed' },
    })
    Reflect.deleteProperty(session, 'reconciliation')
    app.setRead(async () => succeed(emptyPage()))
    expect(await app.reader.referencing({ scope: 'system', key: key(), after: null })).toEqual(
      succeed({ items: [], next: null }),
    )
  })
})
