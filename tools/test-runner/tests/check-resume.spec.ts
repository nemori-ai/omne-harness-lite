// @module-tag slow
// `check` 的运行记录与 `--resume-from` 的端到端：在一个夹具仓库上真跑 runCheck——真实的 git、turbo、影响面、步骤图、
// 计划文件、运行记录与准入日志，只把步骤表换成「记下自己跑了什么、读到什么范围」的假命令（真表里的步骤是 pnpm 脚本，
// 夹具里没有）。核对：只在 oxlint 失败的全量准入写出记录（W2-C2）；修复后接续只跑规定的步骤与成员、证据格式正确（W2-C2）；
// 前提不满足以 2 退出、差异碰到全局路径时整次全量并写明（W2-C3）；记录写明带没带 FULL=1 与工作树，
// 运行中工作树多出未被忽略的文件时记录记 dirty；H1 按影响面准入时接续的范围不比 H1 宽、
// 基线合并点不同就拒绝、接续记录不再作 H1。归慢层：每次 runCheck 起 turbo 与十来个 node 子进程。
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import {
  ADMISSION_RECORD_DIR,
  CHECK_RUN_RECORD_DIR,
  readAdmissionRun,
  RUN_RECORD_FILE,
  worktreeRoot,
  type AdmissionRun,
} from '../src/testing/admission-run.ts'
import type { CheckStep, Command } from '../src/testing/check-graph.ts'
import { runCheck } from '../src/testing/check.ts'
import { readTestRunsConfig } from '../src/testing/config.ts'

const CLI = fileURLToPath(new URL('../src/testing/cli.ts', import.meta.url))
const RULES = readTestRunsConfig().affected
/** 真实规则点名的成员在夹具里都要存在，否则算计划就报「规则点名了不存在的成员」；它们没有脚本，不进任何清单。 */
const RULE_MEMBERS = [
  ...new Set([
    ...RULES.readers.flatMap(reader => reader.members),
    ...RULES.residentBuild.map(entry => entry.member),
  ]),
]
const TEST_MEMBERS = ['members/a', 'members/b', 'members/c', 'members/d']
const ACCEPTING = ['members/a', 'members/c']

/**
 * 假步骤：把步骤名与它从计划文件里读到的范围追加进 trace.txt；`--fail-if-bad <文件>` 时文件里有 bad 就退出 1；
 * `--hold-if-bad <文件> <标记文件>` 时文件里有 bad 就等标记文件出现（至多 30 秒），超时退出 3 并在 stderr 写明在等什么；
 * `--fail-after <步骤>` 与 `--fail-if-bad` 同给、文件里有 bad 时，先等那一步在 trace.txt 里出现（至多 30 秒）再退出 1；
 * 等不到就退出 3（夹具自己的时序问题，不当成 oxlint 失败）。所以退出 1 一定发生在那一步已经起了之后。
 * 环境变量 `FAKE_STRAY` 给了文件名时，回路状态那一步在工作树里写这个文件（一个没被忽略的未跟踪文件）。
 */
const FAKE_STEP = `import { appendFileSync, existsSync, readFileSync } from 'node:fs'
const [name, ...flags] = process.argv.slice(2)
const planPath = 'tmp/check-plan/plan.json'
const plan = existsSync(planPath) ? JSON.parse(readFileSync(planPath, 'utf8')).plan : undefined
const lists = plan === undefined ? {} : {
  build: plan.build.map(entry => entry.path),
  typecheck: plan.typecheck,
  test: plan.test,
  acceptance: plan.acceptance,
  python: [String(plan.python.run)],
}
appendFileSync('trace.txt', name + '\\t' + (lists[name] === undefined ? '-' : lists[name].join(',')) + '\\n')
if (name === 'loop:status' && process.env.FAKE_STRAY) appendFileSync(process.env.FAKE_STRAY, 'stray\\n')
const bad = file => readFileSync(file, 'utf8').includes('bad')
const waitUntil = async (done, ms) => {
  for (const deadline = Date.now() + ms; !done() && Date.now() < deadline; ) await new Promise(resolve => setTimeout(resolve, 20))
  return done()
}
const holdAt = flags.indexOf('--hold-if-bad')
if (holdAt !== -1 && bad(flags[holdAt + 1])) {
  const marker = flags[holdAt + 2]
  if (!(await waitUntil(() => existsSync(marker), 30_000))) {
    process.stderr.write(name + ' 在等标记文件 ' + marker + '，30 秒内没出现\\n')
    process.exit(3)
  }
}
const at = flags.indexOf('--fail-if-bad')
const afterAt = flags.indexOf('--fail-after')
if (at !== -1 && bad(flags[at + 1])) {
  if (afterAt !== -1) {
    const step = flags[afterAt + 1]
    const started = () => existsSync('trace.txt') && readFileSync('trace.txt', 'utf8').split('\\n').some(line => line.startsWith(step + '\\t'))
    if (!(await waitUntil(started, 30_000))) {
      process.stderr.write(name + ' 在等 trace 里出现 ' + step + '，30 秒内没出现\\n')
      process.exit(3)
    }
  }
  process.exit(1)
}
process.exit(0)
`

interface Fixture {
  readonly root: string
  readonly git: (...args: string[]) => string
  readonly commit: (message: string) => string
  readonly steps: () => CheckStep[]
  /** trace.txt 的内容：步骤名 → 它读到的范围（逗号分隔；常驻步骤是 `-`）；读后清空。 */
  readonly trace: () => Map<string, string>
}

function fixture(): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-check-resume-')))
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  put(
    'package.json',
    '{ "name": "fixture-root", "private": true, "packageManager": "pnpm@10.28.1" }\n',
  )
  put(
    'pnpm-workspace.yaml',
    'packages:\n  - members/*\n  - packages/*/*\n  - apps/*\n  - tools/*\n',
  )
  put('.gitignore', 'tmp/\ntrace.txt\n.turbo/\nnode_modules/\n')
  put('fake-step.mjs', FAKE_STEP)
  for (const path of RULE_MEMBERS)
    put(`${path}/package.json`, JSON.stringify({ name: `@rule/${path.replaceAll('/', '-')}` }))
  const scripts = { build: 'node -e 0', typecheck: 'node -e 0', test: 'node -e 0' }
  for (const path of TEST_MEMBERS) {
    const name = `@f/${path.slice('members/'.length)}`
    put(
      `${path}/package.json`,
      JSON.stringify({
        name,
        ...(path === 'members/b' ? { dependencies: { '@f/a': 'workspace:*' } } : {}),
        scripts: ACCEPTING.includes(path) ? { ...scripts, acceptance: 'node -e 0' } : scripts,
      }),
    )
    put(`${path}/src.ts`, 'export const v = 1\n')
  }
  put('members/c/lint.txt', 'good\n')
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      env: repositoryEnv(process.env),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  const commit = (message: string) => {
    git('add', '-A')
    git('-c', 'user.name=F', '-c', 'user.email=f@example.invalid', 'commit', '-q', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'main')
  commit('base')
  git('switch', '-qc', 'card')
  const command = (name: string, ...extra: string[]): Command => [
    process.execPath,
    join(root, 'fake-step.mjs'),
    name,
    ...extra,
  ]
  const planned = (name: string, after: string[], heavy = true): CheckStep => ({
    name,
    command: command(name),
    after,
    heavy,
    planned: true,
  })
  const steps = (): CheckStep[] => {
    const table: CheckStep[] = [
      { name: 'check:docs', command: command('check:docs'), after: [], heavy: false },
      planned('python', [], false),
      planned('build', []),
      planned('typecheck', ['build']),
      // 让 H1 上「哪些步骤跑完、哪些没跑到」不随机器快慢变：假的 oxlint 排在类型检查之后才起，
      // 并等成员测试起来之后才失败（不然快的机器上 oxlint 先失败、成员测试还没起）。
      {
        name: 'lint:oxlint',
        command: command(
          'lint:oxlint',
          '--fail-if-bad',
          'members/c/lint.txt',
          '--fail-after',
          'test',
        ),
        after: ['typecheck'],
        heavy: false,
      },
      // 成员测试与真表一样只在构建之后；重步骤一次一个，它在类型检查之后开始。lint 还坏着时它停在一个夹具从不创建的
      // 标记文件上，只能被步骤图终止：oxlint 失败时它一定还在跑、被终止（记 ran: false），验收与回路状态没开始。
      {
        ...planned('test', ['build']),
        command: command('test', '--hold-if-bad', 'members/c/lint.txt', 'release.txt'),
      },
      planned('acceptance', ['test']),
    ]
    table.push({
      name: 'loop:status',
      command: command('loop:status'),
      after: table.map(step => step.name),
      heavy: false,
    })
    return table
  }
  const trace = () => {
    const path = join(root, 'trace.txt')
    const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : []
    rmSync(path, { force: true })
    return new Map(
      lines.map(line => {
        const [name = '', scope = ''] = line.split('\t')
        return [name, scope]
      }),
    )
  }
  return { root, git, commit, steps, trace }
}

const stepsOf = (record: AdmissionRun) =>
  new Map(record.steps.map(step => [step.name, { ran: step.ran, exit: step.exit }]))

function recordsIn(root: string, directory: string): string[] {
  const path = join(root, directory)
  return existsSync(path)
    ? readdirSync(path)
        .filter(name => name.endsWith('.json'))
        .sort()
    : []
}

function runRecord(root: string, head: string): AdmissionRun {
  const record = readAdmissionRun(
    join(root, CHECK_RUN_RECORD_DIR, head.slice(0, 9), RUN_RECORD_FILE),
  )
  if (record === undefined) throw new Error(`${head.slice(0, 9)} 的运行记录读不出`)
  return record
}

let fx: Fixture
let saved: NodeJS.ProcessEnv
const printed: string[] = []

beforeAll(() => {
  fx = fixture()
  saved = { ...process.env }
  // 预算钉死，不采样；不读缓存的策略由准入模式决定；基线退回夹具的 main。
  process.env['OMNE_WORKER_BUDGET'] = '2'
  for (const name of ['FULL', 'OMNE_ADMISSION', 'OMNE_TEST_CACHE', 'BASELINE'])
    delete process.env[name]
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    printed.push(args.map(String).join(' '))
  })
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    printed.push(args.map(String).join(' '))
  })
})

afterAll(() => {
  vi.restoreAllMocks()
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
  Object.assign(process.env, saved)
  rmSync(fx.root, { recursive: true, force: true })
})

const check = async (
  options: { resumeFrom?: string; admission?: boolean } = {},
  on: Fixture = fx,
) => {
  printed.length = 0
  const code = await runCheck(
    on.root,
    {
      admission: options.admission ?? true,
      keepGoing: false,
      list: false,
      ...(options.resumeFrom === undefined ? {} : { resumeFrom: options.resumeFrom }),
    },
    { steps: on.steps },
  )
  return { code, output: [...printed], trace: on.trace() }
}

const members = (scope: string | undefined) => new Set((scope ?? '').split(',').filter(Boolean))

describe('夹具仓库上的准入运行与接续', { timeout: 240_000 }, () => {
  let h0 = ''
  let h1 = ''
  let h2 = ''

  it('只在 oxlint 失败的全量准入：写出准入日志旁的记录与本头目录里的副本，记下谁跑完、谁没跑到', async () => {
    h0 = fx.git('rev-parse', 'HEAD')
    writeFileSync(join(fx.root, 'members/a/src.ts'), 'export const v = 2\n')
    writeFileSync(join(fx.root, 'members/c/lint.txt'), 'bad\n')
    h1 = fx.commit('card: break lint')
    process.env['FULL'] = '1'
    const first = await check()
    delete process.env['FULL']
    expect(first.code).toBe(1)
    // 成员测试起了（有踪迹）却被终止：记录里是 ran: false，不是「跑过」；验收没开始。
    expect(first.trace.has('test')).toBe(true)
    expect(first.trace.has('acceptance')).toBe(false)

    const record = runRecord(fx.root, h1)
    expect(record).toMatchObject({
      mode: 'full',
      admission: true,
      dirty: false,
      worktree: worktreeRoot(fx.root),
      fullRequested: true,
      head: h1,
      tree: fx.git('rev-parse', 'HEAD^{tree}'),
      base: null,
      failedStep: 'lint:oxlint',
      resumeFrom: null,
      caches: { test: 'off', depGraph: 'on', mutation: 'unknown' },
    })
    const steps = stepsOf(record)
    expect(steps.get('build')).toEqual({ ran: true, exit: 0 })
    expect(steps.get('typecheck')).toEqual({ ran: true, exit: 0 })
    expect(steps.get('lint:oxlint')).toEqual({ ran: true, exit: 1 })
    for (const name of ['test', 'acceptance', 'loop:status'])
      expect(steps.get(name), name).toEqual({ ran: false, exit: null })
    // 准入日志旁边同名的记录与它内容相同；日志以 exit=1 收尾并写明记录在哪。
    const beside = recordsIn(fx.root, ADMISSION_RECORD_DIR)
    expect(beside).toHaveLength(1)
    expect(readAdmissionRun(join(fx.root, ADMISSION_RECORD_DIR, beside[0] ?? ''))).toEqual(record)
    const log = readFileSync(
      join(fx.root, ADMISSION_RECORD_DIR, (beside[0] ?? '').replace(/\.json$/u, '.log')),
      'utf8',
    )
    expect(log).toContain('运行记录：tmp/admission/')
    expect(log.trimEnd().endsWith('exit=1')).toBe(true)
  })

  it('修复后接续：H1 没跑到的步骤整次跑、通过了的只跑 H1..HEAD 影响到的成员；证据进日志，记录写 resume', async () => {
    writeFileSync(join(fx.root, 'members/c/lint.txt'), 'good\n')
    h2 = fx.commit('card: fix lint')
    const resumed = await check({ resumeFrom: h1 })
    expect(resumed.code).toBe(0)

    // 全部步骤都跑了；按步骤各取整次或影响面的范围。
    const all = new Set(TEST_MEMBERS)
    expect([...resumed.trace.keys()].sort()).toEqual(
      fx
        .steps()
        .map(step => step.name)
        .sort(),
    )
    expect(members(resumed.trace.get('test'))).toEqual(all)
    expect(members(resumed.trace.get('build'))).toEqual(all)
    expect(members(resumed.trace.get('acceptance'))).toEqual(new Set(ACCEPTING))
    expect(members(resumed.trace.get('typecheck'))).toEqual(new Set(['members/c']))
    // 轻步骤 python 在 H1 上通过了，仍按整次运行的范围跑（H1 全量：跑）；H1..HEAD 没碰 Python 工具。
    expect(resumed.trace.get('python')).toBe('true')

    const record = runRecord(fx.root, h2)
    expect(record).toMatchObject({
      mode: 'resume',
      admission: true,
      fullRequested: false,
      head: h2,
      base: h1,
      failedStep: null,
      resumeFrom: {
        head: h1,
        tree: fx.git('rev-parse', `${h1}^{tree}`),
        failedStep: 'lint:oxlint',
        mode: 'full',
        fullRequested: true,
      },
    })
    expect(record.steps.every(step => step.ran && step.exit === 0)).toBe(true)
    // H1 的目录还在（不再每次清空整个 tmp/check-run），两次准入各留一份记录。
    expect(existsSync(join(fx.root, CHECK_RUN_RECORD_DIR, h1.slice(0, 9), RUN_RECORD_FILE))).toBe(
      true,
    )
    expect(recordsIn(fx.root, ADMISSION_RECORD_DIR)).toHaveLength(2)

    const short = (sha: string) => sha.slice(0, 9)
    // 准入日志名是「时间（只到秒）-头短号」：同一秒里的两次运行按短号排、不按先后，不能取排序后的最后一个；按 H2 的短号认它的日志。
    const logs = readdirSync(join(fx.root, ADMISSION_RECORD_DIR)).filter(name =>
      name.endsWith(`-${short(h2)}.log`),
    )
    expect(logs).toHaveLength(1)
    const log = readFileSync(join(fx.root, ADMISSION_RECORD_DIR, logs[0] ?? ''), 'utf8')
    expect(log).toContain(
      `准入证据：${short(h1)} 全量（失败于 lint:oxlint）＋ ${short(h2)} 增量（基线 ${short(h1)}）`,
    )
    expect(log).toMatch(/^ {2}整次：.*test（/mu)
    expect(log).toMatch(/^ {2}整次：.*python（轻步骤，按整次运行的范围）/mu)
    expect(log).toMatch(/^ {2}按影响面：.*typecheck（/mu)
    expect(log).toMatch(/^ {2}常驻：.*lint:oxlint（/mu)
    expect(log).toContain(`${short(h1)}..${short(h2)} 差异 1 个文件：\n  members/c/lint.txt`)
    expect(log).toContain(`判为按影响面：接续 ${short(h1)} 的全量准入（失败于 lint:oxlint）`)
    expect(log.trimEnd().endsWith('exit=0')).toBe(true)
  })

  it('前提不满足以 2 退出，不写日志与记录：没有记录的头、不在准入模式、H1 就是当前头、与 --list 同给', async () => {
    const before = recordsIn(fx.root, ADMISSION_RECORD_DIR)
    const noRecord = await check({ resumeFrom: h0 })
    expect(noRecord.code).toBe(2)
    expect(noRecord.output.join('\n')).toContain('拒绝接续：')
    expect(noRecord.output.join('\n')).toContain('没有准入记录')
    const notAdmission = await check({ resumeFrom: h1, admission: false })
    expect(notAdmission.code).toBe(2)
    expect(notAdmission.output.join('\n')).toContain('只用于准入运行')
    const same = await check({ resumeFrom: h2 })
    expect(same.code).toBe(2)
    expect(same.output.join('\n')).toContain('就是当前头，没有修复提交；要重跑请整次准入')
    printed.length = 0
    const list = await runCheck(
      fx.root,
      { admission: true, keepGoing: false, list: true, resumeFrom: h1 },
      { steps: fx.steps },
    )
    expect(list).toBe(2)
    expect(printed.join('\n')).toContain('--list 只打印步骤表，不能与 --resume-from 同时给')
    expect(recordsIn(fx.root, ADMISSION_RECORD_DIR)).toEqual(before)
    expect(noRecord.trace.size + notAdmission.trace.size + same.trace.size + fx.trace().size).toBe(
      0,
    )
  })

  it('真实 CLI：check --admission --resume-from <没有记录的头> 以 2 退出并写明原因', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', CLI, 'check', '--admission', '--resume-from', h0],
      {
        cwd: fx.root,
        encoding: 'utf8',
        env: { ...process.env, OMNE_SUBJECT_ROOT: fx.root },
      },
    )
    expect(result.status, result.stderr).toBe(2)
    expect(result.stdout).toContain('拒绝接续：')
  })

  it('H1..HEAD 碰到全局路径：不接续，整次全量，日志写明原因，记录是一次全量', async () => {
    writeFileSync(
      join(fx.root, 'package.json'),
      '{ "name": "fixture-root", "private": true, "packageManager": "pnpm@10.28.1", "x": 1 }\n',
    )
    const h3 = fx.commit('card: touch root manifest')
    const degraded = await check({ resumeFrom: h1 })
    expect(degraded.code).toBe(0)
    expect(members(degraded.trace.get('typecheck'))).toEqual(new Set(TEST_MEMBERS))
    expect(degraded.trace.get('python')).toBe('true')
    const record = runRecord(fx.root, h3)
    // 整次重跑的范围同 H1 那次；H1 带了 FULL=1，记录照记。
    expect(record).toMatchObject({
      mode: 'full',
      fullRequested: true,
      resumeFrom: null,
      base: null,
      failedStep: null,
      dirty: false,
    })
    const text = degraded.output.join('\n')
    expect(text).toContain('不接续')
    expect(text).toContain('package.json')
    expect(text).toContain('判为全量：FULL=1：要求全量')
  })

  it('运行中工作树多出没被忽略的文件：记录记 dirty，日志写明；没带 FULL=1 的运行记 fullRequested 为假', async () => {
    const head = fx.git('rev-parse', 'HEAD')
    process.env['FAKE_STRAY'] = 'stray.txt'
    try {
      const strayed = await check()
      expect(strayed.code).toBe(0)
    } finally {
      delete process.env['FAKE_STRAY']
    }
    expect(existsSync(join(fx.root, 'stray.txt'))).toBe(true)
    expect(runRecord(fx.root, head)).toMatchObject({ dirty: true, fullRequested: false })
    expect(printed.join('\n')).toContain('记录记 dirty')
    rmSync(join(fx.root, 'stray.txt'))
    // 同一个头再跑一次、工作树干净：不是 dirty。trace.txt 与 tmp/ 被忽略，不算。
    await check()
    expect(runRecord(fx.root, head).dirty).toBe(false)
  })
})

describe('H1 按影响面准入时的接续', { timeout: 240_000 }, () => {
  // H1 的影响面（合并点..H1）与 H1..HEAD 的影响面合起来就是 HEAD 相对本次基线的影响面：
  // 所以接续的「整次」只按本次基线的影响面跑，不比 H1 宽；合并点变了就合不起来，拒绝。
  let fa: Fixture
  let h0 = ''
  let h1 = ''
  let h2 = ''
  let firstCode: number | undefined
  const short = (sha: string) => sha.slice(0, 9)

  beforeAll(async () => {
    fa = fixture()
    h0 = fa.git('rev-parse', 'HEAD')
    writeFileSync(join(fa.root, 'members/a/src.ts'), 'export const v = 2\n')
    writeFileSync(join(fa.root, 'members/c/lint.txt'), 'bad\n')
    h1 = fa.commit('card: break lint')
    firstCode = (await check({}, fa)).code
    writeFileSync(join(fa.root, 'members/c/lint.txt'), 'good\n')
    h2 = fa.commit('card: fix lint')
  }, 240_000)

  afterAll(() => {
    rmSync(fa.root, { recursive: true, force: true })
  })

  it('H1 那次按影响面的准入：记录写 affected、base 是本次基线与头的合并点、没带 FULL=1', () => {
    expect(firstCode).toBe(1)
    expect(runRecord(fa.root, h1)).toMatchObject({
      mode: 'affected',
      fullRequested: false,
      base: h0,
      failedStep: 'lint:oxlint',
    })
  })

  it('本次基线的合并点与 H1 记录的不同：拒绝，以 2 退出，写明两个合并点', async () => {
    process.env['BASELINE'] = h1
    try {
      const moved = await check({ resumeFrom: h1 }, fa)
      expect(moved.code).toBe(2)
      const text = moved.output.join('\n')
      expect(text).toContain('拒绝接续：')
      expect(text).toContain(`影响面准入基线是 ${short(h0)}`)
      expect(text).toContain(`合并点是 ${short(h1)}`)
      expect(moved.trace.size).toBe(0)
    } finally {
      delete process.env['BASELINE']
    }
  })

  it('合并点相同：接受；没跑到的步骤按 HEAD 相对本次基线的影响面整次跑（只选 a、b，不取全量），证据写「影响面准入」', async () => {
    const resumed = await check({ resumeFrom: h1 }, fa)
    expect(resumed.code).toBe(0)
    // HEAD 相对本次基线的影响面是 a（改了）与 b（依赖 a）：c 的 lint.txt 已改回基线的内容；全量才会带上 c、d。
    const affected = new Set(['members/a', 'members/b'])
    expect(members(resumed.trace.get('test'))).toEqual(affected)
    expect(members(resumed.trace.get('build'))).toEqual(affected)
    expect(members(resumed.trace.get('acceptance'))).toEqual(new Set(['members/a']))
    // 类型检查在 H1 上通过了，只跑 H1..HEAD 影响到的 c。
    expect(members(resumed.trace.get('typecheck'))).toEqual(new Set(['members/c']))

    expect(runRecord(fa.root, h2)).toMatchObject({
      mode: 'resume',
      base: h1,
      failedStep: null,
      resumeFrom: { head: h1, failedStep: 'lint:oxlint', mode: 'affected', fullRequested: false },
    })
    const text = resumed.output.join('\n')
    expect(text).toContain(
      `准入证据：${short(h1)} 影响面准入（失败于 lint:oxlint）＋ ${short(h2)} 增量（基线 ${short(h1)}）`,
    )
    expect(text).toContain(`的影响面基线与本次相同：main，合并点 ${short(h0)}`)
    expect(text).toMatch(/^ {2}整次（本次基线的影响面）：.*test（/mu)
  })

  it('接续运行的记录不作下一次接续的 H1：拒绝，以 2 退出', async () => {
    writeFileSync(join(fa.root, 'members/d/src.ts'), 'export const v = 3\n')
    fa.commit('card: touch d')
    const chained = await check({ resumeFrom: h2 }, fa)
    expect(chained.code).toBe(2)
    expect(chained.output.join('\n')).toContain('接续不链式')
    expect(chained.trace.size).toBe(0)
  })
})
