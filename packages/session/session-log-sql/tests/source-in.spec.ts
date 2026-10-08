import { afterEach, expect, test } from 'vitest'
import { StorageDefect } from '@omne-harness-lite/storage'
import { boot, request, scope } from './support.ts'
const opened: Awaited<ReturnType<typeof boot>>[] = []
afterEach(async () => {
  for (const value of opened.splice(0)) await value.close()
})
async function fixture() {
  const value = await boot()
  opened.push(value)
  return value
}

test('reads staged journal generation and tail in the actual caller unit', async () => {
  const f = await fixture()
  const staged = await f.storage.atomic(async unit => {
    expect(await f.log.participant.appendIn(unit, f.access, request())).toHaveProperty(
      'kind',
      'staged',
    )
    const first = await f.log.participant.sourceIn(unit, f.access, scope)
    expect(first).toMatchObject({
      kind: 'source',
      source: { tenant: scope.tenant, session: scope.session, tail: 1 },
    })
    expect(await f.log.participant.appendIn(unit, f.access, request('second'))).toHaveProperty(
      'kind',
      'staged',
    )
    const next = await f.log.participant.sourceIn(unit, f.access, scope)
    expect(next).toMatchObject({ kind: 'source', source: { tail: 2 } })
    if ('failure' in first || 'failure' in next) throw new Error('missing staged source')
    expect(next.source.journalGeneration).toBe(first.source.journalGeneration)
    return next
  })
  expect(await f.log.participant.source(f.access, scope)).toEqual(staged)
})
test('does not commit a staged source or log independently when a later participant fails', async () => {
  const f = await fixture()
  await expect(
    f.storage.atomic(async unit => {
      await f.log.participant.appendIn(unit, f.access, request())
      expect(await f.log.participant.sourceIn(unit, f.access, scope)).toHaveProperty(
        'source.tail',
        1,
      )
      throw new Error('later-stage-failed')
    }),
  ).rejects.toThrow('later-stage-failed')
  expect(await f.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
})
test('denies a forged live reference and foreign scope in the actual shared unit', async () => {
  const f = await fixture()
  await f.log.append(scope.session, request().entries, request().fence, request().condition)
  await f.storage.atomic(async unit => {
    expect(await f.log.participant.sourceIn(unit, {} as typeof f.access, scope)).toEqual({
      failure: 'denied',
    })
    expect(
      await f.log.participant.sourceIn(unit, f.access, {
        ...scope,
        session: 'other' as typeof scope.session,
      }),
    ).toEqual({ failure: 'denied' })
  })
})
test('keeps an owner shutdown distinct from an available journal coordinate', async () => {
  const f = await fixture()
  await f.log.close()
  await f.storage.atomic(async unit =>
    expect(await f.log.participant.sourceIn(unit, f.access, scope)).toEqual({
      failure: 'unavailable',
    }),
  )
})
test('rejects a foreign storage unit and leaves that failed unit unable to commit', async () => {
  const f = await fixture(),
    other = await fixture()
  await expect(
    other.storage.atomic(async unit => {
      expect(await f.log.participant.sourceIn(unit, f.access, scope)).toEqual({
        failure: 'invalidInput',
      })
    }),
  ).rejects.toBeInstanceOf(StorageDefect)
})
