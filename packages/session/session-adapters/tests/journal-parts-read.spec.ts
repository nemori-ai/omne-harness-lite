// The provider's read of the durable Agent records in parts (K-8, `readParts` in
// `src/cordis/agent-journal.ts`): a session whose parts do not fit one page is rebuilt from every
// page; pages that read different publication counts are read again, and three tries that all see
// a moving count answer `unavailable`; records stored whole are not read as parts. The double's
// pages are made one part long by rewriting what the read handler answers, so a scene of one
// execution already needs several pages; the answer that is rewritten is the real handler's, so the
// pages keep its `after` order.
import { afterEach, describe, expect, it } from 'vitest'
import type { JsonValue, ReadRequest, ReadResult } from '@omne-harness/sql-contract'
import { EXECUTION_RECORD_HANDLERS } from '@omne-harness/session-storage-sql/participants'
import { ok } from './fixtures/common-journal.ts'
import { handed, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const scenes: SqlScene[] = []
afterEach(async () => {
  for (const s of scenes.splice(0)) await s.close()
})

type Page = {
  published: string
  state: JsonValue
  parts: { part: string; state: JsonValue }[]
  next: string | null
}

/** A session with its execution open, so that its Agent records are in more than one part. */
async function opened(name: string) {
  const s = await sqlScene(name)
  scenes.push(s)
  const journal = s.view.journal
  const receipt = ok(await journal.open(s.openInput)).receipt.evidence
  ok(await handed(s, String(s.initial.id), receipt))
  return { s, journal }
}

/** What a reader of the parts asks, in order: the pages of each read it makes. */
function watch(s: SqlScene, change: (page: Page, request: ReadRequest) => Page) {
  const asked: ReadRequest[] = []
  s.rewriteReads.current = (request: ReadRequest, answer: ReadResult): ReadResult => {
    if (request.handler !== EXECUTION_RECORD_HANDLERS.parts || answer.kind !== 'read') return answer
    asked.push(request)
    return { ...answer, output: change(structuredClone(answer.output) as Page, request) }
  }
  return asked
}

/** Every page holds one part at most: the next page starts after it. */
const onePart = (page: Page): Page =>
  page.parts.length <= 1
    ? page
    : { ...page, parts: page.parts.slice(0, 1), next: page.parts[0]!.part }

const firstPages = (asked: readonly ReadRequest[]) =>
  asked.filter(request => (request.input as { after: string | null }).after === null)

describe('a session whose parts fill more than one page', () => {
  it('is rebuilt from every page: a new provider loads what the writer holds', async () => {
    const { s, journal } = await opened('parts-read-pages')
    const written = ok(await journal.load({ ...s.access, execution: s.execution }))
    const asked = watch(s, onePart)
    const loaded = ok(await s.fresh().journal.load({ ...s.access, execution: s.execution }))
    // The records of the execution are in two parts (`x:` and `o:`), one to a page: the read has
    // to follow `next` once, from the first page and never from the start again.
    expect(asked.map(request => (request.input as { after: string | null }).after)).toEqual([
      null,
      expect.stringMatching(/^[xo]:/),
    ])
    expect(firstPages(asked)).toHaveLength(1)
    expect(loaded).toEqual(written)
  })
})

describe('pages that read different publication counts', () => {
  /** The second page of the first `tries` reads says it was read at a later count. */
  const moving = (tries: number) => {
    let first = 0
    return (page: Page, request: ReadRequest): Page => {
      const after = (request.input as { after: string | null }).after
      if (after === null) first += 1
      const shrunk = onePart(page)
      return after !== null && first <= tries
        ? { ...shrunk, published: String(BigInt(shrunk.published) + 1n) }
        : shrunk
    }
  }

  it('are read again from the first page, and the second try is the answer', async () => {
    const { s, journal } = await opened('parts-read-again')
    const written = ok(await journal.load({ ...s.access, execution: s.execution }))
    const asked = watch(s, moving(1))
    const loaded = ok(await s.fresh().journal.load({ ...s.access, execution: s.execution }))
    expect(firstPages(asked)).toHaveLength(2)
    expect(loaded).toEqual(written)
  })

  it('that move on every try answer unavailable after three tries, and nothing is rebuilt', async () => {
    const { s } = await opened('parts-read-moving')
    const asked = watch(s, moving(Number.POSITIVE_INFINITY))
    const failed = await s.fresh().journal.load({ ...s.access, execution: s.execution })
    expect(failed).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('kept changing') },
    })
    expect(firstPages(asked)).toHaveLength(3)
  })
})

describe('records stored whole', () => {
  it('are not read as parts: the provider answers unavailable', async () => {
    const { s } = await opened('parts-read-whole')
    watch(s, (page, request) =>
      (request.input as { after: string | null }).after === null
        ? { ...page, state: { whole: true } }
        : page,
    )
    expect(await s.fresh().journal.load({ ...s.access, execution: s.execution })).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('stored whole') },
    })
  })
})
