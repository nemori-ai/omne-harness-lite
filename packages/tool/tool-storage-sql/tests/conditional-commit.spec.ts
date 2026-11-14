import { afterEach, describe, expect, it } from 'vitest'
import type { CommitRequestV2, CommitResultV2, SqlStorage } from '@omne-harness/sql-contract'
import type { LedgerCommitInput, LedgerDomain } from '@omne-harness/tool'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { createSqlToolConditionalCommit, createSqlToolLedgerStore } from '../src/index.ts'
import { openApp, TENANT_A, UNREGISTERED, type App } from './fixtures/app.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

const revision = (value: string) => {
  const decoded = decodeToolRevision(value)
  if (!('ok' in decoded)) throw new Error('not a revision')
  return decoded.ok
}
const host: LedgerDomain = { kind: 'host', tenant: TENANT_A, key: 'start-coordinator' }
const ledger = (domain: LedgerDomain = host): LedgerCommitInput => ({
  domain,
  expected: revision('0'),
  revision: revision('1'),
  writes: [{ kind: 'put', record: { kind: 'host', host: { key: 'acceptance-1', value: {} } } }],
})
const condition = {
  combinationVersion: 'start-condition/1',
  manifestDigest: 'c'.repeat(64),
  commands: [
    { participant: 'owner.projection', facts: { binding: 'b' } },
    { participant: 'basis.guard', facts: { digest: 'sha256:basis' } },
  ],
}

type Stop = Readonly<{ participant: string; reply: Readonly<Record<string, unknown>> }>

async function world(stop?: Stop | 'none') {
  const app = await openApp()
  opened.push(app)
  const seen: CommitRequestV2[] = []
  let reads = 0
  const storage = {
    database: app.options.storage.database,
    read: (input: Parameters<SqlStorage['read']>[0]) => {
      reads += 1
      return app.options.storage.read(input)
    },
    commit: async (request: CommitRequestV2) => {
      seen.push(request)
      const base = {
        identity: request.identity,
        inputDigest: 'd'.repeat(64),
        combinationVersion: request.combinationVersion,
        manifestDigest: request.manifestDigest,
        recalled: false,
      }
      return (stop === undefined
        ? { ...base, kind: 'committed', responses: [] }
        : {
            ...base,
            kind: 'rolled_back',
            responses: stop === 'none' ? [] : [{ ...stop, protocol: '1' }],
          }) as unknown as CommitResultV2
    },
  } as unknown as SqlStorage
  return {
    seen,
    reads: () => reads,
    store: createSqlToolLedgerStore({ ...app.options, storage }),
    commit: createSqlToolConditionalCommit({ ...app.options, storage }),
  }
}

describe('conditional ledger commit over SQL', () => {
  it('sends the condition commands before the ledger write, under the combination of the condition', async () => {
    const w = await world()
    expect(await w.commit.commit({ condition, ledger: ledger() })).toEqual({ kind: 'committed' })
    expect(w.seen).toHaveLength(1)
    const request = w.seen[0]!
    expect(request.combinationVersion).toBe('start-condition/1')
    expect(request.manifestDigest).toBe('c'.repeat(64))
    expect(request.identity.operation).toBe('tool.ledger')
    expect(request.commands.map(command => command.participant)).toEqual([
      'owner.projection',
      'basis.guard',
      'tool',
    ])
    expect(request.commands.slice(0, 2)).toEqual(condition.commands)
    expect(request.commands[2]!.facts).toMatchObject({
      intent: 'ledger',
      expected: '0',
      revision: '1',
    })
    expect(request.commands[2]!.facts['writes']).toHaveLength(1)
  })

  it('keeps the ledger snapshot of the store current: the next read sees the write and reads no storage', async () => {
    const w = await world()
    expect(await w.store.read(host)).toMatchObject({ kind: 'complete', revision: '0', records: [] })
    const before = w.reads()
    expect(await w.commit.commit({ condition, ledger: ledger() })).toEqual({ kind: 'committed' })
    const after = await w.store.read(host)
    expect(after).toMatchObject({ kind: 'complete', revision: '1' })
    if (after.kind !== 'complete') throw new Error('unreachable')
    expect(after.records).toHaveLength(1)
    expect(w.reads()).toBe(before)
  })

  it.each([
    { kind: 'conflict', basis: { reason: 'permission-basis-changed' } },
    { kind: 'unsupported', basis: { reason: 'binding' } },
    { kind: 'failed', category: 'participant_threw', diagnostic: 'x' },
  ])('answers condition-failed when a condition participant stops with $kind', async reply => {
    const w = await world({ participant: 'basis.guard', reply })
    expect(await w.commit.commit({ condition, ledger: ledger() })).toEqual({
      kind: 'condition-failed',
    })
  })

  it('keeps the revision conflict of the ledger apart from a failed condition', async () => {
    const w = await world({
      participant: 'tool',
      reply: { kind: 'conflict', basis: { reason: 'revision', current: '3' } },
    })
    expect(await w.commit.commit({ condition, ledger: ledger() })).toEqual({
      kind: 'conflict',
      current: revision('3'),
    })
  })

  it.each([
    ['no commands', { ...condition, commands: [] }],
    ['no combination', { manifestDigest: condition.manifestDigest, commands: condition.commands }],
    [
      'a command of the tool participant',
      { ...condition, commands: [{ participant: 'tool', facts: {} }] },
    ],
    ['a command without facts', { ...condition, commands: [{ participant: 'owner.projection' }] }],
    ['no manifest digest', { ...condition, manifestDigest: undefined }],
    ['a command that is null', { ...condition, commands: [null] }],
    [
      'a command whose facts are null',
      { ...condition, commands: [{ participant: 'p', facts: null }] },
    ],
    [
      'a participant that is not a string',
      { ...condition, commands: [{ participant: 1, facts: {} }] },
    ],
    [
      'one malformed command after a well-formed one',
      { ...condition, commands: [condition.commands[0], { participant: 'owner.projection' }] },
    ],
  ])('rejects a condition with %s and sends nothing', async (_name, malformed) => {
    const w = await world()
    expect(await w.commit.commit({ condition: malformed, ledger: ledger() })).toEqual({
      kind: 'rejected',
      reason: 'start condition: not SQL commands',
    })
    expect(w.seen).toEqual([])
  })

  it('does not read a rollback without any response as a failed condition', async () => {
    const w = await world('none')
    const answer = await w.commit.commit({ condition, ledger: ledger() })
    expect(answer.kind).not.toBe('condition-failed')
    expect(answer.kind).not.toBe('committed')
  })

  it('rejects a ledger write whose host value is not JSON data and sends nothing', async () => {
    const w = await world()
    const writes: LedgerCommitInput['writes'] = [
      { kind: 'put', record: { kind: 'host', host: { key: 'acceptance-1', value: () => 0 } } },
    ]
    const answer = await w.commit.commit({ condition, ledger: { ...ledger(), writes } })
    expect(answer).toMatchObject({ kind: 'rejected' })
    expect(answer.kind === 'rejected' && answer.reason).toContain('is not JSON data')
    expect(w.seen).toEqual([])
  })

  it('answers unavailable for a tenant without a published domain and sends nothing', async () => {
    const w = await world()
    const answer = await w.commit.commit({
      condition,
      ledger: ledger({ ...host, tenant: UNREGISTERED }),
    })
    expect(answer.kind).toBe('unavailable')
    expect(w.seen).toEqual([])
  })
})
