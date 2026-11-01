// 根脚本背后的几个入口脚本（scripts/ 下）与根 package.json 的 `test:python` 一行：只核它们拥有的部分——
// 参数怎样分派、谁占运行名额、先后与退出码。
// 真正的命令换成记录参数的假程序：node、uv 放在 PATH 前面，运行名额与钉住的 omne-metrics 放在脚本找它们的位置；
// 要核「名额被占时不起命令」的用例换用真实的名额脚本与私有锁目录。
// 每次起脚本都带时限，到时连整棵进程树一起杀：被测脚本挂住或无限重入时用例变红，不留孤儿进程（#979 事故）。
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const WINDOWS = process.platform === 'win32'

/**
 * 一次 `run` 的时限：到时杀整棵进程树并按失败返回。正常一次不到一秒。机器满载时用例自己的时限先到，
 * 这时由 afterEach 兜底杀树。
 */
const RUN_TIMEOUT_MS = 10_000
/** 杀树之后等子进程关闭标准错误管道的上限；超过就按已杀处理，不让一个残留的管道持有者拖住用例。 */
const CLOSE_GRACE_MS = 2_000

/**
 * 杀掉 pid 及其全部后代。POSIX 杀 `run` 起时另建的进程组。Windows 上被测脚本是 MSYS 进程：它 fork 与 exec 出的进程在
 * Windows 看来不是它的后代，taskkill /T 够不到（#979 事故里孤儿就是这样留下的），所以先按 MSYS 的进程组杀
 * （`ps -W` 把 Windows 进程号映射到组号），再 taskkill /T 收拾非 MSYS 的后代。目标已经不在时静默。
 */
function killTree(pid: number): void {
  if (!WINDOWS) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      // 进程组已经不在
    }
    return
  }
  spawnSync(
    'bash',
    [
      '-c',
      'pgid=$(ps -W | awk -v w="$1" \'$4 == w { print $3; exit }\'); [[ -n "$pgid" ]] && kill -9 -- "-$pgid"',
      'kill-tree',
      String(pid),
    ],
    { stdio: 'ignore' },
  )
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
}

/** 进程还在不在：信号 0 只探测不投递；没权限探测的算还在。 */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const homes: string[] = []
const active = new Set<ChildProcess>()
afterEach(() => {
  // 用例超时或断言失败时 `run` 可能还没返回：先把它起的进程树杀干净，再删夹具目录（目录被占着时删不掉）。
  for (const child of active) if (child.pid !== undefined) killTree(child.pid)
  active.clear()
  for (const home of homes.splice(0))
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

const SCRIPTS = [
  'metrics.sh',
  'slot-unless-plan-only.sh',
  'test-tier.sh',
  'check-design.sh',
  'check.sh',
  'git-environment.sh',
]

function executable(path: string, text: string): void {
  writeFileSync(path, text)
  chmodSync(path, 0o755)
}

/** 根 package.json 里一条脚本的命令行。 */
function rootScript(name: string): string {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  )
  const scripts =
    typeof parsed === 'object' && parsed !== null && 'scripts' in parsed
      ? parsed.scripts
      : undefined
  const line =
    typeof scripts === 'object' && scripts !== null && name in scripts
      ? (scripts as Record<string, unknown>)[name]
      : undefined
  if (typeof line !== 'string') throw new Error(`根 package.json 没有脚本 ${name}`)
  return line
}

/** 一次 `run` 的结果。`timedOut` 为真时脚本没在时限内结束，整棵进程树已被杀，`status` 为 null。 */
interface Ran {
  readonly status: number | null
  readonly stderr: string
  readonly lines: string[]
  readonly timedOut: boolean
  readonly pid: number | undefined
}

/**
 * 夹具。`realSlot` 时放真实的名额脚本（`with-test-slot.sh` 与 `.mjs`），锁目录与账本指到夹具里；
 * 否则放只记参数、打上已持有标记再执行命令的替身。
 */
function fixture(options: { readonly realSlot?: boolean } = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-entry-scripts-')))
  homes.push(home)
  const root = join(home, 'root'),
    bin = join(home, 'bin'),
    trace = join(home, 'trace'),
    pidsFile = `${trace}.pids`
  for (const dir of [join(root, 'scripts'), join(root, 'node_modules/.bin'), bin])
    mkdirSync(dir, { recursive: true })
  for (const name of SCRIPTS)
    executable(
      join(root, 'scripts', name),
      readFileSync(new URL(`../../../scripts/${name}`, import.meta.url), 'utf8'),
    )
  if (options.realSlot === true)
    for (const name of ['with-test-slot.sh', 'with-test-slot.mjs'])
      executable(
        join(root, 'scripts', name),
        readFileSync(new URL(`../../../scripts/${name}`, import.meta.url), 'utf8'),
      )
  // 运行名额的替身：记下命令，给它打上「已持有名额」的标记再执行——真的名额脚本也这样做
  // （with-test-slot.mjs 给子进程 OMNE_TEST_SLOT_HELD）。check.sh 看不到这个标记就再去占名额：替身不打标记时
  // 它会无限重入自己，MSYS 上每一跳都留下一个进程（#979 事故）。标记已在时再被叫到，说明被测脚本无视了它：
  // 立刻以 97 退出、不执行命令，用例看到的是失败而不是挂住。
  else
    executable(
      join(root, 'scripts/with-test-slot.sh'),
      `#!/usr/bin/env bash
if [[ -n "\${OMNE_TEST_SLOT_HELD:-}" ]]; then echo "with-test-slot 替身在名额已持有时被重入：$*" >&2; exit 97; fi
printf "slot|%s\\n" "$*" >> "$TRACE"
OMNE_TEST_SLOT_HELD=stub exec "$@"
`,
    )
  // omne-metrics 另记下收到的覆盖率并发度（环境变量）与 --plan 指向的文件在它运行时是否存在。
  executable(
    join(root, 'node_modules/.bin/omne-metrics'),
    `#!/usr/bin/env bash
printf 'omne-metrics|%s\\n' "$*" >> "$TRACE"
printf 'parallel|%s\\n' "\${OMNE_METRICS_COVERAGE_PARALLEL-unset}" >> "$TRACE"
while (( $# )); do
  if [[ "$1" == --plan ]]; then [[ -f "$2" ]] && echo "plan-file|present" >> "$TRACE"; fi
  shift
done
`,
  )
  // node 只认测试运行器的 plan 与 coverage-parallel：前者写出 --json 指向的计划文件，FAIL_NODE 给出它的退出码；
  // 后者打印 PARALLEL（缺省 3x5），FAIL_PARALLEL 给出它的退出码。真实的名额脚本要起真的 node，那时不放这个替身。
  // HANG_NODE 模拟运行器挂住：记下自己与 sleep 的进程号（Windows 上记 Windows 进程号）供用例核对它们被杀，然后一直等。
  if (options.realSlot !== true)
    executable(
      join(bin, 'node'),
      `#!/usr/bin/env bash
printf 'node|%s\\n' "$*" >> "$TRACE"
if [[ -n "\${HANG_NODE:-}" ]]; then
  winpid() { cat "/proc/$1/winpid" 2>/dev/null || echo "$1"; }
  sleep 600 &
  printf '%s\\n' "$(winpid $$)" "$(winpid $!)" > "\${TRACE}.pids"
  wait
fi
if [[ " $* " == *" coverage-parallel "* ]]; then echo "\${PARALLEL:-3x5}"; exit "\${FAIL_PARALLEL:-0}"; fi
args=("$@")
for (( i = 0; i < \${#args[@]}; i++ )); do
  if [[ "\${args[i]}" == --json ]]; then echo '{}' > "\${args[i+1]}"; fi
done
exit "\${FAIL_NODE:-0}"
`,
    )
  // uv 被当作 pytest 起（给了 PYTEST_XDIST_AUTO_NUM_WORKERS）时，另记下 pytest 相关的两个环境变量。
  executable(
    join(bin, 'uv'),
    `#!/usr/bin/env bash
printf 'uv|%s\\n' "$*" >> "$TRACE"
if [[ -n "\${PYTEST_XDIST_AUTO_NUM_WORKERS-}" ]]; then
  printf 'uv-env|%s|%s\\n' "\${PYTHONDONTWRITEBYTECODE-unset}" "$PYTEST_XDIST_AUTO_NUM_WORKERS" >> "$TRACE"
fi
`,
  )
  const environment = (env: Record<string, string>): NodeJS.ProcessEnv => {
    // 这份测试自己可能就跑在名额里（准入）：清掉继承的标记，用例要给的自己给。
    const inherited: NodeJS.ProcessEnv = { ...process.env }
    delete inherited['OMNE_TEST_SLOT_HELD']
    return {
      ...inherited,
      PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}`,
      TRACE: trace,
      OMNE_TEST_SLOT_DIR: join(home, 'locks'),
      OMNE_TEST_SLOT_LEDGER: join(home, 'ledger.jsonl'),
      ...env,
    }
  }
  /** 经 bash 起一条命令，带时限；到时杀整棵进程树并按失败返回。`run` 与 `runLine` 都走这里。 */
  const launch = (
    bashArgs: string[],
    env: Record<string, string>,
    timeoutMs: number,
    cwd?: string,
  ): Promise<Ran> =>
    new Promise(resolve => {
      writeFileSync(trace, '')
      const child = spawn('bash', bashArgs, {
        env: environment(env),
        ...(cwd === undefined ? {} : { cwd }),
        // 标准输入不接管道：脚本不该读它，接了又不关就可能挂住。标准输出没有用例读，直接丢。
        stdio: ['ignore', 'ignore', 'pipe'],
        // POSIX 上另起进程组，杀树时按组杀；Windows 上 detached 会脱离 libuv 的 job，不用。
        detached: !WINDOWS,
        windowsHide: true,
      })
      active.add(child)
      let stderr = ''
      child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk
      })
      let timedOut = false
      let settled = false
      let timer: NodeJS.Timeout | undefined
      const settle = (status: number | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        active.delete(child)
        const lines = readFileSync(trace, 'utf8').split('\n').filter(Boolean)
        // 超时即失败：被杀的脚本报什么退出码（Windows 上 MSYS 进程报信号编码的数）都不作数。
        resolve({ status: timedOut ? null : status, stderr, lines, timedOut, pid: child.pid })
      }
      timer = setTimeout(() => {
        timedOut = true
        stderr += `\n[run] bash ${bashArgs.join(' ')} 超过 ${timeoutMs} 毫秒没结束，已杀整棵进程树`
        if (child.pid !== undefined) killTree(child.pid)
        setTimeout(() => settle(null), CLOSE_GRACE_MS).unref()
      }, timeoutMs)
      child.once('error', error => {
        stderr += error.message
        settle(null)
      })
      child.once('close', code => settle(code))
    })
  const run = (
    script: string,
    args: string[],
    env: Record<string, string> = {},
    timeoutMs = RUN_TIMEOUT_MS,
  ): Promise<Ran> => launch([join(root, 'scripts', script), ...args], env, timeoutMs)
  /** 在夹具根目录里经 bash 跑一整条命令行（根 package.json 脚本的写法）。 */
  const runLine = (line: string, env: Record<string, string> = {}): Promise<Ran> =>
    launch(['-c', line], env, RUN_TIMEOUT_MS, root)
  /** 在夹具的锁目录里放一份活着的名额登记（本进程的进程号、心跳新鲜）。 */
  const occupySlot = () => {
    mkdirSync(join(home, 'locks'), { recursive: true })
    writeFileSync(
      join(home, 'locks', 'slot-1.lock'),
      `pid=${process.pid}\nsince=${Math.floor(Date.now() / 1000)}\ncwd=${home}\ncmd=占着的\nbeat=5\n`,
    )
  }
  return { run, runLine, occupySlot, pidsFile }
}

describe('metrics.sh', () => {
  it('带 --coverage、没给 --plan：先算计划（--base 交给计划），再占名额以 --plan 交给 omne-metrics', async () => {
    const { run } = fixture()
    const ran = await run('metrics.sh', ['--base', 'abc', '--coverage', '--out', 'o'])
    expect(ran.status, ran.stderr).toBe(0)
    const [plan, slot, parallel, metrics, received, present] = ran.lines
    expect(plan).toMatch(
      /^node\|.*tools\/test-runner\/src\/testing\/cli\.ts plan --base abc --json \S+\/plan\.json$/u,
    )
    // 名额脚本用 Node 起命令，脚本要显式经 bash；占到名额后才向测试运行器要并发度。
    expect(slot).toMatch(
      /^slot\|bash scripts\/metrics\.sh --in-slot --plan \S+\/plan\.json --coverage --out o$/u,
    )
    expect(parallel).toBe(
      'node|--experimental-strip-types tools/test-runner/src/testing/cli.ts coverage-parallel',
    )
    expect(metrics).toMatch(/^omne-metrics\|--plan \S+\/plan\.json --coverage --out o$/u)
    expect(received).toBe('parallel|3x5')
    expect(present).toBe('plan-file|present')
  })

  it('带 --coverage 与 --plan：不另算计划，参数原样交下去并占名额，并发度经环境变量交给 omne-metrics', async () => {
    const { run } = fixture()
    const ran = await run('metrics.sh', ['--coverage', '--plan', 'p.json'], { PARALLEL: '4x2' })
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.lines).toEqual([
      'slot|bash scripts/metrics.sh --in-slot --coverage --plan p.json',
      'node|--experimental-strip-types tools/test-runner/src/testing/cli.ts coverage-parallel',
      'omne-metrics|--coverage --plan p.json',
      'parallel|4x2',
    ])
  })

  it('调用方已给并发度（环境变量或 --coverage-parallel）：不另算，原样交下去', async () => {
    const { run } = fixture()
    expect(
      (
        await run('metrics.sh', ['--coverage', '--plan', 'p.json'], {
          OMNE_METRICS_COVERAGE_PARALLEL: '1x1',
        })
      ).lines,
    ).toEqual([
      'slot|bash scripts/metrics.sh --in-slot --coverage --plan p.json',
      'omne-metrics|--coverage --plan p.json',
      'parallel|1x1',
    ])
    expect(
      (await run('metrics.sh', ['--coverage', '--plan', 'p.json', '--coverage-parallel', '2x2']))
        .lines,
    ).toEqual([
      'slot|bash scripts/metrics.sh --in-slot --coverage --plan p.json --coverage-parallel 2x2',
      'omne-metrics|--coverage --plan p.json --coverage-parallel 2x2',
      'parallel|unset',
    ])
  })

  it('要并发度失败：退出非零，不运行 omne-metrics', async () => {
    const { run } = fixture()
    const ran = await run('metrics.sh', ['--coverage', '--plan', 'p.json'], { FAIL_PARALLEL: '2' })
    expect(ran.status).toBe(2)
    expect(ran.lines.some(line => line.startsWith('omne-metrics|'))).toBe(false)
  })

  it('不带 --coverage：不算计划、不占名额，参数原样交下去', async () => {
    const { run } = fixture()
    const ran = await run('metrics.sh', ['--base', 'abc', '--out', 'o'])
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.lines).toEqual(['omne-metrics|--base abc --out o', 'parallel|unset'])
  })

  it('算计划失败：退出非零，不运行 omne-metrics', async () => {
    const { run } = fixture()
    const ran = await run('metrics.sh', ['--coverage'], { FAIL_NODE: '3' })
    expect(ran.status).toBe(3)
    expect(ran.lines.some(line => line.startsWith('omne-metrics|'))).toBe(false)
  })
})

describe('slot-unless-plan-only.sh', () => {
  it('实际运行时占名额；带 --plan-only 时不占', async () => {
    const { run } = fixture()
    expect((await run('slot-unless-plan-only.sh', ['node', 'cli.ts', 'run'])).lines).toEqual([
      'slot|node cli.ts run',
      'node|cli.ts run',
    ])
    expect(
      (await run('slot-unless-plan-only.sh', ['node', 'cli.ts', 'run', '--plan-only'])).lines,
    ).toEqual(['node|cli.ts run --plan-only'])
  })
})

describe('test-tier.sh', () => {
  it('缺层或多给参数退出 2；给了层就占名额、先构建、跑全部成员的这一层', async () => {
    const { run } = fixture()
    expect((await run('test-tier.sh', [])).status).toBe(2)
    expect((await run('test-tier.sh', ['slow', 'fast'])).status).toBe(2)
    const ran = await run('test-tier.sh', ['slow'])
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.lines[0]).toMatch(/^slot\|node .*testing\/cli\.ts run --all --tier slow --build$/u)
  })
})

describe('check-design.sh', () => {
  it('--stale 只交给第二条；没给值或认不出的参数退出 2', async () => {
    const { run } = fixture()
    const ran = await run('check-design.sh', ['--stale', 'report'])
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.lines).toHaveLength(2)
    expect(ran.lines[0]).toContain('check_sources.py')
    expect(ran.lines[0]).not.toContain('--stale')
    expect(ran.lines[1]).toMatch(/domain_objects\.py .* --stale report$/u)
    expect((await run('check-design.sh', [])).lines[1]).not.toContain('--stale')
    expect((await run('check-design.sh', ['--stale'])).status).toBe(2)
    expect((await run('check-design.sh', ['--bogus'])).status).toBe(2)
  })
})

describe('package.json 的 test:python', () => {
  const line = rootScript('test:python')

  it('经运行名额：先建 tmp，再把 uv 连同 pytest 的参数与环境变量交给名额脚本', async () => {
    const { runLine } = fixture()
    const ran = await runLine(line)
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.lines).toEqual([
      'slot|uv run --locked pytest --ignore-glob=*.legacy --basetemp=tmp/test-runs -n auto --dist worksteal',
      'uv|run --locked pytest --ignore-glob=*.legacy --basetemp=tmp/test-runs -n auto --dist worksteal',
      'uv-env|1|0',
    ])
  })

  it('名额被占且最多等 0 秒：以 75 退出，不起 pytest', async () => {
    const { runLine, occupySlot } = fixture({ realSlot: true })
    occupySlot()
    const refused = await runLine(line, { OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0' })
    expect(refused.status).toBe(75)
    expect(refused.stderr).toContain('命令没有执行')
    expect(refused.lines).toEqual([])
  })
})

describe('check.sh', () => {
  it('只认 --admission、--keep-going、--preflight 与带值的 --resume-from，原样交给运行器的 check；别的参数或缺值退出 2', async () => {
    const { run } = fixture()
    const held = { OMNE_TEST_SLOT_HELD: '1' }
    const ran = await run('check.sh', ['--admission', '--resume-from', 'abc123'], held)
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.lines).toEqual([
      'node|--experimental-strip-types tools/test-runner/src/testing/cli.ts check --admission --resume-from abc123',
    ])
    expect((await run('check.sh', ['--keep-going'], held)).lines).toEqual([
      'node|--experimental-strip-types tools/test-runner/src/testing/cli.ts check --keep-going',
    ])
    // 预检不占运行名额：没有拿到名额也直接起运行器。
    const preflight = await run('check.sh', ['--preflight'])
    expect(preflight.status, preflight.stderr).toBe(0)
    expect(preflight.lines).toEqual([
      'node|--experimental-strip-types tools/test-runner/src/testing/cli.ts check --preflight',
    ])
    for (const args of [['--resume-from'], ['--resume-from', ''], ['--bogus'], ['abc']]) {
      const refused = await run('check.sh', args, held)
      expect(refused.status, args.join(' ')).toBe(2)
      expect(refused.lines).toEqual([])
      expect(refused.stderr).toContain('--resume-from <H1>')
    }
  })

  it('没拿到名额：经名额脚本占一次，再带着它给的标记起运行器，不再重入名额脚本', async () => {
    const { run } = fixture()
    const ran = await run('check.sh', ['--keep-going'])
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.lines).toEqual([
      'slot|bash ./scripts/check.sh --keep-going',
      'node|--experimental-strip-types tools/test-runner/src/testing/cli.ts check --keep-going',
    ])
  })
})

describe('夹具：起脚本的时限与进程树', () => {
  it('被测脚本挂住时 run 在时限内返回失败，它起的整棵进程树随之不在', async () => {
    const { run, pidsFile } = fixture()
    const started = Date.now()
    const ran = await run(
      'check.sh',
      ['--keep-going'],
      { OMNE_TEST_SLOT_HELD: '1', HANG_NODE: '1' },
      3_000,
    )
    expect(Date.now() - started).toBeLessThan(10_000)
    expect(ran.timedOut).toBe(true)
    expect(ran.status).toBeNull()
    expect(ran.lines).toEqual([
      'node|--experimental-strip-types tools/test-runner/src/testing/cli.ts check --keep-going',
    ])
    // 替身记下的两个进程（自己与 sleep）与 bash 本身都已不在。
    const recorded = readFileSync(pidsFile, 'utf8').split('\n').filter(Boolean).map(Number)
    expect(recorded, '替身应在时限内到达挂住点并记下两个进程号').toHaveLength(2)
    const pids = ran.pid === undefined ? recorded : [ran.pid, ...recorded]
    await expect.poll(() => pids.filter(alive), { timeout: 3_000 }).toEqual([])
  }, 15_000)

  it('名额替身在名额已持有时被重入：以 97 退出、不执行命令，用例看到失败而不是挂住', async () => {
    const { run } = fixture()
    const ran = await run('with-test-slot.sh', ['node', 'x'], { OMNE_TEST_SLOT_HELD: '1' })
    expect(ran.status).toBe(97)
    expect(ran.lines).toEqual([])
    expect(ran.stderr).toContain('重入')
  })
})
