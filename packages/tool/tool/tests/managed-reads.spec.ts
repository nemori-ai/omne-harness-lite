import { describe, expect, it } from 'vitest'
import type { ToolLedgerStore } from '@omne-harness/tool'
import { succeed } from '@omne-harness/kernel-basis'
import type { ResultPage, ToolResult } from '@omne-harness/tool-contract'
import {
  admission,
  callId,
  textOf,
  dummyRequest,
  failure,
  harness,
  judged,
  ledgerOver,
  ok,
  operationId,
  principalA,
  principalB,
  tenantA,
  tenantB,
  type Block,
} from './runtime-values.ts'

const access = { principal: principalA, tenant: tenantA, call: callId('call-1') }

describe('14 queries (P01)', () => {
  it('14 queries: lookup by the admission answers the authoritative state', async () => {
    const { runtime } = harness()
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const found = ok(await runtime.lookup({ ...access, admission: operationId('op-1') }))
    expect(found).toEqual({ kind: 'found', state: admitted.state })
    if (found.kind === 'found') judged(found.state)
  })

  it('14 queries: an admission that never committed is not-accepted only from a complete read', async () => {
    const { runtime, store } = harness()
    expect(await runtime.lookup({ ...access, admission: operationId('op-1') })).toEqual({
      ok: { kind: 'not-accepted', operation: 'op-1' },
    })
    store.injectRead('unavailable')
    expect(await runtime.lookup({ ...access, admission: operationId('op-1') })).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'ledger-store' },
    })
  })

  it('14 queries: another operation of the same call is not the admission', async () => {
    const { runtime } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(await runtime.lookup({ ...access, admission: operationId('op-2') })).toEqual({
      ok: { kind: 'not-accepted', operation: 'op-2' },
    })
  })

  it('14 queries: queryOperation answers the commit revision and a receipt that points at the operation', async () => {
    const { runtime } = harness()
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const resolved = ok(await runtime.queryOperation({ ...access, operation: operationId('op-1') }))
    expect(resolved).toMatchObject({
      kind: 'committed',
      revision: admitted.state.revision,
      receipt: {
        owner: '@omne-harness/tool',
        record:
          'operation:{"call":"call-1","operation":"op-1","tenant":{"account":"acc_a","organization":"org_a"}}',
      },
    })
    expect(await runtime.queryOperation({ ...access, operation: operationId('op-2') })).toEqual({
      ok: { kind: 'not-committed' },
    })
  })

  it('14 queries: a receipt does not change when the store gives the record keys in another order', async () => {
    // A durable store need not keep key order (a JSONB column sorts keys), so the digest of a
    // record read back must not depend on it.
    const { runtime, store } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const query = { ...access, operation: operationId('op-1') }
    const plain = ok(await runtime.queryOperation(query))
    const reordering: ToolLedgerStore<Block> = {
      durability: 'none',
      read: async domain => {
        const read = await store.read(domain)
        return read.kind === 'complete' ? { ...read, records: read.records.map(reversed) } : read
      },
      commit: input => store.commit(input),
    }
    const again = ok(await ledgerOver(reordering).reads.operation(query))
    expect(again).toEqual(plain)
  })
})

/** The same value with the keys of every object in reverse order. */
function reversed<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reversed) as T
  if (typeof value !== 'object' || value === null) return value
  const entries = Object.entries(value).reverse()
  return Object.fromEntries(entries.map(([key, member]) => [key, reversed(member)])) as T
}

async function allPages(
  runtime: ReturnType<typeof harness>['runtime'],
  result: ResultPage<Block>['result'],
): Promise<readonly ResultPage<Block>[]> {
  const pages: ResultPage<Block>[] = []
  let after: string | null = null
  do {
    const page: ResultPage<Block> = ok(await runtime.readResult({ ...access, result, after }))
    pages.push(page)
    after = page.next
  } while (after !== null)
  return pages
}

describe('15 result pages and the account (P08, P09)', () => {
  it('15 pages: readResult reads the full text of the logical result in whole-block pages', async () => {
    // Four blocks of 13 characters, under 100 bytes each as JSON; a page holds two of them.
    const { runtime } = harness({ chunk: 13, resultPageBytes: 220 })
    const admitted = ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    if (admitted.state.phase !== 'settled') throw new Error('not settled')
    const pages = await allPages(runtime, admitted.state.result)
    expect(pages.map(page => page.value.content.length)).toEqual([2, 2])
    const text = pages.flatMap(page => page.value.content.map(textOf)).join('')
    expect(text).toBe('tool unavailable: dependency-unavailable:file-system')
    for (const page of pages) {
      expect(page).toMatchObject({
        result: 'v1',
        terminal: { kind: 'unavailable' },
        effect: { kind: 'not-started' },
        actualTerminal: null,
        relation: 'original',
        delivery: 'd1',
        source: {
          owner: '@omne-harness/tool',
          record:
            'result:{"call":"call-1","delivery":"d1","operation":"op-1","result":"v1","tenant":{"account":"acc_a","organization":"org_a"}}',
        },
        value: { data: { kind: 'none' }, original: { kind: 'none' }, attachments: [] },
      })
    }
    expect(pages[0]?.next).toContain('"block":2')
  })

  it('15 pages: a cursor of another result, a malformed cursor and an unknown version are refused', async () => {
    const { runtime } = harness({ chunk: 13, resultPageBytes: 220 })
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    ok(await runtime.admit(admission('call-2', 'op-2', dummyRequest())))
    const first = ok(await runtime.readResult({ ...access, result: 'v1' as never, after: null }))
    const foreign = { ...access, call: callId('call-2') }
    expect(
      await runtime.readResult({ ...foreign, result: 'v1' as never, after: first.next }),
    ).toEqual({
      failure: { kind: 'invalid-cursor', reason: 'another-result' },
    })
    expect(await runtime.readResult({ ...access, result: 'v1' as never, after: '{' })).toEqual({
      failure: { kind: 'invalid-cursor', reason: 'not-a-cursor' },
    })
    expect(await runtime.readResult({ ...access, result: 'v2' as never, after: null })).toEqual({
      failure: { kind: 'invalid', field: 'result', reason: 'unknown-version' },
    })
  })

  it('15 pages: a cursor at or after the end of the result is past-the-end, never an empty page', async () => {
    // Four blocks; a cursor of this result at block 4 or later was never issued.
    const { runtime } = harness({ chunk: 13, resultPageBytes: 220 })
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const first = ok(await runtime.readResult({ ...access, result: 'v1' as never, after: null }))
    const issued = JSON.parse(first.next ?? 'null') as Record<string, unknown>
    for (const block of [4, 5])
      expect(
        await runtime.readResult({
          ...access,
          result: 'v1' as never,
          after: JSON.stringify({ ...issued, block }),
        }),
      ).toEqual({ failure: { kind: 'invalid-cursor', reason: 'past-the-end' } })
    const last = ok(
      await runtime.readResult({
        ...access,
        result: 'v1' as never,
        after: JSON.stringify({ ...issued, block: 3 }),
      }),
    )
    expect(last.value.content).toHaveLength(1)
  })

  it('15 pages: a cursor of another tenant with the same call and version is another result', async () => {
    const { runtime } = harness({ chunk: 13, resultPageBytes: 220 })
    const theirs = { principal: principalB, tenant: tenantB, call: callId('call-1') }
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest(), principalB, tenantB)))
    const mine = ok(await runtime.readResult({ ...access, result: 'v1' as never, after: null }))
    expect(
      await runtime.readResult({ ...theirs, result: 'v1' as never, after: mine.next }),
    ).toEqual({ failure: { kind: 'invalid-cursor', reason: 'another-result' } })
  })

  it('15 pages: a result without content blocks has one empty first page, and no cursor into it', async () => {
    const empty: ToolResult<Block> = {
      content: [],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    }
    const { runtime } = harness({ results: { text: () => succeed(empty) } })
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const first = ok(await runtime.readResult({ ...access, result: 'v1' as never, after: null }))
    expect(first).toMatchObject({ result: 'v1', value: { content: [] }, next: null })
    // No cursor was ever issued for this result, so any cursor into it is past the end.
    const cursor = JSON.stringify({
      tenant: 'org_a/acc_a',
      call: 'call-1',
      result: 'v1',
      projection: 'full',
      block: 0,
    })
    expect(await runtime.readResult({ ...access, result: 'v1' as never, after: cursor })).toEqual({
      failure: { kind: 'invalid-cursor', reason: 'past-the-end' },
    })
  })

  it('15 pages: a block larger than the page is a named refusal, never a cut block', async () => {
    const { runtime } = harness({ resultPageBytes: 16 })
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const refused = failure(
      await runtime.readResult({ ...access, result: 'v1' as never, after: null }),
    )
    expect(refused).toMatchObject({
      kind: 'unsupported',
      reason: expect.stringContaining('16-byte page'),
    })
  })

  it('15 account: the account of a dummy is the replacement processing only, without usage or cost', async () => {
    const { runtime } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    expect(await runtime.account(access)).toEqual({
      ok: {
        subject: { kind: 'tool_execution', id: 'call-1' },
        usage: [],
        cost: [],
        trimmed: { state: 'known', lexeme: '0', unit: 'bytes' },
        place: '@omne-harness/tool',
        duration: { state: 'unknown' },
        receipt: 'received',
        revision: '1',
      },
    })
    expect(await runtime.account({ ...access, call: callId('call-2') })).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'unknown-call' },
    })
  })
})
