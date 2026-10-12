import { describe, expect, it } from 'vitest'
import { collectDelivery } from '../src/delivery/github-read.ts'
import type { GhRead } from '../src/delivery/github-read.ts'
import { parseConfig } from '../src/delivery/protocol.ts'
const config = parseConfig({
  schemaVersion: 2,
  kind: 'github-delivery-config',
  protocolVersion: 2,
  enabled: false,
  repository: 'owner/repo',
  mode: 'manual-single-dispatcher',
  project: {
    owner: 'owner',
    number: 4,
    id: 'project-4',
    url: null,
    fields: { stage: 'status-physical-id', priority: null, iteration: null },
  },
  creationHandoffIssue: null,
  writers: { stage: null, body: null },
})
const rawIssue = {
  number: 1,
  node_id: 'issue-1',
  html_url: 'https://github.com/owner/repo/issues/1',
  state: 'open',
  updated_at: '2026-10-10T00:00:00Z',
  body: 'ordinary issue; $(do-not-execute)',
  labels: [],
}
function project(stageField = 'status-physical-id'): unknown {
  return {
    data: {
      node: {
        id: 'project-4',
        fields: { pageInfo: { hasNextPage: false }, nodes: [{ id: stageField }] },
        items: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              content: { id: 'issue-1', url: rawIssue.html_url },
              fieldValues: {
                pageInfo: { hasNextPage: false },
                nodes: [{ name: 'Backlog', field: { id: stageField } }],
              },
            },
          ],
        },
      },
    },
  }
}
function backend(calls: string[][]): GhRead {
  return (argv, timeoutMs) => {
    calls.push([...argv])
    expect(timeoutMs).toBeGreaterThan(0)
    expect(timeoutMs).toBeLessThanOrEqual(15_000)
    if (argv[1] === 'graphql')
      return argv.some(v => v.includes('ProjectV2'))
        ? project()
        : { data: { node: { id: 'issue-1', parent: null } } }
    const path = argv.at(-1) ?? ''
    if (path.includes('/comments?') || path.includes('/dependencies/blocked_by?')) return []
    if (path.includes('/issues?'))
      return [rawIssue, { ...rawIssue, number: 2, pull_request: { url: 'ignore PR' } }]
    throw new Error('unexpected read')
  }
}
describe('bounded read-only GitHub capture', () => {
  it('uses fixed read commands, excludes PRs and reads physical Status by field ID', () => {
    const calls: string[][] = [],
      result = collectDelivery(config, backend(calls))
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.stage).toBe('Backlog')
    expect(result.issues[0]?.relationsComplete).toBe(true)
    expect(result.collection.issues).toBe('complete')
    expect(result.collection.project).toBe('complete')
    for (const call of calls) {
      expect(call[0]).toBe('api')
      if (call[1] === 'graphql')
        expect(call.find(v => v.startsWith('query='))).toMatch(/^query=query\(/)
      else {
        expect(call.slice(1, 3)).toEqual(['--method', 'GET'])
        expect(call.at(-1)).toMatch(/^repos\/owner\/repo\//)
      }
      expect(call.join(' ')).not.toMatch(/mutation|auth token|issue create|issue edit/)
    }
  })
  it('keeps permissions and malformed responses unknown without disclosing API error content', () => {
    const result = collectDelivery(config, () => {
      throw new Error('secret-ghp-token body')
    })
    expect(result.collection.issues).toBe('partial')
    expect(result.collection.project).toBe('unknown')
    expect(result.collection.errors.length).toBeGreaterThan(0)
    expect(JSON.stringify(result)).not.toContain('secret-ghp-token')
    const malformed = collectDelivery(config, () => ({}))
    expect(malformed.collection.issues).toBe('partial')
  })
  it('never marks an unconfirmed configured Stage field complete', () => {
    const calls: string[][] = [],
      read = backend(calls)
    const result = collectDelivery(config, (argv, timeout) =>
      argv.some(v => v.includes('ProjectV2')) ? project('other-field') : read(argv, timeout),
    )
    expect(result.collection.project).toBe('unknown')
    expect(result.issues[0]?.stage).toBeNull()
  })
  it('keeps comment and relation failures distinct from Issue existence', () => {
    const calls: string[][] = [],
      read = backend(calls)
    const result = collectDelivery(config, (argv, timeout) => {
      if (
        argv.at(-1)?.includes('/comments?') ||
        argv.at(-1)?.includes('/dependencies/blocked_by?') ||
        argv.some(v => v.includes('parent{'))
      )
        throw new Error('unavailable')
      return read(argv, timeout)
    })
    expect(result.collection.issues).toBe('complete')
    expect(result.issues[0]?.commentsComplete).toBe(false)
    expect(result.issues[0]?.relationsComplete).toBe(false)
  })
  it('terminates full pages at the declared page limit', () => {
    let pages = 0
    const result = collectDelivery(config, argv => {
      if (argv[1] === 'graphql') return project()
      pages += 1
      return Array.from({ length: 100 }, () => ({ pull_request: {} }))
    })
    expect(pages).toBe(20)
    expect(result.collection.issues).toBe('partial')
    expect(result.collection.errors.some(error => error.includes('Page limit'))).toBe(true)
  })
})
