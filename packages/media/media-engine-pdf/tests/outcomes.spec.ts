import { describe, expect, it } from 'vitest'
import type { EngineInput } from '@omne-harness/media-contract'
import { createPdfTextEngine } from '@omne-harness/media-engine-pdf'
import { damaged, encrypted, scan, selfHoldingPages, twoColumns } from './made-pdfs.ts'

function inputOf(bytes: Uint8Array, signal = new AbortController().signal): EngineInput {
  return {
    access: { tenant: 'tenant' as never, principal: null },
    media: {
      mediaType: 'application/pdf',
      bytes: bytes.byteLength,
      async *open() {
        yield bytes
      },
    },
    parameters: {},
    signal,
  }
}
const convert = (bytes: Uint8Array, signal?: AbortSignal) =>
  createPdfTextEngine().convert(inputOf(bytes, signal))

describe('what the engine answers for each kind of PDF (T4)', () => {
  it('takes out the words of a text layer, in the order the content stream writes them', async () => {
    expect(await convert(twoColumns())).toEqual({
      kind: 'converted',
      text: 'Left one.\nLeft two.\nRight one.\nRight two.',
      derived: [],
    })
  })

  it('says a scan has no text', async () => {
    expect(await convert(scan())).toEqual({ kind: 'inconvertible', reason: 'no-text' })
  })

  it('says a PDF that asks for a password is encrypted', async () => {
    expect(await convert(encrypted())).toEqual({ kind: 'inconvertible', reason: 'encrypted' })
  })

  it('says a PDF whose structure is broken is damaged', async () => {
    expect(await convert(damaged())).toEqual({ kind: 'inconvertible', reason: 'damaged' })
  })

  it('fails, and says nothing of the PDF, on an error it cannot tell apart', async () => {
    expect(await convert(selfHoldingPages())).toEqual({ kind: 'failed', reason: 'error' })
  })

  it('fails once it is cancelled, whatever the PDF', async () => {
    for (const bytes of [twoColumns(), encrypted(), damaged()])
      expect(await convert(bytes, AbortSignal.abort())).toEqual({ kind: 'failed', reason: 'error' })
  })

  it('is revision 2: the outcome of revision 1 no longer stands for these PDFs', () => {
    expect(createPdfTextEngine().declaration.revision).toBe('2')
  })
})
