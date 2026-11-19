import { describe, expect, it } from 'vitest'
import { encodeCompactionTaskRef, decodeCompactionTaskId } from '@omne-harness/agent-contract'
import {
  accountCodec,
  organizationCodec,
  tenant as composeTenant,
} from '@omne-harness/legal-identity'
import type { HistoryEntry } from '@omne-harness/session-contract'
import { sessionUsageScope } from '@omne-harness/usage-adapters'

const org = organizationCodec.parse(`org_${'0'.repeat(26)}`)
const acc = accountCodec.parse(`acc_${'1'.repeat(26)}`)
if (!org.ok || !acc.ok) throw new Error('fixture tenant')
const tenant = composeTenant(org.value, acc.value)
const owners = { agent: '@omne-harness/agent', compaction: '@omne-harness/context-compaction' }

/** A payload as the session history hands it out: the typed JSON tree, not plain JSON. */
const tree = (value: unknown): unknown => {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(value as object).map(([key, item]) => ({ key, value: tree(item) })),
  }
}
const entry = (kind: string, payload: unknown): HistoryEntry =>
  ({ kind, payload: tree(payload) }) as never
const started = (execution: string) => entry('run.started', { run: 'r', execution })
const compacted = (task: string) =>
  entry('message.compaction', {
    message: {
      derivation: { owner: 'compactor', record: task, revision: '1', digest: `sha256:${task}` },
    },
  })
const taskWork = (task: string) => {
  const id = decodeCompactionTaskId(task)
  if ('failure' in id) throw new Error('fixture task')
  const work = encodeCompactionTaskRef({
    authority: 'compactor',
    tenant,
    task: id.ok,
    requestDigest: `sha256:${task}`,
  })
  if ('failure' in work) throw new Error('fixture work')
  return work.ok
}

/** A history face answering these pages in turn, recording what it was asked. */
function history(pages: readonly unknown[]) {
  const asked: unknown[] = []
  let at = 0
  const answer = (input: unknown) => {
    asked.push(input)
    const page = pages[at]
    at += 1
    return page instanceof Error ? Promise.reject(page) : Promise.resolve(page)
  }
  return { face: { begin: answer, next: answer } as never, asked }
}
const page = (entries: readonly HistoryEntry[], next: string | null) => ({
  ok: { entries, next, exhausted: next === null },
})
const resolve = (face: unknown) =>
  sessionUsageScope(() => face as never, { owners, pageBytes: 4096 }).resolve({
    principal: 'reader',
    tenant,
    session: 's-1',
  })

describe('a session as usage consumer scopes (C20)', () => {
  it('gives its executions under the agent and its compactions under the compaction provider, over every page', async () => {
    const h = history([
      page([started('exec-1'), compacted('compaction/k1')], 'c-1'),
      page([started('exec-2'), started('exec-1')], null),
    ])
    expect(await resolve(h.face)).toEqual({
      ok: {
        kind: 'found',
        consumers: [
          { owner: owners.agent, works: ['exec-1', 'exec-2'] },
          { owner: owners.compaction, works: [taskWork('compaction/k1')] },
        ],
      },
    })
    expect(h.asked).toEqual([
      {
        principal: 'reader',
        tenant,
        session: 's-1',
        kinds: ['run.started', 'message.compaction'],
        from: null,
        direction: 'forward',
        pageBytes: 4096,
      },
      { principal: 'reader', tenant, session: 's-1', cursor: 'c-1' },
    ])
  })

  it('leaves out an empty group and the entries it cannot read', async () => {
    const h = history([
      page(
        [
          started('exec-1'),
          entry('run.started', { execution: '' }),
          compacted('not a task'),
          entry('message.compaction', { message: {} }),
        ],
        null,
      ),
    ])
    expect(await resolve(h.face)).toEqual({
      ok: { kind: 'found', consumers: [{ owner: owners.agent, works: ['exec-1'] }] },
    })
    expect(await resolve(history([page([], null)]).face)).toEqual({
      ok: { kind: 'found', consumers: [] },
    })
  })

  it('answers absent for a session that does not exist or is not this tenant’s, and unavailable otherwise', async () => {
    for (const kind of ['denied', 'invalid'])
      expect(await resolve(history([{ failure: { kind } }]).face), kind).toEqual({
        ok: { kind: 'absent' },
      })
    expect(
      await resolve(
        history([page([started('exec-1')], 'c-1'), { failure: { kind: 'unavailable' } }]).face,
      ),
    ).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'the session history answered unavailable' },
    })
    expect(await resolve(history([new Error('down')]).face)).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'the session history threw' },
    })
    expect(await resolve(undefined)).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'the session history is not here' },
    })
  })
})
