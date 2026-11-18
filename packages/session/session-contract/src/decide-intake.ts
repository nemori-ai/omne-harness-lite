import type { GuardCommand } from './ports.ts'
import { invalid, rejected } from './decision-support.ts'
import { INTAKE_GUARD_OWNER, intakeTermsOf, type AdmittedSource } from './input-sources.ts'
import { judgeSessionIntake, type SessionIntakeLimits } from './intake.ts'
import type { DecideReads, Decision } from './judgments.ts'
import type { RoutedInput } from './values.ts'

type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>

// The values of an input come from the terms Session prepared, never from the request (SE-28).
function admittedSourceOf(
  input: Ordinary,
  reads: DecideReads,
  field: string,
): AdmittedSource | Decision {
  const terms = reads.intake?.source
  if (terms === undefined || terms.kind === 'unavailable')
    return rejected({
      kind: 'unavailable',
      owner: INTAKE_GUARD_OWNER,
      diagnostic: `the terms of this input are not available: ${terms?.reason ?? 'none prepared'}`,
    })
  if (terms.kind === 'refused') return invalid(`${field}.source`, terms.reason)
  const { source } = terms
  if (source.name !== input.source)
    return invalid(`${field}.source`, 'the intake terms are of another source')
  if (source.role !== input.message.role)
    return invalid(`${field}.message.role`, `this source authors ${source.role} messages only`)
  return source
}

type Admitted = Readonly<{ source: AdmittedSource }>
type Intake = Readonly<{ reads: DecideReads; limits: SessionIntakeLimits }>

// One input is admitted on its terms and within the capacity its source counts toward.
export function admitInput(
  input: Ordinary,
  pending: number,
  intake: Intake,
  field: string,
): Admitted | Decision {
  const source = admittedSourceOf(input, intake.reads, field)
  if ('kind' in source) return source
  const limited = source.countsTowardCapacity
    ? judgeSessionIntake(pending, input, intake.limits)
    : null
  return limited === null ? { source } : rejected(limited)
}

// The writer's terms ride with the guards of the commit; every decider reads them as `reads.intake`.
export function readsWithTerms(reads: DecideReads, guards: readonly GuardCommand[]): DecideReads {
  const terms = intakeTermsOf(guards)
  return terms === null ? reads : { ...reads, intake: terms }
}
