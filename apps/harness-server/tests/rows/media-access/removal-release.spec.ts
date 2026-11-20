// @module-tag slow
import { describe, expect, it } from 'vitest'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
} from '../../support/release-tree.ts'
import { mediaClientOf } from './support.ts'

const MEDIA_ROWS = [
  'media-storage-sql',
  'media-image',
  'media',
  'media-storage-local',
  'media-sweep',
  'media-access',
]

describe('the release tree without the media rows (C22)', () => {
  it(
    'starts, lets a session of text talk to its end, and does not mount the media protocol',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = { script: toolCallsThenText(() => []), withoutRows: MEDIA_ROWS }
      const exitCode = await onReleaseTree(options, async tree => {
        const loaded = tree.records.filter(r => r['kind'] === 'tree').map(r => String(r['id']))
        expect(loaded.filter(id => id.startsWith('media'))).toEqual([])
        const session = await tree.startSession('hello')
        const entries = await pollUntil(
          'the Run to end',
          () => historyOf(tree, session),
          found => found.some(entry => entry.kind === 'run.terminal'),
        )
        expect(JSON.stringify(entries.find(entry => entry.kind === 'run.terminal'))).toContain(
          '"outcome":"completed"',
        )
        const response = await fetch(
          `http://127.0.0.1:${String(tree.port)}/api/media/v1/query-upload`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${savedLoginProof(tree.home)}`,
              'omne-message-id': 'm-1',
            },
            body: JSON.stringify({ tenant: savedTenant(tree.home), upload: 'none' }),
          },
        )
        expect(response.status).toBe(404)
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'with the access row and without the media row: the protocol is mounted and answers basis-unavailable',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = {
        script: toolCallsThenText(() => []),
        withoutRows: MEDIA_ROWS.filter(row => row !== 'media-access'),
      }
      const exitCode = await onReleaseTree(options, async tree => {
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        expect(await client['query-upload']({ tenant, upload: 'none' })).toEqual({
          outcome: 'basis-unavailable',
        })
      })
      expect(exitCode).toBe(0)
    },
  )
})
