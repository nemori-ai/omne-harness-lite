import { z } from 'zod'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import type { SessionTextMessage } from './session-reading.ts'

const count = z.number().int().nonnegative()
const outputCount = z.object({ discardedBytes: count })
const transport = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('terminal'), terminal: outputCount }),
  z.object({ mode: z.literal('separate'), stdout: outputCount, stderr: outputCount }),
])
const exit = z.union([
  z.object({ code: z.number().int() }),
  z.object({ signal: z.string().min(1) }),
  z.object({ unknown: z.literal(true) }),
])
const executionView = z.object({
  kind: z.literal('execution'),
  outcome: z.object({ kind: z.literal('completed'), exit, output: transport }),
  output: z.object({
    streams: z.array(
      z.object({ stream: z.enum(['stdout', 'stderr', 'terminal']), text: z.string() }),
    ),
    toolDiscardedBytes: count,
    droppedFrames: count,
  }),
  stopObservation: z.enum(['confirmed', 'unconfirmed']).optional(),
})

/** Display only. Unknown results retain their original human-visible text. */
export function terminalMessageLines(message: SessionTextMessage): readonly string[] {
  return message.blocks
    .flatMap(block =>
      message.type === 'tool' || message.type === 'tool_internal'
        ? toolLines(block.text)
        : block.kind === 'thinking'
          ? ['Reasoning summary', block.text]
          : [block.text],
    )
    .flatMap(line => line.split(/\r?\n/u))
}
function toolLines(text: string): readonly string[] {
  const json = readJsonStrict(text)
  if ('failed' in json) return [text]
  const read = executionView.safeParse(json.ok)
  if (!read.success) return [text]
  const { outcome, output, stopObservation } = read.data
  const lines = ['Tool output (completed)', ...output.streams.map(stream => stream.text)]
  lines.push(exitLine(outcome.exit))
  if (output.toolDiscardedBytes || output.droppedFrames)
    lines.push(`Output omitted: ${output.toolDiscardedBytes} bytes, ${output.droppedFrames} frames`)
  const discarded =
    outcome.output.mode === 'terminal'
      ? outcome.output.terminal.discardedBytes
      : outcome.output.stdout.discardedBytes + outcome.output.stderr.discardedBytes
  if (discarded) lines.push(`Transport omitted: ${discarded} bytes`)
  if (stopObservation) lines.push(`Stop observation: ${stopObservation}`)
  return lines
}
function exitLine(value: z.infer<typeof exit>): string {
  if ('code' in value) return `Exit code: ${value.code}`
  if ('signal' in value) return `Exit signal: ${value.signal}`
  return 'Exit detail unavailable'
}

/** Message roles come from the host's human-visible projection, not runtime facts. */
export function conversationLines(messages: readonly SessionTextMessage[]): readonly string[] {
  return messages.flatMap(message => {
    const lines = terminalMessageLines(message)
    if (lines.length === 0) return []
    return ['', roleLabel(message.type), ...lines]
  })
}

function roleLabel(type: SessionTextMessage['type']): string {
  if (type === 'user') return 'You'
  if (type === 'assistant') return 'Assistant'
  if (type === 'tool' || type === 'tool_internal') return 'Tool'
  return 'System'
}
