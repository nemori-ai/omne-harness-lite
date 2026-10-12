import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { prepareToolJournalEntry } from '@omne-harness-lite/tool-execution-runtime'
import { checkAppendInput } from '@omne-harness-lite/session-log'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { journalIntent } from './tool-intent-fixture.ts'
import { ref, scope, request } from './execution-owner-fixture.ts'
import { createToolExecutionRecordReader } from '../src/execution-records.ts'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of cleanup.splice(0)) await close()
})
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'omne-tool-records-'))
  const log = await openSqlLogFixture({ dir })
  cleanup.push(async () => {
    await log.close()
    await rm(dir, { recursive: true, force: true })
  })
  const participant = {
    sourceIn: vi.fn(log.participant.sourceIn),
    readByKeyIn: vi.fn(log.participant.readByKeyIn),
  }
  const reader = createToolExecutionRecordReader({
    storage: log.fixtureStorage,
    tenant: scope.tenant,
    participant,
    authority: log.fixtureAccess,
  })
  const prepared = prepareToolJournalEntry({ origin: request.origin, value: journalIntent() })
  if ('invalid' in prepared) throw new Error('invalid original intent')
  const batch = checkAppendInput(
    scope.session,
    [prepared.entry],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in batch) throw new Error('invalid original batch')
  return { log, reader, participant, batch: batch.ok }
}
test('reads the staged original tool history without borrowing a full Session prefix', async () => {
  const f = await fixture()
  await f.log.fixtureStorage.atomic(async unit => {
    expect(await f.log.participant.appendIn(unit, f.log.fixtureAccess, f.batch)).toHaveProperty(
      'kind',
      'staged',
    )
    const result = await f.reader.readOriginalIn(unit, ref)
    expect(result).toHaveProperty('kind', 'found')
    if (result.kind !== 'found') throw new Error('original tool history unavailable')
    expect(result.history.intent.value).toEqual(journalIntent())
    expect(f.participant.sourceIn).toHaveBeenCalledTimes(1)
    expect(f.participant.readByKeyIn).toHaveBeenCalledTimes(1)
  })
})
test('an absent call is not authority to launch and subsequent rollback leaves no intent', async () => {
  const f = await fixture()
  await expect(
    f.log.fixtureStorage.atomic(async unit => {
      await f.log.participant.appendIn(unit, f.log.fixtureAccess, f.batch)
      const unknown = { ...ref, callId: 'other' as typeof ref.callId }
      expect(await f.reader.readOriginalIn(unit, unknown)).toEqual({ kind: 'absent' })
      throw new Error('later failure')
    }),
  ).rejects.toThrow('later failure')
  expect(await f.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
})

test('foreign tenant data is rejected before any source read', async () => {
  const f = await fixture()
  await f.log.fixtureStorage.atomic(async unit => {
    expect(
      await f.reader.readOriginalIn(unit, {
        ...ref,
        tenant: unwrap(parseTenantId({ organization: 'foreign', account: scope.tenant.account })),
      }),
    ).toEqual({ kind: 'invalidSource' })
  })
  expect(f.participant.sourceIn).not.toHaveBeenCalled()
  expect(f.participant.readByKeyIn).not.toHaveBeenCalled()
})
test('copied authority cannot reveal a stored tool execution', async () => {
  const f = await fixture()
  const denied = createToolExecutionRecordReader({
    storage: f.log.fixtureStorage,
    tenant: scope.tenant,
    participant: f.participant,
    authority: {} as typeof f.log.fixtureAccess,
  })
  await f.log.fixtureStorage.atomic(async unit => {
    await f.log.participant.appendIn(unit, f.log.fixtureAccess, f.batch)
    expect(await denied.readOriginalIn(unit, ref)).toEqual({ kind: 'unavailable' })
  })
  expect(f.participant.readByKeyIn).not.toHaveBeenCalled()
})
test('other domain data claiming a tool key cannot masquerade as an absent call', async () => {
  const f = await fixture()
  const original = f.batch.entries[0]!
  await f.log.fixtureStorage.atomic(async unit => {
    await f.log.participant.appendIn(unit, f.log.fixtureAccess, {
      ...f.batch,
      entries: [{ ...original, payload: { category: 'fact', format: 'unrelated/1' } }],
    })
    expect(await f.reader.readOriginalIn(unit, ref)).toEqual({ kind: 'invalidSource' })
  })
})
test('an unavailable record source is never reported as a successfully empty history', async () => {
  const f = await fixture()
  await f.log.fixtureStorage.atomic(unit =>
    f.log.participant.appendIn(unit, f.log.fixtureAccess, f.batch),
  )
  const closed = await f.log.participant.source(f.log.fixtureAccess, scope)
  if ('failure' in closed) throw new Error('original source unavailable')
  const other = createToolExecutionRecordReader({
    storage: f.log.fixtureStorage,
    tenant: scope.tenant,
    authority: f.log.fixtureAccess,
    participant: {
      sourceIn: () => Promise.resolve(closed),
      readByKeyIn: () => Promise.resolve({ failure: 'unavailable' }),
    },
  })
  await f.log.fixtureStorage.atomic(async unit =>
    expect(await other.readOriginalIn(unit, ref)).toEqual({ kind: 'unavailable' }),
  )
})
