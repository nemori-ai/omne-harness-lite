// TS-02: how the answer of one SQL commit becomes the answer of the port. A reason that comes from
// the state of the storage at this moment answers `unavailable`, because the same commit can be
// accepted later; a reason that comes from the commit itself or from the assembly answers
// `rejected`, because the same commit is refused again whenever it is sent (sql-contract
// 「提交拒绝原因的定性」).
import { afterEach, describe, expect, it } from 'vitest'
import type { CommitRejectReason, CommitResultV2, SqlStorage } from '@omne-harness/sql-contract'
import type { LedgerCommitInput, LedgerDomain, LedgerRecord } from '@omne-harness/tool'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { createSqlToolLedgerStore } from '../src/index.ts'
import { openApp, TENANT_A, TENANT_B, type App } from './fixtures/app.ts'

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

async function app(input: Parameters<typeof openApp>[0] = {}): Promise<App> {
  const created = await openApp(input)
  opened.push(created)
  return created
}

function decoded<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error('fixture identity is not legal')
  return answer.ok
}

const revision = (text: string) => decoded(decodeToolRevision(text))
const callDomain: Extract<LedgerDomain, { kind: 'call' }> = {
  kind: 'call',
  tenant: TENANT_A,
  call: decoded(decodeToolCallId('call-1')),
}
const host = (key: string, value: unknown = key): LedgerRecord => ({
  kind: 'host',
  host: { key, value },
})

function commitOf(domain: LedgerDomain, ...records: LedgerRecord[]): LedgerCommitInput {
  return {
    domain,
    expected: revision('0'),
    revision: revision('1'),
    writes: records.map(record => ({ kind: 'put', record })),
  }
}

/** The storage of `a`, whose every commit answers `rejected_before_accept` with `reason`. */
function refusing(a: App, reason: CommitRejectReason): SqlStorage {
  return {
    ...a.options.storage,
    commit: request =>
      Promise.resolve({
        kind: 'rejected_before_accept',
        identity: request.identity,
        reason,
        diagnostic: null,
      } as CommitResultV2),
  }
}

// sql-contract「提交拒绝原因的定性」. `cancelled` is not classified there; it is read as transient.
const TRANSIENT: readonly CommitRejectReason[] = [
  'closing',
  'cancelled',
  'queue_full',
  'writer_not_current',
  'domain_unavailable',
]
const DEFINITE: readonly CommitRejectReason[] = [
  'field_missing',
  'unsupported_protocol',
  'participant_repeated',
  'facts_not_json',
  'command_limit',
  'combination_unregistered',
  'manifest_mismatch',
  'material_unavailable',
  'participant_not_in_combination',
  'participant_dependency_missing',
]

describe('a ledger commit rejected before acceptance', () => {
  it.each(TRANSIENT)('answers unavailable for the transient reason %s', async reason => {
    const a = await app()
    const store = createSqlToolLedgerStore({ ...a.options, storage: refusing(a, reason) })
    const answer = await store.commit(commitOf(callDomain, host('a')))
    expect(answer).toMatchObject({ kind: 'unavailable' })
    expect(answer.kind === 'unavailable' && answer.diagnostic).toContain(reason)
  })

  it.each(DEFINITE)('answers rejected for the definite reason %s', async reason => {
    const a = await app()
    const store = createSqlToolLedgerStore({ ...a.options, storage: refusing(a, reason) })
    expect(await store.commit(commitOf(callDomain, host('a')))).toEqual({
      kind: 'rejected',
      reason,
    })
  })

  it('answers rejected when the real provider finds the command over its byte limit', async () => {
    const a = await app({ maxCommandBytes: 4096 })
    const answer = await a.store.commit(commitOf(callDomain, host('big', 'x'.repeat(8192))))
    expect(answer).toEqual({ kind: 'rejected', reason: 'command_limit' })
    expect(await a.store.read(callDomain)).toEqual({
      kind: 'complete',
      revision: '0',
      records: [],
    })
  })
})

describe('a ledger commit the participant rolled back without a revision stop', () => {
  it('answers rejected with the failure category, and nothing of it took effect', async () => {
    const a = await app()
    // Statement 1 reads the revision, statement 2 writes `a`, statement 3 (writing `b`) fails.
    a.sqlite.failStatement(3)
    const answer = await a.store.commit(commitOf(callDomain, host('a'), host('b')))
    expect(answer).toMatchObject({ kind: 'rejected' })
    expect(answer.kind === 'rejected' && answer.reason.length).toBeGreaterThan(0)
    expect(await a.store.read(callDomain)).toEqual({
      kind: 'complete',
      revision: '0',
      records: [],
    })
  })
})

describe('a write set that is not strict JSON', () => {
  it('is rejected by the ledger store before any commit is sent', async () => {
    const a = await app()
    const before = a.faults.commits()
    expect(await a.store.commit(commitOf(callDomain, host('bad', 1n)))).toMatchObject({
      kind: 'rejected',
    })
    expect(a.faults.commits()).toBe(before)
  })
})

describe('a commit whose assertion names a domain of another tenant', () => {
  it('is rejected by the ledger store before any commit is sent', async () => {
    const a = await app()
    const before = a.faults.commits()
    const foreign: LedgerDomain = { kind: 'host', tenant: TENANT_B, key: 'guards' }
    expect(
      await a.store.commit({
        ...commitOf(callDomain, host('a')),
        asserts: [{ domain: foreign, revision: revision('0') }],
      }),
    ).toMatchObject({ kind: 'rejected' })
    expect(a.faults.commits()).toBe(before)
    expect(await a.store.read(callDomain)).toEqual({
      kind: 'complete',
      revision: '0',
      records: [],
    })
  })
})
