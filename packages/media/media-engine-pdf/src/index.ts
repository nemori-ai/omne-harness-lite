import type {
  ConverterEngine,
  EngineDeclaration,
  EngineInput,
  EngineOutput,
} from '@omne-harness/media-contract'
import { extractText } from 'unpdf'
import { unifyRadicals } from './radicals.ts'

const DECLARATION: EngineDeclaration = {
  name: 'pdf.extract-text',
  revision: '1',
  accepts: ['application/pdf'],
  maxBytes: 50 * 1024 * 1024,
  egress: { kind: 'in-process' },
  concurrency: 2,
  parameters: { type: 'object', properties: {}, additionalProperties: false },
}

const INCONVERTIBLE: EngineOutput = Object.freeze({ kind: 'inconvertible' })
const CANCELLED: EngineOutput = Object.freeze({ kind: 'failed', reason: 'error' })

async function bytesOf(input: EngineInput): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  for await (const part of input.media.open()) parts.push(part)
  const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let at = 0
  for (const part of parts) {
    whole.set(part, at)
    at += part.byteLength
  }
  return whole
}

/** The text layer of a PDF, radicals written as ideographs. A PDF that cannot be read has no text to give. */
export function createPdfTextEngine(): ConverterEngine {
  return {
    declaration: DECLARATION,
    async convert(input) {
      if (input.signal.aborted) return CANCELLED
      const bytes = await bytesOf(input)
      const read = await extractText(bytes, { mergePages: true }).catch(() => undefined)
      if (input.signal.aborted) return CANCELLED
      const text = unifyRadicals(read?.text ?? '').trim()
      return text === '' ? INCONVERTIBLE : { kind: 'converted', text, derived: [] }
    },
  }
}
