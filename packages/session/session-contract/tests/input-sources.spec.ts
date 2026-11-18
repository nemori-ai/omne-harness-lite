import { describe, expect, it } from 'vitest'
import {
  admitDerived,
  admitSource,
  createInputSourceRegistry,
  inputSourceName,
  intakeTermsOf,
  prepareEntriesTerms,
  prepareIntakeTerms,
  withIntakeTerms,
  parseInputSourceName,
  type InputSourceDeclaration,
  type IntakeSubject,
} from '@omne-harness/session-contract'

const MEMBER: IntakeSubject = { kind: 'member' }
const PROBE: IntakeSubject = { kind: 'system', component: 'probe' }
const OTHER: IntakeSubject = { kind: 'system', component: 'other' }

function declaration(
  accepts: InputSourceDeclaration['accepts'],
  wake: InputSourceDeclaration['wake'],
): InputSourceDeclaration {
  return { name: inputSourceName('probe.task'), label: 'Probe task', accepts, wake }
}

const FROM_MEMBER = { subject: 'member' } as const
const FROM_PROBE = { subject: 'system', component: 'probe', screened: false } as const

describe('admitSource: subject kind x accepted subject x wake rule', () => {
  const person = { role: 'user', entry: 'login', countsTowardCapacity: true }
  const system = { role: 'system_reminder', entry: 'trusted', countsTowardCapacity: false }
  const cases = [
    // a member, to a source that accepts members
    [FROM_MEMBER, 'always', MEMBER, {}, { ...person, wakes: true }],
    [FROM_MEMBER, 'never', MEMBER, {}, { ...person, wakes: false }],
    [FROM_MEMBER, 'as-requested', MEMBER, {}, { ...person, wakes: true }],
    [FROM_MEMBER, 'as-requested', MEMBER, { wake: true }, { ...person, wakes: true }],
    [FROM_MEMBER, 'as-requested', MEMBER, { wake: false }, { ...person, wakes: false }],
    [FROM_MEMBER, 'always', MEMBER, { wake: false }, 'wake-flag-not-allowed'],
    [FROM_MEMBER, 'never', MEMBER, { wake: true }, 'wake-flag-not-allowed'],
    // a system component, to a source that accepts that component
    [FROM_PROBE, 'always', PROBE, {}, { ...system, wakes: true }],
    [FROM_PROBE, 'never', PROBE, {}, { ...system, wakes: false }],
    [FROM_PROBE, 'as-requested', PROBE, {}, { ...system, wakes: true }],
    [FROM_PROBE, 'as-requested', PROBE, { wake: false }, { ...system, wakes: false }],
    [FROM_PROBE, 'always', PROBE, { wake: true }, 'wake-flag-not-allowed'],
    // the subject is not the one the declaration accepts
    [FROM_MEMBER, 'always', PROBE, {}, 'subject-not-accepted'],
    [FROM_MEMBER, 'as-requested', PROBE, { wake: true }, 'subject-not-accepted'],
    [FROM_PROBE, 'always', MEMBER, {}, 'subject-not-accepted'],
    [FROM_PROBE, 'always', OTHER, {}, 'subject-not-accepted'],
    [FROM_PROBE, 'never', OTHER, {}, 'subject-not-accepted'],
  ] as const

  it.each(cases)('%j %s <- %j %j', (accepts, wake, subject, request, expected) => {
    const answer = admitSource(declaration(accepts, wake), subject, request)
    if (typeof expected === 'string') expect(answer).toEqual({ kind: 'refused', reason: expected })
    else
      expect(answer).toMatchObject({
        kind: 'admitted',
        source: { name: 'probe.task', label: 'Probe task', ...expected },
      })
  })

  it('a system subject never gets the user role, whatever the declaration says (SE-28)', () => {
    for (const accepts of [FROM_MEMBER, FROM_PROBE])
      for (const wake of ['always', 'never', 'as-requested'] as const) {
        const answer = admitSource(declaration(accepts, wake), PROBE, {})
        if (answer.kind === 'admitted') expect(answer.source.role).toBe('system_reminder')
      }
  })

  it('a member input is parsed and screened; a system one is screened only when declared', () => {
    expect(admitSource(declaration(FROM_MEMBER, 'always'), MEMBER, {})).toMatchObject({
      parse: true,
      screened: true,
    })
    expect(admitSource(declaration(FROM_PROBE, 'always'), PROBE, {})).toMatchObject({
      parse: false,
      screened: false,
    })
    const screened = { ...FROM_PROBE, screened: true }
    expect(admitSource(declaration(screened, 'always'), PROBE, {})).toMatchObject({
      parse: false,
      screened: true,
    })
  })
})

describe('input source names and the registry', () => {
  it('a name is <domain>.<name>; anything else is not a name', () => {
    expect(parseInputSourceName('session.member')).toBe('session.member')
    for (const bad of ['member', 'Session.member', 'a.b.c', '.x', 'a.', '', 7, null])
      expect(parseInputSourceName(bad)).toBeNull()
    expect(() => inputSourceName('login-entry')).toThrow(TypeError)
  })

  it('looks a declaration up by name and forgets it at withdrawal', () => {
    const registry = createInputSourceRegistry()
    const name = inputSourceName('probe.task')
    expect(registry.lookup(name)).toEqual({ kind: 'absent' })
    const withdraw = registry.register(declaration(FROM_PROBE, 'always'))
    expect(registry.lookup(name)).toMatchObject({ kind: 'registered', declaration: { name } })
    withdraw()
    expect(registry.lookup(name)).toEqual({ kind: 'absent' })
  })

  it('refuses a second declaration of a name, and the first stays', () => {
    const registry = createInputSourceRegistry()
    registry.register(declaration(FROM_PROBE, 'always'))
    expect(() => registry.register(declaration(FROM_MEMBER, 'never'))).toThrow(
      /already registered/u,
    )
    const found = registry.lookup(inputSourceName('probe.task'))
    expect(found).toMatchObject({ declaration: { wake: 'always' } })
  })

  it('a stale withdrawal does not remove a later declaration of the same name', () => {
    const registry = createInputSourceRegistry()
    const first = registry.register(declaration(FROM_PROBE, 'always'))
    first()
    registry.register(declaration(FROM_PROBE, 'never'))
    first()
    expect(registry.lookup(inputSourceName('probe.task'))).toMatchObject({ kind: 'registered' })
  })

  it('refuses a declaration with no label, no wake rule or no accepted subject', () => {
    const registry = createInputSourceRegistry()
    const good = declaration(FROM_PROBE, 'always')
    expect(() => registry.register({ ...good, label: ' ' })).toThrow(TypeError)
    expect(() => registry.register({ ...good, wake: 'sometimes' as never })).toThrow(TypeError)
    expect(() =>
      registry.register({
        ...good,
        accepts: { subject: 'system', component: '', screened: false },
      }),
    ).toThrow(TypeError)
    expect(() => registry.register({ ...good, name: 'nodot' as never })).toThrow(TypeError)
  })
})

describe('intake terms are computed where the command is committed', () => {
  const registry = createInputSourceRegistry()
  registry.register(declaration(FROM_PROBE, 'as-requested'))
  const outcome = { declaration: declaration(FROM_PROBE, 'as-requested'), subject: PROBE }
  const derived = { admission: () => outcome }
  const base = { tenant: null as never, session: 's' as never, operation: 'op' as never }
  const value = {
    kind: 'ordinary',
    input: 'i' as never,
    message: { id: 'm', role: 'system_reminder', blocks: [] } as never,
    origin: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
    source: inputSourceName('probe.task'),
  } as const
  const accept = { kind: 'accept', input: { ...base, value } } as const
  const basis = { subject: PROBE, sources: registry, derived }

  it('admits the input of a command and carries the terms as one guard', () => {
    const terms = prepareIntakeTerms(accept, basis)
    expect(terms).toMatchObject({ source: { kind: 'admitted', source: { wakes: true } } })
    expect(intakeTermsOf(withIntakeTerms([], terms))).toEqual(terms)
  })

  it('carries the wake the request asked for, and a refusal with its reason', () => {
    const quiet = { kind: 'accept', input: { ...base, value: { ...value, wake: false } } } as const
    expect(prepareIntakeTerms(quiet, basis)).toMatchObject({
      source: { kind: 'admitted', source: { wakes: false } },
    })
    expect(prepareIntakeTerms(accept, { ...basis, subject: MEMBER })).toEqual({
      source: { kind: 'refused', reason: 'subject-not-accepted' },
    })
  })

  it('answers unavailable terms for no subject, no registry and an unregistered source', () => {
    const absent = { source: { kind: 'unavailable', reason: 'source-absent' } }
    expect(prepareIntakeTerms(accept, { ...basis, subject: undefined })).toEqual({
      source: { kind: 'unavailable', reason: 'subject-absent' },
    })
    expect(prepareIntakeTerms(accept, { ...basis, sources: null })).toEqual(absent)
    const other = { ...value, source: inputSourceName('probe.other') }
    const command = { kind: 'accept', input: { ...base, value: other } } as const
    expect(prepareIntakeTerms(command, basis)).toEqual(absent)
  })

  it('a stop of a call gets the stop terms; any other command gets none', () => {
    const stop = { kind: 'stopCall', input: { ...base, producer: { kind: 'tool', call: 'c' } } }
    expect(prepareIntakeTerms(stop as never, basis)).toEqual({
      derived: { 'background-stop': outcome },
    })
    expect(prepareIntakeTerms(stop as never, { ...basis, derived: null })).toBeNull()
    expect(prepareIntakeTerms({ kind: 'recordIdle', input: base } as never, basis)).toBeNull()
    expect(prepareEntriesTerms(derived)).toEqual({ 'background-outcome': outcome })
    expect(prepareEntriesTerms(null)).toEqual({})
  })

  it('drops terms a caller brought and reads no terms from a forged shape', () => {
    const forged = withIntakeTerms([], {
      source: { kind: 'admitted', source: { name: 'probe.task', role: 'owner' } as never },
    })
    expect(intakeTermsOf(forged)).toBeNull()
    expect(withIntakeTerms(forged, null)).toEqual([])
    expect(intakeTermsOf([])).toBeNull()
  })

  it('a derived input is admitted by the same formula, with the wake Session asks for', () => {
    expect(admitDerived(outcome, { wake: false })).toMatchObject({
      wakes: false,
      role: 'system_reminder',
    })
    expect(admitDerived(outcome, { wake: true })).toMatchObject({ wakes: true })
    expect(admitDerived({ ...outcome, subject: OTHER }, {})).toBeNull()
    expect(admitDerived(undefined, {})).toBeNull()
  })
})
