// 父进程一侧：起一个治理中心子进程（tests/fixtures/host-child.ts），等它报到某一行，再 SIGKILL、让它撤除或等它退出。
import { type ChildProcess, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { FragmentName } from './fragments.ts'

const CHILD = fileURLToPath(new URL('../fixtures/host-child.ts', import.meta.url))
export const CLI = fileURLToPath(new URL('../../src/cli.ts', import.meta.url))

export interface HostProcess {
  /** 等到子进程报出以 `prefix` 开头的一行，返回那一行；先退出或超时 ⇒ 拒绝。 */
  until(prefix: string, timeoutMs?: number): Promise<string>
  /** 真崩溃：SIGKILL 并等它退出，不走任何撤除。 */
  kill(): Promise<void>
  /** 发一个信号（不等）。 */
  signal(signal: NodeJS.Signals): void
  /** 在标准输入上写一行。 */
  send(line: string): void
  exited(): Promise<number | null>
  readonly stderr: () => string
  /** 等到标准错误流（JSONL 日志）里出现 `fragment`。 */
  untilStderr(fragment: string, timeoutMs?: number): Promise<void>
}

function watch(child: ChildProcess): HostProcess {
  const lines: string[] = []
  const waiters: (() => void)[] = []
  let buffer = ''
  let stderr = ''
  let exitCode: number | null | undefined
  const exit = new Promise<number | null>(resolve => {
    child.once('exit', code => {
      exitCode = code
      resolve(code)
      for (const wake of waiters.splice(0)) wake()
    })
  })
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      lines.push(buffer.slice(0, index))
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
    }
    for (const wake of waiters.splice(0)) wake()
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk
  })
  return {
    async until(prefix, timeoutMs = 30_000) {
      const started = performance.now()
      for (;;) {
        const found = lines.find(line => line.startsWith(prefix))
        if (found !== undefined) return found
        if (exitCode !== undefined)
          throw new Error(`child exited (${String(exitCode)}) before "${prefix}": ${stderr}`)
        if (performance.now() - started > timeoutMs)
          throw new Error(
            `timed out waiting for "${prefix}"; saw ${JSON.stringify(lines)}: ${stderr}`,
          )
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, 100)
          waiters.push(() => {
            clearTimeout(timer)
            resolve()
          })
        })
      }
    },
    async kill() {
      if (exitCode === undefined) child.kill('SIGKILL')
      await exit
    },
    signal(signal) {
      child.kill(signal)
    },
    send(line) {
      child.stdin?.write(`${line}\n`)
    },
    exited: () => exit,
    stderr: () => stderr,
    async untilStderr(fragment, timeoutMs = 30_000) {
      const started = performance.now()
      while (!stderr.includes(fragment)) {
        if (exitCode !== undefined)
          throw new Error(`child exited (${String(exitCode)}) before "${fragment}": ${stderr}`)
        if (performance.now() - started > timeoutMs)
          throw new Error(`timed out waiting for "${fragment}" on stderr: ${stderr}`)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    },
  }
}

export interface ChildSpec {
  readonly env: Record<string, string | undefined>
  readonly extra?: readonly FragmentName[]
  readonly stopAt?: 'before-confirm'
  readonly lockDirectory?: string
}

/** 起一个 boot() 子进程（经测试钩子可停在确认之前、可跑测试片段）。 */
export function spawnHost(spec: ChildSpec): HostProcess {
  return watch(
    spawn(
      process.execPath,
      ['--experimental-transform-types', '--no-warnings', CHILD, JSON.stringify(spec)],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    ),
  )
}

/** 起真实的进程入口（src/cli.ts）：`serve` 或 `keygen <dir>`，环境变量即部署配置。 */
export function spawnCli(
  args: readonly string[],
  env: Record<string, string | undefined>,
): HostProcess {
  const inherited: Record<string, string | undefined> = { PATH: process.env['PATH'] }
  return watch(
    spawn(process.execPath, ['--experimental-transform-types', '--no-warnings', CLI, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...inherited, ...env },
    }),
  )
}
