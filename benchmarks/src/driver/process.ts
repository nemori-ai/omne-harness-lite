import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'

export type Ran = Readonly<{ status: number | null; stdout: string; stderr: string }>

export function ran(
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv; input?: string }>,
): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { cwd: options.cwd, env: options.env })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', status => resolve({ status, stdout, stderr }))
    child.stdin.on('error', () => {})
    child.stdin.end(options.input ?? '')
  })
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address !== null
          ? resolve(address.port)
          : reject(new Error('no port was given')),
      )
    })
  })
}

const POLL_MS = 100

export async function until<T>(
  take: () => T | undefined | Promise<T | undefined>,
  what: string,
  limitMs: number,
): Promise<T> {
  const deadline = Date.now() + limitMs
  for (;;) {
    const taken = await take()
    if (taken !== undefined) return taken
    if (Date.now() > deadline)
      throw new Error(`timed out after ${String(limitMs)} ms waiting for ${what}`)
    await new Promise(done => setTimeout(done, POLL_MS))
  }
}

export function ended(child: ChildProcess): Promise<number | null> {
  return new Promise(resolve => {
    if (child.exitCode !== null) resolve(child.exitCode)
    else child.on('close', resolve)
  })
}
