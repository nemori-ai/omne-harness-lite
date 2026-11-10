import { expect, it } from 'vitest'
import { FAST_VITEST_CONFIG } from '../src/locations.ts'
import type { Executor } from '../src/process.ts'
import {
  invalid,
  mutateAll,
  mutateMember,
  mutationArgs,
  mutationExitCode,
  mutationLines,
  planLines,
  rangeLines,
  upstreamBuildArgs,
  workersFor,
  type MemberMutation,
} from '../src/mutation.ts'
import { changedMember, recorder, scratch, valueOf, writeJson } from './support.ts'

it('calls mutation.mjs per member with the omne build, Stryker modules and fast-tier config', () => {
  const args = mutationArgs({
    root: '/repo',
    member: 'tools/t',
    base: 'b',
    scopes: ['tools/t/src/a.ts'],
    files: ['tools/t/src/judge.ts'],
    json: '/o/t.json',
    planOnly: true,
    workers: 3,
  })
  expect(args[0]).toBe(
    '/repo/.meta_harness/agents/vendor/pqw-skills/skills/slice-closeout/scripts/mutation.mjs',
  )
  expect(valueOf(args, '--project')).toBe('tools/t')
  expect(valueOf(args, '--scope')).toBe('tools/t/src/a.ts')
  expect(valueOf(args, '--files')).toBe('tools/t/src/judge.ts')
  expect(valueOf(args, '--build-command')).toBe('pnpm run build')
  expect(valueOf(args, '--stryker-modules')).toBe('/repo/tools/pqw-adapter/node_modules')
  expect(valueOf(args, '--vitest-config')).toBe(FAST_VITEST_CONFIG)
  expect(valueOf(args, '--unit-max-lines')).toBe('0')
  expect(valueOf(args, '--workers')).toBe('3')
  expect(args).not.toContain('--other-heavy-tasks')
  expect(args.at(-1)).toBe('--plan-only')
  const real = mutationArgs({
    root: '/r',
    member: 'm',
    base: 'b',
    scopes: ['m/'],
    files: [],
    json: 'j',
    planOnly: false,
  })
  expect(real).not.toContain('--plan-only')
  expect(real).not.toContain('--files')
  expect(real).not.toContain('--workers')
})

it('builds only the upstream of each member, since pqw builds the instrumented member in the sandbox', () => {
  expect(upstreamBuildArgs(['@omne-harness/a'])).toEqual([
    'exec',
    'turbo',
    'run',
    'build',
    '--output-logs=errors-only',
    '--filter=@omne-harness/a^...',
  ])
})

it('counts mutate lines from ranges and whole pinned files', () => {
  expect(rangeLines(['a.ts:3-5', 'b.ts:10-10', 'c.ts'], path => (path === 'c.ts' ? 40 : 0))).toBe(
    44,
  )
})

const plan = (member: string, mutate: string[]): MemberMutation => ({
  member,
  json: 'j',
  result: { mutate, summary: { valid: null } },
})

it('refuses a plan whose total is over the limit and accepts one at the limit', () => {
  const plans = [plan('a', ['a/x.ts:1-300']), plan('b', ['b/y.ts:1-300'])]
  expect(planLines(plans, () => 0, 600)).toMatchObject({ total: 600, over: false })
  const refused = planLines(plans, () => 0, 599)
  expect(refused.over).toBe(true)
  expect(refused.lines.at(-1)).toContain('拒绝运行')
  expect(refused.lines).toContain('  a/x.ts:1-300')
})

it('reads the JSON back after exit 1 and treats other exits as a failed call', async () => {
  const out = scratch()
  const pqw = { mutate: [], summary: { valid: false, invalidReason: '沙箱预检没通过' } }
  const one = recorder(command => {
    writeJson(valueOf(command.args, '--json') ?? '', pqw)
    return { code: 1 }
  })
  const context = (exec: typeof one.exec) => ({
    root: '/repo',
    base: 'b',
    files: ['tools/t/src/j.ts', 'tools/u/src/k.ts'],
    outDir: out,
    exec,
  })
  const result = await mutateMember(changedMember('tools/t'), context(one.exec), {
    planOnly: false,
  })
  expect(result.result).toEqual(pqw)
  expect(valueOf(one.calls[0]?.args ?? [], '--files')).toBe('tools/t/src/j.ts')
  expect(invalid(result)).toBe(true)
  const two = recorder(() => ({ code: 2, stderr: '找不到 Stryker' }))
  const failed = await mutateMember(changedMember('tools/v'), context(two.exec), {
    planOnly: true,
  })
  expect(failed.error).toBe('mutation.mjs 退出 2：找不到 Stryker')
})

/** 假执行器：每次调用挂起，直到用例按成员放行；记下开跑顺序、各自的 --workers 与同时在跑的进程数之和。 */
function gated() {
  const started: { member: string; workers: number }[] = []
  const release = new Map<string, () => void>()
  let running = 0
  let peak = 0
  const exec: Executor = command =>
    new Promise(resolve => {
      const member = valueOf(command.args, '--project') ?? ''
      const workers = Number(valueOf(command.args, '--workers'))
      started.push({ member, workers })
      running += workers
      peak = Math.max(peak, running)
      release.set(member, () => {
        running -= workers
        writeJson(valueOf(command.args, '--json') ?? '', { mutate: [], summary: { valid: true } })
        resolve({ code: 0, stdout: '', stderr: '' })
      })
    })
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))
  const finish = async (member: string) => {
    release.get(member)?.()
    await settle()
  }
  return { exec, started, finish, settle, peak: () => peak }
}

const context = (exec: Executor) => ({
  root: '/repo',
  base: 'b',
  files: [],
  outDir: scratch(),
  exec,
})
const sized = (lines: Record<string, number>) =>
  Object.entries(lines).map(([path, count]) => ({ member: changedMember(path), lines: count }))

it('starts the largest range first with the largest share of the CPUs, never more processes than CPUs', async () => {
  const fake = gated()
  const all = mutateAll(sized({ a: 10, b: 300, c: 50, d: 40 }), context(fake.exec), 8)
  await fake.settle()
  expect(fake.started).toEqual([
    { member: 'b', workers: 6 },
    { member: 'c', workers: 1 },
    { member: 'd', workers: 1 },
  ])
  await fake.finish('c')
  expect(fake.started.at(-1)).toEqual({ member: 'a', workers: 1 })
  for (const member of ['a', 'b', 'd']) await fake.finish(member)
  expect(fake.peak()).toBe(8)
  expect((await all).map(result => result.member)).toEqual(['a', 'b', 'c', 'd'])
})

it('hands the processes of a finished member to the next one at once, and the last one takes all that are free', async () => {
  const fake = gated()
  const all = mutateAll(sized({ a: 100, b: 100, c: 100, d: 100, e: 100 }), context(fake.exec), 4)
  await fake.settle()
  expect(fake.started.map(s => s.member)).toEqual(['a', 'b', 'c', 'd'])
  await fake.finish('a')
  expect(fake.started.at(-1)).toEqual({ member: 'e', workers: 1 })
  for (const member of ['b', 'c', 'd', 'e']) await fake.finish(member)
  expect(fake.peak()).toBe(4)
  expect(await all).toHaveLength(5)
  const last = gated()
  const three = mutateAll(sized({ a: 100, b: 100, c: 100 }), context(last.exec), 4)
  await last.settle()
  expect(last.started.map(s => s.workers)).toEqual([1, 1, 2])
  for (const member of ['a', 'b', 'c']) await last.finish(member)
  await three
})

it('splits CPUs by range share, at least one and at most the free ones', () => {
  expect(workersFor(300, 400, 8, 8)).toBe(6)
  expect(workersFor(10, 400, 8, 8)).toBe(1)
  expect(workersFor(100, 100, 8, 3)).toBe(3)
  expect(workersFor(0, 0, 8, 8)).toBe(1)
})

it('exits 1 only for an invalid measurement, not for survivors or a plan', () => {
  const survived: MemberMutation = {
    member: 'a',
    json: 'j',
    result: { mutate: [], summary: { valid: true, survived: 4 } },
  }
  const planned: MemberMutation = {
    member: 'b',
    json: 'j',
    result: { mutate: [], summary: { valid: null } },
  }
  const broken: MemberMutation = { member: 'c', json: 'j', error: 'x' }
  expect(mutationExitCode([survived, planned])).toBe(0)
  expect(mutationExitCode([survived, broken])).toBe(1)
  expect(
    mutationExitCode([
      { member: 'd', json: 'j', result: { mutate: [], summary: { valid: false } } },
    ]),
  ).toBe(1)
})

it('lists survivors, uncovered sites and unmutated segments, and ends with the limits', () => {
  const site = { file: 'm/src/a.ts', unit: 'f', line: 7, original: '<', mutant: '<=' }
  const lines = mutationLines([
    {
      member: 'm',
      json: '/o/m.json',
      result: {
        mutate: [],
        summary: { valid: true, killed: 3, survived: 1, uncovered: 1, notRun: 0, score: 0.75 },
        survivors: [site],
        sites: [{ ...site, line: 9, mutant: '', verdict: 'uncovered' }],
        unmutated: [
          { file: 'm/src/a.ts', lines: [20, 22], unit: 'g', reason: '引擎没有在这段生成变异体' },
        ],
      },
    },
    {
      member: 'n',
      json: '/o/n.json',
      result: { mutate: [], summary: { valid: false, invalidReason: '构建失败' } },
    },
  ])
  expect(lines).toEqual([
    'm：杀死 3、存活 1、无覆盖 1、未跑 0；分数 75%；JSON /o/m.json',
    '存活：',
    '- m/src/a.ts:7 f：`<` → `<=`',
    '无覆盖：',
    '- m/src/a.ts:9 f：`<` → `（删去）`',
    '没有变异体的段：',
    '- m/src/a.ts:20-22 g：引擎没有在这段生成变异体',
    'n：测量无效（构建失败），JSON /o/n.json',
    expect.stringMatching(/^限制：/),
  ])
})
