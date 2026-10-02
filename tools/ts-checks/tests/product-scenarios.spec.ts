// 产品区的读法：场景行怎么认、stories.md 的「已发到」与空队列、「覆盖场景」的链接指到哪条场景，
// 以及认场景行的正则与设计区对账器 stories.py 没有分叉。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readProductTopics,
  SCENARIO_ID,
  scenarioId,
  scenarioRows,
} from '../src/product/scenarios.ts'
import { linkedScenario, parseStories, readStories } from '../src/product/stories.ts'

const made: string[] = []
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('场景行', () => {
  it('第一格是编号的表格行才算；加粗、反引号都认，带连字符的条款编号不算', () => {
    expect(scenarioId('| **S1** | 第一次 | 看到版本号 |')).toBe('S1')
    expect(scenarioId('| `S4b` | 断网 | 明说连不上 |')).toBe('S4b')
    expect(scenarioId('|A01|中心没启动|明说|')).toBe('A01')
    expect(scenarioId('| S-12 | 条款 | x |')).toBeUndefined()
    expect(scenarioId('| # | 场景 | 应有表现 |')).toBeUndefined()
    expect(scenarioId('|---|---|---|')).toBeUndefined()
    expect(scenarioId('S1 不在表格里')).toBeUndefined()
    expect(scenarioId('| s1 | 小写 | x |')).toBeUndefined()
  })

  it('同一个编号出现两次，两个行号都记下', () => {
    const rows = scenarioRows('# 验收\n\n| S1 | a | b |\n| S2 | a | b |\n| S1 | 重复 | b |\n')
    expect([...rows]).toEqual([
      ['S1', [3, 5]],
      ['S2', [4]],
    ])
  })

  // 两边各用自己的语言写同一条规则；有人只改了一边，这里变红。
  it('与 stories.py 的 SCENARIO_RE、CELL_SPLIT_RE 是同一个正则', () => {
    const python = readFileSync(
      fileURLToPath(new URL('../../../.meta_harness/tooling/src/stories.py', import.meta.url)),
      'utf8',
    )
    const pattern = (name: string) =>
      new RegExp(`^${name} = re\\.compile\\(r"(.+)"\\)$`, 'mu').exec(python)?.[1]
    expect(pattern('SCENARIO_RE')).toBe(SCENARIO_ID.source)
    expect(pattern('CELL_SPLIT_RE')).toBe('(?<!\\\\)\\|')
    expect(pattern('TOPIC_RE')).toBe('^PF-(\\d{3})(?:-|$)')
  })

  it('读产品区：只认 PF-<三位> 开头的目录，没有 acceptance.md 的 topic 场景为空', () => {
    const root = mkdtempSync(join(tmpdir(), 'product-'))
    made.push(root)
    for (const dir of ['PF-016-cli', 'PF-017-center', '.templates', 'archive'])
      mkdirSync(join(root, dir))
    writeFileSync(join(root, 'PF-016-cli', 'acceptance.md'), '| S5 | 没有屏 | 指路 |\n')
    const topics = readProductTopics(root)
    expect(topics?.map(topic => [topic.dir, topic.topic, [...topic.scenarios.keys()]])).toEqual([
      ['PF-016-cli', 'PF-016', ['S5']],
      ['PF-017-center', 'PF-017', []],
    ])
    expect(readProductTopics(join(root, 'nowhere'))).toBeUndefined()
  })
})

describe('stories.md', () => {
  it('「已发到」冒号全角半角都认，代码块里的不算；只有这一行的队列读成没有卡', () => {
    const drained = parseStories(
      '# PF-016 故事卡\n\n**已发到**：ST-016-03\n\n```\n**已发到**: ST-016-09\n```\n',
    )
    expect(drained).toEqual({ cards: [], highWater: ['ST-016-03'] })
    expect(parseStories('**已发到**: ST-016-01\n**已发到**：ST-016-02\n').highWater).toEqual([
      'ST-016-01',
      'ST-016-02',
    ])
    expect(parseStories('### ST-016-01 · 没有已发到\n').highWater).toEqual([])
  })

  it('「覆盖场景」的链接按行收下，续行也收；别的字段里的链接不收', () => {
    const { cards } = parseStories(
      [
        '### ST-016-01 · 一张卡',
        '- **价值**：见[设计](design.md)',
        '- **覆盖场景**：[S5](acceptance.md#给脚本用)、[**A01**](../PF-017-center/acceptance.md)',
        '  [S6](acceptance.md)',
        '- **就绪**：是',
      ].join('\n'),
    )
    expect(cards[0]?.covers).toEqual([
      { label: 'S5', href: 'acceptance.md#给脚本用' },
      { label: '**A01**', href: '../PF-017-center/acceptance.md' },
      { label: 'S6', href: 'acceptance.md' },
    ])
    expect(cards[0]?.ready).toBe('ready')
  })

  it('链接解析到（topic 目录，编号）；指到 acceptance.md 以外或产品区以外的认不出', () => {
    const at = (label: string, href: string) => linkedScenario('PF-016-cli', { label, href })
    expect(at('S5', 'acceptance.md#给脚本用')).toEqual({ topic: 'PF-016-cli', id: 'S5' })
    expect(at('`A01`', '../PF-017-center/acceptance.md')).toEqual({
      topic: 'PF-017-center',
      id: 'A01',
    })
    expect(at('S5', 'design.md')).toBeUndefined()
    expect(at('S5', '../../acceptance.md')).toBeUndefined()
    expect(at('S5', '../archive/acceptance.md')).toBeUndefined()
    expect(at('S5', '%E0%A4%A.md')).toBeUndefined()
  })

  it('有 stories.md 的 topic 都列出来，空队列也算', () => {
    const root = mkdtempSync(join(tmpdir(), 'product-'))
    made.push(root)
    mkdirSync(join(root, 'PF-016-cli'))
    mkdirSync(join(root, 'PF-017-center'))
    writeFileSync(join(root, 'PF-016-cli', 'stories.md'), '**已发到**：ST-016-01\n')
    expect(readStories(root)).toEqual([
      { topic: 'PF-016-cli', cards: [], highWater: ['ST-016-01'] },
    ])
  })
})
