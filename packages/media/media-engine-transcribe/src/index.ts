import type {
  ConverterEngine,
  EngineAccess,
  EngineDeclaration,
  EngineInput,
  EngineOutput,
} from '@omne-harness/media-contract'

/** The key the assembly finds for whoever asks; the engine never learns where it is kept. */
export type TranscribeKey =
  | Readonly<{ kind: 'key'; value: string }>
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'unavailable' }>

export type TranscribeOptions = Readonly<{
  /** The transcription endpoint, such as `https://openrouter.ai/api/v1/audio/transcriptions`. */
  endpoint: string
  key(access: EngineAccess, signal: AbortSignal): Promise<TranscribeKey>
  fetch?: typeof fetch
}>

const FORMATS: Readonly<Record<string, string>> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
}
const DEFAULT_MODEL = 'qwen/qwen3-asr-0.6b'
/** A key that will not do, a bill not paid, a limit hit, a service down: another time may work. */
const UNAVAILABLE_STATUS = new Set([401, 402, 403, 429])
const NOT_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH'])

const failed = (reason: 'unavailable' | 'error' | 'outcome-unknown'): EngineOutput => ({
  kind: 'failed',
  reason,
})

function declarationOf(endpoint: string): EngineDeclaration {
  return {
    name: 'voice.transcribe',
    revision: '1',
    accepts: Object.keys(FORMATS),
    maxBytes: 25 * 1024 * 1024,
    egress: { kind: 'remote', destination: new URL(endpoint).hostname },
    concurrency: 4,
    parameters: {
      type: 'object',
      properties: { model: { type: 'string' }, language: { type: 'string' } },
      additionalProperties: false,
    },
  }
}

async function base64Of(input: EngineInput): Promise<string> {
  const parts: Buffer[] = []
  for await (const part of input.media.open()) parts.push(Buffer.from(part))
  return Buffer.concat(parts).toString('base64')
}

function bodyOf(input: EngineInput, data: string): string {
  const { model, language } = input.parameters
  return JSON.stringify({
    model: typeof model === 'string' ? model : DEFAULT_MODEL,
    input_audio: { data, format: FORMATS[input.media.mediaType] ?? 'wav' },
    ...(typeof language === 'string' ? { language } : {}),
  })
}

async function wordsOf(response: Response): Promise<EngineOutput> {
  const read = (await response.json().catch(() => undefined)) as { text?: unknown } | undefined
  if (typeof read?.text !== 'string') return failed('outcome-unknown')
  const text = read.text.trim()
  return text === '' ? { kind: 'inconvertible' } : { kind: 'converted', text, derived: [] }
}

function sentFailure(error: unknown, signal: AbortSignal): EngineOutput {
  if (signal.aborted) return failed('error')
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined
  const code = typeof cause?.code === 'string' ? cause.code : ''
  return failed(NOT_SENT.has(code) ? 'unavailable' : 'outcome-unknown')
}

/** Speech to text through a transcription endpoint. The time limit is the borrower's: the engine follows the signal. */
export function createTranscribeEngine(options: TranscribeOptions): ConverterEngine {
  const send = options.fetch ?? fetch
  return {
    declaration: declarationOf(options.endpoint),
    async convert(input) {
      const key = await options.key(input.access, input.signal).catch(() => undefined)
      if (key?.kind !== 'key') return failed('unavailable')
      const body = bodyOf(input, await base64Of(input))
      try {
        const response = await send(options.endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${key.value}`, 'content-type': 'application/json' },
          body,
          signal: input.signal,
        })
        if (response.ok) return await wordsOf(response)
        await response.body?.cancel()
        const status = response.status
        return failed(UNAVAILABLE_STATUS.has(status) || status >= 500 ? 'unavailable' : 'error')
      } catch (error) {
        return sentFailure(error, input.signal)
      }
    },
  }
}
