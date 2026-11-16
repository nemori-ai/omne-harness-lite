import { describe, expect, it } from 'vitest'
import type { AgentCheckpoint, AgentJournal, ModelRetryState } from '@omne-harness/agent-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

type Journal = AgentJournal<string>
type Authority = Parameters<Journal['commit']>[0]['authority']

const retry: ModelRetryState = {
  failures: 2,
  since: '1970-01-01T00:00:00Z',
  notBefore: '1970-01-01T00:00:05.000Z',
}

async function opened(name: string) {
  const s = await sqlScene(name)
  const open = ok(await s.view.journal.open(s.openInput))
  return { s, authority: open.authority }
}

function load(s: SqlScene, journal: Journal = s.view.journal) {
  return journal.load({ ...s.access, execution: s.execution }).then(ok)
}

async function commit(
  s: SqlScene,
  authority: Authority,
  name: string,
  change: (checkpoint: AgentCheckpoint) => AgentCheckpoint,
) {
  const loaded = await load(s)
  return s.view.journal.commit({
    ...s.access,
    execution: s.execution,
    operation: operation(name),
    authority,
    expected: loaded.revision,
    checkpoint: change(loaded.checkpoint),
    state: { kind: 'advancing' },
    events: [],
    effects: [],
    caller: { kind: 'none' },
    replyAdmission: null,
    handoff: null,
    finish: null,
  })
}

function coldJournal(s: SqlScene): Journal {
  return createSessionLogJournal<string>({
    storage: s.storage,
    tenantDomainLookup: {
      lookup: () => Promise.resolve({ kind: 'ready' as const, domain: s.domain }),
    },
    sessionAccessCheck: {
      check: () => Promise.resolve({ kind: 'allowed' as const, evidence: evidence('access') }),
    },
    combination: s.combination,
  }).forSession(s.access).journal
}

function cursorBodies(s: SqlScene): string[] {
  const rows = s.controls?.select(
    `SELECT body FROM er_fact WHERE session = '${s.access.session}' AND kind = 'cursor.moved' ORDER BY pub`,
  ).rows
  return (rows ?? []).map(row => unpackText(row[0] as Uint8Array))
}

const at = (position: string) => (checkpoint: AgentCheckpoint) => ({ ...checkpoint, position })

describe('the session log Journal keeps the retry state of the main model call', () => {
  it('keeps a retry state that a commit carries, for the warm and a cold provider', async () => {
    const { s, authority } = await opened('model-retry-kept')
    ok(await commit(s, authority, 'retrying', c => ({ ...at('I8')(c), modelRetry: retry })))
    expect((await load(s)).checkpoint).toMatchObject({ position: 'I8', modelRetry: retry })
    expect((await load(s, coldJournal(s))).checkpoint.modelRetry).toEqual(retry)
  })

  it('a commit without a retry state writes and reads as before: no member anywhere', async () => {
    const { s, authority } = await opened('model-retry-absent')
    ok(await commit(s, authority, 'plain', at('I8')))
    const loaded = await load(s)
    expect(loaded.checkpoint.position).toBe('I8')
    expect(Object.hasOwn(loaded.checkpoint, 'modelRetry')).toBe(false)
    expect(Object.hasOwn((await load(s, coldJournal(s))).checkpoint, 'modelRetry')).toBe(false)
    expect(cursorBodies(s).some(body => body.includes('modelRetry'))).toBe(false)
  })

  it('a retry state cleared to null reads back as null', async () => {
    const { s, authority } = await opened('model-retry-cleared')
    ok(await commit(s, authority, 'retrying', c => ({ ...at('I8')(c), modelRetry: retry })))
    ok(await commit(s, authority, 'admitted', c => ({ ...at('I4')(c), modelRetry: null })))
    expect((await load(s)).checkpoint).toMatchObject({ position: 'I4', modelRetry: null })
    expect((await load(s, coldJournal(s))).checkpoint.modelRetry).toBeNull()
  })

  it('a retry state that only moves on is written again with its new value', async () => {
    const { s, authority } = await opened('model-retry-moved')
    ok(await commit(s, authority, 'first', c => ({ ...at('I8')(c), modelRetry: retry })))
    const next = { ...retry, failures: 3, notBefore: '1970-01-01T00:00:35.000Z' }
    ok(await commit(s, authority, 'second', c => ({ ...at('I8')(c), modelRetry: next })))
    expect((await load(s, coldJournal(s))).checkpoint.modelRetry).toEqual(next)
  })
})
