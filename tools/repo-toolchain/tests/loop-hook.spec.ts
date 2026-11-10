// 收工钩子的判断：放行的几种情形、反馈文字、条数与字数上限、只报比上一次新出现或变差的、出错不拦人但给用户一句警告。
// 外部动作全用替身（hook.ts 的 HookDeps）；入口与线程在 loop-stop-hook.spec.ts 用临时仓库测。
import { describe, expect, it } from 'vitest'
import type { HookConfig } from '../src/loop/config.ts'
import {
  findingsOf,
  newOrWorse,
  parseHookInput,
  parseState,
  record,
  renderReason,
  renderWarning,
  stopHook,
  type HookDeps,
  type HookReadings,
  type LastReading,
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

const site = (path: string, line: number) => ({ path, line, specifier: '@omne-harness/b' })

/** 五类各一条，外加一个只超 warn 的函数（不该出现）。 */
const readings = (): HookReadings => ({
  alert: 12,
  hardLines: {
    direction: [
      {
        kind: 'dependency-rule',
        rule: 'capability-not-sdk',
        message:
          '[capability-not-sdk] packages/core/a/src/x.ts 依赖了 packages/access/sdk/src/index.ts',
        sites: [site('packages/core/a/src/x.ts', 3)],
        edges: [{ from: 'packages/core/a', to: 'packages/access/sdk' }],
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
  readonly toolRoot?: string
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
    toolRoot: () => over.toolRoot,
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
        '收工前的结构读数（事实，不是指令）。这次编辑新增或变差了下面几处落在线外的读数：',
        '- ✗ 硬线 · 依赖违规：[capability-not-sdk] packages/core/a/src/x.ts 依赖了 packages/access/sdk/src/index.ts（packages/core/a/src/x.ts:3）',
        '- 超过 alert 的函数：apps/cli/src/x.ts:47 runCli 圈复杂度 35（alert 12），原 34',
        '- 新增的跨成员依赖：packages/a → packages/b（packages/a/src/y.ts:3）',
        '- 新增的稳定依赖不稳定的边：packages/a（I 0.25）→ packages/b（I 0.50）（packages/a/src/y.ts:3）',
        '- 没有断言的测试用例：packages/a/tests/z.spec.ts:10 「不断言」',
        '这些要在交付说明里逐条交代：已处理，或保留及理由。提醒过、之后没再变差的不再列。',
        '完整输出：pnpm run loop:status --base <任务基线>',
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

  it('只报比上一次新出现的：同样的读数再来不出声；多了一项只列那一项；另一棵树或另一条分支按它自己的上一次', async () => {
    const shared = fakes({})
    expect(await stopHook(STOP, shared.deps)).toBeDefined()
    expect(await stopHook(STOP, shared.deps)).toBeUndefined()

    const more = readings()
    const grown: HookReadings = {
      ...more,
      explain: { ...more.explain, functions: [...more.explain.functions, fn({ name: 'another' })] },
    }
    const output = await stopHook(STOP, { ...shared.deps, measure: async () => grown })
    const reason = (JSON.parse(output ?? '{}') as { reason?: string }).reason ?? ''
    expect(reason.split('\n').filter(line => line.startsWith('- '))).toEqual([
      '- 超过 alert 的函数：apps/cli/src/x.ts:47 another 圈复杂度 35（alert 12），原 34',
    ])

    const otherBranch = {
      ...shared.deps,
      repository: () => ({ root: '/work', branch: 'b2', home: '/home' }),
    }
    expect(await stopHook(STOP, otherBranch)).toBeDefined()
    const otherTree = {
      ...shared.deps,
      repository: () => ({ root: '/w2', branch: 'someone/x', home: '/home' }),
    }
    expect(await stopHook(STOP, otherTree)).toBeDefined()
    expect(
      parseState(shared.store.state).readings.map(entry => [entry.root, entry.branch]),
    ).toEqual([
      ['/work', 'someone/x'],
      ['/work', 'b2'],
      ['/w2', 'someone/x'],
    ])
  })

  it('同一个函数的圈复杂度比上一次涨了：再报；没涨或降了：不报', async () => {
    const at = (complexity: number): HookReadings => {
      const base = readings()
      return { ...base, explain: { ...base.explain, functions: [fn({ complexity })] } }
    }
    const shared = fakes({ readings: at(35) })
    expect(await stopHook(STOP, shared.deps)).toBeDefined()
    expect(await stopHook(STOP, { ...shared.deps, measure: async () => at(35) })).toBeUndefined()
    const worse = await stopHook(STOP, { ...shared.deps, measure: async () => at(36) })
    expect((JSON.parse(worse ?? '{}') as { reason?: string }).reason).toContain(
      '- 超过 alert 的函数：apps/cli/src/x.ts:47 runCli 圈复杂度 36（alert 12），原 34\n这些',
    )
    expect(await stopHook(STOP, { ...shared.deps, measure: async () => at(33) })).toBeUndefined()
  })

  it('修掉又改回来：中间那次读数里没有它，改回来算新出现，再报', async () => {
    const shared = fakes({})
    expect(await stopHook(STOP, shared.deps)).toBeDefined()
    const base = readings()
    const fixed: HookReadings = { ...base, hardLines: { direction: [], cycles: [] } }
    expect(await stopHook(STOP, { ...shared.deps, measure: async () => fixed })).toBeUndefined()
    const again = await stopHook(STOP, shared.deps)
    expect((JSON.parse(again ?? '{}') as { reason?: string }).reason).toContain('✗ 硬线 · 依赖违规')
  })

  it('读数不变时不重写状态；变了才写', async () => {
    const shared = fakes({})
    await stopHook(STOP, shared.deps)
    const written = shared.store.state
    let writes = 0
    await stopHook(STOP, {
      ...shared.deps,
      writeState: () => {
        writes += 1
      },
    })
    expect(writes).toBe(0)
    expect(shared.store.state).toBe(written)
  })

  it('跑的钩子不在被量的那棵树里（退回到别的检出）：不量，只给用户一句「量不了」；同一棵树照常量', async () => {
    const foreign = fakes({ toolRoot: '/main' })
    const output = await stopHook(STOP, foreign.deps)
    expect(Object.keys(JSON.parse(output ?? '{}') as object)).toEqual(['systemMessage'])
    expect(output).toContain('跑的是 /main 里的收工钩子，量的却是 /work')
    expect(output).toContain('量不了')
    expect(foreign.calls.measure).toBe(0)
    expect(foreign.store.state).toBeUndefined()
    const own = fakes({ toolRoot: '/work' })
    expect(await stopHook(STOP, own.deps)).toContain('"decision":"block"')
    expect(own.calls.measure).toBe(1)
  })

  it('行号变了不算新；位置或类别变了算新', () => {
    const before = readings()
    const only = (row: ExplainedFunction) =>
      findingsOf({ ...before, explain: { ...before.explain, functions: [row] } })
    const last: LastReading = {
      root: '/work',
      branch: 'b',
      at: 't',
      findings: only(fn({})).map(({ key, amount }) => ({
        key,
        ...(amount === undefined ? {} : { amount }),
      })),
    }
    expect(newOrWorse(only(fn({ line: 90, endLine: 140 })), last)).toEqual([])
    expect(newOrWorse(only(fn({ name: 'other' })), last).map(row => row.key)).toContain(
      'function\u0000apps/cli/src/x.ts\u0000other',
    )
    expect(newOrWorse(only(fn({})), undefined)).toEqual(only(fn({})))
  })

  it('函数那一行末尾补与基线比的说明；比上一次只看类别、位置与圈复杂度，不看说明', () => {
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
    const seen = (row: ExplainedFunction) =>
      findingsOf(only(row)).map(({ key, amount }) => ({ key, amount }))
    expect(seen(fn({ againstBase: { kind: 'new', reason: 'new-function' } }))).toEqual(
      seen(fn({ againstBase: { kind: 'worse', baseline: 20 } })),
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

  it('状态按工作树与分支各留一条，条数有上限，超了丢最旧的；不合约定的状态文件算钩子出错', () => {
    let state = parseState(undefined)
    for (let i = 0; i < 5; i += 1)
      state = record(state, { root: `/t${i}`, branch: 'b', at: 't', findings: [] }, 3)
    expect(state.readings.map(entry => entry.root)).toEqual(['/t2', '/t3', '/t4'])
    state = record(state, { root: '/t3', branch: 'b', at: 'u', findings: [{ key: 'k' }] }, 3)
    expect(state.readings.map(entry => [entry.root, entry.at])).toEqual([
      ['/t2', 't'],
      ['/t4', 't'],
      ['/t3', 'u'],
    ])
    expect(parseState(JSON.stringify(state))).toEqual(state)
    expect(() =>
      parseState('{"reported": [{"branch": "b", "fingerprint": "f", "at": "t"}]}'),
    ).toThrow('不合约定')
    expect(() =>
      parseState(
        '{"readings": [{"root": "/t", "branch": "b", "at": "t", "findings": [{"key": 1}]}]}',
      ),
    ).toThrow('不合约定')
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
