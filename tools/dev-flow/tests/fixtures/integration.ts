import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { git } from '../../src/integration/git.ts'
import { parsePolicy } from '../../src/integration/policy.ts'
import type { TaskBinding } from '../../src/delivery/binding.ts'
import type { Decision } from '../../src/integration/authority.ts'
import type { Condition } from '../../src/delivery/protocol.ts'

export function commit(root: string, name: string, content: string): string {
  writeFileSync(join(root, name), content)
  git(root, ['add', '--', name])
  git(root, ['commit', '-m', `Fixture ${name}`])
  return git(root, ['rev-parse', 'HEAD'])
}
export function init(root: string, bare = false): void {
  mkdirSync(root, { recursive: true })
  git(root, ['init', ...(bare ? ['--bare'] : [])])
  git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  for (const key of ['user.name', 'user.email'])
    git(root, ['config', key, git(process.cwd(), ['config', key])])
}
/** A registry track entry; tests vary it to probe parsePolicy and the upstream chain. */
export function trackEntry(
  id: string,
  initialBase: string,
  parent = 'main',
  status: 'active' | 'paused' | 'retiring' | 'retired' = 'active',
) {
  return {
    id,
    branch: `integration/${id}`,
    owner: 'human',
    source: 'https://github.com/owner/repo/issues/1',
    status,
    parent,
    initialBase,
  }
}
/** The registry shape the tools read; tests vary it to probe parsePolicy. */
export function policyDocument(
  initialBase: string,
  location: string,
  tracks: Record<string, unknown>[] = [trackEntry('runtime', initialBase)],
) {
  return {
    schemaVersion: 1,
    revision: '1',
    repository: 'owner/repo',
    deliveryConfig: 'docs/engineering/github-delivery.json',
    tracks,
    transport: { kind: 'local-bare', location },
    timeouts: { networkMs: 30000 },
  }
}
/**
 * Points the remote `github-gate` branch at a new commit whose tree holds `gate/cutover.json`
 * with `cutover` as its bytes, or no such file when `cutover` is undefined.
 */
export function setGate(remote: string, cutover?: string): string {
  const files =
    cutover === undefined
      ? `100644 blob ${git(remote, ['hash-object', '-w', '--stdin'], 'gate fixture\n')}\tREADME.md\n`
      : `100644 blob ${git(remote, ['hash-object', '-w', '--stdin'], cutover)}\tcutover.json\n`
  const gate = git(remote, ['mktree'], files)
  const tree = git(remote, ['mktree'], `040000 tree ${gate}\tgate\n`)
  const head = git(remote, ['commit-tree', tree, '-m', 'Gate fixture'])
  git(remote, ['update-ref', 'refs/heads/github-gate', head])
  return head
}
/** The `omne-gate-record:v1` start-tag record that `gate-track` writes; old records have no parent. */
export function gateRecord(id: string, start: string, parent?: string): string {
  return JSON.stringify({
    schema: 'omne-gate-record:v1',
    target: `refs/heads/integration/${id}`,
    mode: 'track-create',
    result: start,
    issue: 1,
    confirmedBy: 'human',
    run: 'https://github.com/owner/repo/actions/runs/1',
    gate: 'a'.repeat(40),
    ...(parent === undefined ? {} : { parent }),
  })
}
/**
 * Creates `omne/gate/track/<id>` on the remote: an annotated tag with `message`, or a
 * lightweight tag when `message` is undefined. Returns the ref's object ID.
 */
export function setStartTag(remote: string, id: string, start: string, message?: string): string {
  const name = `omne/gate/track/${id}`
  git(
    remote,
    message === undefined ? ['tag', name, start] : ['tag', '-a', name, '-m', message, start],
  )
  return git(remote, ['rev-parse', `refs/tags/${name}`])
}
/**
 * A task worktree on `human/task` with a local bare remote that has `main` and the track
 * `integration/runtime`. No adoption descriptor, anchor or tag exists.
 */
export function integrationFixture(options: { admissionOnly?: boolean } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'omne-integration-engine-')),
    root = join(home, 'work'),
    remote = join(home, 'remote.git'),
    bin = join(home, 'bin')
  init(root)
  init(remote, true)
  mkdirSync(bin)
  const initial = commit(root, '.gitignore', 'tmp/\n')
  mkdirSync(join(root, 'docs/engineering'), { recursive: true })
  const policy = parsePolicy(policyDocument(initial, remote))
  writeFileSync(join(root, 'docs/engineering/integration-policy.json'), JSON.stringify(policy))
  writeFileSync(
    join(root, 'docs/engineering/github-delivery.json'),
    JSON.stringify({
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
        url: 'https://github.com/orgs/owner/projects/1',
        fields: { stage: 'F_stage', priority: null, iteration: null },
      },
      creationHandoffIssue: null,
      writers: { stage: 'human', body: 'human' },
    }),
  )
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'Committed fixture policy'])
  const main = git(root, ['rev-parse', 'HEAD'])
  git(root, ['remote', 'add', 'origin', remote])
  git(root, ['push', 'origin', 'main', `${initial}:refs/heads/integration/runtime`])
  // Like the existing repository tracks, `runtime` has a cutover entry and no start tag.
  setGate(remote, JSON.stringify({ main, 'integration/runtime': initial }))
  git(root, ['checkout', '-b', 'human/task'])
  const binding: TaskBinding = {
    schemaVersion: 1,
    issue: {
      repository: 'owner/repo',
      id: 'I_1',
      number: 1,
      url: 'https://github.com/owner/repo/issues/1',
    },
    revision: 1,
    attempt: 'one',
    responsible: 'human',
    branch: 'human/task',
    route: { kind: 'track', track: 'runtime' },
    completionTarget: 'stable',
    taskBase: main,
    writeScope: ['feature'],
    dispatch: 'https://github.com/owner/repo/issues/1#issuecomment-1',
    conditions: [],
    authorization: [],
  }
  const platform = join(home, 'platform.json'),
    calls = join(home, 'calls.jsonl')
  writeFileSync(
    platform,
    JSON.stringify({
      body: body(binding),
      state: 'open',
      comments: [],
      admissionOnly: options.admissionOnly ?? false,
    }),
  )
  writeFileSync(
    join(bin, 'gh'),
    String.raw`#!/usr/bin/env node
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const home = process.env.OMNE_GH_FIXTURE
appendFileSync(home + '/calls.jsonl', JSON.stringify(args) + '\n')
const p = JSON.parse(readFileSync(home + '/platform.json', 'utf8'))
if (
  args.at(-1) === 'repos/owner/repo/issues/1' &&
  readFileSync(home + '/calls.jsonl', 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
    .filter(a => a.at(-1) === 'repos/owner/repo/issues/1').length === 2 &&
  p.readbackChange
) {
  Object.assign(p, p.readbackChange)
  writeFileSync(home + '/platform.json', JSON.stringify(p))
}
let result
const issue = {
  number: 1,
  node_id: 'I_1',
  html_url: 'https://github.com/owner/repo/issues/1',
  state: p.state,
  updated_at: '2026-10-11T00:00:00Z',
  body: p.body,
  labels: [],
}
const endpoint = args.at(-1)
const page = Number(new URLSearchParams(endpoint.split('?')[1]).get('page') || 1)
const commentsPage = comments => comments.slice((page - 1) * 100, page * 100)
if (args[0] !== 'api') process.exit(91)
if (args[1] === 'graphql') {
  if (!args.some(x => x.startsWith('query=query'))) process.exit(92)
  if (p.admissionOnly && args.some(x => x.includes(' items('))) process.exit(95)
  if (args.some(x => x.includes('parent{url}')))
    result = {
      data: {
        node: {
          id: args.find(a => a.startsWith('id=')).slice(3),
          parent: p.parent ? { url: p.parent } : null,
        },
      },
    }
  else if (args.some(x => x.includes('projectItems(')))
    result = {
      data: {
        node: {
          id: 'I_1',
          url: issue.html_url,
          projectItems: {
            pageInfo: { hasNextPage: false },
            nodes: [{ id: 'ITEM_1', project: { id: 'P_1' } }],
          },
        },
      },
    }
  else if (args.some(x => x.includes('... on ProjectV2Item{')))
    result = {
      data: {
        node: {
          id: 'ITEM_1',
          project: { id: 'P_1' },
          fieldValues: {
            pageInfo: { hasNextPage: false },
            nodes: p.stage
              ? [
                  {
                    __typename: 'ProjectV2ItemFieldSingleSelectValue',
                    name: p.stage,
                    field: { id: 'F_stage' },
                  },
                ]
              : [],
          },
        },
      },
    }
  else
    result = {
      data: {
        node: {
          id: 'P_1',
          fields: {
            pageInfo: { hasNextPage: false },
            nodes: [{ __typename: 'ProjectV2SingleSelectField', id: 'F_stage' }],
          },
          items: { pageInfo: { hasNextPage: false }, nodes: [] },
        },
      },
    }
} else {
  if (args[1] !== '--method' || args[2] !== 'GET') process.exit(93)
  if (endpoint.includes('/issues?')) {
    if (p.admissionOnly) process.exit(95)
    result = [issue]
  } else if (endpoint === 'repos/owner/repo/issues/1') result = issue
  else if (endpoint === 'repos/owner/repo/issues/2')
    result = {
      ...issue,
      number: 2,
      node_id: 'I_2',
      html_url: 'https://github.com/owner/repo/issues/2',
      body: 'Related ordinary Issue',
    }
  else if (endpoint.includes('/dependencies/'))
    result = endpoint.includes('/issues/1/')
      ? (p.blockedBy || []).map(url => ({ html_url: url }))
      : []
  else if (endpoint.includes('/issues/1/comments?')) result = commentsPage(p.comments)
  else if (endpoint.includes('/issues/2/comments?'))
    result = commentsPage(p.authorityComments || [])
  else if (endpoint.includes('/issues/comments/')) {
    result = [...p.comments, ...(p.authorityComments || [])].find(
      c => c.id === Number(endpoint.split('/').at(-1)),
    )
    if (p.directCommentChange) Object.assign(result, p.directCommentChange)
  } else if (endpoint === 'repos/owner/repo/environments/publish') {
    if (p.environmentUnreadable) process.exit(96)
    result = p.environment || {
      name: 'publish',
      protection_rules: [
        {
          type: 'required_reviewers',
          reviewers: [{ type: 'User', reviewer: { login: 'human', node_id: 'U_human' } }],
        },
      ],
    }
  } else if (endpoint.startsWith('orgs/owner/teams/')) {
    const [, , , slug, , login] = endpoint.split('/')
    if (!((p.teams || {})[slug] || []).includes(login)) process.exit(97)
    result = { state: 'active' }
  } else process.exit(94)
}
process.stdout.write(JSON.stringify(result))
`,
  )
  chmodSync(join(bin, 'gh'), 0o755)
  function update(task: TaskBinding, conditions: Condition[] = [], state = 'open') {
    const p = JSON.parse(readFileSync(platform, 'utf8'))
    p.body = body(task, conditions)
    p.state = state
    writeFileSync(platform, JSON.stringify(p))
  }
  function authority(decision: Decision, id?: number): string {
    const p = JSON.parse(readFileSync(platform, 'utf8')),
      n = id ?? p.comments.length + 1
    const url = `https://github.com/owner/repo/issues/1#issuecomment-${n}`
    const comment = {
      id: n,
      html_url: url,
      issue_url: 'https://api.github.com/repos/owner/repo/issues/1',
      user: { login: 'human', node_id: 'U_human' },
      body: `\`\`\`json omne-integration-authority:v1\n${JSON.stringify(decision)}\n\`\`\``,
      updated_at: '2026-10-11T00:00:00Z',
    }
    p.comments = [...p.comments.filter((item: { id: number }) => item.id !== n), comment]
    writeFileSync(platform, JSON.stringify(p))
    return url
  }
  return {
    home,
    root,
    remote,
    bin,
    main,
    initial,
    policy,
    binding,
    calls,
    update,
    authority,
  }
}
export function body(binding: TaskBinding, conditions: Condition[] = []): string {
  return [
    `- 交付层级：delivery`,
    '- 主工作类型：maintenance',
    `- 交付修订：${binding.revision}`,
    '- 创建操作标识：fixture-1',
    '- 卡负责人、主结果接受者及授权依据：human fixture authorization',
    '- 受影响语义拥有者：human',
    '- 责任范围：integration fixture',
    '## 问题、结果与范围\nFixture.',
    '## 依据与验收\nFixture.',
    '## 工作类型附加内容\nFixture.',
    '## 实施与持续成果交接\nFixture.',
    '## 决定与剩余责任\nFixture.',
    '## 交付条件',
    conditions.length === 0
      ? '无'
      : '| 条件ID | 类型 | 目标 | 阶段 | 所需结果与判据 | 确认责任及证据入口 | 适用目标 |\n| --- | --- | --- | --- | --- | --- | --- |\n' +
        conditions
          .map(
            c =>
              `| ${c.id} | ${c.kind} | ${c.target} | ${c.phase} | ${c.predicate} | ${c.evidence} | ${c.scope ?? 'all'} |`,
          )
          .join('\n'),
    '## 当前执行与交接',
    `\`\`\`json omne-integration-binding:v1\n${JSON.stringify(binding)}\n\`\`\``,
  ].join('\n')
}
