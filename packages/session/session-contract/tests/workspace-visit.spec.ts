import { expect, it } from 'vitest'
import { activeWorkspaceVisit } from '../src/workspace-visit.ts'

const binding = { workspace: 'app', instance: 'one', generation: '0' }
const visit = (batch: string, ...directories: string[]) => ({ ...binding, batch, directories })

it('reconstructs the continuation from the last foreground batch, including all parallel results', () => {
  const docs = activeWorkspaceVisit(undefined, visit('call-group-1', 'docs'))
  const both = activeWorkspaceVisit(docs, visit('call-group-1', 'pay'))
  expect(both.directories).toEqual(['docs', 'pay'])
  expect(activeWorkspaceVisit(both, visit('call-group-2', 'pay')).directories).toEqual(['pay'])
})

it('isolates equal batch names at a new binding and keeps repeated receipts idempotent', () => {
  const pay = visit('group', 'pay')
  const one = activeWorkspaceVisit(undefined, pay)
  expect(activeWorkspaceVisit(one, pay)).toEqual(one)
  expect(
    activeWorkspaceVisit(one, { ...pay, generation: '2', directories: ['docs'] }).directories,
  ).toEqual(['docs'])
})

it('merges unbatched visits in order within the same binding only', () => {
  const previous = visit('group', 'z')
  const incoming = { ...binding, directories: ['a'] }
  expect(activeWorkspaceVisit(previous, incoming)).toEqual({
    ...incoming,
    batch: 'group',
    directories: ['a', 'z'],
  })
  for (const change of [{ workspace: 'other' }, { instance: 'other' }]) {
    const foreign = { ...incoming, ...change }
    expect(activeWorkspaceVisit(previous, foreign)).toStrictEqual(foreign)
  }
})
