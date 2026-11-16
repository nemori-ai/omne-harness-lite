// 命令行参数的共用解析：`pnpm run <脚本> -- <参数>` 会把 `--` 原样传进来，解析时跳过它；别的认不出的参数照旧报错。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFlags } from '../src/testing/support.ts'

describe('parseFlags', () => {
  it('跳过单独的 --，其余照常解析', () => {
    const flags = parseFlags(
      ['--', '--plan-only', '--base', 'main'],
      ['--base'],
      ['--plan-only'],
      'usage',
    )
    expect([...flags.switches]).toEqual(['--plan-only'])
    expect(flags.values.get('--base')).toBe('main')
  })

  it('认不出的参数与缺值的参数仍然报错', () => {
    expect(() => parseFlags(['--bogus'], [], [], 'usage')).toThrow('未知参数 --bogus')
    expect(() => parseFlags(['--tier'], ['--tier'], [], 'usage')).toThrow('--tier 需要一个值')
  })
})

describe('根脚本 test:tier 的层名由检查器核对', () => {
  // 根脚本体以 --tier 结尾，pnpm 把人给的参数追加在后面；这里直接起同一条命令（不经名额）。
  const CLI = fileURLToPath(new URL('../src/testing/cli.ts', import.meta.url))
  const tier = (extra: readonly string[]) =>
    spawnSync(
      process.execPath,
      ['--experimental-strip-types', CLI, 'run', '--all', '--build', '--tier', ...extra],
      { encoding: 'utf8' },
    )

  it.each([
    ['不给层', [], '--tier 需要一个值'],
    ['多给参数', ['slow', 'fast'], '未知参数 fast'],
    ['层名不对', ['bogus'], '--tier 只能是'],
  ])('%s：以 2 退出，不跑', (_name, extra, message) => {
    const result = tier(extra)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain(message)
    expect(result.stdout).toBe('')
  })
})
