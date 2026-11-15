import { describe, expect, it } from 'vitest'
import type { AgentCheckpoint, AgentJournal } from '@omne-harness/agent-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'
import { toolCall } from './fixtures/tool-call.ts'

type Journal = AgentJournal<string>
type Authority = Parameters<Journal['commit']>[0]['authority']

function sceneOptions(s: SqlScene) {
  return {
    storage: s.storage,
    tenantDomainLookup: {
      lookup: () => Promise.resolve({ kind: 'ready' as const, domain: s.domain }),
    },
    sessionAccessCheck: {
      check: () => Promise.resolve({ kind: 'allowed' as const, evidence: evidence('access') }),
    },
    combination: s.combination,
  }
}

const cold = (s: SqlScene): Journal =>
  createSessionLogJournal<string>(sceneOptions(s)).forSession(s.access).journal

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

const load = async (s: SqlScene, journal: Journal) =>
  ok(await journal.load({ ...s.access, execution: s.execution }))

function largeMembers(s: SqlScene) {
  const tool = toolCall(s.access.tenant, 'bridge')
  const batch = {
    ...tool.batch,
    actions: tool.batch.actions.map(action => ({
      ...action,
      effectiveArguments: 'x'.repeat(6000),
    })),
  }
  const calls = [{ ...tool.pending, fixed: evidence(`request-${'y'.repeat(6000)}`) }]
  return { batch, calls }
}

describe('a checkpoint change spilled whole restores in order across provider copies', () => {
  it('a cold copy loads the spilled members; the writer loads a later move with them intact', async () => {
    const s = await sqlScene('bridge-spill')
    const writer = s.view.journal
    const authority = ok(await writer.open(s.openInput)).authority
    const { batch } = largeMembers(s)
    ok(await commit(s, writer, authority, 'large', c => ({ ...c, position: 'M6', batch })))
    const written = await load(s, writer)
    expect(written.checkpoint.position).toBe('M6')
    const other = cold(s)
    expect((await load(s, other)).checkpoint).toEqual(written.checkpoint)

    ok(await commit(s, other, authority, 'move', c => ({ ...c, position: 'W0' })))
    const moved = await load(s, writer)
    expect(moved.checkpoint).toEqual({ ...written.checkpoint, position: 'W0' })
    expect((await load(s, other)).checkpoint).toEqual(moved.checkpoint)
  })

  it('two large changes in a row both survive a rebuild', async () => {
    const s = await sqlScene('bridge-spill-twice')
    const writer = s.view.journal
    const authority = ok(await writer.open(s.openInput)).authority
    const { batch, calls } = largeMembers(s)
    ok(await commit(s, writer, authority, 'large-1', c => ({ ...c, position: 'M6', batch })))
    ok(await commit(s, writer, authority, 'large-2', c => ({ ...c, position: 'W0', calls })))
    const written = await load(s, writer)
    expect(written.checkpoint).toMatchObject({ position: 'W0', batch, calls })
    expect((await load(s, cold(s))).checkpoint).toEqual(written.checkpoint)
  })
})
