import { describe, expect, it, vi } from 'vitest'
import { commentDigest, encodeRecordComment } from '../src/delivery/collaboration-comments.ts'
import {
  readCompleteComments,
  readReferencedComment,
  recordComments,
  type ReadPolicy,
  type CollaborationComment,
} from '../src/delivery/collaboration-read.ts'
import { orderedRecords, type SequencedComment } from '../src/delivery/collaboration-sequence.ts'
import type { LineDeltaRecord } from '../src/delivery/collaboration-records.ts'
import type { GhRead } from '../src/delivery/github-read.ts'
import { assignment, delta, NEXT_UUID, TIME } from './fixtures/collaboration.ts'

function rawComment(id: number, body = 'ordinary comment') {
  return {
    id,
    body,
    issue_url: 'https://api.github.com/repos/owner/repo/issues/10',
    html_url: `https://github.com/owner/repo/issues/10#issuecomment-${id}`,
    user: { login: 'owner', type: 'User' },
    created_at: TIME,
    updated_at: TIME,
  }
}
function source(
  comments: ReturnType<typeof rawComment>[],
  changes: { total?: number; repeated?: boolean; changed?: boolean } = {},
) {
  let issueReads = 0
  const call = vi.fn<GhRead>(argv => {
    const path = argv.at(-1) ?? ''
    if (path === 'repos/owner/repo/issues/10')
      return {
        number: 10,
        html_url: 'https://github.com/owner/repo/issues/10',
        body: '',
        state: 'open',
        milestone: null,
        updated_at: issueReads++ > 0 && changes.changed ? '2026-10-27T10:01:00Z' : TIME,
        comments: changes.total ?? comments.length,
      }
    const match = /comments\?per_page=100&page=(\d+)$/.exec(path)
    if (match === null) throw new Error('unexpected request')
    const page = changes.repeated ? 1 : Number(match[1])
    return comments.slice((page - 1) * 100, page * 100)
  })
  return call
}

describe('complete collaboration comment reads', () => {
  it.each([
    null,
    [],
    { networkMs: undefined },
    { networkMs: 0 },
    { networkMs: -1 },
    { networkMs: 1.5 },
    { networkMs: Infinity },
    { networkMs: NaN },
    { networkMs: 2_147_483_648 },
    { timeout: 1000 },
  ])('rejects invalid policy %j before reading', policy => {
    const read = source([])
    expect(() =>
      readCompleteComments('owner/repo', 10, read, policy as Partial<ReadPolicy>),
    ).toThrow()
    expect(read).not.toHaveBeenCalled()
  })

  it('keeps the default network limit when policy is omitted', () => {
    const read = source([])
    readCompleteComments('owner/repo', 10, read)
    expect(read.mock.calls.map(call => call[1])).toEqual([15_000, 15_000, 15_000])
  })

  it('uses the configured network limit for every page and both snapshots', () => {
    const read = source(Array.from({ length: 105 }, (_, index) => rawComment(index + 1)))
    expect(
      readCompleteComments('owner/repo', 10, read, { networkMs: 25_000 }).comments,
    ).toHaveLength(105)
    expect(read.mock.calls.map(call => call[1])).toEqual([25_000, 25_000, 25_000, 25_000])
  })

  it.each([0, 100, 205])(
    'reads all %s comments including the final empty page when needed',
    count => {
      const comments = Array.from({ length: count }, (_, index) => rawComment(index + 1))
      const read = source(comments),
        result = readCompleteComments('owner/repo', 10, read)
      expect(result.comments.map(comment => comment.id)).toEqual(
        comments.map(comment => comment.id),
      )
      expect(read).toHaveBeenCalledTimes(Math.floor(count / 100) + 3)
    },
  )

  it('rejects a short capture instead of returning an empty or partial inbox', () => {
    expect(() =>
      readCompleteComments('owner/repo', 10, source([rawComment(1)], { total: 200 })),
    ).toThrow('comments-incomplete')
  })

  it('rejects repeated pages and changes during a read', () => {
    const comments = Array.from({ length: 105 }, (_, index) => rawComment(index + 1))
    expect(() =>
      readCompleteComments('owner/repo', 10, source(comments, { repeated: true })),
    ).toThrow('duplicate-page')
    expect(() =>
      readCompleteComments('owner/repo', 10, source(comments, { changed: true })),
    ).toThrow('snapshot-changed')
  })

  it('does not convert permission failure into an empty inbox', () => {
    const denied: GhRead = () => {
      throw new Error('403 fixture')
    }
    expect(() => readCompleteComments('owner/repo', 10, denied)).toThrow('403 fixture')
  })

  it('keeps marker selection separate from author trust', () => {
    const comment = rawComment(1, encodeRecordComment(delta()))
    comment.user.login = 'unauthorized-user'
    const selected = recordComments(readCompleteComments('owner/repo', 10, source([comment])))
    expect(selected).toHaveLength(1)
    expect(selected[0]?.author).toBe('unauthorized-user')
  })
})

describe('referenced comment reads', () => {
  const body = encodeRecordComment(delta())
  const reference = { issue: 10, commentId: 24, sha256: commentDigest(body) }

  it('uses the configured network limit for an exact comment', () => {
    const read = vi.fn<GhRead>(() => rawComment(24, body))
    expect(readReferencedComment('owner/repo', reference, read, { networkMs: 25_000 }).id).toBe(24)
    expect(read.mock.calls[0]?.[1]).toBe(25_000)
  })

  it('reads the exact comment and preserves its author for a separate permission check', () => {
    const raw = rawComment(24, body)
    raw.user.login = 'untrusted'
    const read = vi.fn<GhRead>(() => raw)
    expect(readReferencedComment('owner/repo', reference, read)).toMatchObject({
      id: 24,
      body,
      author: 'untrusted',
    })
    expect(read.mock.calls[0]?.[0].at(-1)).toBe('repos/owner/repo/issues/comments/24')
  })

  it('rejects edits including whitespace-only changes after a digest was published', () => {
    expect(() =>
      readReferencedComment('owner/repo', reference, () => rawComment(24, body + '\n')),
    ).toThrow('digest-mismatch')
  })

  it('rejects another comment, card or repository even with identical bytes', () => {
    expect(() =>
      readReferencedComment('owner/repo', reference, () => rawComment(25, body)),
    ).toThrow('reference-mismatch')
    expect(() =>
      readReferencedComment('owner/repo', { ...reference, issue: 20 }, () => rawComment(24, body)),
    ).toThrow('identity-mismatch')
    expect(() =>
      readReferencedComment('other/repo', reference, () => rawComment(24, body)),
    ).toThrow('identity-mismatch')
  })

  it('propagates missing or unreadable evidence without replacing it with current state', () => {
    const missing: GhRead = () => {
      throw new Error('404 fixture')
    }
    expect(() => readReferencedComment('owner/repo', reference, missing)).toThrow('404 fixture')
  })
})

function sequenced(id: number, record = delta()): SequencedComment<LineDeltaRecord> {
  const comment: CollaborationComment = {
    id,
    issue: 10,
    author: 'owner',
    authorType: 'User',
    body: encodeRecordComment(record),
    url: `https://github.com/owner/repo/issues/10#issuecomment-${id}`,
    createdAt: TIME,
    updatedAt: TIME,
  }
  return { ...comment, record }
}

describe('continuous record streams', () => {
  it('orders delayed comments and deduplicates identical retries by revision', () => {
    const first = sequenced(1),
      retry = sequenced(2)
    const second = sequenced(3, {
      ...delta(),
      revision: 2,
      previousRecordId: 2,
      operationId: NEXT_UUID,
    })
    expect(orderedRecords([second, retry, first]).map(comment => comment.id)).toEqual([1, 3])
  })

  it('rejects conflicting contents with the same revision', () => {
    const changed = sequenced(2, { ...delta(), operationId: NEXT_UUID, changes: [] })
    expect(() => orderedRecords([sequenced(1), changed])).toThrow('revision-conflict')
  })

  it('rejects a stable operation reused with different contents', () => {
    expect(() =>
      orderedRecords([
        sequenced(1),
        sequenced(2, { ...delta(), revision: 2, previousRecordId: 1 }),
      ]),
    ).toThrow('operation-conflict')
  })

  it('refuses revision gaps, missing predecessors and mixed line streams', () => {
    expect(() =>
      orderedRecords([sequenced(1, { ...delta(), revision: 2, previousRecordId: 9 })]),
    ).toThrow('revision-gap')
    expect(() =>
      orderedRecords([
        sequenced(1),
        sequenced(2, { ...delta(), revision: 2, previousRecordId: 9, operationId: NEXT_UUID }),
      ]),
    ).toThrow('predecessor-mismatch')
    expect(() =>
      orderedRecords([
        sequenced(1),
        sequenced(2, {
          ...delta(),
          lineParent: 20,
          continuation: { kind: 'active', assignment: { ...assignment(), lineParent: 20 } },
        }),
      ]),
    ).toThrow('stream-mismatch')
  })
})
