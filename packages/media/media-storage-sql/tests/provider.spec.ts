// @module-tag slow
// Opens a real SQLite storage with its worker threads for every case.
import { afterEach, describe, expect, it } from 'vitest'
import type { NewRow, Staging } from '@omne-harness/media-contract'
import { openSqlWorld, type SqlWorld } from './world.ts'

const key = (letter: string): string => letter.repeat(32)
const uploading = (letter: string, tenant = 'tenant-one'): NewRow => ({
  key: key(letter),
  tenant,
  storage: 'local',
  mediaType: 'image/png',
  bytes: 10,
  upload: `up-${letter}`,
  expiresAt: '2026-10-19T01:00:00.000Z',
})
const staging = (letter: string): Staging => ({
  key: key(letter),
  tenant: 'tenant-one',
  mediaType: 'image/png',
  bytes: 10,
  digest: 'sha256:same',
  facts: { kind: 'image', widthPixels: 2, heightPixels: 3 },
  expiresAt: '2026-10-19T01:00:00.000Z',
  holder: null,
})

describe('the SQL index over real storage', () => {
  const open: SqlWorld[] = []
  async function world(): Promise<SqlWorld> {
    const opened = await openSqlWorld()
    open.push(opened)
    return opened
  }
  afterEach(async () => {
    await Promise.all(open.splice(0).map(opened => opened.close()))
  })

  it('keeps one live row per digest when rows of the same content are staged at once', async () => {
    const { index } = await world()
    const letters = ['a', 'b', 'c', 'd', 'e', 'f']
    for (const letter of letters) await index.insertUploading(uploading(letter))
    const answers = await Promise.all(letters.map(letter => index.stageOrMerge(staging(letter))))
    const kinds = answers.map(answer => ('ok' in answer ? answer.ok.kind : 'failed'))
    expect(kinds.filter(kind => kind === 'staged')).toHaveLength(1)
    expect(kinds.filter(kind => kind === 'merged')).toHaveLength(5)
    const stays = new Set(answers.map(answer => ('ok' in answer ? answer.ok.row.key : '')))
    expect(stays.size).toBe(1)
    const deleting = await index.listDeleting('tenant-one', 10)
    expect('ok' in deleting && deleting.ok).toHaveLength(5)
  })
})
