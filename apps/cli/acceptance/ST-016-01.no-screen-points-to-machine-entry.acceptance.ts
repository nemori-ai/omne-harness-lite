// 故事卡 ST-016-01 的可执行验收：在没有屏的地方用了人读入口，当场被告知并指到机读入口。
// 对着 PF-016 验收「给脚本用」的 S5 写，驱动的是构建出来的 dist/main.js，不是源码里的函数。
// 这份文件归负责的人、主会话与独立验收角色；实施者只运行它，不改它。
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url))
// 立卡时从当时的构建录下的帮助全文
const helpBefore = fileURLToPath(new URL('./ST-016-01.help.txt', import.meta.url))
// 固定的诊断码那一行长这样；指路的那一行不许长成它，脚本才分得清
const diagnosticLine = /^omne: [a-z-]+$/

interface Outcome {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

// 三个流都不接终端：stdin 直接关掉，stdout 与 stderr 走管道——等同于 `omne … </dev/null | cat`
function omne(args: readonly string[]): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '',
      stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

function lines(text: string): string[] {
  return text.split('\n').filter(line => line !== '')
}

describe('ST-016-01 在没有屏的地方用了人读入口，当场被告知并指到机读入口', () => {
  let scratch: string, stateDir: string

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'omne-st-016-01-'))
    // 故意不创建：人读入口被拒时不应该碰本地状态
    stateDir = join(scratch, 'state')
  })
  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  it('演示 1：人读的治理命令接进管道，先报固定诊断码，再用单独一行指到同一条命令的机读写法', async () => {
    const result = await omne(['tenant', 'current', '--state-dir', stateDir])

    expect(result.stdout).toBe('')
    const [first, second, ...rest] = lines(result.stderr)
    expect(first).toBe('omne: tty-required')
    expect(second).toContain('omne machine tenant current')
    expect(second).not.toMatch(diagnosticLine)
    expect(rest).toEqual([])
    expect(result.code).toBe(2)
    // 诊断不回显输入；被拒之后本地状态没有被打开或创建
    expect(result.stderr).not.toContain(stateDir)
    expect(existsSync(stateDir)).toBe(false)
  })

  it('演示 1（换一条命令）：指路写的是这一次敲的那条命令，不是一句写死的例子', async () => {
    const result = await omne(['organization', 'inspect', '--state-dir', stateDir])

    const [first, second, ...rest] = lines(result.stderr)
    expect(first).toBe('omne: tty-required')
    expect(second).toContain('omne machine organization inspect')
    expect(second).not.toContain('tenant current')
    expect(rest).toEqual([])
    expect(result.code).toBe(2)
  })

  it('演示 2：照提示改用机读入口，标准输出是一份完整的 JSON，说得出此刻为什么办不了', async () => {
    const result = await omne(['machine', 'tenant', 'current', '--state-dir', stateDir])

    const report = JSON.parse(result.stdout) as { admission: { status: string; reason?: string } }
    expect(report.admission.status).toBe('blocked')
    // 这台机器还没有配置过治理中心
    expect(report.admission.reason).toBe('not-configured')
    // 机读入口本来就能在没有屏的地方用，不该再被指一次路
    expect(result.stderr).not.toContain('omne machine')
  })

  it('演示 3：没有终端时起全屏界面，同样两行，界面没有起来', async () => {
    const result = await omne(['tui', '--terminal-profile', 'xterm-379', '--state-dir', stateDir])

    expect(result.stdout).toBe('')
    const [first, second, ...rest] = lines(result.stderr)
    expect(first).toBe('omne: tty-required')
    expect(second).toContain('omne machine')
    expect(second).not.toMatch(diagnosticLine)
    expect(rest).toEqual([])
    expect(result.code).toBe(2)
    expect(existsSync(stateDir)).toBe(false)
  })

  it('演示 4：终端类型不认识时，报的是另一个诊断码，指路照旧', async () => {
    const result = await omne(['tui', '--terminal-profile', 'no-such', '--state-dir', stateDir])

    expect(result.stdout).toBe('')
    const [first, second, ...rest] = lines(result.stderr)
    expect(first).toBe('omne: tty-unsupported')
    expect(second).toContain('omne machine')
    expect(second).not.toMatch(diagnosticLine)
    expect(rest).toEqual([])
    expect(result.code).toBe(2)
  })

  it('演示 5：帮助与做这张卡之前一字不差', async () => {
    const result = await omne(['--help'])

    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe(readFileSync(helpBefore, 'utf8'))
  })
})
