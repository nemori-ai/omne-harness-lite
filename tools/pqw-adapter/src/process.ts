// 起子进程的唯一一层。逻辑层只拿到 Executor，用例换成假执行器断言参数，不真起 pqw、vitest 或 turbo。
import { spawn } from 'node:child_process'

export interface Command {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
}

export interface Outcome {
  /** 进程的退出码；被信号结束时为 null。 */
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

export type Executor = (command: Command) => Promise<Outcome>

/** 真执行器：收齐标准输出与标准错误再返回；起不来（找不到命令）时抛错，不写成某个退出码。 */
export const spawnExecutor: Executor = ({ command, args, cwd }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
