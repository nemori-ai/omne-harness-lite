import { capabilityId } from '@omne-harness/assets'
import { parseConverterBody } from '@omne-harness/media-adapters'
import { expect, it } from 'vitest'
import {
  officialConverterBody,
  officialConverterSource,
  releaseConverters,
} from '../../src/assets/converters.ts'

const id = (category: string, name: string) => {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error(name)
  return made.id
}

it('the release carries two converter definitions: voice and PDF, each judged sound', () => {
  expect(
    releaseConverters().map(item => [item.name, parseConverterBody(item.body, item.name)]),
  ).toEqual([
    ['voice', { ok: expect.objectContaining({ kind: 'voice', engine: 'voice.transcribe' }) }],
    [
      'application-pdf',
      { ok: expect.objectContaining({ kind: 'application-pdf', engine: 'pdf.extract-text' }) },
    ],
  ])
  for (const item of releaseConverters()) expect(item.version).toMatch(/^[0-9a-f]{64}$/u)
})

it('the official layer offers them as candidates that are never disabled, and nothing else', async () => {
  const source = officialConverterSource()
  expect(source.layer).toBe('official')
  const voice = await source.candidates(id('converter', 'voice'))
  expect(voice).toEqual({
    layer: 'official',
    state: 'read',
    candidates: [
      {
        asset: 'official/converter/voice',
        version: releaseConverters()[0]!.version,
        disabled: false,
        immutable: false,
        replaceLocked: false,
      },
    ],
  })
  expect(await source.candidates(id('converter', 'image'))).toEqual({
    layer: 'official',
    state: 'read',
    candidates: [],
  })
  expect(await source.candidates(id('skill', 'voice'))).toEqual({
    layer: 'official',
    state: 'read',
    candidates: [],
  })
})

it('reads the body of an official candidate, and nothing for any other', () => {
  const [voice] = releaseConverters()
  expect(officialConverterBody('official/converter/voice')).toBe(voice!.body)
  expect(officialConverterBody('official/converter/image')).toBeUndefined()
  expect(officialConverterBody('tenant/converter/voice')).toBeUndefined()
})
