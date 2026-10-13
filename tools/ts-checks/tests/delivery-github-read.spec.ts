import { describe, expect, it, vi } from 'vitest'
import { collectDelivery } from '../src/delivery/github-read.ts'
import type { GhRead } from '../src/delivery/github-read.ts'
import { collectAdmission } from '../src/delivery/admission.ts'
import { parseCapture, parseConfig } from '../src/delivery/protocol.ts'
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

const issueUrl = (number: number) => `https://github.com/owner/repo/issues/${number}`
function page(nodes: unknown[], cursor: string | null = null) {
  return { nodes, pageInfo: { hasNextPage: cursor !== null, endCursor: cursor } }
}
function admissionBackend() {
  const calls: string[][] = [],
    issues = new Map([[1, { ...rawIssue }]]),
    comments = new Map<number, unknown[]>(),
    blockedBy = new Map<number, number[]>(),
    parents = new Map<number, number>(),
    scope = { task: issueUrl(1), authority: `${issueUrl(1)}#issuecomment-1` }
  const read: GhRead = argv => {
    calls.push([...argv])
    const query = argv.find(arg => arg.startsWith('query=')) ?? '',
      id = argv.find(arg => arg.startsWith('id='))?.slice(3),
      cursor = argv.find(arg => arg.startsWith('cursor='))?.slice(7),
      path = argv.at(-1) ?? ''
    if (/\/issues\?/.test(path) || query.includes(' items('))
      throw new Error('Forbidden repository enumeration')
    if (argv[1] === 'graphql') {
      if (query.includes('parent{')) {
        const number = Number(id?.replace('issue-', '')),
          parent = parents.get(number)
        return {
          data: { node: { id, parent: parent === undefined ? null : { url: issueUrl(parent) } } },
        }
      }
      if (query.includes('projectItems('))
        return {
          data: {
            node: {
              id,
              url: issueUrl(1),
              projectItems: page([{ id: 'item-1', project: { id: 'project-4' } }]),
            },
          },
        }
      if (query.includes('... on ProjectV2Item{'))
        return {
          data: {
            node: {
              id,
              project: { id: 'project-4' },
              fieldValues: page([
                {
                  __typename: 'ProjectV2ItemFieldSingleSelectValue',
                  name: 'Ready',
                  field: { id: 'status-physical-id' },
                },
              ]),
            },
          },
        }
      if (query.includes(' fields('))
        return {
          data: {
            node: {
              id,
              fields: page([
                { __typename: 'ProjectV2SingleSelectField', id: 'status-physical-id' },
              ]),
            },
          },
        }
      throw new Error(`Unexpected query ${cursor}`)
    }
    const match = /\/issues\/(\d+)(.*)$/.exec(path),
      number = Number(match?.[1]),
      suffix = match?.[2]
    if (suffix === '') return issues.get(number)
    if (suffix?.startsWith('/comments?')) {
      const index = Number(new URLSearchParams(suffix.split('?')[1]).get('page')) - 1
      return (comments.get(number) ?? []).slice(index * 100, (index + 1) * 100)
    }
    if (suffix?.startsWith('/dependencies/blocked_by?'))
      return (blockedBy.get(number) ?? []).map(n => ({ html_url: issueUrl(n) }))
    throw new Error('Unexpected endpoint')
  }
  function add(number: number, body = 'ordinary related Issue') {
    issues.set(number, {
      ...rawIssue,
      number,
      node_id: `issue-${number}`,
      html_url: issueUrl(number),
      body,
    })
  }
  return { read, calls, issues, comments, blockedBy, parents, scope, add }
}
function conditionBody(target: string) {
  return `- 交付层级：delivery\n- 交付修订：1\n## 交付条件\n| 条件ID | 类型 | 目标 | 阶段 | 所需结果与判据 | 确认责任及证据入口 |\n| --- | --- | --- | --- | --- | --- |\n| D1 | decision | ${target} | start | 核对结果 | human |`
}
describe('scoped admission capture', () => {
  it('ignores unrelated history and reads condition, native and declared parent closure once', () => {
    const f = admissionBackend()
    f.add(1, `- 父交付卡：${issueUrl(5)}\n` + conditionBody(issueUrl(2)))
    f.add(2, conditionBody(issueUrl(3)) + '\n条件表后的说明文字。')
    for (const number of [3, 4, 5, 6, 99]) f.add(number)
    f.blockedBy.set(1, [4])
    f.parents.set(4, 6)
    f.blockedBy.set(6, [1])
    const result = collectAdmission(config, f.scope, f.read)
    expect(result.closure).toEqual([1, 2, 3, 4, 5, 6].map(issueUrl))
    expect(result.issues.find(issue => issue.number === 1)?.stage).toBe('Ready')
    expect(
      f.calls
        .filter(call => /^repos\/owner\/repo\/issues\/\d+$/.test(call.at(-1) ?? ''))
        .map(call => call.at(-1)),
    ).toEqual([1, 4, 5, 2, 6, 3].map(n => `repos/owner/repo/issues/${n}`))
    expect(JSON.stringify(result)).not.toContain('issues/99')
    expect(() => parseCapture(result)).toThrow()
  })
  it('includes distinct authority comments but does not expand its unrelated dependencies', () => {
    const f = admissionBackend()
    f.add(9)
    f.blockedBy.set(9, [999])
    const result = collectAdmission(
      config,
      { ...f.scope, authority: `${issueUrl(9)}#issuecomment-9` },
      (argv, timeout) => {
        if (
          argv.at(-1)?.includes('/issues/9/dependencies/') ||
          (argv.includes('id=issue-9') && argv.some(arg => arg.includes('parent{')))
        )
          throw new Error('Unrelated authority relations must not be read')
        return f.read(argv, timeout)
      },
    )
    expect(result.issues.map(issue => issue.number)).toEqual([1, 9])
    expect(result.closure).toEqual([issueUrl(1)])
    expect(result.issues.find(issue => issue.number === 9)?.relationsComplete).toBe(false)
  })
  it.each(['malformed', 'duplicate', 'skipped', 'missing', 'foreign'])(
    'refuses %s condition references before returning a partial closure',
    mode => {
      const f = admissionBackend()
      let body = conditionBody(issueUrl(2))
      if (mode === 'malformed') body = body.replace('| decision |', '| unsupported |')
      if (mode === 'duplicate') body += '\n' + body.split('\n').at(-1)
      if (mode === 'skipped') body += '\nD2 | decision | omitted table row'
      if (mode === 'missing') body = '- 交付层级：delivery\n- 交付修订：1'
      if (mode === 'foreign') body = conditionBody('https://github.com/other/repo/issues/2')
      f.add(1, body)
      f.add(2)
      expect(() => collectAdmission(config, f.scope, f.read)).toThrow()
    },
  )
  it('rejects missing Issues, PR substitution, URL/number/node identity changes and malformed comments', () => {
    for (const replacement of [
      undefined,
      { ...rawIssue, pull_request: {} },
      { ...rawIssue, html_url: issueUrl(2) },
      { ...rawIssue, number: 2 },
      { ...rawIssue, node_id: '' },
    ]) {
      const f = admissionBackend()
      expect(() =>
        collectAdmission(config, f.scope, (argv, timeout) =>
          argv.at(-1) === 'repos/owner/repo/issues/1' ? replacement : f.read(argv, timeout),
        ),
      ).toThrow()
    }
    const f = admissionBackend()
    f.comments.set(1, [{}])
    expect(() => collectAdmission(config, f.scope, f.read)).toThrow()
    f.comments.clear()
    f.add(2)
    f.blockedBy.set(1, [2])
    f.issues.set(2, { ...rawIssue, number: 2, html_url: issueUrl(2) })
    expect(() => collectAdmission(config, f.scope, f.read)).toThrow('duplicated')
  })
  it('allows depth 8 and backedges, but rejects a new ninth edge', () => {
    const f = admissionBackend()
    for (let n = 2; n <= 9; n += 1) {
      f.add(n)
      f.parents.set(n - 1, n)
    }
    f.parents.set(9, 1)
    expect(collectAdmission(config, f.scope, f.read).closure).toHaveLength(9)
    f.add(10)
    f.parents.set(9, 10)
    expect(() => collectAdmission(config, f.scope, f.read)).toThrow('8 dependency')
  })
  it('counts standalone authority within the 32 Issue bound', () => {
    const f = admissionBackend()
    for (let n = 2; n <= 33; n += 1) f.add(n)
    f.blockedBy.set(
      1,
      Array.from({ length: 30 }, (_, i) => i + 2),
    )
    const scope = { ...f.scope, authority: `${issueUrl(33)}#issuecomment-1` }
    expect(collectAdmission(config, scope, f.read).issues).toHaveLength(32)
    f.blockedBy.set(
      1,
      Array.from({ length: 31 }, (_, i) => i + 2),
    )
    expect(() => collectAdmission(config, scope, f.read)).toThrow('32 required')
  })
  it('reads every comment page and refuses failed pages and exhaustion without exposing API content', () => {
    const f = admissionBackend()
    const comment = {
      html_url: `${issueUrl(1)}#issuecomment-1`,
      user: { login: 'human' },
      body: '',
      updated_at: rawIssue.updated_at,
    }
    f.comments.set(
      1,
      Array.from({ length: 101 }, (_, n) => ({
        ...comment,
        html_url: `${issueUrl(1)}#issuecomment-${n + 1}`,
      })),
    )
    expect(collectAdmission(config, f.scope, f.read).issues[0]?.comments).toHaveLength(101)
    expect(() =>
      collectAdmission(config, f.scope, (argv, timeout) => {
        if (argv.at(-1)?.includes('/comments?per_page=100&page=2')) throw new Error('secret token')
        return f.read(argv, timeout)
      }),
    ).toThrow('API output omitted')
    expect(() =>
      collectAdmission(config, f.scope, (argv, timeout) =>
        argv.at(-1)?.includes('/comments?')
          ? Array.from({ length: 100 }, () => comment)
          : f.read(argv, timeout),
      ),
    ).toThrow('page limit')
  })
  it('paginates configured fields, task memberships and target values; permits an unset Stage', () => {
    const f = admissionBackend()
    const result = collectAdmission(config, f.scope, (argv, timeout) => {
      const query = argv.find(arg => arg.startsWith('query=')) ?? '',
        second = argv.includes('cursor=next')
      if (query.includes(' fields('))
        return {
          data: {
            node: {
              id: 'project-4',
              fields: second
                ? page([{ __typename: 'ProjectV2SingleSelectField', id: 'status-physical-id' }])
                : page([], 'next'),
            },
          },
        }
      if (query.includes('projectItems('))
        return {
          data: {
            node: {
              id: 'issue-1',
              url: issueUrl(1),
              projectItems: second
                ? page([{ id: 'item-1', project: { id: 'project-4' } }])
                : page([], 'next'),
            },
          },
        }
      if (query.includes('... on ProjectV2Item{'))
        return {
          data: {
            node: {
              id: 'item-1',
              project: { id: 'project-4' },
              fieldValues: second ? page([]) : page([], 'next'),
            },
          },
        }
      return f.read(argv, timeout)
    })
    expect(result.issues[0]?.stage).toBeNull()
  })
  it.each([
    'field-absent',
    'field-unknown',
    'membership-absent',
    'membership-duplicate',
    'values-unknown',
    'page-incomplete',
    'page-cycle',
  ])('rejects %s Project evidence', mode => {
    const f = admissionBackend()
    expect(() =>
      collectAdmission(config, f.scope, (argv, timeout) => {
        const query = argv.find(arg => arg.startsWith('query=')) ?? ''
        if (query.includes(' fields(') && mode.startsWith('field-'))
          return {
            data: {
              node: { id: 'project-4', fields: mode === 'field-absent' ? page([]) : { nodes: [] } },
            },
          }
        if (query.includes('projectItems(') && mode.startsWith('membership-'))
          return {
            data: {
              node: {
                id: 'issue-1',
                url: issueUrl(1),
                projectItems: page(
                  mode === 'membership-absent'
                    ? []
                    : Array.from({ length: 2 }, () => ({
                        id: 'item-1',
                        project: { id: 'project-4' },
                      })),
                ),
              },
            },
          }
        if (query.includes('... on ProjectV2Item{')) {
          if (mode === 'values-unknown')
            return {
              data: {
                node: { id: 'item-1', project: { id: 'project-4' }, fieldValues: page([{}]) },
              },
            }
          if (mode === 'page-incomplete')
            return {
              data: {
                node: {
                  id: 'item-1',
                  project: { id: 'project-4' },
                  fieldValues: { nodes: [], pageInfo: { hasNextPage: true } },
                },
              },
            }
          if (mode === 'page-cycle')
            return {
              data: {
                node: { id: 'item-1', project: { id: 'project-4' }, fieldValues: page([], 'same') },
              },
            }
        }
        return f.read(argv, timeout)
      }),
    ).toThrow()
  })
})

it('keeps the 200-request and 120-second admission budgets', () => {
  const f = admissionBackend()
  for (let n = 1; n <= 32; n += 1) {
    f.add(n)
    f.comments.set(
      n,
      Array.from({ length: 500 }, (_, i) => ({
        html_url: issueUrl(n) + '#issuecomment-' + (i + 1),
        user: { login: 'human' },
        body: '',
        updated_at: rawIssue.updated_at,
      })),
    )
  }
  f.blockedBy.set(
    1,
    Array.from({ length: 31 }, (_, i) => i + 2),
  )
  expect(() => collectAdmission(config, f.scope, f.read)).toThrow('request or time limit')
  expect(f.calls).toHaveLength(200)
  const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(120_000)
  try {
    const timed = admissionBackend()
    expect(() => collectAdmission(config, timed.scope, timed.read)).toThrow('request or time limit')
    expect(timed.calls).toHaveLength(0)
  } finally {
    clock.mockRestore()
  }
})
it.each(['comments', 'dependencies', 'parent'])(
  'rejects an unreadable required %s page',
  failure => {
    const f = admissionBackend()
    expect(() =>
      collectAdmission(config, f.scope, (argv, timeout) => {
        const path = argv.at(-1) ?? ''
        if (
          (failure === 'comments' && path.includes('/comments?')) ||
          (failure === 'dependencies' && path.includes('/dependencies/')) ||
          (failure === 'parent' && argv.some(arg => arg.includes('parent{')))
        )
          throw new Error('private API detail')
        return f.read(argv, timeout)
      }),
    ).toThrow('API output omitted')
  },
)
