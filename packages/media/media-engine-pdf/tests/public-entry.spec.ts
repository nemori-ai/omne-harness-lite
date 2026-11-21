import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { declarationProblem, engineAccepts, type EngineInput } from '@omne-harness/media-contract'
import { engineConformanceCases, type EngineSample } from '@omne-harness/media-contract/testing'
import { createPdfTextEngine } from '@omne-harness/media-engine-pdf'

const sample = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))
const ACCESS = { tenant: 'tenant' as never, principal: null }

function inputOf(bytes: Uint8Array, signal = new AbortController().signal): EngineInput {
  return {
    access: ACCESS,
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
const SAMPLES: EngineSample[] = [
  {
    mediaType: 'application/pdf',
    bytes: sample('passphrase.pdf'),
    parameters: {},
    expect: 'converted',
  },
  {
    mediaType: 'application/pdf',
    bytes: sample('no-text.pdf'),
    parameters: {},
    expect: 'inconvertible',
  },
]

describe('the engine pdf.extract-text', () => {
  it('exports only the engine factory', async () => {
    const root = (await import('@omne-harness/media-engine-pdf')) as Record<string, unknown>
    expect(Object.keys(root)).toEqual(['createPdfTextEngine'])
  })

  it('declares a sound engine of PDFs, in process, with no parameters', () => {
    const { declaration } = createPdfTextEngine()
    expect(declarationProblem(declaration)).toBeNull()
    expect(declaration).toMatchObject({ name: 'pdf.extract-text', egress: { kind: 'in-process' } })
    expect(engineAccepts(declaration, 'application/pdf')).toBe(true)
    expect(engineAccepts(declaration, 'image/png')).toBe(false)
    expect(engineAccepts(declaration, 'application/zip')).toBe(false)
  })

  it.each(engineConformanceCases)('passes the conformance case: $name', async item => {
    await item.run(async () => ({ engine: createPdfTextEngine(), samples: SAMPLES }))
  })

  it('takes out the words of the text layer, the passphrase among them', async () => {
    const output = await createPdfTextEngine().convert(inputOf(sample('passphrase.pdf')))
    expect(output).toMatchObject({ kind: 'converted', derived: [] })
    expect(output.kind === 'converted' && output.text).toContain(
      'The passphrase is BLUE GIRAFFE 4172.',
    )
  })

  it('writes the radicals a font maps ideographs to as the ideographs, and leaves the rest as written', async () => {
    const output = await createPdfTextEngine().convert(inputOf(sample('chinese.pdf')))
    if (output.kind !== 'converted') throw new Error(JSON.stringify(output))
    expect(output.text).toBe('会议纪要\n第一、二项通过，第十项待议。\n口令：蓝色长颈鹿四一七二')
    expect(output.text).not.toMatch(/[\u2E80-\u2FDF]/u)
  })

  it('says a PDF with no text layer, on one page or on two, and a file that is no PDF, cannot be converted', async () => {
    const engine = createPdfTextEngine()
    expect(await engine.convert(inputOf(sample('no-text-two-pages.pdf')))).toEqual({
      kind: 'inconvertible',
    })
    expect(await engine.convert(inputOf(sample('no-text.pdf')))).toEqual({ kind: 'inconvertible' })
    expect(await engine.convert(inputOf(sample('broken.pdf')))).toEqual({ kind: 'inconvertible' })
  })

  it('reads the medium in parts, and answers an error once it is cancelled', async () => {
    const bytes = sample('passphrase.pdf')
    const parts: EngineInput = {
      ...inputOf(bytes),
      media: {
        mediaType: 'application/pdf',
        bytes: bytes.byteLength,
        async *open() {
          yield bytes.subarray(0, 100)
          yield bytes.subarray(100)
        },
      },
    }
    expect(await createPdfTextEngine().convert(parts)).toMatchObject({ kind: 'converted' })
    const cancelled = await createPdfTextEngine().convert(inputOf(bytes, AbortSignal.abort()))
    expect(cancelled).toEqual({ kind: 'failed', reason: 'error' })
  })
})
