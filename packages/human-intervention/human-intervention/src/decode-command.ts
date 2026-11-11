import type { z } from 'zod'
import { HITL_COMMAND_MAX_BYTES } from './values.ts'

export type CommandDecodeFailure =
  | Readonly<{ kind: 'invalid-input'; reason: 'json' | 'shape' }>
  | Readonly<{ kind: 'limited'; resource: 'command-bytes'; limit: number }>

export function decodeCommand<Command>(
  schema: z.ZodType<Command>,
  json: string,
): Readonly<{ kind: 'decoded'; command: Command }> | CommandDecodeFailure {
  if (new TextEncoder().encode(json).byteLength > HITL_COMMAND_MAX_BYTES) {
    return { kind: 'limited', resource: 'command-bytes', limit: HITL_COMMAND_MAX_BYTES }
  }
  let input: unknown
  try {
    input = JSON.parse(json)
  } catch {
    return { kind: 'invalid-input', reason: 'json' }
  }
  const result = schema.safeParse(input)
  if (!result.success) return { kind: 'invalid-input', reason: 'shape' }
  return { kind: 'decoded', command: result.data }
}
