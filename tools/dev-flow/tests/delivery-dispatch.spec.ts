import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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
  reviseCardBody,
  taskBaseInputs,
  type DispatchSpec,
} from '../src/delivery/dispatch.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { dispatchFieldGaps, parseConfig, type CapturedIssue } from '../src/delivery/protocol.ts'
import { conditionDigest } from '../src/integration/authority.ts'
import { git } from '../src/integration/git.ts'
import {
  dispatchGhScript,
  readDispatchGhState,
  writeDispatchGhState,
} from './fixtures/dispatch-gh.ts'
import { commit, init, policyDocument, trackEntry } from './fixtures/integration.ts'
import { registry, table } from './fixtures/lines.ts'
import { ghEnv, writeGh } from './fixtures/gh.ts'

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

/** A GitHub stand-in that holds one card body and one dispatch comment. */
function github(body = cardBody()) {
  const calls: string[][] = []
  const state = { body, comment: '', stdin: '' }
  const call: GhCommand = (argv, _timeout, input) => {
    calls.push([...argv])
    const method = argv[2],
      path = argv.find(item => item.startsWith('repos/')) ?? '',
      field = argv.findIndex(item => item === '-f' || item === '-F'),
      named = argv[field + 1] ?? '',
      // `-F body=@-` reads the text from standard input; `-f body=<text>` carries it in argv.
      value =
        named === 'body=@-'
          ? (state.stdin = input ?? '')
          : named.startsWith('body=')
            ? named.slice('body='.length)
            : undefined
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
    expect(() => parseDispatchSpec({ ...spec, line: 'engineering-toolchain' })).toThrow(
      'unknown fields line',
    )
    expect(parseDispatchSpec({ ...spec, revision: 3 }).revision).toBe(3)
    expect(() => parseDispatchSpec({ ...spec, revision: 0 })).toThrow('positive integer')
  })
})

describe('posting and binding', () => {
  const posted = plan()

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

  it('adds a「工作树」line at the end of「认领与派发」when the subsection has none', () => {
    const body = bindBody(cardBody().replace('- 工作树：未创建。\n', ''), binding, 'w')
    expect(body).toContain(
      `### 认领与派发\n- 派发情况：已派发，见 ${binding.dispatch}。\n- 工作树：\`w\`。\n### 分支、基线与task context`,
    )
    // Without --worktree nothing is added.
    expect(bindBody(cardBody().replace('- 工作树：未创建。\n', ''), binding)).not.toContain(
      '- 工作树',
    )
  })

  it.each([
    ['no「认领与派发」', (body: string) => body.replace('### 认领与派发\n', '')],
    [
      'two「认领与派发」',
      (body: string) =>
        body.replace('### 当前进展', '### 认领与派发\n- 工作树：别处。\n### 当前进展'),
    ],
  ])('refuses a worktree when the card has %s, before any write', (_name, edit) => {
    expect(() => bindBody(edit(cardBody()), binding, 'w')).toThrow('exactly one ### 认领与派发')
    const gh = github(edit(cardBody()))
    expect(() =>
      bindCard({ repository: 'owner/repo', binding, worktree: 'w', dryRun: false, call: gh.call }),
    ).toThrow('exactly one ### 认领与派发')
    expect(gh.calls.map(c => c[2])).toEqual(['GET'])
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

  it('writes a card body far over the command-line limit through standard input', () => {
    const long = cardBody(START_ROW, `- 长正文：${'x'.repeat(120_000)}`)
    const gh = github(long)
    expect(
      bindCard({ repository: 'owner/repo', binding, dryRun: false, call: gh.call }),
    ).toMatchObject({ applied: true, verified: true })
    const patch = gh.calls.find(c => c[2] === 'PATCH' && c.includes('repos/owner/repo/issues/7'))
    expect(patch).toBeDefined()
    expect(patch?.join(' ')).not.toContain('x'.repeat(1000))
    expect(patch?.slice(-1)).toEqual(['body=@-'])
    expect(gh.state.stdin.startsWith('## 身份与责任')).toBe(true)
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

/** Card 7 after revision 2 was posted as comment 40 and bound: the card a new revision starts from. */
const BOUND = (() => {
  const binding = { ...plan().binding, dispatch: `${url}#issuecomment-40` }
  const { decision } = dispatchDecision(plan(), binding.dispatch, spec.basis)
  const comment = {
    url: binding.dispatch,
    author: 'human',
    body: dispatchComment('revision 2', decision),
    updatedAt: '2026-10-26T00:00:00Z',
  }
  return { body: bindBody(cardBody(), binding, '.worktrees/issue-7'), binding, comment }
})()
const r3: DispatchSpec = {
  ...spec,
  attempt: '7-r3-a1',
  revision: 3,
  confirmations: [{ condition: 'D-S00', evidence: 'dispatcher approved revision 3' }],
}
const bound = (body = BOUND.body) => issue({ body, comments: [BOUND.comment] })
const PENDING =
  '未登记 binding。修订 3 待派发，修订 2 的 binding 已撤下；计划集成路线：轨道 `legacy-refactor`，最终终点：track。'

describe('opening a new revision on a bound card', () => {
  it('checks the rewritten card and plans both body edits', () => {
    const result = plan({ spec: r3, card: bound() })
    expect(result.binding).toMatchObject({ revision: 3, attempt: '7-r3-a1' })
    const revise = result.revise
    expect(revise).toMatchObject({ from: 2, to: 3, before: BOUND.body })
    expect(revise?.edits.map(edit => [edit.part, edit.after])).toEqual([
      ['revision', '- 交付修订：3'],
      ['binding', PENDING],
    ])
    expect(revise?.edits[0]?.before).toBe('- 交付修订：2')
    // The dispatch line `bind` wrote leaves with its block.
    expect(revise?.edits[1]?.before).toMatch(
      /^正式派发：.*\n\n```json omne-integration-binding:v2\n/,
    )
    expect(revise?.edits[1]?.before).toMatch(/\n```$/)
    const body = revise?.body ?? ''
    expect(readTaskBinding(body, BOUND.binding.issue)).toBeUndefined()
    expect(body).not.toContain('正式派发：')
    expect(body).toContain(`### 分支、基线与task context\n\n${PENDING}\n\n### 当前进展`)
    // Outside the two edits the body is kept.
    expect(body.replace('交付修订：3', '交付修订：2').replace(PENDING, '')).toBe(
      BOUND.body.replace(revise?.edits[1]?.before ?? '', ''),
    )
  })

  it('leaves a card that already carries the revision unchanged', () => {
    const result = plan({ spec: { ...spec, revision: 2 } })
    expect(result.revise).toBeUndefined()
    expect(result).toEqual(plan())
  })

  it('changes only the revision line of a card without a binding', () => {
    const result = plan({ spec: r3 })
    expect(result.revise?.edits.map(edit => edit.part)).toEqual(['revision'])
    expect(result.revise?.body).toBe(cardBody().replace('交付修订：2', '交付修订：3'))
  })

  it.each([
    ['a revision below the card', { spec: { ...r3, revision: 1 } }, 'below the card'],
    [
      'a binding block outside its subsection',
      {
        spec: r3,
        card: issue({
          body: cardBody(
            START_ROW,
            `\`\`\`json omne-integration-binding:v2\n${JSON.stringify(BOUND.binding)}\n\`\`\``,
          ),
        }),
      },
      'binding block outside',
    ],
  ])('refuses %s before any write', (_name, patch, message) => {
    expect(() => plan(patch)).toThrow(message)
  })

  it.each([
    ['a revision below the card', BOUND.body, 1, 'below the card'],
    [
      'a binding block that is not closed',
      BOUND.body.replace('}\n```\n', '}\n'),
      3,
      'binding block in 「分支、基线与task context」 is not closed',
    ],
    [
      'a binding block outside its subsection',
      cardBody(START_ROW, '```json omne-integration-binding:v2\n{}\n```'),
      3,
      'binding block outside',
    ],
  ])('reviseCardBody refuses %s', (_name, body, revision, message) => {
    expect(() => reviseCardBody(body, revision, r3.route, r3.completionTarget)).toThrow(message)
  })

  it('writes the revised body before the comment, and bind then reads the new binding back', () => {
    const planned = plan({ spec: r3, card: bound() })
    const gh = github(BOUND.body)
    const result = postDispatch({
      repository: 'owner/repo',
      plan: planned,
      basis: spec.basis,
      prose: '## 修订 3 派发\n',
      call: gh.call,
    })
    expect(gh.calls.map(c => `${c[2]} ${c.find(item => item.startsWith('repos/'))}`)).toEqual([
      'GET repos/owner/repo/issues/7',
      'PATCH repos/owner/repo/issues/7',
      'GET repos/owner/repo/issues/7',
      'POST repos/owner/repo/issues/7/comments',
      'PATCH repos/owner/repo/issues/comments/55',
      'GET repos/owner/repo/issues/comments/55',
    ])
    expect(result.verified).toBe(true)
    expect(gh.state.body).toBe(planned.revise?.body)
    expect(
      bindCard({ repository: 'owner/repo', binding: result.binding, dryRun: false, call: gh.call }),
    ).toMatchObject({ applied: true, verified: true })
    expect(readTaskBinding(gh.state.body, BOUND.binding.issue)).toMatchObject({
      revision: 3,
      attempt: '7-r3-a1',
      dispatch: `${url}#issuecomment-55`,
    })
    expect(gh.state.body).toContain(`- 派发情况：已派发，见 ${url}#issuecomment-55。`)
  })

  it('writes and posts nothing when the card changed after the checks', () => {
    const gh = github(`${BOUND.body}\n- 最近更新：另一次编辑。`)
    expect(() =>
      postDispatch({
        repository: 'owner/repo',
        plan: plan({ spec: r3, card: bound() }),
        basis: spec.basis,
        prose: 'x',
        call: gh.call,
      }),
    ).toThrow('changed after the checks')
    expect(gh.calls.map(c => c[2])).toEqual(['GET'])
  })

  it('posts nothing when the revised body does not read back', () => {
    const gh = github(BOUND.body)
    const lossy: GhCommand = (argv, timeout) => {
      const result = gh.call(argv, timeout)
      if (argv[2] === 'PATCH') gh.state.body = `${gh.state.body}\n`
      return result
    }
    expect(() =>
      postDispatch({
        repository: 'owner/repo',
        plan: plan({ spec: r3, card: bound() }),
        basis: spec.basis,
        prose: 'x',
        call: lossy,
      }),
    ).toThrow('does not read back as revision 3. Nothing was posted')
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
    writeGh(bin, `#!/bin/sh\necho "$@" >> '${calls}'\nexit 1\n`)
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
      { encoding: 'utf8', env: { ...process.env, ...ghEnv(bin) } },
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

describe('dispatch-cli on a bound card that opens a new revision', () => {
  const homes: string[] = []
  afterAll(() => {
    for (const home of homes) rmSync(home, { recursive: true, force: true })
  })
  const cli = fileURLToPath(new URL('../src/delivery/dispatch-cli.ts', import.meta.url))

  // Slow: dispatch-cli runs three times as a child process against a task base checkout, with a
  // `gh` stand-in that keeps card 7 in a state file.
  it(
    'dry-runs both edits without a write, then posts, and bind reads the new binding back',
    { tags: ['slow'] },
    () => {
      const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-dispatch-revision-')))
      homes.push(home)
      init(home)
      const base = commit(home, 'README.md', 'fixture\n')
      mkdirSync(join(home, 'docs/engineering'), { recursive: true })
      mkdirSync(join(home, 'tools/dev-flow/src/delivery'), { recursive: true })
      const configPath = join(home, 'docs/engineering/github-delivery.json')
      writeFileSync(
        join(home, 'docs/engineering/integration-policy.json'),
        JSON.stringify(policyDocument(base, 'origin', [trackEntry('legacy-refactor', base)])),
      )
      writeFileSync(configPath, JSON.stringify({ ...config, project: { ...config.project } }))
      writeFileSync(join(home, 'docs/engineering/delivery-lines.json'), JSON.stringify(table()))
      writeFileSync(
        join(home, 'tools/dev-flow/src/delivery/binding.ts'),
        "export const marker = 'omne-integration-binding:v2'\n",
      )
      git(home, ['add', '.'])
      git(home, ['commit', '-m', 'inputs'])
      const taskBase = git(home, ['rev-parse', 'HEAD'])
      const bin = join(home, 'bin'),
        statePath = join(home, 'gh-state.json')
      mkdirSync(bin)
      writeGh(bin, dispatchGhScript(statePath))
      writeDispatchGhState(statePath, {
        login: 'human',
        body: BOUND.body,
        labels: issue().labels,
        milestone: 'M1',
        comments: [
          {
            id: 40,
            html_url: BOUND.comment.url,
            body: BOUND.comment.body,
            user: { login: 'human' },
            updated_at: BOUND.comment.updatedAt,
          },
        ],
        calls: [],
      })
      writeFileSync(join(home, 'spec.json'), JSON.stringify({ ...r3, taskBase }))
      writeFileSync(join(home, 'prose.md'), '## 修订 3 派发\n')
      const env = { ...process.env, ...ghEnv(bin) }
      const run = (args: string[]) =>
        spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
          encoding: 'utf8',
          env,
        })
      const post = ['post', '--spec', join(home, 'spec.json'), '--text', join(home, 'prose.md')]
      const writes = () =>
        readDispatchGhState(statePath).calls.filter(c => c[1] === '--method' && c[2] !== 'GET')

      const dry = run([...post, '--root', home, '--dry-run'])
      expect(dry.stderr).toBe('')
      expect(dry.status).toBe(0)
      const preview = JSON.parse(dry.stdout)
      expect(preview).toMatchObject({ applied: false, cardEdits: { from: 2, to: 3 } })
      expect(
        preview.cardEdits.edits.map((edit: { part: string; after: string }) => [
          edit.part,
          edit.after,
        ]),
      ).toEqual([
        ['revision', '- 交付修订：3'],
        ['binding', PENDING],
      ])
      expect(preview.binding).toMatchObject({ revision: 3, dispatch: DISPATCH_PLACEHOLDER })
      expect(writes()).toEqual([])
      expect(readDispatchGhState(statePath).body).toBe(BOUND.body)

      const out = join(home, 'binding.json')
      const posted = run([...post, '--root', home, '--out', out])
      expect(posted.status).toBe(0)
      expect(JSON.parse(posted.stdout)).toMatchObject({ applied: true, verified: true })
      const card = readDispatchGhState(statePath).body
      expect(card).toContain('- 交付修订：3')
      expect(card).toContain(PENDING)
      expect(readTaskBinding(card, BOUND.binding.issue)).toBeUndefined()

      const bound = run(['bind', '--binding', out, '--config', configPath])
      expect(bound.status).toBe(0)
      expect(JSON.parse(bound.stdout)).toMatchObject({ applied: true, verified: true })
      expect(
        readTaskBinding(readDispatchGhState(statePath).body, BOUND.binding.issue),
      ).toMatchObject({
        revision: 3,
        attempt: '7-r3-a1',
        taskBase,
        dispatch: `${url}#issuecomment-101`,
      })
    },
  )
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
