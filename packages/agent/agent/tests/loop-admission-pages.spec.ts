// The pure parts of E2's reply admission read (Agent SPEC "回复准入的已核实前缀", D5 r2.2 第 5 节):
// the one rule that chooses the lower bound, the position an ordinary commit carries, and the
// check of each page before the verified prefix moves on. The pages come from a scripted port,
// so each case breaks exactly one condition of a page.
import { describe, expect, it } from 'vitest'
import {
  decodeReplyAdmissionPageCursor,
  decodeReplyAdmissionSequence,
  type DurableEvidence,
  type ModelReplyAdmission,
  type ReplyAdmissionPage,
  type ReplyAdmissionPrefix,
  type ReplyAdmissionRead,
} from '@omne-harness/agent-contract'
import { succeed } from '@omne-harness/operation-result'
import {
  lowerBound,
  readRange,
  sentPosition,
  type RangeRequest,
} from '../src/loop/admission-read.ts'
import { ok } from './journal-support.ts'

const evidence = (record: string): DurableEvidence => ({
  owner: 'test',
  record,
  revision: '1',
  digest: `test:${record}`,
})
const sequence = (value: bigint | number) => ok(decodeReplyAdmissionSequence(String(value)))
const prefix = (value: bigint | number): ReplyAdmissionPrefix => ({
  sequence: sequence(value),
  basis: evidence(`prefix/${value}`),
})
const verified = (value: number): ReplyAdmissionRead => ({
  kind: 'verified',
  prefix: prefix(value),
})
const cursor = (text: string) => ok(decodeReplyAdmissionPageCursor(text))
const THROUGH = evidence('through')
const FACT = { decision: 'admitted' } as ModelReplyAdmission

type Page = Extract<ReplyAdmissionPage, { kind: 'page' }>

/** A lawful page of `(start, end]`, complete when `end` is the target. */
function page(start: bigint, end: bigint, target: bigint, next = `after-${end}`): Page {
  const items = []
  for (let at = start + 1n; at <= end; at += 1n)
    items.push({ sequence: sequence(at), fact: FACT, publication: evidence(`ja/${at}`) })
  return {
    kind: 'page',
    through: THROUGH,
    start: prefix(start),
    end: prefix(end),
    items,
    tail: end === target ? { kind: 'complete' } : { kind: 'more', next: cursor(next) },
  }
}

/** Reads with the scripted pages; answers the outcome and the prefixes that passed. */
async function run(pages: readonly ReplyAdmissionPage[], request: Partial<RangeRequest> = {}) {
  const passed: string[] = []
  let at = 0
  const outcome = await readRange(
    async () => succeed(pages[at++] ?? pages.at(-1)!),
    {
      from: { kind: 'prefix', prefix: prefix(0) },
      through: THROUGH,
      target: prefix(4),
      limit: 2,
      ...request,
    },
    value => passed.push(value.sequence),
  )
  return { outcome, passed, reads: at }
}

const LAWFUL = [page(0n, 2n, 4n), page(2n, 4n, 4n)]

describe('lowerBound', () => {
  it('without an in-process prefix and with an unverified checkpoint reads from origin', () => {
    expect(lowerBound(null, { kind: 'unverified' })).toEqual({ kind: 'origin' })
  })
  it('with only the in-process prefix reads from it', () => {
    expect(lowerBound(prefix(5), { kind: 'unverified' })).toEqual({
      kind: 'prefix',
      prefix: prefix(5),
    })
  })
  it('with only the verified checkpoint reads from it', () => {
    expect(lowerBound(null, verified(3))).toEqual({ kind: 'prefix', prefix: prefix(3) })
  })
  it('with both reads from the larger one, compared as exact integers', () => {
    expect(lowerBound(prefix(5), verified(3))).toEqual({ kind: 'prefix', prefix: prefix(5) })
    expect(lowerBound(prefix(99), verified(100))).toEqual({ kind: 'prefix', prefix: prefix(100) })
    expect(lowerBound(prefix(2n ** 53n + 1n), verified(Number.MAX_SAFE_INTEGER))).toEqual({
      kind: 'prefix',
      prefix: prefix(2n ** 53n + 1n),
    })
  })
})

describe('sentPosition', () => {
  it('carries the in-process prefix when it is further on than the saved position', () => {
    expect(sentPosition(null, 'I0/commit@3', prefix(4), verified(2))).toEqual(verified(4))
    expect(sentPosition(null, 'I0/commit@3', prefix(4), { kind: 'unverified' })).toEqual(
      verified(4),
    )
  })
  it('keeps the saved position without an in-process prefix or when it is not behind', () => {
    expect(sentPosition(null, 'I0/commit@3', null, verified(2))).toEqual(verified(2))
    expect(sentPosition(null, 'I0/commit@3', prefix(2), verified(5))).toEqual(verified(5))
  })
  it('sends a retry of the same operation with the position it was first sent with', () => {
    const last = { operation: 'I0/commit@3', read: verified(2) }
    expect(sentPosition(last, 'I0/commit@3', prefix(9), verified(2))).toEqual(verified(2))
    expect(sentPosition(last, 'I1/commit@4', prefix(9), verified(2))).toEqual(verified(9))
  })
})

describe('readRange checks every page before the prefix moves on', () => {
  it('reads a lawful range to the target, moving the prefix page by page', async () => {
    const { outcome, passed } = await run(LAWFUL)
    expect(outcome).toEqual({
      ok: { kind: 'complete', prefix: prefix(4), pages: 2, facts: 4 },
    })
    expect(passed).toEqual(['2', '4'])
  })

  it('an empty complete range at the target is one page', async () => {
    const { outcome } = await run([page(4n, 4n, 4n)], {
      from: { kind: 'prefix', prefix: prefix(4) },
    })
    expect(outcome).toEqual({ ok: { kind: 'complete', prefix: prefix(4), pages: 1, facts: 0 } })
  })

  it('reads beyond 2^53 with exact integers', async () => {
    const base = 2n ** 53n - 1n
    const { outcome } = await run(
      [page(base, base + 2n, base + 3n), page(base + 2n, base + 3n, base + 3n)],
      {
        from: { kind: 'prefix', prefix: prefix(base) },
        target: prefix(base + 3n),
      },
    )
    expect(outcome).toEqual({
      ok: { kind: 'complete', prefix: prefix(base + 3n), pages: 2, facts: 3 },
    })
  })

  it('passes a gap on as a gap without moving the prefix', async () => {
    const { outcome, passed } = await run([
      page(0n, 2n, 4n),
      { kind: 'gap', reason: 'missing-fact', recovery: evidence('gap') },
    ])
    expect(outcome).toEqual({ ok: { kind: 'gap', reason: 'missing-fact', pages: 2, facts: 2 } })
    expect(passed).toEqual(['2'])
  })

  const broken: readonly Readonly<{
    name: string
    pages: readonly ReplyAdmissionPage[]
    request?: Partial<RangeRequest>
  }>[] = [
    { name: 'another range echoed', pages: [{ ...page(0n, 2n, 4n), through: evidence('other') }] },
    { name: 'a first page that does not start at the lower bound', pages: [page(1n, 2n, 4n)] },
    {
      name: 'an origin read whose first page does not start at zero',
      pages: [page(1n, 2n, 4n)],
      request: { from: { kind: 'origin' } },
    },
    {
      name: 'a next page that does not start at the previous end',
      pages: [page(0n, 2n, 4n), page(1n, 4n, 4n)],
    },
    {
      name: 'sequences that are not consecutive',
      pages: [
        { ...page(0n, 2n, 4n), items: [page(0n, 1n, 4n).items[0]!, page(2n, 3n, 4n).items[0]!] },
      ],
    },
    {
      name: 'an end that does not follow the items',
      pages: [{ ...page(0n, 2n, 4n), end: prefix(3) }],
    },
    { name: 'more facts than the limit', pages: [page(0n, 3n, 4n)] },
    {
      name: 'complete before the target',
      pages: [{ ...page(0n, 2n, 4n), tail: { kind: 'complete' } }],
    },
    {
      name: 'an empty more page',
      pages: [{ ...page(0n, 0n, 4n), tail: { kind: 'more', next: cursor('again') } }],
    },
    {
      name: 'a more page at the target',
      pages: [{ ...page(2n, 4n, 4n), tail: { kind: 'more', next: cursor('beyond') } }],
      request: { from: { kind: 'prefix', prefix: prefix(2) } },
    },
    {
      name: 'a cursor that does not move on',
      pages: [page(0n, 1n, 4n, 'same'), page(1n, 2n, 4n, 'same')],
    },
    {
      name: 'a sequence that is not canonical',
      pages: [
        {
          ...page(0n, 2n, 4n),
          end: { ...prefix(2), sequence: '02' as ReplyAdmissionPrefix['sequence'] },
        },
      ],
    },
  ]

  it.each(broken)(
    'refuses $name and keeps the prefix where the last good page left it',
    async ({ pages, request }) => {
      const { outcome, passed } = await run(pages, request)
      expect(outcome).toMatchObject({ failure: { kind: 'unavailable', owner: 'agentJournal' } })
      expect(passed.length).toBeLessThan(pages.length)
      expect(passed).not.toContain('4')
    },
  )

  it('a provider that answers fewer facts than the limit with more is read on, not taken as complete', async () => {
    const { outcome, reads } = await run([page(0n, 1n, 4n), page(1n, 2n, 4n), page(2n, 4n, 4n)])
    expect(outcome).toEqual({ ok: { kind: 'complete', prefix: prefix(4), pages: 3, facts: 4 } })
    expect(reads).toBe(3)
  })
})
