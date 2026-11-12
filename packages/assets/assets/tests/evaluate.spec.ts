// `evaluate`: the candidate resolution of SPEC「合法候选与替换」. One case for each cell of the
// totalized table, named after the cell, and one property over a small exhaustive space.
import { describe, expect, it } from 'vitest'
import { evaluate, type Candidate, type Evaluation, type LayerInput } from '../src/index.ts'

function candidate(asset: string, flags: Partial<Omit<Candidate, 'asset'>> = {}): Candidate {
  return {
    asset,
    version: flags.version ?? `${asset}-v1`,
    disabled: flags.disabled ?? false,
    immutable: flags.immutable ?? false,
    replaceLocked: flags.replaceLocked ?? false,
  }
}

const read = (layer: string, ...candidates: Candidate[]): LayerInput => ({
  layer,
  state: 'read',
  candidates,
})
const everyoneEligible = () => 'yes' as const

describe('evaluate: the cells of the totalized table', () => {
  it('有胜出者：答 winner，带哪一层、哪一份、出局者与原因', () => {
    const official = candidate('official/skill/review')
    const disabled = candidate('tenant/other', { disabled: true })
    const tenant = candidate('tenant/review')
    const result = evaluate({
      layers: [read('official', official), read('tenant', disabled, tenant)],
      eligible: everyoneEligible,
    })
    expect(result).toEqual({
      kind: 'winner',
      layer: 'tenant',
      candidate: tenant,
      filtered: [{ layer: 'tenant', candidate: disabled, reason: 'disabled' }],
    })
  })

  it('一个候选都没有：答 none，filtered 为空', () => {
    expect(
      evaluate({ layers: [read('official'), read('tenant')], eligible: everyoneEligible }),
    ).toEqual({ kind: 'none', filtered: [] })
    expect(evaluate({ layers: [], eligible: everyoneEligible })).toEqual({
      kind: 'none',
      filtered: [],
    })
  })

  it('有候选，全部被禁用：答 none，原因都是 disabled', () => {
    const first = candidate('a', { disabled: true, immutable: true })
    const second = candidate('b', { disabled: true })
    const asked: Candidate[] = []
    const result = evaluate({
      layers: [read('official', first), read('tenant', second)],
      eligible: one => {
        asked.push(one)
        return 'yes'
      },
    })
    expect(result).toEqual({
      kind: 'none',
      filtered: [
        { layer: 'official', candidate: first, reason: 'disabled' },
        { layer: 'tenant', candidate: second, reason: 'disabled' },
      ],
    })
    // The disabled filter comes before the eligibility filter.
    expect(asked).toEqual([])
  })

  it('有候选，都没有资格：答 none，原因都是 ineligible', () => {
    const first = candidate('a')
    const second = candidate('b', { replaceLocked: true })
    const result = evaluate({
      layers: [read('official', first), read('tenant', second)],
      eligible: () => 'no',
    })
    expect(result).toEqual({
      kind: 'none',
      filtered: [
        { layer: 'official', candidate: first, reason: 'ineligible' },
        { layer: 'tenant', candidate: second, reason: 'ineligible' },
      ],
    })
  })

  it('被禁用或没资格的更具体的候选不遮住别的合法候选', () => {
    const official = candidate('official/review')
    const organization = candidate('org/review', { disabled: true })
    const tenant = candidate('tenant/review')
    const result = evaluate({
      layers: [read('official', official), read('organization', organization), read('tenant', tenant)],
      eligible: (_one, layer) => (layer === 'tenant' ? 'no' : 'yes'),
    })
    expect(result).toEqual({
      kind: 'winner',
      layer: 'official',
      candidate: official,
      filtered: [
        { layer: 'organization', candidate: organization, reason: 'disabled' },
        { layer: 'tenant', candidate: tenant, reason: 'ineligible' },
      ],
    })
    // Nor can a filtered candidate block others with its declaration or its lock.
    const lockedButDisabled = candidate('org/review', { disabled: true, immutable: true })
    const lockedButIneligible = candidate('org/other', { replaceLocked: true })
    expect(
      evaluate({
        layers: [read('organization', lockedButDisabled, lockedButIneligible), read('tenant', tenant)],
        eligible: one => (one === lockedButIneligible ? 'no' : 'yes'),
      }),
    ).toMatchObject({ kind: 'winner', layer: 'tenant', candidate: tenant })
  })

  it.each([
    ['不可替换', { immutable: true }],
    ['替换锁', { replaceLocked: true }],
  ] as const)(
    '上层的%s：下层同名的其他资产出局，原因 blocked，by 写上层的标签',
    (_case, flag) => {
      const official = candidate('official/review', flag)
      const organization = candidate('org/review')
      const sameAsset = candidate('official/review', { version: 'pinned-older' })
      const result = evaluate({
        layers: [
          read('official', official),
          read('organization', organization),
          read('tenant', sameAsset),
        ],
        eligible: everyoneEligible,
      })
      // The same concrete asset held again in a lower layer is no replacement.
      expect(result).toEqual({
        kind: 'winner',
        layer: 'tenant',
        candidate: sameAsset,
        filtered: [
          { layer: 'organization', candidate: organization, reason: 'blocked', by: 'official' },
        ],
      })
      // The constraint acts only downwards: a lower declaration does not bind an upper layer.
      const lowerLocked = candidate('tenant/review', flag)
      expect(
        evaluate({
          layers: [read('official', candidate('official/review')), read('tenant', lowerLocked)],
          eligible: everyoneEligible,
        }),
      ).toEqual({ kind: 'winner', layer: 'tenant', candidate: lowerLocked, filtered: [] })
    },
  )

  it('某一层读不到，不论别的层有没有胜出者：答 unavailable，带那一层的标签', () => {
    const tenant = candidate('tenant/review')
    expect(
      evaluate({
        layers: [{ layer: 'organization', state: 'unavailable' }, read('tenant', tenant)],
        eligible: everyoneEligible,
      }),
    ).toEqual({ kind: 'unavailable', layer: 'organization' })
    expect(
      evaluate({
        layers: [read('official'), { layer: 'tenant', state: 'unavailable' }],
        eligible: everyoneEligible,
      }),
    ).toEqual({ kind: 'unavailable', layer: 'tenant' })
  })

  it('某一层不适用：照常求值，当它不存在', () => {
    const official = candidate('official/review', { immutable: true })
    const tenant = candidate('tenant/review')
    const layers = [read('official', official), read('tenant', tenant)]
    const withGap = [layers[0]!, { layer: 'organization', state: 'not-applicable' } as const, layers[1]!]
    expect(evaluate({ layers: withGap, eligible: everyoneEligible })).toEqual(
      evaluate({ layers, eligible: everyoneEligible }),
    )
    expect(evaluate({ layers: withGap, eligible: everyoneEligible })).toMatchObject({
      kind: 'winner',
      layer: 'official',
    })
  })

  it('资格答 unknown：答 unavailable，带那个候选所在的层', () => {
    const official = candidate('official/review')
    const tenant = candidate('tenant/review')
    expect(
      evaluate({
        layers: [read('official', official), read('tenant', tenant)],
        eligible: one => (one === tenant ? 'unknown' : 'yes'),
      }),
    ).toEqual({ kind: 'unavailable', layer: 'tenant' })
  })
})

// The property, restated from the SPEC without the algorithm: a lawful candidate is neither
// disabled nor ineligible; a lawful candidate is blocked when a lawful, unblocked candidate of a
// wider layer declares immutable or holds a replace lock and is another concrete asset.
describe('evaluate: property over every input of three layers with up to one candidate each', () => {
  const ASSETS = ['x', 'y'] as const
  const flags = [false, true] as const

  function* candidates(): Generator<Candidate & { eligible: boolean }> {
    for (const asset of ASSETS)
      for (const disabled of flags)
        for (const immutable of flags)
          for (const replaceLocked of flags)
            for (const eligible of flags)
              yield { asset, version: 'v', disabled, immutable, replaceLocked, eligible }
  }

  type Slot = 'not-applicable' | 'empty' | (Candidate & { eligible: boolean })
  const slots: Slot[] = ['not-applicable', 'empty', ...candidates()]

  /** What the SPEC says about one input, or `undefined` when the result agrees. */
  function disagreement(picked: readonly Slot[], result: Evaluation): string | undefined {
    const lawful = picked.map(slot =>
      typeof slot === 'object' && !slot.disabled && slot.eligible ? slot : undefined,
    )
    const blocked: boolean[] = []
    lawful.forEach((one, index) => {
      blocked[index] =
        one !== undefined &&
        lawful.some(
          (upper, above) =>
            above < index &&
            upper !== undefined &&
            !blocked[above] &&
            (upper.immutable || upper.replaceLocked) &&
            upper.asset !== one.asset,
        )
    })
    const standing = lawful.flatMap((one, index) =>
      one !== undefined && !blocked[index] ? [index] : [],
    )
    const last = standing.at(-1)
    const locker = standing.find(index => lawful[index]!.immutable || lawful[index]!.replaceLocked)
    if (last === undefined) {
      if (result.kind !== 'none') return 'no lawful candidate stands, so the answer is none'
    } else if (
      result.kind !== 'winner' ||
      result.layer !== `L${last}` ||
      result.candidate !== picked[last]
    )
      return `the most specific standing candidate is in L${last}`
    const out = picked.flatMap((slot, index) =>
      typeof slot === 'object' && (slot.disabled || !slot.eligible || blocked[index])
        ? [{ index, slot }]
        : [],
    )
    if (result.filtered.length !== out.length) return 'filtered lists every filtered candidate'
    for (const [position, { index, slot }] of out.entries()) {
      const given = result.filtered[position]
      const reason = slot.disabled ? 'disabled' : !slot.eligible ? 'ineligible' : 'blocked'
      if (given?.layer !== `L${index}` || given.candidate !== slot || given.reason !== reason)
        return `L${index} is filtered as ${reason}`
      const by = reason === 'blocked' ? `L${locker}` : undefined
      if (given.by !== by) return `L${index} is blocked by ${by}`
    }
    return undefined
  }

  it('the winner is lawful, unblocked and the most specific such one; none means no lawful one', () => {
    const disagreements: string[] = []
    let checked = 0
    for (const a of slots)
      for (const b of slots)
        for (const c of slots) {
          const picked = [a, b, c]
          const layers: LayerInput[] = picked.map((slot, index) =>
            slot === 'not-applicable'
              ? { layer: `L${index}`, state: 'not-applicable' }
              : read(`L${index}`, ...(slot === 'empty' ? [] : [slot])),
          )
          const result = evaluate({
            layers,
            eligible: one => ((one as Candidate & { eligible: boolean }).eligible ? 'yes' : 'no'),
          })
          const found = disagreement(picked, result)
          if (found !== undefined) disagreements.push(`${JSON.stringify(picked)}: ${found}`)
          checked += 1
        }
    expect(disagreements.slice(0, 3)).toEqual([])
    expect(checked).toBe(slots.length ** 3)
  })
})
