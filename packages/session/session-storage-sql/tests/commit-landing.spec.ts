// The one landing of a commit (`afterSessionCommit`, SPEC「本批与提交通知」), cell by cell: the
// storage answer (fresh, recalled, not committed) against the reply of the writer (a batch, a
// recovered answer, no entry, no Session participation, a result the caller cannot decode). A
// Journal commit folds one count up or replaces the index; a commit of the Session participant
// alone folds at the same count. Only a fresh batch is told, and nothing here ever throws. The
// fold is seen through the fold counts of the database (no snapshot is held, so a fold or an index
// replacement that is tried counts as skipped); the notice through a registered notifier.
import type { SessionNotifier } from '@omne-harness/session-contract'
import type { DomainRef, JsonValue, ReceiptV2, SqlStorage } from '@omne-harness/sql-contract'
import { afterEach, describe, expect, it } from 'vitest'
import { afterSessionCommit, registerSessionNotifier } from '../src/participants.ts'
import { workFoldCounts } from '../src/work-cache.ts'
import { textOf, TENANT_A } from './fixtures/app.ts'

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
  return { notices, tried: workFoldCounts(storage).skipped }
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
