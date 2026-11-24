import { describe, expect, it } from 'vitest'
import { ArchivedDirectory } from '../src/model/paper.ts'
import type { ListPage } from '../src/model/session-list.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { listed } from './fixtures/frames.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

const openPage = (): ListPage => ({ sessions: [], next: null, completeness: 'complete' })

const archived = (session: string) => ({
  ...listed(session, session),
  archivedAt: null,
  archivedBy: 'person',
})

const pageOf = (sessions: readonly string[], next: string | null) => ({
  outcome: 'succeeded',
  body: { sessions: sessions.map(archived), next, completeness: 'complete' },
})

async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) await Promise.resolve()
}

function started() {
  const fake = createFakeClient()
  const directory = new ArchivedDirectory(fake.client)
  const after = openPage()
  let heard = 0
  directory.subscribe(TENANT, () => (heard += 1))
  directory.scan(TENANT, after)
  return { fake, directory, after, heard: () => heard }
}

describe('reading the archived directory through', () => {
  it('reads page after page with the cursor it was given, and holds the rows of all of them', async () => {
    const { fake, directory, after } = started()
    const first = await fake.next('list-archived-sessions')
    expect(first.body).toMatchObject({ cursor: null })
    first.answer(pageOf(['ses_1'], 'c-2'))
    await settle()
    expect(directory.read(TENANT)).toEqual({ kind: 'reading', after })
    const second = await fake.next('list-archived-sessions')
    expect(second.body).toMatchObject({ cursor: 'c-2' })
    second.answer(pageOf(['ses_2'], null))
    await settle()
    const scan = directory.read(TENANT)
    expect(scan?.kind).toBe('read')
    expect(scan?.kind === 'read' ? [...scan.rows.keys()] : []).toEqual(['ses_1', 'ses_2'])
  })

  it.each([
    [
      'answered unavailable',
      (call: { answer: (value: unknown) => void }) => call.answer({ outcome: 'unavailable' }),
    ],
    [
      'the call failing',
      (call: { answer: (value: unknown) => void }) =>
        call.answer(Promise.reject(new Error('the line broke'))),
    ],
  ])('a page that fails midway, by %s, leaves the scan unavailable, not read', async (_, fail) => {
    const { fake, directory, after, heard } = started()
    ;(await fake.next('list-archived-sessions')).answer(pageOf(['ses_1'], 'c-2'))
    await settle()
    fail(await fake.next('list-archived-sessions'))
    await settle()
    expect(directory.read(TENANT)).toEqual({ kind: 'unavailable', after })
    expect(heard()).toBe(2)
  })

  it('a page refused midway leaves the scan refused', async () => {
    const { fake, directory, after } = started()
    ;(await fake.next('list-archived-sessions')).answer(pageOf(['ses_1'], 'c-2'))
    await settle()
    ;(await fake.next('list-archived-sessions')).answer({ outcome: 'denied' })
    await settle()
    expect(directory.read(TENANT)).toEqual({ kind: 'refused', after })
  })

  it('a newer read of the open directory starts again from the first page and drops the older answers', async () => {
    const { fake, directory } = started()
    const older = await fake.next('list-archived-sessions')
    const newer = openPage()
    directory.scan(TENANT, newer)
    const again = await fake.next('list-archived-sessions')
    expect(again.body).toMatchObject({ cursor: null })
    older.answer(pageOf(['ses_old'], 'c-old'))
    await settle()
    expect(directory.read(TENANT)).toEqual({ kind: 'reading', after: newer })
    again.answer(pageOf(['ses_new'], null))
    await settle()
    const scan = directory.read(TENANT)
    expect(scan?.after).toBe(newer)
    expect(scan?.kind === 'read' ? [...scan.rows.keys()] : []).toEqual(['ses_new'])
    expect(fake.calls.filter(call => call.operation === 'list-archived-sessions')).toHaveLength(2)
  })

  it('a refusal for an older read is dropped too', async () => {
    const { fake, directory } = started()
    const older = await fake.next('list-archived-sessions')
    const newer = openPage()
    directory.scan(TENANT, newer)
    older.answer({ outcome: 'denied' })
    await settle()
    expect(directory.read(TENANT)).toEqual({ kind: 'reading', after: newer })
  })

  it('a tenant that is not a tenant text is not asked about, and the scan is unavailable', async () => {
    const fake = createFakeClient()
    const directory = new ArchivedDirectory(fake.client)
    const after = openPage()
    directory.scan('not a tenant', after)
    await settle()
    expect(directory.read('not a tenant')).toEqual({ kind: 'unavailable', after })
    expect(fake.calls).toHaveLength(0)
  })
})
