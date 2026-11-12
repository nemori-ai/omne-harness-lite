import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { context, createCommand, listRequest, readAccess } from './data.ts'
import { openWorld } from './world.ts'

test('malformed stored data is unavailable rather than absent or an empty list', async () => {
  const w = await openWorld()
  const command = createCommand()
  try {
    expect(await w.persistence.commit(command)).toMatchObject({ kind: 'recorded' })
  } finally {
    await w.close()
  }
  const path = join(
    w.root,
    'domains',
    `${Buffer.from('schedule.management').toString('hex')}.sqlite`,
  )
  const db = new DatabaseSync(path)
  try {
    db.prepare("UPDATE sc_schedules SET record = '{invalid'").run()
  } finally {
    db.close()
  }
  const reopened = await openWorld({ root: w.root, configure: false })
  try {
    expect(
      await reopened.store.readSchedule({
        owner: context.owner,
        scheduleId: command.input.allocatedId,
      }),
    ).toMatchObject({
      kind: 'unavailable',
      error: { code: 'provider_failure', message: 'read_failed' },
    })
    expect(
      await reopened.store.listSchedules({ access: readAccess(), request: listRequest() }),
    ).toMatchObject({ kind: 'unavailable' })
  } finally {
    await reopened.close()
  }
}, 15000)
