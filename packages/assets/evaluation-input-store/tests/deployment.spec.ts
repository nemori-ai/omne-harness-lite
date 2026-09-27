import { expect, test, vi } from 'vitest'
import { narrow } from '@omne-harness-lite/storage'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createEvaluationInputReader } from '../src/index.ts'
import { publishLocalInputs, readPublicationRevision } from '../src/publication.ts'
import { withHost, holding, ROOT, body, asset } from './support.ts'

test.each([
  undefined,
  [ROOT],
  [{ capability: ROOT }],
  [{ capability: ROOT, meta: 0 }],
  [{ capability: ROOT, meta: false, extra: true }],
  [
    { capability: ROOT, meta: false },
    { capability: ROOT, meta: true },
  ],
])(
  'missing meta, non-boolean, unknown fields and duplicate deployment members are construction errors: %j',
  async value =>
    withHost(async h => {
      const atomic = vi.spyOn(h.storage, 'atomic')
      expect(() =>
        createEvaluationInputReader({ ...h.deps, deployedOfficial: value as never }),
      ).toThrow(TypeError)
      expect(atomic).not.toHaveBeenCalled()
    }),
)

test('meta requires factory lock and non-meta forbids it, including when a batch only updates another scope', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const asMeta = { ...h.deps, deployedOfficial: [{ capability: ROOT, meta: true }] }
    expect(
      await publishLocalInputs(asMeta, { expectedRevision: '1', definitions: [], scopes: [] }),
    ).toEqual({ failure: 'invalidInput' })
    expect(await readPublicationRevision(h.deps)).toEqual({ revision: '1' })
    const locked = { ...holding({ layer: 'factory' }), immutable: true }
    expect(
      await publishLocalInputs(asMeta, {
        expectedRevision: '1',
        definitions: [],
        scopes: [{ holder: { layer: 'factory' }, holdings: [locked] }],
      }),
    ).toEqual({ revision: '2' })
    expect(await h.reader.read('session_a', tenant)).toEqual({ failure: 'unavailable' })
    const metaReader = createEvaluationInputReader(asMeta)
    try {
      expect(await metaReader.read('session_a', tenant)).toHaveProperty('input')
    } finally {
      await metaReader.close()
    }
    expect(
      await publishLocalInputs(h.deps, { expectedRevision: '2', definitions: [], scopes: [] }),
    ).toEqual({ failure: 'invalidInput' })
    expect(await readPublicationRevision(asMeta)).toEqual({ revision: '2' })
  }))

test('constructor freezes trusted deployment metadata; later caller mutation cannot silently change its authority', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    const deployment = [{ capability: { ...ROOT }, meta: false }]
    const reader = createEvaluationInputReader({ ...h.deps, deployedOfficial: deployment })
    try {
      deployment[0]!.meta = true
      deployment[0]!.capability.name = 'untrusted:changed'
      expect(await reader.read('session_a', tenant)).toHaveProperty('input')
    } finally {
      await reader.close()
    }
  }))

test('legacy bare stored deployment manifest is rejected until an explicit trusted republish; rows are not auto-migrated or erased', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    await h.storage.write(async tx => {
      await narrow<{ evaluation_input_head: { factory_manifest: string } }>(tx)
        .updateTable('evaluation_input_head')
        .set({ factory_manifest: writeJsonLossless([ROOT]) })
        .execute()
    })
    expect(await h.reader.read('session_a', tenant)).toEqual({ failure: 'unavailable' })
    expect(await readPublicationRevision(h.deps)).toEqual({ revision: '1' })
    expect(
      await publishLocalInputs(h.deps, { expectedRevision: '1', definitions: [], scopes: [] }),
    ).toEqual({ revision: '2' })
    expect(await h.reader.read('session_a', tenant)).toHaveProperty('input')
  }))

test('reading checks actual factory lock, independently of a syntactically complete head manifest', async () =>
  withHost(async h => {
    const { tenant } = await h.identity('alice')
    await h.initialize(tenant)
    await h.storage.write(async tx => {
      await narrow<{ evaluation_input_scope: { holdings: string; layer: string } }>(tx)
        .updateTable('evaluation_input_scope')
        .set({
          holdings: writeJsonLossless([{ ...holding({ layer: 'factory' }), immutable: true }]),
        })
        .where('layer', '=', 'factory')
        .execute()
    })
    expect(await h.reader.read('session_a', tenant)).toEqual({ failure: 'unavailable' })
    expect(h.diagnostics.at(-1)).toHaveProperty('stage', 'factory_manifest')
  }))

test('missing or extra deployed factory member is rejected before any publication writes', async () =>
  withHost(async h => {
    expect(
      await publishLocalInputs(h.deps, {
        expectedRevision: null,
        definitions: [asset([body()])],
        scopes: [{ holder: { layer: 'factory' }, holdings: [] }],
      }),
    ).toEqual({ failure: 'invalidInput' })
    expect(await readPublicationRevision(h.deps)).toEqual({ revision: null })
  }))
