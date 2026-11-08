import { describe, expect, it } from 'vitest'
import { readBodyText } from '@omne-harness/assets'
import { agentBodyContract, judgeAgentDefinition } from '@omne-harness/agent-contract'

const base = { name: 'bounded-agent', references: [], attributes: [] }
const bound = { capabilityId: 'Shell', enforcementKey: 'tool.invoke', allowedSet: ['ask'] }
const limits = {
  maxBytes: 100_000,
  maxDepth: 20,
  maxItems: 1000,
  maxMembers: 80,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}

function bodyJudgment(extra: object) {
  const body = readBodyText(JSON.stringify({ ...base, ...extra }), limits)
  if (body.kind !== 'ok') throw new Error(`Invalid test body: ${body.kind}`)
  return agentBodyContract().judge(body.value)
}

const invalid = [
  { label: 'empty declaration', permissionBounds: [] },
  { label: 'null declaration', permissionBounds: null },
  { label: 'duplicate enforcement key', permissionBounds: [bound, { ...bound, allowedSet: [] }] },
  {
    label: 'duplicate allowed value',
    permissionBounds: [{ ...bound, allowedSet: ['ask', 'ask'] }],
  },
  {
    label: 'missing bound',
    permissionBounds: [{ capabilityId: 'Shell', enforcementKey: 'tool.invoke' }],
  },
  { label: 'null allowed set', permissionBounds: [{ ...bound, allowedSet: null }] },
  { label: 'invalid value identifier', permissionBounds: [{ ...bound, allowedSet: [' '] }] },
  { label: 'unknown member', permissionBounds: [{ ...bound, pick: 'auto' }] },
]

describe('definition permission upper bounds', () => {
  it.each(invalid)('rejects $label in both public entries', async ({ permissionBounds }) => {
    const extra = { permissionBounds }
    expect(bodyJudgment(extra)).toEqual({ ok: false, rejected: 'invalid-permission-bounds' })
    expect(
      await judgeAgentDefinition({ category: 'AgentDefinition', ...base, ...extra }),
    ).toMatchObject({ kind: 'refused', reason: 'malformed' })
  })

  it('keeps an absent bound absent and an explicit empty allowed set prohibitive', async () => {
    const absent = await judgeAgentDefinition({ category: 'AgentDefinition', ...base })
    expect(absent.kind).toBe('accepted')
    if (absent.kind !== 'accepted') throw new Error('Expected valid definition')
    expect(absent.value).not.toHaveProperty('permissionBounds')
    const extra = { permissionBounds: [{ ...bound, allowedSet: [] }] }
    expect(bodyJudgment(extra)).toEqual({ ok: true })
    const denied = await judgeAgentDefinition({ category: 'AgentDefinition', ...base, ...extra })
    expect(denied).toMatchObject({ kind: 'accepted', value: extra })
  })

  it('detaches and freezes every level while preserving separate enforcement keys', async () => {
    const permissionBounds = [
      bound,
      { ...bound, enforcementKey: 'tool.install', allowedSet: ['never'] },
    ]
    const input = { category: 'AgentDefinition', ...base, permissionBounds }
    const result = await judgeAgentDefinition(input)
    if (result.kind !== 'accepted') throw new Error(`Expected accepted: ${result.reason}`)
    expect(bodyJudgment({ permissionBounds })).toEqual({ ok: true })
    const accepted = result.value.permissionBounds
    expect(accepted).toEqual(permissionBounds)
    expect(accepted).not.toBe(permissionBounds)
    expect(Object.isFrozen(accepted)).toBe(true)
    for (const [index, item] of (accepted ?? []).entries()) {
      expect(Object.isFrozen(item)).toBe(true)
      expect(Object.isFrozen(item.allowedSet)).toBe(true)
      expect(item).not.toBe(permissionBounds[index])
      expect(item.allowedSet).not.toBe(permissionBounds[index]?.allowedSet)
    }
    permissionBounds[0]?.allowedSet.push('auto')
    expect(accepted?.[0]?.allowedSet).toEqual(['ask'])
  })
})
