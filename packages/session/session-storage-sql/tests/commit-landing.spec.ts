// The one landing of a commit (`afterSessionCommit`, SPEC「本批与提交通知」), cell by cell: the
// storage answer (fresh, recalled, not committed) against the reply of the writer (a batch, a
// recovered answer, no entry, no Session participation, a result the caller cannot decode). A
// Journal commit folds one count up or replaces the index; a commit of the Session participant
// alone folds at the same count. Only a fresh batch is told, and nothing here ever throws. The
// fold is seen through the fold counts of the database (no snapshot is held, so a fold or an index
// replacement that is tried counts as skipped); the notice through a registered notifier.
import type { SessionCommand, SessionNotifier, WorkSnapshot } from '@omne-harness/session-contract'
import {
  guard,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import type { DomainRef, JsonValue, ReceiptV2, SqlStorage } from '@omne-harness/sql-contract'
import { afterEach, describe, expect, it } from 'vitest'
import {
  afterSessionCommit,
  decodeSessionReply,
  executionRecordFacts,
  registerSessionNotifier,
  sessionCommandFacts,
  sessionCommitCommands,
} from '../src/participants.ts'
import { workFoldCounts } from '../src/work-cache.ts'
import { createSessionStorage } from '../src/index.ts'
import { app, textOf, TENANT_A, type App } from './fixtures/app.ts'
import { identityOf, jointWrite } from './fixtures/real-provider.ts'

type Notice = Parameters<SessionNotifier['committed']>[0]

const DOMAIN: DomainRef = {
  scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
  transactionDomain: 'dom_0',
}

const work = {
  tail: '5',
  published: '3',
  bytes: 100,
  first: '9',
  last: '10',
  indexed: true,
  basis: { scope: { kind: 'pending', inputs: [] }, focus: { executions: [], event: null } },
}

const batch = {
  tenant: textOf(TENANT_A),
  session: 'session-1',
  revision: '5',
  source: { owner: 'o', record: 'r', revision: '5', digest: 'sha256:d' },
  kinds: ['message.assistant'],
}

/** A storage that holds nothing and is never asked: only its database identity matters here. */
const storageOf = (): SqlStorage =>
  ({
    database: {},
    read: () => Promise.reject(new Error('not read')),
  }) as unknown as SqlStorage

function receiptOf(response: JsonValue | null): ReceiptV2 {
  return {
    kind: 'committed',
    responses: [
      {
        participant: 'execution-record',
        protocol: '1',
        reply: { kind: 'participated', response: { published: '3', digest: 'e' } },
      },
      ...(response === null
        ? []
        : [{ participant: 'session', protocol: '1', reply: { kind: 'participated', response } }]),
    ],
  } as unknown as ReceiptV2
}

const fresh = (extra: Record<string, JsonValue> = {}) => ({
  result: null,
  recovered: false,
  digest: 'd',
  work,
  batch,
  ...extra,
})

const unregisters: (() => void)[] = []
afterEach(() => {
  for (const unregister of unregisters.splice(0)) unregister()
})

/** Lands one answer on a storage of its own: what was told, and the change of the fold counts. */
async function land(
  answer: { receipt: ReceiptV2; recalled: boolean } | null,
  journal?: { published: string | null },
) {
  const storage = storageOf()
  const notices: Notice[] = []
  unregisters.push(
    registerSessionNotifier(storage, {
      committed: notice => {
        notices.push(notice)
        return Promise.resolve()
      },
    }),
  )
  await afterSessionCommit({
    storage,
    domain: DOMAIN,
    tenant: textOf(TENANT_A),
    session: 'session-1',
    answer,
    ...(journal === undefined ? {} : { journal }),
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  // Every count: a fold or a replacement that is tried on no held snapshot counts as skipped, one
  // that fails as stale; either is a try.
  const counts = workFoldCounts(storage)
  return { notices, tried: Object.values(counts).reduce((sum, value) => sum + value, 0) }
}

describe('a fresh commit', () => {
  it('with a batch: folded (or tried) and told once, with the five values of the writer', async () => {
    const landed = await land({ receipt: receiptOf(fresh()), recalled: false })
    expect(landed.tried).toBe(1)
    expect(landed.notices).toEqual([
      {
        tenant: TENANT_A,
        session: 'session-1',
        revision: '5',
        source: batch.source,
        kinds: batch.kinds,
      },
    ])
  })

  it('a Journal commit with a batch: folded one count up and told', async () => {
    const landed = await land({ receipt: receiptOf(fresh()), recalled: false }, { published: '3' })
    expect(landed.tried).toBe(1)
    expect(landed.notices).toHaveLength(1)
  })

  it('a Journal commit that does not know its count: not folded, still told', async () => {
    const landed = await land({ receipt: receiptOf(fresh()), recalled: false }, { published: null })
    expect(landed.tried).toBe(0)
    expect(landed.notices).toHaveLength(1)
  })

  it('a writer that answered recovered: not folded, not told; a Journal commit replaces the index', async () => {
    const recovered = fresh({ recovered: true })
    expect(await land({ receipt: receiptOf(recovered), recalled: false })).toEqual({
      notices: [],
      tried: 0,
    })
    expect(
      await land({ receipt: receiptOf(recovered), recalled: false }, { published: '4' }),
    ).toEqual({ notices: [], tried: 1 })
  })

  it('a reply without a batch or work (no entry written): not folded, not told', async () => {
    const none = { result: null, recovered: false, digest: 'd' }
    expect(await land({ receipt: receiptOf(none), recalled: false })).toEqual({
      notices: [],
      tried: 0,
    })
  })

  it('a Journal commit without a Session participation: the index is replaced, nothing is told', async () => {
    expect(await land({ receipt: receiptOf(null), recalled: false }, { published: '4' })).toEqual({
      notices: [],
      tried: 1,
    })
  })

  it('a result the caller cannot decode: the work and the batch are still read, nothing throws', async () => {
    const undecodable = fresh({ result: { $tenant: 'not-a-tenant' } })
    const landed = await land({ receipt: receiptOf(undecodable), recalled: false })
    expect(landed.tried).toBe(1)
    expect(landed.notices).toHaveLength(1)
  })

  it('a malformed batch or work: neither is used, nothing throws', async () => {
    const malformed = fresh({ work: { tail: 'x' }, batch: { tenant: 'not-minted', kinds: [] } })
    expect(await land({ receipt: receiptOf(malformed), recalled: false })).toEqual({
      notices: [],
      tried: 0,
    })
  })
})

describe('not a fresh commit', () => {
  it('a storage recall: the original reply still carries its batch, and nothing is folded or told', async () => {
    for (const journal of [undefined, { published: '3' }])
      expect(await land({ receipt: receiptOf(fresh()), recalled: true }, journal)).toEqual({
        notices: [],
        tried: 0,
      })
  })

  it('a commit that did not commit: nothing is folded or told', async () => {
    for (const journal of [undefined, { published: '3' }])
      expect(await land(null, journal)).toEqual({ notices: [], tried: 0 })
  })
})

/** The reads of `handler` the storage of `a` served since `from` (an index into its call log). */
const readsOf = (a: App, handler: string, from: number): number =>
  a.provider.calls.slice(from).filter(call => call.kind === 'read' && call.handler === handler)
    .length

const okOf = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

describe('the landing on a real store', () => {
  it('a Journal commit with a Session participation folds its batch one count up, and tells it', async () => {
    const a = await app()
    okOf(await a.create(TENANT_A))
    const access = a.access(TENANT_A)
    const held = okOf<WorkSnapshot>(await a.port.readWork(access))
    const command: SessionCommand = {
      kind: 'accept',
      input: {
        tenant: TENANT_A,
        session: sessionId('session-1'),
        operation: operationId('accept-joint'),
        value: ordinaryInput('joint'),
      },
    }
    const result = await a.provider.storage.commit({
      identity: identityOf(TENANT_A, 'dom_0', 'aop_joint'),
      ...a.storageOptions.combination,
      commands: sessionCommitCommands([
        executionRecordFacts(jointWrite()),
        sessionCommandFacts(command, [guard('login', 'login-entry', 'present')]),
      ]),
    })
    if (result.kind !== 'committed') throw new Error(`the joint commit: ${result.kind}`)
    const notices: Notice[] = []
    unregisters.push(
      registerSessionNotifier(a.provider.storage, {
        committed: notice => {
          notices.push(notice)
          return Promise.resolve()
        },
      }),
    )
    const before = workFoldCounts(a.provider.storage)
    await afterSessionCommit({
      storage: a.provider.storage,
      domain: DOMAIN,
      tenant: textOf(TENANT_A),
      session: 'session-1',
      answer: { receipt: result, recalled: false },
      journal: { published: '1' },
    })
    expect(workFoldCounts(a.provider.storage).folded - before.folded).toBe(1)
    const from = a.provider.calls.length
    const after = okOf<WorkSnapshot>(await a.port.readWork(access))
    expect(readsOf(a, 'session.work', from)).toBe(0)
    expect(BigInt(after.revision)).toBe(BigInt(held.revision) + 1n)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(notices.map(notice => notice.revision)).toEqual([after.revision])
  })

  it('the bounds of the port reach the cache that a commit before any read creates', async () => {
    const a = await app()
    okOf(await a.create(TENANT_A))
    // A storage object of a database identity of its own: no cache exists for it yet.
    const storage: SqlStorage = { ...a.provider.storage, database: {} }
    const port = createSessionStorage<string>({
      ...a.storageOptions,
      storage,
      workCache: { sessions: 0 },
    })
    okOf(
      await port.commit({
        access: a.access(TENANT_A),
        command: {
          kind: 'accept',
          input: {
            tenant: TENANT_A,
            session: sessionId('session-1'),
            operation: operationId('accept-first'),
            value: ordinaryInput('first'),
          },
        },
        guards: [guard('login', 'login-entry', 'present')],
      }),
    )
    const from = a.provider.calls.length
    okOf(await port.readWork(a.access(TENANT_A)))
    okOf(await port.readWork(a.access(TENANT_A)))
    expect(readsOf(a, 'session.work', from)).toBe(2)
  })
})

describe('the reply reader', () => {
  it('a conflict without a failure and an unsupported reply decode to what they say', () => {
    expect(decodeSessionReply({ kind: 'conflict', basis: {} } as never)).toEqual({
      kind: 'failed',
      diagnostic: 'a session conflict without a failure',
    })
    expect(
      decodeSessionReply({ kind: 'conflict', basis: { failure: { kind: 'denied' } } } as never),
    ).toEqual({ kind: 'stopped', failure: { kind: 'denied' } })
    expect(decodeSessionReply({ kind: 'unsupported', basis: { reason: 'r' } } as never)).toEqual({
      kind: 'unsupported',
      reason: 'r',
    })
    expect(decodeSessionReply({ kind: 'unsupported', basis: null } as never)).toEqual({
      kind: 'unsupported',
      reason: 'unsupported',
    })
  })
})
