// 收工钩子的判断：放行的几种情形、反馈文字、条数与字数上限、同一组读数只反馈一次、出错不拦人但给用户一句警告。
// 外部动作全用替身（hook.ts 的 HookDeps）；入口与线程在 loop-stop-hook.spec.ts 用临时仓库测。
import { describe, expect, it } from 'vitest'
import type { HookConfig } from '../src/loop/config.ts'
import {
  fingerprintOf,
  findingsOf,
  parseHookInput,
  parseState,
  remember,
  renderReason,
  renderWarning,
  stopHook,
  type HookDeps,
  type HookReadings,
} from '../src/loop/hook.ts'
import type { ExplainedFunction } from '../src/loop/against-base.ts'

/** 一个碰过、比基线涨了的函数（原 34 → 现 35）。 */
const fn = (over: Partial<ExplainedFunction>): ExplainedFunction => ({
  path: 'apps/cli/src/x.ts',
  member: 'apps/cli',
  name: 'runCli',
  line: 47,
  endLine: 90,
  complexity: 35,
  score: 35,
  level: 'alert',
  grade: 1,
  changed: true,
  againstBase: { kind: 'worse', baseline: 34 },
  ...over,
})

const site = (path: string, line: number) => ({ path, line, specifier: '@omne-harness-lite/b' })

/** 五类各一条，外加一个只超 warn 的函数（不该出现）。 */
const readings = (): HookReadings => ({
  alert: 12,
  hardLines: {
    direction: [
      {
        kind: 'outward-dependency',
        message: 'packages/core/a 依赖了更外层的 packages/infra/b',
        sites: [site('packages/core/a/src/x.ts', 3)],
        edges: [{ from: 'packages/core/a', to: 'packages/infra/b' }],
      },
    ],
    cycles: [],
  },
  explain: {
    functions: [fn({}), fn({ name: 'mild', level: 'warn', complexity: 11, score: 11 })],
    functionsNotWorse: [],
    newEdges: {
      status: 'data',
      data: [{ from: 'packages/a', to: 'packages/b', site: site('packages/a/src/y.ts', 3) }],
    },
    newStableOnUnstable: {
      status: 'data',
      data: [
        {
          from: 'packages/a',
          fromInstability: 0.25,
          to: 'packages/b',
          toInstability: 0.5,
          site: site('packages/a/src/y.ts', 3),
        },
      ],
    },
    casesWithoutAssertions: {
      status: 'data',
      data: [{ path: 'packages/a/tests/z.spec.ts', line: 10, name: '不断言' }],
    },
  },
})

const HOOK: HookConfig = {
  enabled: true,
  maxItems: 12,
  maxChars: 4000,
  timeoutSeconds: 40,
  stateLimit: 200,
}

/** 替身：状态与日志记在内存里，调用次数可查。 */
function fakes(over: {
  readonly readings?: HookReadings | undefined
  readonly branch?: string
  readonly config?: Partial<HookConfig>
  readonly env?: NodeJS.ProcessEnv
  readonly measure?: HookDeps['measure']
}) {
  const calls = { measure: 0, repository: 0 }
  const store: { state?: string; log: string[] } = { log: [] }
  const value = 'readings' in over ? over.readings : readings()
  const deps: HookDeps = {
    env: over.env ?? {},
    cwd: '/work',
    now: () => new Date('2026-10-01T12:00:00Z'),
    config: () => ({ ...HOOK, ...over.config, primaryBranch: 'main' }),
    repository: () => {
      calls.repository += 1
      return { root: '/work', branch: over.branch ?? 'someone/x', home: '/home' }
    },
    measure:
      over.measure ??
      (async () => {
        calls.measure += 1
        return value
      }),
    readState: () => store.state,
    writeState: (_home, text) => {
      store.state = text
    },
    log: (_home, line) => {
      store.log.push(line)
    },
  }
  return { deps, calls, store }
}

const STOP = JSON.stringify({ stop_hook_active: false, cwd: '/work' })

describe('收工钩子的判断', () => {
  it('有红项时反馈恰好一个 JSON 对象，只有 decision 与 reason；文字逐字如下', async () => {
    const { deps } = fakes({})
    const output = await stopHook(STOP, deps)
    expect(output).toBeDefined()
    const parsed = JSON.parse(output ?? '') as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['decision', 'reason'])
    expect(parsed['decision']).toBe('block')
    expect(parsed['reason']).toBe(
      [
        '收工前的结构读数（事实，不是指令）。这次变更里有下面几处读数落在线外：',
        '- ✗ 硬线 · 方向违规：packages/core/a 依赖了更外层的 packages/infra/b（packages/core/a/src/x.ts:3）',
        '- 超过 alert 的函数：apps/cli/src/x.ts:47 runCli 圈复杂度 35（alert 12），原 34',
        '- 新增的跨成员依赖：packages/a → packages/b（packages/a/src/y.ts:3）',
        '- 新增的稳定依赖不稳定的边：packages/a（I 0.25）→ packages/b（I 0.50）（packages/a/src/y.ts:3）',
        '- 没有断言的测试用例：packages/a/tests/z.spec.ts:10 「不断言」',
        '这些要在交付说明里逐条交代：已处理，或保留及理由。同一组读数不会再提醒第二次。',
        '完整输出：make loop-status BASE=<任务基线>',
      ].join('\n'),
    )
  })

  it('stop_hook_active 为 true（这次收工已因钩子续跑过）：放行，连仓库都不找', async () => {
    const { deps, calls } = fakes({})
    expect(await stopHook(JSON.stringify({ stop_hook_active: true }), deps)).toBeUndefined()
    expect(calls.repository).toBe(0)
  })

  it('没碰产品源码：放行，不写状态', async () => {
    const { deps, calls, store } = fakes({ readings: undefined })
    expect(await stopHook(STOP, deps)).toBeUndefined()
    expect(calls.measure).toBe(1)
    expect(store.state).toBeUndefined()
  })

  it('碰了但没有红项：放行', async () => {
    const empty: HookReadings = {
      alert: 12,
      hardLines: { direction: [], cycles: [] },
      explain: {
        functions: [fn({ level: 'warn' })],
        functionsNotWorse: [fn({ name: 'old', againstBase: { kind: 'not-worse', baseline: 35 } })],
        newEdges: { status: 'data', data: [] },
        newStableOnUnstable: { status: 'no-data', reason: '配置里关了' },
        casesWithoutAssertions: { status: 'no-data', reason: '成员里没有测试文件' },
      },
    }
    expect(await stopHook(STOP, fakes({ readings: empty }).deps)).toBeUndefined()
  })

  it('配置里关了、或环境变量 OMNE_LOOP_HOOK=off：什么都不做', async () => {
    const off = fakes({ config: { enabled: false } })
    expect(await stopHook(STOP, off.deps)).toBeUndefined()
    expect(off.calls.measure).toBe(0)
    const env = fakes({ env: { OMNE_LOOP_HOOK: 'off' } })
    expect(await stopHook(STOP, env.deps)).toBeUndefined()
    expect(env.calls.repository).toBe(0)
  })

  it('解析不了、不是对象的输入：放行', async () => {
    const { deps, calls } = fakes({})
    for (const text of ['', 'not json', '[1]', 'null', '"text"'])
      expect(await stopHook(text, deps)).toBeUndefined()
    expect(calls.repository).toBe(0)
    expect(parseHookInput('{"stop_hook_active":true,"cwd":"/x"}')).toEqual({
      stopHookActive: true,
      cwd: '/x',
    })
  })

  it('同一分支上同一组读数只反馈一次；换了分支、多了一项都再报', async () => {
    const shared = fakes({})
    expect(await stopHook(STOP, shared.deps)).toBeDefined()
    expect(await stopHook(STOP, shared.deps)).toBeUndefined()

    const other = {
      ...shared.deps,
      repository: () => ({ root: '/w', branch: 'b2', home: '/home' }),
    }
    expect(await stopHook(STOP, other)).toBeDefined()

    const more = readings()
    const grown: HookReadings = {
      ...more,
      explain: { ...more.explain, functions: [...more.explain.functions, fn({ name: 'another' })] },
    }
    expect(await stopHook(STOP, { ...shared.deps, measure: async () => grown })).toBeDefined()
    expect(parseState(shared.store.state).reported).toHaveLength(3)
  })

  it('行号变了指纹不变；位置或类别变了指纹就变', () => {
    const before = readings()
    const moved: HookReadings = {
      ...before,
      explain: {
        ...before.explain,
        functions: [fn({ line: 90, endLine: 140, complexity: 40 })],
      },
    }
    const same = fingerprintOf(
      findingsOf({ ...before, explain: { ...before.explain, functions: [fn({})] } }),
    )
    expect(fingerprintOf(findingsOf(moved))).toBe(same)
    const renamed: HookReadings = {
      ...before,
      explain: { ...before.explain, functions: [fn({ name: 'other' })] },
    }
    expect(fingerprintOf(findingsOf(renamed))).not.toBe(same)
  })

  it('函数那一行末尾补与基线比的说明；指纹不看它（只看类别与位置）', () => {
    const base = readings()
    const only = (row: ExplainedFunction): HookReadings => ({
      ...base,
      hardLines: { direction: [], cycles: [] },
      explain: {
        ...base.explain,
        functions: [row],
        newEdges: { status: 'data', data: [] },
        newStableOnUnstable: { status: 'data', data: [] },
        casesWithoutAssertions: { status: 'data', data: [] },
      },
    })
    const texts = (row: ExplainedFunction) => findingsOf(only(row)).map(finding => finding.text)
    const head = '超过 alert 的函数：apps/cli/src/x.ts:47 runCli 圈复杂度 35（alert 12）'
    expect(texts(fn({ againstBase: { kind: 'new', reason: 'new-function' } }))).toEqual([
      `${head}，新出现`,
    ])
    expect(texts(fn({ againstBase: { kind: 'new', reason: 'new-file' } }))).toEqual([
      `${head}，新出现（新文件）`,
    ])
    expect(texts(fn({ againstBase: { kind: 'unsure', reason: '基线文本取不到' } }))).toEqual([
      `${head}，拿不准，照列：基线文本取不到`,
    ])
    const fingerprint = (row: ExplainedFunction) => fingerprintOf(findingsOf(only(row)))
    expect(fingerprint(fn({ againstBase: { kind: 'new', reason: 'new-function' } }))).toBe(
      fingerprint(fn({ complexity: 36, againstBase: { kind: 'worse', baseline: 20 } })),
    )
  })

  it('条数多于 maxItems：列前若干条并写「另有 N 条」；放不下 maxChars 就再少列', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ key: `k${i}`, text: `第 ${i} 条` }))
    const capped = renderReason(many, { maxItems: 12, maxChars: 4000 })
    expect(capped).toContain('- 第 11 条\n- 另有 3 条\n')
    expect(capped).not.toContain('第 12 条')
    const tight = renderReason(many, { maxItems: 12, maxChars: 150 })
    expect(tight.length).toBeLessThanOrEqual(150)
    expect(tight).toMatch(/- 另有 \d+ 条/u)
    expect(renderReason(many, { maxItems: 12, maxChars: 10 })).toHaveLength(10)
  })

  it('状态条数有上限，超了丢最旧的；不合约定的状态文件算钩子出错', () => {
    let state = parseState(undefined)
    for (let i = 0; i < 5; i += 1)
      state = remember(state, { branch: 'b', fingerprint: `f${i}`, at: 't' }, 3)
    expect(state.reported.map(entry => entry.fingerprint)).toEqual(['f2', 'f3', 'f4'])
    expect(() => parseState('{"reported": [{"branch": 1}]}')).toThrow('不合约定')
  })

  it('量的时候出错或超时：不拦，往日志追加一行，并给用户恰好一句警告；写日志也失败照样不拦', async () => {
    const failing = fakes({
      measure: async () => {
        throw new Error('量读数超过 40 秒，已放弃')
      },
    })
    const warning =
      '{"systemMessage":"收工钩子没能量出这次变更的结构读数，所以没有反馈，agent 照常收工。' +
      '原因：量读数超过 40 秒，已放弃（全文在 /home/hook.log）"}'
    expect(await stopHook(STOP, failing.deps)).toBe(warning)
    expect(failing.store.log).toEqual(['2026-10-01T12:00:00.000Z /work 量读数超过 40 秒，已放弃'])
    expect(failing.store.state).toBeUndefined()
    const noLog: HookDeps = {
      ...failing.deps,
      log: () => {
        throw new Error('磁盘满了')
      },
    }
    expect(await stopHook(STOP, noLog)).toBe(warning)
  })

  it('警告里的原因压成一行、最多引 300 个字符；全文只在日志里', async () => {
    const long = `第一行\n${'长'.repeat(400)}`
    const failing = fakes({
      measure: async () => {
        throw new Error(long)
      },
    })
    const parsed = JSON.parse((await stopHook(STOP, failing.deps)) ?? '') as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['systemMessage'])
    expect(parsed['systemMessage']).toContain(`原因：第一行 ${'长'.repeat(296)}…（全文在`)
    expect(failing.store.log[0]).toContain('长'.repeat(400))
    expect(renderWarning('短', '/h')).toContain('原因：短（全文在 /h/hook.log）')
  })
})

describe('complete neutral assembly output', () => {
  it('retains large fact lists without spreading them into function arguments', () => {
    const basic = readings()
    const added = Array.from({ length: 150_000 }, (_, index) => ({
      id: `fact-${index}`,
      member: 'packages/core/example',
      plugin: 'large',
      scope: 'top',
      kind: 'injects' as const,
      key: `dependency-${index}`,
      path: 'packages/core/example/src/index.ts',
      line: 1,
    }))
    const result = findingsOf({
      ...basic,
      explain: {
        ...basic.explain,
        assemblyDelta: { status: 'data', data: { added, removed: [], changed: [] } },
      },
    })
    const neutral = result.filter(row => row.key.startsWith('["assembly","added",'))
    expect(result).toHaveLength(findingsOf(basic).length + added.length)
    expect(neutral).toHaveLength(added.length)
    expect(neutral[0]?.text).toContain('dependency-0')
    expect(neutral.at(-1)?.text).toContain('dependency-149999')
    expect(result[0]?.text).toContain('硬线')
  })
})
