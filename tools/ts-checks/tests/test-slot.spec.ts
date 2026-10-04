// 运行名额脚本的行为核对：透传退出码、嵌套放行、占满时按先来后到排队并报出位置、
// 被杀的排队者不挡后来者、等太久放弃且不执行命令，以及每次用完或放弃都在运行账本记一行。
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(
  fileURLToPath(new URL('../../../scripts/with-test-slot.sh', import.meta.url)),
)

let dir: string
/** 后台起的进程组；用例失败、等着放行的命令没被放行时，收尾整组杀掉，不留空转的进程。 */
let groups: number[] = []
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'omne-slot-'))
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

function slot(args: readonly string[], env: Record<string, string> = {}) {
  return spawnSync(SCRIPT, args, { encoding: 'utf8', env: slotEnv(env) })
}

interface Queued {
  readonly child: ChildProcess
  readonly stdout: () => string
  readonly stderr: () => string
  readonly exited: Promise<number | null>
  /** 等到标准错误里出现 `text`；进程先退出则失败。 */
  readonly until: (text: string) => Promise<void>
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
      while (!stderr.includes(text)) {
        if (done) throw new Error(`进程已退出，没等到「${text}」：\n${stderr}`)
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

  it('名额占满：前一个放手后，排队的那个拿到名额并执行', async () => {
    const holder = await hold()
    const waiter = queue(['bash', '-c', 'echo 轮到了'])
    await waiter.until('排队中')
    expect(waiter.stdout()).toBe('')
    await holder.release()
    expect(await waiter.exited).toBe(0)
    expect(waiter.stdout()).toBe('轮到了\n')
    expect(waiter.stderr()).toContain('拿到名额 1/1')
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
    const holder = await hold()
    const first = blocker('first')
    await first.queued.until('排队中')
    const second = queue(['true'])
    await second.until('排队中')
    expect(first.queued.stderr()).toContain('前面还有 0 个')
    expect(first.queued.stderr()).toMatch(
      /名额 1\/1 正由「env SLOT_TEST=holder [^」]*」占着，已 \d+ 秒/,
    )
    expect(second.stderr()).toContain('前面还有 1 个')
    await holder.release()
    await first.started()
    await second.until('前面还有 0 个')
    expect(second.stderr()).toMatch(/名额 1\/1 正由「env SLOT_TEST=first [^」]*」占着，已 \d+ 秒/)
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
