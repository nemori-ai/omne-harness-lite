import type { WorkSnapshot } from './values.ts'
import type { GuardCommand } from './ports.ts'
import { toJsonValue } from './entries.ts'
import { adoption, mintEvidence } from './testing-values.ts'
import type { InitializationCommand } from './testing-initialization-source.ts'
import { initializationPlan, tenantText } from './initialization-plan.ts'
import {
  INITIALIZATION_PROTOCOL,
  initializationCommandInput,
  type InitialAdoption,
  type InitializationGuardFacts,
  type InitializationGuardResult,
} from './initialization-schema.ts'

/** Assumes adoption of the named definition and caller-supplied resident keys. Missing keys default to an empty list. */
export function adoptedInitializationFixture(
  command: Extract<InitializationCommand, { kind: 'create' }>,
): InitialAdoption {
  const input = initializationCommandInput(command)
  return {
    definitionName: command.input.creation.definition.name,
    candidate: command.input.creation.definition.candidate,
    adopted: command.input.creation.definition.candidate,
    source: mintEvidence('fixture/actual-adoption', input),
    boundary: mintEvidence('fixture/adoption-boundary', input),
    inputSnapshot: { schema: adoption('fixture-adoption-input'), value: input },
    capabilities: {
      schema: adoption('fixture-capabilities'),
      value: toJsonValue(command.input.creation.residentAdoption?.keys ?? []),
    },
    residentBindings: command.input.creation.residentAdoption?.keys ?? [],
    newResidents: command.input.creation.residentAdoption?.residents ?? [],
  }
}

/** Produces materials only. A transaction still requires its explicitly registered test source. */
export function initializationFixtureFacts(
  command: InitializationCommand,
  snapshot: WorkSnapshot | null,
  initialAdoption: InitialAdoption | null,
  results?: readonly InitializationGuardResult[],
): InitializationGuardFacts {
  const plan =
    command.kind === 'create'
      ? initializationPlan(command.input.creation)
      : (snapshot?.initialization?.plan.filter(
          item =>
            item.owner === command.input.result.owner && item.item === command.input.result.item,
        ) ?? [])
  const values =
    command.kind === 'create'
      ? (command.input.creation.initialization?.results ?? [])
      : [command.input.result]
  const resolved =
    results ??
    values.map((result): InitializationGuardResult => {
      const original = plan.find(item => item.owner === result.owner && item.item === result.item)
      if (result.result.kind === 'failed')
        return { owner: result.owner, item: result.item, result, consequence: null }
      if (original === undefined || original.kind === 'context-registration')
        throw new Error('the fixture must supply an explicit registration preparation')
      const consequence =
        original.kind === 'execution-adoption'
          ? { kind: 'execution-ready' as const, evidence: result.result.evidence, adoption: null }
          : { kind: original.kind, evidence: result.result.evidence }
      return { owner: result.owner, item: result.item, result, consequence }
    })
  const input = initializationCommandInput(command)
  const source = mintEvidence('fixture/requirements', input)
  return {
    version: 1,
    command: command.kind,
    binding: {
      tenant: tenantText(command.input.tenant),
      session: command.input.session,
      operation: command.input.operation,
      createOperation:
        command.kind === 'create'
          ? command.input.operation
          : (snapshot?.initialization?.createOperation ?? 'missing'),
    },
    input,
    initialAdoption,
    plan,
    results: resolved,
    requirements:
      command.kind === 'completeInitialization'
        ? null
        : [
            {
              kind: 'entry-contract',
              key: 'entry',
              requirement: source,
              resolution: { kind: 'satisfied', evidence: source },
            },
            ...(plan.some(item => item.kind === 'execution-adoption')
              ? []
              : [
                  {
                    kind: 'execution-preparation' as const,
                    key: 'execution',
                    requirement: source,
                    resolution: { kind: 'satisfied' as const, evidence: source },
                  },
                ]),
            ...(command.input.creation.workspace !== null &&
            !plan.some(item => item.kind === 'workspace-load')
              ? [
                  {
                    kind: 'workspace-load' as const,
                    key: 'workspace',
                    requirement: source,
                    resolution: { kind: 'satisfied' as const, evidence: source },
                  },
                ]
              : []),
            ...plan.map(item => ({
              kind:
                item.kind === 'execution-adoption' ? ('execution-preparation' as const) : item.kind,
              key: JSON.stringify([item.owner, item.item]),
              requirement: source,
              resolution: { kind: 'planned' as const, owner: item.owner, item: item.item },
            })),
          ],
  }
}

export function initializationFixtureGuard(facts: InitializationGuardFacts): GuardCommand {
  return {
    owner: 'session-initialization',
    participant: 'session-evidence',
    protocol: INITIALIZATION_PROTOCOL,
    facts: toJsonValue(facts),
  }
}
