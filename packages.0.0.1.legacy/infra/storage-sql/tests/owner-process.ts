// 父进程一侧：起一个属主子进程（tests/fixtures/owner-child.ts），等它报到某一行，再 SIGKILL 它。
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CHILD = fileURLToPath(new URL('./fixtures/owner-child.ts', import.meta.url))

export interface OwnerProcess {
  /** 等到子进程报出以 `prefix` 开头的一行，返回那一行；子进程先退出或超时 ⇒ 拒绝。 */
  until(prefix: string, timeoutMs?: number): Promise<string>
  /** SIGKILL 并等它退出（真崩溃：不走任何撤除）。 */
  kill(): Promise<void>
  /** 等它自己退出，返回退出码。 */
  exited(): Promise<number | null>
}

export function spawnOwner(spec: {
  readonly file: string
  readonly migrations: readonly string[]
  readonly stopAt?: 'beforeMigrate' | 'beforeSnapshotRename' | 'afterSidecarsRemoved'
}): OwnerProcess {
  const child: ChildProcess = spawn(
    process.execPath,
    ['--experimental-transform-types', '--no-warnings', '--expose-gc', CHILD, JSON.stringify(spec)],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
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
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      lines.push(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
    for (const wake of waiters.splice(0)) wake()
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk
  })

  return {
    async until(prefix, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        const found = lines.find(line => line.startsWith(prefix))
        if (found !== undefined) return found
        if (exitCode !== undefined)
          throw new Error(
            `owner child exited (${String(exitCode)}) before "${prefix}"; stdout: ${lines.join(' | ')}; stderr: ${stderr}`,
          )
        const remaining = deadline - Date.now()
        if (remaining <= 0)
          throw new Error(`timed out waiting for "${prefix}"; stdout: ${lines.join(' | ')}`)
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, remaining)
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
    exited: () => exit,
  }
}
