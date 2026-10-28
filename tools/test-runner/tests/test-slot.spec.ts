// 运行名额脚本的行为核对：透传退出码、嵌套放行、占满时按先来后到排队并报出位置、
// 被杀的排队者不挡后来者、等太久放弃且不执行命令，以及每次用完或放弃都在运行账本记一行；
// 账本的等待与占用秒数按毫秒差截到整秒，用预载的伪时钟把时刻放到整秒边界两侧核对。
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  realpathSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(
  fileURLToPath(new URL('../../../scripts/with-test-slot.sh', import.meta.url)),
)

let dir: string
/** 后台起的进程组；用例失败、等着放行的命令没被放行时，收尾整组杀掉，不留空转的进程。 */
let groups: number[] = []
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'omne-slot-')))
})
afterEach(() => {
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // 整组都已退出
    }
  }
  groups = []
  rmSync(dir, { recursive: true, force: true })
})

function slotEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  const cleared: NodeJS.ProcessEnv = { ...process.env }
  // 这份测试自己可能就跑在名额里；清掉标记才测得到排队。
  delete cleared['OMNE_TEST_SLOT_HELD']
  // 账本也指到临时目录，测试的运行不混进真实账本。
  return {
    ...cleared,
    OMNE_TEST_SLOT_DIR: join(dir, 'locks'),
    OMNE_TEST_SLOT_LEDGER: join(dir, 'ledger.jsonl'),
    ...env,
  }
}

interface LedgerLine {
  readonly event: 'ran' | 'gave-up'
  readonly command: string
  readonly issue: number | null
  readonly attempt: string | null
  readonly cwd: string
  readonly cores: number
  readonly slots: number
  readonly slot: number | null
  readonly aheadOnArrival: number
  readonly waitSeconds: number
  readonly heldSeconds: number | null
  readonly cpuSeconds: number | null
  readonly exitCode: number
  readonly arrivedAt: string
  readonly acquiredAt: string | null
  readonly endedAt: string
  readonly loadAtAcquire: readonly number[] | null
  readonly loadAtEnd: readonly number[]
}

function ledger(): LedgerLine[] {
  const path = join(dir, 'ledger.jsonl')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as LedgerLine)
}

function slot(args: readonly string[], env: Record<string, string> = {}, cwd?: string) {
  return spawnSync(SCRIPT, args, { encoding: 'utf8', env: slotEnv(env), cwd })
}

/**
 * 在 `cwd` 起 git 子进程用的环境：git 只认 `cwd` 本身。外面环境里的 `GIT_DIR`、`GIT_WORK_TREE`、
 * `GIT_COMMON_DIR` 不漏进来，`GIT_CEILING_DIRECTORIES` 让 git 不向上找到临时目录之外的仓库。
 */
function gitEnv(cwd: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...env, GIT_CEILING_DIRECTORIES: dirname(cwd) }
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete result[name]
  return result
}

/** 在 `cwd` 经名额执行命令，git 环境见 `gitEnv`。 */
function slotIn(cwd: string, args: readonly string[]) {
  return spawnSync(SCRIPT, args, { encoding: 'utf8', env: gitEnv(cwd, slotEnv({})), cwd })
}

/** 在 `name` 下建一个 git 仓库，git 目录里写入 `context`（task context 文件的原文）。 */
function repository(name: string, context: string): string {
  const root = join(dir, name)
  mkdirSync(root)
  const init = spawnSync('git', ['init', '-q', root], {
    encoding: 'utf8',
    env: gitEnv(root, process.env),
  })
  expect(init.status, init.stderr).toBe(0)
  writeFileSync(join(root, '.git', 'omne-integration-context.json'), context)
  return root
}

interface Queued {
  readonly child: ChildProcess
  readonly stdout: () => string
  readonly stderr: () => string
  readonly exited: Promise<number | null>
  /**
   * 等到标准错误里出现 `text`（字符串或正则）；进程先退出、或等了 `UNTIL_LIMIT_MS` 还没出现则失败。
   * 脚本一次报告分几次写出（位置一行、每个占用者一行），父进程可能分几次收到：要断言哪一行，就等哪一行。
   */
  readonly until: (text: string | RegExp) => Promise<void>
}

/** `until` 最多等多久：比用例时限短，超时时报出已收到的输出，而不是只报用例超时。 */
const UNTIL_LIMIT_MS = 20_000

/**
 * 伪时钟：预载进脚本的 node 进程，替换 `Date.now`。时刻从 `SLOT_TEST_CLOCK_START` 起，每读一次前进 1 毫秒；
 * `SLOT_TEST_CLOCK_SHIFT` 指向的文件存在时再加上其中的毫秒数，命令写这个文件就能把时钟往前拨。
 */
const CLOCK_SOURCE = `import { existsSync, readFileSync } from 'node:fs'
const start = Number(process.env.SLOT_TEST_CLOCK_START)
const shift = process.env.SLOT_TEST_CLOCK_SHIFT
let reads = 0
Date.now = () => start + reads++ + (existsSync(shift) ? Number(readFileSync(shift, 'utf8')) : 0)
`

/**
 * 2023-11-14T22:13:20Z 的毫秒时刻：伪时钟的整秒基准。有意取在过去：脚本拿 `Date.now()` 比名额锁文件的真实 mtime，
 * 取将来的时刻会让排队者把占用者的锁当成失效删掉。
 */
const CLOCK_SECOND = 1_700_000_000_000

/**
 * 在伪时钟下经名额执行命令：时钟从 `startMs` 起，命令可往 `clockShift()` 写毫秒数拨快时钟；`TZ=UTC` 让账本时刻按字符串比对。
 * 设了时限：时钟几乎不走，脚本若该放弃而没放弃就会一直排下去。
 */
function slotWithClock(args: readonly string[], startMs: number, env: Record<string, string> = {}) {
  return spawnSync(SCRIPT, args, {
    encoding: 'utf8',
    timeout: 10_000,
    env: slotEnv({ ...clockEnv(startMs), ...env }),
  })
}

/** 写出伪时钟模块，返回让脚本预载它的环境变量。 */
function clockEnv(startMs: number): Record<string, string> {
  const clock = join(dir, 'clock.mjs')
  writeFileSync(clock, CLOCK_SOURCE)
  return {
    TZ: 'UTC',
    NODE_OPTIONS: `--import ${pathToFileURL(clock).href}`,
    SLOT_TEST_CLOCK_START: String(startMs),
    SLOT_TEST_CLOCK_SHIFT: clockShift(),
  }
}

function clockShift(): string {
  return join(dir, 'clock.shift')
}

/** 在后台经名额执行命令，边跑边收集输出；默认每秒看一次队列。 */
function queue(args: readonly string[], env: Record<string, string> = {}): Queued {
  const child = spawn(SCRIPT, args, {
    env: slotEnv({ OMNE_TEST_SLOT_POLL_SECONDS: '1', ...env }),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  if (child.pid !== undefined) groups.push(child.pid)
  let stdout = ''
  let stderr = ''
  let done = false
  child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
  const exited = new Promise<number | null>(settle =>
    child.once('exit', code => {
      done = true
      settle(code)
    }),
  )
  return {
    child,
    stdout: () => stdout,
    stderr: () => stderr,
    exited,
    until: async text => {
      const deadline = Date.now() + UNTIL_LIMIT_MS
      const seen = () => (typeof text === 'string' ? stderr.includes(text) : text.test(stderr))
      while (!seen()) {
        if (done) throw new Error(`进程已退出，没等到「${String(text)}」：\n${stderr}`)
        if (Date.now() > deadline)
          throw new Error(`等了 ${UNTIL_LIMIT_MS} 毫秒没等到「${String(text)}」：\n${stderr}`)
        await new Promise(tick => setTimeout(tick, 50))
      }
    },
  }
}

/**
 * 经名额执行一条等着放行的命令：拿到名额后建 `<name>.ready`，等 `<name>.release` 出现才结束。
 * 命令行以 `env SLOT_TEST=<name>` 开头，排队者报出的持有者命令据此认得出是谁。
 */
function blocker(name: string) {
  const ready = join(dir, `${name}.ready`)
  const release = join(dir, `${name}.release`)
  const queued = queue([
    'env',
    `SLOT_TEST=${name}`,
    'bash',
    '-c',
    `touch "${ready}"; until [ -e "${release}" ]; do sleep 0.1; done`,
  ])
  return {
    queued,
    started: async () => {
      while (!existsSync(ready)) await new Promise(tick => setTimeout(tick, 50))
    },
    release: async () => {
      writeFileSync(release, '')
      await queued.exited
    },
  }
}

/** 占住一个名额，直到放行。 */
async function hold(): Promise<{ release: () => Promise<void> }> {
  const holder = blocker('holder')
  await holder.started()
  return holder
}

/** 一个排队者：拿到名额后把自己的名字追加进 `order`。 */
function appendOrder(name: string, env: Record<string, string> = {}): Queued {
  return queue(['bash', '-c', `echo ${name} >> "${join(dir, 'order')}"`], env)
}

function order(): string[] {
  return readFileSync(join(dir, 'order'), 'utf8').trim().split('\n')
}

function tickets(): string[] {
  return readdirSync(join(dir, 'locks')).filter(name => name.startsWith('ticket-'))
}

describe('with-test-slot.sh', { timeout: 30_000 }, () => {
  it('有空名额：执行命令并透传退出码与输出', () => {
    const result = slot(['bash', '-c', 'echo 跑了; exit 7'])
    expect(result.stdout).toBe('跑了\n')
    expect(result.status).toBe(7)
  })

  it('系统 bash 没有 EPOCHSECONDS 时仍执行命令', () => {
    const result = spawnSync('/bin/bash', [SCRIPT, 'bash', '-c', 'echo ok'], {
      encoding: 'utf8',
      env: slotEnv({}),
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe('ok\n')
    expect(result.stderr).not.toContain('EPOCHSECONDS')
  })

  it('命令能看到自己持有名额，嵌套调用直接放行', () => {
    const result = slot([SCRIPT, 'bash', '-c', 'echo "$OMNE_TEST_SLOT_HELD"'])
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(join(dir, 'locks', 'slot-1.lock'))
    expect(result.stderr).toBe('')
    expect(ledger().map(line => line.command)).toEqual([
      `${SCRIPT} bash -c echo "$OMNE_TEST_SLOT_HELD"`,
    ])
  })

  it('运行账本：用完名额记一行，命令原样转义，CPU 时间算的是命令自己用掉的', () => {
    const args = [
      'node',
      '-e',
      'while (process.cpuUsage().user < 600000) {} process.exit(3)',
      'a"b\\c\tz',
    ]
    const result = slot(args)
    expect(result.status).toBe(3)
    // 前提：名额空闲、没有排队；在此前提下 waitSeconds 应为 0。跨整秒边界的情形由下面的伪时钟用例核对。
    expect(result.stderr).not.toContain('排队中')
    const [line, ...rest] = ledger()
    expect(rest).toEqual([])
    expect(line).toMatchObject({
      event: 'ran',
      command: args.join(' '),
      cwd: process.cwd(),
      slots: 1,
      slot: 1,
      aheadOnArrival: 0,
      waitSeconds: 0,
      exitCode: 3,
    })
    expect(line?.cpuSeconds).toBeGreaterThanOrEqual(0.6)
    expect(line?.heldSeconds).toBeGreaterThanOrEqual(0)
    expect(line?.cores).toBeGreaterThanOrEqual(1)
    for (const at of [line?.arrivedAt, line?.acquiredAt, line?.endedAt]) {
      expect(at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/)
      expect(Number.isNaN(Date.parse(at ?? ''))).toBe(false)
    }
    for (const load of [line?.loadAtAcquire, line?.loadAtEnd]) {
      expect(load).toHaveLength(3)
      expect(load?.every(value => typeof value === 'number' && value >= 0)).toBe(true)
    }
  })

  it('运行账本：进队与拿到名额之间跨过整秒边界、只过了几毫秒，waitSeconds 记 0', () => {
    const result = slotWithClock(['bash', '-c', 'exit 0'], CLOCK_SECOND + 999)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).not.toContain('排队中')
    expect(ledger()).toEqual([
      expect.objectContaining({
        event: 'ran',
        arrivedAt: '2023-11-14T22:13:20+00:00',
        acquiredAt: '2023-11-14T22:13:21+00:00',
        endedAt: '2023-11-14T22:13:21+00:00',
        waitSeconds: 0,
        heldSeconds: 0,
      }),
    ])
  })

  it('运行账本：命令占用约 1.6 秒、跨过两个整秒边界，heldSeconds 记 1，时刻截到秒', () => {
    const result = slotWithClock(
      ['bash', '-c', `printf 1600 > "${clockShift()}"`],
      CLOCK_SECOND + 900,
    )
    expect(result.status, result.stderr).toBe(0)
    expect(ledger()).toEqual([
      expect.objectContaining({
        event: 'ran',
        arrivedAt: '2023-11-14T22:13:20+00:00',
        acquiredAt: '2023-11-14T22:13:20+00:00',
        endedAt: '2023-11-14T22:13:22+00:00',
        waitSeconds: 0,
        heldSeconds: 1,
      }),
    ])
  })

  it('运行账本：工作树有 task context 时记下最后一项任务的卡号与 attempt', () => {
    const task = (number: number, attempt: string) => ({
      binding: { issue: { number }, attempt },
      taskSource: 'b'.repeat(40),
    })
    const root = repository(
      'bound',
      JSON.stringify({ schemaVersion: 1, tasks: [task(700, '700-r1-a1'), task(794, '794-r2-a1')] }),
    )
    const result = slotIn(root, ['bash', '-c', 'exit 4'])
    expect(result.status).toBe(4)
    expect(result.stderr).toBe('')
    expect(ledger()).toMatchObject([{ event: 'ran', cwd: root, issue: 794, attempt: '794-r2-a1' }])
  })

  it('运行账本：不是 git 仓库或 context 不合格时卡号与 attempt 为 null，不提醒，退出码照旧', () => {
    const plain = join(dir, 'plain')
    mkdirSync(plain)
    const broken = repository('broken', '{ not json')
    const untyped = repository('untyped', JSON.stringify({ tasks: [{ binding: { issue: {} } }] }))
    const zero = repository(
      'zero',
      JSON.stringify({ tasks: [{ binding: { issue: { number: 0 }, attempt: '0-r1-a1' } }] }),
    )
    for (const cwd of [plain, broken, untyped, zero]) {
      const result = slotIn(cwd, ['bash', '-c', 'exit 5'])
      expect(result.status).toBe(5)
      expect(result.stderr).toBe('')
    }
    expect(ledger().map(line => [line.cwd, line.issue, line.attempt])).toEqual([
      [plain, null, null],
      [broken, null, null],
      [untyped, null, null],
      [zero, null, null],
    ])
  })

  it('运行账本写不进去：只提醒，不改命令的退出码', () => {
    writeFileSync(join(dir, 'file'), '')
    const result = slot(['bash', '-c', 'exit 7'], {
      OMNE_TEST_SLOT_LEDGER: join(dir, 'file', 'ledger.jsonl'),
    })
    expect(result.status).toBe(7)
    expect(result.stderr).toContain('运行账本写不进')
  })

  it('名额占满且有人排队：已持有名额的嵌套调用照旧直接放行', async () => {
    const holder = await hold()
    const waiter = appendOrder('等着的')
    try {
      await waiter.until('排队中')
      const result = slot(['bash', '-c', 'echo 嵌套'], {
        OMNE_TEST_SLOT_HELD: join(dir, 'locks', 'slot-1.lock'),
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toBe('嵌套\n')
      expect(result.stderr).toBe('')
      expect(ledger()).toEqual([])
    } finally {
      await holder.release()
      await waiter.exited
    }
  })

  it('名额占满：超过最长等待即以 75 退出，命令没有执行，票也收回，账本记下放弃', async () => {
    const holder = await hold()
    try {
      const marker = join(dir, 'ran')
      const result = slot(['touch', marker], {
        OMNE_TEST_SLOT_POLL_SECONDS: '1',
        OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '1',
      })
      expect(result.status).toBe(75)
      expect(result.stderr).toContain('排队中')
      expect(result.stderr).toContain('命令没有执行')
      expect(existsSync(marker)).toBe(false)
      expect(tickets()).toEqual([])
      const [line, ...rest] = ledger()
      expect(rest).toEqual([])
      expect(line).toMatchObject({
        event: 'gave-up',
        command: `touch ${marker}`,
        aheadOnArrival: 0,
        slot: null,
        acquiredAt: null,
        heldSeconds: null,
        cpuSeconds: null,
        loadAtAcquire: null,
        exitCode: 75,
      })
      expect(line?.waitSeconds).toBeGreaterThanOrEqual(1)
    } finally {
      await holder.release()
    }
  })

  it('名额占满、最长等待为 0：头一次没轮到就放弃，不报排队，跨整秒边界的几毫秒记 0 秒', async () => {
    const holder = await hold()
    try {
      const marker = join(dir, 'ran')
      const result = slotWithClock(['touch', marker], CLOCK_SECOND + 999, {
        OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0',
      })
      expect(result.status, result.stderr).toBe(75)
      expect(result.stderr).toContain('命令没有执行')
      expect(result.stderr).not.toContain('排队中')
      expect(existsSync(marker)).toBe(false)
      expect(tickets()).toEqual([])
      expect(ledger()).toEqual([
        expect.objectContaining({
          event: 'gave-up',
          arrivedAt: '2023-11-14T22:13:20+00:00',
          endedAt: '2023-11-14T22:13:21+00:00',
          waitSeconds: 0,
          exitCode: 75,
        }),
      ])
    } finally {
      await holder.release()
    }
  })

  it('名额占满：前一个放手后，排队的那个拿到名额并执行', async () => {
    const holder = await hold()
    const waiter = queue(['bash', '-c', 'echo 轮到了'])
    await waiter.until('排队中')
    expect(waiter.stdout()).toBe('')
    await holder.release()
    expect(await waiter.exited).toBe(0)
    expect(waiter.stdout()).toBe('轮到了\n')
    expect(waiter.stderr()).toContain('拿到名额 1/1')
    // 占用从拿到名额算起，不含排队的时间：命令只是一次 echo。
    expect(ledger().find(line => line.command === 'bash -c echo 轮到了')?.heldSeconds).toBe(0)
  })

  it('名额占满：排队约 0.6 秒后拿到名额，waitSeconds 截到整秒记 0', async () => {
    const holder = await hold()
    const waiter = queue(['true'], clockEnv(CLOCK_SECOND))
    await waiter.until('排队中')
    writeFileSync(clockShift(), '600')
    await holder.release()
    expect(await waiter.exited).toBe(0)
    expect(ledger().find(line => line.command === 'true')).toMatchObject({
      event: 'ran',
      arrivedAt: '2023-11-14T22:13:20+00:00',
      waitSeconds: 0,
    })
  })

  it('先来后到：按进队顺序拿到名额，与谁看得勤无关', async () => {
    const holder = await hold()
    // 先到的看得最慢：若谁先看到空名额谁拿，后两个大概率插到它前面。
    const first = appendOrder('A', { OMNE_TEST_SLOT_POLL_SECONDS: '2' })
    await first.until('排队中')
    const second = appendOrder('B')
    await second.until('排队中')
    const third = appendOrder('C')
    await third.until('排队中')
    await holder.release()
    expect(await Promise.all([first.exited, second.exited, third.exited])).toEqual([0, 0, 0])
    expect(order()).toEqual(['A', 'B', 'C'])
    // 账本按用完的先后记：占着的、A、B、C；各自进队时前面有几个也记下了。
    const name = (command: string) =>
      /SLOT_TEST=(\w+)|echo (\w+) >>/.exec(command)?.slice(1).find(Boolean)
    expect(ledger().map(line => [name(line.command), line.aheadOnArrival])).toEqual([
      ['holder', 0],
      ['A', 0],
      ['B', 1],
      ['C', 2],
    ])
  })

  it('排在中间的被杀掉：它的票作废，后来者照常轮到', async () => {
    const holder = await hold()
    const first = appendOrder('A')
    await first.until('排队中')
    const second = appendOrder('B')
    await second.until('排队中')
    const third = appendOrder('C')
    await third.until('前面还有 2 个')
    second.child.kill('SIGKILL')
    await second.exited
    await third.until('前面还有 1 个')
    await holder.release()
    expect(await Promise.all([first.exited, third.exited])).toEqual([0, 0])
    expect(order()).toEqual(['A', 'C'])
    expect(tickets()).toEqual([])
  })

  it('排队时报出前面还有几个、谁占着名额、占了多久，位置变了再报', async () => {
    const heldBy = (name: string) =>
      new RegExp(`名额 1/1 正由「env SLOT_TEST=${name} [^」]*」占着，已 \\d+ 秒`, 'u')
    const holder = await hold()
    const first = blocker('first')
    await first.queued.until('排队中')
    // 占用者行在位置行之后另行写出：等它到了再断言（#737）。
    await first.queued.until(heldBy('holder'))
    const second = queue(['true'])
    await second.until('排队中')
    expect(first.queued.stderr()).toContain('前面还有 0 个')
    expect(first.queued.stderr()).toMatch(heldBy('holder'))
    expect(second.stderr()).toContain('前面还有 1 个')
    await holder.release()
    await first.started()
    await second.until('前面还有 0 个')
    await second.until(heldBy('first'))
    expect(second.stderr()).toMatch(heldBy('first'))
    await first.release()
    expect(await second.exited).toBe(0)
  })

  it('两个名额：一个被占时另一个仍可用，不排队', async () => {
    const holder = await hold()
    try {
      const result = slot(['bash', '-c', 'echo "$OMNE_TEST_SLOT_HELD"'], { OMNE_TEST_SLOTS: '2' })
      expect(result.status).toBe(0)
      expect(result.stdout.trim()).toBe(join(dir, 'locks', 'slot-2.lock'))
      expect(result.stderr).toBe('')
    } finally {
      await holder.release()
    }
  })

  it('没给命令或策略值不是整数：以 2 退出', () => {
    expect(slot([]).status).toBe(2)
    expect(slot(['true'], { OMNE_TEST_SLOTS: '两个' }).status).toBe(2)
    expect(slot(['true'], { OMNE_TEST_SLOTS: '0' }).status).toBe(2)
  })
})
