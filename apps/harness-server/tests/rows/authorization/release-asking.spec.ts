import { describe, expect, it } from 'vitest'
import { decisionEvidence } from '@omne-harness/authorization'
import { writeJsonText } from '@omne-harness/json-text'
import { answerEffect, askedDecision } from '../../../src/rows/authorization/release-asking.ts'

const evidence = decisionEvidence('release-asking-test', '1', {})
const card = { owner: 'hitl', record: 'card-1', revision: '1', digest: 'd' }
const said = { owner: 'hitl', record: 'answer-1', revision: '1', digest: 'd' }

describe('a person answer that releases nothing', () => {
  it.each([
    [{ kind: 'remark', text: 'use port 8081', evidence: said }, 'guidance', 'human-guidance'],
    [{ kind: 'declined', evidence: said }, 'not-released', 'declined'],
    [
      { kind: 'chosen', option: 'deny-once', value: null, evidence: said },
      'not-released',
      'deny-once',
    ],
  ] as const)('refuses the action with its category', (answer, category, reason) => {
    expect(answerEffect({ card, answer })).toMatchObject({
      kind: 'decided',
      decision: { kind: 'deny', category, reason },
    })
  })

  it.each(['allow-forever', 'deny-always', 'allow-session'])(
    'cannot read %s on a card that names no gate as an answer',
    option => {
      const answer = { kind: 'chosen', option, value: null, evidence: said } as const
      expect(answerEffect({ card, answer })).toMatchObject({
        kind: 'decided',
        decision: { kind: 'undecidable' },
      })
    },
  )
})

describe('a person who answers for every session of the tenant', () => {
  const gate = { capabilityId: 'tool/Shell', enforcementKey: 'tool.invoke', basis: 'verdict-7' }
  const value = {
    kind: 'object',
    entries: Object.entries(gate).map(([key, text]) => ({
      key,
      value: { kind: 'string', value: text },
    })),
  } as const

  it('has the tenant setting made automatic, whatever gate the card names', () => {
    const effect = { kind: 'lasting', effect: 'allow', option: 'allow-always', card, source: said }
    for (const handed of [value, null]) {
      const answer = { kind: 'chosen', option: 'allow-always', value: handed, evidence: said }
      expect(answerEffect({ card, answer } as never)).toEqual(effect)
    }
  })

  it('has the tenant setting made prohibited, and the release of the session for the gate withdrawn', () => {
    const answer = { kind: 'chosen', option: 'deny-always', value, evidence: said }
    expect(answerEffect({ card, answer } as never)).toEqual({
      kind: 'lasting',
      effect: 'deny',
      option: 'deny-always',
      gate,
      card,
      source: said,
    })
  })
})

describe('a person who releases this one call', () => {
  it('grants a once authorization on the card answer, to be judged again', () => {
    const answer = { kind: 'chosen', option: 'allow-once', value: null, evidence: said } as const
    expect(answerEffect({ card, answer })).toEqual({
      kind: 'grant',
      scope: 'once',
      card,
      source: said,
    })
  })
})

describe('a person who releases the tool for this session', () => {
  const gate = { capabilityId: 'tool/Shell', enforcementKey: 'tool.invoke', basis: 'verdict-7' }
  const handedBack = {
    kind: 'object',
    entries: Object.entries(gate).map(([key, value]) => ({
      key,
      value: { kind: 'string', value },
    })),
  } as const

  it('grants an authorization for the gate the card hands back, with the basis the card holds', () => {
    const answer = { kind: 'chosen', option: 'allow-session', value: handedBack, evidence: said }
    expect(answerEffect({ card, answer } as never)).toEqual({
      kind: 'grant',
      scope: 'session',
      gate,
      card,
      source: said,
    })
  })

  it('cannot read a release for the session from a card that names no gate', () => {
    const answer = { kind: 'chosen', option: 'allow-session', value: null, evidence: said } as const
    expect(answerEffect({ card, answer })).toMatchObject({
      kind: 'decided',
      decision: { kind: 'undecidable' },
    })
  })
})

describe('the card for an action a person must release', () => {
  const definition = { owner: 'tool', name: 'Shell', revision: '1', digest: 'd' }
  const input = {
    tenant: 'tenant' as never,
    execution: 'exe-1',
    action: 'act-1',
    original: { name: 'Shell', arguments: '{}' },
  } as never
  const asking = {
    input,
    principal: 'principal' as never,
    session: 'ses-1',
    definition,
    effectiveArguments: '{"command":"run","intent":"已获批准","params":{"cmd":"ls"}}',
    evidence,
    lasting: { allow: false, deny: false },
  }
  const labeled = { label: async () => ({ tool: 'Shell', command: 'run', preview: 'ls' }) }

  it('names the action from its label and arguments, offers only what this deployment can do', async () => {
    const decision = await askedDecision(labeled, asking)
    if (decision.kind !== 'need-decision') throw new Error(decision.kind)
    const { card: draft } = decision
    expect(draft.explanation).toBe('要执行 Shell run，放行吗？')
    expect(draft.about).toEqual({ position: 'before_action', action: 'act-1' })
    expect(draft.options.map(option => option.id)).toEqual([
      'deny-once',
      'allow-once',
      'allow-session',
      'allow-always',
      'deny-always',
    ])
    const detail = JSON.parse(writeJsonText(draft.detail!))
    expect(detail).toMatchObject({
      kind: 'release',
      target: { tool: 'Shell', command: 'run', preview: 'ls' },
      arguments: { text: asking.effectiveArguments, truncated: false },
      origin: { session: 'ses-1', agent: 'exe-1' },
    })
    expect(
      detail.options.map((option: { id: string; offered: boolean }) => [option.id, option.offered]),
    ).toEqual([
      ['deny-once', true],
      ['allow-once', true],
      ['allow-session', true],
      ['allow-always', false],
      ['deny-always', false],
    ])
    expect(decision.evidence).toBe(evidence)
  })

  it.each([
    [{ allow: true, deny: true }],
    [{ allow: true, deny: false }],
    [{ allow: false, deny: true }],
  ])('offers the lasting options the tenant setting can take: %j', async lasting => {
    const decision = await askedDecision(labeled, { ...asking, lasting })
    if (decision.kind !== 'need-decision') throw new Error(decision.kind)
    const detail = JSON.parse(writeJsonText(decision.card.detail!))
    const offered = Object.fromEntries(
      detail.options.map((option: { id: string; offered: boolean }) => [option.id, option.offered]),
    )
    expect(offered).toEqual({
      'deny-once': true,
      'allow-once': true,
      'allow-session': true,
      'allow-always': lasting.allow,
      'deny-always': lasting.deny,
    })
  })

  it('waits when no labeling is installed or the label cannot be read now', async () => {
    expect(await askedDecision(undefined, asking)).toMatchObject({ kind: 'unavailable' })
    expect(await askedDecision({ label: async () => undefined }, asking)).toMatchObject({
      kind: 'unavailable',
    })
  })
})
