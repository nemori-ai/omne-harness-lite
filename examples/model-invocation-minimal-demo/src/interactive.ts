import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import {
  accept,
  snapshot,
  start,
  type AssemblyState,
  type AssemblySnapshot,
} from '@omne-harness-lite/stream-assembly'
import type { DemoConversation } from './demo.ts'
import type { DemoTotals } from './demo.ts'

function summary(value: DemoTotals['cost']): string {
  const known = value.knownSum.toString()
  return value.unknownCount === 0 ? known : `${known} known + ${value.unknownCount} unknown`
}
function footer(totals: DemoTotals): string {
  const { usage, cost } = totals
  const incomplete =
    cost.unknownCount > 0 || Object.values(usage).some(value => value.unknownCount > 0)
  return `Cumulative${incomplete ? ' (incomplete)' : ''}: input ${summary(usage.input_tokens)}, output ${summary(usage.output_tokens)}, cache read ${summary(usage.cache_read_tokens)}, cache write ${summary(usage.cache_write_tokens)} tokens; actual USD ${summary(cost)}\n`
}
function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}

/** One active turn. The actual runtime owns cancellation, durable settlement and borrowed resources. */
export async function runInteractive(
  conversation: DemoConversation,
  input: Readable,
  output: Writable,
  terminal: boolean,
): Promise<{ readonly complete: boolean; readonly interrupted: boolean }> {
  const lines = createInterface({ input, output, terminal })
  let stopping = false,
    complete = true,
    modelFailed = false
  const interrupt = () => {
    stopping = true
    conversation.stopActive()
    lines.close()
  }
  lines.on('SIGINT', interrupt)
  process.on('SIGINT', interrupt)
  output.write(
    `Model invocation minimal demo\nModel: ${conversation.model}\nProvider route: deepinfra/fp8\nConversation: ${conversation.session}\nEach submitted message can incur OpenRouter charges. /help lists commands.\n`,
  )
  output.write('You> ')
  try {
    for await (const line of lines) {
      if (stopping) break
      if (line === '/exit') break
      if (line === '/help') {
        output.write(
          '/history — read persisted messages; /exit — close; Ctrl+C — stop and close.\n',
        )
      } else if (line === '/history') {
        for (const message of await conversation.history())
          output.write(`${message.role}: ${message.text}\n`)
      } else if (line.trim()) {
        let rendered = ''
        let assembly: AssemblyState | undefined
        output.write('Assistant> ')
        const visibleText = (view: AssemblySnapshot) =>
          view.blocks
            .map(block => {
              if (block.closed)
                return block.block.kind === 'text' && block.block.visibility.toHuman
                  ? block.block.text
                  : ''
              return block.opened.kind === 'text' &&
                block.opened.visibility.toHuman &&
                typeof block.content === 'string'
                ? block.content
                : ''
            })
            .join('')
        const render = async (text: string) => {
          const delta = text.startsWith(rendered)
            ? text.slice(rendered.length)
            : text !== rendered
              ? `\n[updated answer] ${text}`
              : ''
          rendered = text
          if (delta)
            await new Promise<void>((resolve, reject) => {
              output.write(delta, error => (error ? reject(error) : resolve()))
            })
        }
        const sent = await conversation.send(line, async serialized => {
          const parsed = readJsonStrict(serialized)
          if (!('ok' in parsed)) return
          const delivery = parsed.ok
          if (!record(delivery)) return
          if (delivery.kind === 'snapshot') {
            const scope = delivery.scope
            if (!record(scope)) return
            const opened = start(scope.target)
            if ('ok' in opened) assembly = opened.ok
          } else if (delivery.kind === 'event' && assembly !== undefined) {
            const updated = accept(assembly, delivery.event)
            if (!('ok' in updated)) return
            assembly = updated.ok
            await render(visibleText(snapshot(assembly)))
          }
        })
        if ('response' in sent && 'reply' in sent.response) {
          await render(
            sent.response.reply.blocks
              .map(block => (block.kind === 'text' && block.visibility.toHuman ? block.text : ''))
              .join(''),
          )
        }
        output.write('\n')
        if (sent.kind === 'saved')
          output.write(
            `Saved. ${writeJsonLossless({ outcome: sent.response.outcome, usage: sent.response.usage, cost: sent.response.cost })}\n`,
          )
        else if (sent.kind === 'failed') {
          if (stopping) output.write('Call settled without a conversation reply.\n')
          else {
            modelFailed = true
            complete = false
            output.write('Model request failed; durable response recorded. No automatic retry.\n')
          }
        } else if (sent.kind === 'unconfirmed') {
          complete = false
          output.write('Reply commit is unconfirmed; retained responsibility, no next request.\n')
        } else output.write('Request refused before sending; no automatic retry.\n')
        if (!sent.released) {
          complete = false
          output.write('Call resources remain owned; close is incomplete.\n')
        }
        if (sent.kind === 'saved' || (sent.kind === 'failed' && !stopping))
          output.write(footer(await conversation.totals()))
        if (!complete || stopping) break
      }
      if (!stopping) output.write('You> ')
    }
  } finally {
    lines.close()
    process.removeListener('SIGINT', interrupt)
    if (stopping) conversation.stopActive()
    const closed = await conversation.close()
    complete = complete && closed.complete
    output.write(
      complete
        ? '\nClosed. Start again with the same --data path to resume.\n'
        : modelFailed && closed.complete
          ? '\nClosed after model failure. Start again with the same --data path to inspect history.\n'
          : '\nClose incomplete; preserved files and durable responsibility. Do not reset or automatically resend.\n',
    )
  }
  return { complete, interrupted: stopping }
}
