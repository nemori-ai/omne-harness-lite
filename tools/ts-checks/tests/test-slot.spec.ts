// 运行名额脚本的行为核对：透传退出码、嵌套放行、占满时排队、等太久放弃且不执行命令。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(
  fileURLToPath(new URL('../../../scripts/with-test-slot.sh', import.meta.url)),
)

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'omne-slot-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function slot(args: readonly string[], env: Record<string, string> = {}) {
  const cleared: NodeJS.ProcessEnv = { ...process.env }
  // 这份测试自己可能就跑在名额里；清掉标记才测得到排队。
  delete cleared['OMNE_TEST_SLOT_HELD']
  return spawnSync(SCRIPT, args, {
    encoding: 'utf8',
    env: { ...cleared, OMNE_TEST_SLOT_DIR: join(dir, 'locks'), ...env },
  })
}

/** 占住一个名额，直到 `release` 文件出现。 */
async function hold(): Promise<{ release: () => Promise<void> }> {
  const ready = join(dir, 'ready')
  const release = join(dir, 'release')
  const cleared: NodeJS.ProcessEnv = { ...process.env }
  delete cleared['OMNE_TEST_SLOT_HELD']
  const child = spawn(
    SCRIPT,
    ['bash', '-c', `touch "${ready}"; until [ -e "${release}" ]; do sleep 0.1; done`],
    { env: { ...cleared, OMNE_TEST_SLOT_DIR: join(dir, 'locks') }, stdio: 'ignore' },
  )
  const exited = new Promise<void>(done => child.once('exit', () => done()))
  while (!existsSync(ready)) await new Promise(tick => setTimeout(tick, 50))
  return {
    release: async () => {
      writeFileSync(release, '')
      await exited
    },
  }
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
  })

  it('名额占满：超过最长等待即以 75 退出，命令没有执行', async () => {
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
    } finally {
      await holder.release()
    }
  })

  it('名额占满：前一个放手后，排队的那个拿到名额并执行', async () => {
    const holder = await hold()
    const cleared: NodeJS.ProcessEnv = { ...process.env }
    delete cleared['OMNE_TEST_SLOT_HELD']
    const waiter = spawn(SCRIPT, ['bash', '-c', 'echo 轮到了'], {
      env: {
        ...cleared,
        OMNE_TEST_SLOT_DIR: join(dir, 'locks'),
        OMNE_TEST_SLOT_POLL_SECONDS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    waiter.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    waiter.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    const status = new Promise<number | null>(done => waiter.once('exit', done))
    while (!stderr.includes('排队中')) await new Promise(tick => setTimeout(tick, 50))
    expect(stdout).toBe('')
    await holder.release()
    expect(await status).toBe(0)
    expect(stdout).toBe('轮到了\n')
    expect(stderr).toContain('拿到名额 1/1')
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
