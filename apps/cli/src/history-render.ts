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

function commandCall(given: unknown): Readonly<{ command: string; params: unknown }> | undefined {
  const call = record(given)
  if (call === undefined || typeof call['command'] !== 'string') return undefined
  if (!/^[\w.-]{1,64}$/.test(call['command'])) return undefined
  if (Object.keys(call).some(key => key !== 'command' && key !== 'params')) return undefined
  if (call['params'] !== undefined && record(call['params']) === undefined) return undefined
  return { command: call['command'], params: call['params'] }
}

function renderToolCall(kind: string, fields: Readonly<Record<string, unknown>>): string {
  const given = fields['arguments'] ?? fields['partial'] ?? fields['raw']
  const named = kind === 'tool_call' ? commandCall(given) : undefined
  const tool =
    named === undefined ? word(fields['name']) : `${word(fields['name'])} ${named.command}`
  const call = `[tool call ${tool} ${word(fields['callId'])}]`
  const args = named === undefined ? given : named.params
  const shown = typeof args === 'string' ? args : (JSON.stringify(args) ?? '')
  return shown === '' ? call : `${call} ${clip(shown)}`
}

function renderBlock(block: unknown): string {
  const fields = record(block)
  if (fields === undefined) return clip(JSON.stringify(block) ?? '')
  const kind = word(fields['kind'])
  switch (kind) {
    case 'text':
      return word(fields['text'])
    case 'tool_call':
    case 'tool_call_incomplete':
    case 'tool_call_unparsed':
      return renderToolCall(kind, fields)
    case 'tool_result':
      return `[tool result ${word(fields['callId'])}]`
    default:
      return `[${kind === '' ? 'unknown block' : kind}]`
  }
}

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
    const cause = word(record(fields['cause'])?.['record'])
    return cause === '' || word(terminal?.['outcome']) === 'completed'
      ? ended
      : `${ended}\ncause: ${clip(cause)}`
  }
  return clip(JSON.stringify(payload) ?? '')
}

export function renderEntry(entry: RawEntry): string {
  const kind = word(entry['kind'])
  const body = renderBody(kind, entry['payload']).split('\n').join('\n    ')
  return `#${word(entry['entryId'])} ${kind}: ${body}\n`
}
