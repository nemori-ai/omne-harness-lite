import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { closeoutMetrics, closeoutMutation, risk, runCommand, type Deps } from '../src/commands.ts'
import { CONFIG, fakeRepo, member, recorder, scratch, valueOf, writeJson } from './support.ts'

function deps(overrides: Partial<Deps> & Pick<Deps, 'exec'>): Deps & { printed: string[] } {
  const printed: string[] = []
  return {
    repo: fakeRepo(),
    print: line => printed.push(line),
    scratch: scratch(),
    cpus: 8,
    config: () => CONFIG,
    printed,
    ...overrides,
  }
}

const repo = fakeRepo({
  changedFiles: () => ['tools/t/src/a.ts', 'tools/c/x.json', 'docs/a.md'],
  members: () => [member('tools/t'), member('tools/c', false)],
  read: path => (path === 'tools/t/src/j.ts' ? 'a\nb\nc' : undefined),
})

it('metrics measures against the merge base, builds testable members first, and prints the summary and JSON paths', async () => {
  const { calls, exec } = recorder(command => {
    const json = valueOf(command.args, '--json')
    if (json !== undefined)
      writeJson(json, { functions: [], uncovered: [], testsWithoutAssertions: [], summary: {} })
    return {}
  })
  const d = deps({ repo, exec })
  const out = scratch()
  expect(await closeoutMetrics(['--', '--base', 'B', '--out', out], d)).toBe(0)
  expect(calls[0]?.args).toContain('--filter=@omne-harness/t...')
  expect(calls[0]?.args).not.toContain('--filter=@omne-harness/c...')
  expect(
    calls.filter(c => c.args.includes('--coverage.enabled')).map(c => valueOf(c.args, '--mode')),
  ).toEqual(['fast'])
  expect(calls.filter(c => c.args.includes('--coverage.enabled')).at(0)?.args).toContain(
    '--maxWorkers=4',
  )
  expect(calls.filter(c => valueOf(c.args, '--base') === 'B-merge-base')).toHaveLength(2)
  expect(d.printed).toContain(`- tools/t：${out}/tools__t.metrics.json`)
  expect(d.printed).toContain(`- tools/c：${out}/tools__c.metrics.json`)
  expect(readFileSync(`${out}/summary.md`, 'utf8')).toContain('成员外改动 1 个文件不度量')
})

it('metrics stops with exit 1 when the build fails', async () => {
  const { calls, exec } = recorder(() => ({ code: 1, stderr: 'tsc 报错' }))
  const d = deps({ repo, exec })
  expect(await closeoutMetrics(['--base', 'B', '--out', scratch()], d)).toBe(1)
  expect(calls).toHaveLength(1)
  expect(d.printed.join('\n')).toContain('tsc 报错')
})

const planned = (mutate: string[]) =>
  recorder(command => {
    const json = valueOf(command.args, '--json')
    if (json !== undefined)
      writeJson(json, {
        mutate,
        summary: { valid: command.args.includes('--plan-only') ? null : true },
      })
    return {}
  })

it('mutation with --plan-only lists the range and neither builds nor runs', async () => {
  const { calls, exec } = planned(['tools/t/src/a.ts:1-10'])
  const d = deps({ repo, exec })
  expect(
    await closeoutMutation(
      ['--base', 'B', '--scope', 'tools/', '--plan-only', '--out', scratch()],
      d,
    ),
  ).toBe(0)
  expect(calls).toHaveLength(1)
  expect(calls[0]?.args).toContain('--plan-only')
  expect(d.printed).toContain('tools/t：1 段、10 行')
  expect(d.printed).toContain('没有 test 脚本、不变异：tools/c')
})

it('mutation refuses an over-limit range with exit 2 and never starts Stryker', async () => {
  const { calls, exec } = planned(['tools/t/src/a.ts:1-700'])
  const d = deps({ repo, exec })
  expect(await closeoutMutation(['--base', 'B', '--out', scratch()], d)).toBe(2)
  expect(calls.every(c => c.args.includes('--plan-only'))).toBe(true)
  expect(
    await closeoutMutation(
      ['--base', 'B', '--max-lines', '700', '--out', scratch()],
      deps({ repo, exec }),
    ),
  ).toBe(0)
})

it('mutation includes a pinned file and its member even when that file did not change', async () => {
  const { calls, exec } = planned(['tools/t/src/j.ts'])
  const d = deps({ repo: fakeRepo({ ...repo, changedFiles: () => [] }), exec })
  expect(
    await closeoutMutation(['--base', 'B', '--files', 'tools/t/src/j.ts', '--out', scratch()], d),
  ).toBe(0)
  expect(d.printed).toContain('tools/t：1 段、3 行')
  expect(calls.map(c => c.command)).toContain('pnpm')
  expect(valueOf(calls.at(-1)?.args ?? [], '--files')).toBe('tools/t/src/j.ts')
})

it('risk reads the toolchain list from github-gate, matches it through git and exits 1 when the list is missing', async () => {
  const seen: string[][] = []
  const withList = fakeRepo({
    changedFiles: () => ['package.json', 'docs/a.md'],
    show: (ref, path) =>
      ref === 'origin/github-gate' && path === 'gate/toolchain-paths.txt'
        ? '# c\npackage.json\n'
        : undefined,
    changedMatching: (_, specs) => {
      seen.push([...specs])
      return ['package.json']
    },
  })
  const d = deps({ repo: withList, exec: recorder().exec })
  expect(await risk(['--base', 'B'], d)).toBe(0)
  expect(seen).toEqual([[':(glob)package.json']])
  expect(d.printed[0]).toMatch(/^风险级别 L3/)
  const without = deps({ repo: fakeRepo({ changedFiles: () => ['a.ts'] }), exec: recorder().exec })
  expect(await risk(['--base', 'B'], without)).toBe(1)
  expect(without.printed.at(-1)).toMatch(/^没判的规则：工具链路径/)
})

it('turns usage errors into exit 2 and lets other errors through', async () => {
  const d = deps({ exec: recorder().exec })
  expect(await runCommand(risk, [], d)).toBe(2)
  expect(d.printed).toEqual(['要给 --base <起点>'])
  await expect(
    runCommand(
      async () => {
        throw new Error('boom')
      },
      [],
      d,
    ),
  ).rejects.toThrow('boom')
})
