import { describe, expect, it } from 'vitest'
import {
  DELIVERY_IDENTITY,
  FACTS_BUDGET_MS,
  FACTS_CLOCK_SKEW_MS,
  FACTS_POLL_MS,
  factsSource,
  fetchDeliveryFacts,
  type FactsPorts,
} from '../src/integration/delivery-facts.ts'
import { readAuthority } from '../src/integration/authority.ts'
import { collectAdmission } from '../src/delivery/admission.ts'
import { GhReadError } from '../src/delivery/github-read.ts'
import { parseConfig, type CapturedIssue } from '../src/delivery/protocol.ts'
import { parsePolicy } from '../src/integration/policy.ts'
import { digest, IntegrationError } from '../src/integration/parse.ts'
import { policyDocument } from './fixtures/integration.ts'
import type { TaskBinding } from '../src/delivery/binding.ts'

const policy = parsePolicy(policyDocument('a'.repeat(40), '/nowhere'))
const config = parseConfig({
  schemaVersion: 2,
  kind: 'github-delivery-config',
  protocolVersion: 2,
  enabled: true,
  repository: 'owner/repo',
  mode: 'manual-single-dispatcher',
  project: {
    owner: 'owner',
    number: 1,
    id: 'P_1',
    url: null,
    fields: { stage: 'F_stage', priority: null, iteration: null },
  },
  creationHandoffIssue: null,
  writers: { stage: 'human', body: 'human' },
})
const issueUrl = 'https://github.com/owner/repo/issues/1',
  scope = { task: issueUrl, authority: `${issueUrl}#issuecomment-1` },
  NONCE = '0123456789abcdef0123456789abcdef',
  T0 = Date.parse('2026-10-20T10:00:00Z'),
  DISPATCHES = 'repos/owner/repo/actions/workflows/delivery-facts.yml/dispatches'

function block(overrides: Record<string, unknown> = {}, nonce = NONCE) {
  return {
    schemaVersion: 1,
    nonce,
    run: 42,
    issue: 1,
    authority: {
      url: scope.authority,
      author: 'human',
      authorNodeId: 'U_human',
      reviewer: true,
      bodySha256: 'b'.repeat(64),
      updatedAt: '2026-10-11T00:00:00Z',
    },
    project: { id: 'P_1', item: 'ITEM_1', stage: 'Ready' },
    ...overrides,
  }
}
function without(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
}
function fence(value: unknown): string {
  return `Facts for this dispatch.\n\n\`\`\`json omne-delivery-facts:v1\n${JSON.stringify(value)}\n\`\`\`\n`
}
function bot(
  body: string,
  user: Record<string, unknown> = { login: DELIVERY_IDENTITY, type: 'Bot' },
) {
  const at = '2026-10-20T10:00:30Z'
  return {
    id: 7,
    html_url: `${issueUrl}#issuecomment-7`,
    user,
    body,
    created_at: at,
    updated_at: at,
  }
}
function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    path: '.github/workflows/delivery-facts.yml',
    head_branch: 'github-gate',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    created_at: new Date(T0 + 1_000).toISOString(),
    ...overrides,
  }
}
type World = {
  comments?: unknown[] | ((poll: number) => unknown[])
  runs?: unknown[]
  fail?: (argv: readonly string[]) => void
}
/** Injected ports: a REST double, a clock that only sleeps move, and a fixed nonce. */
function world({ comments = [bot(fence(block()))], runs = [run()], fail = () => {} }: World = {}) {
  const calls: string[][] = [],
    sleeps: number[] = []
  let clock = T0,
    polls = 0
  const ports: FactsPorts = {
    gh: (argv, timeout) => {
      calls.push([...argv])
      expect(timeout).toBeGreaterThan(0)
      expect(timeout).toBeLessThanOrEqual(policy.timeouts.networkMs)
      fail(argv)
      const path = argv.at(-1) ?? ''
      if (argv[2] === 'POST') return undefined
      if (path.startsWith('repos/owner/repo/issues/1/comments?')) {
        const page = Number(new URLSearchParams(path.split('?')[1]).get('page')) - 1
        if (page === 0) polls += 1
        const list = typeof comments === 'function' ? comments(polls - 1) : comments
        return Array.isArray(list) ? list.slice(page * 100, (page + 1) * 100) : list
      }
      if (path === 'repos/owner/repo/actions/runs/42')
        return runs.length > 1 ? runs.shift() : runs[0]
      throw new Error(`unexpected read ${path}`)
    },
    now: () => clock,
    sleep: async ms => {
      sleeps.push(ms)
      clock += ms
    },
    nonce: () => NONCE,
  }
  return { ports, calls, sleeps, fetch: () => fetchDeliveryFacts(policy, config, scope, ports) }
}

describe('facts source detection', () => {
  it.each([
    [{}, 'direct'],
    [{ CCR_AGENT_PROXY_ENABLED: '1' }, 'workflow'],
    [{ CCR_AGENT_PROXY_ENABLED: 'true' }, 'direct'],
    [{ CCR_AGENT_PROXY_ENABLED: '1', OMNE_DELIVERY_FACTS: 'direct' }, 'direct'],
    [{ OMNE_DELIVERY_FACTS: 'workflow' }, 'workflow'],
  ])('reads %o as %s', (env, expected) => {
    expect(factsSource(env)).toBe(expected)
  })
  it.each(['', 'proxy', 'WORKFLOW'])('refuses the override %j as input', value => {
    expect(() => factsSource({ OMNE_DELIVERY_FACTS: value })).toThrow(
      expect.objectContaining({
        code: 'input-error',
        message: expect.stringContaining('OMNE_DELIVERY_FACTS'),
      }),
    )
  })
})

describe('delivery facts over the workflow', () => {
  it('dispatches with the nonce, adopts the bot comment and reads only REST paths', async () => {
    const w = world()
    await expect(w.fetch()).resolves.toEqual({
      nonce: NONCE,
      run: 42,
      issue: 1,
      authority: block().authority,
      project: { id: 'P_1', item: 'ITEM_1', stage: 'Ready' },
    })
    expect(w.calls[0]).toEqual([
      'api',
      '--method',
      'POST',
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      'X-GitHub-Api-Version: 2026-03-10',
      '-f',
      'ref=github-gate',
      '-f',
      'inputs[issue]=1',
      '-f',
      `inputs[authority]=${scope.authority}`,
      '-f',
      `inputs[nonce]=${NONCE}`,
      DISPATCHES,
    ])
    expect(w.calls.slice(1).map(call => call.at(-1))).toEqual([
      'repos/owner/repo/issues/1/comments?per_page=100&page=1',
      'repos/owner/repo/actions/runs/42',
    ])
    for (const call of w.calls.slice(1))
      expect(call.slice(0, 3)).toEqual(['api', '--method', 'GET'])
    expect(w.calls.filter(call => call[2] === 'POST')).toHaveLength(1)
    expect(JSON.stringify(w.calls)).not.toMatch(/graphql|environments\/|orgs\//)
    expect(w.sleeps).toEqual([])
  })
  it('accepts an unset Stage and a run created within the clock tolerance', async () => {
    const w = world({
      comments: [bot(fence(block({ project: { id: 'P_1', item: 'ITEM_1', stage: null } })))],
      runs: [run({ created_at: new Date(T0 - FACTS_CLOCK_SKEW_MS + 1_000).toISOString() })],
    })
    await expect(w.fetch()).resolves.toMatchObject({ project: { stage: null } })
  })
  it('ignores other comments and bot comments for another nonce, then waits for the run', async () => {
    const other = bot(fence(block({}, 'f'.repeat(32))))
    const w = world({
      comments: poll =>
        poll === 0
          ? [{ id: 1, user: { login: 'human' }, body: 'discussion' }, other]
          : [{ id: 1, user: { login: 'human' }, body: 'discussion' }, other, bot(fence(block()))],
      runs: [run({ status: 'in_progress', conclusion: null }), run({ status: 'queued' }), run()],
    })
    await expect(w.fetch()).resolves.toMatchObject({ run: 42 })
    expect(w.sleeps).toEqual([FACTS_POLL_MS, FACTS_POLL_MS, FACTS_POLL_MS])
    expect(w.calls.filter(call => call.at(-1)?.includes('/comments?'))).toHaveLength(4)
    expect(w.calls.filter(call => call.at(-1) === 'repos/owner/repo/actions/runs/42')).toHaveLength(
      3,
    )
  })
  it('reads every comment page and refuses page exhaustion', async () => {
    const filler = Array.from({ length: 100 }, (_, i) => ({ id: i, user: {}, body: 'noise' }))
    const w = world({ comments: [...filler, bot(fence(block()))] })
    await expect(w.fetch()).resolves.toMatchObject({ nonce: NONCE })
    expect(w.calls.filter(call => call.at(-1)?.includes('/comments?'))).toHaveLength(2)
    const exhausted = world({ comments: Array.from({ length: 2_000 }, () => filler[0]) })
    await expect(exhausted.fetch()).rejects.toThrow('page limit')
  })
  it.each([
    ['no comment ever arrives', world({ comments: [] })],
    [
      'the run never completes',
      world({ runs: [run({ status: 'in_progress', conclusion: null })] }),
    ],
  ])('times out after the budget when %s', async (_, w) => {
    await expect(w.fetch()).rejects.toThrow(
      expect.objectContaining({ code: 'unknown', message: 'Delivery facts timed out' }),
    )
    expect(w.sleeps.reduce((a, b) => a + b, 0)).toBe(FACTS_BUDGET_MS)
    expect(w.sleeps.every(ms => ms <= FACTS_POLL_MS)).toBe(true)
  })
  const broken = (mutate: (b: ReturnType<typeof block>) => unknown) => [bot(fence(mutate(block())))]
  it.each<[string, World, string]>([
    [
      'an author that is not the delivery identity',
      { comments: [bot(fence(block()), { login: 'human', type: 'User' })] },
      'not the delivery identity',
    ],
    [
      'a delivery login whose type is not Bot',
      { comments: [bot(fence(block()), { login: DELIVERY_IDENTITY, type: 'User' })] },
      'not a Bot',
    ],
    [
      'an unreadable author',
      { comments: [bot(fence(block()), null as never)] },
      'author is unreadable',
    ],
    [
      'two blocks in one comment',
      { comments: [bot(fence(block()) + fence(block()))] },
      'block is malformed',
    ],
    [
      'two comments with this nonce',
      { comments: [bot(fence(block())), { ...bot(fence(block())), id: 8 }] },
      'comment is duplicated',
    ],
    [
      'another author quoting this nonce next to the bot comment',
      {
        comments: [
          bot(fence(block())),
          { ...bot(fence(block()), { login: 'human', type: 'User' }), id: 8 },
        ],
      },
      'comment is duplicated',
    ],
    [
      'a facts comment edited after the workflow posted it',
      { comments: [{ ...bot(fence(block())), updated_at: '2026-10-20T10:01:00Z' }] },
      'was edited',
    ],
    [
      'a facts comment without a creation time',
      { comments: [{ ...bot(fence(block())), created_at: undefined, updated_at: undefined }] },
      'was edited',
    ],
    [
      'an unclosed block',
      { comments: [bot('```json omne-delivery-facts:v1\n' + JSON.stringify(block()))] },
      'block is malformed',
    ],
    [
      'invalid JSON',
      { comments: [bot('```json omne-delivery-facts:v1\n{"nonce":"' + NONCE + '",\n```')] },
      'block is malformed',
    ],
    [
      'a block whose nonce differs from the text',
      { comments: [bot(fence(block({}, 'e'.repeat(32))) + `\nnonce ${NONCE}`)] },
      'nonce mismatch',
    ],
    [
      'a missing field',
      {
        comments: broken(b => ({ ...b, authority: without(b.authority, 'reviewer') })),
      },
      'block is malformed',
    ],
    ['an extra field', { comments: broken(b => ({ ...b, extra: 1 })) }, 'block is malformed'],
    [
      'an extra authority field',
      { comments: broken(b => ({ ...b, authority: { ...b.authority, team: null } })) },
      'block is malformed',
    ],
    [
      'schemaVersion 2',
      { comments: broken(b => ({ ...b, schemaVersion: 2 })) },
      'block is malformed',
    ],
    ['a string run id', { comments: broken(b => ({ ...b, run: '42' })) }, 'block is malformed'],
    ['a string issue', { comments: broken(b => ({ ...b, issue: '1' })) }, 'block is malformed'],
    [
      'a string reviewer',
      { comments: broken(b => ({ ...b, authority: { ...b.authority, reviewer: 'true' } })) },
      'block is malformed',
    ],
    [
      'a short body digest',
      {
        comments: broken(b => ({
          ...b,
          authority: { ...b.authority, bodySha256: 'b'.repeat(63) },
        })),
      },
      'block is malformed',
    ],
    [
      'an uppercase nonce',
      { comments: [bot(fence(block({}, NONCE.toUpperCase())) + `\n${NONCE}`)] },
      'block is malformed',
    ],
    [
      'a numeric Stage',
      { comments: broken(b => ({ ...b, project: { ...b.project, stage: 3 } })) },
      'block is malformed',
    ],
    [
      'an absent Stage key',
      { comments: broken(b => ({ ...b, project: without(b.project, 'stage') })) },
      'block is malformed',
    ],
    [
      'an empty item',
      { comments: broken(b => ({ ...b, project: { ...b.project, item: '' } })) },
      'block is malformed',
    ],
    ['another Issue number', { comments: broken(b => ({ ...b, issue: 2 })) }, 'Issue mismatch'],
    [
      'another authority URL',
      {
        comments: broken(b => ({
          ...b,
          authority: { ...b.authority, url: `${issueUrl}#issuecomment-2` },
        })),
      },
      'authority URL mismatch',
    ],
    [
      'another Project',
      { comments: broken(b => ({ ...b, project: { ...b.project, id: 'P_2' } })) },
      'Project mismatch',
    ],
    ['another run id', { runs: [run({ id: 43 })] }, 'run identity mismatch'],
    [
      'another workflow path',
      { runs: [run({ path: '.github/workflows/gate-publish.yml' })] },
      'run path mismatch',
    ],
    ['a run on main', { runs: [run({ head_branch: 'main' })] }, 'run branch mismatch'],
    ['a push run', { runs: [run({ event: 'push' })] }, 'run event mismatch'],
    ['a failed run', { runs: [run({ conclusion: 'failure' })] }, 'did not succeed'],
    ['a cancelled run', { runs: [run({ conclusion: 'cancelled' })] }, 'did not succeed'],
    [
      'a run created before this dispatch',
      { runs: [run({ created_at: new Date(T0 - FACTS_CLOCK_SKEW_MS - 1_000).toISOString() })] },
      'predates this dispatch',
    ],
    [
      'a run without a creation time',
      { runs: [run({ created_at: 'yesterday' })] },
      'predates this dispatch',
    ],
    ['a run that is not an object', { runs: ['run'] }, 'run is malformed'],
    [
      'a comment page that is not a list',
      { comments: () => ({ secret: 'ghp_token' }) as never },
      'comment page is malformed',
    ],
    ['a comment that is not an object', { comments: ['secret ghp_token'] }, 'comment is malformed'],
    [
      'a failed dispatch',
      {
        fail: argv => {
          if (argv[2] === 'POST') throw new Error('secret ghp_token')
        },
      },
      'dispatch failed. API output omitted.',
    ],
    [
      'a failed comment read',
      {
        fail: argv => {
          if (argv.at(-1)?.includes('/comments?')) throw new Error('secret ghp_token')
        },
      },
      'comment read failed. API output omitted.',
    ],
    [
      'a failed run read',
      {
        fail: argv => {
          if (argv.at(-1)?.includes('/actions/runs/')) throw new Error('secret ghp_token')
        },
      },
      'run read failed. API output omitted.',
    ],
  ])('refuses %s as unknown without echoing API content', async (_, options, message) => {
    const w = world(options)
    let error: unknown
    await w.fetch().catch(e => {
      error = e
    })
    expect(error).toBeInstanceOf(IntegrationError)
    expect(error).toMatchObject({ code: 'unknown', message: expect.stringContaining(message) })
    expect(String((error as Error).message)).not.toMatch(
      /ghp_token|P_2|issuecomment-2|gate-publish/,
    )
  })
  it('refuses a task URL outside the repository or an unconfigured Project before dispatching', async () => {
    const w = world()
    await expect(
      fetchDeliveryFacts(
        policy,
        config,
        { ...scope, task: 'https://github.com/other/repo/issues/1' },
        w.ports,
      ),
    ).rejects.toThrow('same-repository task')
    await expect(
      fetchDeliveryFacts(
        policy,
        config,
        { ...scope, authority: 'https://github.com/other/repo/issues/1#issuecomment-1' },
        w.ports,
      ),
    ).rejects.toThrow('same-repository dispatch comment')
    await expect(
      fetchDeliveryFacts(policy, config, { ...scope, authority: issueUrl }, w.ports),
    ).rejects.toThrow('same-repository dispatch comment')
    await expect(
      fetchDeliveryFacts(
        policy,
        { ...config, project: { ...config.project, id: null } },
        scope,
        w.ports,
      ),
    ).rejects.toThrow('configured Project')
    await expect(
      fetchDeliveryFacts(policy, config, scope, { ...w.ports, nonce: () => 'short' }),
    ).rejects.toThrow('nonce is malformed')
    expect(w.calls).toEqual([])
  })
})

const binding: TaskBinding = {
  schemaVersion: 1,
  issue: { repository: 'owner/repo', id: 'I_1', number: 1, url: issueUrl },
  revision: 1,
  attempt: 'one',
  responsible: 'human',
  branch: 'human/task',
  route: { kind: 'track', track: 'runtime' },
  completionTarget: 'track',
  taskBase: 'a'.repeat(40),
  writeScope: ['feature'],
  dispatch: scope.authority,
  conditions: [],
  authorization: [],
}
const authorityComment = {
  id: 1,
  html_url: scope.authority,
  issue_url: 'https://api.github.com/repos/owner/repo/issues/1',
  user: { login: 'human', node_id: 'U_human' },
  body: `\`\`\`json omne-integration-authority:v1\n${JSON.stringify({ schemaVersion: 1, responsible: 'human', basis: ['fixture'], action: 'dispatch', task: binding, confirmations: [] })}\n\`\`\``,
  updated_at: '2026-10-11T00:00:00Z',
}
const captured: CapturedIssue = {
  number: 1,
  url: issueUrl,
  id: 'I_1',
  state: 'open',
  updatedAt: '2026-10-11T00:00:00Z',
  body: '',
  labels: [],
  comments: [
    {
      url: authorityComment.html_url,
      author: 'human',
      body: authorityComment.body,
      updatedAt: authorityComment.updated_at,
    },
  ],
  commentsComplete: true,
  relationsComplete: true,
  blockedBy: [],
  parentIssue: null,
  stage: null,
}
const authorityFacts = {
  url: scope.authority,
  author: 'human',
  authorNodeId: 'U_human',
  reviewer: true,
  bodySha256: digest(authorityComment.body),
  updatedAt: authorityComment.updated_at,
}
describe('dispatch eligibility from delivery facts', () => {
  function read(calls: string[][]) {
    return (argv: readonly string[]) => {
      calls.push([...argv])
      if (argv.at(-1) === 'repos/owner/repo/issues/comments/1') return authorityComment
      throw new Error('cloud sessions cannot read this path')
    }
  }
  it('grants dispatch from facts that match the comment, without reading the environment', () => {
    const calls: string[][] = []
    const decision = readAuthority(
      policy,
      scope.authority,
      { issues: [captured] },
      authorityFacts,
      read(calls),
    )
    expect(decision.task).toEqual(binding)
    expect(calls.map(call => call.at(-1))).toEqual(['repos/owner/repo/issues/comments/1'])
  })
  it('keeps a non-reviewer author unknown without reading the environment', () => {
    const calls: string[][] = []
    expect(() =>
      readAuthority(
        policy,
        scope.authority,
        { issues: [captured] },
        { ...authorityFacts, reviewer: false },
        read(calls),
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'unknown',
        message: 'Delivery facts do not show the author as a publish reviewer',
      }),
    )
    expect(calls.map(call => call.at(-1))).toEqual(['repos/owner/repo/issues/comments/1'])
  })
  it.each([
    ['URL', { url: `${issueUrl}#issuecomment-2` }, 'another authority comment'],
    ['author login', { author: 'impostor' }, 'author mismatch'],
    ['author node ID', { authorNodeId: 'U_impostor' }, 'author mismatch'],
    ['body digest', { bodySha256: digest(authorityComment.body + '\n') }, 'body digest mismatch'],
    ['update time', { updatedAt: '2026-10-12T00:00:00Z' }, 'update time mismatch'],
  ])('keeps facts with another %s unknown', (_, change, message) => {
    expect(() =>
      readAuthority(
        policy,
        scope.authority,
        { issues: [captured] },
        { ...authorityFacts, ...change },
        read([]),
      ),
    ).toThrow(
      expect.objectContaining({ code: 'unknown', message: expect.stringContaining(message) }),
    )
  })
})

describe('admission with adopted Project facts', () => {
  const rawIssue = {
    number: 1,
    node_id: 'I_1',
    html_url: issueUrl,
    state: 'open',
    updated_at: '2026-10-11T00:00:00Z',
    body: '- 交付层级：delivery\n- 交付修订：1\n## 交付条件\n无',
    labels: [],
  }
  function backend(calls: string[][]) {
    return (argv: readonly string[]) => {
      calls.push([...argv])
      const path = argv.at(-1) ?? ''
      if (argv[1] === 'graphql') throw new Error('GraphQL must not be read with adopted facts')
      if (path === 'repos/owner/repo/issues/1/parent')
        throw new GhReadError({ message: 'No parent issue found', status: '404' })
      if (path === 'repos/owner/repo/issues/1') return rawIssue
      if (path.includes('/comments?') || path.includes('/dependencies/blocked_by?')) return []
      throw new Error(`unexpected ${path}`)
    }
  }
  it('records the Stage snapshot and skips the Project reads', () => {
    const calls: string[][] = []
    const result = collectAdmission(config, scope, backend(calls), {
      id: 'P_1',
      item: 'ITEM_1',
      stage: 'Ready',
    })
    expect(result.issues[0]?.stage).toBe('Ready')
    expect(result.projectId).toBe('P_1')
    expect(calls.filter(call => call[1] === 'graphql')).toEqual([])
    expect(
      collectAdmission(config, scope, backend([]), { id: 'P_1', item: 'ITEM_1', stage: null })
        .issues[0]?.stage,
    ).toBeNull()
  })
  it.each([
    [{ id: 'P_2', item: 'ITEM_1', stage: 'Ready' }, 'another Project'],
    [{ id: 'P_1', item: ' ', stage: 'Ready' }, 'membership is empty'],
  ])('rejects facts %o', (project, message) => {
    expect(() => collectAdmission(config, scope, backend([]), project)).toThrow(message)
  })
})
