import { Context } from '@deepseek-ai/cordis'
import {
  decisionEvidence,
  grantRefText,
  referenceAdmissionCheck,
} from '@omne-harness/authorization'
import { principalVerifierKey } from '@omne-harness/identity/cordis'
import { describe, expect, it } from 'vitest'
import { actionRulesSchema } from '../../../src/rows/authorization/action-rules.ts'
import {
  createToolTargetPolicy,
  installToolTargetPolicy,
  toolTargetPolicyOf,
} from '../../../src/rows/authorization/tool-target-policy.ts'
import { IMPLICIT_TOOL_GATE, decodeToolOperationId } from '@omne-harness/tool-contract'
import { createToolActionResolution } from '../../../src/entry/tool-action-resolution.ts'
import { okOf } from '../../entry/support.ts'
import { echoCall, toolsCall } from '../../entry/tool-call-support.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'
import { VERDICT_RELEASE } from '../../support/permission-release.ts'

// The fence hands the start the release with its grant in canonical text, unread by Tool.
const RELEASED = { by: 'verdict', grant: grantRefText(VERDICT_RELEASE.grant!) } as const

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
              release: VERDICT_RELEASE,
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
        release: RELEASED,
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
      // A real request's arguments name its command; the fixture's empty ones would name none.
      const echo = echoCall(world, {})
      await policy.qualify({
        ...access,
        request: {
          ...world.request('ToyEcho'),
          arguments: { original: echo, effective: echo, complete: true },
        },
      })
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

describe('what the start policy asks and answers', () => {
  const evidence = decisionEvidence('start-policy-fixture', '1', {})
  const rules = actionRulesSchema.parse({
    revision: '1',
    rules: [
      { id: 'tools', effect: 'allow', tool: 'Tools' },
      { id: 'echo', effect: 'allow', tool: 'ToyEcho' },
    ],
  })
  type Decision = Awaited<
    ReturnType<NonNullable<ReturnType<Parameters<typeof createToolTargetPolicy>[2]>>['check']>
  >
  async function asking(
    decision: Decision,
    identity: unknown = { kind: 'allowed', evidence },
    resolution?: () => unknown,
  ) {
    const world = await forwardWorld()
    const identities: unknown[] = []
    const judged: unknown[] = []
    const policy = createToolTargetPolicy(
      rules,
      () => ({
        check: async input => {
          identities.push(input)
          return identity as never
        },
      }),
      () => ({
        check: async input => {
          judged.push(input)
          return decision
        },
      }),
      (resolution ?? resolving(world)) as never,
    )
    const access = {
      principal: world.principal,
      tenant: world.tenant,
      call: world.call,
      admission: okOf(decodeToolOperationId('original-admission'), 'operation'),
    }
    const qualify = (tool: 'Tools' | 'ToyEcho' = 'ToyEcho') =>
      policy.qualify({ ...access, request: world.request(tool) })
    return { world, access, identities, judged, qualify }
  }
  const allow: Decision = { kind: 'allow', evidence, condition: null, release: VERDICT_RELEASE }

  it('asks the identity check as the tool admitting this call, and the permission as this call', async () => {
    const w = await asking(allow)
    try {
      expect(await w.qualify()).toEqual({ kind: 'allowed', condition: null, release: RELEASED })
      expect(w.identities).toMatchObject([
        {
          access: { principal: w.world.principal, tenant: w.world.tenant },
          operation: { owner: 'tool', name: 'admit' },
          target: { owner: 'tool', kind: 'call', key: w.access.call },
          requires: [],
          permit: null,
        },
      ])
      expect(w.judged).toMatchObject([
        {
          tenant: w.world.tenant,
          operation: { owner: 'tool', operationId: w.access.call },
          origin: { kind: 'tool-call', call: w.access.call, admission: w.access.admission },
        },
      ])
    } finally {
      await w.world.close()
    }
  })

  it.each([
    [
      { kind: 'denied', reason: 'not-a-member' },
      { kind: 'denied', reason: 'not-a-member' },
    ],
    [{ kind: 'unavailable' }, { kind: 'unavailable' }],
  ])(
    'answers an identity check that ends %j without asking the permission',
    async (identity, expected) => {
      const w = await asking(allow, identity)
      try {
        expect(await w.qualify()).toMatchObject(expected)
        expect(w.judged).toEqual([])
      } finally {
        await w.world.close()
      }
    },
  )

  it('hands a start the permission let through as a carrier a release that names no grant', async () => {
    const carried: Decision = {
      kind: 'allow',
      evidence,
      condition: null,
      release: { by: 'carrier', grant: null },
    }
    const w = await asking(carried)
    try {
      expect(await w.qualify()).toStrictEqual({
        kind: 'allowed',
        condition: null,
        release: { by: 'carrier', grant: null },
      })
    } finally {
      await w.world.close()
    }
  })

  it('hands an ungated start the release that names no gate, without asking the permission', async () => {
    const w = await asking(allow, undefined, () => ({
      resolve: async () => ({ ok: { kind: 'own', gate: { kind: 'ungated' } } }),
    }))
    try {
      expect(await w.qualify()).toStrictEqual({
        kind: 'allowed',
        condition: null,
        release: { by: 'ungated', grant: null },
      })
      expect(w.judged).toEqual([])
    } finally {
      await w.world.close()
    }
  })

  const unresolved: readonly (readonly [string, () => unknown])[] = [
    ['no action resolution', () => undefined],
    [
      'an action resolution that cannot resolve now',
      () => ({
        resolve: async () => ({
          failure: { kind: 'unavailable', dependency: 'tool-action', diagnostic: 'down' },
        }),
      }),
    ],
  ]
  it.each(unresolved)(
    'answers unavailable to a start with %s, without asking the permission',
    async (_name, reader) => {
      const w = await asking(allow, undefined, reader as never)
      try {
        expect(await w.qualify()).toMatchObject({ kind: 'unavailable' })
        expect(w.judged).toEqual([])
      } finally {
        await w.world.close()
      }
    },
  )

  it('records the once authorization a start rests on as the one consumption of its acceptance', async () => {
    const source = { owner: 'cards', record: 'answer-1', revision: '1', digest: 'answer-digest' }
    const consumer = { owner: '@omne-harness/agent', work: 'exe-1', position: 'act-1' }
    const authorization = { consumer, target: 't', argumentsDigest: 'd', source }
    const condition = { basis: 'fixture' } as never
    const w = await asking({
      kind: 'allow',
      evidence,
      condition,
      release: VERDICT_RELEASE,
      authorization,
    })
    try {
      expect(await w.qualify()).toEqual({
        kind: 'allowed',
        condition,
        release: RELEASED,
        authorizations: [
          {
            permit: { tenant: w.world.tenant, permit: 'answer-digest' },
            consumer,
            evidence: source,
          },
        ],
      })
    } finally {
      await w.world.close()
    }
  })

  it.each([
    [
      { kind: 'deny', category: 'rule', reason: 'permission-policy', evidence },
      { kind: 'denied', reason: 'permission-policy' },
    ],
    [{ kind: 'undecidable', diagnostic: 'x' }, { kind: 'unavailable' }],
    [{ kind: 'unavailable', diagnostic: 'x' }, { kind: 'unavailable' }],
  ] as const)('answers a permission that ends %j', async (decision, expected) => {
    const w = await asking(decision as Decision)
    try {
      const answer = await w.qualify()
      expect(answer).toMatchObject(expected)
      expect(answer).not.toHaveProperty('authorizations')
    } finally {
      await w.world.close()
    }
  })

  it('judges a call whose carried target is not valid as a carrier, and waits when the resolution cannot answer', async () => {
    const invalid = await asking(allow, undefined, () => ({
      resolve: async () => ({
        ok: {
          kind: 'argument-error',
          gate: { kind: 'gate', gate: IMPLICIT_TOOL_GATE },
          field: 'arguments',
          reason: 'x',
        },
      }),
    }))
    const failing = await asking(allow, undefined, () => ({
      resolve: async () => ({ failure: { kind: 'unavailable' } }),
    }))
    const absent = await asking(allow, undefined, () => undefined)
    try {
      expect(await invalid.qualify('Tools')).toMatchObject({ kind: 'allowed' })
      expect(invalid.judged).toMatchObject([{ carrier: true }])
      expect(await failing.qualify('Tools')).toMatchObject({ kind: 'unavailable' })
      expect(failing.judged).toEqual([])
      expect(await absent.qualify('Tools')).toMatchObject({ kind: 'unavailable' })
    } finally {
      await invalid.world.close()
      await failing.world.close()
      await absent.world.close()
    }
  })

  it('answers a call whose carried target cannot be told, before it asks the identity or the permission', async () => {
    const waiting = {
      kind: 'unavailable',
      diagnostic: 'The current target rule or its authority is unavailable.',
    }
    const failing = await asking(allow, undefined, () => ({
      resolve: async () => ({ failure: { kind: 'unavailable' } }),
    }))
    const absent = await asking(allow, undefined, () => undefined)
    const unknown = await asking(allow, undefined, () => ({ resolve: async () => undefined }))
    const invalid = await asking(allow, undefined, () => ({
      resolve: async () => ({
        ok: {
          kind: 'argument-error',
          gate: { kind: 'gate', gate: IMPLICIT_TOOL_GATE },
          field: 'arguments',
          reason: 'x',
        },
      }),
    }))
    try {
      for (const w of [failing, absent, unknown]) {
        expect(await w.qualify('Tools')).toStrictEqual(waiting)
        expect(w.identities).toEqual([])
        expect(w.judged).toEqual([])
      }
      expect(await invalid.qualify('Tools')).toStrictEqual({
        kind: 'allowed',
        condition: null,
        release: RELEASED,
      })
      expect(invalid.identities).toHaveLength(1)
      expect(invalid.judged).toMatchObject([{ carrier: true }])
    } finally {
      for (const w of [failing, absent, unknown, invalid]) await w.world.close()
    }
  })

  it('answers unavailable, with the same words, while the rules or the identity check are not there', async () => {
    const waiting = {
      kind: 'unavailable',
      diagnostic: 'The current target rule or its authority is unavailable.',
    }
    const world = await forwardWorld()
    try {
      const access = {
        principal: world.principal,
        tenant: world.tenant,
        call: world.call,
        admission: okOf(decodeToolOperationId('original-admission'), 'operation'),
      }
      const request = world.request('ToyEcho')
      const unruled = createToolTargetPolicy(
        undefined,
        () => ({ check: async () => ({ kind: 'allowed', evidence }) }) as never,
        () => ({ check: async () => allow }),
        resolving(world),
      )
      expect(await unruled.qualify({ ...access, request })).toStrictEqual(waiting)
      const unjudged = createToolTargetPolicy(
        rules,
        () => ({ check: async () => ({ kind: 'allowed', evidence }) }) as never,
        () => undefined,
        resolving(world),
      )
      expect(await unjudged.qualify({ ...access, request })).toStrictEqual(waiting)
      const unidentified = createToolTargetPolicy(
        rules,
        () => undefined,
        () => ({ check: async () => allow }),
        resolving(world),
      )
      expect(await unidentified.qualify({ ...access, request })).toStrictEqual(waiting)
    } finally {
      await world.close()
    }
  })
})
