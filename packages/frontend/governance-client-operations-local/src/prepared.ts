import { createHash, X509Certificate } from 'node:crypto'
import type {
  ActionIntent,
  ActionInput,
  ActionPreview,
  InputPrompt,
  PreviewIntent,
} from '@omne-harness-lite/governance-client-operations'
import { captureAction, captureIntent, capturePrompt, freeze, validPreview } from './validation.ts'
import { block, defect, type ReportFrame } from './report.ts'

/** Validate before any public callback; a trust configuration is not display-safe by itself. */
function previewIntent(intent: ActionIntent): PreviewIntent {
  if (intent.action !== 'configure') return intent
  const url = new URL(intent.endpoint)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('invalid configuration')
  const trust = intent.trust
  if (trust.mode === 'spki') return { ...intent, endpoint: url.href, trust }
  const pem = trust.certificateAuthorities
  if (pem === undefined)
    return { ...intent, endpoint: url.href, trust: { mode: 'ca', source: 'system' } }
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
  if (
    blocks === null ||
    pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim() !== ''
  )
    throw new Error('invalid CA material')
  for (const certificate of blocks)
    if (!new X509Certificate(certificate).ca) throw new Error('not a CA')
  return {
    ...intent,
    endpoint: url.href,
    trust: {
      mode: 'ca',
      source: 'explicit',
      sha256: createHash('sha256').update(pem, 'utf8').digest('hex'),
    },
  }
}

/** One actual callback lifetime; abort requests completion but never substitutes for it. */
export class Prepared {
  readonly intent: ActionIntent
  readonly #preview: PreviewIntent
  readonly #controller = new AbortController()
  #prompt: InputPrompt | undefined
  private constructor(intent: ActionIntent, preview: PreviewIntent, prompt: InputPrompt) {
    this.intent = intent
    this.#preview = preview
    this.#prompt = prompt
  }
  static capture(input: unknown, prompt: InputPrompt): Prepared | undefined {
    const intent = captureIntent(input)
    if (intent === undefined || typeof prompt !== 'function') return undefined
    try {
      return new Prepared(intent, freeze(previewIntent(intent)), prompt)
    } catch {
      return undefined
    }
  }
  cancel(): void {
    this.#controller.abort()
  }
  release(): void {
    this.#prompt = undefined
  }
  continueAllowed(frame: ReportFrame): boolean {
    if (!this.#controller.signal.aborted) return true
    block(frame, 'invalid-input')
    frame.remote = { ...frame.remote, status: 'not-attempted', sendAttempted: false }
    frame.view = { source: 'none' }
    return false
  }
  async complete(
    frame: ReportFrame,
    endpoint: string,
    source: ActionPreview['source'],
  ): Promise<ActionInput | undefined> {
    // A preparation observation is not the target outcome.
    const stopped = (): undefined => {
      frame.remote = { ...frame.remote, status: 'not-attempted', sendAttempted: false }
      frame.view = { source: 'none' }
      return undefined
    }
    if (this.#controller.signal.aborted) {
      block(frame, 'invalid-input')
      return stopped()
    }
    const preview = freeze({
      intent: this.#preview,
      origin: frame.origin,
      endpoint: this.#preview.action === 'configure' ? this.#preview.endpoint : endpoint,
      source,
    })
    if (!validPreview(preview)) {
      defect(frame, 'input')
      return stopped()
    }
    let result: ReturnType<typeof capturePrompt>
    try {
      const returned = await this.#prompt!(preview, this.#controller.signal)
      result = capturePrompt(this.intent, returned)
    } catch {
      defect(frame, 'input')
      return stopped()
    } finally {
      this.release()
    }
    if (this.#controller.signal.aborted || result === undefined || result.kind === 'cancelled') {
      block(frame, 'invalid-input')
      return stopped()
    }
    const intent = this.intent
    const input = captureAction(
      'payload' in intent
        ? { ...intent, payload: { ...intent.payload, ...result.secrets } }
        : intent,
    )
    if (input === undefined) {
      block(frame, 'invalid-input')
      return stopped()
    }
    return input
  }
}
