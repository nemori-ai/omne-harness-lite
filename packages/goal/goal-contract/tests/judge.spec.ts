import { describe, expect, it } from 'vitest'
import {
  BASELINE_JUDGE_CONFIG,
  DEFAULT_JUDGE_CONFIG,
  excerptOf,
  DEAD_END_PLAIN,
  EXIT_GUIDE,
  CHECK_COVERS,
  FLAG_NOTES,
  JudgeConfigSchema,
  JUDGE_LIMITS,
  NO_PROGRESS,
  packJudge,
  readAnswer,
  readJudge,
  REPLY_NAME,
  REPLY_NOTE,
  REPLY_REF,
  rule,
  validateDraft,
  validReply,
  type GoalDraft,
  type JudgeAnswer,
  type JudgeConfig,
  type JudgeMaterial,
  type JudgeReply,
  type ObservedCall,
  type Progress,
} from '@omne-harness/goal-contract'
import { HOME } from './fixtures.ts'

function bodyOf(draft: GoalDraft) {
  const checked = validateDraft(draft, { attendance: 'attended' })
  if (checked.kind !== 'valid') throw new Error(JSON.stringify(checked.issues))
  return checked.body
}
const call = (order: number, rest: Partial<ObservedCall>): ObservedCall => ({
  ref: `call-${String(order)}`,
  order,
  tool: 'Shell run',
  command: null,
  path: null,
  exit: null,
  output: '',
  writes: false,
  ...rest,
})
const E2E = (order: number, exit: number) =>
  call(order, { command: 'pnpm test:e2e', exit, output: exit === 0 ? '148 passed' : '3 failed' })
const WRITE = (order: number, path: string, output = 'written') =>
  call(order, { tool: 'Files write', path, output, writes: true })
const CHANGELOG = WRITE(52, 'CHANGELOG.md', '## 未发布\n\n- 首页首屏的数据改成并行取。\n')
const PROGRESS: Progress = {
  ...NO_PROGRESS,
  criteria: {
    A2: { status: 'claimed-done', refs: ['call-54'], note: '全部通过' },
    A3: { status: 'claimed-done', refs: ['call-52'], note: '已加条目' },
  },
}
function material(change: Partial<JudgeMaterial> = {}): JudgeMaterial {
  return {
    body: bodyOf(HOME),
    attendance: 'attended',
    progress: PROGRESS,
    calls: [CHANGELOG, E2E(54, 0)],
    metrics: { M1: 780 },
    rounds: 12,
    ...change,
  }
}
const config = (change: Partial<JudgeConfig> = {}): JudgeConfig => ({
  ...BASELINE_JUDGE_CONFIG,
  ...change,
})
const packaging = (change: Partial<JudgeConfig['packaging']>): JudgeConfig =>
  config({ packaging: { ...BASELINE_JUDGE_CONFIG.packaging, ...change } })
const names = (requests: ReturnType<typeof packJudge>['requests']) =>
  requests.map(request => Object.keys(request.questions))
type State = {
  goal: { criteria: string[] }
  progress: { criteria: Record<string, { claim: string; refs?: string[]; note?: string }> }
  evidence: Record<
    string,
    { ref: string; excerpt: string; laterWrites?: string[]; newerRun?: unknown }[]
  >
  facts: { decided: Record<string, string>; activity?: unknown[]; changedPaths?: string[] }
}
const stateOf = (packed: ReturnType<typeof packJudge>, index = 0) =>
  packed.requests[index]?.state as unknown as State

describe('what the system settles is not asked', () => {
  it('asks one question for each criterion a reader must judge, each rule, and each condition or person exit', () => {
    const packed = packJudge(material(), config())
    expect(names(packed.requests)).toEqual([['A3', 'N1', 'N2', 'X3']])
    expect(packed.decided).toEqual({ A2: 'holds' })
    const { questions } = packed.requests[0]!
    expect(questions.A3).toMatchObject({ type: 'choice' })
    expect(Object.keys((questions.A3 as { criteria: object }).criteria)).toEqual([
      'holds',
      'fails',
      'no-evidence',
      'stale',
      'cannot-tell',
    ])
    expect(Object.keys((questions.N1 as { criteria: object }).criteria)).toEqual([
      'kept',
      'broken',
      'unclear',
    ])
    expect(questions.X3?.type).toBe('noul')
  })
  it.each([
    ['no run of the declared command', [CHANGELOG], 'no-evidence'],
    ['the latest run failed', [E2E(40, 0), E2E(44, 1)], 'fails'],
    ['the latest run passed', [E2E(40, 1), E2E(44, 0)], 'holds'],
    [
      'it was run again after the write',
      [E2E(44, 0), WRITE(45, 'src/home.tsx'), E2E(46, 0)],
      'holds',
    ],
    [
      'the same command with other spacing',
      [call(44, { command: '  pnpm   test:e2e ', exit: 0 })],
      'holds',
    ],
    [
      'a call of the command without an exit code',
      [call(44, { command: 'pnpm test:e2e' })],
      'no-evidence',
    ],
  ] as const)('a criterion that reads the exit code: %s', (_name, calls, reading) => {
    expect(packJudge(material({ calls: [...calls] }), config()).decided).toEqual({ A2: reading })
  })
  it('asks when a passing run was followed by a write, since the system cannot settle that; or calls it stale when so configured', () => {
    const input = material({ calls: [CHANGELOG, E2E(54, 0), WRITE(55, 'src/home.tsx')] })
    const marked = packJudge(input, config())
    expect(marked.decided).toEqual({})
    expect(names(marked.requests)).toEqual([['A2', 'A3', 'N1', 'N2', 'X3']])
    expect(stateOf(marked).evidence.A2).toMatchObject([
      { ref: 'call-54', exit: 0, laterWrites: ['src/home.tsx'] },
    ])
    const decided = packJudge(input, packaging({ staleness: 'decided' }))
    expect(decided.decided).toEqual({ A2: 'stale' })
    expect(names(decided.requests)).toEqual([['A3', 'N1', 'N2', 'X3']])
  })
  it('asks when a check the run uses was written before the passing run, and shows that write', () => {
    const tampered = WRITE(
      53,
      'tests/e2e/home.spec.ts',
      '- expect(ms).toBeLessThan(800)\n+ expect(true).toBe(true)',
    )
    const packed = packJudge(material({ calls: [CHANGELOG, tampered, E2E(54, 0)] }), config())
    expect(packed.decided).toEqual({})
    expect(stateOf(packed).evidence.A2).toMatchObject([
      { ref: 'call-53', path: 'tests/e2e/home.spec.ts', changesCheck: true },
      { ref: 'call-54', exit: 0 },
    ])
    expect(stateOf(packed).evidence.A2![1]).not.toHaveProperty('changesCheck')
    const named = WRITE(53, 'scripts/e2e.sh')
    const byName = call(54, { command: 'sh scripts/e2e.sh', exit: 0 })
    const draft: GoalDraft = {
      purpose: HOME.purpose,
      criteria: [
        {
          statement: '脚本通过',
          evidence: { kind: 'command', command: 'sh scripts/e2e.sh' },
          pass: { kind: 'exit-zero' },
        },
      ],
    }
    const input = material({ body: bodyOf(draft), calls: [named, byName], progress: NO_PROGRESS })
    expect(packJudge(input, config()).decided).toEqual({})
    const other = material({
      body: bodyOf(draft),
      calls: [WRITE(53, 'src/a.ts'), byName],
      progress: NO_PROGRESS,
    })
    expect(packJudge(other, config()).decided).toEqual({ A1: 'holds' })
  })
  it('asks about a dead end only when the agent named an obstacle', () => {
    const obstacle = { what: '测试环境连不上', tried: ['call-54'], exit: null }
    const packed = packJudge(material({ progress: { ...PROGRESS, obstacle } }), config())
    expect(names(packed.requests)).toEqual([['A3', 'N1', 'N2', 'X3', 'U1', 'U2']])
    expect(packed.requests[0]!.questions.U1?.type).toBe('choice')
    expect(packed.requests[0]!.questions.U2?.type).toBe('noul')
  })
  it('sends nothing when nothing is left for a reader', () => {
    const draft: GoalDraft = { purpose: HOME.purpose, criteria: [HOME.criteria![1]!] }
    const packed = packJudge(material({ body: bodyOf(draft) }), config())
    expect(packed).toEqual({ decided: { A1: 'holds' }, requests: [] })
  })
})

describe('what a request says, word for word', () => {
  const CONDITION: GoalDraft = {
    ...HOME,
    exits: [
      ...HOME.exits!,
      {
        statement: '测试环境不可用超过一天',
        kind: 'condition',
        deliver: '已做的改动',
        counts: 'failure',
      },
    ],
  }
  it('asks each kind of entry in its own words, with its own options', () => {
    const obstacle = { what: '连不上', tried: ['call-54'], exit: null }
    const input = material({ body: bodyOf(CONDITION), progress: { ...PROGRESS, obstacle } })
    const { questions } = packJudge(
      input,
      config({
        instructions: { ...BASELINE_JUDGE_CONFIG.instructions, criterion: 'statement', rules: [] },
      }),
    ).requests[0]!
    expect(questions).toEqual({
      A3: {
        type: 'choice',
        instructions: '判据 A3 现在成立没有：改动说明写进了 CHANGELOG',
        criteria: {
          holds: '证据显示它成立',
          fails: '证据显示没做到',
          'no-evidence': '材料里没有针对它的证据',
          stale: '证据早于之后的改动',
          'cannot-tell': '材料不足以判断',
        },
      },
      N1: {
        type: 'choice',
        instructions: '守则 N1 守住了没有：不改公共接口。',
        criteria: { kept: '材料显示守住了', broken: '材料显示违反了', unclear: '看不出' },
      },
      N2: {
        type: 'choice',
        instructions: '守则 N2 守住了没有：每次提交前跑 `pnpm lint`，不带着报错提交。',
        criteria: { kept: '材料显示守住了', broken: '材料显示违反了', unclear: '看不出' },
      },
      X3: { type: 'noul', instructions: '退出 X3 写的情形出现了没有：要改公共接口才能达标' },
      X4: { type: 'noul', instructions: '退出 X4 写的情形出现了没有：测试环境不可用超过一天' },
      U1: {
        type: 'choice',
        instructions: '有没有正文的退出没写到、却让目标达不成的阻碍。',
        criteria: {
          none: '没有这样的阻碍',
          blocked: '被权限或资源挡住',
          contradictory: '判据互相矛盾',
          forbidden: '唯一的办法被守则禁止',
        },
      },
      U2: {
        type: 'noul',
        instructions: '进展清单的阻碍指到的调用里，agent 针对这个阻碍实际试过没有。',
      },
    })
  })
  it('carries the agreed goal, what the agent says and the facts', () => {
    const obstacle = { what: '连不上', tried: ['call-54'], exit: null }
    const input = material({ progress: { ...PROGRESS, obstacle } })
    const state = packJudge(input, config()).requests[0]!.state as Record<string, unknown>
    expect(state.goal).toEqual({
      purpose: HOME.purpose,
      criteria: [
        '- [A1] 首页在测试环境里的 p95 加载时间到 M1 的目标\n  - 证据: 指标 M1',
        '- [A2] 现有端到端用例全过\n  - 证据: 命令 `pnpm test:e2e`\n  - 通过: 退出码 0',
        '- [A3] 改动说明写进了 CHANGELOG\n  - 证据: 文件 `CHANGELOG.md`\n  - 通过: 「未发布」一节下有一条讲这次提速的新条目',
      ],
      metrics: [
        '- [M1] 首页 p95 加载时间，毫秒\n  - 量法: 命令 `pnpm bench:home --json` 取 `.p95_ms`\n  - 方向: 越低越好\n  - 目标: 800\n  - 底线: 1200\n  - 基线: 先量',
      ],
      rules: ['- [N1] 不改公共接口。', '- [N2] 每次提交前跑 `pnpm lint`，不带着报错提交。'],
      exits: [
        '- [X1] 预算用尽\n  - 种类: 预算\n  - 上限: 30 轮\n  - 交: 当前最好的指标与改动\n  - 算: 失败',
        '- [X2] 预算用尽时已经够用\n  - 种类: 够用\n  - 凭: M1 到底线, A2\n  - 交: 当前的指标与改动，写明离目标差多少\n  - 算: 成功',
        '- [X3] 要改公共接口才能达标\n  - 种类: 要人定\n  - 交: 要改哪个接口、为什么\n  - 算: 失败',
      ],
    })
    expect(state.progress).toEqual({
      criteria: { A3: { claim: '自认做完', refs: ['call-52'], note: '已加条目' } },
      rules: {},
      proposal: { kind: 'none' },
      obstacle,
    })
    expect(state.facts).toEqual({
      attendance: 'attended',
      rounds: 12,
      metrics: { M1: 780 },
      decided: { A2: 'holds' },
      changedPaths: ['CHANGELOG.md'],
      activity: ['call-52 Files write CHANGELOG.md', 'call-54 Shell run pnpm test:e2e → 0'],
    })
    expect(state.evidence).toEqual({
      A3: [
        { ref: 'call-52', tool: 'Files write', path: 'CHANGELOG.md', excerpt: CHANGELOG.output },
      ],
    })
    const alone = packJudge(input, config({ split: 'each' })).requests[0]!.state as Record<
      string,
      unknown
    >
    expect(alone.progress).toEqual({
      criteria: { A3: { claim: '自认做完', refs: ['call-52'], note: '已加条目' } },
    })
  })
  it('lists the activity in the order of the session, whatever order it was handed in', () => {
    const calls = [
      E2E(54, 0),
      call(53, { tool: 'Ask user', output: '可以' }),
      CHANGELOG,
      call(51, { tool: 'Files read', path: 'src/home.tsx', output: '…' }),
    ]
    const facts = stateOf(packJudge(material({ calls }), config())).facts
    expect(facts.activity).toEqual([
      'call-51 Files read src/home.tsx',
      'call-52 Files write CHANGELOG.md',
      'call-53 Ask user',
      'call-54 Shell run pnpm test:e2e → 0',
    ])
    expect(facts.changedPaths).toEqual(['CHANGELOG.md'])
  })
  it('makes no empty request when a section has nothing to ask', () => {
    const draft: GoalDraft = { purpose: HOME.purpose, criteria: [HOME.criteria![2]!] }
    const packed = packJudge(material({ body: bodyOf(draft) }), config({ split: 'sections' }))
    expect(names(packed.requests)).toEqual([['A1']])
  })
})

describe('which writes put a passing run in doubt', () => {
  const settled = (calls: ObservedCall[], command = 'pnpm test:e2e') => {
    const draft: GoalDraft = {
      purpose: HOME.purpose,
      criteria: [
        { statement: '通过', evidence: { kind: 'command', command }, pass: { kind: 'exit-zero' } },
      ],
    }
    const input = material({ body: bodyOf(draft), calls, progress: NO_PROGRESS })
    return packJudge(input, config()).decided.A1
  }
  const RUN = E2E(54, 0)
  it.each([
    'tests/home.spec.ts',
    'test/home.py',
    'packages/a/__tests__/home.ts',
    'spec/home_spec.rb',
    'specs/home.rb',
    'e2e/home.ts',
    'bench/home.ts',
    'benchmarks/home.py',
    'src/home.test.tsx',
    'src/home.spec.ts',
    'src/home.bench.ts',
  ])('a write of the check %s before the run leaves it unsettled', path => {
    expect(settled([WRITE(53, path), RUN])).toBeUndefined()
  })
  it.each([
    'src/home.tsx',
    'src/contests/home.ts',
    'src/latest/home.ts',
    'docs/spec.md',
    'src/benchmarking.ts',
    'src/home.test',
    'src/home.spec.ts.bak',
  ])('a write of %s before the run does not', path => {
    expect(settled([WRITE(53, path), RUN])).toBe('holds')
  })
  it('only a write counts, only before the run, and a file the command names counts too', () => {
    const read = call(53, { tool: 'Files read', path: 'tests/home.spec.ts' })
    expect(settled([read, RUN])).toBe('holds')
    expect(settled([RUN, WRITE(55, 'tests/home.spec.ts')])).toBeUndefined()
    const script = call(54, { command: 'sh scripts/check.sh', exit: 0 })
    expect(settled([WRITE(53, 'scripts/check.sh'), script], 'sh scripts/check.sh')).toBeUndefined()
    expect(settled([WRITE(53, 'scripts/other.sh'), script], 'sh scripts/check.sh')).toBe('holds')
    expect(settled([RUN, E2E(40, 1)])).toBe('holds')
    const noCommand = call(55, { exit: 1 })
    expect(settled([RUN, noCommand])).toBe('holds')
    expect(settled([call(54, { command: 'pnpmtest:e2e', exit: 0 })])).toBe('no-evidence')
  })
})

describe('the evidence of a criterion', () => {
  it('is the calls the agent cites and the latest call of what the body declares, oldest first', () => {
    const calls = [
      E2E(44, 0),
      WRITE(50, 'CHANGELOG.md', 'first'),
      CHANGELOG,
      call(60, { output: 'x' }),
    ]
    const progress = {
      ...PROGRESS,
      criteria: { A3: { status: 'doing', refs: ['call-60'], note: '' } },
    }
    const state = stateOf(packJudge(material({ calls, progress: progress as Progress }), config()))
    expect(state.evidence.A3?.map(item => item.ref)).toEqual(['call-52', 'call-60'])
    expect(state.progress.criteria.A3).toEqual({ claim: '在做', refs: ['call-60'] })
  })
  it('marks a later write of the same file, and no write of another', () => {
    const later = [E2E(44, 0), CHANGELOG, WRITE(53, 'src/home.tsx')]
    expect(
      stateOf(packJudge(material({ calls: later }), config())).evidence.A3![0],
    ).not.toHaveProperty('laterWrites')
    const progress = {
      ...PROGRESS,
      criteria: { A3: { status: 'doing', refs: ['call-50'], note: '' } },
    }
    const calls = [WRITE(50, 'CHANGELOG.md'), CHANGELOG]
    const state = stateOf(packJudge(material({ calls, progress: progress as Progress }), config()))
    expect(state.evidence.A3?.map(item => item.laterWrites)).toEqual([['CHANGELOG.md'], undefined])
  })
  it('marks a newer run of the same command whose result differs', () => {
    const draft: GoalDraft = {
      purpose: HOME.purpose,
      criteria: [
        {
          statement: '用例全过',
          evidence: { kind: 'command', command: 'pnpm test' },
          pass: { kind: 'shows', text: '没有跳过的用例' },
        },
      ],
    }
    const run = (order: number, exit: number) => call(order, { command: 'pnpm test', exit })
    const progress = {
      ...NO_PROGRESS,
      criteria: { A1: { status: 'claimed-done', refs: ['call-1'], note: '' } },
    }
    const state = stateOf(
      packJudge(
        material({
          body: bodyOf(draft),
          progress: progress as Progress,
          calls: [run(1, 0), run(2, 1)],
        }),
        config(),
      ),
    )
    expect(state.evidence.A1).toMatchObject([
      { ref: 'call-1', exit: 0, newerRun: { ref: 'call-2', exit: 1 } },
      { ref: 'call-2', exit: 1 },
    ])
    expect(state.evidence.A1![1]).not.toHaveProperty('newerRun')
  })
  it('says of each call what it has, and nothing it has not', () => {
    const read = call(53, { tool: 'Files read', path: 'tests/e2e/home.spec.ts', output: 'x' })
    const progress = {
      ...PROGRESS,
      criteria: { A3: { status: 'doing', refs: ['call-53', 'call-54'], note: '' } },
    } as Progress
    const state = stateOf(
      packJudge(material({ calls: [CHANGELOG, read, E2E(54, 0)], progress }), config()),
    )
    expect(state.evidence.A3).toEqual([
      { ref: 'call-52', tool: 'Files write', path: 'CHANGELOG.md', excerpt: CHANGELOG.output },
      { ref: 'call-53', tool: 'Files read', path: 'tests/e2e/home.spec.ts', excerpt: 'x' },
      {
        ref: 'call-54',
        tool: 'Shell run',
        command: 'pnpm test:e2e',
        exit: 0,
        excerpt: '148 passed',
      },
    ])
  })
  it('shows a later write of a check as a later write, not as evidence of its own', () => {
    const input = material({ calls: [CHANGELOG, E2E(54, 0), WRITE(55, 'tests/e2e/home.spec.ts')] })
    const state = stateOf(packJudge(input, config()))
    expect(state.evidence.A2).toEqual([
      {
        ref: 'call-54',
        tool: 'Shell run',
        command: 'pnpm test:e2e',
        exit: 0,
        excerpt: '148 passed',
        laterWrites: ['tests/e2e/home.spec.ts'],
      },
    ])
    expect(state.progress).toEqual({
      criteria: {
        A2: { claim: '自认做完', refs: ['call-54'], note: '全部通过' },
        A3: { claim: '自认做完', refs: ['call-52'], note: '已加条目' },
      },
      rules: {},
      proposal: { kind: 'none' },
    })
  })
  it('asks about a command criterion that says nothing of how it passes', () => {
    const draft: GoalDraft = {
      purpose: HOME.purpose,
      criteria: [{ statement: '用例全过', evidence: { kind: 'command', command: 'pnpm test' } }],
    }
    const started = call(1, { command: 'pnpm test', output: 'started' })
    const ran = call(2, { command: 'pnpm test', exit: 0 })
    const shell = call(3, { tool: 'Shell run', writes: true, output: 'generated' })
    const progress = {
      ...NO_PROGRESS,
      criteria: { A1: { status: 'claimed-done', refs: ['call-1'], note: '' } },
    } as Progress
    const input = material({ body: bodyOf(draft), progress, calls: [started, ran, shell] })
    const packed = packJudge(input, packaging({ activity: 'excerpts' }))
    expect(packed.decided).toEqual({})
    const state = stateOf(packed)
    expect(state.evidence.A1).toEqual([
      {
        ref: 'call-1',
        tool: 'Shell run',
        command: 'pnpm test',
        excerpt: 'started',
        laterWrites: ['call-3'],
      },
      {
        ref: 'call-2',
        tool: 'Shell run',
        command: 'pnpm test',
        exit: 0,
        excerpt: '',
        laterWrites: ['call-3'],
      },
    ])
    const all = packJudge(
      material({ calls: [started, ran, shell] }),
      packaging({ activity: 'excerpts' }),
    )
    expect(stateOf(all).facts).toMatchObject({
      changedPaths: [],
      activity: [
        'call-1 Shell run pnpm test',
        'call-2 Shell run pnpm test → 0',
        { call: 'call-3 Shell run', excerpt: 'generated' },
      ],
    })
  })
  it('marks no newer run when the newer run came out the same', () => {
    const draft: GoalDraft = {
      purpose: HOME.purpose,
      criteria: [
        {
          statement: '用例全过',
          evidence: { kind: 'command', command: 'pnpm test' },
          pass: { kind: 'shows', text: '没有跳过的用例' },
        },
      ],
    }
    const run = (order: number) => call(order, { command: 'pnpm test', exit: 0 })
    const progress = {
      ...NO_PROGRESS,
      criteria: { A1: { status: 'claimed-done', refs: ['call-1'], note: '' } },
    } as Progress
    const input = material({ body: bodyOf(draft), progress, calls: [run(1), run(2)] })
    for (const item of stateOf(packJudge(input, config())).evidence.A1!)
      expect(item).not.toHaveProperty('newerRun')
  })
  it('names at most eight of the writes that came later', () => {
    const later = Array.from({ length: 12 }, (_unused, index) => WRITE(60 + index, 'CHANGELOG.md'))
    const progress = {
      ...PROGRESS,
      criteria: { A3: { status: 'doing', refs: ['call-52'], note: '' } },
    } as Progress
    const state = stateOf(packJudge(material({ calls: [CHANGELOG, ...later], progress }), config()))
    expect(state.evidence.A3![0]!.laterWrites).toHaveLength(JUDGE_LIMITS.laterWrites)
  })
  it('keeps the latest six calls of an entry', () => {
    const refs = [1, 2, 3, 4, 5, 6, 7, 8].map(order => `call-${String(order)}`)
    const progress = { ...PROGRESS, criteria: { A3: { status: 'doing', refs, note: '' } } }
    const calls = [1, 2, 3, 4, 5, 6, 7, 8].map(order => call(order, { output: 'x' }))
    const state = stateOf(packJudge(material({ calls, progress: progress as Progress }), config()))
    expect(state.evidence.A3?.map(item => item.ref)).toEqual(
      refs.slice(-JUDGE_LIMITS.evidencePerEntry),
    )
  })
})

describe('the six things a configuration changes', () => {
  it('splits the questions into one request, one per section, or one per question', () => {
    const obstacle = { what: '连不上', tried: [], exit: null }
    const input = material({ progress: { ...PROGRESS, obstacle } })
    expect(names(packJudge(input, config({ split: 'sections' })).requests)).toEqual([
      ['A3'],
      ['N1', 'N2'],
      ['X3', 'U1', 'U2'],
    ])
    const each = packJudge(input, config({ split: 'each' }))
    expect(names(each.requests)).toEqual([['A3'], ['N1'], ['N2'], ['X3'], ['U1'], ['U2']])
    expect(Object.keys(stateOf(each, 0).evidence)).toEqual(['A3'])
    expect(stateOf(each, 0).facts).not.toHaveProperty('activity')
    expect(Object.keys(stateOf(each, 1).evidence)).toEqual([])
    expect(stateOf(each, 1).facts.activity).toEqual([
      'call-52 Files write CHANGELOG.md',
      'call-54 Shell run pnpm test:e2e → 0',
    ])
    expect(stateOf(each, 1).facts.changedPaths).toEqual(['CHANGELOG.md'])
  })
  it('writes a question with the statement alone or the rendered entry, then the general rules it is given', () => {
    const text = (criterion: 'statement' | 'rendered', rules: string[] = []) =>
      packJudge(
        material(),
        config({ instructions: { ...BASELINE_JUDGE_CONFIG.instructions, criterion, rules } }),
      ).requests[0]!.questions.A3!.instructions
    expect(text('statement')).toBe('判据 A3 现在成立没有：改动说明写进了 CHANGELOG')
    expect(text('rendered')).toBe(
      '判据 A3 现在成立没有。\n- [A3] 改动说明写进了 CHANGELOG\n  - 证据: 文件 `CHANGELOG.md`\n  - 通过: 「未发布」一节下有一条讲这次提速的新条目',
    )
    const rules = ['进展清单是 agent 的说法，不是证据。', '只覆盖一部分的检查不能证明整条判据。']
    expect(text('rendered', rules)).toBe(
      `${text('rendered')}\n进展清单是 agent 的说法，不是证据。只覆盖一部分的检查不能证明整条判据。`,
    )
    expect(text('statement', [rules[0]!])).toBe(
      `${text('statement')}\n进展清单是 agent 的说法，不是证据。`,
    )
    const other = packJudge(
      material(),
      config({
        instructions: { ...BASELINE_JUDGE_CONFIG.instructions, criterion: 'rendered', rules },
      }),
    )
    expect(other.requests[0]!.questions.N1!.instructions).toBe('守则 N1 守住了没有：不改公共接口。')
  })
  it('gives or withholds the agent’s note', () => {
    const noted = (notes: boolean) =>
      stateOf(packJudge(material(), packaging({ notes }))).progress.criteria.A3
    expect(noted(true)).toEqual({ claim: '自认做完', refs: ['call-52'], note: '已加条目' })
    expect(noted(false)).toEqual({ claim: '自认做完', refs: ['call-52'] })
  })
  it('cuts an excerpt at the head, the tail, or both', () => {
    const text = 'abcdefghij'
    expect(excerptOf(text, 10, 'both')).toBe(text)
    expect(excerptOf(text, 4, 'head')).toBe('abcd…')
    expect(excerptOf(text, 4, 'tail')).toBe('…ghij')
    expect(excerptOf(text, 4, 'both')).toBe('ab\n…\nij')
    expect(excerptOf('目标函数是随时能读数的', 4, 'both')).toBe('目标\n…\n数的')
    const long = WRITE(52, 'CHANGELOG.md', 'x'.repeat(5000))
    const cut = stateOf(
      packJudge(material({ calls: [long] }), packaging({ excerpt: 300, take: 'head' })),
    )
    expect(cut.evidence.A3![0]!.excerpt).toBe(`${'x'.repeat(300)}…`)
  })
  it('shows in the activity what a write or a failed command showed, when so configured', () => {
    const failed = call(53, { command: 'pnpm lint', exit: 1, output: 'x'.repeat(900) })
    const input = material({ calls: [CHANGELOG, failed, E2E(54, 0)] })
    const lines = stateOf(packJudge(input, config())).facts.activity
    expect(lines).toEqual([
      'call-52 Files write CHANGELOG.md',
      'call-53 Shell run pnpm lint → 1',
      'call-54 Shell run pnpm test:e2e → 0',
    ])
    const shown = stateOf(packJudge(input, packaging({ activity: 'excerpts', take: 'head' }))).facts
    expect(shown.activity).toEqual([
      { call: 'call-52 Files write CHANGELOG.md', excerpt: CHANGELOG.output },
      { call: 'call-53 Shell run pnpm lint → 1', excerpt: `${'x'.repeat(400)}…` },
      'call-54 Shell run pnpm test:e2e → 0',
    ])
    const all = stateOf(packJudge(input, packaging({ activity: 'all', take: 'head' }))).facts
    expect(all.activity).toEqual([
      { call: 'call-52 Files write CHANGELOG.md', excerpt: CHANGELOG.output },
      { call: 'call-53 Shell run pnpm lint → 1', excerpt: `${'x'.repeat(400)}…` },
      { call: 'call-54 Shell run pnpm test:e2e → 0', excerpt: '148 passed' },
    ])
  })
  it('says beside a flagged evidence item what its flag means, when so configured', () => {
    const tampered = WRITE(53, 'tests/e2e/home.spec.ts', '- expect(ms).toBeLessThan(800)')
    const calls = [CHANGELOG, tampered, E2E(54, 0), WRITE(55, 'src/home.tsx')]
    const keys = stateOf(packJudge(material({ calls }), config())).evidence.A2!
    for (const item of keys) expect(item).not.toHaveProperty('note')
    const noted = stateOf(packJudge(material({ calls }), packaging({ flags: 'notes' }))).evidence
    expect(noted.A2!.map(item => (item as { note?: string }).note)).toEqual([
      `${FLAG_NOTES.check}${FLAG_NOTES.later}`,
      FLAG_NOTES.later,
    ])
    expect(noted.A3![0]).not.toHaveProperty('note')
    const draft: GoalDraft = {
      purpose: HOME.purpose,
      criteria: [
        {
          statement: '用例全过',
          evidence: { kind: 'command', command: 'pnpm test' },
          pass: { kind: 'shows', text: '没有跳过的用例' },
        },
      ],
    }
    const run = (order: number, exit: number) => call(order, { command: 'pnpm test', exit })
    const progress = {
      ...NO_PROGRESS,
      criteria: { A1: { status: 'claimed-done', refs: ['call-1'], note: '' } },
    } as Progress
    const input = material({ body: bodyOf(draft), progress, calls: [run(1, 0), run(2, 1)] })
    const twice = stateOf(packJudge(input, packaging({ flags: 'notes' }))).evidence.A1!
    expect(twice.map(item => (item as { note?: string }).note)).toEqual([
      FLAG_NOTES.newer,
      undefined,
    ])
  })
  it('lets the system call stale evidence stale instead of asking', () => {
    const draft: GoalDraft = {
      purpose: HOME.purpose,
      criteria: [
        {
          statement: '用例全过',
          evidence: { kind: 'command', command: 'pnpm test' },
          pass: { kind: 'shows', text: '没有跳过的用例' },
        },
        { statement: '人看过了', evidence: { kind: 'person' } },
      ],
    }
    const progress = {
      ...NO_PROGRESS,
      criteria: { A2: { status: 'claimed-done', refs: ['call-1'], note: '' } },
    } as Progress
    const calls = [call(1, { command: 'pnpm test', exit: 0 }), WRITE(2, 'src/a.ts')]
    const input = material({ body: bodyOf(draft), progress, calls })
    const marked = packJudge(input, packaging({ staleness: 'marked' }))
    expect(names(marked.requests)).toEqual([['A1', 'A2']])
    expect(stateOf(marked).evidence.A1![0]!.laterWrites).toEqual(['src/a.ts'])
    const decided = packJudge(input, packaging({ staleness: 'decided' }))
    expect(decided.decided).toEqual({ A1: 'stale' })
    expect(names(decided.requests)).toEqual([['A2']])
    const bare = packJudge(
      material({ body: bodyOf(draft), progress: NO_PROGRESS, calls: [WRITE(2, 'src/a.ts')] }),
      packaging({ staleness: 'decided' }),
    )
    expect(bare.decided).toEqual({})
    expect(names(bare.requests)).toEqual([['A1', 'A2']])
    expect(stateOf(decided).evidence.A2![0]).not.toHaveProperty('laterWrites')
  })
})

describe('GL-11 the material has a ceiling the length of the session does not move', () => {
  const session = (count: number, size: number) =>
    Array.from({ length: count }, (_unused, order) =>
      order % 2 === 0
        ? call(order, { command: `step ${String(order)}`, exit: 0, output: '输'.repeat(size) })
        : WRITE(order, `src/file-${String(order)}.ts`, '出'.repeat(size)),
    )
  const sized = (count: number, size: number, split: JudgeConfig['split']) => {
    const calls = session(count, size)
    const refs = calls.slice(-16).map(entry => entry.ref)
    const progress = {
      ...PROGRESS,
      criteria: { A3: { status: 'doing', refs, note: '' } },
    } as Progress
    return packJudge(material({ calls, progress }), config({ split })).requests
  }
  it.each(['one', 'sections', 'each'] as const)('split %s', split => {
    const short = sized(20, 100, split)
    const long = sized(4000, 50_000, split)
    for (const request of long) {
      const size = JSON.stringify(request.state).length
      expect(size).toBeLessThanOrEqual(JUDGE_LIMITS.state)
    }
    expect(long.map(request => Object.keys(request.questions))).toEqual(
      short.map(request => Object.keys(request.questions)),
    )
    const state = long.at(split === 'each' ? 1 : split === 'sections' ? 1 : 0)!
      .state as unknown as State
    expect(state.facts.activity).toHaveLength(JUDGE_LIMITS.activity)
    expect(state.facts.changedPaths).toHaveLength(JUDGE_LIMITS.changedPaths)
  })
  it('halves the excerpts until the request fits, and sends the bare claims when nothing else fits', () => {
    const many: GoalDraft = {
      purpose: HOME.purpose,
      criteria: Array.from({ length: 40 }, (_unused, index) => ({
        statement: `第 ${String(index)} 件做完`,
        evidence: { kind: 'file', path: `out/${String(index)}.md` } as const,
      })),
    }
    const body = bodyOf(many)
    const calls = body.criteria.map((_entry, index) =>
      WRITE(index, `out/${String(index)}.md`, '字'.repeat(4000)),
    )
    const fitted = packJudge(material({ body, calls, progress: NO_PROGRESS }), config())
      .requests[0]!
    const state = fitted.state as unknown as State
    expect(JSON.stringify(state).length).toBeLessThanOrEqual(JUDGE_LIMITS.state)
    expect(Array.from(state.evidence.A1![0]!.excerpt).length).toBeLessThan(2000)
    expect(Array.from(state.evidence.A1![0]!.excerpt).length).toBeGreaterThan(200)
    const refs = Array.from({ length: 16 }, (_unused, index) => 'r'.repeat(250) + String(index))
    const loud = {
      ...NO_PROGRESS,
      criteria: Object.fromEntries(
        body.criteria.map(entry => [entry.id, { status: 'doing', refs, note: '注'.repeat(200) }]),
      ),
    } as Progress
    const lean = packJudge(material({ body, calls, progress: loud }), config()).requests[0]!
    const bare = lean.state as unknown as State
    expect(bare.progress.criteria.A1).toEqual({ claim: '在做' })
    expect(bare.evidence).toEqual({})
    const obstacle = { what: '连不上', tried: refs, exit: null }
    const blocked = packJudge(material({ body, calls, progress: { ...loud, obstacle } }), config())
    const said = (blocked.requests[0]!.state as { progress: { obstacle: unknown } }).progress
    expect(said.obstacle).toEqual({ what: '连不上', exit: null })
    expect(JSON.stringify(bare).length).toBeLessThanOrEqual(JUDGE_LIMITS.state)
  })
})

const holds = (probability: number): JudgeAnswer => ({
  type: 'choice',
  choice: 'holds',
  probabilities: { holds: probability },
})
const chose = (choice: string, probability = 0.99): JudgeAnswer => ({
  type: 'choice',
  choice,
  probabilities: { [choice]: probability },
})
const REFUSAL: JudgeAnswer = { type: 'refusal' }
const yes = (noul: number): JudgeAnswer => ({ type: 'noul', noul })

describe('GL-12 an answer short of the line, or refused, does not stand', () => {
  it.each([
    ['A3', holds(0.9), 'holds'],
    ['A3', holds(0.899), 'cannot-tell'],
    ['A3', { type: 'choice', choice: 'holds' }, 'cannot-tell'],
    ['A3', { type: 'choice', choice: 'holds', confidence: 0.95 }, 'holds'],
    ['A3', REFUSAL, 'cannot-tell'],
    ['A3', chose('fails', 0.4), 'fails'],
    ['A3', chose('stale'), 'stale'],
    ['A3', chose('no-evidence'), 'no-evidence'],
    ['N1', chose('kept', 0.9), 'kept'],
    ['N1', chose('kept', 0.89), 'unclear'],
    ['N1', chose('broken', 0.3), 'broken'],
    ['N1', chose('unclear'), 'unclear'],
    ['N1', REFUSAL, 'unclear'],
    ['X3', yes(0.9), 'yes'],
    ['X3', yes(0.89), 'no'],
    ['X3', REFUSAL, 'no'],
    ['U1', chose('blocked', 0.9), 'yes'],
    ['U1', chose('blocked', 0.89), 'no'],
    ['U1', chose('none', 0.99), 'no'],
    ['U1', REFUSAL, 'no'],
    ['U2', yes(0.95), 'yes'],
    ['U2', yes(0.5), 'no'],
    ['A3', yes(0.9), 'holds'],
    ['A3', yes(0.89), 'cannot-tell'],
    ['A3', yes(0.02), 'cannot-tell'],
  ] as const)('%s answered %o reads %s', (name, answer, reading) => {
    expect(readAnswer(name, answer as JudgeAnswer, 0.9)).toBe(reading)
  })
  it('moves with the line of the configuration', () => {
    expect(readAnswer('A3', holds(0.7), 0.6)).toBe('holds')
    expect(readAnswer('A3', holds(0.7), 0.8)).toBe('cannot-tell')
  })
})

const CLEAN: Record<string, JudgeAnswer> = {
  A3: holds(0.97),
  N1: chose('kept'),
  N2: chose('kept'),
  X3: yes(0.03),
}
const judged = (votes: readonly (readonly JudgeReply[])[], input = material(), how = config()) =>
  readJudge(input, how, packJudge(input, how), votes)

describe('a reply counts only whole', () => {
  const request = () => packJudge(material(), config()).requests[0]!
  it.each([
    ['every question answered', CLEAN, true],
    ['a refusal is an answer', { ...CLEAN, A3: REFUSAL }, true],
    ['no reply', null, false],
    ['a question missing', { A3: holds(1), N1: chose('kept'), N2: chose('kept') }, false],
    ['a yes or no where a choice was asked', { ...CLEAN, A3: yes(1) }, false],
    ['a choice where yes or no was asked', { ...CLEAN, X3: chose('kept') }, false],
    ['a choice that is not among the options', { ...CLEAN, N1: chose('holds') }, false],
    ['a choice without a choice', { ...CLEAN, A3: { type: 'choice' } }, false],
    ['a yes or no without its number', { ...CLEAN, X3: { type: 'noul' } }, false],
  ] as const)('%s', (_name, reply, valid) => {
    expect(validReply(request(), reply as JudgeReply)).toBe(valid)
  })
})

describe('the findings of one observation', () => {
  it('joins what the system settled with what the answers come to, and the verdict follows', () => {
    const findings = judged([[CLEAN]])
    expect(findings).toEqual({
      judge: 'answered',
      criteria: { A2: 'holds', A3: 'holds' },
      metrics: { M1: 780 },
      rules: { N1: 'kept', N2: 'kept' },
      exits: [],
      unattainable: false,
    })
    const input = material()
    const progress = { rounds: input.rounds, stalled: 0, gap: null }
    expect(rule(input.body, progress, findings)).toEqual({ row: 1 })
    const short = judged([[{ ...CLEAN, A3: holds(0.6) }]])
    expect(short.criteria.A3).toBe('cannot-tell')
    expect(rule(input.body, progress, short).row).toBe(9)
    expect(rule(input.body, progress, judged([[{ ...CLEAN, N1: chose('broken', 0.5) }]])).row).toBe(
      9,
    )
  })
  it('reports an exit the judge saw come about', () => {
    expect(judged([[{ ...CLEAN, X3: yes(0.95) }]]).exits).toEqual(['X3'])
  })
  it('is unavailable when a request has no whole reply, and keeps only what the system settled', () => {
    expect(judged([[null]])).toEqual({
      judge: 'unavailable',
      criteria: { A2: 'holds' },
      metrics: { M1: 780 },
      rules: {},
      exits: [],
      unattainable: false,
    })
    expect(judged([[{ A3: holds(1) }]]).judge).toBe('unavailable')
    expect(judged([]).judge).toBe('unavailable')
    const sections = config({ split: 'sections' })
    const [criteria, rules, exits] = [
      { A3: CLEAN.A3! },
      { N1: CLEAN.N1!, N2: CLEAN.N2! },
      { X3: CLEAN.X3! },
    ]
    expect(judged([[criteria, rules, exits]], material(), sections).judge).toBe('answered')
    expect(judged([[criteria, null, exits]], material(), sections).judge).toBe('unavailable')
  })
  it('is answered without a request when the system settled everything', () => {
    const draft: GoalDraft = { purpose: HOME.purpose, criteria: [HOME.criteria![1]!] }
    const input = material({ body: bodyOf(draft) })
    expect(judged([], input)).toMatchObject({ judge: 'answered', criteria: { A1: 'holds' } })
  })
  it('takes the reading most votes gave; a tie goes to the reading that claims least', () => {
    const three = config({ votes: 3 })
    const vote = (a3: JudgeAnswer, n1 = chose('kept'), x3 = yes(0.03)) => [
      { ...CLEAN, A3: a3, N1: n1, X3: x3 },
    ]
    const of = (...votes: (readonly JudgeReply[])[]) => judged(votes, material(), three)
    expect(of(vote(holds(1)), vote(holds(1)), vote(chose('fails'))).criteria.A3).toBe('holds')
    expect(of(vote(holds(1)), vote(chose('fails')), vote(chose('fails'))).criteria.A3).toBe('fails')
    expect(of(vote(holds(1)), vote(holds(0.5)), vote(chose('stale'))).criteria.A3).toBe('stale')
    expect(of(vote(holds(1)), vote(chose('fails')), [null]).criteria.A3).toBe('fails')
    expect(of(vote(holds(1)), [null], [null]).criteria.A3).toBe('holds')
    expect(of(vote(holds(1), chose('broken')), vote(holds(1)), [null]).rules.N1).toBe('broken')
    expect(of(vote(holds(1), chose('kept'), yes(1)), vote(holds(1)), [null]).exits).toEqual([])
    expect(
      of(
        vote(holds(1), chose('kept'), yes(1)),
        vote(holds(1), chose('kept'), yes(1)),
        vote(holds(1)),
      ).exits,
    ).toEqual(['X3'])
  })
  it('finds a dead end only when the block and the trying pass the line and a cited call is in the session', () => {
    const blockedBy = (tried: string[], u1: JudgeAnswer, u2: JudgeAnswer) => {
      const obstacle = { what: '连不上', tried, exit: null }
      const input = material({ progress: { ...PROGRESS, obstacle } })
      return judged([[{ ...CLEAN, U1: u1, U2: u2 }]], input).unattainable
    }
    expect(blockedBy(['call-54'], chose('blocked', 0.95), yes(0.95))).toBe(true)
    const obstacle = { what: '连不上', tried: ['call-54'], exit: null }
    const input = material({ progress: { ...PROGRESS, obstacle } })
    const dead = { ...CLEAN, U1: chose('blocked', 0.95), U2: yes(0.95) }
    expect(judged([[dead]], input).exits).toEqual([])
    expect(blockedBy(['call-54'], chose('forbidden', 0.95), yes(0.95))).toBe(true)
    expect(blockedBy(['call-54'], chose('none', 0.95), yes(0.95))).toBe(false)
    expect(blockedBy(['call-54'], chose('blocked', 0.5), yes(0.95))).toBe(false)
    expect(blockedBy(['call-54'], chose('blocked', 0.95), yes(0.5))).toBe(false)
    expect(blockedBy(['call-999'], chose('blocked', 0.95), yes(0.95))).toBe(false)
    expect(blockedBy([], chose('blocked', 0.95), yes(0.95))).toBe(false)
  })
})

describe('the three ways of asking the bench can switch on', () => {
  const instructing = (change: Partial<JudgeConfig['instructions']>): JudgeConfig =>
    config({ instructions: { ...BASELINE_JUDGE_CONFIG.instructions, ...change } })

  describe('a passing run after its check was written, asked as whether the check checks the statement', () => {
    const draft: GoalDraft = {
      purpose: HOME.purpose,
      criteria: [
        {
          statement: '端到端用例全过',
          evidence: { kind: 'command', command: 'pnpm test:e2e' },
          pass: { kind: 'exit-zero' },
        },
        { statement: '改动说明写了', evidence: { kind: 'file', path: 'CHANGELOG.md' } },
      ],
    }
    const first = WRITE(40, 'tests/home.spec.ts', 'test("a")\ntest("b")')
    const other = WRITE(41, 'tests/cart.spec.ts', 'test("cart")')
    const last = WRITE(42, 'tests/home.spec.ts', 'test("a")')
    const source = WRITE(43, 'src/home.ts', 'export {}')
    const calls = [first, other, last, source, CHANGELOG, E2E(54, 0)]
    const progress: Progress = {
      ...NO_PROGRESS,
      criteria: { A1: { status: 'claimed-done', refs: ['call-40', 'call-43'], note: '' } },
    }
    const asked = (how: JudgeConfig, more: Partial<JudgeMaterial> = {}) =>
      packJudge(material({ body: bodyOf(draft), calls, progress, ...more }), how)

    it('is one yes-or-no question by the number of the criterion, with the last draft of each check and the run', () => {
      const packed = asked(instructing({ unsettled: 'covers' }))
      expect(packed.decided).toEqual({})
      expect(packed.requests[0]?.questions['A1']).toEqual({
        type: 'noul',
        instructions: `判据 A1 ${CHECK_COVERS}`,
      })
      expect(CHECK_COVERS).toBe(
        '的命令最近一次运行退出码是 0。运行之前 agent 写过它所用的测试或基准（evidence 里带 changesCheck 的几次，同一个文件以最后一次为准）。这次通过可信吗？最后一稿里有实在的断言在检查，就答是；检查被跳过、断言被改成恒真或被掏空，或陈述点名要检查的事在测试里完全找不到，才答否。',
      )
      const parted = asked({ ...instructing({ unsettled: 'covers' }), split: 'sections' })
      expect(names(parted.requests)[0]).toEqual(['A1', 'A2'])
      expect(stateOf(parted).facts.activity).toBeUndefined()
      expect(packed.requests[0]?.questions['A2']?.type).toBe('choice')
      const { evidence } = stateOf(packed)
      expect(evidence['A1']?.map(item => item.ref)).toEqual(['call-41', 'call-42', 'call-54'])
      expect(evidence['A2']?.map(item => item.ref)).toEqual(['call-52'])
    })

    it('shows five checks at most, the latest ones, and leaves a run that went stale to the rule for stale evidence', () => {
      const many = Array.from({ length: 7 }, (_, at) =>
        WRITE(30 + at, `tests/t${String(at)}.spec.ts`),
      )
      const crowded = asked(instructing({ unsettled: 'covers' }), { calls: [...many, E2E(54, 0)] })
      expect(stateOf(crowded).evidence['A1']?.map(item => item.ref)).toEqual([
        'call-32',
        'call-33',
        'call-34',
        'call-35',
        'call-36',
        'call-54',
      ])
      const after = [last, E2E(54, 0), WRITE(60, 'src/home.ts')]
      const stale = asked(instructing({ unsettled: 'covers' }), { calls: after })
      expect(stale.requests[0]?.questions['A1']?.type).toBe('choice')
    })

    it('is a value the configuration schema takes, and old configurations without it read as the old way', () => {
      const { unsettled: _, ...old } = BASELINE_JUDGE_CONFIG.instructions
      const read = JudgeConfigSchema.parse({ ...BASELINE_JUDGE_CONFIG, instructions: old })
      expect(read.instructions.unsettled).toBe('criterion')
      const on = instructing({ unsettled: 'covers' })
      expect(JudgeConfigSchema.parse(on).instructions.unsettled).toBe('covers')
    })

    it('is asked the old way without the switch, and a run nothing put in doubt is still not asked', () => {
      const old = asked(instructing({}))
      expect(old.requests[0]?.questions['A1']?.type).toBe('choice')
      expect(stateOf(old).evidence['A1']?.map(item => item.ref)).toContain('call-40')
      const clean = asked(instructing({ unsettled: 'covers' }), { calls: [source, E2E(54, 0)] })
      expect(clean.decided).toEqual({ A1: 'holds' })
    })

    it('comes to holds only over the line, and never to anything but holds or cannot tell', () => {
      const how = instructing({ unsettled: 'covers' })
      const input = material({ body: bodyOf(draft), calls, progress })
      const rest = { A2: holds(0.97), N1: chose('kept'), X1: yes(0.03) }
      const read = (answer: JudgeAnswer) =>
        readJudge(input, how, packJudge(input, how), [[{ ...rest, A1: answer }]]).criteria.A1
      expect(Object.keys(packJudge(input, how).requests[0]?.questions ?? {})).toEqual(
        expect.arrayContaining(['A1', 'A2']),
      )
      expect(read(yes(0.95))).toBe('holds')
      expect(read(yes(0.5))).toBe('cannot-tell')
      expect(read(REFUSAL)).toBe('cannot-tell')
      expect(validReply(packJudge(input, how).requests[0]!, { ...rest, A1: holds(0.99) })).toBe(
        false,
      )
    })
  })

  it('are on in the default scheme, which differs from the baseline in what the bench earned and nothing else', () => {
    const { instructions, packaging, ...rest } = DEFAULT_JUDGE_CONFIG
    const { instructions: was, packaging: packed, ...before } = BASELINE_JUDGE_CONFIG
    expect(rest).toEqual(before)
    expect(instructions).toEqual({
      ...was,
      exits: 'guided',
      unattainable: 'plain',
      unsettled: 'covers',
    })
    expect(packaging).toEqual({
      ...packed,
      staleness: 'decided',
      activity: 'all',
      flags: 'guarded',
      drafts: 'superseded',
    })
    expect(JudgeConfigSchema.parse(DEFAULT_JUDGE_CONFIG)).toEqual(DEFAULT_JUDGE_CONFIG)
  })

  it('leaves the baseline scheme as it was measured: every value of it, each one the schema takes', () => {
    expect(BASELINE_JUDGE_CONFIG).toEqual({
      split: 'one',
      instructions: {
        criterion: 'rendered',
        rules: [],
        exits: 'statement',
        unattainable: 'kind',
        unsettled: 'criterion',
      },
      packaging: {
        excerpt: 2000,
        take: 'both',
        notes: true,
        staleness: 'marked',
        activity: 'lines',
        flags: 'keys',
        drafts: 'later',
        reply: 'call',
      },
      model: 'openai/gpt-6-luna-decisions',
      line: 0.9,
      votes: 1,
    })
    expect(JudgeConfigSchema.parse(BASELINE_JUDGE_CONFIG)).toEqual(BASELINE_JUDGE_CONFIG)
    const noted = packaging({ flags: 'notes' })
    expect(JudgeConfigSchema.parse(noted)).toEqual(noted)
  })

  it('keeps asking as before for a configuration written before they were there', () => {
    const { exits, unattainable, ...instructions } = BASELINE_JUDGE_CONFIG.instructions
    const { drafts, reply, ...old } = BASELINE_JUDGE_CONFIG.packaging
    const parsed = JudgeConfigSchema.parse({
      ...BASELINE_JUDGE_CONFIG,
      instructions,
      packaging: old,
    })
    expect([exits, unattainable, drafts, reply]).toEqual(['statement', 'kind', 'later', 'call'])
    expect(parsed).toEqual(BASELINE_JUDGE_CONFIG)
  })

  it('says of what the agent said last what it is: in its name, or in a note beside it, when so configured', () => {
    const said = call(60, { ref: REPLY_REF, tool: 'Reply', output: '加了一条，在「未发布」下面。' })
    const progress = {
      ...PROGRESS,
      criteria: { ...PROGRESS.criteria, A3: { ...PROGRESS.criteria.A3!, refs: [REPLY_REF] } },
    }
    const input = material({ calls: [CHANGELOG, E2E(54, 0), said], progress })
    type Item = { ref: string; tool: string; note?: string }
    const shown = (how: JudgeConfig) => {
      const state = stateOf(packJudge(input, how))
      const item = (state.evidence['A3'] as unknown as Item[]).find(
        entry => entry.ref === REPLY_REF,
      )
      return { tool: item?.tool, note: item?.note, line: state.facts.activity?.at(-1) }
    }
    expect(shown(config())).toEqual({ tool: 'Reply', note: undefined, line: 'reply Reply' })
    expect(shown(packaging({ reply: 'named' }))).toEqual({
      tool: REPLY_NAME,
      note: undefined,
      line: `reply ${REPLY_NAME}`,
    })
    expect(shown(packaging({ reply: 'noted' }))).toEqual({
      tool: 'Reply',
      note: REPLY_NOTE,
      line: 'reply Reply',
    })
    const other = call(61, { ref: 'call-61', tool: 'Reply', output: 'x' })
    const state = stateOf(packJudge(material({ calls: [other] }), packaging({ reply: 'named' })))
    expect(state.facts.activity).toEqual(['call-61 Reply'])
  })

  it('names an earlier draft of the same file as superseded by the latest write, not as possibly out of date', () => {
    const progress = {
      ...PROGRESS,
      criteria: { A3: { status: 'doing', refs: ['call-50'], note: '' } },
    } as Progress
    const calls = [
      WRITE(50, 'CHANGELOG.md'),
      WRITE(51, 'CHANGELOG.md'),
      CHANGELOG,
      WRITE(53, 'CHANGELOG.md'),
    ]
    const input = material({ calls, progress })
    const drafts = packaging({ drafts: 'superseded', flags: 'notes' })
    const items = stateOf(packJudge(input, drafts)).evidence.A3 as Record<string, unknown>[]
    expect(items.map(item => [item.ref, item.supersededBy, item.laterWrites])).toEqual([
      ['call-50', 'call-53', undefined],
      ['call-53', undefined, undefined],
    ])
    expect(items[0]?.note).toBe(FLAG_NOTES.superseded)
    expect(items[1]).not.toHaveProperty('note')
  })

  it('says of a later write that it matters only when it can change the result, when the flags are guarded', () => {
    const calls = [CHANGELOG, E2E(54, 0), WRITE(55, 'src/home.tsx')]
    const noted = (flags: 'notes' | 'guarded') =>
      (
        stateOf(packJudge(material({ calls }), packaging({ flags }))).evidence.A2![0] as {
          note?: string
        }
      ).note
    expect(noted('notes')).toBe(FLAG_NOTES.later)
    expect(noted('guarded')).toBe(FLAG_NOTES.laterGuarded)
    expect(FLAG_NOTES.laterGuarded).not.toBe(FLAG_NOTES.later)
  })

  it('hangs no later write on an item that is itself a write, and says of a changed check that adding one changes nothing', () => {
    const added = WRITE(53, 'tests/e2e/home.spec.ts', '+ expect(ms).toBeLessThan(800)')
    const calls = [CHANGELOG, added, E2E(54, 0), WRITE(55, 'src/home.tsx')]
    const before = stateOf(packJudge(material({ calls }), packaging({ flags: 'notes' }))).evidence
    expect(before.A2![0]).toMatchObject({ ref: 'call-53', laterWrites: ['src/home.tsx'] })
    const careful = packaging({ flags: 'guarded', drafts: 'superseded' })
    const [check, ran] = stateOf(packJudge(material({ calls }), careful)).evidence.A2 as {
      ref: string
      note?: string
      laterWrites?: string[]
    }[]
    expect(check).toMatchObject({ ref: 'call-53', note: FLAG_NOTES.checkGuarded })
    expect(check).not.toHaveProperty('laterWrites')
    expect(ran).toMatchObject({ ref: 'call-54', laterWrites: ['src/home.tsx'] })
    expect(ran?.note).toBe(FLAG_NOTES.laterGuarded)
  })

  it('still marks a write after a command ran as a later write, whichever way drafts are named', () => {
    const calls = [CHANGELOG, E2E(54, 0), WRITE(55, 'src/home.tsx')]
    const state = stateOf(packJudge(material({ calls }), packaging({ drafts: 'superseded' })))
    expect(state.evidence.A2?.[0]).toMatchObject({ laterWrites: ['src/home.tsx'] })
    expect(state.evidence.A2?.[0]).not.toHaveProperty('supersededBy')
  })

  it('says with an exit question what counts as the case having come about, when so configured', () => {
    const plain = packJudge(material(), config()).requests[0]!.questions.X3
    expect(plain?.instructions).toBe('退出 X3 写的情形出现了没有：要改公共接口才能达标')
    expect(EXIT_GUIDE).toContain('工具输出直接显示这个情形时答是')
    const guided = packJudge(material(), instructing({ exits: 'guided' })).requests[0]!.questions.X3
    expect(guided?.instructions).toBe(
      `退出 X3 写的情形出现了没有：要改公共接口才能达标。${EXIT_GUIDE}`,
    )
  })

  it('asks whether there is a dead end as a plain yes or no, and reads it over the line like the kinds', () => {
    const obstacle = { what: '测试环境连不上', tried: ['call-54'], exit: null }
    const input = material({ progress: { ...PROGRESS, obstacle } })
    const plainly = instructing({ unattainable: 'plain' })
    const packed = packJudge(input, plainly)
    const asked = packed.requests[0]!.questions
    expect(asked.U1).toEqual({ type: 'noul', instructions: DEAD_END_PLAIN })
    expect(DEAD_END_PLAIN).toContain('让目标达不成的阻碍')
    expect(asked.U2?.type).toBe('noul')
    const reply = (blocked: number) => ({
      A3: { type: 'choice', choice: 'holds', probabilities: { holds: 0.99 } },
      N1: { type: 'choice', choice: 'kept', probabilities: { kept: 0.99 } },
      N2: { type: 'choice', choice: 'kept', probabilities: { kept: 0.99 } },
      X3: { type: 'noul', noul: 0 },
      U1: { type: 'noul', noul: blocked },
      U2: { type: 'noul', noul: 1 },
    })
    const read = (blocked: number) =>
      readJudge(input, plainly, packed, [[reply(blocked) as never]]).unattainable
    expect([read(0.95), read(0.89), read(0)]).toEqual([true, false, false])
  })
})
