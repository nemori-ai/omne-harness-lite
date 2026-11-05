// `session-storage` 行交出的 `sessionTransactions` 逐个转交 session-storage-sql 端口的成员（R2-D254）。漏掉一个时，
// 消费方看到的是「没有这个成员」，不是失败：漏掉 `commitLog` 时 AD-02 每次答「the Session transactions offer no
// commitLog」，`input-taken` 解释不成 `run.batch-taken`，F3 的 tryFinish 因此每次冲突。这里对照
// `SessionTransactionPort` 的全部成员核对一遍。
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

/** Every member of `SessionTransactionPort`; the record makes a new port member a type error here. */
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
