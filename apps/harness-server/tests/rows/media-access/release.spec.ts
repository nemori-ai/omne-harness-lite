import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { mediaAccessRow } from '../../../src/rows/media-access/index.ts'
import { mediaStorageLocalRow } from '../../../src/rows/media-storage-local/index.ts'
import { mediaStorageSqlRow } from '../../../src/rows/media-storage-sql/index.ts'
import { mediaImageRow } from '../../../src/rows/media-image/index.ts'
import { mediaRow } from '../../../src/rows/media/index.ts'
import { mediaSweepRow } from '../../../src/rows/media-sweep/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { runOmne } from '../../r9/support.ts'
import {
  onReleaseTreeRuns,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { digestOf, mediaClientOf, noisePng } from './support.ts'

const PICTURE = noisePng(420, 300)
const UPLOAD = 'release-upload-1'

async function stranger(tree: ReleaseTree) {
  const base = dirname(tree.home)
  const home = join(base, 'frank')
  for (const command of ['register', 'login'])
    expect(
      (
        await runOmne({
          args: [command, '--login-identifier', 'frank'],
          home,
          server: `http://127.0.0.1:${String(tree.port)}`,
          cwd: base,
          credential: 'frank-pw-media-release-3c9e',
        })
      ).status,
    ).toBe(0)
  return mediaClientOf(tree.port, home)
}

describe('the six media rows', () => {
  it.each([
    [mediaStorageSqlRow, 'media-storage-sql', ['mediaIndex'], ['storage', 'tenantDomainLookup']],
    [mediaImageRow, 'media-image', ['mediaImage'], []],
    [mediaRow, 'media', ['mediaStores', 'mediaEngines', 'media'], ['mediaIndex', 'mediaImage']],
    [mediaStorageLocalRow, 'media-storage-local', [], ['mediaStores']],
    [mediaSweepRow, 'media-sweep', [], ['media', 'tenantDomains', 'tenantDomainScannerPrincipal']],
    [mediaAccessRow, 'media-access', [], ['accessRegistry', 'principalIssuer']],
  ] as const)(
    '%#: the row %s declares the manifest of the stub table',
    (row, id, provides, injects) => {
      const declared = rowDeclarationOf(row)
      expect(declared).toMatchObject({
        row: id,
        implementation: 'real',
        lifecycle: { kind: 'none' },
        manifest: { provides, injects },
      })
      const stub = rowManifests.get(declared!.row)
      expect(stub?.provides).toEqual(provides.map(name => `s0.${name}`))
      expect(stub?.injects).toEqual(injects.map(name => `s0.${name}`))
    },
  )

  it(
    'take a picture in parts, go on after a restart, commit it, recall it and page it back byte for byte (C10)',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const exitCodes = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
        async tree => {
          const { client, tenant } = mediaClientOf(tree.port, tree.home)
          const begun = await client['begin-upload']({
            tenant,
            upload: UPLOAD,
            mediaType: 'image/png',
            bytes: PICTURE.byteLength,
          })
          if (begun.outcome !== 'succeeded' || begun.body.status.kind !== 'uploading')
            throw new Error(JSON.stringify(begun))
          const { partBytes } = begun.body.status
          expect(PICTURE.byteLength).toBeGreaterThan(partBytes)
          expect(
            await client['append-upload-part']({
              tenant,
              upload: UPLOAD,
              sequence: 0,
              part: PICTURE.subarray(0, partBytes),
            }),
          ).toEqual({ outcome: 'succeeded', body: { nextSequence: 1 } })
          expect(
            await client['commit-upload']({ tenant, upload: UPLOAD, digest: digestOf(PICTURE) }),
          ).toEqual({
            outcome: 'invalid',
            body: { reason: 'incomplete', nextSequence: 1 },
          })
        },
        async tree => {
          await tree.relogin()
          const { client, tenant } = mediaClientOf(tree.port, tree.home)
          const standing = await client['query-upload']({ tenant, upload: UPLOAD })
          if (standing.outcome !== 'succeeded' || standing.body.status.kind !== 'uploading')
            throw new Error(JSON.stringify(standing))
          const { nextSequence, partBytes } = standing.body.status
          expect(nextSequence).toBe(1)
          const part = (sequence: number) =>
            client['append-upload-part']({
              tenant,
              upload: UPLOAD,
              sequence,
              part: PICTURE.subarray(sequence * partBytes, (sequence + 1) * partBytes),
            })
          expect(await part(0)).toEqual({ outcome: 'succeeded', body: { nextSequence: 1 } })
          for (let sequence = 1; sequence * partBytes < PICTURE.byteLength; sequence += 1)
            expect((await part(sequence)).outcome).toBe('succeeded')

          const committed = await client['commit-upload']({
            tenant,
            upload: UPLOAD,
            digest: digestOf(PICTURE),
          })
          if (committed.outcome !== 'succeeded') throw new Error(JSON.stringify(committed))
          const { ref, facts } = committed.body
          expect(ref).toMatchObject({
            storage: 'local',
            mediaType: 'image/png',
            bytes: String(PICTURE.byteLength),
            digest: digestOf(PICTURE),
          })
          expect(facts).toEqual({ kind: 'image', widthPixels: 420, heightPixels: 300 })
          expect(
            await client['commit-upload']({ tenant, upload: UPLOAD, digest: digestOf(PICTURE) }),
          ).toEqual(committed)
          expect(await client['query-upload']({ tenant, upload: UPLOAD })).toEqual({
            outcome: 'succeeded',
            body: { status: { kind: 'committed', ref, facts } },
          })
          expect(await client['describe-media']({ tenant, ref })).toEqual({
            outcome: 'succeeded',
            body: { state: 'staged', facts },
          })

          const pages: Uint8Array[] = []
          for (let offset: number | null = 0; offset !== null;) {
            const page = await client['read-media-page']({ tenant, ref, offset, limit: 200_000 })
            if (page.outcome !== 'succeeded') throw new Error(JSON.stringify(page))
            expect(page.body).toMatchObject({ mediaType: 'image/png', bytes: PICTURE.byteLength })
            pages.push(page.body.part)
            offset = page.body.next
          }
          expect(pages.length).toBeGreaterThan(1)
          expect(Buffer.concat(pages).equals(Buffer.from(PICTURE))).toBe(true)

          const shown = await client['read-media-page']({
            tenant,
            ref,
            offset: 0,
            limit: 200_000,
            target: {
              mediaTypes: ['image/webp', 'image/jpeg'],
              maxBytes: 20_000,
              maxWidth: 64,
              maxHeight: 64,
            },
          })
          if (shown.outcome !== 'succeeded') throw new Error(JSON.stringify(shown))
          expect(shown.body.next).toBeNull()
          expect(shown.body.part.byteLength).toBe(shown.body.bytes)
          expect(shown.body.bytes).toBeLessThanOrEqual(20_000)
          expect(shown.body.facts).toEqual({ kind: 'image', widthPixels: 64, heightPixels: 45 })

          const other = await stranger(tree)
          expect(await other.client['describe-media']({ tenant: other.tenant, ref })).toEqual({
            outcome: 'not-found',
            body: {},
          })
          expect(
            await other.client['read-media-page']({
              tenant: other.tenant,
              ref,
              offset: 0,
              limit: 10,
            }),
          ).toEqual({ outcome: 'not-found', body: { reason: 'reference' } })
          expect((await other.client['describe-media']({ tenant, ref })).outcome).toBe('denied')

          const file = join(dirname(tree.home), 'picture.png')
          const back = join(dirname(tree.home), 'back.png')
          writeFileSync(file, PICTURE)
          const put = await tree.cli(['media', 'put', '--file', file])
          expect(put.status, put.stderr).toBe(0)
          const printed = JSON.parse(put.stdout) as { body: { ref: Record<string, string> } }
          expect(printed.body.ref).toEqual(ref)
          const got = await tree.cli([
            'media',
            'get',
            '--ref',
            JSON.stringify(printed.body.ref),
            '--out',
            back,
          ])
          expect(got.status, got.stderr).toBe(0)
          expect(JSON.parse(got.stdout)).toMatchObject({
            body: { bytes: PICTURE.byteLength, digest: digestOf(PICTURE) },
          })
          expect(readFileSync(back).equals(Buffer.from(PICTURE))).toBe(true)
        },
      ])
      expect(exitCodes).toEqual([0, 0])
    },
  )
})
