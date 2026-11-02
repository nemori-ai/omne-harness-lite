// `model-instances` and `model-converters` rows: the two model-host-local directories as rows. Both
// inject an authority that an entry object of the assembly provides. No such entry object is
// registered yet, so the tests supply named stand-ins (support.ts) and also show the row staying
// PENDING without one.
import { describe, expect, it } from 'vitest'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  type ModelHandle,
} from '@omne-harness/model-contract'
import {
  ModelConvertersService,
  ModelInstancesService,
} from '@omne-harness/model-cordis-contract/cordis'
import { rowDeclarationOf } from '../../../src/row.ts'
import { modelConvertersRow } from '../../../src/rows/model-converters/index.ts'
import { modelInstancesRow } from '../../../src/rows/model-instances/index.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import {
  TENANT,
  converterAuthorityEntry,
  publicationAuthorityEntry,
  withLiveRows,
  type Verdict,
} from './support.ts'

function unbox<T>(decoded: { ok: T } | { failure: unknown }): T {
  if ('ok' in decoded) return decoded.ok
  throw new Error('fixture identity')
}

const CALL = unbox(decodeModelCallId('mcall_one'))
const INSTANCE = unbox(decodeModelInstanceId('minst_one'))
const handle: ModelHandle<unknown> = {
  instance: INSTANCE,
  observe: () => (async function* () {})(),
}
const evidence = { owner: 'host', record: 'r', revision: '1', digest: '1'.repeat(64) }
const OBSERVER = { principal: Object.freeze({ subject: 'p' }), tenant: TENANT, call: CALL }

describe('the model-instances row', () => {
  it('declares the formal keys, one inject and no shutdown phase', () => {
    expect(rowDeclarationOf(modelInstancesRow)).toEqual({
      row: 'model-instances',
      implementation: 'real',
      manifest: {
        provides: ['modelInstances'],
        injects: ['modelPublicationAuthority'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })

  it('is ACTIVE with its authority and serves a registered handle until the registration is released', async () => {
    const verdict: { current: Verdict } = { current: { ok: undefined } }
    const { value, run } = await withLiveRows(
      {
        rows: [{ id: 'model-instances', plugin: 'modelInstancesRow' }],
        plugins: { modelInstancesRow },
        entryObjects: [publicationAuthorityEntry(verdict)],
        probe: ['modelInstances'],
      },
      async ctx => {
        const directory = ctx.get('modelInstances') as ModelInstancesService<unknown>
        const registered = await directory.register({
          publication: [
            { tenant: TENANT, call: CALL, instance: INSTANCE, generation: '1' },
            handle,
          ],
          authority: evidence,
        })
        if (!('ok' in registered)) throw new Error(`register failed: ${JSON.stringify(registered)}`)
        const live = await directory.connect(OBSERVER)
        const released = await registered.ok.release()
        const gone = await directory.connect(OBSERVER)
        return { isService: directory instanceof ModelInstancesService, live, released, gone }
      },
    )
    expect(value.isService).toBe(true)
    expect(value.live).toEqual({ ok: { kind: 'live', handle } })
    expect(value.released).toEqual({ removed: true })
    expect(value.gone).toEqual({ ok: { kind: 'no-live-route' } })
    expect(run.state('model-instances')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(run.result.exitCode).toBe(0)
  })

  it('asks the authority before it records a registration', async () => {
    const verdict: { current: Verdict } = { current: { failure: { kind: 'denied' } } }
    const { value } = await withLiveRows(
      {
        rows: [{ id: 'model-instances', plugin: 'modelInstancesRow' }],
        plugins: { modelInstancesRow },
        entryObjects: [publicationAuthorityEntry(verdict)],
        probe: ['modelInstances'],
      },
      async ctx => {
        const directory = ctx.get('modelInstances') as ModelInstancesService<unknown>
        const registered = await directory.register({
          publication: [
            { tenant: TENANT, call: CALL, instance: INSTANCE, generation: '1' },
            handle,
          ],
          authority: evidence,
        })
        return { registered, connected: await directory.connect(OBSERVER) }
      },
    )
    expect(value.registered).toEqual({ failure: { kind: 'denied' } })
    expect(value.connected).toEqual({ ok: { kind: 'no-live-route' } })
  })

  it('stays PENDING without the publication authority and names the missing key', async () => {
    const run = await serveOnce({
      distribution: { rows: [{ id: 'model-instances', plugin: 'modelInstancesRow', config: {} }] },
      plugins: { modelInstancesRow },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(4)
    expect(run.state('model-instances')).toMatchObject({
      state: 'PENDING',
      missing: ['modelPublicationAuthority'],
    })
  })
})

describe('the model-converters row', () => {
  it('declares the formal keys, one inject and no shutdown phase', () => {
    expect(rowDeclarationOf(modelConvertersRow)).toEqual({
      row: 'model-converters',
      implementation: 'real',
      manifest: {
        provides: ['modelConverters'],
        injects: ['modelConverterAuthority'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })

  it('is ACTIVE with its authority and answers an empty catalog with absent', async () => {
    const verdict: { current: Verdict } = { current: { ok: undefined } }
    const { value, run } = await withLiveRows(
      {
        rows: [{ id: 'model-converters', plugin: 'modelConvertersRow' }],
        plugins: { modelConvertersRow },
        entryObjects: [converterAuthorityEntry(verdict)],
        probe: ['modelConverters'],
      },
      async ctx => {
        const catalog = ctx.get('modelConverters') as ModelConvertersService<unknown>
        return {
          isService: catalog instanceof ModelConvertersService,
          acquired: await catalog.acquire({ mediaType: 'text/plain', modality: null }),
        }
      },
    )
    expect(value.isService).toBe(true)
    expect(value.acquired).toEqual({ ok: { kind: 'absent' } })
    expect(run.state('model-converters')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(run.result.exitCode).toBe(0)
  })

  it('stays PENDING without the converter authority and names the missing key', async () => {
    const run = await serveOnce({
      distribution: {
        rows: [{ id: 'model-converters', plugin: 'modelConvertersRow', config: {} }],
      },
      plugins: { modelConvertersRow },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(4)
    expect(run.state('model-converters')).toMatchObject({
      state: 'PENDING',
      missing: ['modelConverterAuthority'],
    })
  })
})
