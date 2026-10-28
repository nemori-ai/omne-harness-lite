import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import type { AdmissionCapture } from '../src/delivery/admission.ts'
import { readTaskBinding, type TaskBindingV2 } from '../src/delivery/binding.ts'
import {
  bindBody,
  bindCard,
  dispatchComment,
  dispatchDecision,
  DISPATCH_PLACEHOLDER,
  parseDispatchSpec,
  planDispatch,
  postDispatch,
  recordPosted,
  taskBaseInputs,
  type DispatchSpec,
} from '../src/delivery/dispatch.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { dispatchFieldGaps, parseConfig, type CapturedIssue } from '../src/delivery/protocol.ts'
import { conditionDigest } from '../src/integration/authority.ts'
import { git } from '../src/integration/git.ts'
import { commit, init, policyDocument } from './fixtures/integration.ts'
import { registry, table } from './fixtures/lines.ts'

const url = 'https://github.com/owner/repo/issues/7'
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
    url: 'https://github.com/orgs/owner/projects/1',
    fields: { stage: 'F_stage', priority: null, iteration: null },
  },
  creationHandoffIssue: null,
  writers: { stage: 'human', body: 'human' },
})
const START_ROW =
  '| D-S00 | decision | 本卡正式放行 | start | 调度者核准本 revision | 本卡正式派发 | all |'
function cardBody(row = START_ROW, extra = '') {
  return [
    '## 身份与责任',
    '- 交付线：engineering-toolchain',
    '- 性质：impl',
    '- 契约变更：none',
    '- 交付层级：delivery',
    '- 主工作类型：feature',
    '- 交付修订：2',
    '- 创建操作标识：fixture-7',
    '- 卡负责人、主结果接受者及授权依据：human fixture authorization',
    '- 受影响语义拥有者：human',
    '- 责任范围：dispatch fixture',
    '## 问题、结果与范围\nFixture.',
    '## 依据与验收\nFixture.',
    '## 工作类型附加内容\nFixture.',
    '## 实施与持续成果交接\nFixture.',
    '## 决定与剩余责任\nFixture.',
    '## 交付条件',
    '| 条件ID | 类型 | 目标 | 阶段 | 所需结果与判据 | 确认责任及证据入口 | 适用目标 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    row,
    '## 当前执行与交接',
    '### 认领与派发',
    '- 派发情况：未派发。',
    '- 工作树：未创建。',
    '### 分支、基线与task context',
    '未登记 binding。',
    '| 开工读回项 | 实际值 |',
    '### 当前进展',
    '- 最近更新：建卡。',
    extra,
  ].join('\n')
}
function issue(patch: Partial<CapturedIssue> = {}): CapturedIssue {
  return {
    number: 7,
    url,
    id: 'I_7',
    state: 'open',
    updatedAt: '2026-10-26T00:00:00Z',
    body: cardBody(),
    labels: ['kind:feature', 'line:engineering-toolchain', 'nature:impl'],
    comments: [],
    commentsComplete: true,
    relationsComplete: true,
    blockedBy: [],
    parentIssue: null,
    stage: null,
    milestone: 'M1',
    ...patch,
  }
}
function capture(card: CapturedIssue = issue()): AdmissionCapture {
  return {
    schemaVersion: 1,
    kind: 'github-admission-capture',
    protocolVersion: 2,
    repository: 'owner/repo',
    projectId: 'P_1',
    scope: { task: url, authority: `${url}#issuecomment-1` },
    closure: [url],
    issues: [card],
    startedAt: '2026-10-26T00:00:00Z',
    finishedAt: '2026-10-26T00:00:01Z',
  }
}
const spec: DispatchSpec = parseDispatchSpec({
  issue: 7,
  attempt: '7-r2-a1',
  responsible: 'human',
  branch: 'human/issue-7',
  taskBase: 'b'.repeat(40),
  writeScope: ['tools/dev-flow', 'tmp/issue-7'],
  route: { kind: 'track', track: 'legacy-refactor' },
  completionTarget: 'track',
  basis: ['https://github.com/owner/repo/issues/1#issuecomment-9'],
  confirmations: [{ condition: 'D-S00', evidence: 'dispatcher approved revision 2' }],
})
const plan = (
  patch: { spec?: DispatchSpec; card?: CapturedIssue; actor?: string; force?: boolean } = {},
) =>
  planDispatch({
    spec: patch.spec ?? spec,
    config,
    capture: capture(patch.card),
    lines: table(),
    policy: registry,
    actor: patch.actor ?? 'human',
    force: patch.force ?? false,
  })

describe('dispatch fields', () => {
  it('names each missing kind:, line: label and milestone', () => {
    expect(dispatchFieldGaps({ labels: ['kind:feature', 'line:model'], milestone: 'M1' })).toEqual(
      [],
    )
    expect(dispatchFieldGaps({ labels: ['kind:a', 'kind:b'], milestone: null })).toEqual([
      'exactly one kind: label (found 2)',
      'exactly one line: label (found 0)',
      'a milestone',
    ])
    // A capture that did not read the milestone leaves it unjudged.
    expect(dispatchFieldGaps({ labels: ['kind:a', 'line:b'] })).toEqual([])
  })
})

describe('planning a dispatch', () => {
  it('reads revision, attributes, milestone and condition digests from the live card', () => {
    const result = plan()
    expect(result.binding).toMatchObject({
      schemaVersion: 2,
      issue: { repository: 'owner/repo', id: 'I_7', number: 7, url },
      revision: 2,
      dispatch: DISPATCH_PLACEHOLDER,
      conditions: ['D-S00'],
      line: 'engineering-toolchain',
      nature: 'impl',
      contractChange: 'none',
      milestone: 'M1',
    })
    expect(result.confirmations).toEqual([
      {
        issue: url,
        condition: 'D-S00',
        digest: conditionDigest({
          id: 'D-S00',
          kind: 'decision',
          target: '本卡正式放行',
          phase: 'start',
          predicate: '调度者核准本 revision',
          evidence: '本卡正式派发',
          scope: 'all',
        }),
        evidence: 'dispatcher approved revision 2',
      },
    ])
  })

  it('recomputes the digest when the condition row changes', () => {
    const changed = plan({
      card: issue({
        body: cardBody(START_ROW.replace('核准本 revision', '核准本 revision 与基线')),
      }),
    })
    expect(changed.confirmations[0]?.digest).not.toBe(plan().confirmations[0]?.digest)
  })

  it.each([
    ['a closed card', { card: issue({ state: 'closed' }) }, 'the card is closed'],
    ['another poster', { actor: 'someone' }, 'posted by someone'],
    [
      'missing dispatch fields',
      { card: issue({ labels: ['line:engineering-toolchain'], milestone: null }) },
      'kind: label (found 0); the card lacks a milestone',
    ],
    [
      'a protocol deviation',
      { card: issue({ body: cardBody().replace('- 交付修订：2\n', '') }) },
      'deviation',
    ],
    [
      'a start condition without evidence',
      { spec: { ...spec, confirmations: [] } },
      'D-S00 has no evidence',
    ],
    [
      'evidence for an unknown condition',
      {
        spec: {
          ...spec,
          confirmations: [...spec.confirmations, { condition: 'D-X', evidence: 'e' }],
        },
      },
      'unknown condition D-X',
    ],
    [
      'a write outside the line',
      { spec: { ...spec, writeScope: ['packages/model'] } },
      'scope-outside-line',
    ],
    [
      'a label that drifts from the body',
      { card: issue({ labels: ['kind:feature', 'line:engineering-toolchain'] }) },
      'label-drift',
    ],
    [
      'a body without its three attributes',
      { card: issue({ body: cardBody().replace('- 性质：impl\n', '') }) },
      '性质',
    ],
    [
      'a route to another track',
      { spec: { ...spec, route: { kind: 'track' as const, track: 'side' } } },
      'nature-route-mismatch',
    ],
  ])('refuses %s before any write', (_name, patch, message) => {
    expect(() => plan(patch)).toThrow(message)
  })

  it('refuses a second dispatch of the same revision and attempt unless forced', () => {
    const { decision } = dispatchDecision(plan(), `${url}#issuecomment-40`, spec.basis)
    const comment = {
      url: `${url}#issuecomment-40`,
      author: 'human',
      body: dispatchComment('earlier', decision),
      updatedAt: '2026-10-26T00:00:00Z',
    }
    const card = issue({ comments: [comment] })
    expect(() => plan({ card })).toThrow(`already dispatched by ${url}#issuecomment-40`)
    expect(plan({ card, force: true }).binding.attempt).toBe('7-r2-a1')
    // Another attempt of the same card is a new dispatch.
    expect(plan({ card, spec: { ...spec, attempt: '7-r2-a2' } }).binding.attempt).toBe('7-r2-a2')
  })

  it('refuses a spec with a missing or unknown field', () => {
    const { confirmations: _omitted, ...partial } = spec
    expect(() => parseDispatchSpec(partial)).toThrow('confirmations is required')
    expect(() => parseDispatchSpec({ ...spec, revision: 2 })).toThrow()
  })
})

describe('posting and binding', () => {
  const posted = plan()
  function github(body = cardBody()) {
    const calls: string[][] = []
    const state = { body, comment: '' }
    const call: GhCommand = argv => {
      calls.push([...argv])
      const method = argv[2],
        path = argv.find(item => item.startsWith('repos/')) ?? '',
        value = argv.find(item => item.startsWith('body='))?.slice('body='.length)
      if (method === 'POST' && path === 'repos/owner/repo/issues/7/comments')
        return { id: 55, html_url: `${url}#issuecomment-55` }
      if (method === 'PATCH' && path === 'repos/owner/repo/issues/comments/55') {
        state.comment = value ?? ''
        return {}
      }
      if (method === 'GET' && path === 'repos/owner/repo/issues/comments/55')
        return { body: state.comment }
      if (method === 'PATCH' && path === 'repos/owner/repo/issues/7') {
        state.body = value ?? ''
        return {}
      }
      if (method === 'GET' && path === 'repos/owner/repo/issues/7')
        return {
          number: 7,
          node_id: 'I_7',
          html_url: url,
          body: state.body,
          labels: [],
          milestone: null,
        }
      throw new Error(`unexpected call ${argv.join(' ')}`)
    }
    return { call, calls, state }
  }

  it('posts once, edits the placeholder into a dispatch naming its own URL and reads it back', () => {
    const gh = github()
    const result = postDispatch({
      repository: 'owner/repo',
      plan: posted,
      basis: spec.basis,
      prose: '## 正式派发\n',
      call: gh.call,
    })
    expect(result).toMatchObject({ dispatch: `${url}#issuecomment-55`, verified: true })
    expect(result.binding.dispatch).toBe(`${url}#issuecomment-55`)
    expect(gh.calls.map(c => c[2])).toEqual(['POST', 'PATCH', 'GET'])
    expect(gh.state.comment).toContain('```json omne-integration-authority:v1')
    expect(gh.state.comment).toContain(`"dispatch": "${url}#issuecomment-55"`)
  })

  it.each([
    ['an empty text', ''],
    ['a whitespace-only text', ' \n\t\n  '],
  ])('refuses %s before any GitHub call', (_name, prose) => {
    const gh = github()
    const post = () =>
      postDispatch({
        repository: 'owner/repo',
        plan: posted,
        basis: spec.basis,
        prose,
        call: gh.call,
      })
    expect(post).toThrow('--text is empty or holds only whitespace')
    expect(post).toThrow(expect.objectContaining({ name: 'IntegrationError', code: 'input-error' }))
    expect(gh.calls).toEqual([])
  })

  it('hands over the posted dispatch before a readback that fails, and names it in the error', () => {
    const gh = github()
    const failing: GhCommand = (argv, timeout) => {
      if (argv[2] === 'GET') throw new Error('secret API body')
      return gh.call(argv, timeout)
    }
    const posted: string[] = []
    expect(() =>
      postDispatch({
        repository: 'owner/repo',
        plan: plan(),
        basis: spec.basis,
        prose: 'x',
        call: failing,
        onPosted: result => posted.push(result.binding.dispatch),
      }),
    ).toThrow(`${url}#issuecomment-55 was posted, but reading it back failed`)
    expect(posted).toEqual([`${url}#issuecomment-55`])
  })

  it('reports the posted URL before a failed binding write and names it in the error', () => {
    const lines: string[] = []
    const out = join(tmpdir(), 'omne-missing-directory', 'binding.json')
    expect(() =>
      postDispatch({
        repository: 'owner/repo',
        plan: plan(),
        basis: spec.basis,
        prose: 'x',
        call: github().call,
        onPosted: result => recordPosted(result, out, line => lines.push(line)),
      }),
    ).toThrow(`${url}#issuecomment-55 was posted, but writing the binding`)
    expect(lines).toEqual([
      `${JSON.stringify({ kind: 'dispatch-posted', dispatch: `${url}#issuecomment-55` })}\n`,
    ])
  })

  it('names the placeholder when the edit fails', () => {
    const gh = github()
    const failing: GhCommand = (argv, timeout) => {
      if (argv[2] === 'PATCH') throw new Error('secret API body')
      return gh.call(argv, timeout)
    }
    expect(() =>
      postDispatch({
        repository: 'owner/repo',
        plan: posted,
        basis: spec.basis,
        prose: 'x',
        call: failing,
      }),
    ).toThrow(`placeholder ${url}#issuecomment-55`)
  })

  const binding: TaskBindingV2 = { ...posted.binding, dispatch: `${url}#issuecomment-55` }
  it('writes the binding into its subsection, derives the prose from it and keeps other sections', () => {
    const body = bindBody(cardBody(), binding, '.worktrees/issue-7')
    expect(readTaskBinding(body, binding.issue)).toEqual(binding)
    expect(body).toContain(`taskBase \`${binding.taskBase}\``)
    expect(body).toContain(`- 派发情况：已派发，见 ${binding.dispatch}。`)
    expect(body).toContain('- 工作树：`.worktrees/issue-7`。')
    expect(body).not.toContain('未登记 binding')
    expect(body).toContain('### 当前进展')
    // A new attempt replaces the previous binding in place.
    const again = bindBody(body, { ...binding, attempt: '7-r2-a2' })
    expect(readTaskBinding(again, binding.issue)?.attempt).toBe('7-r2-a2')
  })

  it('rewrites the dispatch and worktree lines only inside「认领与派发」', () => {
    const body = bindBody(cardBody(START_ROW, '- 派发情况：另一处的说明。'), binding, 'w')
    expect(body).toContain('- 派发情况：另一处的说明。')
    expect(body.match(/^- 派发情况：已派发/gm)).toHaveLength(1)
  })

  it('refuses a binding that still carries the placeholder dispatch URL', () => {
    expect(() => bindBody(cardBody(), posted.binding)).toThrow('placeholder dispatch URL')
    const gh = github()
    expect(() =>
      bindCard({ repository: 'owner/repo', binding: posted.binding, dryRun: false, call: gh.call }),
    ).toThrow('placeholder dispatch URL')
    expect(gh.calls.map(c => c[2])).toEqual(['GET'])
  })

  it('refuses a body without the subsection or with a second binding elsewhere', () => {
    expect(() => bindBody('## 当前执行与交接\n', binding)).toThrow('exactly one')
    const stray = cardBody(
      START_ROW,
      `\`\`\`json omne-integration-binding:v1\n${JSON.stringify({ ...binding, schemaVersion: 1 })}\n\`\`\``,
    )
    expect(() => bindBody(stray, binding)).toThrow()
  })

  it('writes the body and reads the binding back; a dry run writes nothing', () => {
    const dry = github()
    expect(
      bindCard({ repository: 'owner/repo', binding, dryRun: true, call: dry.call }),
    ).toMatchObject({ applied: false })
    expect(dry.calls.map(c => c[2])).toEqual(['GET'])
    const gh = github()
    expect(
      bindCard({ repository: 'owner/repo', binding, dryRun: false, call: gh.call }),
    ).toMatchObject({ applied: true, verified: true })
    expect(gh.calls.map(c => c[2])).toEqual(['GET', 'PATCH', 'GET'])
  })
})

describe('dispatch-cli post with an empty text', () => {
  const homes: string[] = []
  afterAll(() => {
    for (const home of homes) rmSync(home, { recursive: true, force: true })
  })
  const cli = fileURLToPath(new URL('../src/delivery/dispatch-cli.ts', import.meta.url))

  // Slow: each case runs dispatch-cli as a child process with a `gh` stand-in on PATH.
  it.each([
    ['an empty file', ''],
    ['a whitespace-only file', '\n   \n\t\n'],
  ])('exits 2 for %s and never runs gh', { tags: ['slow'] }, (_name, prose) => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-dispatch-cli-')))
    homes.push(home)
    const bin = join(home, 'bin'),
      calls = join(home, 'gh-calls.log')
    mkdirSync(bin)
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "$@" >> '${calls}'\nexit 1\n`)
    chmodSync(join(bin, 'gh'), 0o755)
    writeFileSync(join(home, 'spec.json'), JSON.stringify(spec))
    writeFileSync(join(home, 'prose.md'), prose)
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        cli,
        'post',
        '--spec',
        join(home, 'spec.json'),
        '--text',
        join(home, 'prose.md'),
        '--root',
        home,
      ],
      { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` } },
    )
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stderr)).toMatchObject({
      kind: 'dispatch-error',
      code: 'input-error',
      message: expect.stringContaining('--text is empty or holds only whitespace'),
    })
    expect(result.stdout).toBe('')
    expect(existsSync(calls)).toBe(false)
  })
})

describe('task base inputs', () => {
  const homes: string[] = []
  afterAll(() => {
    for (const home of homes) rmSync(home, { recursive: true, force: true })
  })
  function checkout(bindingSource: string) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-dispatch-')))
    homes.push(root)
    init(root)
    const base = commit(root, 'README.md', 'fixture\n')
    mkdirSync(join(root, 'docs/engineering'), { recursive: true })
    mkdirSync(join(root, 'tools/dev-flow/src/delivery'), { recursive: true })
    writeFileSync(
      join(root, 'docs/engineering/integration-policy.json'),
      JSON.stringify(policyDocument(base, 'origin')),
    )
    writeFileSync(
      join(root, 'docs/engineering/github-delivery.json'),
      JSON.stringify({ ...config, project: { ...config.project } }),
    )
    writeFileSync(join(root, 'docs/engineering/delivery-lines.json'), JSON.stringify(table()))
    writeFileSync(join(root, 'tools/dev-flow/src/delivery/binding.ts'), bindingSource)
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'inputs'])
    return { root, head: git(root, ['rev-parse', 'HEAD']) }
  }

  it('reads policy, config and lines committed at the task base', () => {
    const { root, head } = checkout("export const marker = 'omne-integration-binding:v2'\n")
    // A later uncommitted edit does not change what the task base holds.
    writeFileSync(join(root, 'docs/engineering/delivery-lines.json'), '{}')
    const inputs = taskBaseInputs(root, head)
    expect(inputs.config.repository).toBe('owner/repo')
    expect(inputs.lines.lines.map(line => line.id)).toContain('engineering-toolchain')
  })

  it('refuses a task base whose dev-flow reads only version 1 bindings', () => {
    const { root, head } = checkout("export const marker = 'omne-integration-binding:v1'\n")
    expect(() => taskBaseInputs(root, head)).toThrow('cannot read a version 2 binding')
  })
})
