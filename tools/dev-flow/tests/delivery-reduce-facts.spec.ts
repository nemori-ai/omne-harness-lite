import { describe, expect, it } from 'vitest'
import type { GhRead } from '../src/delivery/github-read.ts'
import { readCandidateFacts } from '../src/delivery/reduce-integration-facts.ts'
import { BASE, FINAL, HEAD, requestInput } from './fixtures/collaboration.ts'

function mergedEvent(id = 101) {
  return {
    id,
    event: 'merged',
    url: `https://api.github.com/repos/owner/repo/issues/events/${id}`,
    commit_id: FINAL,
    commit_url: `https://api.github.com/repos/owner/repo/commits/${FINAL}`,
  }
}

function fixture(merged: boolean, pages: unknown[][] = []) {
  const calls: string[] = []
  const pull = {
    number: 12,
    html_url: 'https://github.com/owner/repo/pull/12',
    head: { sha: HEAD },
    base: { ref: 'integration/legacy-refactor', repo: { full_name: 'owner/repo' } },
    state: merged ? 'closed' : 'open',
    merged,
  }
  const read: GhRead = argv => {
    expect(argv).toContain('X-GitHub-Api-Version: 2026-03-10')
    const path = argv.at(-1) ?? ''
    calls.push(path)
    if (path.endsWith('/pulls/12')) return pull
    if (path.includes('/git/ref/heads/'))
      return { ref: 'refs/heads/integration/legacy-refactor', object: { sha: BASE } }
    const page = path.match(/\/issues\/12\/events\?per_page=100&page=(\d+)$/)
    if (page !== null) {
      const value = pages[Number(page[1]) - 1]
      if (value === undefined) throw new Error('page unavailable')
      return value
    }
    throw new Error(`unexpected read: ${path}`)
  }
  return { read, calls }
}

describe('reduce candidate facts on REST 2026-03-10', () => {
  it('reads an open candidate without the removed merge_commit_sha field', () => {
    const f = fixture(false)
    expect(readCandidateFacts(f.read, requestInput())).toEqual({
      head: HEAD,
      targetHead: BASE,
      merged: false,
      state: 'open',
      mergeCommit: null,
    })
    expect(f.calls).toHaveLength(2)
  })

  it('reads the actual merge from a later complete event page', () => {
    const f = fixture(true, [
      Array.from({ length: 100 }, (_, index) => ({ id: index + 1, event: 'labeled' })),
      [mergedEvent()],
    ])
    expect(readCandidateFacts(f.read, requestInput()).mergeCommit).toBe(FINAL)
    expect(f.calls.at(-1)).toBe('repos/owner/repo/issues/12/events?per_page=100&page=2')
  })

  it('does not treat a closed or merged flag as a merge commit', () => {
    expect(() => readCandidateFacts(fixture(true, [[]]).read, requestInput())).toThrow(
      'reduce-merge-event-missing',
    )
  })

  it('rejects two merge events instead of selecting the latest', () => {
    const f = fixture(true, [[mergedEvent(), mergedEvent(102)]])
    expect(() => readCandidateFacts(f.read, requestInput())).toThrow('reduce-merge-event-conflict')
  })

  it.each(['commit_url', 'url'])('rejects a foreign %s', field => {
    const f = fixture(true, [
      [{ ...mergedEvent(), [field]: 'https://api.github.com/repos/foreign/repo/commits/' + FINAL }],
    ])
    expect(() => readCandidateFacts(f.read, requestInput())).toThrow('reduce-merge-event-identity')
  })

  it('rejects duplicate event pages', () => {
    const page = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, event: 'labeled' }))
    const f = fixture(true, [page, [page[0]]])
    expect(() => readCandidateFacts(f.read, requestInput())).toThrow(
      'reduce-merge-events-duplicate',
    )
  })

  it('does not return a merge from an incomplete read', () => {
    const f = fixture(true, [
      [
        mergedEvent(),
        ...Array.from({ length: 99 }, (_, index) => ({ id: index + 1, event: 'labeled' })),
      ],
    ])
    expect(() => readCandidateFacts(f.read, requestInput())).toThrow('page unavailable')
  })

  it('rejects a missing merge SHA', () => {
    const f = fixture(true, [[{ ...mergedEvent(), commit_id: null }]])
    expect(() => readCandidateFacts(f.read, requestInput())).toThrow('merged event.commit_id')
  })
})
