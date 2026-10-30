import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { countPending } from '../src/loop/catalogue.ts'
import { readLoopConfig } from '../src/loop/config.ts'
import {
  catalogueBlock,
  commitsBlock,
  debtBlock,
  parseCommitLog,
  parseLedgerRun,
  sensorsBlock,
  testsBlock,
  type Health,
} from '../src/loop/health.ts'
import {
  healthSummary,
  renderHealthPage,
  SECTION_TITLES,
  sparkline,
} from '../src/loop/health-render.ts'
import { data, noData } from '../src/loop/reading.ts'
import type { Snapshot } from '../src/loop/trend.ts'

const local = (...parts: [number, number, number, number?, number?]) =>
  new Date(parts[0], parts[1] - 1, parts[2], parts[3] ?? 0, parts[4] ?? 0)

const config = readLoopConfig()

describe('提交与合并的大小', () => {
  // `git log --format=%x00%H%x09%s --name-only` 的形状：每个提交以 NUL 起头，标题行后空一行再列文件。
  const log = [
    '\u0000a1\tfirst\n\nx.ts\n',
    '\u0000b2\tsecond\twith tab\n\nx.ts\ny.ts\nz.ts\nw.ts\nv.ts\n',
    '\u0000c3\tempty\n',
    '\u0000d4\tfourth\n\nx.ts\ny.ts',
  ].join('')

  it('每个提交的文件数；中位数取较小的那个；最大的三个从多到少', () => {
    const commits = parseCommitLog(log)
    expect(commits).toEqual([
      { sha: 'a1', subject: 'first', files: 1 },
      { sha: 'b2', subject: 'second\twith tab', files: 5 },
      { sha: 'c3', subject: 'empty', files: 0 },
      { sha: 'd4', subject: 'fourth', files: 2 },
    ])
    const block = commitsBlock(commits, 'main')
    if (block.status !== 'data') throw new Error(block.reason)
    expect(block.data).toMatchObject({ count: 4, medianFiles: 1, maxFiles: 5 })
    expect(block.data.largest.map(commit => commit.sha)).toEqual(['b2', 'd4', 'a1'])
  })

  it('一个提交都没有：没有数据', () => {
    expect(commitsBlock([], 'main')).toEqual(noData('main 上没有提交'))
  })
})

describe('测试耗时', () => {
  const ledger = (base: unknown, startedAt: string, wallSeconds: number, exitCodes: number[]) => ({
    meta: { head: 'h'.repeat(40), branch: 'main', dirty: false, base, startedAt, wallSeconds },
    members: exitCodes.map(exitCode => ({ member: 'm', exitCode })),
  })

  it('只取全量运行（meta.base 为 null），按开始时间取最近几次；有成员非零即有失败', () => {
    const ledgers = [
      { path: 'a', value: ledger(null, '2026-10-01T10:00:00Z', 600, [0, 0]) },
      { path: 'b', value: ledger({ ref: 'main' }, '2026-10-01T11:00:00Z', 20, [0]) },
      { path: 'c', value: ledger(null, '2026-10-01T09:00:00Z', 650, [0]) },
      { path: 'd', value: ledger(null, '2026-10-01T12:00:00Z', 700, [0, 1]) },
      { path: 'e', value: undefined },
      { path: 'f', value: { meta: {} } },
    ]
    const read = testsBlock(ledgers, 2, 'home')
    if (read.status !== 'data') throw new Error(read.reason)
    expect(read.data.runs.map(run => [run.wallSeconds, run.passed])).toEqual([
      [600, true],
      [700, false],
    ])
    expect(read.data.partial).toBe(1)
    expect(read.data.unreadable).toEqual(['e', 'f'])
    expect(parseLedgerRun(ledger(null, '昨天', 1, [0]))).toBeUndefined()
  })

  it('全量运行带着层：没有 tier 的旧账本按两层读，认不出的层算读不了', () => {
    const tiered = (tier: unknown) => ({
      ...ledger(null, '2026-10-02T10:00:00Z', 200, [0]),
      meta: { ...ledger(null, '2026-10-02T10:00:00Z', 200, [0]).meta, tier },
    })
    const fast = parseLedgerRun(tiered('fast'))
    expect(fast?.kind === 'full' ? fast.run.tier : undefined).toBe('fast')
    const old = parseLedgerRun(ledger(null, '2026-10-02T10:00:00Z', 600, [0]))
    expect(old?.kind === 'full' ? old.run.tier : undefined).toBe('all')
    expect(parseLedgerRun(tiered('medium'))).toBeUndefined()
  })

  const withCache = (cache: unknown, exitCodes: number[]) => {
    const base = ledger(null, '2026-10-03T10:00:00Z', 5, exitCodes)
    return { ...base, meta: { ...base.meta, cache } }
  }
  const hit = { member: 'a', key: 'k', source: 's', tests: 3 }

  it('含命中、members 为空的账本不算全量', () => {
    expect(parseLedgerRun(withCache({ mode: 'read-write', hits: [hit], written: [] }, []))).toEqual(
      {
        kind: 'partial',
      },
    )
  })

  it('含命中、members 有值的账本不算全量', () => {
    expect(
      parseLedgerRun(withCache({ mode: 'read-write', hits: [hit], written: ['b'] }, [0])),
    ).toEqual({ kind: 'partial' })
  })

  it('无命中的全量账本照旧算全量', () => {
    expect(
      parseLedgerRun(withCache({ mode: 'read-write', hits: [], written: ['b'] }, [0]))?.kind,
    ).toBe('full')
  })

  it('没有 meta.cache 的旧账本照旧算全量', () => {
    expect(parseLedgerRun(ledger(null, '2026-10-03T10:00:00Z', 600, [0]))?.kind).toBe('full')
  })

  it('含命中的账本不进全量序列，计入不计的份数', () => {
    const read = testsBlock(
      [
        { path: 'x', value: withCache({ hits: [hit] }, []) },
        { path: 'y', value: withCache({ hits: [hit] }, [0]) },
        { path: 'z', value: withCache({ hits: [] }, [0]) },
      ],
      10,
      'home',
    )
    if (read.status !== 'data') throw new Error(read.reason)
    expect(read.data.runs).toHaveLength(1)
    expect(read.data.partial).toBe(2)
  })

  it('目录不存在、只有受影响范围的运行：没有数据，原因不同', () => {
    expect(testsBlock(undefined, 10, 'home')).toEqual(noData('测试耗时账本目录 home 不存在'))
    expect(
      testsBlock(
        [{ path: 'b', value: ledger({ ref: 'main' }, '2026-10-01T11:00:00Z', 20, [0]) }],
        10,
        'home',
      ),
    ).toEqual(noData('home 下 1 份账本里没有全量运行（受影响范围或含缓存命中 1 份、读不了 0 份）'))
  })
})

const snapshot = (
  commit: string,
  committedAt: string,
  red: number | null,
  members: Snapshot['members'] = {},
): Snapshot => ({
  schema: 1,
  commit,
  committedAt,
  recordedAt: committedAt,
  branch: 'main',
  indicators: {
    redMembers: { value: red, band: red === null ? null : red >= 3 ? 'act' : 'normal' },
    newEdges: { value: null, band: null },
  },
  members,
})

const member = (overAlert: number, band: 'normal' | 'warn' | 'act') => ({
  overAlert,
  risk: 1,
  duplication: null,
  testsWithoutAssertions: 0,
  band,
})

describe('债的走向与传感器最近一次有数据', () => {
  const snapshots = [
    snapshot('b', '2026-09-02T00:00:00Z', 4, { 'packages/core/a': member(7, 'act') }),
    snapshot('a', '2026-09-01T00:00:00Z', 1, {
      'packages/core/a': member(2, 'normal'),
      'packages/infra/b': member(1, 'warn'),
    }),
    snapshot('c', '2026-09-03T00:00:00Z', null, { 'packages/core/a': member(1, 'normal') }),
    snapshot('b', '2026-09-02T00:00:00Z', 5, { 'packages/core/a': member(8, 'act') }),
  ]

  it('同一提交取最后一条、按提交时间排；只画曾经处置的成员；线取配置', () => {
    const read = debtBlock(snapshots, config, 'trend.jsonl')
    if (read.status !== 'data') throw new Error(read.reason)
    expect(read.data.snapshots).toBe(3)
    const red = read.data.indicators.find(series => series.id === 'redMembers')
    expect(red?.points.map(point => [point.commit, point.value])).toEqual([
      ['a', 1],
      ['b', 5],
      ['c', null],
    ])
    expect(red?.lines).toEqual(config.indicators.redMembers.lines)
    expect(read.data.members.map(entry => [entry.member, entry.latestBand])).toEqual([
      ['packages/core/a', 'normal'],
    ])
    expect(
      read.data.members[0]?.items
        .find(item => item.id === 'overAlert')
        ?.points.map(point => point.value),
    ).toEqual([2, 8, 1])

    const sensors = sensorsBlock(read)
    if (sensors.status !== 'data') throw new Error(sensors.reason)
    expect(sensors.data.find(sensor => sensor.id === 'redMembers')?.last).toEqual({
      commit: 'b',
      committedAt: '2026-09-02T00:00:00Z',
    })
    expect(sensors.data.find(sensor => sensor.id === 'newEdges')?.last).toBeNull()
    expect(sensors.data.find(sensor => sensor.id === 'worktrees')?.last).toBeNull()
  })

  it('没有快照：两块都没有数据', () => {
    const read = debtBlock([], config, 'trend.jsonl')
    expect(read.status).toBe('no-data')
    expect(sensorsBlock(read)).toEqual(read)
  })
})

describe('对照表条数', () => {
  it('五类条数照搬；待建只数有「归类」的表里「现状」以待建开头的行', () => {
    const text = [
      '| 条目 | 归类 | 落点 | 现状 |',
      '|---|---|---|---|',
      '| a | 传感器 | x | 已有 |',
      '| b | 传感器 | x | 待建（另立方案） |',
      '| c | 归人 | x | 待建 |',
      '',
      '| 别的 | 现状 |',
      '|---|---|',
      '| d | 待建 |',
    ].join('\n')
    expect(countPending(text)).toBe(2)
    const counts = { 传感器: 2, 评审问法: 0, 归人: 1, 不适用: 0, 不采: 0 }
    expect(catalogueBlock(data({ counts, invalid: [] }), 2)).toEqual(
      data({ counts, invalid: 0, pending: 2 }),
    )
    expect(catalogueBlock(noData('对照表还没写'), 0)).toEqual(noData('对照表还没写'))
  })
})

describe('页面与摘要', () => {
  const fixture = (): Health => {
    const now = local(2026, 10, 1, 12)
    const debt = debtBlock(
      [
        snapshot('a'.repeat(40), '2026-09-01T00:00:00Z', 1),
        snapshot('b'.repeat(40), '2026-09-02T00:00:00Z', 4, {
          'packages/core/a': member(7, 'act'),
        }),
      ],
      config,
      'trend.jsonl',
    )
    return {
      meta: {
        head: 'f'.repeat(40),
        shortHead: 'fffffffff',
        branch: 'main',
        dirty: false,
        generatedAt: now.toISOString(),
        home: '/loop/home',
        windows: config.health,
        notes: ['趋势 trend.jsonl 第 3 行读不了，已跳过'],
      },
      commits: commitsBlock(
        [
          { sha: '1234567890ab', subject: 'tooling: big one', files: 42 },
          { sha: 'abcdef123456', subject: 'docs: <small>', files: 3 },
        ],
        'main',
      ),
      tests: testsBlock(
        [
          {
            path: 'l',
            value: {
              meta: {
                head: 'e'.repeat(40),
                dirty: false,
                base: null,
                startedAt: '2026-10-01T10:00:00Z',
                wallSeconds: 693,
              },
              members: [{ exitCode: 1 }],
            },
          },
          {
            path: 'f',
            value: {
              meta: {
                head: 'f'.repeat(40),
                dirty: false,
                base: null,
                tier: 'fast',
                startedAt: '2026-10-02T10:00:00Z',
                wallSeconds: 201,
              },
              members: [{ exitCode: 0 }],
            },
          },
        ],
        10,
        'ledger-home',
      ),
      debt,
      catalogue: data({
        counts: { 传感器: 40, 评审问法: 25, 归人: 25, 不适用: 47, 不采: 6 },
        invalid: 0,
        pending: 3,
      }),
      sensors: sensorsBlock(debt),
    }
  }

  it('五块的标题都在，关键数字都在；没数据的块写明原因', () => {
    const page = renderHealthPage(fixture())
    for (const title of Object.values(SECTION_TITLES)) expect(page).toContain(`<h2>${title}</h2>`)
    expect(page).toContain('改动文件数中位数 3，最大 42')
    expect(page).toContain('tooling: big one')
    expect(page).toContain('docs: &lt;small&gt;')
    expect(page).toContain('>693<')
    expect(page).toContain('>201<')
    expect(page).toContain('<td>快层</td>')
    expect(page).toContain('<td>两层</td>')
    expect(page).toContain('有失败')
    expect(page).toContain('<polyline')
    expect(page).toContain('packages/core/a')
    expect(page).toContain('>47<')
    expect(page).toContain('从没有过数据')
    expect(page).toContain('第 3 行读不了')
  })

  it('自包含：不引任何 http(s) 资源，没有外链脚本或样式表', () => {
    const page = renderHealthPage(fixture())
    expect(page).not.toMatch(/(?:src|href)\s*=\s*["']?https?:/iu)
    expect(page).not.toMatch(/url\(\s*["']?https?:/iu)
    expect(page).not.toMatch(/<link\b|<script\b[^>]*\bsrc=/iu)
    expect(page).not.toContain('http://')
  })

  it('摘要不超过 15 行，末行是页面路径；没数据的块写原因', () => {
    const lines = healthSummary(fixture(), '/out/health.html')
    expect(lines.length).toBeLessThanOrEqual(15)
    expect(lines.at(-1)).toBe('页面：/out/health.html')
    expect(lines.find(line => line.startsWith('测试耗时'))).toBe(
      '测试耗时：最近 2 次全量：快层 201 秒；两层 693 秒；最近一次（快层）全过',
    )
  })

  it('小折线：全是 null 不画；null 处断开成两段；有线时画两条虚线', () => {
    expect(sparkline([null, null], null)).toBe('')
    const graph = sparkline([1, 2, null, 3, 4], { warn: 3, act: 5, release: 1 })
    expect(graph.match(/<polyline/gu)).toHaveLength(2)
    expect(graph.match(/<line /gu)).toHaveLength(2)
  })
})

// 入口：起 git 与 node 子进程；全量检查满载时会超过默认的 5 秒，所以写明时限。
describe('入口', { timeout: 60_000 }, () => {
  const made: string[] = []
  afterEach(() => {
    for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
  })
  const temp = (prefix: string) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
    made.push(dir)
    return dir
  }
  const cli = fileURLToPath(new URL('../src/loop/health-cli.ts', import.meta.url))

  it('在临时仓库里：五块都写出来，合并提交按对第一父的改动计；产物三件、摘要打到终端', () => {
    const root = temp('loop-health-repo-')
    const home = temp('loop-health-home-')
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'user.name=someone', '-c', 'user.email=someone@example.com', ...args],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      )
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    git('init', '-q')
    git('symbolic-ref', 'HEAD', 'refs/heads/main')
    write('README.md', 'r\n')
    write(
      '.meta_harness/design/product/PF-016-x/stories.md',
      '### ST-016-01 · 一张卡\n- **就绪**：否——缺裁决\n',
    )
    git('add', '-A')
    git('commit', '-q', '-m', 'init')
    git('checkout', '-q', '-b', 'side')
    write('a.txt', '1\n')
    write('b.txt', '1\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'side one')
    write('c.txt', '1\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'side two')
    git('checkout', '-q', 'main')
    git('merge', '-q', '--no-ff', '-m', 'merge side', 'side')

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, '--root', root],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          OMNE_METRICS_HOME: home,
          OMNE_TEST_LEDGER_HOME: join(home, 'no-ledger'),
        },
      },
    )
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('提交与合并的大小：main 最近 2 个，文件数中位数 2、最大 3（')
    expect(result.stdout).toContain('merge side')
    expect(result.stdout).not.toContain('当前来源卡')
    expect(result.stdout).not.toContain('ST-016-01')
    expect(result.stdout).toContain('测试耗时：没有数据，测试耗时账本目录')
    const out = join(home, 'health')
    const page = readFileSync(join(out, 'health.html'), 'utf8')
    for (const title of Object.values(SECTION_TITLES)) expect(page).toContain(`<h2>${title}</h2>`)
    const json: unknown = JSON.parse(readFileSync(join(out, 'health.json'), 'utf8'))
    expect(Object.keys(json as object)).toEqual([
      'conformance',
      'meta',
      'commits',
      'tests',
      'debt',
      'catalogue',
      'sensors',
    ])
    expect((json as { conformance: { status: string } }).conformance.status).toBe('no-data')
    expect(readFileSync(join(out, 'summary.md'), 'utf8')).toBe(result.stdout)
  })

  it.each(['--config', '--capture'])('拒绝退出的任务输入 %s', flag => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, flag, 'input.json'],
      { encoding: 'utf8' },
    )
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('认不出的参数')
  })

  it('认不出的参数：退出 2', () => {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, '--nope'], {
      encoding: 'utf8',
    })
    expect(result.status).toBe(2)
  })
})
