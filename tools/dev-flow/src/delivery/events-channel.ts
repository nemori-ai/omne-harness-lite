import { InputError, record, text } from './protocol.ts'

export const CHANNEL_EVENTS = [
  'issues',
  'issue_comment',
  'pull_request',
  'workflow_run',
  'workflow_job',
  'check_run',
  'check_suite',
  'pull_request_review',
  'pull_request_review_comment',
  'push',
  'deployment',
  'deployment_status',
] as const

export class ReceiverError extends InputError {
  readonly reasonCode: string
  constructor(reasonCode: string) {
    super(reasonCode)
    this.reasonCode = reasonCode
  }
}

/** Channel URLs are secrets; validation errors never include their input. */
export function channelUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ReceiverError('invalid-channel-url')
  }
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.slice(1)
  )
    throw new ReceiverError('invalid-channel-url')
  return url.href
}

export type SseMessage = { data: string; id: string; event: string }

/** UTF-8, CR/LF/CRLF and multiline parsing. An incomplete final event is not delivered. */
export class SseDecoder {
  private decoder = new TextDecoder('utf-8', { fatal: true })
  private line = ''
  private data: string[] = []
  private event = ''
  private id = ''
  private afterCr = false
  private size = 0
  private emit: (message: SseMessage) => void
  private limit: number
  constructor(emit: (message: SseMessage) => void, limit = 26 * 1024 * 1024) {
    this.emit = emit
    this.limit = limit
  }

  push(chunk: Uint8Array): void {
    let value: string
    try {
      value = this.decoder.decode(chunk, { stream: true })
    } catch {
      throw new ReceiverError('invalid-stream-encoding')
    }
    for (const char of value) {
      if (this.afterCr && char === '\n') {
        this.afterCr = false
        continue
      }
      this.afterCr = char === '\r'
      if (++this.size > this.limit) throw new ReceiverError('frame-too-large')
      if (char === '\r' || char === '\n') {
        this.acceptLine()
        this.line = ''
      } else this.line += char
    }
  }

  private acceptLine(): void {
    if (this.line === '') {
      if (this.data.length > 0)
        this.emit({ data: this.data.join('\n'), event: this.event || 'message', id: this.id })
      this.data = []
      this.event = ''
      this.size = 0
      return
    }
    if (this.line.startsWith(':')) {
      this.size -= this.line.length
      return
    }
    const split = this.line.indexOf(':')
    const key = split < 0 ? this.line : this.line.slice(0, split)
    let value = split < 0 ? '' : this.line.slice(split + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (key === 'data') this.data.push(value)
    if (key === 'event') this.event = value
    if (key === 'id' && !value.includes('\0')) this.id = value
  }
}

export function channelDelivery(data: string): {
  headers: Record<string, string>
  body: Record<string, unknown>
} {
  try {
    const value = record(JSON.parse(data), 'channel message')
    const headers: Record<string, string> = {}
    for (const [key, field] of Object.entries(value))
      if (key.toLowerCase().startsWith('x-github-') && typeof field === 'string')
        headers[key.toLowerCase()] = field
    text(headers['x-github-event'], 'event header')
    return { headers, body: record(value.body, 'channel body') }
  } catch {
    throw new ReceiverError('invalid-channel-message')
  }
}

export function reconnectDelay(attempt: number, random = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))
  return Math.min(30_000, Math.round(base * (1 + Math.max(0, Math.min(1, random())) * 0.2)))
}

export async function createChannel(fetcher: typeof fetch = fetch): Promise<string> {
  let response: Response
  try {
    response = await fetcher('https://smee.io/new', {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ReceiverError('channel-create-failed')
  }
  const location = response.headers.get('location')
  if (response.status < 300 || response.status > 399 || location === null)
    throw new ReceiverError('channel-create-failed')
  const url = channelUrl(new URL(location, 'https://smee.io').href)
  if (new URL(url).origin !== 'https://smee.io') throw new ReceiverError('channel-create-failed')
  return url
}
