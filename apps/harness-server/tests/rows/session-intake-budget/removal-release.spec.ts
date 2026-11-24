// @module-tag slow
import { describe, expect, it } from 'vitest'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
} from '../../support/release-tree.ts'

const completed = (entries: readonly { kind: string }[]) =>
  JSON.stringify(entries.find(entry => entry.kind === 'run.terminal')).includes(
    '"outcome":"completed"',
  )

const SCOPE = 'runtime-context-tenant-scope'
const READERS = ['session-intake-budget', 'workspace-outside-files']
const ROWS = [SCOPE, ...READERS]

describe('the release tree and the rows of the tenant-level scope', () => {
  it(
    'reads the pending limit through the tenant-level scope while the rows are there, and a session talks',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const ids = tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])
        expect(ids).toEqual(expect.arrayContaining(ROWS))
        const session = await tree.startSession('hello')
        const entries = await pollUntil(
          'the Run to end',
          () => historyOf(tree, session),
          found => found.some(entry => entry.kind === 'run.terminal'),
        )
        expect(completed(entries)).toBe(true)
        const unread = tree.records.filter(record =>
          JSON.stringify(record).includes('the intake budget cannot be read'),
        )
        expect(unread).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'starts without the two rows that read these settings through it and a session talks: the pending limit is then the one of the storage row',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = { script: toolCallsThenText(() => []), withoutRows: READERS }
      const exitCode = await onReleaseTree(options, async tree => {
        const ids = tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])
        expect(ids.filter(id => READERS.includes(String(id)))).toEqual([])
        const session = await tree.startSession('hello')
        const entries = await pollUntil(
          'the Run to end',
          () => historyOf(tree, session),
          found => found.some(entry => entry.kind === 'run.terminal'),
        )
        expect(completed(entries)).toBe(true)
      })
      expect(exitCode).toBe(0)
    },
  )

  // The loop extensions a tenant enabled are read through this scope at every position: a tree
  // that cannot read them does not serve, it does not run the turns without them.
  it(
    'does not start accepting without the tenant-level scope itself',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = { script: toolCallsThenText(() => []), withoutRows: ROWS }
      await expect(onReleaseTree(options, async () => {})).rejects.toThrow(
        'the server did not start accepting',
      )
    },
  )
})
