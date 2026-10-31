import { describe, expect, it } from 'vitest'
import type { ToolLedgerStore } from '@omne-harness/tool'
import { succeed } from '@omne-harness/operation-result'
import type { ResultPage, ToolResult } from '@omne-harness/tool-contract'
import {
  callId,
  operationId,
  textOf,
  dummyRequest,
  failure,
  harness,
  judged,
  ledgerOver,
  ok,
  principalA,
  principalB,
  referenceFor,
  tenantA,
  tenantB,
  type Block,
} from './runtime-values.ts'

const access = { principal: principalA, tenant: tenantA }

describe('14 queries (P01)', () => {
  it('14 queries: lookup by the reference answers the authoritative state', async () => {
    const assembly = harness()
    const admitted = await assembly.admitInternal(dummyRequest())
    if (admitted.kind !== 'accepted') throw new Error('not accepted')
    const found = ok(
      await assembly.runtime.queries.lookup({ ...access, reference: admitted.reference }),
    )
    expect(found).toEqual({ kind: 'found', state: admitted.state })
    if (found.kind === 'found') judged(found.state)
  })

  it('14 queries: an admission that never committed is not-accepted only from a complete read', async () => {
    const { runtime, store } = harness()
    const reference = referenceFor('call-1', 'op-1')
    expect(await runtime.queries.lookup({ ...access, reference })).toEqual({
      ok: { kind: 'not-accepted', operation: 'op-1' },
    })
    store.injectRead('unavailable')
    expect(await runtime.queries.lookup({ ...access, reference })).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'ledger-store' },
    })
  })

  it('14 queries: another operation of the same call is not the admission', async () => {
    const assembly = harness()
    await assembly.admitInternal(dummyRequest())
    expect(
      await assembly.runtime.queries.lookup({
        ...access,
        reference: referenceFor('call-1', 'op-2'),
      }),
    ).toEqual({
      ok: { kind: 'not-accepted', operation: 'op-2' },
    })
  })

  it('14 queries: queryOperation answers the commit revision and a receipt that points at the operation', async () => {
    const assembly = harness()
    const admitted = await assembly.admitInternal(dummyRequest())
    if (admitted.kind !== 'accepted') throw new Error('not accepted')
    const resolved = ok(
      await assembly.runtime.queries.queryOperation({
        ...access,
        operation: assembly.operationRefOf('call-1', 'op-1'),
      }),
    )
    expect(resolved).toMatchObject({
      kind: 'committed',
      revision: admitted.state.revision,
      receipt: {
        owner: '@omne-harness/tool',
        record: `operation:{"call":"call-1","operation":"op-1","tenant":{"account":"${tenantA.account.text}","organization":"${tenantA.organization.text}"}}`,
      },
    })
    expect(
      await assembly.runtime.queries.queryOperation({
        ...access,
        operation: assembly.operationRefOf('call-1', 'op-2'),
      }),
    ).toEqual({
      ok: { kind: 'not-committed' },
    })
  })

  it('14 queries: a receipt does not change when the store gives the record keys in another order', async () => {
    // A durable store need not keep key order (a JSONB column sorts keys), so the digest of a
    // record read back must not depend on it.
    const assembly = harness()
    await assembly.admitInternal(dummyRequest())
    const operation = assembly.operationRefOf('call-1', 'op-1')
    const plain = ok(await assembly.runtime.queries.queryOperation({ ...access, operation }))
    const reordering: ToolLedgerStore<Block> = {
      durability: 'none',
      read: async domain => {
        const read = await assembly.store.read(domain)
        return read.kind === 'complete' ? { ...read, records: read.records.map(reversed) } : read
      },
      commit: input => assembly.store.commit(input),
    }
    const again = ok(
      await ledgerOver(reordering).reads.operation({
        principal: principalA,
        tenant: tenantA,
        call: callId('call-1'),
        operation: operationId('op-1'),
      }),
    )
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
    const page: ResultPage<Block> = ok(
      await runtime.queries.readResult({
        principal: principalA,
        tenant: tenantA,
        reference: referenceFor('call-1', 'op-1'),
        result,
        after,
      }),
    )
    pages.push(page)
    after = page.next
  } while (after !== null)
  return pages
}

describe('15 result pages and the account (P08, P09)', () => {
  it('15 pages: readResult reads the full text of the logical result in whole-block pages', async () => {
    // Four blocks of 13 characters, under 100 bytes each as JSON; a page holds two of them.
    const assembly = harness({ chunk: 13, resultPageBytes: 220 })
    const admitted = await assembly.admitInternal(dummyRequest())
    if (admitted.kind !== 'accepted' || admitted.state.phase !== 'settled')
      throw new Error('not settled')
    const pages = await allPages(assembly.runtime, admitted.state.result)
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
          record: `result:{"call":"call-1","delivery":"d1","operation":"op-1","result":"v1","tenant":{"account":"${tenantA.account.text}","organization":"${tenantA.organization.text}"}}`,
        },
        value: { data: { kind: 'none' }, original: { kind: 'none' }, attachments: [] },
      })
    }
    expect(pages[0]?.next).toContain('"block":2')
  })

  it('15 pages: a cursor of another result, a malformed cursor and an unknown version are refused', async () => {
    const assembly = harness({ chunk: 13, resultPageBytes: 220 })
    await assembly.admitInternal(dummyRequest())
    await assembly.admitInternal(dummyRequest())
    const first = ok(
      await assembly.runtime.queries.readResult({
        principal: principalA,
        tenant: tenantA,
        reference: referenceFor('call-1', 'op-1'),
        result: 'v1' as never,
        after: null,
      }),
    )
    const foreign = {
      principal: principalA,
      tenant: tenantA,
      reference: referenceFor('call-2', 'op-2'),
    }
    expect(
      await assembly.runtime.queries.readResult({
        ...foreign,
        result: 'v1' as never,
        after: first.next,
      }),
    ).toEqual({
      failure: { kind: 'invalid-cursor', reason: 'another-result' },
    })
    expect(
      await assembly.runtime.queries.readResult({
        principal: principalA,
        tenant: tenantA,
        reference: referenceFor('call-1', 'op-1'),
        result: 'v1' as never,
        after: '{',
      }),
    ).toEqual({
      failure: { kind: 'invalid-cursor', reason: 'not-a-cursor' },
    })
    expect(
      await assembly.runtime.queries.readResult({
        principal: principalA,
        tenant: tenantA,
        reference: referenceFor('call-1', 'op-1'),
        result: 'v2' as never,
        after: null,
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'result', reason: 'unknown-version' },
    })
  })

  it('15 pages: a cursor at or after the end of the result is past-the-end, never an empty page', async () => {
    // Four blocks; a cursor of this result at block 4 or later was never issued.
    const assembly = harness({ chunk: 13, resultPageBytes: 220 })
    await assembly.admitInternal(dummyRequest())
    const reference = referenceFor('call-1', 'op-1')
    const first = ok(
      await assembly.runtime.queries.readResult({
        principal: principalA,
        tenant: tenantA,
        reference,
        result: 'v1' as never,
        after: null,
      }),
    )
    const issued = JSON.parse(first.next ?? 'null') as Record<string, unknown>
    for (const block of [4, 5])
      expect(
        await assembly.runtime.queries.readResult({
          principal: principalA,
          tenant: tenantA,
          reference,
          result: 'v1' as never,
          after: JSON.stringify({ ...issued, block }),
        }),
      ).toEqual({ failure: { kind: 'invalid-cursor', reason: 'past-the-end' } })
    const last = ok(
      await assembly.runtime.queries.readResult({
        principal: principalA,
        tenant: tenantA,
        reference,
        result: 'v1' as never,
        after: JSON.stringify({ ...issued, block: 3 }),
      }),
    )
    expect(last.value.content).toHaveLength(1)
  })

  it('15 pages: a cursor of another tenant with the same call and version is another result', async () => {
    const assembly = harness({ chunk: 13, resultPageBytes: 220 })

    await assembly.admitInternal(dummyRequest())

    await assembly.admitInternal(dummyRequest(), principalB, tenantB)
    const mine = ok(
      await assembly.runtime.queries.readResult({
        principal: principalA,
        tenant: tenantA,
        reference: referenceFor('call-1', 'op-1'),
        result: 'v1' as never,
        after: null,
      }),
    )
    expect(
      await assembly.runtime.queries.readResult({
        principal: principalB,
        tenant: tenantB,
        reference: referenceFor('call-1', 'op-1', tenantB),
        result: 'v1' as never,
        after: mine.next,
      }),
    ).toEqual({ failure: { kind: 'invalid-cursor', reason: 'another-result' } })
  })

  it('15 pages: a result without content blocks has one empty first page, and no cursor into it', async () => {
    const empty: ToolResult<Block> = {
      content: [],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    }
    const assembly = harness({ results: { text: () => succeed(empty) } })
    await assembly.admitInternal(dummyRequest())
    const reference = referenceFor('call-1', 'op-1')
    const first = ok(
      await assembly.runtime.queries.readResult({
        principal: principalA,
        tenant: tenantA,
        reference,
        result: 'v1' as never,
        after: null,
      }),
    )
    expect(first).toMatchObject({ result: 'v1', value: { content: [] }, next: null })
    // No cursor was ever issued for this result, so any cursor into it is past the end.
    const cursor = JSON.stringify({
      tenant: `${tenantA.organization.text}/${tenantA.account.text}`,
      call: 'call-1',
      result: 'v1',
      projection: 'full',
      block: 0,
    })
    expect(
      await assembly.runtime.queries.readResult({
        principal: principalA,
        tenant: tenantA,
        reference,
        result: 'v1' as never,
        after: cursor,
      }),
    ).toEqual({
      failure: { kind: 'invalid-cursor', reason: 'past-the-end' },
    })
  })

  it('15 pages: a block larger than the page is a named refusal, never a cut block', async () => {
    const assembly = harness({ resultPageBytes: 16 })
    await assembly.admitInternal(dummyRequest())
    const refused = failure(
      await assembly.runtime.queries.readResult({
        principal: principalA,
        tenant: tenantA,
        reference: referenceFor('call-1', 'op-1'),
        result: 'v1' as never,
        after: null,
      }),
    )
    expect(refused).toMatchObject({
      kind: 'unsupported',
      reason: expect.stringContaining('16-byte page'),
    })
  })

  it('15 account: the account of a dummy is the replacement processing only, without usage or cost', async () => {
    const assembly = harness()
    await assembly.admitInternal(dummyRequest())
    expect(
      await assembly.runtime.queries.account({
        principal: principalA,
        tenant: tenantA,
        reference: referenceFor('call-1', 'op-1'),
      }),
    ).toEqual({
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
    expect(
      await assembly.runtime.queries.account({
        principal: principalA,
        tenant: tenantA,
        reference: referenceFor('call-2', 'op-2'),
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'unknown-call' },
    })
  })
})
