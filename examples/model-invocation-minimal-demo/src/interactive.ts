import { createInterface, type Interface } from 'node:readline'
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
import type { DemoConversation, DemoTotals } from './demo.ts'
import type {
  ModelDisplayAnnotation,
  ModelDisplayEntry,
} from '@omne-harness-lite/model-request-runtime'

/** Untrusted model and catalog text may not control the terminal. */
function safeText(value: string, multiline = false): string {
  return Array.from(value, character => {
    const code = character.codePointAt(0)
    if (code === undefined) return ''
    if (multiline && character === '\n') return character
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return `\\u{${code.toString(16)}}`
    return character
  }).join('')
}

function failure(
  value:
    | Awaited<ReturnType<DemoConversation['models']>>
    | Awaited<ReturnType<DemoConversation['currentModel']>>
    | Awaited<ReturnType<DemoConversation['selectModel']>>,
): string {
  if ('notLegalTarget' in value)
    return `Model is not a legal target (${value.notLegalTarget.because.join(', ')}).`
  if ('profileNotFound' in value) return 'Model profile was not found.'
  if ('invalidInput' in value) return 'Invalid model identifier.'
  if ('unavailable' in value) return 'Model state is unavailable; no change is confirmed.'
  if ('failure' in value) return `Model operation failed (${value.failure}).`
  return 'Model operation is unavailable; no change is confirmed.'
}

function annotation(value: ModelDisplayAnnotation): string {
  return typeof value === 'string' ? value : `overridden_by:${value.overridden_by.scope.layer}`
}

function source(entry: ModelDisplayEntry['ref']): string {
  return entry.origin === 'official' ? 'official' : `custom:${entry.scope.layer}`
}

function modelLine(entry: ModelDisplayEntry): string {
  const notes = entry.annotations.map(annotation).join(', ')
  return `${entry.selected ? '* ' : '  '}${safeText(entry.routeName)} [${source(entry.ref)}] ${notes}\n`
}

function currentLine(result: Awaited<ReturnType<DemoConversation['currentModel']>>): string {
  if (!('effectiveModel' in result)) return `${failure(result)}\n`
  const current = result.effectiveModel
  return `Selected: ${safeText(current.selected)}\nEffective: ${safeText(current.routeName)} (${current.selectedBy}, ${source(current.profile)})\n`
}

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
export type InteractiveConversation = Pick<
  DemoConversation,
  | 'session'
  | 'identity'
  | 'models'
  | 'currentModel'
  | 'selectModel'
  | 'send'
  | 'stopActive'
  | 'history'
  | 'totals'
> & { readonly close: () => Promise<{ readonly complete: boolean }> }
export async function runInteractive(
  conversation: InteractiveConversation,
  input: Readable,
  output: Writable,
  terminal: boolean,
): Promise<{ readonly complete: boolean; readonly interrupted: boolean }> {
  let lines: Interface | undefined
  let stopping = false,
    complete = true,
    modelFailed = false
  const interrupt = () => {
    stopping = true
    conversation.stopActive()
    lines?.close()
  }
  process.on('SIGINT', interrupt)
  try {
    output.write(
      `Model invocation minimal demo\nAccount: ${safeText(conversation.identity.account)}\nOrganization: ${safeText(conversation.identity.organization)}\nConversation: ${safeText(conversation.session)}\nEach submitted message can incur OpenRouter charges. /help lists commands.\n`,
    )
    output.write(currentLine(await conversation.currentModel()))
    lines = createInterface({ input, output, terminal })
    lines.on('SIGINT', interrupt)
    if (stopping) lines.close()
    output.write('You> ')
    for await (const line of lines) {
      if (stopping) break
      const command = line.trim()
      if (command === '/exit') break
      if (command === '/help') {
        output.write(
          '/models — list model profiles; /model — show selected and effective model; /model <identifier> — select for later requests; /history — read persisted messages; /exit — close; Ctrl+C — stop and close.\n',
        )
      } else if (command === '/models') {
        const listed = await conversation.models()
        if (!('displayList' in listed)) output.write(`${failure(listed)}\n`)
        else {
          for (const entry of listed.displayList) {
            output.write(modelLine(entry))
            for (const covered of entry.covered)
              output.write(
                `    covered [${source(covered.ref)}] ${covered.annotations.map(annotation).join(', ')}\n`,
              )
          }
        }
      } else if (command === '/model') {
        output.write(currentLine(await conversation.currentModel()))
      } else if (/^\/model\s/u.test(command)) {
        const match = /^\/model\s+(\S+)$/u.exec(command)
        if (match === null || match[1] === undefined) output.write('Usage: /model <identifier>\n')
        else {
          const selected = await conversation.selectModel(match[1])
          if (!('selected' in selected)) output.write(`${failure(selected)}\n`)
          else {
            output.write(`Selected: ${safeText(selected.selected)}\n`)
            output.write(currentLine(await conversation.currentModel()))
          }
        }
      } else if (command === '/history') {
        for (const message of await conversation.history())
          output.write(`${safeText(message.role)}: ${safeText(message.text, true)}\n`)
      } else if (command.startsWith('/')) {
        output.write('Unknown command. Use /help.\n')
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
          const safe = safeText(text, true)
          const delta = safe.startsWith(rendered)
            ? safe.slice(rendered.length)
            : safe !== rendered
              ? `\n[updated answer] ${safe}`
              : ''
          rendered = safe
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
        } else
          output.write(
            `Request refused before sending (${safeText(sent.reason)}); no automatic retry.\n`,
          )
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
    lines?.close()
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
