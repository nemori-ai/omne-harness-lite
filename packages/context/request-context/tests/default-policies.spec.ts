import { describe, expect, it } from 'vitest'
import {
  representationPolicyConformance,
  runConformanceCase,
  fixtureBudget,
} from '@omne-harness/request-context-contract/testing'
import { judgeBudget } from '@omne-harness/request-context-contract'
import {
  DEFAULT_COMPACTION_POLICY,
  DEFAULT_REPRESENTATION_CONFIG,
  createDefaultCompactionPolicy,
  createDefaultRepresentationPolicy,
} from '@omne-harness/request-context'
import { blockId, textPart } from './fixtures/messages.ts'

it('uses the selected model trigger without an operator override', () => {
  expect(DEFAULT_COMPACTION_POLICY).toEqual({ triggerPercent: null, headroomTokens: null })
  expect(
    judgeBudget({
      whole: fixtureBudget('500'),
      fixedPart: fixtureBudget('1'),
      context: {
        window: { provided: '1000', upstream: [] },
        input: null,
        output: { provided: '10', upstream: [] },
        compactionTriggerPercent: '40',
      },
      limits: [],
      policy: createDefaultCompactionPolicy().config,
    }).kind,
  ).toBe('needs-compaction')
})
it('keeps configured trigger parameters in its adopted digest', () => {
  const base = createDefaultCompactionPolicy()
  const changed = createDefaultCompactionPolicy({
    config: { triggerPercent: '70', headroomTokens: '99' },
  })
  expect(changed.config).toEqual({ triggerPercent: '70', headroomTokens: '99' })
  expect(changed.configDigest()).not.toBe(base.configDigest())
  expect(changed.configDigest()).toBe(changed.configDigest())
  expect(() => createDefaultCompactionPolicy({ config: { triggerPercent: '101' } })).toThrow(
    TypeError,
  )
})

describe('default representation policy', () => {
  const image = {
    kind: 'image' as const,
    id: blockId('i1'),
    visibility: { toModel: true, toHuman: true },
    mediaType: 'image/png',
    inline: 'AAAA',
  }
  const converted = {
    kind: 'converted' as const,
    value: {
      original: image,
      converter: { owner: 'test', name: 'c', revision: '1', digest: 'd' },
      derived: [textPart('a cat', 'd1')] as const,
      transcript: 'a cat',
    },
  }
  it('starts from original, then derived, then transcript for every modality', () => {
    expect(DEFAULT_REPRESENTATION_CONFIG.preferences).toEqual({
      text: ['original', 'derived', 'transcript'],
      image: ['original', 'derived', 'transcript'],
      voice: ['original', 'derived', 'transcript'],
    })
  })
  it('passes the shared representation policy obligations', async () => {
    const policy = createDefaultRepresentationPolicy()
    for (const item of representationPolicyConformance())
      await expect(runConformanceCase(item, { policy }), item.name).resolves.toEqual({
        kind: 'passed',
      })
  })
  it('takes the original when the model accepts it, the derived text when it does not', () => {
    const policy = createDefaultRepresentationPolicy()
    expect(policy.choose({ block: image, conversion: null, modalities: ['text', 'image'] })).toBe(
      'original',
    )
    expect(policy.choose({ block: image, conversion: converted, modalities: ['text'] })).toBe(
      'derived',
    )
  })
  it('follows the configured preference order', () => {
    const policy = createDefaultRepresentationPolicy({
      preferences: { image: ['transcript', 'original'] },
    })
    expect(
      policy.choose({ block: image, conversion: converted, modalities: ['text', 'image'] }),
    ).toBe('transcript')
    expect(policy.config.preferences.text).toEqual(['original', 'derived', 'transcript'])
  })
  it('answers none and does not invent a conversion when nothing is acceptable', () => {
    const policy = createDefaultRepresentationPolicy()
    expect(policy.choose({ block: image, conversion: null, modalities: ['text'] })).toBe('none')
    expect(
      policy.choose({
        block: image,
        conversion: { kind: 'unchanged', original: image, reason: 'no-converter' },
        modalities: ['text'],
      }),
    ).toBe('none')
  })
  it('skips a derived form whose own blocks the model cannot take', () => {
    const policy = createDefaultRepresentationPolicy({
      preferences: { image: ['derived', 'transcript'] },
    })
    const withImage = {
      ...converted,
      value: { ...converted.value, derived: [{ ...image, id: blockId('d2') }] as const },
    }
    expect(policy.choose({ block: image, conversion: withImage, modalities: ['text'] })).toBe(
      'transcript',
    )
  })
  it('refuses a preference list that holds an unknown choice', () => {
    const preferences = { text: ['original', 'guess'] }
    expect(() => createDefaultRepresentationPolicy({ preferences } as never)).toThrow(TypeError)
  })
})
