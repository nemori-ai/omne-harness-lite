import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonicalText } from '@omne-harness/server-entry/cordis'
import type {
  Adoption,
  AdoptionEvidenceCommand,
  InitializationGuardFacts,
  InitializationState,
  SessionAccess,
  SessionFailure,
} from '@omne-harness/session-contract'
import { sessionKey, sessionWorkPrincipalsKey } from '@omne-harness/session-cordis-contract/cordis'
import { modesInitialization } from '../../assembly/session-modes-initialization.ts'
import { jsonOf } from './json.ts'

type Create = Extract<AdoptionEvidenceCommand, { kind: 'create' }>
type Reply = Outcome<InitializationGuardFacts | undefined, SessionFailure>
const same = (left: unknown, right: unknown) => canonicalText(left) === canonicalText(right)
const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    owner: 'session.modes',
    diagnostic: 'original mode initialization cannot be read',
  })
const invalid = (): Reply =>
  fail({
    kind: 'quarantined',
    diagnostic: 'original mode initialization does not match its stored preparation',
  })

export async function recallInitialModes<P>(
  ctx: Context,
  command: Create,
  access: SessionAccess<P> | undefined,
  schema: Adoption,
): Promise<Reply> {
  if (!command.input.creation.initialization?.sources.length) return succeed(undefined)
  if (access === undefined) return unavailable()
  const reading = await readOriginal(ctx, access)
  if ('failure' in reading) return reading
  const original = reading.ok
  if (original === undefined || original.createOperation !== command.input.operation)
    return succeed(undefined)
  return originalGuard(original, command, access, schema)
}

async function readOriginal<P>(
  ctx: Context,
  access: SessionAccess<P>,
): Promise<Outcome<InitializationState | undefined, SessionFailure>> {
  const principals = ctx.get(sessionWorkPrincipalsKey)
  if (principals === undefined) return unavailable()
  const coordinator = await principals.forSession({
    actor: 'coordinator',
    tenant: access.tenant,
    session: access.session,
  })
  if ('failure' in coordinator)
    return coordinator.failure.kind === 'denied' ? succeed(undefined) : coordinator
  const session = ctx.intercept(sessionKey, { caller: 'coordinator' }).get(sessionKey)
  if (session === undefined) return unavailable()
  const observed = await session.work.readWork({ ...access, principal: coordinator.ok })
  if ('failure' in observed) return observed
  return succeed(observed.ok.initialization)
}

function originalGuard<P>(
  original: InitializationState,
  command: Create,
  access: SessionAccess<P>,
  schema: Adoption,
): Reply {
  const tenant = tenantCodec.encode(command.input.tenant)
  const workspace =
    command.input.creation.workspace === null
      ? null
      : workspaceCodec.encode(command.input.creation.workspace)
  if (!tenant.ok || (workspace !== null && !workspace.ok)) return invalid()
  const input = jsonOf({
    ...command.input,
    tenant: tenant.value,
    creation: {
      ...command.input.creation,
      workspace: workspace === null ? null : workspace.value,
    },
  })
  if (!same(input, original.input))
    return fail({ kind: 'conflict', operation: command.input.operation })
  const candidate = modesInitialization({ ...command.input, principal: access.principal })
  const material = original.initialAdoption.capabilities
  if (!same(material.schema, schema) || material.value.kind !== 'object') return invalid()
  const preparations = material.value.entries.find(
    entry => entry.key === 'contextPreparations',
  )?.value
  if (!same(preparations, jsonOf([canonicalText(candidate.preparation)]))) return invalid()
  const registered = original.registrations.find(item =>
    same(item.decision, candidate.preparation.decision),
  )
  if (
    registered === undefined ||
    !same(
      registered.prepared,
      candidate.outcome.consequence?.kind === 'context-registration'
        ? candidate.outcome.consequence.prepared
        : null,
    )
  )
    return invalid()
  const outcomes = []
  for (const result of command.input.creation.initialization?.results ?? []) {
    const found = original.results.find(
      item => item.operation === command.input.operation && same(item.outcome.result, result),
    )
    if (found === undefined) return invalid()
    outcomes.push(found.outcome)
  }
  return succeed({
    version: 1,
    command: 'create',
    binding: {
      tenant: tenant.value,
      session: command.input.session,
      operation: command.input.operation,
      createOperation: command.input.operation,
    },
    input: original.input,
    initialAdoption: original.initialAdoption,
    requirements: original.requirements,
    plan: original.plan,
    results: outcomes,
  })
}
