// @module-tag slow
import { expect, test } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { evaluationInputFingerprint } from '@omne-harness-lite/asset-evaluation'
import {
  at,
  legalInput,
  capability,
  definition,
  description,
  placementFixture,
  scope,
  sessionPick,
} from './placement-fixture.ts'

test.each(['always-allow', 'auto_place', 'never-allow'] as const)(
  'real current input evaluates the explicit %s factory permission',
  async permission => {
    const h = placementFixture(permission)
    const result = await h.query()
    expect(result).toMatchObject({
      kind: 'placement',
      placement: {
        scope,
        ...h.call,
        permission,
        requirement: definition.settings?.targetEnvironment?.default,
        revision: `${evaluationInputFingerprint(h.input())}/${permission}`,
        evidence: { asset: 'shell-asset', version: '1', factoryPermission: permission },
      },
    })
    expect(h.acquire).toHaveBeenCalledWith(h.token, { ...scope, callId: h.call.execution })
    expect(h.inputs).toHaveBeenCalledWith(scope.session, scope.tenant)
    expect(h.release).toHaveBeenCalledOnce()
  },
)
test('real session picks update both target and permission without rewriting the selected tool', async () => {
  const h = placementFixture(),
    target = { bindingLayer: 'session_sandbox', facilities: ['command', 'files'] }
  h.setCurrent({
    input: sessionPick(
      sessionPick(h.input(), 'targetEnvironment', target),
      'executionEnvironment',
      { allowed: ['auto_place'] },
    ),
  })
  expect(await h.query()).toMatchObject({
    kind: 'placement',
    placement: {
      permission: 'auto_place',
      requirement: target,
      evidence: { permissionFrom: 'session' },
    },
  })
  expect(h.selected.definition).toEqual(definition)
})
test('a real immutable organization bound wins over a widening session pick', async () => {
  const h = placementFixture(),
    input = h.input()
  const bounded = {
    ...input,
    holdings: [
      ...input.holdings,
      {
        holder: { layer: 'organization' as const, organization: scope.tenant.organization },
        capability,
        asset: 'shell-asset',
        basis: { kind: 'official' as const },
        versionSelection: { kind: 'current' as const },
        immutable: false,
        assignments: [
          {
            item: 'executionEnvironment',
            value: { allowed: ['never-allow'] },
            immutable: true,
            since: at,
          },
        ],
        since: at,
      },
    ],
  }
  h.setCurrent({
    input: sessionPick(bounded, 'executionEnvironment', { allowed: ['always-allow'] }),
  })
  expect(await h.query()).toMatchObject({
    kind: 'placement',
    placement: { permission: 'never-allow', evidence: { permissionFrom: 'organization' } },
  })
})
test.each([{ allowed: ['auto_place', 'never-allow'] }, { allowed: [] }])(
  'an unresolved current permission set does not select its first item (%j)',
  async ({ allowed }) => {
    const h = placementFixture()
    h.setCurrent({ input: sessionPick(h.input(), 'executionEnvironment', { allowed }) })
    expect(await h.query()).toEqual({ kind: 'rejected', reason: 'policyUnavailable' })
    expect(h.release).toHaveBeenCalledOnce()
  },
)
test.each(['invalidInput', 'unavailable'] as const)(
  'current input %s is preserved and the original observer is released',
  async failure => {
    const h = placementFixture()
    h.setCurrent({ failure })
    expect(await h.query()).toEqual({ kind: 'rejected', reason: failure })
    expect(h.release).toHaveBeenCalledOnce()
  },
)
test('current foreign tenant input cannot grant authority', async () => {
  const h = placementFixture()
  h.setCurrent({
    input: {
      ...h.input(),
      tenant: unwrap(parseTenantId({ organization: 'foreign', account: 'foreign' })),
    },
  })
  expect(await h.query()).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
})
test('a newly published version cannot replace the original execution selection', async () => {
  const h = placementFixture(),
    input = h.input()
  h.setCurrent({
    input: {
      ...input,
      definitions: input.definitions.map(value =>
        value.id === 'shell-asset'
          ? { ...value, versions: [...value.versions, { ...value.versions[0]!, number: 2 }] }
          : value,
      ),
    },
  })
  expect(await h.query()).toEqual({ kind: 'rejected', reason: 'policyUnavailable' })
})
test('changed same-version tool content cannot impersonate the original definition', async () => {
  const h = placementFixture()
  h.setCurrent({
    input: legalInput({ ...definition, description: 'changed' }),
  })
  expect(await h.query()).toEqual({ kind: 'rejected', reason: 'policyUnavailable' })
})
test('operation authorization re-evaluates real permission and rejects newly forbidden host effects', async () => {
  const h = placementFixture(),
    result = await h.query()
  if (result.kind !== 'placement') throw new Error('legal original placement rejected')
  expect(
    await h.source.authorizeOperation(scope, h.token, result.placement, description, 'command'),
  ).toEqual({ kind: 'authorized' })
  h.setCurrent({
    input: sessionPick(h.input(), 'executionEnvironment', { allowed: ['never-allow'] }),
  })
  expect(
    await h.source.authorizeOperation(scope, h.token, result.placement, description, 'command'),
  ).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  expect(h.release).toHaveBeenCalledTimes(3)
})
test('operation authorization cannot grant a facility absent from the original requirement', async () => {
  const h = placementFixture(),
    result = await h.query()
  if (result.kind !== 'placement') throw new Error('legal original placement rejected')
  expect(
    await h.source.authorizeOperation(scope, h.token, result.placement, description, 'files'),
  ).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  expect(h.inputs).toHaveBeenCalledOnce()
})
