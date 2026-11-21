import { describe, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { createSqlWorkspaceStore } from '../../src/storage/store.ts'

const BINDING = { combinationVersion: 'v', manifestDigest: 'd' }
const COMMAND = { tenant: 't', operation: 'op', digest: 'x' } as never

/** A storage that answers what it is told and counts what it was asked. */
function storage(answers: { commit?: () => unknown; read?: (key: string) => unknown }) {
  const asked = { commit: 0, read: 0 }
  const fake = {
    commit: async () => {
      asked.commit += 1
      return answers.commit?.()
    },
    read: async (input: { requestKey: string }) => {
      asked.read += 1
      return answers.read?.(input.requestKey)
    },
  } as unknown as SqlStorage
  return { fake, asked }
}

describe('the SQL repository says what it does not know', () => {
  it('without a binding nothing is sent: a commit is rolled back and a read is unavailable', async () => {
    const { fake, asked } = storage({})
    const store = createSqlWorkspaceStore({ storage: fake, bind: async () => null })
    expect(await store.register(COMMAND)).toEqual({ kind: 'rolled-back' })
    expect(await store.state('t', 'w')).toEqual({ kind: 'unavailable' })
    expect(asked).toEqual({ commit: 0, read: 0 })
  })

  it('a read answers the output of its own request and nothing else', async () => {
    const answered = (read: (key: string) => unknown) =>
      createSqlWorkspaceStore({
        storage: storage({ read }).fake,
        bind: async () => BINDING,
      }).memberships('t')
    expect(await answered(requestKey => ({ kind: 'read', requestKey, output: [] }))).toEqual({
      kind: 'read',
      value: [],
    })
    const unavailable = { kind: 'unavailable' }
    expect(await answered(requestKey => ({ kind: 'failed', requestKey, output: [] }))).toEqual(
      unavailable,
    )
    expect(await answered(() => ({ kind: 'read', requestKey: 'another', output: [] }))).toEqual(
      unavailable,
    )
    expect(
      await answered(() => {
        throw new Error('storage down')
      }),
    ).toEqual(unavailable)
  })

  it('a commit the storage cannot vouch for is unknown, not rolled back', async () => {
    const committed = (commit: () => unknown) =>
      createSqlWorkspaceStore({
        storage: storage({ commit }).fake,
        bind: async () => BINDING,
      }).register(COMMAND)
    expect(await committed(() => ({ kind: 'unknown' }))).toEqual({ kind: 'unknown' })
    expect(
      await committed(() => {
        throw new Error('storage down')
      }),
    ).toEqual({ kind: 'unknown' })
    expect(await committed(() => ({ kind: 'rejected' }))).toEqual({ kind: 'rolled-back' })
  })
})
