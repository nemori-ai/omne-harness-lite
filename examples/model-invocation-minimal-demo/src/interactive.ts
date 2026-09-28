import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { AnchoredInvocationHandle } from '@omne-harness-lite/model-request-runtime'
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

/** One active turn. The actual runtime owns cancellation, durable settlement and borrowed resources. */
export async function runInteractive(
  conversation: DemoConversation,
  input: Readable,
  output: Writable,
  terminal: boolean,
): Promise<{ readonly complete: boolean; readonly interrupted: boolean }> {
  const lines = createInterface({ input, output, terminal })
  let stopping = false,
    current: AnchoredInvocationHandle | undefined,
    complete = true,
    modelFailed = false
  const interrupt = () => {
    stopping = true
    current?.abort()
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
        output.write('Assistant> ')
        const started = await conversation.send(line, (_event, snapshot) => {
          const text = snapshot.blocks
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
          if (text.startsWith(rendered)) output.write(text.slice(rendered.length))
          else if (text !== rendered) output.write(`\n[updated answer] ${text}`)
          rendered = text
        })
        if (!('call' in started)) {
          output.write('\nRequest refused before sending; no automatic retry.\n')
        } else {
          current = started.call
          let durablySettled = false
          if (stopping) current.abort()
          const outcome = await current.outcome
          output.write('\n')
          if ('replyPending' in outcome) {
            const settlement = await current.settleReply('persisted')
            const response = 'settled' in settlement ? settlement.settled.response.response : null
            if (response === null) {
              complete = false
              output.write(
                'Reply commit is unconfirmed; retained responsibility, no next request.\n',
              )
            } else {
              durablySettled = true
              output.write(
                `Saved. ${writeJsonLossless({ outcome: response.outcome, usage: response.usage, cost: response.cost })}\n`,
              )
            }
          } else if ('settled' in outcome) {
            durablySettled = true
            if (outcome.settled.settled.response.response?.outcome === 'failed') {
              modelFailed = true
              complete = false
              output.write('Model request failed; durable response recorded. No automatic retry.\n')
            } else output.write('Call settled without a conversation reply.\n')
          } else if ('unavailable' in outcome) {
            complete = false
            output.write('Call state is unavailable; retained responsibility, no next request.\n')
          } else output.write('Call ended without a reply; no automatic retry.\n')
          const released = await current.close()
          if (!('released' in released)) {
            complete = false
            output.write('Call resources remain owned; close is incomplete.\n')
          }
          current = undefined
          if (durablySettled) output.write(footer(await conversation.totals()))
          if (!complete || stopping) break
        }
      }
      if (!stopping) output.write('You> ')
    }
  } finally {
    lines.close()
    process.removeListener('SIGINT', interrupt)
    if (current !== undefined) {
      current.abort()
      const released = await current.close()
      if (!('released' in released)) complete = false
    }
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
