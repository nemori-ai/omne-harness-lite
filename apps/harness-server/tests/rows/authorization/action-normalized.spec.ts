import { describe, expect, it } from 'vitest'
import { decisionEvidence, type AdmissionCheck } from '@omne-harness/authorization'
import type { ToolActionResolution } from '@omne-harness/tool-contract'
import { createToolActionResolution } from '../../../src/entry/tool-action-resolution.ts'
import { createActionAdmission } from '../../../src/rows/authorization/action-admission.ts'
import { inquiryOncePerPass } from '../../../src/rows/authorization/current-permission.ts'
import {
  permissionDecisionOf,
  type ToolPermissionAction,
  type ToolPermissionCheck,
} from '../../../src/rows/authorization/current-tool-permission.ts'
import { echoCall, toolsCall } from '../../entry/tool-call-support.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'

type Tier = 'allowed' | 'prohibited' | 'decision-required'
type Mode = 'never' | 'auto_permission' | 'bypass-permissions'
const TIERS: readonly Tier[] = ['allowed', 'prohibited', 'decision-required']
const MODES: readonly Mode[] = ['never', 'auto_permission', 'bypass-permissions']
const ON_ASK = {
  never: 'deny',
  auto_permission: 'ask-human',
  'bypass-permissions': 'skip-ask',
} as const

const evidence = decisionEvidence('normalized-test', '1', {})
const allowing = { check: async () => ({ kind: 'allowed', evidence }) } as unknown as AdmissionCheck
const rules = {
  revision: 'r1',
  rules: [
    { id: 'tools', effect: 'allow', tool: 'Tools' },
    { id: 'echo', effect: 'allow', tool: 'ToyEcho' },
  ],
}

// The current permission of each gate is a tier by tool name; the session's policy follows the mode.
function permission(tiers: Readonly<Record<string, Tier>>, mode: Mode) {
  const seen: ToolPermissionAction[] = []
  const check: ToolPermissionCheck = {
    async check(input) {
      seen.push(input)
      const kind = tiers[input.definition.name]
      if (kind === undefined) return { kind: 'unavailable', diagnostic: 'no tier' }
      const inquiry = {
        inquiry: { policy: { onAsk: ON_ASK[mode] } },
        basis: { permissionRevision: '1' },
      } as never
      return permissionDecisionOf({ kind, revision: '1' }, inquiry, input.carrier === true, {
        evidence,
        condition: null,
      })
    },
  }
  return { check, seen }
}

async function both(
  world: Awaited<ReturnType<typeof forwardWorld>>,
  tiers: Readonly<Record<string, Tier>>,
  mode: Mode,
) {
  const resolution = createToolActionResolution({
    release: () => world.release,
    catalog: () => world.catalog,
    view: () => world.view,
  })
  const current = permission(tiers, mode)
  const admission = createActionAdmission({
    actionRules: rules,
    readAdmission: () => allowing,
    readPermission: () => current.check,
    readResolution: () => resolution,
  })
  const base = {
    principal: world.principal,
    tenant: world.tenant,
    execution: 'e',
    passage: 'p',
    action: 'a',
    advance: {},
    permissions: [],
    decision: null,
  }
  const direct = echoCall(world, {})
  const carried = toolsCall(world, { name: 'ToyEcho', command: 'info', arguments: {} })
  const adoption = (name: 'Tools' | 'ToyEcho') => {
    const availability = world.request(name).availability
    if (availability.kind !== 'available') throw new Error(`${name} unavailable`)
    return availability.definition.adoption
  }
  const shape = (answer: Awaited<ReturnType<typeof admission.admit>>) =>
    'failure' in answer
      ? answer
      : { kind: answer.ok.kind, reason: 'reason' in answer.ok ? answer.ok.reason : undefined }
  const directly = await admission.admit({
    ...base,
    original: { name: 'ToyEcho', arguments: direct },
    effectiveArguments: direct,
    definition: adoption('ToyEcho'),
  } as never)
  const viaTools = await admission.admit({
    ...base,
    original: { name: 'Tools', arguments: carried },
    effectiveArguments: carried,
    definition: adoption('Tools'),
  } as never)
  return { direct: shape(directly), viaTools: shape(viaTools), seen: current.seen }
}

describe('one action judged the same whether called directly or through Tools', () => {
  it('in each of the nine cells of tier and mode, with Tools itself asking', async () => {
    const world = await forwardWorld()
    try {
      for (const tier of TIERS)
        for (const mode of MODES) {
          const answer = await both(world, { ToyEcho: tier, Tools: 'decision-required' }, mode)
          expect(answer.viaTools, `${tier} × ${mode}`).toEqual(answer.direct)
        }
    } finally {
      await world.close()
    }
  })

  it('judges the target before the call is made, and the carrier only for a prohibition', async () => {
    const world = await forwardWorld()
    try {
      const answer = await both(
        world,
        { ToyEcho: 'decision-required', Tools: 'decision-required' },
        'never',
      )
      const [carrier, target] = answer.seen.slice(-2)
      expect(carrier).toMatchObject({ carrier: true, definition: { name: 'Tools' } })
      expect(target).toMatchObject({
        definition: { name: 'ToyEcho' },
        origin: { kind: 'agent-action', carrier: { definition: { name: 'Tools' } } },
      })
      expect(target).not.toHaveProperty('carrier')
      expect(answer.viaTools).toEqual({ kind: 'deny', reason: 'inquiry-policy' })
    } finally {
      await world.close()
    }
  })

  it('a prohibited Tools refuses through it, while the direct call is not affected', async () => {
    const world = await forwardWorld()
    try {
      const answer = await both(
        world,
        { ToyEcho: 'allowed', Tools: 'prohibited' },
        'bypass-permissions',
      )
      expect(answer.direct).toEqual({ kind: 'allow', reason: undefined })
      expect(answer.viaTools).toEqual({ kind: 'deny', reason: 'permission-policy' })
    } finally {
      await world.close()
    }
  })
})

describe('when the action the call performs cannot be resolved', () => {
  async function admitThrough(resolution: (() => ToolActionResolution<unknown>) | undefined) {
    const world = await forwardWorld()
    try {
      const current = permission({ Tools: 'decision-required' }, 'never')
      const admission = createActionAdmission({
        actionRules: rules,
        readAdmission: () => allowing,
        readPermission: () => current.check,
        readResolution: resolution ?? (() => undefined),
      })
      const tools = world.request('Tools').availability
      if (tools.kind !== 'available') throw new Error('Tools unavailable')
      const call = toolsCall(world, { name: 'Missing', arguments: {} })
      const answer = await admission.admit({
        principal: world.principal,
        tenant: world.tenant,
        execution: 'e',
        passage: 'p',
        action: 'a',
        advance: {},
        original: { name: 'Tools', arguments: call },
        effectiveArguments: call,
        definition: tools.definition.adoption,
        permissions: [],
        decision: null,
      } as never)
      return { answer, seen: current.seen }
    } finally {
      await world.close()
    }
  }
  type Failure = Extract<
    Awaited<ReturnType<ToolActionResolution<unknown>['resolve']>>,
    { failure: unknown }
  >['failure']
  const answering = (failure: Failure) => (): ToolActionResolution<unknown> => ({
    resolve: async () => ({ failure }),
  })

  it('answers unavailable and asks no permission when no resolution is installed', async () => {
    const { answer, seen } = await admitThrough(undefined)
    expect(answer).toMatchObject({ ok: { kind: 'unavailable' } })
    expect(seen).toEqual([])
  })

  it('answers unavailable when the resolution cannot answer now', async () => {
    const { answer, seen } = await admitThrough(
      answering({ kind: 'unavailable', dependency: 'tool-action', diagnostic: 'down' }),
    )
    expect(answer).toMatchObject({ ok: { kind: 'unavailable' } })
    expect(seen).toEqual([])
  })

  it('judges only the carrier when the call names no valid target, so Tools answers the error', async () => {
    const { answer, seen } = await admitThrough(
      answering({ kind: 'invalid', field: 'name', reason: 'unknown-target' }),
    )
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ carrier: true, definition: { name: 'Tools' } })
    expect(answer).toMatchObject({ ok: { kind: 'allow' } })
  })
})

describe('one judging pass over a batch reads the session once', () => {
  it.each([1, 3, 8])('a batch of %i actions reads the inquiry policy once per pass', async size => {
    const world = await forwardWorld()
    try {
      let reads = 0
      const inquiry = inquiryOncePerPass(async () => {
        reads += 1
        return null
      })
      const check: ToolPermissionCheck = {
        async check(input) {
          await inquiry(input)
          return { kind: 'allow', evidence, condition: null }
        },
      }
      const admission = createActionAdmission({
        actionRules: rules,
        readAdmission: () => allowing,
        readPermission: () => check,
        readResolution: () =>
          createToolActionResolution({
            release: () => world.release,
            catalog: () => world.catalog,
            view: () => world.view,
          }),
      })
      const echo = world.request('ToyEcho').availability
      if (echo.kind !== 'available') throw new Error('ToyEcho unavailable')
      const judge = (index: number, pass: string) => {
        const call = echoCall(world, { note: String(index) })
        return admission.admit({
          principal: world.principal,
          tenant: world.tenant,
          execution: 'e',
          passage: `p${String(index)}`,
          action: `a${String(index)}`,
          advance: {},
          original: { name: 'ToyEcho', arguments: call },
          effectiveArguments: call,
          definition: echo.definition.adoption,
          permissions: [],
          decision: null,
          batch: { id: 'batch-1', pass },
        } as never)
      }
      for (let index = 0; index < size; index += 1)
        expect(await judge(index, 'first')).toMatchObject({ ok: { kind: 'allow' } })
      expect(reads).toBe(1)
      await judge(0, 'second')
      expect(reads).toBe(2)
    } finally {
      await world.close()
    }
  })
})
