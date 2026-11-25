import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const BENCH = join(import.meta.dirname, '..')
const bench = (...args: readonly string[]): string =>
  execFileSync(process.execPath, ['--experimental-strip-types', 'src/cli.ts', ...args], {
    cwd: BENCH,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

describe('the commands that only read what is kept', () => {
  it('show prints one case as asked under the default scheme, with the kept answer and the right one', () => {
    const shown = JSON.parse(
      bench(
        'show',
        '--case',
        'p19-k8s-probes-pdb/touched-prod-overlay',
        '--config',
        'configs/final.json',
        '--ids',
        'N2',
      ),
    ) as {
      right: Record<string, { truth: string }>
      requests: {
        questions: Record<string, unknown>
        answers: Record<string, { choice: string }>
      }[]
    }
    expect(shown.right).toEqual({ N2: { truth: 'broken', safe: [] } })
    expect(Object.keys(shown.requests[0]!.questions)).toEqual(['N2'])
    expect(shown.requests[0]!.answers.N2?.choice).toBe('kept')
  })

  it('show takes the dead end by its one number and prints its two questions', () => {
    const shown = JSON.parse(
      bench('show', '--case', 'p07-ts-strict/types-package-missing', '--ids', 'U'),
    ) as { right: object; requests: { questions: object }[] }
    expect(Object.keys(shown.right)).toEqual(['U'])
    expect(Object.keys(shown.requests[0]!.questions)).toEqual(['U1', 'U2'])
  })

  it('ledger prints every kept experiment written down, none as not written down', () => {
    const table = bench('ledger')
    expect(table).toContain('| `final-vs-baseline-heldout` | 留出 |')
    expect(table).toContain('| `baseline-tune` | 起点 | 基线方案 | tune | 5/88 | 12/125 |')
    expect(table).not.toContain('没有记')
  })
})
