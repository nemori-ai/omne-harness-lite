import type { ToolBodyRepresentation, ToolBodyWriter } from '@omne-harness/tool-contract'
import { OUTPUT_BODY_KEY } from '@omne-harness/tool-contract/provider'

/** How the running output of one execution goes into its output body. */
export type OutputStaging = Readonly<{
  writer: ToolBodyWriter
  representation: ToolBodyRepresentation
  /** The output is written only for an execution that runs at least this long. */
  startAfterMs: number
  /** Output that arrives in between is written together at this interval. */
  batchMs: number
  /** The output body holds at most this many bytes; the rest is counted, not written. */
  maxBytes: number
}>

// Author-internal constants: begin after five seconds, write about once a second.
export const STAGING_START_AFTER_MS = 5_000
export const STAGING_BATCH_MS = 1_000
export const STAGING_MAX_BYTES = 8 * 1_048_576

const utf8 = new TextEncoder()

/** Cuts text to at most `bytes` UTF-8 bytes without splitting a character. */
function fitting(text: string, bytes: number): string {
  if (utf8.encode(text).length <= bytes) return text
  let kept = ''
  let used = 0
  for (const character of text) {
    const size = utf8.encode(character).length
    if (used + size > bytes) break
    kept += character
    used += size
  }
  return kept
}

/**
 * Writes the output of one execution into its output body while it runs. A write that fails ends
 * the staging, never the execution; the result line then says the body is incomplete.
 */
export class OutputStage {
  private pending = ''
  private written = 0
  private dropped = 0
  private sequence = 0
  private state: 'waiting' | 'writing' | 'stopped' = 'waiting'
  private failure: string | null = null
  private chain: Promise<void> = Promise.resolve()
  private readonly start: ReturnType<typeof setTimeout>
  private batch: ReturnType<typeof setInterval> | null = null

  private readonly staging: OutputStaging

  constructor(staging: OutputStaging) {
    this.staging = staging
    this.start = setTimeout(() => this.begin(), staging.startAfterMs)
  }

  /** Text of the output as it arrives, in order. */
  observe(text: string): void {
    if (text === '' || this.state === 'stopped') return
    this.pending += text
  }

  /** Writes what is left and seals the body; an execution shorter than the start writes nothing. */
  async finish(): Promise<string> {
    clearTimeout(this.start)
    if (this.batch !== null) clearInterval(this.batch)
    if (this.state === 'writing') this.enqueue(true)
    await this.chain
    if (this.state === 'writing' && this.sequence > 0)
      await this.step(async () => {
        const sealed = await this.staging.writer.seal(OUTPUT_BODY_KEY, String(this.sequence))
        return 'failure' in sealed ? `seal ${sealed.failure.kind}` : null
      })
    return this.line()
  }

  private begin(): void {
    if (this.state !== 'waiting') return
    this.state = 'writing'
    this.chain = this.chain.then(() =>
      this.step(async () => {
        const begun = await this.staging.writer.begin(OUTPUT_BODY_KEY, this.staging.representation)
        return 'failure' in begun ? `begin ${begun.failure.kind}` : null
      }),
    )
    this.enqueue(false)
    this.batch = setInterval(() => this.enqueue(false), this.staging.batchMs)
  }

  private enqueue(end: boolean): void {
    // Once a byte is dropped nothing after it is written: the body stays a prefix of the output.
    const room = this.dropped > 0 ? 0 : Math.max(0, this.staging.maxBytes - this.written)
    const text = fitting(this.pending, room)
    this.dropped += utf8.encode(this.pending).length - utf8.encode(text).length
    this.pending = ''
    if (text === '' && !end) return
    this.written += utf8.encode(text).length
    this.chain = this.chain.then(() =>
      this.step(async () => {
        const sequence = String(this.sequence + 1)
        const frame = { kind: 'text' as const, block: OUTPUT_BODY_KEY, text, end }
        const appended = await this.staging.writer.append(OUTPUT_BODY_KEY, sequence, frame)
        if ('failure' in appended) return `append ${appended.failure.kind}`
        this.sequence += 1
        return null
      }),
    )
  }

  private async step(write: () => Promise<string | null>): Promise<void> {
    if (this.state !== 'writing') return
    let failure: string | null
    try {
      failure = await write()
    } catch {
      failure = 'threw'
    }
    if (failure === null) return
    this.failure = failure
    this.state = 'stopped'
    if (this.batch !== null) clearInterval(this.batch)
  }

  private line(): string {
    if (this.state === 'waiting') return ''
    const parts = [`output_body=${this.failure === null ? 'sealed' : 'incomplete'}`]
    if (this.failure !== null) parts.push(`reason=${this.failure.replaceAll(' ', '_')}`)
    if (this.dropped > 0) parts.push(`dropped_bytes=${this.dropped}`)
    return `${parts.join(' ')}\n`
  }
}
