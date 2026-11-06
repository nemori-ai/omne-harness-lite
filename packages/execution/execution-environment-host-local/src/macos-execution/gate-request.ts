/** The first control line the macOS command gate reads: the command and the bounds it needs. */
export type GateRequest = Readonly<{
  executable: string
  args: readonly string[]
  cwd: string
  env: Readonly<Record<string, string>>
  /** Standard input bytes in base64, or null for none. */
  stdin: string | null
  maxChunkBytes: number
  /** The bound of the gate's own stop of its session when the provider went away. */
  stopBoundMs: number
}>

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(entry => typeof entry === 'string')

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'string')

const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1

/** The request in a parsed control line; undefined when any field is missing or of another kind. */
export function parseGateRequest(value: unknown): GateRequest | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const field = (name: string): unknown => Reflect.get(value, name)
  const executable = field('executable')
  const args = field('args')
  const cwd = field('cwd')
  const env = field('env')
  const stdin = field('stdin')
  const maxChunkBytes = field('maxChunkBytes')
  const stopBoundMs = field('stopBoundMs')
  if (typeof executable !== 'string' || typeof cwd !== 'string') return undefined
  if (!isStringArray(args) || !isStringRecord(env)) return undefined
  if (stdin !== null && typeof stdin !== 'string') return undefined
  if (!isWhole(maxChunkBytes) || !isWhole(stopBoundMs)) return undefined
  return { executable, args, cwd, env, stdin, maxChunkBytes, stopBoundMs }
}
