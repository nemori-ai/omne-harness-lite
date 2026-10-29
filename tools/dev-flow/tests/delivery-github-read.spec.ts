import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { collectDelivery, GhReadError, runGhRead } from '../src/delivery/github-read.ts'
import type { GhRead } from '../src/delivery/github-read.ts'
import { collectAdmission, observeAdmission } from '../src/delivery/admission.ts'
import { InputError, parseCapture, parseConfig } from '../src/delivery/protocol.ts'
import { ghEnv, writeGh } from './fixtures/gh.ts'
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
/** What `gh api` leaves on stdout when GitHub answers that an Issue has no parent. */
const NO_PARENT = {
  message: 'No parent issue found',
  documentation_url: 'https://docs.github.com/rest/issues/sub-issues#get-parent-issue',
  status: '404',
}
const isParentRead = (argv: readonly string[]) => argv.at(-1)?.endsWith('/parent') === true
function backend(calls: string[][]): GhRead {
  return (argv, timeoutMs) => {
    calls.push([...argv])
    expect(timeoutMs).toBeGreaterThan(0)
    expect(timeoutMs).toBeLessThanOrEqual(15_000)
    if (argv[1] === 'graphql') return project()
    const path = argv.at(-1) ?? ''
    if (path === 'repos/owner/repo/issues/1/parent') throw new GhReadError(NO_PARENT)
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
    expect(calls.filter(isParentRead).map(call => call.at(-1))).toEqual([
      'repos/owner/repo/issues/1/parent',
    ])
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
        isParentRead(argv)
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
    issues = new Map<number, Record<string, unknown>>([[1, { ...rawIssue }]]),
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
    if (suffix === '/parent') {
      const parent = parents.get(number)
      if (parent === undefined) throw new GhReadError(NO_PARENT)
      return { ...rawIssue, number: parent, html_url: issueUrl(parent) }
    }
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
    f.add(2, conditionBody(issueUrl(3)) + '\n说明：核对命令 `gh issue view 224 | cat`。')
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
          argv.at(-1) === 'repos/owner/repo/issues/9/parent'
        )
          throw new Error('Unrelated authority relations must not be read')
        return f.read(argv, timeout)
      },
    )
    expect(result.issues.map(issue => issue.number)).toEqual([1, 9])
    expect(result.closure).toEqual([issueUrl(1)])
    expect(result.issues.find(issue => issue.number === 9)?.relationsComplete).toBe(false)
  })
  it.each([
    'malformed',
    'duplicate',
    'skipped',
    'skipped-invalid-id',
    'skipped-no-end',
    'missing',
    'foreign',
  ])('refuses %s condition references before returning a partial closure', mode => {
    const f = admissionBackend()
    let body = conditionBody(issueUrl(2))
    if (mode === 'malformed') body = body.replace('| decision |', '| unsupported |')
    if (mode === 'duplicate') body += '\n' + body.split('\n').at(-1)
    if (mode === 'skipped') body += '\nD2 | decision | omitted table row'
    if (mode === 'skipped-invalid-id')
      body +=
        '\n123 | decision | https://github.com/owner/repo/issues/99 | start | 核对结果 | human |'
    if (mode === 'skipped-no-end')
      body +=
        '\nD2 | unsupported | https://github.com/owner/repo/issues/99 | start | 核对结果 | human'
    if (mode === 'missing') body = '- 交付层级：delivery\n- 交付修订：1'
    if (mode === 'foreign') body = conditionBody('https://github.com/other/repo/issues/2')
    f.add(1, body)
    f.add(2)
    expect(() => collectAdmission(config, f.scope, f.read)).toThrow()
  })
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
  it('reads a closed related Issue itself but neither its relations nor its targets', () => {
    const f = admissionBackend()
    f.add(1, conditionBody(issueUrl(2)))
    f.add(2, `- 父交付卡：${issueUrl(7)}\n` + conditionBody(issueUrl(3)))
    for (const number of [3, 4, 5, 6, 7, 8]) f.add(number)
    f.issues.set(2, { ...f.issues.get(2), state: 'closed' })
    f.blockedBy.set(1, [4])
    f.blockedBy.set(2, [5])
    f.parents.set(2, 6)
    f.parents.set(4, 8)
    const result = collectAdmission(config, f.scope, f.read)
    expect(result.closure).toEqual([1, 2, 4, 8].map(issueUrl))
    const closed = result.issues.find(issue => issue.number === 2)
    expect(closed).toMatchObject({ state: 'closed', relationsComplete: false, blockedBy: [] })
    expect(closed?.parentIssue).toBeNull()
    expect(result.issues.find(issue => issue.number === 4)?.relationsComplete).toBe(true)
    const paths = f.calls.map(call => call.at(-1) ?? '')
    expect(paths.some(path => /issues\/2\/(dependencies|parent)/.test(path))).toBe(false)
    expect(paths.some(path => /issues\/(3|5|6|7)(\/|$)/.test(path))).toBe(false)
    expect(paths).toContain('repos/owner/repo/issues/2/comments?per_page=100&page=1')
  })
  it('still expands the task when the task itself is closed', () => {
    const f = admissionBackend()
    f.add(1, conditionBody(issueUrl(2)))
    f.add(2)
    f.issues.set(1, { ...f.issues.get(1), state: 'closed' })
    f.blockedBy.set(1, [2])
    const result = collectAdmission(config, f.scope, f.read)
    expect(result.closure).toEqual([1, 2].map(issueUrl))
    expect(result.issues.find(issue => issue.number === 1)?.relationsComplete).toBe(true)
  })
  it('admits a task behind a closed Issue whose own history exceeds both bounds', () => {
    const f = admissionBackend()
    f.add(1, conditionBody(issueUrl(2)))
    f.blockedBy.set(1, [2])
    for (let n = 2; n <= 41; n += 1) {
      f.add(n)
      f.issues.set(n, { ...f.issues.get(n), state: 'closed' })
      if (n < 41) f.parents.set(n, n + 1)
    }
    f.blockedBy.set(
      2,
      Array.from({ length: 35 }, (_, i) => i + 3),
    )
    const result = collectAdmission(config, f.scope, f.read)
    expect(result.closure).toEqual([1, 2].map(issueUrl))
    const codes = observeAdmission(config, result).findings.map(finding => finding.code)
    expect(codes).not.toContain('native-relations-incomplete')
    expect(codes).not.toContain('parent-unverified')
    expect(codes).not.toContain('condition-target-dangling')
    expect(codes).not.toContain('native-target-dangling')
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
          (failure === 'parent' && isParentRead(argv))
        )
          throw new Error('private API detail')
        return f.read(argv, timeout)
      }),
    ).toThrow('API output omitted')
  },
)

/** Parent reads whose outcome is not a stated parent or a stated absence. */
const SECRET = 'secret-parent-response'
const unknownParent: [string, () => unknown][] = [
  ['a 200 Issue without html_url', () => ({ number: 7, url: SECRET })],
  ['a 200 Issue whose html_url is not a string', () => ({ html_url: null, body: SECRET })],
  ['a 200 response that is not an object', () => [SECRET]],
  [
    'a 404 Not Found',
    () => {
      throw new GhReadError({ ...NO_PARENT, message: 'Not Found', detail: SECRET })
    },
  ],
  [
    'a 404 whose message differs by case',
    () => {
      throw new GhReadError({ ...NO_PARENT, message: 'no parent issue found', detail: SECRET })
    },
  ],
  [
    'a 404 whose message has trailing space',
    () => {
      throw new GhReadError({ ...NO_PARENT, message: 'No parent issue found ', detail: SECRET })
    },
  ],
  [
    'the no-parent message with status 403',
    () => {
      throw new GhReadError({ ...NO_PARENT, status: '403', detail: SECRET })
    },
  ],
  [
    'the no-parent message without a status',
    () => {
      throw new GhReadError({ message: NO_PARENT.message, detail: SECRET })
    },
  ],
  [
    'an error response that is not an object',
    () => {
      throw new GhReadError(`No parent issue found ${SECRET}`)
    },
  ],
  [
    'a read failure without a response, such as a timeout',
    () => {
      throw new Error(`ETIMEDOUT ${SECRET}`)
    },
  ],
]
describe('native parent read over REST', () => {
  function delivery(parent: () => unknown) {
    const read = backend([])
    return collectDelivery(config, (argv, timeout) =>
      isParentRead(argv) ? parent() : read(argv, timeout),
    )
  }
  function admission(parent: () => unknown) {
    const f = admissionBackend()
    f.add(7)
    return collectAdmission(config, f.scope, (argv, timeout) =>
      argv.at(-1) === 'repos/owner/repo/issues/1/parent' ? parent() : f.read(argv, timeout),
    )
  }
  it('takes the html_url of a returned parent Issue', () => {
    const parent = () => ({ ...rawIssue, number: 7, html_url: issueUrl(7) })
    const observed = delivery(parent).issues[0]
    expect(observed?.parentIssue).toBe(issueUrl(7))
    expect(observed?.relationsComplete).toBe(true)
    const admitted = admission(parent)
    expect(admitted.issues.find(issue => issue.number === 1)?.parentIssue).toBe(issueUrl(7))
    expect(admitted.closure).toEqual([issueUrl(1), issueUrl(7)])
  })
  it('records no parent only for 404 with the exact No parent issue found message', () => {
    const parent = () => {
      throw new GhReadError(NO_PARENT)
    }
    const result = delivery(parent)
    expect(result.issues[0]?.parentIssue).toBeNull()
    expect(result.issues[0]?.relationsComplete).toBe(true)
    expect(result.collection.errors.filter(error => error.includes('Parent'))).toEqual([])
    const admitted = admission(parent)
    expect(admitted.issues.find(issue => issue.number === 1)?.parentIssue).toBeNull()
    expect(admitted.closure).toEqual([issueUrl(1)])
  })
  it.each(unknownParent)('marks relations incomplete for %s', (_, parent) => {
    const result = delivery(parent)
    expect(result.issues[0]?.parentIssue).toBeNull()
    expect(result.issues[0]?.relationsComplete).toBe(false)
    expect(result.collection.errors).toContain(
      'Parent relation unknown for Issue 1. API output omitted.',
    )
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })
  it.each(unknownParent)('refuses admission for %s', (_, parent) => {
    let thrown: unknown
    try {
      admission(parent)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(InputError)
    expect((thrown as Error).message).toBe('Admission parent relation unknown. API output omitted.')
  })
  it('keeps every other failed read failed when it carries a response body', () => {
    const f = admissionBackend()
    expect(() =>
      collectAdmission(config, f.scope, (argv, timeout) => {
        if (argv.at(-1)?.includes('/comments?')) throw new GhReadError(NO_PARENT)
        return f.read(argv, timeout)
      }),
    ).toThrow('Admission GitHub read failed. API output omitted.')
    const read = backend([])
    const result = collectDelivery(config, (argv, timeout) => {
      if (argv.at(-1)?.includes('/dependencies/blocked_by?')) throw new GhReadError([])
      return read(argv, timeout)
    })
    expect(result.issues[0]?.relationsComplete).toBe(false)
  })
})

describe('gh read process outcomes', () => {
  // Slow: each case starts a fake gh child process.
  function withFakeGh<T>(script: string, run: () => T): T {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dev-flow-gh-read-')))
    try {
      writeGh(dir, `#!/usr/bin/env node\n${script}\n`)
      for (const [name, value] of Object.entries(ghEnv(dir))) vi.stubEnv(name, value)
      return run()
    } finally {
      vi.unstubAllEnvs()
      rmSync(dir, { recursive: true, force: true })
    }
  }
  function failure(script: string, timeoutMs = 10_000): unknown {
    return withFakeGh(script, () => {
      try {
        runGhRead(['api', 'repos/owner/repo/issues/1/parent'], timeoutMs)
      } catch (error) {
        return error
      }
      throw new Error('gh read unexpectedly succeeded')
    })
  }
  it('parses stdout of a successful read', { tags: ['slow'] }, () => {
    expect(
      withFakeGh(`process.stdout.write(JSON.stringify({ html_url: 'parent' }))`, () =>
        runGhRead(['api', 'x'], 10_000),
      ),
    ).toEqual({ html_url: 'parent' })
  })
  it('carries the JSON response of a non-zero exit without exposing it', { tags: ['slow'] }, () => {
    const error = failure(
      `process.stdout.write(JSON.stringify(${JSON.stringify(NO_PARENT)})); process.stderr.write('gh: No parent issue found (HTTP 404)'); process.exit(1)`,
    )
    expect(error).toBeInstanceOf(GhReadError)
    expect((error as GhReadError).body).toEqual(NO_PARENT)
    expect((error as GhReadError).message).not.toContain('No parent issue found')
  })
  it.each([
    ['non-JSON stdout', `process.stdout.write('gh: not json'); process.exit(1)`, 10_000],
    ['empty stdout', `process.stderr.write('network down'); process.exit(1)`, 10_000],
    [
      'a timeout after JSON output',
      `process.stdout.write(JSON.stringify(${JSON.stringify(NO_PARENT)})); setTimeout(() => {}, 30_000)`,
      300,
    ],
  ])('keeps %s a plain failure', { tags: ['slow'] }, (_, script, timeoutMs) => {
    const error = failure(script, timeoutMs)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(GhReadError)
  })
})

describe('Issue milestone in captures', () => {
  it('records the milestone title, null without one, and nothing when the field is absent', () => {
    const f = admissionBackend()
    f.add(1)
    f.issues.set(1, { ...f.issues.get(1), milestone: { title: 'M1 首次联合验收' } })
    expect(collectAdmission(config, f.scope, f.read).issues[0]?.milestone).toBe('M1 首次联合验收')
    f.issues.set(1, { ...f.issues.get(1), milestone: null })
    expect(collectAdmission(config, f.scope, f.read).issues[0]?.milestone).toBeNull()
    f.add(1)
    expect(collectAdmission(config, f.scope, f.read).issues[0]).not.toHaveProperty('milestone')
  })
  it('reads the milestone in the repository capture and keeps it through parsing', () => {
    const calls: string[][] = [],
      base = backend(calls)
    const read: GhRead = (argv, timeoutMs) =>
      (argv.at(-1) ?? '').includes('/issues?')
        ? [{ ...rawIssue, milestone: { title: 'M1' } }]
        : base(argv, timeoutMs)
    const capture = collectDelivery(config, read)
    expect(capture.issues[0]?.milestone).toBe('M1')
    expect(parseCapture(JSON.parse(JSON.stringify(capture))).issues[0]?.milestone).toBe('M1')
    expect(() =>
      parseCapture({ ...capture, issues: [{ ...capture.issues[0], milestone: '' }] }),
    ).toThrow('milestone')
  })
})
