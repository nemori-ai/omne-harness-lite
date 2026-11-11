import { expect, it } from 'vitest'
import { judgePermissionAssignment, evaluatePermission } from '@omne-harness/permissions'
import { evaluation, source } from './fixtures.ts'

it('checks a new pick against outer bounds without requiring the corresponding action to be allowed', () => {
  const current = {
    ...evaluation(),
    sources: { ...evaluation().sources, tenant: { kind: 'absent', revision: '1' } },
  }
  expect(evaluatePermission(current)).toMatchObject({ kind: 'effective', permitsOperation: false })
  expect(
    judgePermissionAssignment({
      layer: 'session',
      rule: { pick: 'auto', allowedSet: null },
      current,
    }),
  ).toEqual({ kind: 'valid', basis: 'current-bounds' })
})
it('does not let the target layer lock or prohibition prevent its own qualified replacement', () => {
  const current = evaluation()
  current.sources.session = source('deny', ['deny'])
  expect(
    judgePermissionAssignment({
      layer: 'session',
      rule: { pick: 'ask', allowedSet: null },
      current,
    }),
  ).toEqual({ kind: 'valid', basis: 'current-bounds' })
})
it('rejects an older edit after the applicable outer bound tightens', () => {
  const current = evaluation()
  const edit = { layer: 'session', rule: { pick: 'auto', allowedSet: null }, current }
  expect(judgePermissionAssignment(edit)).toMatchObject({ kind: 'valid' })
  current.sources.organization = source('ask', ['deny', 'ask'])
  expect(judgePermissionAssignment(edit)).toEqual({ kind: 'denied', reason: 'outside-bound' })
})
it('keeps an outer active prohibition and still allows a qualified restrictive write', () => {
  const current = evaluation()
  current.sources.organization = source('deny')
  expect(
    judgePermissionAssignment({
      layer: 'session',
      rule: { pick: 'auto', allowedSet: null },
      current,
    }),
  ).toEqual({ kind: 'denied', reason: 'active-prohibition' })
  expect(
    judgePermissionAssignment({
      layer: 'session',
      rule: { pick: 'deny', allowedSet: null },
      current,
    }),
  ).toEqual({ kind: 'valid', basis: 'restrictive' })
})
it('does not turn missing current sources into a permissive write or prevent a definite restriction', () => {
  const current = {
    ...evaluation(),
    sources: {
      ...evaluation().sources,
      organization: { kind: 'unavailable', sourceRef: 'organization' },
    },
  }
  expect(
    judgePermissionAssignment({
      layer: 'session',
      rule: { pick: 'auto', allowedSet: null },
      current,
    }),
  ).toMatchObject({ kind: 'unavailable', missingBasis: ['organization'] })
  for (const rule of [
    { pick: 'deny', allowedSet: null },
    { pick: null, allowedSet: [] },
    { pick: null, allowedSet: ['deny'] },
  ])
    expect(judgePermissionAssignment({ layer: 'session', rule, current })).toEqual({
      kind: 'valid',
      basis: 'restrictive',
    })
})
it('allows only the owning writer to decide the original-row legality of clearing a withdrawn definition', () => {
  expect(judgePermissionAssignment({ layer: 'session', rule: null })).toEqual({
    kind: 'valid',
    basis: 'clear',
  })
  expect(judgePermissionAssignment({ layer: 'workspace', rule: null })).toMatchObject({
    kind: 'invalid-input',
  })
})
it('checks applicable extra constraints and does not require a comparison rule merely to validate a bound', () => {
  const current = evaluation()
  current.constraints[0].effect.allowedSet = ['deny', 'ask']
  expect(
    judgePermissionAssignment({
      layer: 'session',
      rule: { pick: 'auto', allowedSet: null },
      current,
    }),
  ).toEqual({ kind: 'denied', reason: 'outside-bound' })
  const noPick = {
    ...current,
    declaration: {
      kind: 'available',
      definition: {
        ...current.declaration.definition,
        comparison: null,
        defaultRule: { pick: null, allowedSet: null },
      },
    },
    sources: { ...current.sources, tenant: source(null) },
  }
  expect(
    judgePermissionAssignment({
      layer: 'session',
      rule: { pick: null, allowedSet: ['ask'] },
      current: noPick,
    }),
  ).toEqual({ kind: 'valid', basis: 'current-bounds' })
})
it('rejects an unsupported layer, unknown values and duplicate bound entries before assigning', () => {
  const current = evaluation()
  for (const rule of [
    { pick: 'unknown', allowedSet: null },
    { pick: null, allowedSet: ['ask', 'ask'] },
  ])
    expect(judgePermissionAssignment({ layer: 'session', rule, current })).toMatchObject({
      kind: 'invalid-input',
    })
  current.declaration.definition.assignmentLayers = ['tenant']
  expect(
    judgePermissionAssignment({
      layer: 'session',
      rule: { pick: 'deny', allowedSet: null },
      current,
    }),
  ).toMatchObject({ kind: 'invalid-input' })
})

it('never turns a definite restriction into permission across 192 outer-source configurations', () => {
  const values = ['deny', 'ask', 'auto']
  const restrictions = [
    { pick: 'deny', allowedSet: null },
    { pick: null, allowedSet: [] },
    { pick: null, allowedSet: ['deny'] },
  ]
  let checked = 0
  for (let mask = 0; mask < 8; mask++) {
    const bound = values.filter((_, index) => (mask & (1 << index)) !== 0)
    for (const pick of [null, ...values]) {
      for (const available of [false, true]) {
        const current = evaluation()
        const organization = available
          ? source(pick, bound)
          : { kind: 'unavailable', sourceRef: 'organization' }
        for (const rule of restrictions) {
          const material = { ...current, sources: { ...current.sources, organization } }
          expect(judgePermissionAssignment({ layer: 'session', rule, current: material })).toEqual({
            kind: 'valid',
            basis: 'restrictive',
          })
          const result = evaluatePermission({
            ...material,
            sources: { ...material.sources, session: source(rule.pick, rule.allowedSet) },
          })
          expect(result.kind).not.toBe('invalid-input')
          if (result.kind === 'effective') expect(result.permitsOperation).toBe(false)
          checked++
        }
      }
    }
  }
  expect(checked).toBe(192)
})
