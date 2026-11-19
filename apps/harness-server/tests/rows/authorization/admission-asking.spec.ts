import { describe, expect, it } from 'vitest'
import { canonicalText, decisionEvidence, type AdmissionCheck } from '@omne-harness/authorization'
import { writeJsonText } from '@omne-harness/json-text'
import {
  createToolActionResolution,
  createToolCallLabeling,
} from '../../../src/entry/tool-action-resolution.ts'
import { createActionAdmission } from '../../../src/rows/authorization/action-admission.ts'
import type {
  ToolPermissionAction,
  ToolPermissionCheck,
  ToolPermissionDecision,
} from '../../../src/rows/authorization/current-tool-permission.ts'
import type { TenantPicks } from '../../../src/rows/authorization/tenant-picks.ts'
import { echoCall, toolsCall } from '../../entry/tool-call-support.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'

const evidence = decisionEvidence('admission-asking-test', '1', {})
const gate = { capabilityId: 'tool.ToyEcho', enforcementKey: 'tool.invoke', basis: 'verdict-7' }
const rules = (...tools: string[]) => ({
  revision: 'r1',
  rules: tools.map(tool => ({ id: tool.toLowerCase(), effect: 'allow', tool })),
})
const card = { owner: 'cards', record: 'card-1', revision: '1', digest: 'c' }
const said = { owner: 'cards', record: 'answer-1', revision: '1', digest: 'a' }
const chose = (option: string) => ({
  card,
  answer: { kind: 'chosen', option, value: null, evidence: said },
})

type Setup = Readonly<{
  rules?: unknown
  decide?: (action: ToolPermissionAction) => ToolPermissionDecision
  picks?: TenantPicks | null
  writer?: true
}>

async function world(setup: Setup = {}) {
  const forward = await forwardWorld()
  const judged: ToolPermissionAction[] = []
  const identities: unknown[] = []
  const previews: unknown[] = []
  const allowing = {
    check: async (input: unknown) => {
      identities.push(input)
      return { kind: 'allowed', evidence }
    },
  } as unknown as AdmissionCheck
  const check: ToolPermissionCheck = {
    check: async input => {
      judged.push(input)
      return (
        setup.decide?.(input) ??
        (input.definition.name === 'ToyEcho'
          ? { kind: 'ask', evidence, gate }
          : { kind: 'allow', evidence, condition: null })
      )
    },
  }
  const picks: TenantPicks = setup.picks ?? {
    writable: async asked => {
      previews.push(asked)
      return { allow: true, deny: false }
    },
    write: async () => 'written',
  }
  const forwarding = {
    release: () => forward.release,
    catalog: () => forward.catalog,
    view: () => forward.view,
  }
  const admission = createActionAdmission({
    actionRules: setup.rules ?? rules('Tools', 'ToyEcho'),
    readAdmission: () => allowing,
    readPermission: () => check,
    readResolution: () => createToolActionResolution(forwarding),
    readLabeling: () => createToolCallLabeling(forwarding),
    ...(setup.picks === null ? {} : { readPicks: () => picks }),
    ...(setup.writer
      ? { readAuthorizations: () => ({ express: async () => 'written' as const }) }
      : {}),
  })
  const adoption = (name: 'Tools' | 'ToyEcho') => {
    const availability = forward.request(name).availability
    if (availability.kind !== 'available') throw new Error(`${name} unavailable`)
    return availability.definition.adoption
  }
  const admit = async (
    name: 'Tools' | 'ToyEcho',
    args: string,
    more: Readonly<Record<string, unknown>> = {},
  ) => {
    const answer = await admission.admit({
      principal: forward.principal,
      tenant: forward.tenant,
      execution: 'e',
      passage: 'p',
      action: 'a',
      advance: {},
      permissions: [],
      decision: null,
      original: { name, arguments: args },
      effectiveArguments: args,
      definition: adoption(name),
      ...more,
    } as never)
    if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
    return answer.ok
  }
  return { forward, judged, identities, previews, admit, adoption }
}

const offeredOf = (decision: Awaited<ReturnType<Awaited<ReturnType<typeof world>>['admit']>>) => {
  if (decision.kind !== 'need-decision') throw new Error(JSON.stringify(decision))
  const detail = JSON.parse(writeJsonText(decision.card.detail!)) as {
    gate?: unknown
    options: { id: string; offered: boolean }[]
  }
  return {
    gate: detail.gate,
    offered: Object.fromEntries(detail.options.map(option => [option.id, option.offered])),
  }
}

describe('an action whose gate asks', () => {
  it('gets a card that names the gate and offers the lasting options the tenant setting can take', async () => {
    const w = await world()
    const decision = await w.admit('ToyEcho', echoCall(w.forward, {}))
    expect(decision).toMatchObject({ kind: 'need-decision', evidence })
    expect(offeredOf(decision)).toEqual({
      gate,
      offered: {
        'deny-once': true,
        'allow-once': true,
        'allow-session': true,
        'allow-always': true,
        'deny-always': false,
      },
    })
    expect(w.previews).toEqual([
      {
        principal: w.forward.principal,
        tenant: w.forward.tenant,
        definition: w.adoption('ToyEcho'),
        gate: { id: 'read', title: '查看', default: 'auto' },
      },
    ])
  })

  it('previews the target a call carries through Tools, not the carrier', async () => {
    const w = await world()
    const carried = toolsCall(w.forward, { name: 'ToyEcho', command: 'info', arguments: {} })
    expect(offeredOf(await w.admit('Tools', carried)).gate).toEqual(gate)
    expect(w.previews).toMatchObject([{ definition: w.adoption('ToyEcho') }])
  })

  it('offers no lasting option in a deployment that installs no tenant settings for it', async () => {
    const w = await world({ picks: null })
    expect(offeredOf(await w.admit('ToyEcho', echoCall(w.forward, {}))).offered).toMatchObject({
      'allow-session': true,
      'allow-always': false,
      'deny-always': false,
    })
  })

  it('waits when the tenant setting of the gate cannot be read now', async () => {
    const w = await world({
      picks: { writable: async () => 'unavailable', write: async () => 'written' },
    })
    expect(await w.admit('ToyEcho', echoCall(w.forward, {}))).toEqual({
      kind: 'unavailable',
      diagnostic: 'the tenant setting of the gate could not be read now',
    })
  })

  it('gets a card without a gate when the permission names none', async () => {
    const w = await world({ decide: () => ({ kind: 'ask', evidence }) })
    expect(offeredOf(await w.admit('ToyEcho', echoCall(w.forward, {}))).gate).toBeUndefined()
  })
})

describe('what admission asks the current permission', () => {
  it('names the judging pass of a batch, and none for an action that comes with an answer', async () => {
    const w = await world({
      writer: true,
      decide: () => ({ kind: 'allow', evidence, condition: null }),
    })
    const args = echoCall(w.forward, {})
    const batch = { id: 'batch-1', pass: 'pass-1' }
    await w.admit('ToyEcho', args, { batch })
    await w.admit('ToyEcho', args)
    await w.admit('ToyEcho', args, { batch, decision: chose('allow-once') })
    const passes = w.judged.map(action =>
      action.origin.kind === 'agent-action' ? action.origin.pass : 'tool',
    )
    expect(passes).toEqual([canonicalText(['batch-1', 'pass-1']), undefined, undefined])
  })

  it('judges a carried call as the carrier and then as its target, which names the call that carries it', async () => {
    const w = await world({ decide: () => ({ kind: 'allow', evidence, condition: null }) })
    const carried = toolsCall(w.forward, { name: 'ToyEcho', command: 'info', arguments: {} })
    expect(await w.admit('Tools', carried)).toMatchObject({ kind: 'allow' })
    expect(w.judged.map(action => [action.definition.name, action.carrier ?? false])).toEqual([
      ['Tools', true],
      ['ToyEcho', false],
    ])
    const [carrier, target] = w.judged.map(action =>
      action.origin.kind === 'agent-action' ? action.origin.carrier : null,
    )
    expect(carrier).toBeUndefined()
    expect(target).toEqual({ definition: w.adoption('Tools'), effectiveArguments: carried })
    const own = await world({ decide: () => ({ kind: 'allow', evidence, condition: null }) })
    await own.admit('ToyEcho', echoCall(own.forward, {}))
    expect(own.judged[0]?.origin).not.toHaveProperty('carrier')
  })

  it('lets a carrier no action rule names go on to its permission, and does not decide a target no rule names', async () => {
    const carrierOnly = await world({
      rules: rules('ToyEcho'),
      decide: () => ({ kind: 'allow', evidence, condition: null }),
    })
    const carried = toolsCall(carrierOnly.forward, {
      name: 'ToyEcho',
      command: 'info',
      arguments: {},
    })
    const unruled = await carrierOnly.admit('Tools', carried)
    expect(unruled).toMatchObject({ kind: 'allow' })
    const ruled = await world({ decide: () => ({ kind: 'allow', evidence, condition: null }) })
    const both = await ruled.admit('Tools', carried)
    if (unruled.kind !== 'allow' || both.kind !== 'allow') throw new Error('kind')
    expect(unruled.evidence.digest).toBe(both.evidence.digest)
    const targetOnly = await world({ rules: rules('Tools') })
    expect(await targetOnly.admit('Tools', carried)).toMatchObject({ kind: 'undecidable' })
    expect(targetOnly.judged.map(action => action.definition.name)).toEqual(['Tools'])
  })

  it('asks nothing more once the carrier is refused', async () => {
    const w = await world({
      decide: action =>
        action.carrier === true
          ? { kind: 'deny', category: 'rule', reason: 'permission-policy', evidence }
          : { kind: 'allow', evidence, condition: null },
    })
    const carried = toolsCall(w.forward, { name: 'ToyEcho', command: 'info', arguments: {} })
    expect(await w.admit('Tools', carried)).toMatchObject({
      kind: 'deny',
      reason: 'permission-policy',
    })
    expect(w.judged).toHaveLength(1)
  })
})

describe('an action that comes with an answer', () => {
  it('is refused by an answer that releases nothing, before anything is read', async () => {
    const w = await world()
    expect(
      await w.admit('ToyEcho', echoCall(w.forward, {}), { decision: chose('deny-once') }),
    ).toMatchObject({ kind: 'deny', category: 'not-released', reason: 'deny-once' })
    expect(w.identities).toEqual([])
    expect(w.judged).toEqual([])
  })

  it('waits when no writer of authorizations is installed', async () => {
    const w = await world()
    expect(
      await w.admit('ToyEcho', echoCall(w.forward, {}), { decision: chose('allow-once') }),
    ).toEqual({
      kind: 'unavailable',
      diagnostic: 'the session authorization writer is unavailable',
    })
    expect(w.judged).toEqual([])
  })
})
