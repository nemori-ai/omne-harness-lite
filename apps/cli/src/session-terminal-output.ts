import type { HumanBlock, ToolObservation } from './session-human-content.ts'
import { z } from 'zod'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import type { SessionMessageView } from './session-reading.ts'

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
export function terminalMessageLines(message: SessionMessageView): readonly string[] {
  return humanBlockLines(
    message.blocks,
    message.type === 'tool' || message.type === 'tool_internal',
  )
}
export function humanBlockLines(blocks: readonly HumanBlock[], tool = false): string[] {
  return blocks.flatMap(block => blockLines(block, tool)).flatMap(line => line.split(/\r?\n/u))
}
function blockLines(block: HumanBlock, tool: boolean): readonly string[] {
  switch (block.kind) {
    case 'text':
      return tool ? toolLines(block.text) : [block.text]
    case 'thinking':
      return block.text.trim() ? [`Reasoning summary: ${block.text}`] : []
    case 'attachment':
      return [`${block.media}: ${block.name ?? 'attachment'} (content not loaded)`]
    case 'tool_call':
      return toolCallLines(block)
    case 'tool_result':
      return [
        `Tool result: ${block.call} — ${block.outcome}`,
        ...(block.reason === null ? [] : [block.reason]),
        ...humanBlockLines(block.blocks, true),
        ...(block.offloaded ? ['Additional tool content is stored separately (not loaded).'] : []),
      ]
  }
}
function observationLines(value: ToolObservation): string[] {
  return [
    ...(value.blocks.length ? ['Result:', ...humanBlockLines(value.blocks, true)] : []),
    ...(value.notice === null ? [] : [value.notice]),
    ...(value.offloaded ? ['Additional tool content is stored separately (not loaded).'] : []),
  ]
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
export function conversationLines(messages: readonly SessionMessageView[]): readonly string[] {
  return messages.flatMap(message => {
    const lines = terminalMessageLines(message)
    if (lines.length === 0) return []
    return ['', roleLabel(message.type), ...lines]
  })
}

function roleLabel(type: SessionMessageView['type']): string {
  if (type === 'user') return 'You'
  if (type === 'assistant') return 'Assistant'
  if (type === 'tool' || type === 'tool_internal') return 'Tool'
  return 'System'
}

function toolCallLines(block: Extract<HumanBlock, { kind: 'tool_call' }>): readonly string[] {
  return [
    `Tool: ${block.tool}${block.observation ? ` — ${block.observation.state}` : ' — requested'}`,
    ...(block.call === null ? [] : [`Call: ${block.call}`]),
    `Arguments${block.arguments.encoding === 'partial' ? ' (streaming)' : block.arguments.encoding === 'unparseable' ? ' (unparseable)' : ''}:`,
    block.arguments.text || '(not received yet)',
    ...(block.observation === null ? [] : observationLines(block.observation)),
  ]
}
