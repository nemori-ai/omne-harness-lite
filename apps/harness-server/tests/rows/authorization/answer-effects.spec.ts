import { describe, expect, it } from 'vitest'
import {
  applyAnswer,
  type Answered,
  type AuthorizationWriter,
} from '../../../src/rows/authorization/answer-effects.ts'
import { onceTarget } from '../../../src/rows/authorization/authorization-facts.ts'
import type { AnswerEffect } from '../../../src/rows/authorization/release-asking.ts'
import type { TenantPicks } from '../../../src/rows/authorization/tenant-picks.ts'
import { effectiveArgumentsOf } from '@omne-harness/authorization'
import { IMPLICIT_TOOL_GATE } from '@omne-harness/tool-contract'

const card = { owner: 'human-intervention', record: 'card/1', revision: '1', digest: 'card' }
const source = { owner: 'human-intervention', record: 'reply/1', revision: '1', digest: 'said' }
const gate = { capabilityId: 'tool.Shell', enforcementKey: 'tool.invoke', basis: 'basis-1' }
const definition = { owner: 'tool', name: 'Shell', revision: '1', digest: 'd' }
const answered: Answered = {
  principal: 'principal' as never,
  tenant: 'tenant' as never,
  session: 'ses-1',
  consumer: { owner: '@omne-harness/agent', work: 'exe-1', position: 'act-1' },
  gate: { definition, effectiveArguments: '{"command":"run"}', gate: IMPLICIT_TOOL_GATE },
}
const once = {
  kind: 'once',
  consumer: answered.consumer,
  target: onceTarget(definition),
  argumentsDigest: effectiveArgumentsOf(answered.gate.effectiveArguments).digest,
}
type Writing = Exclude<AnswerEffect, { kind: 'decided' }>
const allowAlways: Writing = {
  kind: 'lasting',
  effect: 'allow',
  option: 'allow-always',
  card,
  source,
}
const denyAlways: Writing = {
  kind: 'lasting',
  effect: 'deny',
  option: 'deny-always',
  gate,
  card,
  source,
}

function world(
  written: Awaited<ReturnType<TenantPicks['write']>> = 'written',
  expressed: Awaited<ReturnType<AuthorizationWriter['express']>> = 'written',
) {
  const steps: unknown[] = []
  const picks: TenantPicks = {
    writable: async () => ({ allow: true, deny: true }),
    write: async input => {
      steps.push({ set: input.effect, option: input.option, card: input.card, said: input.source })
      return written
    },
  }
  const authorizations: AuthorizationWriter = {
    express: async input => {
      steps.push({ express: input.expression, session: input.session, card: input.card })
      return expressed
    },
  }
  return { steps, ports: { picks, authorizations } }
}

describe('the effect of an answer that grants for this once or for the session', () => {
  it('writes the grant for this very action, or for the gate with the basis of the card', async () => {
    const w = world()
    const said = { card, source }
    expect(await applyAnswer(answered, { kind: 'grant', scope: 'once', ...said }, w.ports)).toBe(
      null,
    )
    expect(
      await applyAnswer(answered, { kind: 'grant', scope: 'session', gate, ...said }, w.ports),
    ).toBe(null)
    expect(w.steps).toEqual([
      { express: { scope: once, direction: 'grant', source }, session: 'ses-1', card },
      {
        express: { scope: { kind: 'session', ...gate }, direction: 'grant', source },
        session: 'ses-1',
        card,
      },
    ])
  })

  it.each([
    ['refused', 'undecidable'],
    ['unavailable', 'unavailable'],
  ] as const)('answers a write the session ends %s as %s', async (expressed, kind) => {
    const w = world('written', expressed)
    const effect = { kind: 'grant', scope: 'once', card, source } as const
    expect(await applyAnswer(answered, effect, w.ports)).toMatchObject({ kind })
    expect(await applyAnswer(answered, effect, { ...w.ports, authorizations: undefined })).toEqual({
      kind: 'unavailable',
      diagnostic: 'the session authorization writer is unavailable',
    })
  })
})

describe('the effect of always allow', () => {
  it('sets the tenant setting and writes nothing to the session', async () => {
    const w = world()
    expect(await applyAnswer(answered, allowAlways, w.ports)).toBe(null)
    expect(w.steps).toEqual([{ set: 'allow', option: 'allow-always', card, said: source }])
  })

  it('releases this one call when the setting cannot be written', async () => {
    const w = world('not-writable')
    expect(await applyAnswer(answered, allowAlways, w.ports)).toEqual({
      kind: 'judge-again',
      notice:
        'The person chose to always allow this capability, but that choice could not be saved. This call was allowed; later calls will ask again.',
    })
    expect(w.steps[1]).toEqual({
      express: { scope: once, direction: 'grant', source },
      session: 'ses-1',
      card,
    })
    const refused = world('not-writable', 'unavailable')
    expect(await applyAnswer(answered, allowAlways, refused.ports)).toMatchObject({
      kind: 'unavailable',
    })
  })

  it('waits when the setting could not be written now or no settings are installed', async () => {
    const w = world('unavailable')
    expect(await applyAnswer(answered, allowAlways, w.ports)).toMatchObject({ kind: 'unavailable' })
    expect(w.steps).toHaveLength(1)
    const none = world()
    expect(
      await applyAnswer(answered, allowAlways, { ...none.ports, picks: undefined }),
    ).toMatchObject({ kind: 'unavailable' })
    expect(none.steps).toEqual([])
  })
})

describe('the effect of always deny', () => {
  it('sets the tenant setting, then withdraws the release of the session for the gate, then refuses as prohibited', async () => {
    const w = world()
    expect(await applyAnswer(answered, denyAlways, w.ports)).toMatchObject({
      kind: 'deny',
      category: 'prohibited',
      reason: 'deny-always',
    })
    expect(w.steps).toEqual([
      { set: 'deny', option: 'deny-always', card, said: source },
      {
        express: { scope: { kind: 'session', ...gate }, direction: 'revoke', source },
        session: 'ses-1',
        card,
      },
    ])
  })

  it('refuses only this call, naming that nothing was written, when the setting cannot be written', async () => {
    const w = world('not-writable')
    expect(await applyAnswer(answered, denyAlways, w.ports)).toMatchObject({
      kind: 'deny',
      category: 'not-released',
      reason: 'deny-always-not-written',
      notice:
        'The person chose to always prohibit this capability, but that choice could not be saved. This call was not allowed; later calls will ask again.',
    })
    expect(w.steps).toHaveLength(1)
  })

  it('waits while the setting or the withdrawal could not be written now', async () => {
    const setting = world('unavailable')
    expect(await applyAnswer(answered, denyAlways, setting.ports)).toMatchObject({
      kind: 'unavailable',
    })
    expect(setting.steps).toHaveLength(1)
    const withdrawal = world('written', 'unavailable')
    expect(await applyAnswer(answered, denyAlways, withdrawal.ports)).toMatchObject({
      kind: 'unavailable',
    })
    expect(withdrawal.steps).toHaveLength(2)
  })
})
