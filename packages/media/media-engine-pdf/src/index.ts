import type {
  ConverterEngine,
  EngineDeclaration,
  EngineInput,
  EngineOutput,
  InconvertibleReason,
} from '@omne-harness/media-contract'
import { extractText } from 'unpdf'
import { unifyRadicals } from './radicals.ts'

const DECLARATION: EngineDeclaration = {
  name: 'pdf.extract-text',
  revision: '2',
  accepts: ['application/pdf'],
  maxBytes: 50 * 1024 * 1024,
  egress: { kind: 'in-process' },
  concurrency: 2,
  parameters: { type: 'object', properties: {}, additionalProperties: false },
}

const FAILED: EngineOutput = Object.freeze({ kind: 'failed', reason: 'error' })
const inconvertible = (reason: InconvertibleReason): EngineOutput => ({
  kind: 'inconvertible',
  reason,
})
/** The errors pdf.js names for a PDF it cannot open: one that asks for a password, one it cannot parse. */
const NAMED = new Map<string, InconvertibleReason>([
  ['PasswordException', 'encrypted'],
  ['InvalidPDFException', 'damaged'],
])

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

/** The text layer of a PDF, radicals written as ideographs; or why the PDF has none to give. */
export function createPdfTextEngine(): ConverterEngine {
  return {
    declaration: DECLARATION,
    async convert(input) {
      const bytes = await bytesOf(input)
      const read = await extractText(bytes, { mergePages: true }).then(
        ({ text }) => ({ text }),
        (error: unknown) => ({ error }),
      )
      if (input.signal.aborted) return FAILED
      if ('error' in read) {
        const reason = read.error instanceof Error ? NAMED.get(read.error.name) : undefined
        return reason === undefined ? FAILED : inconvertible(reason)
      }
      const text = unifyRadicals(read.text).trim()
      return text === '' ? inconvertible('no-text') : { kind: 'converted', text, derived: [] }
    },
  }
}
