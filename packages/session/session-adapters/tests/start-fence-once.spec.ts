import { sampleStartFence } from '@omne-harness/agent-contract/testing'
import { expect, it } from 'vitest'
import { ok, operation, scene } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

// One Tool operation starts once: a second start fence of it, under another operation, conflicts.
// A fence closes at birth, so the journal knows the first one only by its closed item.
async function secondFence(
  given: Readonly<{
    view: Awaited<ReturnType<typeof scene>>['view']
    access: Awaited<ReturnType<typeof scene>>['access']
    execution: Awaited<ReturnType<typeof scene>>['execution']
    opened: Awaited<ReturnType<typeof scene>>['opened']
  }>,
) {
  const record = (name: string) =>
    given.view.entries.record({
      ...given.access,
      execution: given.execution,
      operation: operation(name),
      authority: given.opened.authority,
      entry: sampleStartFence('once'),
    })
  const first = ok(await record('fence-1'))
  expect(await record('fence-1')).toEqual({ ok: first })
  return record('fence-2')
}

it('the memory journal refuses a second start fence of one Tool operation', async () => {
  expect(await secondFence(await scene('fence-once'))).toMatchObject({
    failure: { kind: 'conflict' },
  })
})

it('the stored journal refuses a second start fence of one Tool operation', async () => {
  const s = await sqlScene('fence-once')
  try {
    const opened = ok(await s.view.journal.open(s.openInput))
    const given = { view: s.view, access: s.access, execution: s.execution, opened }
    expect(await secondFence(given as never)).toMatchObject({ failure: { kind: 'conflict' } })
  } finally {
    await s.close()
  }
})
