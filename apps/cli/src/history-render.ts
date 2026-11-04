/** A history entry as the wire carries it: `entryId`, `revision`, `kind` and `payload`. */
export type RawEntry = Readonly<Record<string, unknown>>

const clipAt = 500

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined
}

function word(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function clip(text: string): string {
  return text.length > clipAt ? `${text.slice(0, clipAt)}...` : text
}

/** The text of one block of a message. A block of a kind this renderer does not know shows its kind. */
function renderBlock(block: unknown): string {
  const fields = record(block)
  if (fields === undefined) return clip(JSON.stringify(block) ?? '')
  const kind = word(fields['kind'])
  switch (kind) {
    case 'text':
      return word(fields['text'])
    case 'tool_call':
    case 'tool_call_incomplete':
    case 'tool_call_unparsed': {
      const call = `[tool call ${word(fields['name'])} ${word(fields['callId'])}]`
      const given = fields['arguments'] ?? fields['partial'] ?? fields['raw']
      const shown = typeof given === 'string' ? given : (JSON.stringify(given) ?? '')
      return shown === '' ? call : `${call} ${clip(shown)}`
    }
    case 'tool_result':
      return `[tool result ${word(fields['callId'])}]`
    default:
      return `[${kind === '' ? 'unknown block' : kind}]`
  }
}

/**
 * A tool message is a `tool_result` marker followed by the content blocks of the result, so the
 * marker and the text after it read as one result.
 */
function renderMessage(payload: Readonly<Record<string, unknown>>): string {
  const blocks = record(payload['message'])?.['blocks']
  if (!Array.isArray(blocks)) return clip(JSON.stringify(payload))
  return blocks.map(renderBlock).join('\n')
}

function renderBody(kind: string, payload: unknown): string {
  const fields = record(payload)
  if (fields !== undefined && kind.startsWith('message.')) return renderMessage(fields)
  if (fields !== undefined && kind === 'run.started')
    return `Run ${word(fields['run'])} started (entry ${word(fields['entry'])})`
  if (fields !== undefined && kind === 'run.terminal') {
    const terminal = record(fields['terminal'])
    const ended = `Run ${word(terminal?.['run'])} ended: ${word(terminal?.['outcome'])}`
    // The entry's own `cause` field names why a run did not complete; it is shown as kept.
    const cause = word(record(fields['cause'])?.['record'])
    return cause === '' || word(terminal?.['outcome']) === 'completed'
      ? ended
      : `${ended}\ncause: ${clip(cause)}`
  }
  return clip(JSON.stringify(payload) ?? '')
}

/**
 * The text a person reads for one entry: `#<entryId> <kind>: <body>`. The lines after the first
 * of a body are indented, so an entry stays one block in the output.
 */
export function renderEntry(entry: RawEntry): string {
  const kind = word(entry['kind'])
  const body = renderBody(kind, entry['payload']).split('\n').join('\n    ')
  return `#${word(entry['entryId'])} ${kind}: ${body}\n`
}
