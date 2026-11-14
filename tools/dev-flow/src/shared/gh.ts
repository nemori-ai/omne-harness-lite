import { execFileSync } from 'node:child_process'

export class GhReadError extends Error {
  readonly body: unknown
  constructor(body: unknown) {
    super('gh read exited with an API error response. API output omitted.')
    this.name = 'GhReadError'
    this.body = body
  }
}
export const REST_HEADERS = [
  '-H',
  'Accept: application/vnd.github+json',
  '-H',
  'X-GitHub-Api-Version: 2026-03-10',
] as const
export type GhCommand = (argv: readonly string[], timeoutMs: number, stdin?: string) => unknown
export type GhProcess = (argv: readonly string[], timeoutMs: number, stdin?: string) => string
export const ghProcess: GhProcess = (argv, timeoutMs, stdin) =>
  execFileSync('gh', [...argv], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    ...(stdin === undefined ? { stdio: ['ignore', 'pipe', 'pipe'] } : { input: stdin }),
    shell: false,
  })
export const GH_READ_RETRY_DELAYS_MS: readonly number[] = [500, 1000, 2000]
function blockingSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
const FIELD_OPTIONS = new Set(['-f', '--raw-field', '-F', '--field', '--input'])
export function isIdempotentGet(argv: readonly string[]): boolean {
  if (argv[0] !== 'api' || argv[1] === 'graphql') return false
  let method: string | undefined
  for (let index = 1; index < argv.length; index += 1) {
    const word = argv[index] ?? ''
    if (word === '--method' || word === '-X') method = argv[index + 1]
    else if (word.startsWith('--method=')) method = word.slice('--method='.length)
    else if (FIELD_OPTIONS.has(word) && method === undefined) return false
  }
  return method === undefined || method.toUpperCase() === 'GET'
}
function transient(error: unknown): boolean {
  if (error instanceof GhReadError) {
    const status = (error.body as { status?: unknown } | null)?.status
    return typeof status === 'string' && /^5\d\d$/u.test(status)
  }
  if (!(error instanceof Error)) return false
  const { code, status } = error as Error & { code?: unknown; status?: unknown }
  return code === 'ETIMEDOUT' || (typeof status === 'number' && status !== 0)
}
function responseError(error: unknown): GhReadError | undefined {
  if (!(error instanceof Error)) return undefined
  const { status, signal, stdout } = error as Error & {
    status?: unknown
    signal?: unknown
    stdout?: unknown
  }
  if (
    typeof status !== 'number' ||
    status === 0 ||
    (signal !== null && signal !== undefined) ||
    typeof stdout !== 'string'
  )
    return undefined
  try {
    return new GhReadError(JSON.parse(stdout))
  } catch {
    return undefined
  }
}
export function ghCommand(run: GhProcess, sleep: (ms: number) => void = blockingSleep): GhCommand {
  return (argv, timeoutMs, stdin) => {
    const retries = isIdempotentGet(argv) ? GH_READ_RETRY_DELAYS_MS.length : 0
    for (let attempt = 0; ; attempt += 1) {
      let stdout: string
      try {
        stdout = run(argv, timeoutMs, stdin)
      } catch (error) {
        const failure = responseError(error) ?? error
        if (attempt >= retries || !transient(failure)) throw failure
        sleep(GH_READ_RETRY_DELAYS_MS[attempt] ?? 0)
        continue
      }
      return JSON.parse(stdout)
    }
  }
}
export const runGhCommand: GhCommand = ghCommand(ghProcess)
