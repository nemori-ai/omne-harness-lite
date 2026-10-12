/** Private wire frames. Command output is encoded, never interpreted as control bytes. */
export type OutputFrame = {
  readonly kind: 'output'
  readonly stream: 'terminal'
  readonly data: Buffer
}
export type CommandFrame =
  | { readonly kind: 'ready' }
  | OutputFrame
  | { readonly kind: 'completed'; readonly code: number | null; readonly signal: string | null }
export type TerminalFrame =
  | { readonly kind: 'ready' }
  | { readonly kind: 'created'; readonly cwd: string }
  | ((OutputFrame | { readonly kind: 'completed'; readonly code: number; readonly cwd: string }) & {
      readonly id: string
    })
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function output(value: Record<string, unknown>, maximum: number): OutputFrame | undefined {
  if (value.stream !== 'terminal') return undefined
  if (typeof value.data !== 'string') return undefined
  const data = Buffer.from(value.data, 'base64')
  if (data.length > maximum || data.toString('base64') !== value.data) return undefined
  return { kind: 'output', stream: value.stream, data }
}
function exit(value: Record<string, unknown>) {
  return (
    (value.code === null || Number.isSafeInteger(value.code)) &&
    (value.signal === null || typeof value.signal === 'string')
  )
}
export function captureCommandFrame(line: string, maximum: number): CommandFrame | undefined {
  try {
    const value: unknown = JSON.parse(line)
    if (!object(value)) return undefined
    switch (value.kind) {
      case 'ready':
        return { kind: 'ready' }
      case 'output':
        return output(value, maximum)
      case 'completed':
        return exit(value)
          ? {
              kind: 'completed',
              code: value.code as number | null,
              signal: value.signal as string | null,
            }
          : undefined
      default:
        return undefined
    }
  } catch {
    return undefined
  }
}
function terminalCompletion(value: Record<string, unknown>, id: string): TerminalFrame | undefined {
  if (!Number.isSafeInteger(value.code) || typeof value.cwd !== 'string') return undefined
  return { kind: 'completed', code: value.code as number, cwd: value.cwd, id }
}
export function captureTerminalFrame(value: unknown, maximum: number): TerminalFrame | undefined {
  if (!object(value)) return undefined
  if (value.kind === 'ready') return { kind: 'ready' }
  if (value.kind === 'created')
    return typeof value.cwd === 'string' ? { kind: 'created', cwd: value.cwd } : undefined
  if (typeof value.id !== 'string') return undefined
  if (value.kind === 'output') {
    const frame = output(value, maximum)
    return frame && { ...frame, id: value.id }
  }
  return value.kind === 'completed' ? terminalCompletion(value, value.id) : undefined
}
