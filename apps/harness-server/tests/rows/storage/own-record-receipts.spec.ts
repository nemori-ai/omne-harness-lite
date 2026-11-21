// @module-tag slow
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  sqliteFiles,
  toolCallsThenText,
} from '../../support/release-tree.ts'

const OWN_RECORD = /^(aop_|pre_|sop_|ad0|mop_)/

function receiptOperations(storageRoot: string): string[] {
  return sqliteFiles(storageRoot).flatMap(file => {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_sql_receipt'")
        .get()
      if (table === undefined) return []
      return (
        db.prepare('SELECT operation FROM _sql_receipt').all() as { operation: string }[]
      ).map(row => row.operation)
    } finally {
      db.close()
    }
  })
}

it('a turn with a tool call leaves no storage receipt for the operations their own records recognise', async () => {
  await onReleaseTree(
    {
      permission: 'bypass-permissions',
      script: toolCallsThenText(() => [
        {
          id: 'call_ask',
          tool: 'Ask',
          arguments: JSON.stringify({ command: 'no-such-command', params: {} }),
        },
      ]),
    },
    async tree => {
      const session = await tree.startSession('Use a tool, then finish.')
      const history = await pollUntil(
        'the run ends',
        () => historyOf(tree, session),
        seen => seen.some(entry => entry.kind === 'run.terminal'),
      )
      expect(JSON.stringify(history)).toContain('call_ask')
      expect(receiptOperations(tree.storageRoot).filter(name => OWN_RECORD.test(name))).toEqual([])
    },
  )
})
