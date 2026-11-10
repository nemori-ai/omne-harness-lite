// The conditional commit sends the condition commands and the ledger write as one SQL operation.
// These cases check the request it builds and how it reads the answer. The storage is scripted:
// the test provider of this member runs only the `tool` participant. The application tests run a
// real condition participant with the real provider.
import { afterEach, describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type { CommitRequestV2, CommitResultV2, SqlStorage } from '@omne-harness/sql-contract'
import type { LedgerCommitInput, LedgerDomain } from '@omne-harness/tool'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { createSqlToolConditionalCommit } from '../src/index.ts'
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
const ledger = (domain: LedgerDomain = host): LedgerCommitInput<ContentBlock> => ({
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

async function world(stop?: Stop) {
  const app = await openApp()
  opened.push(app)
  const seen: CommitRequestV2[] = []
  const storage = {
    commit: async (request: CommitRequestV2) => {
      seen.push(request)
      const base = {
        identity: request.identity,
        inputDigest: 'd'.repeat(64),
        combinationVersion: request.combinationVersion,
        manifestDigest: request.manifestDigest,
      }
      return (stop === undefined
        ? { ...base, kind: 'committed', responses: [] }
        : {
            ...base,
            kind: 'rolled_back',
            responses: [{ ...stop, protocol: '1' }],
          }) as unknown as CommitResultV2
    },
  } as unknown as SqlStorage
  return { seen, commit: createSqlToolConditionalCommit<ContentBlock>({ ...app.options, storage }) }
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
  ])('rejects a condition with %s and sends nothing', async (_name, malformed) => {
    const w = await world()
    expect(await w.commit.commit({ condition: malformed, ledger: ledger() })).toMatchObject({
      kind: 'rejected',
    })
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
