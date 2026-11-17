import { describe, expect, it } from 'vitest'
import { decideScheduleConsent, type ConsentInput } from '../../../src/rows/schedule/consent.ts'

const actors = ['owner', 'agent', 'other'] as const
const subjects = ['new', 'agentOwn', 'others'] as const
const commands = ['read', 'draftLocal', 'consent'] as const
const modes = [{ kind: 'auto', generation: 7 }, { kind: 'draft' }, { kind: 'unreadable' }] as const
const confirmations = [
  { kind: 'none' },
  { kind: 'valid', decision: 'decision-r' },
  { kind: 'mismatch' },
  { kind: 'foreign' },
  { kind: 'unreadable' },
] as const

/** T1 of the design, written as the table reads: the first matching row answers. */
function expected(input: ConsentInput) {
  const { actor, subject, command, mode, confirmation } = input
  if (actor === 'other') return { kind: 'forbidden' }
  if (actor === 'owner') return { kind: 'allow', basis: { kind: 'notRequired' } }
  if (command === 'read') return { kind: 'allow', basis: { kind: 'notRequired' } }
  if (subject === 'others') return { kind: 'forbidden' }
  if (command === 'draftLocal') return { kind: 'allow', basis: { kind: 'notRequired' } }
  if (mode.kind === 'auto') return { kind: 'allow', basis: { kind: 'blanket', generation: 7 } }
  if (mode.kind === 'unreadable') return { kind: 'unavailable' }
  if (confirmation.kind === 'valid')
    return { kind: 'allow', basis: { kind: 'granular', decision: 'decision-r' } }
  if (confirmation.kind === 'unreadable') return { kind: 'unavailable' }
  return { kind: 'confirm' }
}

describe('the schedule consent decision (T1)', () => {
  const cases = actors.flatMap(actor =>
    subjects.flatMap(subject =>
      commands.flatMap(command =>
        modes.flatMap(mode =>
          confirmations.map(confirmation => ({ actor, subject, command, mode, confirmation })),
        ),
      ),
    ),
  )

  it('covers every combination of the five axes', () => {
    expect(cases).toHaveLength(3 * 3 * 3 * 3 * 5)
  })

  it.each(cases.map(input => [JSON.stringify(input), input] as const))('%s', (_label, input) => {
    expect(decideScheduleConsent(input)).toEqual(expected(input))
  })

  it('never lets an agent consent for itself while the owner asks for drafts', () => {
    for (const input of cases)
      if (input.actor === 'agent' && input.command === 'consent' && input.mode.kind === 'draft') {
        const decided = decideScheduleConsent(input)
        if (decided.kind === 'allow')
          expect(decided.basis).toEqual({ kind: 'granular', decision: 'decision-r' })
      }
  })
})
