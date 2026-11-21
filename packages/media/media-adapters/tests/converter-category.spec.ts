import { Context } from '@deepseek-ai/cordis'
import { readBodyText, type JsonValue } from '@omne-harness/assets'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import {
  CONVERTER_CATEGORY,
  converterBodyContract,
  parseConverterBody,
} from '@omne-harness/media-adapters'
import { converterCategoryPlugin } from '@omne-harness/media-adapters/cordis'
import { describe, expect, it } from 'vitest'

const LIMITS = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 32,
  maxStringLength: 512,
  maxNumberLength: 20,
}
/** A body as the assets hand it to a judgment: read from text and frozen. */
function read(body: unknown): JsonValue {
  const text = readBodyText(JSON.stringify(body), LIMITS)
  if (text.kind !== 'ok') throw new Error(text.kind)
  return text.value
}
const SOUND = {
  kind: 'voice',
  engine: 'voice.transcribe',
  parameters: { language: 'en', temperature: 0 },
  egress: { kind: 'remote', destination: 'openrouter.ai' },
}

describe('the body of a converter definition', () => {
  it('reads the kind, the engine, its parameters as plain values and where the bytes go', () => {
    expect(parseConverterBody(read(SOUND), 'voice')).toEqual({
      ok: {
        kind: 'voice',
        engine: 'voice.transcribe',
        parameters: { language: 'en', temperature: 0 },
        egress: { kind: 'remote', destination: 'openrouter.ai' },
      },
    })
    const pdf = {
      ...SOUND,
      kind: 'application-pdf',
      engine: 'pdf.extract-text',
      egress: { kind: 'in-process' },
    }
    expect(parseConverterBody(read(pdf), 'application-pdf')).toMatchObject({
      ok: { kind: 'application-pdf', egress: { kind: 'in-process' } },
    })
    expect(parseConverterBody(read({ ...SOUND, egress: { kind: 'host' } }))).toMatchObject({
      ok: { egress: { kind: 'host' } },
    })
  })

  it.each([
    ['not an object', ['voice'], 'not-an-object'],
    ['no kind', { ...SOUND, kind: undefined }, 'invalid-kind'],
    ['a kind that names no medium', { ...SOUND, kind: 'pdf' }, 'invalid-kind'],
    ['a kind written as a media type', { ...SOUND, kind: 'audio/wav' }, 'invalid-kind'],
    ['an engine name that is none', { ...SOUND, engine: 'Voice Transcribe' }, 'invalid-engine'],
    ['no engine', { ...SOUND, engine: undefined }, 'invalid-engine'],
    ['parameters that are no object', { ...SOUND, parameters: ['en'] }, 'invalid-parameters'],
    ['no parameters', { ...SOUND, parameters: undefined }, 'invalid-parameters'],
    ['a destination of no kind', { ...SOUND, egress: { kind: 'cloud' } }, 'invalid-egress'],
    [
      'a remote one with no destination',
      { ...SOUND, egress: { kind: 'remote' } },
      'invalid-egress',
    ],
    [
      'a remote one with an empty destination',
      { ...SOUND, egress: { kind: 'remote', destination: '' } },
      'invalid-egress',
    ],
    ['no destination', { ...SOUND, egress: undefined }, 'invalid-egress'],
    [
      'a destination of no kind, named',
      { ...SOUND, egress: { kind: 'cloud', destination: 'x' } },
      'invalid-egress',
    ],
  ])('refuses %s', (_, body, reason) => {
    expect(parseConverterBody(read(body), 'voice')).toEqual({ failure: reason })
    expect(converterBodyContract().judge(read(body), { capabilityName: 'voice' })).toEqual({
      ok: false,
      rejected: reason,
    })
  })

  it('refuses a kind other than the name of the asset', () => {
    expect(parseConverterBody(read(SOUND), 'image')).toEqual({ failure: 'kind-mismatch' })
  })

  it('judges only a body the assets read: an object literal is refused, however sound', () => {
    const literal = JSON.parse(JSON.stringify(read(SOUND))) as unknown
    expect(parseConverterBody(literal as never, 'voice')).toMatchObject({ ok: { kind: 'voice' } })
    expect(converterBodyContract().judge(literal, { capabilityName: 'voice' })).toEqual({
      ok: false,
      rejected: 'not-an-object',
    })
  })

  it('judges a sound body, with or without the name of the asset, and declares nothing else', () => {
    const contract = converterBodyContract()
    expect(contract.category).toBe(CONVERTER_CATEGORY)
    expect(contract.judge(read(SOUND), { capabilityName: 'voice' })).toEqual({ ok: true })
    expect(contract.judge(read(SOUND))).toEqual({ ok: true })
    expect(contract.deriveDeclarations(read(SOUND) as never)).toEqual({ entries: [] })
    expect(contract.references(read(SOUND) as never)).toEqual([])
    expect(contract.layout).toBeUndefined()
  })

  it('refuses to declare anything of a body that does not hold', () => {
    const contract = converterBodyContract()
    const broken = read({ ...SOUND, engine: 'Bad Name' })
    expect(() => contract.deriveDeclarations(broken)).toThrow(/invalid-engine/u)
    expect(() => contract.references(broken)).toThrow(/invalid-engine/u)
    expect(() => contract.deriveDeclarations(read(SOUND), { capabilityName: 'image' })).toThrow(
      /kind-mismatch/u,
    )
  })
})

describe('the converter category', () => {
  it('is listed as data that can be made, while its plugin is in the tree', async () => {
    const root = new Context()
    await root.plugin(assetCategoriesPlugin)
    const scope = root.plugin(converterCategoryPlugin)
    await scope
    expect(
      root.assetCategories.view
        .list()
        .map(item => [item.category, item.display.title, item.creation]),
    ).toEqual([['converter', '转换件', 'data']])
    await scope.dispose()
    expect(root.assetCategories.view.list()).toEqual([])
  })
})
