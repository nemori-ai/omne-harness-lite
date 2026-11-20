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
import { blockId } from './fixtures/messages.ts'

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
  const pdf = {
    kind: 'file' as const,
    id: blockId('f1'),
    visibility: { toModel: true, toHuman: true },
    ref: { storage: 's', key: 'k', mediaType: 'application/pdf', bytes: '3', digest: 'd' },
    transcript: null,
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
  it('takes the first of its order that the block can take with the model', () => {
    const policy = createDefaultRepresentationPolicy()
    const all = ['original', 'derived', 'transcript'] as const
    expect(policy.choose({ block: image, available: all })).toBe('original')
    expect(policy.choose({ block: image, available: ['derived', 'transcript'] })).toBe('derived')
    expect(policy.choose({ block: image, available: ['transcript'] })).toBe('transcript')
  })
  it('follows the configured preference order, each modality its own', () => {
    const policy = createDefaultRepresentationPolicy({
      preferences: { image: ['transcript', 'original'] },
    })
    expect(policy.choose({ block: image, available: ['original', 'transcript'] })).toBe(
      'transcript',
    )
    expect(policy.choose({ block: image, available: ['derived'] })).toBe('none')
    expect(policy.config.preferences.text).toEqual(['original', 'derived', 'transcript'])
  })
  it('answers none when the block can take nothing with the model', () => {
    const policy = createDefaultRepresentationPolicy()
    expect(policy.choose({ block: image, available: [] })).toBe('none')
  })
  it('orders a file of no modality as original, other representation, words', () => {
    const policy = createDefaultRepresentationPolicy({ preferences: { text: ['transcript'] } })
    expect(policy.choose({ block: pdf, available: ['transcript', 'derived'] })).toBe('derived')
    expect(policy.choose({ block: pdf, available: ['transcript', 'original'] })).toBe('original')
  })
  it('refuses a preference list that holds an unknown choice', () => {
    const preferences = { text: ['original', 'guess'] }
    expect(() => createDefaultRepresentationPolicy({ preferences } as never)).toThrow(TypeError)
  })
})
