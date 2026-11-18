import {
  createInputSourceRegistry,
  prepareEntriesTerms,
  prepareIntakeTerms,
  withIntakeTerms,
  type InputSources,
  type IntakeSubject,
  type IntakeTerms,
  type DerivedInputKind,
  type InputSourceDeclaration,
  type InputSourceName,
  type InputSourceRegistry,
  type SessionDerivedInputs,
} from './input-sources.ts'
import type { SessionAccessCheck } from './access.ts'
import type { GuardCommand, SessionCommand } from './ports.ts'
import { withMemberSubject } from './testing-access.ts'

export const TESTING_SYSTEM_COMPONENT = 'session-testing'

const named = (text: string) => text as InputSourceName

export const TESTING_SOURCES = Object.freeze({
  person: named('test.person'),
  system: named('test.system'),
  quiet: named('test.quiet'),
  outcome: named('test.background-outcome'),
  stop: named('test.background-stop'),
})

const SYSTEM = { subject: 'system', component: TESTING_SYSTEM_COMPONENT, screened: false } as const

export const TESTING_DECLARATIONS: readonly InputSourceDeclaration[] = Object.freeze([
  {
    name: TESTING_SOURCES.person,
    label: 'Test person',
    accepts: { subject: 'member' },
    wake: 'always',
  },
  { name: TESTING_SOURCES.system, label: 'Test system', accepts: SYSTEM, wake: 'always' },
  { name: TESTING_SOURCES.quiet, label: 'Test quiet system', accepts: SYSTEM, wake: 'never' },
  {
    name: TESTING_SOURCES.outcome,
    label: 'Background outcome',
    accepts: SYSTEM,
    wake: 'as-requested',
  },
  { name: TESTING_SOURCES.stop, label: 'Background stop', accepts: SYSTEM, wake: 'never' },
])

export function testingInputSources(): InputSourceRegistry {
  const registry = createInputSourceRegistry()
  for (const declaration of TESTING_DECLARATIONS) registry.register(declaration)
  return registry
}

const DERIVED: Readonly<Record<DerivedInputKind, InputSourceDeclaration['name']>> = {
  'background-outcome': TESTING_SOURCES.outcome,
  'background-stop': TESTING_SOURCES.stop,
}

export function testingDerivedInputs(
  sources: Pick<InputSourceRegistry, 'lookup'> = testingInputSources(),
): SessionDerivedInputs {
  return {
    admission(kind) {
      const found = sources.lookup(DERIVED[kind])
      return found.kind === 'absent'
        ? null
        : {
            declaration: found.declaration,
            subject: { kind: 'system', component: TESTING_SYSTEM_COMPONENT },
          }
    },
  }
}

/** The guards a writer would add to this command, for a test that calls `decide` itself. Null: no subject. */
export function testingIntakeGuards(
  command: SessionCommand,
  given: IntakeSubject | null = { kind: 'member' },
): readonly GuardCommand[] {
  const sources = testingInputSources()
  const derived = testingDerivedInputs(sources)
  const subject = given ?? undefined
  return withIntakeTerms([], prepareIntakeTerms(command, { subject, sources, derived }))
}

export type TestingWriterOptions = Readonly<{
  sources?: InputSources | null
  derived?: SessionDerivedInputs | null
  /** `strict`: an allowed answer without a subject kind admits no input. Default: it is a member. */
  subjects?: 'strict' | 'member-by-default'
}>

/** What a testing double needs to admit inputs as the single writer of its log. */
export function testingWriter<P>(options: TestingWriterOptions) {
  const sources = options.sources === undefined ? testingInputSources() : options.sources
  const derived = options.derived === undefined ? testingDerivedInputs() : options.derived
  return {
    check: (check: SessionAccessCheck<P>): SessionAccessCheck<P> =>
      options.subjects === 'strict' ? check : withMemberSubject(check),
    guards: (
      command: SessionCommand,
      guards: readonly GuardCommand[],
      subject: IntakeSubject | undefined,
    ): readonly GuardCommand[] =>
      withIntakeTerms(guards, prepareIntakeTerms(command, { subject, sources, derived })),
    entries: (): IntakeTerms['derived'] => prepareEntriesTerms(derived),
  }
}
