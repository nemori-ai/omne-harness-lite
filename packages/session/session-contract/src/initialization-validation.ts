import type { GuardCommand, SessionCommand } from './ports.ts'
import type { WorkSnapshot } from './values.ts'
import { InitializationInvalid } from './initialization-parse.ts'
import {
  initializationKey,
  initializationPlan,
  sameInitializationValue as same,
  tenantText,
  type InitializationPlanItem,
} from './initialization-plan.ts'
import {
  initializationCommandInput,
  parseInitializationFacts,
  type InitialAdoption,
  type InitializationAdoption,
  type InitializationGuardFacts,
  type InitializationGuardResult,
} from './initialization-schema.ts'
import { validateRequirementPlan } from './initialization-requirements.ts'
import { validateRegistrationBinding } from './initialization-registration.ts'

export function validateAdoption(
  value: InitializationAdoption,
  original: Pick<InitialAdoption, 'definitionName' | 'adopted'>,
): void {
  if (value.definitionName !== original.definitionName || !same(value.adopted, original.adopted))
    throw new InitializationInvalid('initialization cannot change the original definition adoption')
}

export function initializationGuard(
  previous: WorkSnapshot | null,
  command: Extract<SessionCommand, { kind: 'create' | 'completeInitialization' }>,
  guards: readonly GuardCommand[],
): InitializationGuardFacts {
  const candidates = guards.filter(guard => guard.owner === 'session-initialization')
  const guard = candidates[0]
  if (candidates.length !== 1 || guard === undefined)
    throw new InitializationInvalid('exactly one initialization guard is required')
  const facts = parseInitializationFacts(guard)
  const expectedOperation =
    command.kind === 'create' ? command.input.operation : previous?.initialization?.createOperation
  if (expectedOperation === undefined)
    throw new InitializationInvalid('missing original create operation')
  if (
    facts.command !== command.kind ||
    facts.binding.tenant !== tenantText(command.input.tenant) ||
    facts.binding.session !== command.input.session ||
    facts.binding.operation !== command.input.operation ||
    facts.binding.createOperation !== expectedOperation ||
    !same(facts.input, initializationCommandInput(command))
  )
    throw new InitializationInvalid(
      'initialization guard does not bind the complete original command',
    )
  if (command.kind === 'create') {
    const original = command.input.creation
    const initial = facts.initialAdoption
    if (initial === null || facts.requirements === null)
      throw new InitializationInvalid(
        'create requires verified initial adoption and complete requirements',
      )
    validateAdoption(initial, {
      definitionName: original.definition.name,
      adopted: original.definition.candidate,
    })
    if (!same(initial.candidate, original.definition.candidate))
      throw new InitializationInvalid('initial adoption names another candidate')
    const plan = initializationPlan(original)
    if (!same(plan, facts.plan))
      throw new InitializationInvalid('guard changed the original initialization plan')
    validateRequirementPlan(facts.requirements, plan)
    if (
      !same(
        facts.results.map(value => value.result),
        original.initialization?.results ?? [],
      )
    )
      throw new InitializationInvalid('guard results differ from ordered creation results')
    if (
      original.residentAdoption !== undefined &&
      !same(original.residentAdoption, {
        residents: initial.newResidents,
        keys: initial.residentBindings,
      })
    )
      throw new InitializationInvalid('initial adoption contradicts the resident declaration')
    if (
      previous?.initialization !== undefined &&
      !same(previous.initialization.initialAdoption, initial)
    )
      throw new InitializationInvalid('initial adoption contradicts the original creation facts')
  } else {
    if (facts.initialAdoption !== null || facts.requirements !== null)
      throw new InitializationInvalid('completion cannot replace creation adoption or requirements')
    const plan = previous?.initialization?.plan.find(
      item => initializationKey(item) === initializationKey(command.input.result),
    )
    if (
      plan === undefined ||
      !same(facts.plan, [plan]) ||
      !same(
        facts.results.map(value => value.result),
        [command.input.result],
      )
    )
      throw new InitializationInvalid('completion changed the original item or result')
  }
  for (const value of facts.results) {
    const plan = facts.plan.find(item => initializationKey(item) === initializationKey(value))
    if (plan === undefined) throw new InitializationInvalid('result has no original plan item')
    validateResult(value, plan)
    if (value.consequence?.kind === 'context-registration')
      validateRegistrationBinding(value.consequence.decision, plan, {
        tenant: command.input.tenant,
        session: command.input.session,
        createOperation: expectedOperation,
      })
  }
  return facts
}

export function validateResult(
  value: InitializationGuardResult,
  plan: InitializationPlanItem,
): void {
  if (
    value.item !== value.result.item ||
    value.owner !== value.result.owner ||
    initializationKey(value) !== initializationKey(plan)
  )
    throw new InitializationInvalid('result identity does not name its original plan item')
  if (value.result.result.kind === 'failed') {
    if (value.consequence !== null)
      throw new InitializationInvalid('failed initialization has a success consequence')
    return
  }
  const consequence = value.consequence
  const expected = plan.kind === 'execution-adoption' ? 'execution-ready' : plan.kind
  if (consequence === null || consequence.kind !== expected)
    throw new InitializationInvalid('ready result lacks the required source consequence')
  if (
    consequence.kind !== 'context-registration' &&
    !same(consequence.evidence, value.result.result.evidence)
  )
    throw new InitializationInvalid('ready evidence contradicts its consequence')
}
