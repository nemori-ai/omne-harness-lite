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

const ROWS = ['runtime-context-tenant-scope', 'session-intake-budget', 'workspace-outside-files']

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
    'starts without them and a session talks: the pending limit is then the one of the storage row',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = { script: toolCallsThenText(() => []), withoutRows: ROWS }
      const exitCode = await onReleaseTree(options, async tree => {
        const ids = tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])
        expect(ids.filter(id => ROWS.includes(String(id)))).toEqual([])
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
})
