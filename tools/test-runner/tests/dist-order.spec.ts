import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runGraph, type CheckStep } from '../src/testing/check-graph.ts'
import { checkSteps } from '../src/testing/check-steps.ts'

const steps = checkSteps({
  baseline: 'HEAD',
  runnerCli: 'runner',
  devFlowDeliveryCli: 'delivery',
  devFlowIntegrationCli: 'integration',
}).filter(step => ['build', 'typecheck', 'lint:oxlint'].includes(step.name))

type State = 'pending' | 'running' | 'passed' | 'failed'

function unsafeSchedules(graph: readonly CheckStep[]): string[] {
  const seen = new Set<string>()
  const unsafe: string[] = []
  const visit = (state: ReadonlyMap<string, State>) => {
    const key = JSON.stringify([...state])
    if (seen.has(key)) return
    seen.add(key)
    if (
      state.get('lint:oxlint') === 'running' &&
      (state.get('build') !== 'passed' || state.get('typecheck') !== 'passed')
    )
      unsafe.push(key)
    for (const step of graph) {
      const current = state.get(step.name)
      const next: State[] =
        current === 'running'
          ? ['passed', 'failed']
          : current === 'pending' && step.after.every(name => state.get(name) === 'passed')
            ? ['running']
            : []
      for (const value of next) visit(new Map(state).set(step.name, value))
    }
  }
  visit(new Map(graph.map(step => [step.name, 'pending'])))
  return unsafe
}

describe('dist readers wait for writers', () => {
  it('all reachable schedules preserve the invariant; missing prerequisites have counterexamples', () => {
    expect(unsafeSchedules(steps)).toEqual([])
    for (const after of [[], ['build']]) {
      const mutant = steps.map(step => (step.name === 'lint:oxlint' ? { ...step, after } : step))
      expect(unsafeSchedules(mutant).length).toBeGreaterThan(0)
    }
  })

  it.each(['none', 'build', 'typecheck'])(
    'actual scheduler with failing writer %s',
    async failing => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-dist-order-')))
      try {
        const run = await runGraph(
          steps.map(step => ({
            ...step,
            command: [
              process.execPath,
              '-e',
              step.name === 'lint:oxlint'
                ? "const fs = require('node:fs'); for (const name of ['build', 'typecheck']) fs.readFileSync(name)"
                : `require('node:fs').writeFileSync(${JSON.stringify(step.name)}, 'complete'); process.exit(${step.name === failing ? 1 : 0})`,
            ],
          })),
          {
            root,
            logDir: join(root, 'logs'),
            env: process.env,
            lightConcurrency: 8,
            keepGoing: true,
          },
        )
        const lint = run.results.find(result => result.name === 'lint:oxlint')
        if (failing === 'none') {
          expect(lint?.exitCode).toBe(0)
          for (const name of ['build', 'typecheck']) {
            const writer = run.results.find(result => result.name === name)
            expect(lint?.startedMs).toBeGreaterThanOrEqual(writer?.endedMs ?? Infinity)
          }
        } else {
          expect(lint).toBeUndefined()
          expect(run.skipped).toContain('lint:oxlint')
        }
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
