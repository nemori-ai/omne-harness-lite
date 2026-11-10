import { Context } from '@deepseek-ai/cordis'
import { decisionEvidence, referenceAdmissionCheck } from '@omne-harness/authorization'
import { principalVerifierKey } from '@omne-harness/identity/cordis'
import { describe, expect, it } from 'vitest'
import { actionRulesSchema } from '../../../src/rows/authorization/action-rules.ts'
import {
  createToolTargetPolicy,
  installToolTargetPolicy,
  toolTargetPolicyOf,
} from '../../../src/rows/authorization/tool-target-policy.ts'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import { okOf } from '../../entry/support.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'

describe('current target rules of the authorization row', () => {
  it('allows the parent Tools but refuses its Shell target; deny wins over allow', async () => {
    const world = await forwardWorld()
    try {
      const verifier = world.fixture.root.get(principalVerifierKey)
      if (verifier === undefined) throw new Error('verifier missing')
      const identity = referenceAdmissionCheck({
        verifier,
        permits: null,
        standing: {
          read: async () => ({
            kind: 'member',
            role: { role: 'member', model: { model: 'test', revision: '1' } },
            qualifications: [],
            evidence: { record: 'test', revision: '1' },
          }),
        },
      })
      const rules = actionRulesSchema.parse({
        revision: '2',
        rules: [
          { id: 'tools', effect: 'allow', tool: 'Tools' },
          { id: 'shell', effect: 'allow', tool: 'Shell' },
          { id: 'no-shell', effect: 'deny', tool: 'Shell' },
        ],
      })
      let live = true
      const policy = createToolTargetPolicy(
        rules,
        () => (live ? identity : undefined),
        () => ({
          check: async input => {
            expect(input.origin).toMatchObject({
              kind: 'tool-call',
              admission: access.admission,
              call: access.call,
            })
            return { kind: 'allow', evidence: decisionEvidence('permission-fixture', '1', {}) }
          },
        }),
      )
      const access = {
        principal: world.principal,
        tenant: world.tenant,
        call: world.call,
        admission: okOf(decodeToolOperationId('original-admission'), 'operation'),
      }
      expect(
        await createToolTargetPolicy(rules, () => identity).qualify({
          ...access,
          request: world.request('Tools'),
        }),
      ).toMatchObject({ kind: 'unavailable' })
      expect(await policy.qualify({ ...access, request: world.request('Tools') })).toEqual({
        kind: 'allowed',
      })
      expect(await policy.qualify({ ...access, request: world.request('Shell') })).toEqual({
        kind: 'denied',
        reason: 'rule/no-shell',
      })
      expect(await policy.qualify({ ...access, request: world.request('Files') })).toMatchObject({
        kind: 'unavailable',
      })
      const exact = createToolTargetPolicy(
        actionRulesSchema.parse({
          revision: '3',
          rules: [
            {
              id: 'exact',
              effect: 'allow',
              tool: 'Tools',
              definition: {
                ...world.request('Tools').availability.definition.adoption,
                digest: 'different',
              },
            },
          ],
        }),
        () => identity,
      )
      expect(await exact.qualify({ ...access, request: world.request('Tools') })).toMatchObject({
        kind: 'unavailable',
      })
      live = false
      expect(await policy.qualify({ ...access, request: world.request('Tools') })).toMatchObject({
        kind: 'unavailable',
      })
      expect(
        await policy.qualify({ ...access, principal: {}, request: world.request('Tools') }),
      ).toMatchObject({ kind: 'denied' })
    } finally {
      await world.close()
    }
  })
  it('isolates running roots and removes the current port on row retirement', async () => {
    const a = new Context(),
      b = new Context()
    const policy = createToolTargetPolicy(undefined, () => undefined)
    try {
      const row = a.plugin({
        name: 'target-policy-test',
        apply: ctx => installToolTargetPolicy(ctx, policy),
      })
      await row
      expect(toolTargetPolicyOf(a)).toBe(policy)
      expect(toolTargetPolicyOf(b)).toBeUndefined()
      await row.dispose()
      expect(toolTargetPolicyOf(a)).toBeUndefined()
    } finally {
      await a.fiber.dispose()
      await b.fiber.dispose()
    }
  })
})
