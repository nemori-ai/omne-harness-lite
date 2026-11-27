import { spawn } from 'node:child_process'

export interface Command {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env?: Readonly<Record<string, string>>
}

export interface Outcome {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

export type Executor = (command: Command) => Promise<Outcome>

export const spawnExecutor: Executor = ({ command, args, cwd, env }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
