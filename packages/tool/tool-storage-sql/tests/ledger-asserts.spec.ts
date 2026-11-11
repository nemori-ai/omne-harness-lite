// TS-11 at the SQL layer: the read-set assertions of a ledger commit are evaluated when the SQL
// operation executes, in the participant's transaction, not when the adapter submits the commit.
// Two cases the conformance suite cannot express: a commit held in the admission queue while the
// asserted domain moves, and two connections over the same database files racing an assertion
// against a write of the asserted domain. The replaced `guarded-host-commit` tests covered the
// same two shapes for the special-case port this one supersedes.
import { afterEach, expect, it } from 'vitest'

import { createSqlToolLedgerStore } from '../src/index.ts'
import type { LedgerCommitInput, LedgerDomain } from '@omne-harness/tool'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { openApp, TENANT_A, type App } from './fixtures/app.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0).reverse()) app.close()
})

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

const revision = (value: string) => ok(decodeToolRevision(value))
const written: LedgerDomain = { kind: 'host', tenant: TENANT_A, key: 'start@call-1' }
const asserted: LedgerDomain = { kind: 'host', tenant: TENANT_A, key: 'start-guards' }
const acceptance = {
  kind: 'host',
  host: { key: 'acceptance', value: { permit: 'sha256:permit' } },
} as const
const guard = { kind: 'host', host: { key: 'guard', value: { revision: '1' } } } as const

/** A commit of `written` at revision 0 that holds only while `asserted` is still at `expected`. */
const assertedCommit = (expected = '0'): LedgerCommitInput => ({
  domain: written,
  expected: revision('0'),
  revision: revision('1'),
  writes: [{ kind: 'put', record: acceptance }],
  asserts: [{ domain: asserted, revision: revision(expected) }],
})

/** Advances `asserted` from revision 0 to 1. */
const advance = (): LedgerCommitInput => ({
  domain: asserted,
  expected: revision('0'),
  revision: revision('1'),
  writes: [{ kind: 'put', record: guard }],
})

async function app(): Promise<App> {
  const created = await openApp()
  opened.push(created)
  return created
}

it('a commit held in the admission queue is judged by the asserted domain when it executes, not when it was submitted', async () => {
  const a = await app()
  // The commit is accepted into the queue and its answer is `unknown`; nothing has run yet.
  a.faults.armCommit('delayed', 'ledger')
  expect(await a.store.commit(assertedCommit())).toMatchObject({ kind: 'unknown' })
  // The asserted domain moves while the commit waits.
  expect(await a.store.commit(advance())).toEqual({ kind: 'committed' })
  await a.faults.land()
  // The held commit ran against the moved domain: the assertion failed and it wrote nothing.
  expect(await a.store.read(written)).toEqual({ kind: 'complete', revision: '0', records: [] })
  expect(await a.store.read(asserted)).toEqual({
    kind: 'complete',
    revision: '1',
    records: [guard],
  })
})

it('a commit held in the admission queue lands when the asserted domain did not move', async () => {
  const a = await app()
  a.faults.armCommit('delayed', 'ledger')
  expect(await a.store.commit(assertedCommit())).toMatchObject({ kind: 'unknown' })
  await a.faults.land()
  expect(await a.store.read(written)).toEqual({
    kind: 'complete',
    revision: '1',
    records: [acceptance],
  })
  expect(await a.store.read(asserted)).toEqual({ kind: 'complete', revision: '0', records: [] })
})

it('two connections: a write of the asserted domain through the other connection fails the assertion at execution', async () => {
  const first = await app()
  const second = await openApp({ directory: first.directory, keep: true })
  opened.push(second)
  // The first connection's commit pauses after submission, before the SQL operation runs.
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const paused = createSqlToolLedgerStore({
    ...first.options,
    storage: {
      ...first.options.storage,
      commit: async request => {
        entered.resolve()
        await release.promise
        return first.options.storage.commit(request)
      },
    },
  })
  const held = paused.commit(assertedCommit())
  await entered.promise
  // The second connection moves the asserted domain in the window.
  expect(await second.store.commit(advance())).toEqual({ kind: 'committed' })
  release.resolve()
  expect(await held).toEqual({ kind: 'conflict', current: '0' })
  expect(await second.store.read(written)).toEqual({ kind: 'complete', revision: '0', records: [] })
  // The same commit re-decided on the moved domain lands, and the other connection sees it.
  expect(await first.store.commit(assertedCommit('1'))).toEqual({ kind: 'committed' })
  expect(await second.store.read(written)).toEqual({
    kind: 'complete',
    revision: '1',
    records: [acceptance],
  })
})

it('two connections racing an asserted commit against the asserted write agree on one order', async () => {
  const first = await app()
  const second = await openApp({ directory: first.directory, keep: true })
  opened.push(second)
  const [held, moved] = await Promise.all([
    first.store.commit(assertedCommit()),
    second.store.commit(advance()),
  ])
  expect(moved).toEqual({ kind: 'committed' })
  const outcome = await second.store.read(written)
  if (held.kind === 'committed')
    // The assertion held: the acceptance landed before the guard moved.
    expect(outcome).toEqual({ kind: 'complete', revision: '1', records: [acceptance] })
  else {
    // The guard moved first: the assertion failed and nothing was written.
    expect(held).toEqual({ kind: 'conflict', current: '0' })
    expect(outcome).toEqual({ kind: 'complete', revision: '0', records: [] })
  }
})
