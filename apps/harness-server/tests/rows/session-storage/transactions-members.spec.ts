import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { SessionTransactionPort } from '@omne-harness/session-contract'
import { sessionTransactionsKey } from '@omne-harness/session-cordis-contract/cordis'
import { loadStorageTree, type LoadedTree } from '../storage/fixtures/tree.ts'

const live: LoadedTree[] = []
const bases: string[] = []

afterEach(async () => {
  while (live.length > 0) await live.pop()!.dispose()
  while (bases.length > 0) rmSync(bases.pop()!, { recursive: true, force: true })
})

async function load(): Promise<LoadedTree> {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'session-transactions-')))
  bases.push(base)
  const tree = await loadStorageTree({
    stateRoot: base,
    storageRoot: join(base, 'storage'),
    directoryFile: join(base, 'storage', 'tenant-domains.json'),
  })
  live.push(tree)
  if (tree.result.kind !== 'started')
    throw new Error(`tree not started: ${JSON.stringify(tree.result)}`)
  return tree
}

const MEMBERS: Readonly<Record<keyof SessionTransactionPort<unknown>, 'function' | 'object'>> = {
  commit: 'function',
  readWork: 'function',
  readInput: 'function',
  queryOperation: 'function',
  readModelSelection: 'function',
  queryControlOperation: 'function',
  commitEntries: 'function',
  commitLog: 'function',
  history: 'object',
  pending: 'function',
  directory: 'object',
  references: 'function',
  releasedScopes: 'function',
}

describe('the sessionTransactions of the session-storage row', () => {
  test('carries every member of the port, commitLog included', async () => {
    const tree = await load()
    const port = tree.service<SessionTransactionPort<string>>(sessionTransactionsKey) as unknown as
      | Record<string, unknown>
      | undefined
    if (port === undefined) throw new Error('the row provides no sessionTransactions')
    const missing = Object.entries(MEMBERS)
      .filter(([name, kind]) => typeof port[name] !== kind)
      .map(([name]) => name)
    expect(missing).toEqual([])
  })
})
