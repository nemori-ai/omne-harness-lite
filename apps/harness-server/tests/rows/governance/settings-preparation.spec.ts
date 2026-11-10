import { afterEach, expect, it } from 'vitest'
import { settingsPreparationWorld } from './settings-preparation-world.ts'

const worlds: Awaited<ReturnType<typeof settingsPreparationWorld>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
async function open() {
  const w = await settingsPreparationWorld()
  worlds.push(w)
  return w
}

it('prepares and commits through actual native owners, Governance, Settings and Identity', async () => {
  const w = await open()
  const result = await w.prepared.prepareChange(w.principal, w.command)
  expect(result).toMatchObject({ kind: 'prepared' })
  if (result.kind !== 'prepared') throw new Error(JSON.stringify(result))
  expect(await w.captureSnapshot(w.epoch, 'management')).toMatchObject({
    values: { presence: 'absent', view: { state: { revision: 0 } } },
  })
  const input = { requestId: 'commit', preparation: result.preparation }
  expect(await w.prepared.commitChange(w.principal, input)).toMatchObject({
    kind: 'committed',
    revision: 1,
    changed: true,
  })
  expect(await w.captureSnapshot(w.epoch, 'management')).toMatchObject({
    values: { presence: 'present', view: { state: { revision: 1 } } },
  })
  expect(await w.prepared.commitChange(w.principal, input)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  expect(await w.prepared.getOperation(w.principal, result.preparation.operation)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
})

it('withdrawal before commit prevents a prepared command from writing', async () => {
  const w = await open()
  const result = await w.prepared.prepareChange(w.principal, w.command)
  if (result.kind !== 'prepared') throw new Error(JSON.stringify(result))
  expect(await w.withdraw()).toMatchObject({ kind: 'released' })
  expect(
    await w.prepared.commitChange(w.principal, {
      requestId: 'commit',
      preparation: result.preparation,
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
  expect(await w.prepared.getOperation(w.principal, result.preparation.operation)).toMatchObject({
    kind: 'pending',
    attempt: null,
  })
  expect(
    await w.prepared.readChanges(w.principal, { target: w.target, afterRevision: 0, limit: 10 }),
  ).toMatchObject({ kind: 'changes', changes: [] })
})

it('commit before withdrawal retains the original result without a fresh target snapshot', async () => {
  const w = await open()
  const result = await w.prepared.prepareChange(w.principal, w.command)
  if (result.kind !== 'prepared') throw new Error(JSON.stringify(result))
  const input = { requestId: 'commit', preparation: result.preparation }
  expect(await w.prepared.commitChange(w.principal, input)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  expect(await w.withdraw()).toMatchObject({ kind: 'released' })
  expect(await w.prepared.commitChange(w.principal, input)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
})

it('competing prepared commands cannot both consume the same Settings revision', async () => {
  const w = await open()
  const results = await Promise.all(
    ['one', 'two'].map(operationId =>
      w.prepared.prepareChange(w.principal, { ...w.command, operationId }),
    ),
  )
  const commits = await Promise.all(
    results.map(result => {
      if (result.kind !== 'prepared') throw new Error(JSON.stringify(result))
      return w.prepared.commitChange(w.principal, {
        requestId: 'commit',
        preparation: result.preparation,
      })
    }),
  )
  expect(commits.filter(value => value.kind === 'committed')).toHaveLength(1)
  expect(commits.filter(value => value.kind === 'aborted')).toEqual([
    expect.objectContaining({ reason: 'revision_conflict' }),
  ])
  expect(await w.captureSnapshot(w.epoch, 'management')).toMatchObject({
    values: { view: { state: { revision: 1 } } },
  })
})

it('owner revision changes invalidate only the attempt and require explicit preparation', async () => {
  const w = await open()
  const first = await w.prepared.prepareChange(w.principal, w.command)
  if (first.kind !== 'prepared') throw new Error(JSON.stringify(first))
  expect(
    await w.owner.changeHolding({
      operationId: 'disable',
      holdingRef: w.target.targetRef,
      scopeRef: w.target.scopeRef,
      expectedRevision: 1,
      change: { kind: 'setEnabled', enabled: false },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(
    await w.prepared.commitChange(w.principal, {
      requestId: 'commit',
      preparation: first.preparation,
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'basis_changed' })
  expect(await w.prepared.getOperation(w.principal, first.preparation.operation)).toMatchObject({
    kind: 'pending',
    attempt: null,
  })
  const second = await w.prepared.prepareChange(w.principal, w.command)
  if (second.kind !== 'prepared') throw new Error(JSON.stringify(second))
  expect(second.preparation.attemptId).not.toBe(first.preparation.attemptId)
  expect(
    await w.prepared.commitChange(w.principal, {
      requestId: 'commit-disabled-target',
      preparation: second.preparation,
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
})

it('rejects a foreign target and preserves cancellation through actual recovery', async () => {
  const w = await open()
  expect(
    await w.prepared.prepareChange(w.principal, {
      ...w.command,
      target: { ...w.target, scopeRef: 'foreign' },
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'forbidden' })
  const first = await w.prepared.prepareChange(w.principal, w.command)
  if (first.kind !== 'prepared') throw new Error(JSON.stringify(first))
  expect(
    await w.prepared.cancelChange(w.principal, {
      requestId: 'cancel',
      operation: first.preparation.operation,
    }),
  ).toMatchObject({ kind: 'aborted', reason: 'cancelled' })
  expect(
    await w.prepared.commitChange(w.principal, {
      requestId: 'late-commit',
      preparation: first.preparation,
    }),
  ).toMatchObject({ kind: 'aborted', reason: 'cancelled' })
  expect(await w.captureSnapshot(w.epoch, 'management')).toMatchObject({
    values: { presence: 'absent' },
  })
})
