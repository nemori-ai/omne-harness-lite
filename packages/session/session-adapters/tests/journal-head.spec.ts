// The direct counter-example of the second position source (session-adapters SPEC "位置的唯一来源"):
// a material preserve takes one publication, and the core's next command must append at the
// publication after it. With a position of its own the core appended at one the store had passed,
// the provider found no batch after its head and stored an envelope alone: the facts of the commit
// were lost. What is checked, on the node:sqlite double: after a preserve, the next commit's batch
// still carries the family facts of the commit (its cursor move), with the core's envelope.
import { describe, expect, it } from 'vitest'
import type { AgentCheckpoint, AgentJournal, Material } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const CONSUMER = { owner: 'suite', work: 'work', position: 'at', purpose: 'action' }

function factsMaterial(name: string): Material<ContentBlock> {
  return {
    kind: 'facts',
    schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
    value: { kind: 'string', value: name },
  }
}

type Journal = AgentJournal<string>
type Authority = Parameters<Journal['commit']>[0]['authority']

async function commit(
  s: SqlScene,
  journal: Journal,
  authority: Authority,
  name: string,
  change: (checkpoint: AgentCheckpoint) => AgentCheckpoint,
) {
  const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
  return journal.commit({
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

/** The family kinds of the last publication of the scene's session. */
function lastFamilyKinds(s: SqlScene): string[] {
  const rows = s.controls?.select(
    `SELECT kind, body FROM er_fact WHERE session = '${s.access.session}' AND pub = (SELECT MAX(pub) FROM er_fact WHERE session = '${s.access.session}') ORDER BY ord`,
  ).rows
  return (rows ?? [])
    .map(row => String(row[0]))
    .filter(kind => kind !== 'batch' && !kind.startsWith('core.'))
}

/** The envelope digest of the last publication: the core's key, or the provider's digest. */
function lastEnvelopeDigest(s: SqlScene): string {
  const rows = s.controls?.select(
    `SELECT body FROM er_fact WHERE session = '${s.access.session}' AND ord = 0 AND pub = (SELECT MAX(pub) FROM er_fact WHERE session = '${s.access.session}')`,
  ).rows
  return String((JSON.parse(String(rows?.[0]?.[0] ?? '{}')) as { digest?: string }).digest ?? '')
}

describe('the head of the provider and the log of the core across a material preserve', () => {
  it('the commit after a preserve still stores the facts of the core, with the core envelope', async () => {
    const s = await sqlScene('head-preserve')
    const journal = s.view.journal
    const authority = ok(await journal.open(s.openInput)).authority
    ok(await commit(s, journal, authority, 'before', c => ({ ...c, position: 'E2' })))
    expect(lastFamilyKinds(s)).toEqual(['cursor.moved'])
    expect(lastEnvelopeDigest(s)).toMatch(/^commit:/)

    ok(
      await s.view.materials.preserve({
        ...s.access,
        execution: s.execution,
        identity: 'kept',
        consumer: CONSUMER,
        value: factsMaterial('kept'),
      }),
    )
    expect(lastFamilyKinds(s)).toEqual(['material.preserved'])

    ok(await commit(s, journal, authority, 'after', c => ({ ...c, position: 'E3' })))
    expect(lastFamilyKinds(s)).toEqual(['cursor.moved'])
    expect(lastEnvelopeDigest(s)).toMatch(/^commit:/)
  })
})
