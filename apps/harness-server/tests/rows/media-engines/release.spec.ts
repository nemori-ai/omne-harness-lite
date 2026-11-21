import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ContentReference } from '@omne-harness/media-contract'
import { mediaEnginesKey, mediaKey } from '@omne-harness/media-cordis-contract/cordis'
import { rowDeclarationOf } from '../../../src/row.ts'
import { mediaEnginePdfRow } from '../../../src/rows/media-engine-pdf/index.ts'
import { mediaEngineTranscribeRow } from '../../../src/rows/media-engine-transcribe/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { onReleaseTree, toolCallsThenText } from '../../support/release-tree.ts'
import { mediaClientOf } from '../media-access/support.ts'
import { uploaded } from '../media-intake/support.ts'

const PDF = new Uint8Array(
  readFileSync(
    new URL(
      '../../../../../packages/media/media-engine-pdf/tests/fixtures/passphrase.pdf',
      import.meta.url,
    ),
  ),
)

describe('the rows of the two converter engines', () => {
  it.each([
    [mediaEngineTranscribeRow, ['s0.mediaEngines', 's0.settingsSecretCustody']],
    [mediaEnginePdfRow, ['s0.mediaEngines']],
  ] as const)('declares the manifest of the stub table', (row, injects) => {
    const declared = rowDeclarationOf(row)
    expect(declared).toMatchObject({ implementation: 'real', lifecycle: { kind: 'none' } })
    const stub = rowManifests.get(declared!.row)
    expect(stub?.provides).toEqual([])
    expect(stub?.injects).toEqual(injects)
  })

  it(
    'registers both engines in the release tree, and a PDF taken in gets the words of its text layer by the definition the release carries',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const engines = tree.scope.get(mediaEnginesKey)
        const media = tree.scope.get(mediaKey)
        if (engines === undefined || media === undefined) throw new Error('no media services')
        for (const name of ['voice.transcribe', 'pdf.extract-text']) {
          const lease = engines.borrow(name)
          expect(lease?.engine.declaration.name, name).toBe(name)
          lease?.release()
        }
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const ref = (await uploaded(
          client,
          tenant,
          'pdf-1',
          PDF,
          'application/pdf',
        )) as ContentReference
        const parsed = tenantCodec.parse(savedTenant(tree.home))
        if (!parsed.ok) throw new Error('the saved tenant does not parse')
        const ready = await media.representations.ensure({
          access: { tenant: parsed.value, principal: null },
          ref,
          signal: new AbortController().signal,
        })
        expect(ready).toMatchObject({
          ok: {
            kind: 'done',
            representation: {
              outcome: 'converted',
              definition: { name: 'application-pdf' },
              engine: { name: 'pdf.extract-text', revision: '1' },
            },
          },
        })
        const text =
          'ok' in ready &&
          ready.ok.kind === 'done' &&
          ready.ok.representation.outcome === 'converted'
            ? ready.ok.representation.text
            : null
        expect(typeof text === 'string' ? text : '').toContain(
          'The passphrase is BLUE GIRAFFE 4172.',
        )
      })
      expect(exitCode).toBe(0)
    },
  )
})
