import { describe, expect, it } from 'vitest'
import { decisionEvidence } from '@omne-harness/authorization'
import { writeJsonText } from '@omne-harness/json-text'
import { answeredDecision, askedDecision } from '../../../src/rows/authorization/release-asking.ts'

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
    expect(answeredDecision({ card, answer })).toMatchObject({ kind: 'deny', category, reason })
  })

  it('cannot read an option the card did not offer as a release', () => {
    const answer = { kind: 'chosen', option: 'allow-once', value: null, evidence: said } as const
    expect(answeredDecision({ card, answer })).toMatchObject({ kind: 'undecidable' })
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
      ['allow-once', false],
      ['allow-session', false],
      ['allow-always', false],
      ['deny-always', false],
    ])
    expect(decision.evidence).toBe(evidence)
  })

  it('waits when no labeling is installed or the label cannot be read now', async () => {
    expect(await askedDecision(undefined, asking)).toMatchObject({ kind: 'unavailable' })
    expect(await askedDecision({ label: async () => undefined }, asking)).toMatchObject({
      kind: 'unavailable',
    })
  })
})
