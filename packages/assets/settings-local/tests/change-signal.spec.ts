import { afterEach, expect, it } from 'vitest'
import type { DomainChange, SettingsTarget } from '@omne-harness/settings'
import { openPreparedServiceWorld } from './prepared-service-world.ts'
import { openPreparedTargetWorld } from './prepared-target-world.ts'

const opened: { close(): Promise<void> }[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.close()
})

it('a committed write of an independent target gives one signal with the target and its revision; a rejected one gives none', async () => {
  const w = await openPreparedTargetWorld({ actions: ['set', 'clear', 'lock', 'unlock'] })
  opened.push(w)
  const changes: DomainChange<SettingsTarget>[] = []
  w.owner.changes.subscribe(change => changes.push(change))
  const created = await w.owner.mutate({
    kind: 'provision',
    operationId: 'signal-create',
    expectedRevision: null,
    record: w.record,
  })
  const stale = await w.owner.mutate({
    kind: 'provision',
    operationId: 'signal-stale',
    expectedRevision: 7,
    record: w.record,
  })
  expect(created).toMatchObject({ kind: 'committed', revision: 1 })
  expect(stale.kind).toBe('rejected')
  expect(changes).toEqual([{ domain: w.record.target, revision: 1 }])
})

it('a committed prepared change gives one signal with the target and its revision; a refused commit gives none', async () => {
  const w = await openPreparedServiceWorld()
  opened.push(w)
  const changes: DomainChange<SettingsTarget>[] = []
  const stop = w.control.changes.subscribe(change => changes.push(change))
  const prepared = await w.service.prepareChange(w.context, w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  const commit = { requestId: 'commit', preparation: prepared.preparation }
  const refused = await w.service.commitChange({ ...w.context, allowed: false }, commit)
  expect(refused).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(changes).toEqual([])
  const committed = await w.service.commitChange(w.context, commit)
  expect(committed).toMatchObject({ kind: 'committed', revision: 1, changed: true })
  expect(changes).toEqual([{ domain: w.command.target, revision: 1 }])
  stop()
  await w.service.commitChange(w.context, { ...commit, requestId: 'again' })
  expect(changes).toHaveLength(1)
})
