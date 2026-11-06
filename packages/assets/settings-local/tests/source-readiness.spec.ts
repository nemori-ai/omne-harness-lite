import { afterEach, expect, it } from 'vitest'
import type { CommitResultV2 } from '@omne-harness/sql-contract'
import {
  openSourceWorld,
  sourceRequest,
  sourceSnapshot,
  sourceUpdate,
} from './source-retention-world.ts'
import { sourceReadinessFactSchema } from '../src/source-readiness.ts'
const worlds: Awaited<ReturnType<typeof openSourceWorld>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
async function open(root?: string) {
  const w = await openSourceWorld(root)
  worlds.push(w)
  return w
}
function binding() {
  const update = sourceUpdate()
  return {
    identity: update.identity,
    attemptId: 'source-attempt',
    commandKind: 'change' as const,
    commandDigest: update.commandDigest,
  }
}
function observed(result: CommitResultV2) {
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  return sourceReadinessFactSchema.parse(
    result.responses.find(r => r.participant === 'fixture.source-readiness-sink')?.reply.response,
  )
}
it('reads actual pending and held state without consuming or changing it', async () => {
  const w = await open()
  expect(observed(await w.readiness(binding())).gate).toMatchObject({ pending: null, held: 0 })
  expect(
    (
      await w.write([
        { kind: 'reserve', request: sourceRequest(), snapshot: sourceSnapshot() },
        { kind: 'begin', update: sourceUpdate() },
      ])
    ).kind,
  ).toBe('committed')
  const before = await w.read({ kind: 'gate', source: sourceUpdate().source })
  const fact = observed(await w.readiness(binding()))
  expect(fact).toMatchObject({ binding: binding(), gate: { pending: sourceUpdate(), held: 1 } })
  const after = await w.read({ kind: 'gate', source: sourceUpdate().source })
  if (before.kind !== 'read' || after.kind !== 'read') throw new Error('read failed')
  expect(after.output).toEqual(before.output)
  expect(observed(await w.readiness(binding()))).toEqual(fact)
})
it('keeps a pending zero-hold gate visible after reopen and isolates another target', async () => {
  const w = await open()
  await w.write([{ kind: 'begin', update: sourceUpdate() }])
  await w.close()
  const reopened = await open(w.root)
  expect(observed(await reopened.readiness(binding())).gate).toMatchObject({
    pending: sourceUpdate(),
    held: 0,
  })
  const original = binding()
  const other = {
    ...original,
    identity: {
      ...original.identity,
      operation: {
        ...original.identity.operation,
        target: { ...original.identity.operation.target, targetRef: 'other' },
      },
    },
  }
  expect(observed(await reopened.readiness(other)).gate).toMatchObject({ pending: null, held: 0 })
})
it('binds the observation to the exact root and attempt for downstream consumption', async () => {
  const w = await open()
  const original = binding()
  for (const changed of [
    { ...original, attemptId: 'other-attempt' },
    { ...original, commandDigest: 'c'.repeat(64) },
    { ...original, identity: { ...original.identity, principalRef: 'other-admin' } },
  ])
    expect((await w.readiness(original, changed)).kind).toBe('rolled_back')
  expect(observed(await w.readiness(original)).binding).toEqual(original)
})
