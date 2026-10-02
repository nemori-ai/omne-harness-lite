// 场景状态报告：四种状态各由「有没有卡、有没有验收覆盖」推出；跨 topic 引用的卡算在场景所在的 topic；
// 入口读真实目录结构、只报告、退出 0。
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { scenarioStatuses, renderScenarioStatus } from '../src/acceptance/scenario-status.ts'
import { scenarioRows } from '../src/product/scenarios.ts'
import { parseStories } from '../src/product/stories.ts'

const topics = [
  {
    dir: 'PF-016-cli',
    topic: 'PF-016',
    scenarios: scenarioRows('| S1 |\n| S2 |\n| S3 |\n| S4 |\n'),
  },
  { dir: 'PF-017-center', topic: 'PF-017', scenarios: scenarioRows('| A01 |\n') },
  { dir: 'PF-018-empty', topic: 'PF-018', scenarios: scenarioRows('没有编号\n') },
]
const card = (id: string, covers: string) =>
  `### ${id} · 一张卡\n- **覆盖场景**：${covers}\n- **就绪**：是\n`
const stories = [
  {
    topic: 'PF-016-cli',
    ...parseStories(
      card('ST-016-02', '[S2](acceptance.md)、[A01](../PF-017-center/acceptance.md)') +
        card('ST-016-03', '[S3](acceptance.md#小节)、[S9](design.md)'),
    ),
  },
]
const declarations = [
  { path: 'apps/cli/acceptance/PF-016.a.acceptance.ts', covers: [{ topic: 'PF-016', id: 'S1' }] },
  {
    path: 'apps/cli/acceptance/PF-016.b.acceptance.ts',
    covers: [
      { topic: 'PF-016', id: 'S2' },
      { topic: 'PF-017', id: 'A01' },
    ],
  },
]

describe('场景状态', () => {
  it('已交付、交付中、已立卡、还没切到各由卡与验收推出；没有带编号场景的 topic 不列', () => {
    const statuses = scenarioStatuses(topics, stories, declarations)
    expect(
      statuses.map(topic => [topic.dir, topic.scenarios.map(s => `${s.id} ${s.state}`)]),
    ).toEqual([
      ['PF-016-cli', ['S1 delivered', 'S2 delivering', 'S3 carded', 'S4 uncut']],
      ['PF-017-center', ['A01 delivering']],
    ])
    expect(statuses[1]?.scenarios[0]).toEqual({
      id: 'A01',
      state: 'delivering',
      cards: ['ST-016-02'],
      acceptance: ['apps/cli/acceptance/PF-016.b.acceptance.ts'],
    })
  })

  it('文字：每个 topic 按状态分行，带卡号与验收文件，末尾合计', () => {
    const lines = renderScenarioStatus(scenarioStatuses(topics, stories, declarations), [
      '一条备注',
    ])
    expect(lines).toContain('  一条备注')
    expect(lines).toContain('PF-016-cli（4 条）')
    expect(lines).toContain('  已交付 1：S1（验收 apps/cli/acceptance/PF-016.a.acceptance.ts）')
    expect(lines).toContain(
      '  交付中 1：S2（卡 ST-016-02；验收 apps/cli/acceptance/PF-016.b.acceptance.ts）',
    )
    expect(lines).toContain('  已立卡 1：S3（卡 ST-016-03）')
    expect(lines).toContain('  还没切到 1：S4')
    expect(lines.at(-1)).toBe(
      '合计 2 个 topic、5 条带编号场景：已交付 1、交付中 2、已立卡 1、还没切到 1',
    )
  })
})

describe('场景状态入口', { timeout: 60_000 }, () => {
  const made: string[] = []
  afterEach(() => {
    for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
  })
  const cli = fileURLToPath(new URL('../src/acceptance/scenario-status-cli.ts', import.meta.url))
  const write = (root: string, path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }

  it('读检出里的产品区与验收；覆盖声明有错只提一句，照样退出 0', () => {
    const root = mkdtempSync(join(tmpdir(), 'scenario-status-'))
    made.push(root)
    const product = '.meta_harness/design/product'
    write(root, `${product}/PF-016-cli/acceptance.md`, '| S5 | 没有屏 |\n| S6 | 调试 |\n')
    write(
      root,
      `${product}/PF-016-cli/stories.md`,
      `**已发到**：ST-016-01\n\n${card('ST-016-01', '[S5](acceptance.md)')}`,
    )
    write(root, 'apps/cli/package.json', '{"scripts":{"acceptance":"vitest run"}}')
    write(root, 'apps/cli/acceptance/PF-016.a.acceptance.ts', '// covers: PF-016 S5, PF-016 S7\n')
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, '--root', root],
      {
        encoding: 'utf8',
      },
    )
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      '  交付中 1：S5（卡 ST-016-01；验收 apps/cli/acceptance/PF-016.a.acceptance.ts）\n  还没切到 1：S6\n',
    )
    expect(result.stdout).toContain('覆盖声明有 1 处问题（`pnpm run lint:rules` 判它失败）')
  })

  it('产品区不存在：工具出错，退出 2', () => {
    const root = mkdtempSync(join(tmpdir(), 'scenario-status-'))
    made.push(root)
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, '--root', root],
      {
        encoding: 'utf8',
      },
    )
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('不存在')
  })
})
