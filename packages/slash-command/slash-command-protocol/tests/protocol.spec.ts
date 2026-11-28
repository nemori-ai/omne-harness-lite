import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import type { Codec } from '@omne-harness/public-contract'
import { slashCommandProtocol } from '@omne-harness/slash-command-protocol'
import { describe, expect, it } from 'vitest'

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const tenant = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})
const session = '0123456789abcdef'.repeat(4)
const read = slashCommandProtocol.operations['read-catalog']
const observe = slashCommandProtocol.observations['observe-catalog']

function accepted(codec: Codec<any>, sample: unknown): boolean {
  const tree = readJsonText(JSON.stringify(sample), limits)
  if (tree.kind !== 'ok') throw new Error('sample is not JSON')
  return codec.read(tree.value, limits).ok
}
function roundTrip(codec: Codec<any>, sample: unknown): unknown {
  const tree = readJsonText(JSON.stringify(sample), limits)
  if (tree.kind !== 'ok') throw new Error('sample is not JSON')
  const decoded = codec.read(tree.value, limits)
  if (!decoded.ok) throw new Error('sample not accepted')
  const written = codec.write(decoded.value, limits)
  if (!written.ok) throw new Error('not written')
  return JSON.parse(writeJsonText(written.value))
}

describe('slash-command/1', () => {
  it('reads one session catalogue with a login, and is a read', () => {
    expect([
      slashCommandProtocol.name,
      slashCommandProtocol.major,
      read.identity,
      read.effect,
    ]).toEqual(['slash-command', 1, 'login', 'read'])
    expect(roundTrip(read.body, { tenant, session })).toEqual({ tenant, session })
  })

  it('carries the public half of each entry and the sources it could not ask, both ways', () => {
    const body = {
      entries: [
        { full: 'skill:review', space: 'skill', name: 'review', kind: 'reference', title: '评审' },
        {
          full: 'omne-official:model',
          space: 'omne-official',
          name: 'model',
          kind: 'system',
          title: '换模型',
          hint: '<模型名>',
          whileRunning: 'now',
          takesEffect: 'next-request',
        },
        {
          full: 'skill:old',
          space: 'skill',
          name: 'old',
          kind: 'reference',
          title: '旧',
          unavailable: '停用了',
        },
      ],
      missing: ['prompt'],
    }
    expect(roundTrip(read.outcomes.succeeded, body)).toEqual(body)
  })

  it('refuses an entry that carries anything beyond its public half, or a kind it does not know', () => {
    const base = { full: 'skill:a', space: 'skill', name: 'a', kind: 'reference', title: 'a' }
    expect(accepted(read.outcomes.succeeded, { entries: [base], missing: [] })).toBe(true)
    expect(
      accepted(read.outcomes.succeeded, { entries: [{ ...base, flow: 'archive' }], missing: [] }),
    ).toBe(false)
    expect(
      accepted(read.outcomes.succeeded, { entries: [{ ...base, kind: 'control' }], missing: [] }),
    ).toBe(false)
  })

  it('opens the observation on one session, and every frame only says it may have changed', () => {
    expect(observe.identity).toBe('login')
    expect(roundTrip(observe.open, { tenant, session })).toEqual({ tenant, session })
    expect(roundTrip(observe.frame, { kind: 'changed' })).toEqual({ kind: 'changed' })
    expect(accepted(observe.frame, { kind: 'changed', entries: [] })).toBe(false)
  })
})
