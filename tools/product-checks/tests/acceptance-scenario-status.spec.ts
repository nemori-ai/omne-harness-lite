import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { scenarioStatuses, renderScenarioStatus } from '../src/acceptance/scenario-status.ts'
import { scenarioRows } from '@omne-harness/repo-toolchain/product/scenarios'

const made: string[] = []
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
})
const cli = fileURLToPath(new URL('../src/acceptance/scenario-status-cli.ts', import.meta.url))
const run = (...args: string[]) =>
  spawnSync(process.execPath, ['--conditions=source', '--experimental-strip-types', cli, ...args], {
    encoding: 'utf8',
  })
const temporary = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'scenario-')))
  made.push(root)
  return root
}

describe('长期场景事实', () => {
  it('覆盖声明不推出执行或接受；零场景 topic 不被过滤', () => {
    const statuses = scenarioStatuses({
      topics: [
        { dir: 'skills', topic: 'PD-skills', scenarios: scenarioRows('| S1 |\n') },
        { dir: 'tools', topic: 'PD-tools', scenarios: new Map() },
      ],
      declarations: [{ path: 'declared', covers: [{ topic: 'PD-skills', id: 'S1' }] }],
    })
    expect(statuses).toHaveLength(2)
    expect(statuses[0]?.scenarios[0]?.coverageDeclarations).toEqual(['declared'])
    expect(statuses[0]?.scenarios[0]?.execution.kind).toBe('unknown')
    expect(statuses[0]?.scenarios[0]?.acceptance.kind).toBe('unknown')
    expect(statuses[1]?.coverage).toBe('uncovered')
    expect(renderScenarioStatus(statuses, []).join('\n')).toContain('uncovered：缺编号场景')
  })
  it('合法空根在真实 CLI 中明确未覆盖', () => {
    const root = temporary()
    mkdirSync(join(root, '.meta_harness/design/product'), { recursive: true })
    const result = run('--root', root)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('uncovered：产品区没有当前 topic')
  })
  it('当前检出的 16 个 PD 均报告未覆盖和未知接受', () => {
    const result = run()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('合计 16 个 topic、0 条带编号场景')
    expect(result.stdout.match(/uncovered：缺编号场景/gu)).toHaveLength(16)
    expect(result.stdout).not.toContain('已交付')
  })
  it.each(['--config', '--capture'])('拒绝旧任务卡参数 %s', flag => {
    const result = run(flag, 'does-not-exist.json')
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('认不出的参数')
  })
  it('缺产品根与非法元数据退出 2', () => {
    const root = temporary()
    expect(run('--root', root).status).toBe(2)
    const dir = join(root, '.meta_harness/design/product/skills')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'README.md'), '---\nid: PD-skills\nstatus: draft\n---\n')
    writeFileSync(join(dir, 'design.md'), '# Product')
    const result = run('--root', root)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('revision')
  })
})
