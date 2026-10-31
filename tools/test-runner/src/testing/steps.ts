// `pnpm run check` 里按计划执行的几步：pytest、构建、类型检查、成员测试（快慢两层）、可执行验收；
// 以及它们共用的「跑一批成员的脚本并写耗时账本」。计划由 `scope.ts` 算（受影响的成员由 turbo 给出），
// 这里只照着执行、照实说跳了什么。构建、类型检查与成员测试交给 turbo，可执行验收仍由本工具逐成员跑。
import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { budgetFor, describeBudget, type Budget } from './parallelism.ts'
import {
  changedFiles,
  coordinates,
  fileAt,
  type Coordinates,
} from '@omne-harness/repo-toolchain/core/git'
import { lockfileImpact, type LockfileImpact } from './lockfile-impact.ts'
import { describeCheckPlan, LOCKFILE_PATH, planCheck, type CheckPlan } from './scope.ts'
import {
  admissionRequested,
  affectedMembers,
  dependentMembers,
  turboBuild,
  turboTypecheck,
} from './turbo.ts'
import { checkTypecheckScopes } from './typecheck-scope.ts'
import {
  CONFIG_PATH,
  effectiveParallelism,
  ledgerHome,
  readTestRunsConfig,
  TIER_NAMES,
  type RunScript,
  type RunTier,
} from './config.ts'
import {
  buildLedger,
  emptyLedger,
  ledgerSummary,
  testCount,
  type LedgerFile,
  type MemberRun,
  type RunMeta,
} from './ledger.ts'
import {
  builtFromPath,
  cacheMeta,
  cachePolicy,
  clearBuiltFrom,
  currentDigests,
  outputDigests,
  readBuiltFrom,
  lookupCache,
  recordCache,
  writeBuiltFrom,
  type BuiltMember,
  type BuiltFromRead,
  type CacheLookup,
  type CachePolicy,
} from './test-cache.ts'
import {
  fileTree,
  listWorkspaceMembers,
  listTestMembers,
  withScript,
  type TestMember,
  type WorkspaceMember,
} from '@omne-harness/repo-toolchain/core/workspace'
import { runMembers, runTurboTests, slugOf } from './run.ts'
import { buildTargets, pnpmCommand, timestamp } from './support.ts'

/**
 * `run` 的缓存策略：`FULL=1` 时不读；`build` 为本次调用是否为被选中的成员构建，没构建就不写。
 * 所以不带 `--build` 的 `FULL=1 pnpm run test`（`run --all`）既不读也不写。
 */
export function runCachePolicy(
  env: Readonly<Record<string, string | undefined>>,
  options: { readonly noCache: boolean; readonly build: boolean },
): CachePolicy {
  return cachePolicy(env, { ...options, full: fullRequested(env) })
}

/** 环境变量 `FULL`：`1` 要全量，不设或空串不要；别的值报错，不猜。 */
export function fullRequested(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env['FULL']
  if (value === undefined || value === '') return false
  if (value === '1') return true
  throw new Error(`环境变量 FULL 只能是 1 或不设，现在是 ${value}`)
}

/** 计划文件：计划连同它是对哪个提交、哪个基线算的。 */
export interface PlanFile {
  readonly head: string
  readonly dirty: boolean
  readonly base: { readonly ref: string; readonly mergeBase: string }
  readonly plan: CheckPlan
}

/**
 * 基线提交与 HEAD（`head` 为 undefined 时取工作树）两份 `pnpm-lock.yaml` 的影响面（lockfile-impact.ts）。
 * 哪一边没有锁文件就判全量并写明：没有可比的两份，不猜。
 */
export function lockfileImpactBetween(
  root: string,
  base: string,
  head: string | undefined,
  members: readonly { readonly path: string }[],
): LockfileImpact {
  const baseText = fileAt(root, base, LOCKFILE_PATH)
  if (baseText === undefined)
    return { kind: 'full', reason: `基线 ${base.slice(0, 9)} 上没有 ${LOCKFILE_PATH}，判为全量` }
  const headText = head === undefined ? worktreeLockfile(root) : fileAt(root, head, LOCKFILE_PATH)
  if (headText === undefined)
    return {
      kind: 'full',
      reason: `${head === undefined ? '工作树' : `HEAD ${head.slice(0, 9)}`} 里没有 ${LOCKFILE_PATH}，判为全量`,
    }
  return lockfileImpact(baseText, headText, members)
}

function worktreeLockfile(root: string): string | undefined {
  try {
    return readFileSync(join(root, LOCKFILE_PATH), 'utf8')
  } catch {
    return undefined
  }
}

/** 算这个检出相对基线的计划。基线不存在、取不到改动都抛错（引擎出错不改判全量）。 */
export function computePlan(root: string, baseRef: string, full: boolean): PlanFile {
  const config = readTestRunsConfig()
  const at = coordinates(root, baseRef)
  if (at.base === undefined) throw new Error(`算不出基线 ${baseRef} 的合并点`)
  const mergeBase = at.base.mergeBase
  const members = listWorkspaceMembers(fileTree(root), config.affected.excludeRoots)
  const plan = planCheck(
    changedFiles(root, mergeBase),
    members,
    config.affected,
    affectedMembers(root, members, mergeBase),
    full,
    paths => dependentMembers(root, members, paths),
    () => lockfileImpactBetween(root, mergeBase, undefined, members),
  )
  return { head: at.head, dirty: at.dirty, base: at.base, plan }
}

export function describePlanFile(root: string, file: PlanFile): string[] {
  return [
    `影响面（基线 ${file.base.ref}，合并点 ${file.base.mergeBase.slice(0, 9)}，提交 ${file.head.slice(0, 9)}${file.dirty ? '，含未提交改动' : ''}）`,
    ...describeCheckPlan(file.plan, readTestRunsConfig().affected, relative(root, CONFIG_PATH)),
  ]
}

export function writePlanFile(path: string, file: PlanFile): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`)
}

/** 读计划文件；它算的不是当前提交就报错——计划与执行之间提交变了，计划就不再描述这次改动。 */
export function readPlanFile(root: string, path: string): PlanFile {
  if (!existsSync(path)) throw new Error(`计划文件 ${path} 不存在：先跑 cli.ts plan --json ${path}`)
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isPlanFile(parsed)) throw new Error(`计划文件 ${path} 的形状不对：重新算计划`)
  baselines(root, parsed.base.ref)
  const head = coordinates(root, undefined).head
  if (parsed.head !== head)
    throw new Error(
      `计划文件 ${path} 是对提交 ${parsed.head.slice(0, 9)} 算的，现在是 ${head.slice(0, 9)}：重新算计划`,
    )
  return parsed
}

/** 只核执行要用到的几栏；计划文件由本工具在同一次检查里刚写出。 */
function isPlanFile(value: unknown): value is PlanFile {
  if (typeof value !== 'object' || value === null) return false
  const { head, base, plan } = value as Record<string, unknown>
  if (typeof head !== 'string' || typeof base !== 'object' || base === null) return false
  if (typeof plan !== 'object' || plan === null) return false
  const fields = plan as Record<string, unknown>
  return (
    (fields['mode'] === 'full' || fields['mode'] === 'scoped') &&
    typeof fields['reason'] === 'string' &&
    ['build', 'typecheck', 'test', 'acceptance'].every(key => Array.isArray(fields[key])) &&
    typeof fields['python'] === 'object' &&
    fields['python'] !== null
  )
}

/** 计划里的成员目录换成成员；目录已不是成员就报错。 */
function membersAt(root: string, paths: readonly string[]): WorkspaceMember[] {
  const config = readTestRunsConfig()
  const members = listWorkspaceMembers(fileTree(root), config.affected.excludeRoots)
  const byPath = new Map(members.map(member => [member.path, member]))
  return paths.map(path => {
    const member = byPath.get(path)
    if (member === undefined) throw new Error(`计划里的 ${path} 不是 workspace 成员`)
    return member
  })
}

function spawnInherited(
  root: string,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): number {
  console.log(`$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  return result.status ?? 1
}

export function pythonStep(root: string, file: PlanFile): number {
  if (!file.plan.python.run) {
    console.log(`pytest：跳过——${file.plan.python.reason}`)
    return 0
  }
  console.log(`pytest：跑——${file.plan.python.reason}`)
  const runner = process.env['OMNE_RUNNER_ROOT']
  // 与根脚本 test:python 一致：被检查的检出里没有 tooling 的 conftest 时，xdist 退回单进程。
  // 只放进子进程的环境，不写本进程的 process.env；调用方已设的值照旧生效。
  const env: NodeJS.ProcessEnv = { PYTEST_XDIST_AUTO_NUM_WORKERS: '0', ...process.env }
  return runner === undefined
    ? spawnInherited(
        root,
        pnpmCommand().command,
        [...pnpmCommand().args, '--silent', 'run', 'test:python'],
        env,
      )
    : spawnInherited(
        root,
        'uv',
        [
          'run',
          '--project',
          runner,
          '--locked',
          'pytest',
          '--ignore-glob=*.legacy',
          '-c',
          join(runner, 'pyproject.toml'),
          '--basetemp',
          join(root, 'tmp/test-runs'),
          '-n',
          'auto',
          '--dist',
          'worksteal',
          ...[
            'tools/spec-tools/tests',
            '.meta_harness/tooling/tests',
            '.meta_harness/agents/skills/design-subagents/canonical/scripts',
          ].map(path => join(root, path)),
        ],
        env,
      )
}

/**
 * 构建：按计划点名，turbo 先构建它们的上游；`OMNE_ADMISSION=1` 时本地缓存只写不读。同时构建的成员数取预算。
 * 给了计划文件路径时，构建成功后在它旁边写构建记录（`built-from.json`）：每个被构建成员在构建开始前的输入摘要。
 * 摘要在构建开始前取，构建期间改动的文件算「这次构建没看到」。构建成功后再记产物摘要：本成员与上游成员 `dist/` 里全部文件的路径、字节数与 mtimeMs。
 * 构建失败或摘要取不到时不留记录，旧记录先删掉。
 */
export function buildStep(root: string, file: PlanFile, budget: Budget, planPath?: string): number {
  const paths = file.plan.build.map(entry => entry.path)
  if (paths.length === 0) {
    console.log('构建：跳过——没有被选中的成员')
    return 0
  }
  console.log(
    `构建：${paths.length} 个成员及其上游——${paths.join('、')}（同时 ${budget.workers} 个；${describeBudget(budget)}）`,
  )
  const names = membersAt(root, paths).map(member => member.name)
  const recordPath = planPath === undefined ? undefined : builtFromPath(planPath)
  if (recordPath !== undefined) clearBuiltFrom(recordPath)
  let digests: ReadonlyMap<string, string> | undefined
  if (recordPath !== undefined) {
    try {
      digests = currentDigests({
        root,
        targets: paths,
        config: readTestRunsConfig(),
        env: process.env,
      })
    } catch (error) {
      console.log(
        `构建记录：取不到输入摘要，不留记录，后面的测试不写缓存——${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  const code = turboBuild(root, names, admissionRequested(process.env), budget.workers)
  if (code === 0 && recordPath !== undefined && digests !== undefined)
    try {
      const outputs = outputDigests({ root, targets: paths, config: readTestRunsConfig() })
      const members = new Map<string, Required<BuiltMember>>()
      for (const [member, input] of digests) {
        const output = outputs.get(member)
        if (output !== undefined) members.set(member, { input, output })
      }
      writeBuiltFrom(recordPath, file.head, members)
    } catch (error) {
      console.log(
        `构建记录：取不到产物摘要，不留记录，后面的测试不写缓存——${error instanceof Error ? error.message : String(error)}`,
      )
    }
  return code
}

/** 没有可用构建记录时不写缓存的原因：没有记录文件、记录是另一个提交的、记录是旧格式，分开写。 */
function unbuiltReason(read: Exclude<BuiltFromRead, { status: 'ok' }>, head: string): string {
  switch (read.status) {
    case 'missing':
      return '计划旁边没有构建记录，测试可能跑的是旧 dist'
    case 'other-head':
      return `构建记录是另一个提交的（记录 ${read.recorded.slice(0, 9)}，现在 ${head.slice(0, 9)}），测试可能跑的是旧 dist`
    case 'legacy':
      return '构建记录是旧格式，测试可能跑的是旧 dist'
  }
}

/**
 * `step test` 的缓存策略与构建记录。带计划文件时，前面的构建一步在另一个进程里构建，并在计划文件旁写了构建记录；
 * 没有记录（手工 `--plan`、前面没构建、记录是另一个提交的）就不写缓存。不带计划文件时由 turbo 先构建，记录取自这次运行自己。
 */
export function stepTestCache(
  env: Readonly<Record<string, string | undefined>>,
  options: {
    readonly planPath: string | undefined
    readonly head: string
    readonly noCache: boolean
    readonly full: boolean
  },
): {
  readonly policy: CachePolicy
  readonly builtFrom: ReadonlyMap<string, BuiltMember> | undefined
} {
  const read =
    options.planPath === undefined
      ? undefined
      : readBuiltFrom(builtFromPath(options.planPath), options.head)
  const builtFrom = read?.status === 'ok' ? read.members : undefined
  return {
    policy: cachePolicy(env, {
      noCache: options.noCache,
      full: options.full,
      build: options.planPath === undefined || builtFrom !== undefined,
      ...(read === undefined || read.status === 'ok'
        ? {}
        : { unbuiltReason: unbuiltReason(read, options.head) }),
    }),
    builtFrom,
  }
}

/** 类型检查：按计划点名，由 turbo 运行；不依赖构建。先核对嵌套归档目录已在成员的 tsconfig 里排除。同时检查的成员数取预算。 */
export function typecheckStep(root: string, file: PlanFile, budget: Budget): number {
  const paths = file.plan.typecheck
  if (paths.length === 0) {
    console.log('类型检查：跳过——没有被选中的成员')
    return 0
  }
  const members = membersAt(root, paths)
  console.log(
    `类型检查：${paths.length} 个成员——${paths.join('、')}（同时 ${budget.workers} 个；${describeBudget(budget)}）`,
  )
  checkTypecheckScopes(root, members)
  return turboTypecheck(
    root,
    members.map(member => member.name),
    admissionRequested(process.env),
    budget.workers,
  )
}

/** 一次记账本的运行：跑哪些成员、哪一层，以及账本抬头里写的范围。 */
export interface RecordedRun {
  readonly script: RunScript
  readonly tier: RunTier
  readonly targets: readonly TestMember[]
  /** 运行前构建目标连同依赖：测试由 turbo 按任务依赖在同一次运行里构建，验收在运行前构建。false 时调用方已经构建过。 */
  readonly build: boolean
  readonly out: string | undefined
  readonly at: Coordinates
  /** 账本抬头的 `base`：跑的是全部成员时为 null。 */
  readonly base: RunMeta['base']
  readonly plan: RunMeta['plan']
  readonly scope?: RunMeta['scope']
  /** 这一次运行的工作进程预算：并行度由它推出来（环境变量可盖过），账本记下它的来历。 */
  readonly budget: Budget
  /**
   * 构建记录（成员目录到构建时输入摘要）：调用方在别的进程里构建过时给，来自 `built-from.json`。
   * 不给且 `build` 为真时，本进程的构建由这次运行自己做，记录取开跑前的输入摘要。
   */
  readonly builtFrom?: ReadonlyMap<string, BuiltMember>
  /** 成员测试的结果缓存策略（`test-cache.ts`）；不给就不查也不写（验收不缓存）。 */
  readonly cache?: CachePolicy
}

function runDirOf(run: RecordedRun): string {
  return resolve(
    run.out ??
      join(
        ledgerHome(run.script, run.at.mainRoot, process.env),
        `${run.at.shortHead}${run.at.dirty ? '-dirty' : ''}`,
        `${timestamp(new Date())}${run.tier === 'all' ? '' : `-${run.tier}`}`,
      ),
  )
}

/** 跑 `targets` 的脚本并写账本；退出码只反映是否全过。 */
export async function recordedRun(root: string, run: RecordedRun): Promise<number> {
  const { script, tier, targets, budget } = run
  const config = readTestRunsConfig()
  const parallel = effectiveParallelism(config, process.env, budget)
  const runDir = runDirOf(run)
  mkdirSync(runDir, { recursive: true })
  // 测试的构建由 turbo 按任务依赖在同一次运行里做；验收不经 turbo，先在这里构建。
  if (script === 'acceptance' && run.build && !buildTargets(root, targets, runDir, budget.workers))
    return 1

  // 成员测试先查缓存：命中的不跑；查不了（快照、依赖图取不到）就全部照跑、不写。
  const found =
    script === 'test' && run.cache !== undefined
      ? lookupCache({
          root,
          mainRoot: run.at.mainRoot,
          targets: targets.map(member => member.path),
          tier,
          policy: run.cache,
          config,
          env: process.env,
        })
      : undefined
  // 构建记录：这次运行自己构建（turbo 在测试前构建）时，开跑前取的键就是「构建开始前」的输入。
  const builtFrom =
    found === undefined
      ? undefined
      : (run.builtFrom ??
        (run.build
          ? new Map([...found.keys].map(([member, { digest }]) => [member, { input: digest }]))
          : undefined))
  const lookup =
    found === undefined || builtFrom === undefined ? found : { ...found, built: builtFrom }
  const hits = lookup?.hits ?? new Map<string, never>()
  const toRun = targets.filter(member => !hits.has(member.path))
  if (lookup !== undefined)
    for (const line of describeLookup(lookup, targets.length)) console.log(line)

  const meta = {
    script,
    tier,
    head: run.at.head,
    branch: run.at.branch,
    dirty: run.at.dirty,
    base: run.base,
    startedAt: new Date().toISOString(),
    parallel,
    cores: budget.machine.cores,
    plan: run.plan,
    ...(run.scope === undefined ? {} : { scope: run.scope }),
    // 这次覆盖的成员：跑了的与缓存命中的；哪些命中、来源在哪见 `cache`，成员一级的读数只有跑了的。
    members: targets.map(member => member.path),
    // 账本类型来自钉住的 repo-toolchain；预算的来历作为额外一栏记下，供按机器比较账本。
    budget: {
      workers: budget.workers,
      idleFraction: Math.round(budget.machine.idleFraction * 100) / 100,
      freeMemoryMiB: budget.machine.freeMemoryMiB,
    },
  }
  if (script === 'test' && toRun.length === 0)
    console.log(`${targets.length} 个成员全部命中缓存，没有执行（${TIER_NAMES[tier]}）`)
  else
    console.log(
      `跑 ${toRun.length} 个成员的 \`${script}\`${script === 'test' ? `（${TIER_NAMES[tier]}）` : ''}：` +
        `同时 ${parallel.memberConcurrency} 个成员、每个至多 ${parallel.vitestMaxWorkers} 个工作进程（${describeBudget(budget)}）`,
    )
  const started = Date.now()
  let finishedBefore = 0
  for (const [member, entry] of hits) {
    finishedBefore += 1
    console.log(
      `[${finishedBefore}/${targets.length}] ✓ ${member} 缓存命中，${entry.tests} 条用例，来源 ${entry.ledger}`,
    )
  }
  const report = (done: MemberRun, finished: number) => {
    const tests = done.report === undefined ? undefined : testCount(done.report)
    console.log(
      `[${finishedBefore + finished}/${targets.length}] ${done.exitCode === 0 ? '✓' : '✗'} ${done.member} ${Math.round(done.wallSeconds)} 秒` +
        (tests === undefined ? '' : `，${tests} 条用例`) +
        (done.exitCode === 0
          ? ''
          : `，退出码 ${done.exitCode}，日志 ${join(runDir, `${slugOf(done.member)}.log`)}`),
    )
  }
  const runs =
    script !== 'test'
      ? await runMembers(root, targets, runDir, parallel, script, report)
      : toRun.length === 0
        ? []
        : await runTurboTests(
            root,
            toRun,
            runDir,
            parallel,
            tier,
            { build: run.build, admission: admissionRequested(process.env) },
            report,
          )
  const wallSeconds = (Date.now() - started) / 1000
  const recorded =
    lookup === undefined
      ? undefined
      : recordCache(lookup, runs, tier, { ledger: runDir, head: run.at.head, dirty: run.at.dirty })
  for (const line of recorded?.skipped ?? []) console.log(`测试缓存：${line}`)
  const cache =
    lookup === undefined || recorded === undefined ? {} : { cache: cacheMeta(lookup, recorded) }

  const ledger = buildLedger(runs, root, config.ledger.nearTimeoutRatio)
  const summary = ledgerSummary(ledger, {
    wallSeconds,
    slowFileSeconds: config.ledger.slowFileSeconds,
    nearTimeoutRatio: config.ledger.nearTimeoutRatio,
    top: config.ledger.top,
    runDir,
    ...(hits.size === 0 ? {} : { cachedMembers: hits.size }),
  })
  if (ledger.failures.length > 0)
    summary.push(`对这些失败做隔离重跑：pnpm run test:triage --run ${runDir}`)
  if (lookup !== undefined && recorded !== undefined)
    summary.push(...describeCacheResult(lookup, recorded))
  writeFileSync(
    join(runDir, 'ledger.json'),
    `${JSON.stringify({ meta: { ...meta, wallSeconds: Math.round(wallSeconds), ...cache }, ...ledger } satisfies LedgerFile & { meta: { budget: unknown; cache?: unknown } }, null, 1)}\n`,
  )
  writeFileSync(join(runDir, 'summary.md'), `${summary.join('\n')}\n`)
  console.log(summary.join('\n'))
  return runs.every(member => member.exitCode === 0) ? 0 : 1
}

/** 运行前说清缓存怎么用、命中了几个；整个缓存不可用时说原因。 */
function describeLookup(lookup: CacheLookup, total: number): string[] {
  if (lookup.unavailable !== undefined)
    return [`测试缓存：不可用——${lookup.unavailable}；${total} 个成员全部照跑，不写缓存`]
  const noWrite = lookup.policy.write ? '' : `；不写缓存（${lookup.policy.writeReason}）`
  const skipped =
    lookup.uncacheable.size === 0
      ? ''
      : `；${lookup.uncacheable.size} 个成员算不出键、不缓存：${[...lookup.uncacheable]
          .map(([member, reason]) => `${member}（${reason}）`)
          .join('、')}`
  if (!lookup.policy.read)
    return [
      `测试缓存：${lookup.policy.write ? '只写不读' : '不读'}（${lookup.policy.reason}；${lookup.home}）${skipped}${noWrite}`,
    ]
  return [
    `测试缓存：命中 ${lookup.hits.size} 个成员、跑 ${total - lookup.hits.size} 个` +
      `（键与影响面规则同源：成员自己、上游、读者规则点名与全局文件的内容摘要；${lookup.home}）${skipped}${noWrite}`,
  ]
}

/** 摘要里的缓存一行：命中几个、来源哪些账本、这次写了几个、写不进去的。 */
function describeCacheResult(
  lookup: CacheLookup,
  recorded: { readonly written: readonly string[]; readonly problems: readonly string[] },
): string[] {
  if (lookup.unavailable !== undefined) return [`缓存不可用：${lookup.unavailable}`]
  const sources = [...new Set([...lookup.hits.values()].map(entry => entry.ledger))]
  const lines = [
    `缓存命中 ${lookup.hits.size} 个成员` +
      (sources.length === 0 ? '' : `，来源 ${sources.join('、')}`) +
      `；本次写入 ${recorded.written.length} 个成员的完整通过` +
      (lookup.policy.read ? '' : `（只写不读：${lookup.policy.reason}）`),
  ]
  if (recorded.problems.length > 0)
    lines.push(`  缓存写不进去（按未命中处理）：${recorded.problems.join('；')}`)
  return lines
}

const planSummary = (plan: CheckPlan) => ({ mode: plan.mode, reason: plan.reason })

/** 合并前的成员测试：计划里的成员的快层，快层全部通过才跑慢层；跑了的层各写一份账本，每层开始时各看一次机器。
 * 计划为空时说「没有要跑的成员」，不算跑过。`build` 为 true 时由 turbo 先构建（单独运行）；准入检查里构建一步已经构建过，不再构建。 */
export async function testStep(
  root: string,
  file: PlanFile,
  build: boolean,
  cache: CachePolicy,
  builtFrom?: ReadonlyMap<string, BuiltMember>,
): Promise<number> {
  const config = readTestRunsConfig()
  const selected = new Set(file.plan.test)
  const targets = withScript(
    listWorkspaceMembers(fileTree(root), config.affected.excludeRoots),
    'test',
  ).filter(member => selected.has(member.path))
  if (targets.length !== selected.size)
    throw new Error('计划里的测试成员与现在的成员清单对不上：重新算计划')
  if (targets.length === 0) {
    console.log(
      `成员测试：没有要跑的成员（${file.plan.reason}）——这一步什么都没跑，不是「跑过了、全绿」`,
    )
    return 0
  }
  const at = coordinates(root, undefined)
  const common = {
    script: 'test',
    targets,
    build,
    out: undefined,
    at,
    base: file.plan.mode === 'full' ? null : file.base,
    plan: planSummary(file.plan),
    ...(builtFrom === undefined ? {} : { builtFrom }),
  } as const
  console.log(
    `成员测试：${file.plan.mode === 'full' ? '全部' : '按影响面'} ${targets.length} 个成员的快层，快层通过再跑慢层`,
  )
  return fastThenSlow(
    async tier =>
      recordedRun(root, { ...common, tier, cache, budget: await budgetFor(config.parallel) }),
    console.log,
  )
}

/** 快层失败时这一步的结论已定，不再跑慢层，也不写慢层账本；快层通过才跑慢层。 */
export async function fastThenSlow(
  run: (tier: 'fast' | 'slow') => Promise<number>,
  note: (text: string) => void,
): Promise<number> {
  if ((await run('fast')) !== 0) {
    note('快层未通过：慢层没有跑，这一步失败')
    return 1
  }
  return (await run('slow')) === 0 ? 0 : 1
}

/**
 * 计划跳过了全部验收时，为当前提交写一份账本：没跑任何成员、`scope` 里写明跳了谁、为什么。
 * 回路状态的验收耗时传感器认它（读数是「本次影响面不含带验收的成员」），不再因为没有记录而判没数据。
 */
export function recordSkippedAcceptance(
  at: Coordinates,
  env: Readonly<Record<string, string | undefined>>,
  plan: CheckPlan,
  base: PlanFile['base'],
  skipped: readonly string[],
): string {
  const runDir = join(
    ledgerHome('acceptance', at.mainRoot, env),
    `${at.shortHead}${at.dirty ? '-dirty' : ''}`,
    `${timestamp(new Date())}-skipped`,
  )
  mkdirSync(runDir, { recursive: true })
  const meta: RunMeta = {
    script: 'acceptance',
    tier: 'all',
    head: at.head,
    branch: at.branch,
    dirty: at.dirty,
    base,
    startedAt: new Date().toISOString(),
    parallel: { memberConcurrency: 1, vitestMaxWorkers: 1 },
    cores: availableParallelism(),
    plan: planSummary(plan),
    scope: { reason: '本次影响面不含带验收的成员', skipped },
    members: [],
    wallSeconds: 0,
  }
  const path = join(runDir, 'ledger.json')
  writeFileSync(
    path,
    `${JSON.stringify({ meta, ...emptyLedger() } satisfies LedgerFile, null, 1)}\n`,
  )
  return path
}

/** 可执行验收：只跑计划里有验收的成员（驱动前面构建好的 dist，不再构建）；一个都没有时记一份「跳过」的账本。 */
export async function acceptanceStep(
  root: string,
  file: PlanFile,
  budget: Budget,
): Promise<number> {
  const config = readTestRunsConfig()
  const accepting = listTestMembers(root, config.affected.excludeRoots, 'acceptance')
  const selected = new Set(file.plan.acceptance)
  const targets = accepting.filter(member => selected.has(member.path))
  const skipped = accepting.filter(member => !selected.has(member.path)).map(member => member.path)
  const at = coordinates(root, undefined)
  if (targets.length === 0) {
    const path = recordSkippedAcceptance(at, process.env, file.plan, file.base, skipped)
    console.log(
      `验收：跳过——本次影响面不含带验收的成员（${skipped.join('、') || '没有成员有验收'}）；记录：${path}`,
    )
    return 0
  }
  console.log(
    `验收：${targets.map(member => member.path).join('、')}` +
      (skipped.length > 0 ? `；跳过 ${skipped.join('、')}（不在本次影响面）` : ''),
  )
  return recordedRun(root, {
    script: 'acceptance',
    tier: 'all',
    targets,
    build: false,
    out: undefined,
    at,
    base: file.plan.mode === 'full' ? null : file.base,
    plan: planSummary(file.plan),
    scope: { reason: file.plan.reason, skipped },
    budget,
  })
}
