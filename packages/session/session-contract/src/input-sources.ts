import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import { sessionIntakeLimits, type SessionIntakeLimits } from './intake.ts'
import type { GuardCommand, SessionCommand } from './ports.ts'
import type { RoutedInput } from './values.ts'

/** `<domain>.<name>`. Parsed where a declaration or a request enters; the core never builds one. */
export type InputSourceName = string & { readonly __inputSource: unique symbol }

const NAME = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/u

export function parseInputSourceName(text: unknown): InputSourceName | null {
  return typeof text === 'string' && NAME.test(text) ? (text as InputSourceName) : null
}

export function inputSourceName(text: string): InputSourceName {
  const parsed = parseInputSourceName(text)
  if (parsed === null) throw new TypeError(`"${text}" is not an input source name <domain>.<name>`)
  return parsed
}

export type InputSourceDeclaration = Readonly<{
  name: InputSourceName
  label: string
  accepts:
    | Readonly<{ subject: 'member' }>
    | Readonly<{ subject: 'system'; component: string; screened: boolean }>
  wake: 'always' | 'never' | 'as-requested'
}>

export type IntakeSubject =
  | Readonly<{ kind: 'member' }>
  | Readonly<{ kind: 'system'; component: string }>

/** The values one admission fixes. Computed once, written to the log, never computed again. */
export type AdmittedSource = Readonly<{
  name: InputSourceName
  label: string
  role: 'user' | 'system_reminder'
  wakes: boolean
  entry: 'login' | 'trusted'
  countsTowardCapacity: boolean
}>

export type SourceRefusal = 'subject-not-accepted' | 'wake-flag-not-allowed'

export type SourceAdmission =
  | Readonly<{ kind: 'admitted'; source: AdmittedSource; parse: boolean; screened: boolean }>
  | Readonly<{ kind: 'refused'; reason: SourceRefusal }>

function subjectAccepted(declaration: InputSourceDeclaration, subject: IntakeSubject): boolean {
  const { accepts } = declaration
  if (accepts.subject === 'member') return subject.kind === 'member'
  return subject.kind === 'system' && subject.component === accepts.component
}

/** The only place an author role is derived: from the subject kind, never from the declaration. */
export function admitSource(
  declaration: InputSourceDeclaration,
  subject: IntakeSubject,
  request: Readonly<{ wake?: boolean }>,
): SourceAdmission {
  if (!subjectAccepted(declaration, subject))
    return { kind: 'refused', reason: 'subject-not-accepted' }
  if (request.wake !== undefined && declaration.wake !== 'as-requested')
    return { kind: 'refused', reason: 'wake-flag-not-allowed' }
  const member = subject.kind === 'member'
  const { name, label, accepts } = declaration
  return {
    kind: 'admitted',
    source: {
      name,
      label,
      role: member ? 'user' : 'system_reminder',
      wakes:
        declaration.wake === 'as-requested'
          ? request.wake !== false
          : declaration.wake === 'always',
      entry: member ? 'login' : 'trusted',
      countsTowardCapacity: member,
    },
    parse: member,
    screened: accepts.subject === 'member' || accepts.screened,
  }
}

export type InputSourceLookup =
  | Readonly<{ kind: 'registered'; declaration: InputSourceDeclaration }>
  | Readonly<{ kind: 'absent' }>

export interface InputSources {
  lookup(name: InputSourceName): InputSourceLookup
}

export type InputSourceRegistry = InputSources &
  Readonly<{
    register(declaration: InputSourceDeclaration): () => void
  }>

function checkedAccepts(
  name: InputSourceName,
  accepts: InputSourceDeclaration['accepts'],
): InputSourceDeclaration['accepts'] {
  if (accepts.subject === 'member') return Object.freeze({ subject: 'member' })
  if (accepts.subject !== 'system' || typeof accepts.component !== 'string' || !accepts.component)
    throw new TypeError(`input source ${name} names no accepted subject`)
  const { component, screened } = accepts
  return Object.freeze({ subject: 'system', component, screened: screened === true })
}

function checkedDeclaration(declaration: InputSourceDeclaration): InputSourceDeclaration {
  const name = inputSourceName(declaration.name)
  const { label, wake } = declaration
  if (typeof label !== 'string' || label.trim() === '')
    throw new TypeError(`input source ${name} has no label`)
  if (wake !== 'always' && wake !== 'never' && wake !== 'as-requested')
    throw new TypeError(`input source ${name} has no wake rule`)
  return Object.freeze({ name, label, accepts: checkedAccepts(name, declaration.accepts), wake })
}

export function createInputSourceRegistry(): InputSourceRegistry {
  const declared = new Map<InputSourceName, InputSourceDeclaration>()
  return Object.freeze({
    register(declaration: InputSourceDeclaration) {
      const checked = checkedDeclaration(declaration)
      if (declared.has(checked.name))
        throw new Error(`input source ${checked.name} is already registered`)
      declared.set(checked.name, checked)
      return () => {
        if (declared.get(checked.name) === checked) declared.delete(checked.name)
      }
    },
    lookup(name: InputSourceName): InputSourceLookup {
      const declaration = declared.get(name)
      return declaration === undefined ? { kind: 'absent' } : { kind: 'registered', declaration }
    },
  })
}

export type DerivedInputKind = 'background-outcome' | 'background-stop'

export type DerivedAdmission = Readonly<{
  declaration: InputSourceDeclaration
  subject: IntakeSubject
}>

export interface SessionDerivedInputs {
  admission(kind: DerivedInputKind): DerivedAdmission | null
}

export type SourceTerms =
  | Readonly<{ kind: 'admitted'; source: AdmittedSource }>
  | Readonly<{ kind: 'refused'; reason: SourceRefusal }>
  | Readonly<{ kind: 'unavailable'; reason: 'source-absent' | 'subject-absent' }>

export type BudgetTerms =
  | Readonly<{ kind: 'given'; limits: SessionIntakeLimits }>
  | Readonly<{ kind: 'unavailable' }>

export interface SessionIntakeBudget {
  read(tenant: TenantId): Promise<SessionIntakeLimits | null>
}

/** The terms of one commit's intake. The transaction port computes them; `decide` reads them. */
export type IntakeTerms = Readonly<{
  source?: SourceTerms
  budget?: BudgetTerms
  derived?: Readonly<Partial<Record<DerivedInputKind, DerivedAdmission>>>
}>

export const INTAKE_GUARD_OWNER = 'session-intake'
const INTAKE_PROTOCOL: GuardCommand['protocol'] = Object.freeze({
  owner: 'session',
  name: 'intake-terms',
  revision: '1',
  digest: 'sha256:session-intake-terms@1',
})

type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>

export function commandInput(command: SessionCommand): Ordinary | null {
  if (command.kind === 'accept')
    return command.input.value.kind === 'ordinary' ? command.input.value : null
  if (command.kind === 'create') return command.input.creation.initial
  if (command.kind === 'interrupt') return command.input.urgent
  return null
}

function sourceTerms(
  input: Ordinary,
  subject: IntakeSubject | undefined,
  sources: InputSources | null,
): SourceTerms {
  if (subject === undefined) return { kind: 'unavailable', reason: 'subject-absent' }
  const name = parseInputSourceName(input.source)
  const found = name === null || sources === null ? null : sources.lookup(name)
  if (found === null || found.kind === 'absent')
    return { kind: 'unavailable', reason: 'source-absent' }
  const request = input.wake === undefined ? {} : { wake: input.wake }
  const admitted = admitSource(found.declaration, subject, request)
  return admitted.kind === 'admitted' ? { kind: 'admitted', source: admitted.source } : admitted
}

export type IntakeBasis = Readonly<{
  subject: IntakeSubject | undefined
  sources: InputSources | null
  derived: SessionDerivedInputs | null
  budget?: BudgetTerms | undefined
}>

export async function budgetTermsOf(
  budget: SessionIntakeBudget | null | undefined,
  command: SessionCommand,
): Promise<BudgetTerms | undefined> {
  if (budget === null || budget === undefined || commandInput(command) === null) return undefined
  try {
    const limits = await budget.read(command.input.tenant)
    return limits === null
      ? { kind: 'unavailable' }
      : { kind: 'given', limits: sessionIntakeLimits(limits) }
  } catch {
    return { kind: 'unavailable' }
  }
}

/** Computes the terms of a command where it is committed. It never fails: `decide` answers. */
export function prepareIntakeTerms(
  command: SessionCommand,
  basis: IntakeBasis,
): IntakeTerms | null {
  const input = commandInput(command)
  if (input !== null) {
    const source = sourceTerms(input, basis.subject, basis.sources)
    return basis.budget === undefined ? { source } : { source, budget: basis.budget }
  }
  if (command.kind !== 'stopCall') return null
  const stop = basis.derived?.admission('background-stop') ?? null
  return stop === null ? null : { derived: { 'background-stop': stop } }
}

export function prepareEntriesTerms(derived: SessionDerivedInputs | null): IntakeTerms['derived'] {
  const outcome = derived?.admission('background-outcome') ?? null
  return outcome === null ? {} : { 'background-outcome': outcome }
}

/** The guards of a commit with the writer's own terms; terms a caller brought are dropped. */
export function withIntakeTerms(
  guards: readonly GuardCommand[],
  terms: IntakeTerms | null,
): readonly GuardCommand[] {
  const own = guards.filter(guard => guard.owner !== INTAKE_GUARD_OWNER)
  if (terms === null) return own
  return [
    ...own,
    {
      owner: INTAKE_GUARD_OWNER,
      participant: 'session',
      protocol: INTAKE_PROTOCOL,
      facts: terms as unknown as JsonValue,
    },
  ]
}

const ADMITTED_SHAPE: Readonly<Record<keyof AdmittedSource, (value: unknown) => boolean>> = {
  name: value => parseInputSourceName(value) !== null,
  label: value => typeof value === 'string',
  role: value => value === 'user' || value === 'system_reminder',
  wakes: value => typeof value === 'boolean',
  entry: value => value === 'login' || value === 'trusted',
  countsTowardCapacity: value => typeof value === 'boolean',
}

function isAdmittedSource(value: unknown): value is AdmittedSource {
  if (typeof value !== 'object' || value === null) return false
  const given = value as Readonly<Record<string, unknown>>
  return Object.entries(ADMITTED_SHAPE).every(([member, fits]) => fits(given[member]))
}

function isBudgetTerms(value: unknown): boolean {
  if (value === undefined) return true
  const budget = value as BudgetTerms
  if (budget?.kind === 'unavailable') return true
  if (budget?.kind !== 'given') return false
  try {
    sessionIntakeLimits(budget.limits)
    return true
  } catch {
    return false
  }
}

export function intakeTermsOf(guards: readonly GuardCommand[]): IntakeTerms | null {
  const guard = guards.find(item => item.owner === INTAKE_GUARD_OWNER)
  if (guard === undefined || typeof guard.facts !== 'object' || guard.facts === null) return null
  const terms = guard.facts as unknown as IntakeTerms
  const admitted = terms.source?.kind === 'admitted' ? terms.source.source : undefined
  if (admitted !== undefined && !isAdmittedSource(admitted)) return null
  return isBudgetTerms(terms.budget) ? terms : null
}

export function admitDerivedOf(
  derived: IntakeTerms['derived'],
  kind: DerivedInputKind,
  request: Readonly<{ wake?: boolean }>,
): AdmittedSource | null {
  return admitDerived(derived?.[kind], request)
}

export function admitDerived(
  admission: DerivedAdmission | undefined,
  request: Readonly<{ wake?: boolean }>,
): AdmittedSource | null {
  if (admission === undefined) return null
  const admitted = admitSource(admission.declaration, admission.subject, request)
  return admitted.kind === 'admitted' ? admitted.source : null
}
