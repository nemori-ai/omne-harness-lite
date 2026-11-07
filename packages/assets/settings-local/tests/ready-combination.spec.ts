import { afterEach, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { combinationManifest } from '@omne-harness/sql-contract'
import { openRecoveryWorld } from './recovery-world.ts'
import { openPreparationWorld, reply } from './preparation-world.ts'
const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of close.splice(0)) await fn()
})
async function setup(held = true, manifest = true) {
  const result = await openPreparationWorld({ held, manifest })
  close.push(() => result.world.close())
  return result
}

it('publishes prepared through the actual dependency graph without business or terminal effects', async () => {
  const s = await setup()
  expect(reply(await s.world.ready(s.current))).toMatchObject({
    result: { attempt: { status: { state: 'prepared', basis: s.current.basis } } },
  })
  expect(await s.world.read(s.request)).toMatchObject({
    output: {
      root: { status: { state: 'open' }, attempt: { status: { state: 'prepared' } } },
      terminal: null,
      gate: { held: 0, pending: null },
    },
  })
  expect(reply(await s.world.ready(s.current))).toMatchObject({
    result: { attempt: { status: { state: 'prepared' } } },
  })
  await s.world.close()
  const db = new DatabaseSync(
    join(s.world.root, 'domains', `${Buffer.from('intent-test').toString('hex')}.sqlite`),
    { readOnly: true },
  )
  try {
    for (const table of [
      'st_states',
      'st_changes',
      'st_operations',
      'st_terminals',
      'st_source_gate',
      'st_source_reservation',
    ])
      expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0)
  } finally {
    db.close()
  }
  const reopened = await openRecoveryWorld(s.world.root, s.input.identity.domain)
  close.push(() => reopened.close())
  expect(reply(await reopened.ready(s.current))).toMatchObject({
    result: { attempt: { status: { state: 'prepared' } } },
  })
})

it.each([
  { held: false, manifest: true, dependency: 'identity' },
  { held: true, manifest: false, dependency: 'sources' },
])(
  'keeps the attempt preparing when $dependency custody is missing',
  async ({ held, manifest, dependency }) => {
    const s = await setup(held, manifest)
    expect(reply(await s.world.ready(s.current))).toMatchObject({
      result: { kind: 'pending', dependency },
    })
    expect(await s.world.read(s.request)).toMatchObject({
      output: {
        root: { attempt: { status: { state: 'preparing', basis: null } } },
        terminal: null,
      },
    })
  },
)

it('refuses mismatched current input and changed basis without publishing prepared', async () => {
  const s = await setup()
  expect(
    (await s.world.ready(s.current, { binding: { ...s.current.binding, attemptId: 'other' } }))
      .kind,
  ).toBe('rolled_back')
  expect(
    reply(await s.world.ready({ ...s.current, basis: { ...s.current.basis, valueRevision: 1 } })),
  ).toMatchObject({
    result: { kind: 'rejected', reason: 'basis_changed' },
  })
  expect(await s.world.read(s.request)).toMatchObject({
    output: {
      root: { attempt: { status: { state: 'preparing' } } },
      terminal: null,
    },
  })
})

it('requires one current producer and one planner; no request can replace the current fact', async () => {
  const s = await setup()
  expect((await s.world.ready(s.current, { omitCurrent: true })).kind).toBe(
    'rejected_before_accept',
  )
  expect(
    combinationManifest({
      catalog: s.world.materials,
      participants: [...s.world.readyParticipants, 'settings.recovery-plan'],
    }).kind,
  ).toBe('combination_invalid')
  expect(await s.world.read(s.request)).toMatchObject({
    output: {
      root: { attempt: { status: { state: 'preparing' } } },
      terminal: null,
    },
  })
})

it('rolls publication back when a downstream participant fails', async () => {
  const s = await setup()
  expect((await s.world.ready(s.current, { rollback: true })).kind).toBe('rolled_back')
  expect(await s.world.read(s.request)).toMatchObject({
    output: {
      root: { attempt: { status: { state: 'preparing', basis: null } } },
      terminal: null,
    },
  })
  expect(reply(await s.world.ready(s.current))).toMatchObject({
    result: { attempt: { status: { state: 'prepared' } } },
  })
})

it.each([true, false])(
  'cannot revive an attempt after seal, ready first = %s',
  async readyFirst => {
    const s = await setup()
    if (readyFirst) expect((await s.world.ready(s.current)).kind).toBe('committed')
    expect((await s.world.run(s.request)).kind).toBe('committed')
    expect((await s.world.ready(s.current)).kind).toBe('rolled_back')
    expect(await s.world.read(s.request)).toMatchObject({
      output: {
        root: { status: { state: 'open' }, attempt: null },
        terminal: { state: 'aborted' },
      },
    })
  },
)

it('serializes concurrent ready and seal without leaving a live preparation', async () => {
  const s = await setup()
  const [ready, sealed] = await Promise.all([s.world.ready(s.current), s.world.run(s.request)])
  expect(['committed', 'rolled_back']).toContain(ready.kind)
  expect(sealed.kind).toBe('committed')
  expect(await s.world.read(s.request)).toMatchObject({
    output: {
      root: { status: { state: 'open' }, attempt: null },
      terminal: { state: 'aborted' },
    },
  })
})
