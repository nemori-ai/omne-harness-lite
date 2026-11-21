import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ContentReference, EngineInput } from '@omne-harness/media-contract'
import { createScriptedEngine } from '@omne-harness/media-contract/testing'
import {
  mediaConverterDefinitionsKey,
  mediaEnginesKey,
  mediaKey,
} from '@omne-harness/media-cordis-contract/cordis'
import { rowDeclarationOf } from '../../../src/row.ts'
import { mediaConvertersRow } from '../../../src/rows/media-converters/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { releaseConverters } from '../../../src/assets/converters.ts'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { runOmne, savedTenant } from '../../r9/support.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'
import { mediaClientOf } from '../media-access/support.ts'
import { treeOf, uploaded } from '../media-intake/support.ts'

/** A WAV of a few samples; `seed` makes each one another medium. */
function wav(seed: number): Uint8Array {
  const bytes = new Uint8Array(44 + 8)
  const view = new DataView(bytes.buffer)
  const tag = (at: number, text: string) => bytes.set(new TextEncoder().encode(text), at)
  tag(0, 'RIFF')
  view.setUint32(4, 36 + 8, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 8000, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  tag(36, 'data')
  view.setUint32(40, 8, true)
  view.setUint16(44, seed)
  return bytes
}

/** Another account on the same tree, with its own home. */
async function another(tree: ReleaseTree, name: string): Promise<string> {
  const base = dirname(tree.home)
  const home = join(base, name)
  const server = `http://127.0.0.1:${String(tree.port)}`
  for (const command of ['register', 'login']) {
    const args = [command, '--login-identifier', name]
    const done = await runOmne({ args, home, server, cwd: base, credential: `${name}-pw-3b7d10c4` })
    expect(done.status, done.stderr).toBe(0)
  }
  return home
}

const tenantId = (text: string): TenantId => {
  const parsed = tenantCodec.parse(text)
  if (!parsed.ok) throw new Error(text)
  return parsed.value
}
const [VOICE, PDF] = releaseConverters()
const mine = (engine: string) =>
  treeOf({ kind: 'voice', engine, parameters: {}, egress: { kind: 'host' } })

describe('converter definitions are assets (C27)', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(mediaConvertersRow)
    expect(declared).toMatchObject({
      row: 'media-converters',
      implementation: 'real',
      lifecycle: { kind: 'none' },
      manifest: {
        provides: ['mediaConverterDefinitions'],
        injects: ['tenantAssets', 'assetCategories'],
      },
    })
    const stub = rowManifests.get(declared!.row)
    expect(stub?.provides).toEqual(['s0.mediaConverterDefinitions'])
    expect(stub?.injects).toEqual(['s0.tenantAssets', 's0.assetCategories'])
  })

  it(
    "the category is listed; the release's two are in force for every tenant; a tenant's own replaces it for that tenant and what it uploads next; disabled, the release's one is back (the tree has no OpenRouter key, so the release's speech engine answers unavailable)",
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const text = savedTenant(tree.home)
        const tenant = tenantId(text)
        const otherHome = await another(tree, 'frank')
        const other = tenantId(savedTenant(otherHome))
        const assets = tree.clients.assets
        const definitions = tree.scope.get(mediaConverterDefinitionsKey)
        const media = tree.scope.get(mediaKey)
        const engines = tree.scope.get(mediaEnginesKey)
        if (definitions === undefined || media === undefined || engines === undefined)
          throw new Error('the media services are not in the tree')
        const resolve = (who: TenantId, mediaType: string) =>
          definitions.resolve({ tenant: who, mediaType })

        const categories = await assets['describe-category']({ category: 'converter' })
        expect(categories).toMatchObject({
          outcome: 'succeeded',
          body: { title: '转换件', creation: { kind: 'data' } },
        })

        const official = (name: string, version: string, engine: string) => ({
          ok: expect.objectContaining({
            kind: 'resolved',
            definition: { name, revision: version },
            engine,
          }),
        })
        expect(await resolve(tenant, 'audio/wav')).toEqual(
          official('voice', VOICE!.version, 'voice.transcribe'),
        )
        expect(await resolve(tenant, 'application/pdf')).toEqual(
          official('application-pdf', PDF!.version, 'pdf.extract-text'),
        )
        expect(await resolve(tenant, 'image/png')).toEqual({ ok: { kind: 'none' } })

        const heard: string[] = []
        const engineNamed = (name: string) =>
          createScriptedEngine(
            async (input: EngineInput) => {
              heard.push(name)
              return {
                kind: 'converted',
                text: `${name}:${String(input.media.bytes)}`,
                derived: [],
              }
            },
            { name, accepts: ['audio/*'] },
          ).engine
        engines.register(engineNamed('voice.mine'))
        const { client } = mediaClientOf(tree.port, tree.home)
        const take = async (upload: string, seed: number) =>
          (await uploaded(
            client,
            tenantOf(text),
            upload,
            wav(seed),
            'audio/wav',
          )) as ContentReference
        const ready = (ref: ContentReference) =>
          media.representations.ensure({
            access: { tenant, principal: null },
            ref,
            signal: new AbortController().signal,
          })

        const before = await take('voice-1', 1)
        expect(await ready(before)).toEqual({
          ok: { kind: 'failed', reason: 'engine-unavailable' },
        })

        const made = await assets['create-asset']({
          tenant: tenantOf(text),
          operation: 'mine-1',
          category: 'converter',
          name: 'voice',
          body: mine('voice.mine'),
        })
        if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
        const { version, holding } = made.body
        expect(await resolve(tenant, 'audio/wav')).toEqual(official('voice', version, 'voice.mine'))
        const theirs = mediaClientOf(tree.port, otherHome)
        await uploaded(theirs.client, theirs.tenant, 'theirs-1', wav(9), 'audio/wav')
        expect(await resolve(other, 'audio/wav')).toEqual(
          official('voice', VOICE!.version, 'voice.transcribe'),
        )
        const after = await take('voice-2', 2)
        expect(await ready(after)).toMatchObject({
          ok: {
            kind: 'done',
            representation: { definition: { name: 'voice', revision: version } },
          },
        })
        expect(heard).toEqual(['voice.mine'])

        const disabled = await assets['set-asset-enabled']({
          tenant: tenantOf(text),
          operation: 'mine-off',
          holding,
          enabled: false,
        })
        expect(disabled).toEqual({ outcome: 'succeeded', body: {} })
        expect(await resolve(tenant, 'audio/wav')).toEqual(
          official('voice', VOICE!.version, 'voice.transcribe'),
        )

        const wavOnly = await assets['create-asset']({
          tenant: tenantOf(text),
          operation: 'wav-1',
          category: 'converter',
          name: 'audio-wav',
          body: treeOf({
            kind: 'audio-wav',
            engine: 'voice.mine',
            parameters: {},
            egress: { kind: 'host' },
          }),
        })
        if (wavOnly.outcome !== 'succeeded') throw new Error(JSON.stringify(wavOnly))
        expect(await resolve(tenant, 'audio/wav')).toEqual(
          official('audio-wav', wavOnly.body.version, 'voice.mine'),
        )
        await assets['set-asset-enabled']({
          tenant: tenantOf(text),
          operation: 'wav-off',
          holding: wavOnly.body.holding,
          enabled: false,
        })
        expect(await resolve(tenant, 'audio/wav')).toEqual(
          official('voice', VOICE!.version, 'voice.transcribe'),
        )
        expect(
          await assets['create-asset']({
            tenant: tenantOf(text),
            operation: 'bad-1',
            category: 'converter',
            name: 'image',
            body: mine('voice.mine'),
          }),
        ).toMatchObject({ outcome: 'invalid' })
      })
      expect(exitCode).toBe(0)
    },
  )
})
