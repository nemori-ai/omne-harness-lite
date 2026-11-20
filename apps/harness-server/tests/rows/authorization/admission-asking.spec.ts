import { describe, expect, it } from 'vitest'
import {
  canonicalText,
  decisionEvidence,
  effectiveArgumentsOf,
  type AdmissionCheck,
} from '@omne-harness/authorization'
import { writeJsonText } from '@omne-harness/json-text'
import {
  createToolActionResolution,
  createToolCallLabeling,
} from '../../../src/entry/tool-action-resolution.ts'
import { createActionAdmission } from '../../../src/rows/authorization/action-admission.ts'
import { actionRulesSchema } from '../../../src/rows/authorization/action-rules.ts'
import type {
  ToolPermissionAction,
  ToolPermissionCheck,
  ToolPermissionDecision,
} from '../../../src/rows/authorization/current-tool-permission.ts'
import type { TenantPicks } from '../../../src/rows/authorization/tenant-picks.ts'
import type { ToolReleaseDetails } from '@omne-harness/tool-contract'
import { echoCall, toolsCall } from '../../entry/tool-call-support.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'
import { VERDICT_RELEASE } from '../../support/permission-release.ts'

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
  details?: ToolReleaseDetails<unknown>
  express?: (input: unknown) => Promise<'written'>
  resolved?: (input: unknown) => void
  ungated?: true
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
          : { kind: 'allow', evidence, condition: null, release: VERDICT_RELEASE })
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
  const resolution = createToolActionResolution(forwarding)
  const admission = createActionAdmission({
    actionRules: setup.rules ?? rules('Tools', 'ToyEcho'),
    readAdmission: () => allowing,
    readPermission: () => check,
    readResolution: () => ({
      resolve: async input => {
        setup.resolved?.(input)
        const answer = await resolution.resolve(input)
        return setup.ungated && 'ok' in answer && answer.ok.kind === 'own'
          ? { ok: { ...answer.ok, gate: { kind: 'ungated' } } }
          : answer
      },
    }),
    readLabeling: () =>
      createToolCallLabeling({
        ...forwarding,
        ...(setup.details === undefined ? {} : { details: () => setup.details }),
      }),
    ...(setup.picks === null ? {} : { readPicks: () => picks }),
    ...(setup.writer
      ? {
          readAuthorizations: () => ({
            express: setup.express ?? (async () => 'written' as const),
          }),
        }
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

describe('the detail on the card of an asked action', () => {
  type Asked = Readonly<{
    effectiveArguments: string
    availability: { definition: { name: string } }
  }>
  const rows = [{ label: '命令', value: 'info' }] as const
  const recording = () => {
    const asked: Asked[] = []
    const details: ToolReleaseDetails<unknown> = {
      describe: async input => {
        asked.push(input as unknown as Asked)
        return { kind: 'detail', rows }
      },
    }
    return { asked, details }
  }
  const allow = { kind: 'allow', evidence, condition: null, release: VERDICT_RELEASE } as const
  const ask = { kind: 'ask', evidence, gate } as const
  const detailOf = (decision: Awaited<ReturnType<Awaited<ReturnType<typeof world>>['admit']>>) => {
    if (decision.kind !== 'need-decision') throw new Error(JSON.stringify(decision))
    return (JSON.parse(writeJsonText(decision.card.detail!)) as { detail?: unknown }).detail
  }

  it('is asked of the tool only when the gate asks', async () => {
    const r = recording()
    const allowed = await world({ details: r.details, decide: () => allow })
    expect((await allowed.admit('ToyEcho', echoCall(allowed.forward, {}))).kind).toBe('allow')
    expect(r.asked).toEqual([])
    const w = await world({ details: r.details })
    expect(detailOf(await w.admit('ToyEcho', echoCall(w.forward, {})))).toEqual({
      state: 'given',
      rows,
    })
    expect(r.asked).toHaveLength(1)
  })

  it('reads the permission and the detail of an ungated call not at all', async () => {
    const r = recording()
    const w = await world({ details: r.details, ungated: true })
    const allowed = await w.admit('ToyEcho', echoCall(w.forward, {}))
    expect(allowed).toMatchObject({
      kind: 'allow',
      evidence: { owner: 'authorization', record: 'action-ungated' },
    })
    // The evidence names the rule it rests on, not an empty record.
    expect(allowed).not.toMatchObject({
      evidence: { digest: decisionEvidence('action-ungated', '0', {}).digest },
    })
    expect(w.judged).toEqual([])
    expect(r.asked).toEqual([])
  })

  it('asks the tool for a detail once for each action of a batch that asks, and never for a batch released at once', async () => {
    const r = recording()
    const verdicts = [ask, allow, ask]
    const w = await world({ details: r.details, decide: () => verdicts.shift() ?? allow })
    const batch = { id: 'batch-1', pass: 'pass-1' }
    for (const action of ['a1', 'a2', 'a3'])
      await w.admit('ToyEcho', echoCall(w.forward, {}), { batch, action })
    expect(r.asked).toHaveLength(2)
    const released = recording()
    const all = await world({ details: released.details, decide: () => allow })
    for (const action of ['a1', 'a2', 'a3'])
      await all.admit('ToyEcho', echoCall(all.forward, {}), { batch, action })
    expect(released.asked).toEqual([])
    expect(all.judged).toHaveLength(3)
  })

  it.each([
    ['a call of the tool itself', 'ToyEcho'],
    ['a call carried through Tools', 'Tools'],
  ] as const)(
    'is asked once, and resolution, the detail and the one-time release read the same arguments, for %s',
    async (_what, name) => {
      const r = recording()
      const resolved: string[] = []
      const expressed: Readonly<{ expression: { scope: { argumentsDigest: string } } }>[] = []
      let granted = false
      const w = await world({
        details: r.details,
        writer: true,
        resolved: input =>
          resolved.push((input as { effectiveArguments: string }).effectiveArguments),
        express: async input => {
          expressed.push(input as never)
          granted = true
          return 'written'
        },
        decide: action => (granted || action.definition.name !== 'ToyEcho' ? allow : ask),
      })
      const args =
        name === 'ToyEcho'
          ? echoCall(w.forward, {})
          : toolsCall(w.forward, { name: 'ToyEcho', command: 'info', arguments: {} })
      expect((await w.admit(name, args)).kind).toBe('need-decision')
      expect((await w.admit(name, args, { decision: chose('allow-once') })).kind).toBe('allow')
      expect(r.asked).toHaveLength(1)
      expect(r.asked[0]!.availability.definition.name).toBe('ToyEcho')
      const digest = (text: string) => effectiveArgumentsOf(text).digest
      const acted = digest(r.asked[0]!.effectiveArguments)
      expect(expressed.map(entry => entry.expression.scope.argumentsDigest)).toEqual([acted])
      if (name === 'ToyEcho') expect(resolved.map(digest)).toEqual([acted, acted])
      else expect(resolved).toEqual([args, args])
    },
  )
})

describe('what admission asks the current permission', () => {
  it('names the judging pass of a batch, and none for an action that comes with an answer', async () => {
    const w = await world({
      writer: true,
      decide: () => ({ kind: 'allow', evidence, condition: null, release: VERDICT_RELEASE }),
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
    const w = await world({
      decide: () => ({ kind: 'allow', evidence, condition: null, release: VERDICT_RELEASE }),
    })
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
    const own = await world({
      decide: () => ({ kind: 'allow', evidence, condition: null, release: VERDICT_RELEASE }),
    })
    await own.admit('ToyEcho', echoCall(own.forward, {}))
    expect(own.judged[0]?.origin).not.toHaveProperty('carrier')
  })

  it('lets a carrier no action rule names go on to its permission, and does not decide a target no rule names', async () => {
    const carrierOnly = await world({
      rules: rules('ToyEcho'),
      decide: () => ({ kind: 'allow', evidence, condition: null, release: VERDICT_RELEASE }),
    })
    const carried = toolsCall(carrierOnly.forward, {
      name: 'ToyEcho',
      command: 'info',
      arguments: {},
    })
    const unruled = await carrierOnly.admit('Tools', carried)
    expect(unruled).toMatchObject({ kind: 'allow' })
    const ruled = await world({
      decide: () => ({ kind: 'allow', evidence, condition: null, release: VERDICT_RELEASE }),
    })
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
          : { kind: 'allow', evidence, condition: null, release: VERDICT_RELEASE },
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

  const unsaved: TenantPicks = {
    writable: async () => ({ allow: true, deny: true }),
    write: async () => 'not-writable',
  }

  it('says on the allow that always allow was not saved, when judging again allows this call', async () => {
    const w = await world({
      picks: unsaved,
      writer: true,
      decide: () => ({ kind: 'allow', evidence, condition: null, release: VERDICT_RELEASE }),
    })
    const answer = await w.admit('ToyEcho', echoCall(w.forward, {}), {
      decision: chose('allow-always'),
    })
    expect(answer).toMatchObject({
      kind: 'allow',
      notice: expect.stringContaining('could not be saved. This call was allowed'),
    })
  })

  it('puts that notice on no answer other than an allow', async () => {
    const w = await world({ picks: unsaved, writer: true })
    const answer = await w.admit('ToyEcho', echoCall(w.forward, {}), {
      decision: chose('allow-always'),
    })
    expect(answer.kind).toBe('need-decision')
    expect(answer).not.toHaveProperty('notice')
  })
})

describe('the evidence and the refusal of a judged action', () => {
  const allowing = () => ({
    kind: 'allow' as const,
    evidence,
    condition: null,
    release: VERDICT_RELEASE,
  })
  const target = { owner: 'agent', kind: 'action', key: canonicalText(['e', 'p', 'a']) }
  const released = canonicalText({ decision: 'action-current-permission', ...VERDICT_RELEASE })
  const ruleEvidence = (rulesGiven: ReturnType<typeof rules>, id: string, args: string) => {
    const rule = actionRulesSchema.parse(rulesGiven).rules.find(item => item.id === id)
    return decisionEvidence(`action-rule/${id}`, 'r1', {
      rule,
      target,
      arguments: effectiveArgumentsOf(args),
      identity: evidence,
    })
  }

  it('gives the rule of the gate it stood on, and the permission of the gate, as the evidence of an allow', async () => {
    const w = await world({ decide: allowing })
    const args = echoCall(w.forward, {})
    expect(await w.admit('ToyEcho', args)).toEqual({
      kind: 'allow',
      evidence: decisionEvidence(released, 'r1', {
        rule: ruleEvidence(rules('Tools', 'ToyEcho'), 'toyecho', args),
        permission: evidence,
        release: VERDICT_RELEASE,
      }),
    })
  })

  it('gives no rule as the evidence of a carrier that no rule names, and judges it alone', async () => {
    const w = await world({ rules: rules('ToyEcho'), decide: allowing })
    const missing = toolsCall(w.forward, { name: 'NoSuchTool', command: null, arguments: {} })
    expect(await w.admit('Tools', missing)).toEqual({
      kind: 'allow',
      evidence: decisionEvidence(released, 'r1', {
        rule: null,
        permission: evidence,
        release: VERDICT_RELEASE,
      }),
    })
    expect(w.judged.map(action => [action.definition.name, action.carrier])).toEqual([
      ['Tools', true],
    ])
  })

  it('refuses a carrier its action rule prohibits, by that rule, and judges no permission', async () => {
    const given = {
      revision: 'r1',
      rules: [
        { id: 'no-tools', effect: 'deny', tool: 'Tools' },
        { id: 'toyecho', effect: 'allow', tool: 'ToyEcho' },
      ],
    }
    const w = await world({ rules: given, decide: allowing })
    const carried = toolsCall(w.forward, { name: 'ToyEcho', command: 'info', arguments: {} })
    expect(await w.admit('Tools', carried)).toEqual({
      kind: 'deny',
      category: 'rule',
      reason: 'rule/no-tools',
      evidence: ruleEvidence(given as never, 'no-tools', carried),
    })
    expect(w.judged).toEqual([])
  })

  it.each([
    ['declined', { kind: 'declined', evidence: said }, 'not-released', 'declined'],
    [
      'deny-once',
      { kind: 'chosen', option: 'deny-once', value: null, evidence: said },
      'not-released',
      'deny-once',
    ],
    ['words', { kind: 'remark', text: 'not now', evidence: said }, 'guidance', 'human-guidance'],
  ] as const)(
    'refuses on %s, with the card and the answer it came from as the evidence',
    async (_what, answer, category, reason) => {
      const w = await world()
      expect(
        await w.admit('ToyEcho', echoCall(w.forward, {}), { decision: { card, answer } }),
      ).toEqual({
        kind: 'deny',
        category,
        reason,
        evidence: decisionEvidence('action-answer', '1', { card, answer: said, reason }),
      })
    },
  )
})
