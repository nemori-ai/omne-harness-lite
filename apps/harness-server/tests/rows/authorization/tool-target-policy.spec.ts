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
import { createToolActionResolution } from '../../../src/entry/tool-action-resolution.ts'
import { okOf } from '../../entry/support.ts'
import { toolsCall } from '../../entry/tool-call-support.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'

type World = Awaited<ReturnType<typeof forwardWorld>>
const resolving = (world: World) => {
  const resolution = createToolActionResolution({
    release: () => world.release,
    catalog: () => world.catalog,
    view: () => world.view,
  })
  return () => resolution
}

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
          { id: 'echo', effect: 'allow', tool: 'ToyEcho' },
          { id: 'shell', effect: 'allow', tool: 'Shell' },
          { id: 'no-shell', effect: 'deny', tool: 'Shell' },
        ],
      })
      let live = true
      const carriers: unknown[] = []
      const policy = createToolTargetPolicy(
        rules,
        () => (live ? identity : undefined),
        () => ({
          check: async input => {
            carriers.push(input.carrier)
            expect(input.origin).toMatchObject({
              kind: 'tool-call',
              admission: access.admission,
              call: access.call,
            })
            return {
              kind: 'allow',
              evidence: decisionEvidence('permission-fixture', '1', {}),
              condition: { basis: 'fixture' },
            }
          },
        }),
        resolving(world),
      )
      const access = {
        principal: world.principal,
        tenant: world.tenant,
        call: world.call,
        admission: okOf(decodeToolOperationId('original-admission'), 'operation'),
      }
      expect(
        await createToolTargetPolicy(
          rules,
          () => identity,
          () => undefined,
          resolving(world),
        ).qualify({
          ...access,
          request: world.request('Tools'),
        }),
      ).toMatchObject({ kind: 'unavailable' })
      // The fence only guards: a call a person has yet to release does not start.
      const asking = createToolTargetPolicy(
        rules,
        () => identity,
        () => ({
          check: async () => ({ kind: 'ask', evidence: decisionEvidence('ask-fixture', '1', {}) }),
        }),
        resolving(world),
      )
      // Without the resolution the fence cannot tell a carrier from an action of its own.
      const blind = createToolTargetPolicy(
        rules,
        () => identity,
        () => ({ check: async () => ({ kind: 'ask', evidence: decisionEvidence('a', '1', {}) }) }),
        () => undefined,
      )
      expect(await blind.qualify({ ...access, request: world.request('Tools') })).toMatchObject({
        kind: 'unavailable',
      })
      expect(await asking.qualify({ ...access, request: world.request('Tools') })).toEqual({
        kind: 'denied',
        reason: 'decision-required',
      })
      expect(await policy.qualify({ ...access, request: world.request('Tools') })).toEqual({
        kind: 'allowed',
        condition: { basis: 'fixture' },
      })
      // A Tools execute call only carries its target, as admission judged it; a target is its own.
      const carrying = toolsCall(world, { name: 'ToyEcho', command: 'info', arguments: {} })
      const parent = world.request('Tools')
      await policy.qualify({
        ...access,
        request: {
          ...parent,
          arguments: { original: carrying, effective: carrying, complete: true },
        },
      })
      await policy.qualify({ ...access, request: world.request('ToyEcho') })
      expect(carriers.slice(-2)).toEqual([true, undefined])
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
        () => undefined,
        resolving(world),
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
    const policy = createToolTargetPolicy(
      undefined,
      () => undefined,
      () => undefined,
      () => undefined,
    )
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
