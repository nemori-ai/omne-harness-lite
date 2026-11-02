// The default compaction strategy, representation strategy and trimmer: the numbers of the SPEC,
// the shared policy obligations, retention that never splits a call from its result, and trimming
// that shortens only what goes to the summary step.
import { describe, expect, it } from 'vitest'
import type { CompactionContext, RecordEntryRef } from '@omne-harness/message'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  compactionPolicyConformance,
  representationPolicyConformance,
  runConformanceCase,
} from '@omne-harness/request-context-contract/testing'
import {
  decodeEpochId,
  project,
  type CompactionPolicy,
  type CompactionPolicyPort,
  type RetentionMeasurement,
} from '@omne-harness/request-context-contract'
import {
  DEFAULT_COMPACTION_POLICY,
  DEFAULT_REPRESENTATION_CONFIG,
  createDefaultCompactionPolicy,
  createDefaultRepresentationPolicy,
} from '@omne-harness/request-context'
import {
  assistantCall,
  blockId,
  covered,
  entryRef,
  tenantOf,
  textPart,
  toolResult,
  userMessage,
} from './fixtures/messages.ts'

const epoch = (() => {
  const decoded = decodeEpochId('epoch:1')
  if ('failure' in decoded) throw new Error('fixture')
  return decoded.ok
})()
const scope = (() => {
  const decoded = decodeScopeRef({ ref: 'scope:test' })
  if ('failure' in decoded) throw new Error('fixture')
  return decoded.ok
})()

/** Every entry costs 10 tokens, so a set costs ten times its size. */
async function measure(entries: readonly RecordEntryRef[]): Promise<RetentionMeasurement> {
  return { kind: 'measured', tokens: String(entries.length * 10) }
}
function planWith(
  policy: CompactionPolicyPort,
  context: CompactionContext,
  measureSet: (entries: readonly RecordEntryRef[]) => Promise<RetentionMeasurement> = measure,
  windowTokens = '1000',
) {
  return policy.plan({ view: project([], epoch), context, measure: measureSet, windowTokens })
}
function contextOf(
  entries: CompactionContext['covered'],
  after: CompactionContext['after'] = [],
  open: readonly RecordEntryRef[] = [],
): CompactionContext {
  return { origin: entryRef(0), base: { kind: 'initial' }, covered: entries, after, open }
}
const tokens = (n: number): CompactionPolicy['retainBudget'] => ({
  kind: 'tokens',
  retainTokens: String(n),
})
function policyWith(config: Partial<CompactionPolicy>) {
  return createDefaultCompactionPolicy({ config })
}
function draftOf(result: Awaited<ReturnType<typeof planWith>>) {
  if (result.kind !== 'draft') throw new Error(`Expected a draft, got ${result.kind}`)
  return result
}

describe('default compaction policy: configuration', () => {
  it('starts from the numbers of the SPEC', () => {
    expect(DEFAULT_COMPACTION_POLICY).toEqual({
      retainBudget: { kind: 'ratio', retainRatio: '0.16' },
      retainPreference: 'newest-first',
      triggerPercent: '80',
      headroomTokens: null,
      trimFirst: true,
      stepBound: '3',
    })
    expect(createDefaultCompactionPolicy().config).toEqual(DEFAULT_COMPACTION_POLICY)
  })
  it('lets the configuration replace each initial value and changes the digest with it', () => {
    const base = createDefaultCompactionPolicy()
    const changed = policyWith({ stepBound: '5', trimFirst: false })
    expect(changed.config).toMatchObject({ stepBound: '5', trimFirst: false })
    expect(changed.configDigest()).not.toBe(base.configDigest())
    expect(createDefaultCompactionPolicy().configDigest()).toBe(base.configDigest())
  })
  it('puts the trim threshold into the digest, because a plan must notice a changed threshold', () => {
    expect(createDefaultCompactionPolicy({ maxBlockBytes: '10' }).configDigest()).not.toBe(
      createDefaultCompactionPolicy().configDigest(),
    )
  })
  it('refuses a parameter that does not fit the schema instead of correcting it', () => {
    expect(() => policyWith({ retainBudget: { kind: 'ratio', retainRatio: '1.5' } })).toThrow(
      TypeError,
    )
    expect(() => policyWith({ stepBound: '0' })).toThrow(TypeError)
    expect(() => createDefaultCompactionPolicy({ maxBlockBytes: '-1' })).toThrow(TypeError)
  })
  it('passes the shared compaction policy obligations', async () => {
    const policy = createDefaultCompactionPolicy()
    for (const item of compactionPolicyConformance())
      await expect(
        runConformanceCase(item, { policy, fixture: { scope, tenant: tenantOf(), epochs: [] } }),
        item.name,
      ).resolves.toEqual({ kind: 'passed' })
  })
})

describe('default compaction policy: what is retained', () => {
  const history = [
    covered(0, userMessage(0)),
    covered(1, userMessage(1)),
    covered(2, userMessage(2)),
    covered(3, userMessage(3)),
  ]
  it('keeps the newest entries that fit the budget, in history order', async () => {
    const draft = draftOf(
      await planWith(policyWith({ retainBudget: tokens(25) }), contextOf(history)),
    )
    expect(draft.retained).toEqual([entryRef(2), entryRef(3)])
    expect(draft.coverTo).toBe(entryRef(3))
    expect(draft.bound).toBe('3')
    expect(draft.shape).toEqual({ kind: 'summarize', trimFirst: true })
  })
  it('derives the budget from the window when it is a ratio', async () => {
    // 15% of 200 tokens is 30: three entries of ten.
    const draft = draftOf(
      await planWith(
        policyWith({ retainBudget: { kind: 'ratio', retainRatio: '0.15' } }),
        contextOf(history),
        measure,
        '200',
      ),
    )
    expect(draft.retained).toEqual([entryRef(1), entryRef(2), entryRef(3)])
  })
  it('does not retain an entry that carries no message', async () => {
    const draft = draftOf(
      await planWith(
        policyWith({ retainBudget: tokens(1000) }),
        contextOf([covered(0, userMessage(0)), covered(1, null), covered(2, userMessage(2))]),
      ),
    )
    expect(draft.retained).toEqual([entryRef(0), entryRef(2)])
  })
  it('never splits a call from its result, whatever the budget', async () => {
    const entries = [
      covered(0, userMessage(0)),
      covered(1, assistantCall(1, 'c1')),
      covered(2, toolResult(2, 'c1', 'body')),
      covered(3, userMessage(3)),
    ]
    for (let budget = 0; budget <= 50; budget += 5) {
      const result = await planWith(
        policyWith({ retainBudget: tokens(budget) }),
        contextOf(entries),
      )
      if (result.kind !== 'draft') continue
      const kept = new Set(result.retained)
      expect(kept.has(entryRef(1)), `budget ${budget}`).toBe(kept.has(entryRef(2)))
    }
  })
  it('retains a call whose result lies after the window before it ranks anything else', async () => {
    // Newest-first would take the user message; the call must stay because its result stays.
    const draft = draftOf(
      await planWith(
        policyWith({ retainBudget: tokens(10) }),
        contextOf(
          [covered(0, assistantCall(0, 'c1')), covered(1, userMessage(1))],
          [covered(2, toolResult(2, 'c1', 'body'))],
        ),
      ),
    )
    expect(draft.retained).toEqual([entryRef(0)])
  })
  it('says the floor exceeds the budget when the forced entries alone are too large', async () => {
    const result = await planWith(
      policyWith({ retainBudget: tokens(5) }),
      contextOf(history, [], [entryRef(1)]),
    )
    expect(result).toMatchObject({
      kind: 'floor-exceeds-budget',
      floor: [entryRef(1)],
      budget: '5',
    })
    // The same forced entry fits a larger budget.
    const fits = await planWith(
      policyWith({ retainBudget: tokens(15) }),
      contextOf(history, [], [entryRef(1)]),
    )
    expect(fits.kind).toBe('draft')
  })
  it('passes an unknown measurement on as unknown and never counts it as zero', async () => {
    const result = await planWith(
      policyWith({ retainBudget: tokens(100) }),
      contextOf(history),
      async () => ({ kind: 'unknown', diagnostic: 'meter gone' }),
    )
    expect(result).toEqual({ kind: 'unknown', source: 'read', diagnostic: 'meter gone' })
  })
  it('prefers the newer entry by default and the answered call when told to', async () => {
    const entries = [
      covered(0, assistantCall(0, 'c1')),
      covered(1, toolResult(1, 'c1', 'body')),
      covered(2, userMessage(2)),
    ]
    const newest = draftOf(
      await planWith(policyWith({ retainBudget: tokens(10) }), contextOf(entries)),
    )
    expect(newest.retained).toEqual([entryRef(2)])
    const referenced = draftOf(
      await planWith(
        policyWith({ retainBudget: tokens(20), retainPreference: 'most-referenced' }),
        contextOf(entries),
      ),
    )
    expect(referenced.retained).toEqual([entryRef(0), entryRef(1)])
  })
})

describe('default compaction policy: trimmer and instruction', () => {
  const long = 'x'.repeat(300)
  const result = toolResult(1, 'c1', long)
  const material = {
    covered: [covered(0, userMessage(0, long)), covered(1, result)],
    retained: [],
    trimmed: [],
  }
  it('shortens only tool result text above the threshold and says what it shortened', () => {
    const policy = createDefaultCompactionPolicy({ maxBlockBytes: '100' })
    const trimmed = policy.trim(material, { maxBlockBytes: '65536' })
    expect(trimmed.trimmed).toEqual([
      {
        message: result.id,
        block: textPart(long, 't1').id,
        originalBytes: '300',
        keptBytes: '100',
      },
    ])
    const body = trimmed.covered[1]?.message?.blocks.find(part => part.kind === 'text')
    expect(body !== undefined && 'text' in body ? Buffer.byteLength(body.text) : -1).toBe(100)
    // The user message is not a tool result: it stays as it is.
    expect(trimmed.covered[0]).toBe(material.covered[0])
    expect(trimmed.covered[1]?.message?.id).toBe(result.id)
  })
  it('takes the smaller of the configured threshold and the one the caller passes', () => {
    const policy = createDefaultCompactionPolicy({ maxBlockBytes: '100' })
    expect(policy.trim(material, { maxBlockBytes: '40' }).trimmed[0]?.keptBytes).toBe('40')
  })
  it('leaves the original record and a short result untouched', () => {
    const before = JSON.stringify(material)
    const short = createDefaultCompactionPolicy({ maxBlockBytes: '1000' }).trim(material, {
      maxBlockBytes: '65536',
    })
    expect(short.trimmed).toEqual([])
    expect(short.covered).toEqual(material.covered)
    createDefaultCompactionPolicy({ maxBlockBytes: '10' }).trim(material, {
      maxBlockBytes: '65536',
    })
    expect(JSON.stringify(material)).toBe(before)
  })
  it('does not cut inside a multi-byte character', () => {
    const wide = toolResult(2, 'c2', '界'.repeat(50))
    const out = createDefaultCompactionPolicy({ maxBlockBytes: '100' }).trim(
      { covered: [covered(2, wide)], retained: [], trimmed: [] },
      { maxBlockBytes: '65536' },
    )
    expect(out.trimmed[0]?.keptBytes).toBe('99')
  })
  it('gives a fixed instruction as a model-visible text block', () => {
    const policy = createDefaultCompactionPolicy()
    const first = policy.summaryInstruction(material)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ kind: 'text', visibility: { toModel: true } })
    expect(policy.summaryInstruction(material)).toEqual(first)
  })
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
