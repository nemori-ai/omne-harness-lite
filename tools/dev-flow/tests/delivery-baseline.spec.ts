// The registered contract baseline of a milestone, read from the comments of its baseline card.
// GitHub is a stand-in that records every call; the CLI cases start a Node process with a `gh`
// stand-in on PATH. No case reads or writes the real platform.
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BASELINE_MARKER,
  mergeRegistrations,
  parseBaselineText,
  readBaseline,
  renderBaselineBlock,
  type BaselineComment,
} from '../src/delivery/baseline.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { ghEnv, writeGh } from './fixtures/gh.ts'

const homes: string[] = []
afterEach(() => {
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})

const commit = (n: number) => n.toString(16).padStart(40, '0')
const digest = (n: number) => n.toString(16).padStart(64, '0')
const member = (path: string, n: number) => ({
  path,
  commit: commit(n),
  sha256: digest(n),
  apiTree: commit(1000 + n),
})
const block = (value: unknown) =>
  `\`\`\`json ${BASELINE_MARKER}\n${JSON.stringify(value, null, 2)}\n\`\`\``
/**
 * A comment of the baseline card; `id` also orders comments that share a creation time. The
 * author is the registrar `human` unless another login is given.
 */
function comment(id: number, createdAt: string, body: string, login = 'human'): BaselineComment {
  return {
    id,
    url: `https://github.com/owner/repo/issues/797#issuecomment-${id}`,
    createdAt,
    updatedAt: createdAt,
    author: { login, nodeId: `U_${login}` },
    body,
  }
}
/** Only `human` with its node ID may register. */
const registrar = ({ login, nodeId }: { login: string; nodeId: string }) =>
  login === 'human' && nodeId === 'U_human'
const merge = (comments: BaselineComment[]) => mergeRegistrations(comments, registrar)
const FULL = block({
  milestone: 'M1.5',
  members: [member('pkg/a', 1), member('pkg/b', 1), member('pkg/c', 1)],
})
const SUPPLEMENT = block({ milestone: 'M1.5', members: [member('pkg/b', 2)] })

describe('the merge of the registrations', () => {
  it('takes the latest registration of each member and keeps the others', () => {
    const merged = merge([
      comment(1, '2026-10-20T00:00:00Z', `登记基线\n\n${FULL}\n`),
      comment(2, '2026-10-21T00:00:00Z', '没有区块的评论'),
      comment(3, '2026-10-22T00:00:00Z', `补登记 pkg/b\n\n${SUPPLEMENT}`),
    ])
    expect(merged).toEqual({
      kind: 'merged',
      baseline: {
        milestone: 'M1.5',
        members: [member('pkg/a', 1), member('pkg/b', 2), member('pkg/c', 1)],
      },
      registrations: [
        {
          url: expect.stringContaining('-1'),
          createdAt: '2026-10-20T00:00:00Z',
          author: 'human',
          edited: false,
          members: ['pkg/a', 'pkg/b', 'pkg/c'],
        },
        {
          url: expect.stringContaining('-3'),
          createdAt: '2026-10-22T00:00:00Z',
          author: 'human',
          edited: false,
          members: ['pkg/b'],
        },
      ],
      ignored: [],
    })
  })

  it('orders the registrations by creation time, not by the order of the response', () => {
    const merged = merge([
      comment(3, '2026-10-22T00:00:00Z', SUPPLEMENT),
      comment(1, '2026-10-20T00:00:00Z', FULL),
    ])
    expect(merged).toMatchObject({
      kind: 'merged',
      baseline: { members: [member('pkg/a', 1), member('pkg/b', 2), member('pkg/c', 1)] },
    })
  })

  it('collects the breaking cards of every registration once', () => {
    const merged = merge([
      comment(1, '2026-10-20T00:00:00Z', FULL),
      comment(
        2,
        '2026-10-22T00:00:00Z',
        block({
          milestone: 'M1.5',
          members: [member('pkg/b', 2)],
          breakingCards: ['https://github.com/owner/repo/issues/9'],
        }),
      ),
      comment(
        3,
        '2026-10-23T00:00:00Z',
        block({
          milestone: 'M1.5',
          members: [member('pkg/c', 3)],
          breakingCards: [
            'https://github.com/owner/repo/issues/9',
            'https://github.com/owner/repo/issues/10',
          ],
        }),
      ),
    ])
    expect(merged).toMatchObject({
      kind: 'merged',
      baseline: {
        breakingCards: [
          'https://github.com/owner/repo/issues/9',
          'https://github.com/owner/repo/issues/10',
        ],
      },
    })
  })

  const refused = (...comments: BaselineComment[]) => {
    const result = merge(comments)
    if (result.kind !== 'refused') throw new Error('expected a refusal')
    return result.problems.map(problem => [problem.code, problem.comment])
  }
  it('refuses a card without any registration', () => {
    expect(refused(comment(1, '2026-10-20T00:00:00Z', '只有表格，没有机读区块'))).toEqual([
      ['baseline-missing', null],
    ])
    expect(refused()).toEqual([['baseline-missing', null]])
  })

  it('refuses a comment with two blocks', () => {
    expect(
      refused(comment(1, '2026-10-20T00:00:00Z', `${FULL}\n\n${SUPPLEMENT}`)).map(([code]) => code),
    ).toEqual(['baseline-duplicate'])
  })

  it('refuses a block of another shape', () => {
    const bad = [
      block({ milestone: 'M1.5', members: [{ ...member('pkg/a', 1), commit: 'short' }] }),
      block({ milestone: 'M1.5', members: [member('pkg/a', 1)], extra: 1 }),
      block({ members: [member('pkg/a', 1)] }),
      block({ milestone: 'M1.5', members: [] }),
      block({ milestone: 'M1.5', members: [member('pkg/a', 1), member('pkg/a', 2)] }),
      block({ milestone: 'M1.5', members: [member('../a', 1)] }),
      block({ milestone: 'M1.5', members: [member('pkg/a', 1)], breakingCards: ['x', 'x'] }),
      `\`\`\`json ${BASELINE_MARKER}\nnot json\n\`\`\``,
      `\`\`\`json ${BASELINE_MARKER}\n{"milestone": null}`,
    ]
    for (const body of bad)
      expect(refused(comment(1, '2026-10-20T00:00:00Z', body)), body).toEqual([
        ['baseline-invalid', expect.stringContaining('-1')],
      ])
  })

  it('adds a member that a later registration names for the first time', () => {
    // A contract member added after the baseline gets its first snapshot in a supplement.
    const merged = merge([
      comment(1, '2026-10-20T00:00:00Z', FULL),
      comment(
        2,
        '2026-10-22T00:00:00Z',
        block({ milestone: 'M1.5', members: [member('pkg/new', 2)] }),
      ),
    ])
    expect(merged).toMatchObject({
      kind: 'merged',
      baseline: {
        members: [member('pkg/a', 1), member('pkg/b', 1), member('pkg/c', 1), member('pkg/new', 2)],
      },
    })
  })

  it('refuses a registration of another milestone', () => {
    expect(
      refused(
        comment(1, '2026-10-20T00:00:00Z', FULL),
        comment(
          2,
          '2026-10-22T00:00:00Z',
          block({ milestone: null, members: [member('pkg/b', 2)] }),
        ),
      ),
    ).toEqual([['baseline-milestone-mismatch', expect.stringContaining('-2')]])
  })

  it('orders by creation time first and by id only within the same time', () => {
    const later = block({ milestone: 'M1.5', members: [member('pkg/b', 3)] })
    // id 2 was created later than id 5: time decides.
    expect(
      merge([
        comment(1, '2026-10-20T00:00:00Z', FULL),
        comment(2, '2026-10-23T00:00:00Z', later),
        comment(5, '2026-10-22T00:00:00Z', SUPPLEMENT),
      ]),
    ).toMatchObject({
      baseline: { members: [member('pkg/a', 1), member('pkg/b', 3), member('pkg/c', 1)] },
    })
    // Same time, the larger id comes last even when the response lists it first.
    expect(
      merge([
        comment(1, '2026-10-20T00:00:00Z', FULL),
        comment(7, '2026-10-22T00:00:00Z', later),
        comment(6, '2026-10-22T00:00:00Z', SUPPLEMENT),
      ]),
    ).toMatchObject({
      baseline: { members: [member('pkg/a', 1), member('pkg/b', 3), member('pkg/c', 1)] },
    })
  })

  it('refuses hashes one digit short and names a missing milestone key', () => {
    const short = (patch: object) =>
      refused(
        comment(
          1,
          '2026-10-20T00:00:00Z',
          block({ milestone: 'M1.5', members: [{ ...member('pkg/a', 1), ...patch }] }),
        ),
      )
    expect(short({ commit: commit(1).slice(1) })).toEqual([
      ['baseline-invalid', expect.any(String)],
    ])
    expect(short({ apiTree: commit(1).slice(1) })).toEqual([
      ['baseline-invalid', expect.any(String)],
    ])
    expect(short({ sha256: digest(1).slice(1) })).toEqual([
      ['baseline-invalid', expect.any(String)],
    ])
    const missing = merge([
      comment(1, '2026-10-20T00:00:00Z', block({ members: [member('pkg/a', 1)] })),
    ])
    expect(missing).toMatchObject({
      kind: 'refused',
      problems: [{ code: 'baseline-invalid', message: expect.stringContaining('缺 milestone') }],
    })
  })

  it('reads a baseline file as one block or as plain JSON, and refuses two blocks', () => {
    const value = { milestone: 'M1.5', members: [member('pkg/a', 1)] }
    expect(parseBaselineText(JSON.stringify(value))).toEqual(value)
    expect(parseBaselineText(`说明\n\n${block(value)}\n`)).toEqual(value)
    expect(() => parseBaselineText(`${block(value)}\n\n${block(value)}`)).toThrow('找到 2 个')
  })

  it('writes a block that reads back as the merged baseline', () => {
    const merged = merge([
      comment(1, '2026-10-20T00:00:00Z', FULL),
      comment(3, '2026-10-22T00:00:00Z', SUPPLEMENT),
    ])
    if (merged.kind !== 'merged') throw new Error('expected a merge')
    const text = renderBaselineBlock(merged.baseline)
    expect(text.startsWith(`\`\`\`json ${BASELINE_MARKER}\n`)).toBe(true)
    expect(parseBaselineText(text)).toEqual(merged.baseline)
  })
})

/** The publish environment: user `human` and team `stewards` are required reviewers. */
const ENVIRONMENT = {
  protection_rules: [
    { type: 'wait_timer' },
    {
      type: 'required_reviewers',
      reviewers: [
        { type: 'User', reviewer: { login: 'human', node_id: 'U_human' } },
        { type: 'Team', reviewer: { slug: 'stewards' } },
      ],
    },
  ],
}
type Served = { createdAt: string; body: string; login?: string; updatedAt?: string }
/**
 * Serves the comments of Issue 797 in pages of 100, the publish environment and the team
 * `stewards`, whose only active member is `steward`. Records every call.
 */
function github(bodies: Served[], environment: unknown = ENVIRONMENT) {
  const calls: (readonly string[])[] = []
  const call: GhCommand = argv => {
    calls.push(argv)
    const path = argv.at(-1) ?? ''
    const [route = '', query = ''] = path.split('?')
    if (route === 'repos/owner/repo/environments/publish') {
      if (environment === null) throw new Error('HTTP 404')
      return environment
    }
    if (route.startsWith('orgs/owner/teams/stewards/memberships/')) {
      if (route.endsWith('/steward')) return { state: 'active' }
      throw new Error('HTTP 404')
    }
    if (route !== 'repos/owner/repo/issues/797/comments') throw new Error(`unexpected ${path}`)
    const page = Number(new URLSearchParams(query).get('page'))
    return bodies.slice((page - 1) * 100, page * 100).map((item, index) => {
      const id = (page - 1) * 100 + index + 1,
        login = item.login ?? 'human'
      return {
        id,
        html_url: `https://github.com/owner/repo/issues/797#issuecomment-${id}`,
        created_at: item.createdAt,
        updated_at: item.updatedAt ?? item.createdAt,
        body: item.body,
        user: { login, node_id: `U_${login}` },
      }
    })
  }
  return { call, calls }
}
describe('reading the registrations', () => {
  it('reads every page with fixed GET requests and writes nothing', () => {
    const filler = Array.from({ length: 150 }, (_, index) => ({
      createdAt: `2026-10-20T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
      body: '讨论',
    }))
    const g = github([
      { createdAt: '2026-10-19T00:00:00Z', body: FULL },
      ...filler,
      { createdAt: '2026-10-22T00:00:00Z', body: SUPPLEMENT },
    ])
    const result = readBaseline({ repository: 'owner/repo', issue: 797, call: g.call })
    expect(result).toMatchObject({
      kind: 'merged',
      baseline: { members: [member('pkg/a', 1), member('pkg/b', 2), member('pkg/c', 1)] },
    })
    const get = (path: string) => [
      'api',
      '--method',
      'GET',
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      'X-GitHub-Api-Version: 2026-03-10',
      path,
    ]
    expect(g.calls).toEqual([
      ...[1, 2].map(page => get(`repos/owner/repo/issues/797/comments?per_page=100&page=${page}`)),
      get('repos/owner/repo/environments/publish'),
    ])
  })

  it('ignores a later block of an author who may not register, and lists it', () => {
    const g = github([
      { createdAt: '2026-10-19T00:00:00Z', body: FULL },
      {
        createdAt: '2026-10-22T00:00:00Z',
        login: 'stranger',
        body: block({
          milestone: 'M1.5',
          members: [member('pkg/b', 9)],
          breakingCards: ['https://github.com/owner/repo/issues/66'],
        }),
      },
    ])
    const result = readBaseline({ repository: 'owner/repo', issue: 797, call: g.call })
    expect(result).toEqual({
      kind: 'merged',
      baseline: {
        milestone: 'M1.5',
        members: [member('pkg/a', 1), member('pkg/b', 1), member('pkg/c', 1)],
      },
      registrations: [
        expect.objectContaining({ author: 'human', members: ['pkg/a', 'pkg/b', 'pkg/c'] }),
      ],
      ignored: [
        {
          url: expect.stringContaining('-2'),
          author: 'stranger',
          reason: expect.stringContaining('publish'),
        },
      ],
    })
  })

  it('takes a block of an active member of a reviewer team, and needs the node ID of a user', () => {
    const g = github([
      { createdAt: '2026-10-19T00:00:00Z', body: FULL },
      { createdAt: '2026-10-22T00:00:00Z', login: 'steward', body: SUPPLEMENT },
    ])
    expect(readBaseline({ repository: 'owner/repo', issue: 797, call: g.call })).toMatchObject({
      kind: 'merged',
      baseline: { members: [member('pkg/a', 1), member('pkg/b', 2), member('pkg/c', 1)] },
      ignored: [],
    })
    // The login of the reviewer with another node ID: a renamed or reused account.
    const impostor = github([{ createdAt: '2026-10-19T00:00:00Z', body: FULL }])
    const call: GhCommand = (argv, timeout) => {
      const value = impostor.call(argv, timeout)
      return Array.isArray(value)
        ? value.map(item => ({ ...item, user: { login: 'human', node_id: 'U_other' } }))
        : value
    }
    expect(readBaseline({ repository: 'owner/repo', issue: 797, call })).toMatchObject({
      kind: 'refused',
      problems: [{ code: 'baseline-missing' }],
      ignored: [{ author: 'human' }],
    })
  })

  it('marks an edited registration and fails when the environment cannot be read', () => {
    const g = github([
      { createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z', body: FULL },
    ])
    expect(readBaseline({ repository: 'owner/repo', issue: 797, call: g.call })).toMatchObject({
      registrations: [{ edited: true }],
    })
    const none = github([{ createdAt: '2026-10-19T00:00:00Z', body: FULL }], null)
    expect(() => readBaseline({ repository: 'owner/repo', issue: 797, call: none.call })).toThrow(
      'Cannot read the publish environment',
    )
  })

  it('refuses a comment response of another shape', () => {
    const call: GhCommand = () => [{ id: 1, body: 'x' }]
    expect(() => readBaseline({ repository: 'owner/repo', issue: 797, call })).toThrow()
  })
})

describe('baseline-cli', () => {
  const cli = fileURLToPath(new URL('../src/delivery/baseline-cli.ts', import.meta.url))
  /** A home with a `gh` stand-in that serves `comments` and logs each argv line. */
  function home(comments: { created_at: string; body: string }[] | 'fail') {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'omne-baseline-cli-')))
    homes.push(dir)
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    const data = join(dir, 'comments.json')
    writeFileSync(
      data,
      JSON.stringify(
        comments === 'fail'
          ? []
          : comments.map((item, index) => ({
              id: index + 1,
              html_url: `https://github.com/owner/repo/issues/797#issuecomment-${index + 1}`,
              updated_at: item.created_at,
              user: { login: 'human', node_id: 'U_human' },
              ...item,
            })),
      ),
    )
    writeGh(
      bin,
      `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(join(dir, 'calls'))}, JSON.stringify(process.argv.slice(2)) + '\\n')
${comments === 'fail' ? "process.stderr.write('HTTP 401: Bad credentials'); process.exit(1)" : ''}
if (process.argv.at(-1).endsWith('/environments/publish')) {
  process.stdout.write(${JSON.stringify(JSON.stringify(ENVIRONMENT))})
  process.exit(0)
}
const page = new URLSearchParams(process.argv.at(-1).split('?')[1]).get('page')
process.stdout.write(page === '1' ? readFileSync(${JSON.stringify(data)}, 'utf8') : '[]')
`,
    )
    const config = join(dir, 'github-delivery.json')
    writeFileSync(
      config,
      readFileSync(
        new URL('../../../docs/engineering/github-delivery.json', import.meta.url),
        'utf8',
      ).replace('"nemori-ai/omne-harness-lite"', '"owner/repo"'),
    )
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ...ghEnv(bin) },
      })
    const calls = () =>
      readFileSync(join(dir, 'calls'), 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as string[])
    return { dir, config, run, calls }
  }

  it('writes the merged block to the output file and exits 0', () => {
    const h = home([
      { created_at: '2026-10-20T00:00:00Z', body: FULL },
      { created_at: '2026-10-22T00:00:00Z', body: SUPPLEMENT },
    ])
    const out = join(h.dir, 'baseline.md')
    const result = h.run('read', '797', '--out', out, '--config', h.config)
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      issue: 797,
      kind: 'merged',
      out,
      registrations: [{ members: ['pkg/a', 'pkg/b', 'pkg/c'] }, { members: ['pkg/b'] }],
    })
    expect(parseBaselineText(readFileSync(out, 'utf8')).members).toEqual([
      member('pkg/a', 1),
      member('pkg/b', 2),
      member('pkg/c', 1),
    ])
    for (const argv of h.calls()) expect(argv.slice(0, 3)).toEqual(['api', '--method', 'GET'])
  })

  it('exits 1 and writes no file when the registrations are refused', () => {
    const h = home([{ created_at: '2026-10-20T00:00:00Z', body: '只有表格' }])
    const out = join(h.dir, 'baseline.md')
    const result = h.run('read', '797', '--out', out, '--config', h.config)
    expect(result.status, result.stderr).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'refused',
      problems: [{ code: 'baseline-missing' }],
    })
    expect(result.stderr).toContain('baseline-missing')
    expect(existsSync(out)).toBe(false)
  })

  it('exits 2 when GitHub cannot be read and on bad arguments', () => {
    const h = home('fail')
    const out = join(h.dir, 'baseline.md')
    const failed = h.run('read', '797', '--out', out, '--config', h.config)
    expect(failed.status).toBe(2)
    expect(failed.stdout).toBe('')
    expect(existsSync(out)).toBe(false)
    expect(h.run('read', 'x', '--out', out, '--config', h.config).status).toBe(2)
    expect(h.run('read', '797', '--config', h.config).status).toBe(2)
  })
})
