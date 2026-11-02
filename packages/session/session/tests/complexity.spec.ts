// SS-02 complexity of the service layer (perf-baseline 第 2.1～2.3 节, 第 5 节): deterministic counts,
// not times. Outside the provider and around the service, count the decisions, the delegated-view
// calls by method and the material calls of each face operation, at two history sizes. What the
// service adds per operation must not grow with the history: the snapshot is read materialized
// (2.1), a history page and a model-view page are one bounded read (2.2, 2.1), and a command
// decides on the snapshot, never by re-reading the history (2.3). A negative control shows that the
// counts do see a reader whose work grows with the history.
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionFaces } from '@omne-harness/session-contract'
import { operationId, ordinaryInput, succeeded } from '@omne-harness/session-contract/testing'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

const SMALL = 16
const LARGE = 128
const PAGE_BYTES = 2048

type Counts = Readonly<Record<string, number>>

/** A session with `size` accepted inputs, committed through the public port. */
async function history(size: number): Promise<Harness> {
  const h = await harness({ backend: memoryBackend })
  open.push(h)
  await h.create()
  for (let index = 0; index < size; index += 1)
    succeeded(
      await h.backend.transactions.commit({
        access: h.access(),
        command: {
          kind: 'accept',
          input: {
            tenant: h.access().tenant,
            session: h.access().session,
            operation: operationId(`seed-${String(index)}`),
            value: ordinaryInput(`seed-${String(index)}`),
          },
        },
        guards: [],
      }),
      'seed',
    )
  return h
}

/** The counts that one face operation causes around the service. */
async function measure(h: Harness, operation: () => Promise<unknown>): Promise<Counts> {
  const checks = h.checks.count()
  const identity = h.identity.controls.asked().length
  const evidence = h.evidence.calls()
  h.view.reset()
  const answer = await operation()
  expect(answer, JSON.stringify(answer).slice(0, 300)).toHaveProperty('ok')
  const counts: Record<string, number> = {
    decisions: h.checks.count() - checks,
    identity: h.identity.controls.asked().length - identity,
    evidence: h.evidence.calls() - evidence,
  }
  for (const call of h.view.calls()) counts[call.method] = (counts[call.method] ?? 0) + 1
  return counts
}

/** The per-operation counts of the face operations on one session of `size` inputs. */
async function profile(size: number): Promise<Readonly<Record<string, Counts>>> {
  const h = await history(size)
  const coordinator: SessionFaces<string> = h.faces('coordinator')
  const reader = h.faces('reader')
  const accept = () =>
    h.faces('intake').work.accept({
      ...h.access(),
      operation: operationId('accept-measured'),
      value: ordinaryInput('measured'),
    })
  return {
    readWork: await measure(h, () => coordinator.work.readWork(h.access())),
    accept: await measure(h, accept),
    'accept recalled': await measure(h, accept),
    queryOperation: await measure(h, () =>
      coordinator.work.queryOperation({ ...h.access(), operation: operationId('seed-0') }),
    ),
    'history page': await measure(h, () =>
      reader.history.begin({
        ...h.access(),
        kinds: [],
        from: null,
        direction: 'backward',
        pageBytes: PAGE_BYTES,
      }),
    ),
    'model view page': await measure(h, () =>
      reader.history.readModelView({
        ...h.access(),
        basis: null,
        after: null,
        pageBytes: PAGE_BYTES,
      }),
    ),
    'pending page': await measure(h, () =>
      h.faces('maintainer').reconciliation.pending({
        principal: 'a:tester',
        tenant: h.access().tenant,
        after: null,
        limit: 10,
      }),
    ),
  }
}

/** Reads the whole history page by page: work that grows with the history, as a control. */
async function readAll(h: Harness): Promise<number> {
  const reader = h.faces('reader').history
  let page = succeeded(
    await reader.begin({
      ...h.access(),
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: PAGE_BYTES,
    }),
    'first page',
  )
  let pages = 1
  while (page.next !== null) {
    page = succeeded(await reader.next({ ...h.access(), cursor: page.next }), 'next page')
    pages += 1
  }
  return pages
}

describe(`SS-02: the counts of each face operation at ${String(SMALL)} and ${String(LARGE)} inputs`, () => {
  it('every face operation causes the same counts at both sizes', async () => {
    const small = await profile(SMALL)
    const large = await profile(LARGE)
    expect(large).toEqual(small)
    // The table of the evidence: one decision per face operation, and a bounded number of reads.
    expect(small).toMatchInlineSnapshot(`
      {
        "accept": {
          "commit": 1,
          "decisions": 1,
          "evidence": 0,
          "history.begin": 1,
          "identity": 1,
          "queryOperation": 1,
          "readWork": 1,
        },
        "accept recalled": {
          "commit": 1,
          "decisions": 1,
          "evidence": 0,
          "identity": 0,
          "queryOperation": 1,
        },
        "history page": {
          "decisions": 1,
          "evidence": 0,
          "history.begin": 1,
          "identity": 0,
        },
        "model view page": {
          "decisions": 1,
          "evidence": 0,
          "history.readModelView": 1,
          "identity": 0,
        },
        "pending page": {
          "decisions": 1,
          "evidence": 0,
          "identity": 0,
        },
        "queryOperation": {
          "decisions": 1,
          "evidence": 0,
          "identity": 0,
          "queryOperation": 1,
        },
        "readWork": {
          "decisions": 1,
          "evidence": 0,
          "identity": 0,
          "readWork": 1,
        },
      }
    `)
  })

  it('negative control: a reader of the whole history is seen to grow with it', async () => {
    const small = await history(SMALL)
    const large = await history(LARGE)
    const pagesSmall = await readAll(small)
    const pagesLarge = await readAll(large)
    expect(pagesLarge).toBeGreaterThan(pagesSmall)
  })
})
