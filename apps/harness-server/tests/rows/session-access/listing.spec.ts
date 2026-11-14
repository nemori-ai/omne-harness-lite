import { resolve } from 'node:path'
import type { Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  SessionDirectory,
  SessionFailure,
  SessionId,
  SessionListItem,
} from '@omne-harness/session-contract'
import { encodeInstant, type Instant } from '@omne-harness/utc-instant'
import { describe, expect, it } from 'vitest'
import { sessionAccessConfig, sessionListingOf } from '../../../src/rows/session-access/index.ts'

type Reply = Awaited<ReturnType<SessionDirectory<Principal>['list']>>

const call = {
  principal: {} as Principal,
  tenant: {} as TenantId,
  after: null,
  limit: 5,
  includeArchived: false,
}

const text = (instant: Instant | null | undefined) =>
  instant === null || instant === undefined ? instant : encodeInstant(instant)

const item = (over: Partial<SessionListItem> = {}): SessionListItem => ({
  session: 'a'.repeat(64) as SessionId,
  createdAt: '2026-11-13T01:00:00Z',
  lastActivityAt: '2026-11-13T02:00:00.5Z',
  lifecycle: 'dormant',
  title: 'hello',
  ...over,
})

function adapted(reply: Reply | 'throw') {
  const asked: unknown[] = []
  const directory: SessionDirectory<Principal> = {
    async list(input) {
      asked.push(input)
      if (reply === 'throw') throw new Error('directory fault')
      return reply
    },
  }
  return { listing: sessionListingOf(directory), asked }
}

describe('sessionListingOf', () => {
  it('hands the call through and gives each row with its times read as instants', async () => {
    const { listing, asked } = adapted({
      ok: {
        items: [item(), item({ createdAt: null, lastActivityAt: null })],
        next: 'n',
        completeness: 'partial',
      },
    })
    const answer = await listing.list(call)
    expect(asked).toEqual([call])
    if (!('ok' in answer)) throw new Error('the page was refused')
    expect(answer.ok).toMatchObject({ next: 'n', completeness: 'partial' })
    const [first, second] = answer.ok.items
    expect(text(first?.createdAt)).toBe('2026-11-13T01:00:00Z')
    expect(text(first?.lastActivityAt)).toBe('2026-11-13T02:00:00.5Z')
    expect(first).toMatchObject({ session: 'a'.repeat(64), lifecycle: 'dormant', title: 'hello' })
    expect(second).toMatchObject({ createdAt: null, lastActivityAt: null })
  })

  it.each([
    [{ kind: 'invalid', field: 'cursor', reason: 'foreign' }, 'invalid'],
    [{ kind: 'denied', action: 'list' }, 'denied'],
    [{ kind: 'unavailable', owner: 'x', diagnostic: 'y' }, 'basis-unavailable'],
    [{ kind: 'quarantined', diagnostic: 'x' }, 'basis-unavailable'],
  ] as const)('refuses a failure of Session %j as %s', async (failure, refused) => {
    const { listing } = adapted({ failure: failure as SessionFailure })
    expect(await listing.list(call)).toEqual({ refused })
  })

  it.each(['yesterday', '2026-11-13T01:00:00+08:00', '2026-02-30T00:00:00Z'])(
    'refuses a page whose time text %s is no instant, rather than show it as no time',
    async text => {
      const { listing } = adapted({
        ok: { items: [item({ createdAt: text })], next: null, completeness: 'complete' },
      })
      expect(await listing.list(call)).toEqual({ refused: 'basis-unavailable' })
    },
  )
})

const journal = { requestJournalFile: resolve('state', 'request-queue.jsonl') }

describe('the list limits of the configuration', () => {
  it('default to 50 and 50', () => {
    expect(sessionAccessConfig.parse(journal)).toMatchObject({
      defaultListLimit: 50,
      maxListLimit: 50,
    })
  })

  it('refuse a default above the bound, which would make every call without a limit invalid', () => {
    const parsed = (limits: object) => sessionAccessConfig.safeParse({ ...journal, ...limits })
    expect(parsed({ defaultListLimit: 51, maxListLimit: 50 }).success).toBe(false)
    expect(parsed({ defaultListLimit: 20, maxListLimit: 100 }).success).toBe(true)
  })
})

describe('the request queue of the configuration', () => {
  it('needs the journal file, as an absolute path', () => {
    expect(sessionAccessConfig.safeParse({}).success).toBe(false)
    expect(
      sessionAccessConfig.safeParse({ requestJournalFile: 'request-queue.jsonl' }).success,
    ).toBe(false)
  })

  it('defaults the bound of a queue to the pending inputs of a session, and gives a retry sequence', () => {
    expect(sessionAccessConfig.parse(journal)).toMatchObject({
      requestQueueLimit: 64,
      requestRetryDelaysMs: [100, 300, 1000, 3000],
    })
  })

  it('refuses a retry sequence without a delay', () => {
    expect(sessionAccessConfig.safeParse({ ...journal, requestRetryDelaysMs: [] }).success).toBe(
      false,
    )
  })
})
