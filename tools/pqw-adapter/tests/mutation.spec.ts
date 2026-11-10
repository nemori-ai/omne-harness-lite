import { expect, it } from 'vitest'
import { FAST_VITEST_CONFIG } from '../src/locations.ts'
import {
  invalid,
  MAX_PARALLEL_MEMBERS,
  mutateAll,
  mutateMember,
  mutationArgs,
  mutationExitCode,
  mutationLines,
  planLines,
  rangeLines,
  upstreamBuildArgs,
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
    otherHeavyTasks: 2,
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
  expect(valueOf(args, '--other-heavy-tasks')).toBe('2')
  expect(args.at(-1)).toBe('--plan-only')
  const real = mutationArgs({
    root: '/r',
    member: 'm',
    base: 'b',
    scopes: ['m/'],
    files: [],
    json: 'j',
    planOnly: false,
    otherHeavyTasks: 0,
  })
  expect(real).not.toContain('--plan-only')
  expect(real).not.toContain('--files')
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
    otherHeavyTasks: 0,
  })
  expect(result.result).toEqual(pqw)
  expect(valueOf(one.calls[0]?.args ?? [], '--files')).toBe('tools/t/src/j.ts')
  expect(invalid(result)).toBe(true)
  const two = recorder(() => ({ code: 2, stderr: '找不到 Stryker' }))
  const failed = await mutateMember(changedMember('tools/v'), context(two.exec), {
    planOnly: true,
    otherHeavyTasks: 0,
  })
  expect(failed.error).toBe('mutation.mjs 退出 2：找不到 Stryker')
})

it('runs at most three members at once and tells each how many others share the machine', async () => {
  let running = 0
  let peak = 0
  const { calls, exec } = recorder(async command => {
    running += 1
    peak = Math.max(peak, running)
    await new Promise(resolve => setTimeout(resolve, 5))
    writeJson(valueOf(command.args, '--json') ?? '', { mutate: [], summary: { valid: true } })
    running -= 1
    return {}
  })
  const members = ['a', 'b', 'c', 'd', 'e'].map(m => changedMember(`tools/${m}`))
  const results = await mutateAll(members, {
    root: '/repo',
    base: 'b',
    files: [],
    outDir: scratch(),
    exec,
  })
  expect(peak).toBe(MAX_PARALLEL_MEMBERS)
  expect(results.map(r => r.member)).toEqual(members.map(m => m.path))
  expect(new Set(calls.map(c => valueOf(c.args, '--other-heavy-tasks')))).toEqual(new Set(['2']))
  const single = recorder(command => {
    writeJson(valueOf(command.args, '--json') ?? '', { mutate: [], summary: { valid: true } })
    return {}
  })
  await mutateAll([changedMember('tools/a')], {
    root: '/repo',
    base: 'b',
    files: [],
    outDir: scratch(),
    exec: single.exec,
  })
  expect(valueOf(single.calls[0]?.args ?? [], '--other-heavy-tasks')).toBe('0')
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
