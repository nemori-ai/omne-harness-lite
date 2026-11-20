import { describe, expect, it } from 'vitest'
import {
  decideScheduleConsent,
  needsConsent,
  type ConsentInput,
} from '../../../src/rows/schedule/consent.ts'

const actors = ['owner', 'agent', 'other'] as const
const subjects = ['new', 'agentOwn', 'others'] as const
const commands = ['read', 'draftLocal', 'consent'] as const
const basis = { kind: 'blanket', scope: 'session', grant: '{"via":"session-grant"}' } as const
const consents = [{ kind: 'consented', basis }, { kind: 'none' }, { kind: 'unavailable' }] as const

/** The table of the design (7.3), written as it reads: the first matching row answers. */
function expected(input: ConsentInput) {
  const { actor, subject, command, consent } = input
  if (actor === 'other') return { kind: 'forbidden' }
  if (actor === 'owner' || command === 'read') return { kind: 'allow', basis: null }
  if (subject === 'others') return { kind: 'forbidden' }
  if (command === 'draftLocal') return { kind: 'allow', basis: null }
  if (consent.kind === 'consented') return { kind: 'allow', basis }
  return consent.kind === 'none' ? { kind: 'refused' } : { kind: 'unavailable' }
}

describe('the schedule consent decision', () => {
  const cases = actors.flatMap(actor =>
    subjects.flatMap(subject =>
      commands.flatMap(command => consents.map(consent => ({ actor, subject, command, consent }))),
    ),
  )

  it('covers every combination of the four axes', () => {
    expect(cases).toHaveLength(3 * 3 * 3 * 3)
  })

  it.each(cases.map(input => [JSON.stringify(input), input] as const))('%s', (_label, input) => {
    expect(decideScheduleConsent(input)).toEqual(expected(input))
  })

  it('reads the consent exactly where the answer depends on it', () => {
    for (const input of cases) {
      const answers = new Set(
        consents.map(consent => JSON.stringify(decideScheduleConsent({ ...input, consent }))),
      )
      expect(needsConsent(input), JSON.stringify(input)).toBe(answers.size > 1)
    }
  })
})
