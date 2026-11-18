import {
  createInputSourceRegistry,
  decide,
  inputSourceName,
  prepareEntriesTerms,
  prepareIntakeTerms,
  withIntakeTerms,
  type DerivedInputKind,
  type GuardCommand,
  type Decision,
  type InputSourceDeclaration,
  type IntakeTerms,
  type SessionCommand,
  type SessionDerivedInputs,
} from '@omne-harness/session-contract'

const COMPONENT = 'session-testing'
const SYSTEM = { subject: 'system', component: COMPONENT, screened: false } as const
const source = (
  name: string,
  label: string,
  accepts: InputSourceDeclaration['accepts'],
  wake: InputSourceDeclaration['wake'],
): InputSourceDeclaration => ({ name: inputSourceName(name), label, accepts, wake })

/** The same declarations as the testing sources of session-contract; a test holds them equal. */
export const DOUBLE_SOURCES: readonly InputSourceDeclaration[] = [
  source('test.person', 'Test person', { subject: 'member' }, 'always'),
  source('test.system', 'Test system', SYSTEM, 'always'),
  source('test.quiet', 'Test quiet system', SYSTEM, 'never'),
  source('test.background-outcome', 'Background outcome', SYSTEM, 'as-requested'),
  source('test.background-stop', 'Background stop', SYSTEM, 'never'),
]

const registry = createInputSourceRegistry()
for (const declaration of DOUBLE_SOURCES) registry.register(declaration)

const DERIVED: Readonly<Record<DerivedInputKind, string>> = {
  'background-outcome': 'test.background-outcome',
  'background-stop': 'test.background-stop',
}
const derived: SessionDerivedInputs = {
  admission(kind) {
    const found = registry.lookup(inputSourceName(DERIVED[kind]))
    return found.kind === 'absent'
      ? null
      : { declaration: found.declaration, subject: { kind: 'system', component: COMPONENT } }
  },
}

/** The double is the writer of its log: it admits a command's input as a member of the tenant. */
export function admittedGuards(
  command: SessionCommand,
  guards: readonly GuardCommand[],
): readonly GuardCommand[] {
  const subject = { kind: 'member' } as const
  return withIntakeTerms(
    guards,
    prepareIntakeTerms(command, { subject, sources: registry, derived }),
  )
}

export function derivedTerms(): IntakeTerms['derived'] {
  return prepareEntriesTerms(derived)
}

export function decideCreation(
  command: Extract<SessionCommand, { kind: 'create' }>,
  guards: readonly GuardCommand[],
): Decision {
  return decide(null, command, admittedGuards(command, guards), null, { compaction: null })
}
