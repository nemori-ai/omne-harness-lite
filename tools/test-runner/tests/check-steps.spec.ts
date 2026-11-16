import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CheckStep } from '../src/testing/check-graph.ts'
import { runCheck } from '../src/testing/check.ts'
import { checkSteps, describeSteps, PLAN_DIR } from '../src/testing/check-steps.ts'

const steps = checkSteps({ runnerCli: 'cli.ts', devFlowIntegrationCli: 'integration-cli.ts' })

describe('步骤表', () => {
  it('format:check 是不依赖任何步骤的轻步骤，运行 pnpm 的 format:check 脚本', () => {
    const line = describeSteps(steps).find(entry => entry.startsWith('format:check\t'))
    expect(line).toMatch(/^format:check\t-\tlight\t.*run format:check$/)
  })

  it('按计划的步骤都读同一个计划文件，它在计划目录里、是 JSON', () => {
    const planned = steps.filter(step => step.planned === true)
    expect(planned.length).toBeGreaterThan(0)
    const plans = new Set(
      planned.map(step => step.command[step.command.indexOf('--plan') + 1] ?? '(没有 --plan)'),
    )
    expect([...plans]).toHaveLength(1)
    const [plan] = [...plans]
    expect(plan).toMatch(new RegExp(`^${PLAN_DIR}/[^/]+\\.json$`, 'u'))
  })
})

describe('check --list', () => {
  afterEach(() => vi.restoreAllMocks())

  it('prints the step table, one line per step, and runs nothing', async () => {
    const printed: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      printed.push(args.map(String).join(' '))
    })
    const table: CheckStep[] = [
      { name: 'one', command: ['echo', 'one'], after: [], heavy: false },
      { name: 'two', command: ['echo', 'two'], after: ['one'], heavy: true },
    ]
    const code = await runCheck(
      '/nonexistent-check-root',
      { admission: false, keepGoing: false, list: true },
      { steps: () => table },
    )
    expect(code).toBe(0)
    expect(printed).toEqual(['one\t-\tlight\techo one', 'two\tone\theavy\techo two'])
  })
})
