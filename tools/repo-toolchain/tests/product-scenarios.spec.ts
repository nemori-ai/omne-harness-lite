import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readProductTopics, scenarioId, scenarioRows } from '../src/product/scenarios.ts'

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
})

function topic(
  root: string,
  slug = 'skills',
  metadata = 'id: PD-skills\nrevision: 1\nstatus: draft',
): string {
  const dir = join(root, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'README.md'), `---\n${metadata}\n---\n`)
  writeFileSync(join(dir, 'design.md'), '# Product\n')
  return dir
}
function temporary(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'product-')))
  made.push(root)
  return root
}
describe('当前产品发现', () => {
  it('不读取封存目录，仍拒绝活跃目录和后缀别名的非法元数据', () => {
    const root = temporary()
    mkdirSync(join(root, 'old.legacy'))
    writeFileSync(join(root, 'old.legacy', 'README.md'), 'invalid archived metadata')
    topic(root)
    expect(readProductTopics(root).map(t => t.topic)).toEqual(['PD-skills'])
    topic(root, 'active', 'revision: 1\nstatus: draft')
    expect(() => readProductTopics(root)).toThrow('缺身份')
    rmSync(join(root, 'active'), { recursive: true })
    mkdirSync(join(root, 'old.legacy-not'))
    expect(() => readProductTopics(root)).toThrow('合法 slug')
  })
  it('封存后缀不豁免产品目录符号链接', () => {
    const root = temporary()
    topic(root)
    symlinkSync(join(root, 'skills'), join(root, 'alias.legacy'), 'dir')
    expect(() => readProductTopics(root)).toThrow('别名链接')
  })
  it.each(['---   \n', '---\t\r\n', '--- \t'])('接受 front-matter 关闭行的尾随空白 %j', closing => {
    const root = temporary()
    const dir = topic(root)
    writeFileSync(
      join(dir, 'README.md'),
      `---\nid: PD-skills\nrevision: 1\nstatus: draft\n${closing}`,
    )
    expect(readProductTopics(root).map(t => t.topic)).toEqual(['PD-skills'])
  })
  it('关闭行带非空白文本仍不是合法 front-matter 分隔符', () => {
    const root = temporary()
    const dir = topic(root)
    writeFileSync(
      join(dir, 'README.md'),
      '---\nid: PD-skills\nrevision: 1\nstatus: draft\n--- text\n',
    )
    expect(() => readProductTopics(root)).toThrow('缺元数据')
  })
  it.each(['missing', 'alpha'])('拒绝指向 %s 的 topic 目录链接，不返回部分成功', target => {
    const root = temporary()
    topic(root, 'alpha', 'id: PD-alpha\nrevision: 1\nstatus: draft')
    symlinkSync(join(root, target), join(root, 'beta'), 'dir')
    expect(() => readProductTopics(root)).toThrow('别名链接')
  })
  it('读取 PD 元数据，保留没有编号场景的 topic，排除模板', () => {
    const root = temporary()
    const dir = topic(root)
    topic(root, 'tools', 'id: PD-tools\nrevision: 2\nstatus: draft')
    mkdirSync(join(root, '.templates'))
    writeFileSync(join(dir, 'acceptance.md'), '| S5 | 场景 |\n')
    expect(readProductTopics(root).map(t => [t.dir, t.topic, [...t.scenarios.keys()]])).toEqual([
      ['skills', 'PD-skills', ['S5']],
      ['tools', 'PD-tools', []],
    ])
  })
  it.each([
    ['id: PD-skills\nstatus: draft', 'revision'],
    ['id: PD-skills\nrevision: 0\nstatus: draft', 'revision'],
    ['id: PD-other\nrevision: 1\nstatus: draft', 'slug'],
    ['id: PD-skills\nrevision: 1', 'status'],
  ])('拒绝非法元数据 %s', (metadata, error) => {
    const root = temporary()
    topic(root, 'skills', metadata)
    expect(() => readProductTopics(root)).toThrow(error)
  })
  it('缺正文、非法根明确失败；合法空根返回空结果', () => {
    const root = temporary()
    expect(readProductTopics(root)).toEqual([])
    expect(() => readProductTopics(join(root, 'missing'))).toThrow('不存在')
    const dir = topic(root)
    rmSync(join(dir, 'design.md'))
    expect(() => readProductTopics(root)).toThrow('缺正文')
  })
  it('身份重复明确失败', () => {
    const root = temporary()
    topic(root)
    topic(root, 'tools')
    expect(() => readProductTopics(root)).toThrow('重复')
  })
  it('README、正文和 acceptance 的符号链接不得逃出产品根', () => {
    for (const file of ['README.md', 'design.md', 'acceptance.md']) {
      const root = temporary()
      const dir = topic(root)
      const outside = temporary()
      writeFileSync(join(outside, 'file'), 'outside')
      rmSync(join(dir, file), { force: true })
      symlinkSync(join(outside, 'file'), join(dir, file))
      expect(() => readProductTopics(root)).toThrow('越界')
    }
  })
})
