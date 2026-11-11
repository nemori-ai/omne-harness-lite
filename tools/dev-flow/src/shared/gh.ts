import { execFileSync } from 'node:child_process'

/**
 * A `gh api` read that exited non-zero after GitHub answered. `gh api` writes the error
 * response JSON to stdout, carried here as `body`. It stays a failed read for every caller;
 * only the parent judgement inspects `body`. The message never contains API output.
 */
export class GhReadError extends Error {
  readonly body: unknown
  constructor(body: unknown) {
    super('gh read exited with an API error response. API output omitted.')
    this.name = 'GhReadError'
    this.body = body
  }
}
/** The request headers of a REST call: the JSON media type and the adopted API version. */
export const REST_HEADERS = [
  '-H',
  'Accept: application/vnd.github+json',
  '-H',
  'X-GitHub-Api-Version: 2026-03-10',
] as const
/**
 * Runs one `gh` command and returns its parsed JSON stdout. `stdin` is the text handed to the
 * process as its standard input; a call that passes none gets no input.
 */
export type GhCommand = (argv: readonly string[], timeoutMs: number, stdin?: string) => unknown
/** One launch of `gh`: its stdout text. Throws the process error of `execFileSync`. */
export type GhProcess = (argv: readonly string[], timeoutMs: number, stdin?: string) => string
export const ghProcess: GhProcess = (argv, timeoutMs, stdin) =>
  execFileSync('gh', [...argv], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    // `input` writes the text to a pipe; `execFileSync` refuses another standard input with it.
    ...(stdin === undefined ? { stdio: ['ignore', 'pipe', 'pipe'] } : { input: stdin }),
    shell: false,
  })
/**
 * The pause before retry 1, 2 and 3 of an idempotent GET whose transport failed. Three retries
 * at most; the fourth failure is thrown as it is.
 */
export const GH_READ_RETRY_DELAYS_MS: readonly number[] = [500, 1000, 2000]
/** Blocks the thread for `ms`: the reads are synchronous, so the backoff is too. */
function blockingSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
const FIELD_OPTIONS = new Set(['-f', '--raw-field', '-F', '--field', '--input'])
/**
 * True for `gh api` argv that sends a GET: an explicit `--method GET`/`-X GET`, or no method and
 * no field or input (then `gh api` itself uses GET). GraphQL and every write stay out.
 */
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
/**
 * True when a failed launch is a transport fault worth one more try: a timeout, a non-zero exit
 * that carries no API answer, or an API answer with a 5xx status. A 4xx answer, 429 included
 * (`gh api` does not expose `retry-after`), and a process that could not start are final.
 */
function transient(error: unknown): boolean {
  if (error instanceof GhReadError) {
    const status = (error.body as { status?: unknown } | null)?.status
    return typeof status === 'string' && /^5\d\d$/u.test(status)
  }
  if (!(error instanceof Error)) return false
  const { code, status } = error as Error & { code?: unknown; status?: unknown }
  return code === 'ETIMEDOUT' || (typeof status === 'number' && status !== 0)
}
/** Only an ordinary non-zero exit with JSON on stdout carries a response body. */
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
/**
 * A `GhCommand` over `run`. A GET whose transport fails is launched again after each pause of
 * `GH_READ_RETRY_DELAYS_MS`; every other command and every other failure is thrown at once.
 * The retried read is the same command, so a judgement that reads twice still reads twice.
 */
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
