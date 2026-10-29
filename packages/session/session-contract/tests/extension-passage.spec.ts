import { it, expect } from 'vitest'
import { open } from './scene.ts'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { openWork, type Waiting } from '@omne-harness/session-contract'

const waiting: Extract<Waiting, { kind: 'extension-passage' }> = {
  kind: 'extension-passage',
  passage: 'startup',
  position: 'execution_started',
  members: [{ card: evidence('card'), decision: evidence('chosen') }],
}
type OtherWaiting = Exclude<Waiting, { kind: 'producer' }>
async function project(value: OtherWaiting) {
  const s = await open(),
    { run } = await s.active()
  const result = await s.project(
    {
      ...s.base,
      run: run.run,
      execution: run.execution.execution,
      revision: '1',
      sequence: '1',
      source: evidence('original-wait'),
      consequences: [{ kind: 'registered-waiting', calls: [], other: [value] }],
    },
    operationId('waiting'),
  )
  return { s, result }
}
it('keeps actionless waiting unresolved even when an original decision reference exists', async () => {
  const { s, result } = await project(waiting)
  succeeded(result, 'original waiting')
  const snapshot = await s.read()
  expect(snapshot.waiting).toEqual([waiting])
  expect(openWork(snapshot)).not.toEqual(openWork({ ...snapshot, waiting: [] }))
})
for (const [name, value] of [
  ['empty passage', { ...waiting, passage: '' }],
  ['empty position', { ...waiting, position: '' }],
  ['duplicate cards', { ...waiting, members: [waiting.members[0], waiting.members[0]] }],
  ['action property', { ...waiting, members: [{ ...waiting.members[0], action: 'invented' }] }],
  [
    'incomplete card',
    { ...waiting, members: [{ card: { ...evidence('card'), digest: '' }, decision: null }] },
  ],
  [
    'incomplete decision',
    {
      ...waiting,
      members: [{ card: evidence('card'), decision: { ...evidence('answer'), record: '' } }],
    },
  ],
] as const)
  it(`rejects actionless waiting with ${name} without adding history or progress`, async () => {
    const { s, result } = await project(value as unknown as OtherWaiting)
    expect(result).toMatchObject({ failure: { kind: 'invalid' } })
    const snapshot = await s.read()
    expect(snapshot.waiting).toEqual([])
    expect(snapshot.run.kind === 'active' && snapshot.run.execution.readThrough).toBe('0')
  })
it('retains the existing action-bearing extension-batch branch', async () => {
  const value: Waiting = {
    kind: 'extension-batch',
    passage: 'before-action',
    position: 'before_action',
    members: [{ action: 'original-action', card: evidence('card'), decision: null }],
  }
  const { s, result } = await project(value)
  succeeded(result, 'original action waiting')
  expect((await s.read()).waiting).toEqual([value])
})
