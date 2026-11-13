// What a joint commit of the Journal provider hands on (session-storage-sql「本批与提交通知」,
// RT-04): the storage answer goes to the one landing of session-storage-sql, which folds the batch
// of the Session participation and tells it to the notifiers registered on the database. The
// Session participation of an Agent journal commit is the fourth committer of the session log (the
// main reply and the tool messages go through it), so its batch is told like any other: once, with
// the revision, the batch evidence and the kinds the writer gave; a recall of the same Agent
// operation tells nothing. A Session reply the Journal cannot decode changes no Agent answer.
import type { SessionNotifier } from '@omne-harness/session-contract'
import { assistantMessage } from '@omne-harness/session-contract/testing'
import { registerSessionNotifier } from '@omne-harness/session-storage-sql'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentJournal } from '@omne-harness/agent-contract'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { handed, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

type Notice = Parameters<SessionNotifier['committed']>[0]
type CommitInput = Parameters<AgentJournal<string>['commit']>[0]

const scenes: SqlScene[] = []
const unregisters: (() => void)[] = []
afterEach(async () => {
  for (const unregister of unregisters.splice(0)) unregister()
  for (const s of scenes.splice(0)) await s.close()
})

async function scene(name: string) {
  const s = await sqlScene(name, { storage: 'real' })
  scenes.push(s)
  return s
}

const loadOf = async (s: SqlScene) =>
  ok(await s.view.journal.load({ ...s.access, execution: s.execution }))

/** One Agent commit at the current head; `change` gives what differs from an empty commit. */
async function commitInput(s: SqlScene, label: string, change: Partial<CommitInput>) {
  const loaded = await loadOf(s)
  const authority = loaded.executionAttachment
  if (authority === null) throw new Error('an active attachment is expected')
  return {
    ...s.access,
    execution: s.execution,
    operation: operation(label),
    authority,
    expected: loaded.revision,
    checkpoint: loaded.checkpoint,
    state: { kind: 'advancing' },
    events: [],
    effects: [],
    caller: { kind: 'none' },
    replyAdmission: null,
    handoff: null,
    finish: null,
    ...change,
  } as CommitInput
}

/** Open, the handover of the initial input and the take of it. */
async function started(s: SqlScene) {
  const opened = ok(await s.view.journal.open(s.openInput))
  ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
  const loaded = await loadOf(s)
  const page = ok(
    await s.view.journal.inputs({
      ...s.access,
      execution: s.execution,
      watermark: loaded.inputWatermark,
    }),
  )
  ok(
    await s.view.journal.commit(
      await commitInput(s, 'take', {
        checkpoint: { ...loaded.checkpoint, inputBatch: page.batch },
        events: [{ kind: 'input-taken', batch: page.batch }],
      }),
    ),
  )
}

/** The kinds of the entries of `revision` in the session log, without repeats, sorted. */
async function kindsOf(s: SqlScene, revision: string): Promise<readonly string[]> {
  const page = ok(
    await s.port.history.begin({
      ...s.sessionAccess,
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: 1 << 20,
    }),
  )
  expect(page.next).toBe(null)
  return [...new Set(page.entries.filter(e => e.revision === revision).map(e => e.kind))].sort()
}

describe('the Session participation of an Agent journal commit, the fourth committer', () => {
  it('its batch is told once, with the revision, the batch evidence and the kinds of the log', async () => {
    const s = await scene('journal-notice')
    await started(s)
    const notices: Notice[] = []
    unregisters.push(
      registerSessionNotifier(s.storage, {
        committed: notice => {
          notices.push(notice)
          return Promise.resolve()
        },
      }),
    )
    const message = assistantMessage('the main reply')
    const input = await commitInput(s, 'message', {
      events: [{ kind: 'message', message, source: evidence('message-admission') }],
      caller: {
        kind: 'message',
        message,
        source: evidence('message-source'),
        admission: evidence('message-admission'),
      },
    })
    ok(await s.view.journal.commit(input))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(notices).toHaveLength(1)
    const [notice] = notices as [Notice]
    expect(notice.tenant).toEqual(s.sessionAccess.tenant)
    expect(notice.session).toBe(s.sessionAccess.session)
    expect(notice.source.revision).toBe(notice.revision)
    expect(notice.kinds).toEqual(['message.assistant'])
    expect([...notice.kinds].sort()).toEqual(await kindsOf(s, notice.revision))

    // The same Agent operation again: the storage recalls it, and nothing more is told.
    ok(await s.view.journal.commit(input))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(notices).toHaveLength(1)
  })
})

describe('a Session reply with a result the Journal cannot decode', () => {
  const undecodable = {
    participant: 'session',
    protocol: '1',
    reply: {
      kind: 'participated',
      response: { result: { $tenant: 'not-a-tenant' }, recovered: false, digest: 'd' },
    },
  }

  it('the publication of the Agent write returns normally', async () => {
    const s = await sqlScene('undecodable-result')
    try {
      const wrapped: SqlStorage = {
        database: s.storage.database,
        registerCombination: input => s.storage.registerCombination(input),
        query: identity => s.storage.query(identity),
        read: (request, options) => s.storage.read(request, options),
        commit: async (request, options) => {
          const result = await s.storage.commit(request, options)
          if (result.kind !== 'committed') return result
          const others = result.responses.filter(item => item.participant !== 'session')
          return { ...result, responses: [...others, undecodable] } as unknown as typeof result
        },
      }
      const journal = createSessionLogJournal<string>({
        storage: wrapped,
        tenantDomainLookup: { lookup: () => Promise.resolve({ kind: 'ready', domain: s.domain }) },
        sessionAccessCheck: {
          check: request =>
            Promise.resolve({ kind: 'allowed', evidence: evidence(`access/${request.operation}`) }),
        },
        combination: s.combination,
      }).forSession(s.access).journal
      const opened = ok(await journal.open(s.openInput))
      expect(opened.receipt.state).toBe('applied')
    } finally {
      await s.close()
    }
  })
})
