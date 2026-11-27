import type { Failure, ModelSelection } from '@omne-harness/agent-contract'
import {
  supportedReasoningEfforts,
  type ModalityRequirement,
  type ModelFailure,
  type Parameter,
  type ProfileResolution,
  type ReasoningEffort,
} from '@omne-harness/model-contract'
import type { ModelProfilesService } from '@omne-harness/model-cordis-contract/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionAccess,
  SessionFailure,
  SessionId,
  SessionModelSelection,
} from '@omne-harness/session-contract'

export type SelectInput = Parameters<ModelSelection<unknown>['select']>[0]
type Selected = Extract<
  Awaited<ReturnType<ModelSelection<unknown>['select']>>,
  { ok: unknown }
>['ok']
type ProfilesFailure = Extract<
  Awaited<ReturnType<ModelProfilesService<unknown>['resolve']>>,
  { failure: unknown }
>['failure']

export type SelectionBindings = Readonly<{
  sessionOf(input: SelectInput): Promise<Outcome<SessionId, Failure>>
  requirementOf(input: SelectInput): ModalityRequirement
}>

export type SelectionPorts = Readonly<{
  readSelection(
    access: SessionAccess<unknown>,
  ): Promise<Outcome<SessionModelSelection, SessionFailure>> | undefined
  resolveProfile(
    input: Parameters<ModelProfilesService<unknown>['resolve']>[0] & Readonly<{ kind: 'llm' }>,
  ): Promise<Outcome<ProfileResolution<'llm'>, ModelFailure>> | undefined
  bindings: SelectionBindings
}>

const unavailable = (owner: string, diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner,
  diagnostic,
})

function fromSession(failure: SessionFailure): Failure {
  switch (failure.kind) {
    case 'not-ready':
      return { kind: 'not-ready' }
    case 'denied':
      return { kind: 'denied', action: failure.action }
    case 'invalid':
      return { kind: 'invalid', field: failure.field, reason: failure.reason }
    default:
      return unavailable('session', `the saved model selection cannot be read (${failure.kind})`)
  }
}

function fromProfiles(failure: ProfilesFailure): Failure {
  switch (failure.kind) {
    case 'denied':
      return { kind: 'denied', action: failure.action }
    case 'invalid':
      return { kind: 'invalid', field: failure.field, reason: failure.reason }
    default:
      return unavailable('modelProfiles', `the profile cannot be read (${failure.kind})`)
  }
}

// The session's choice first, then the tenant's default for the model; with neither the profile's own stays.
function effortOf(
  chosen: ReasoningEffort | undefined,
  preferred: ReasoningEffort | undefined,
): Parameter | undefined {
  if (chosen !== undefined) return { kind: 'reasoning-effort', value: chosen, scale: 'unified' }
  if (preferred === undefined) return undefined
  return { kind: 'reasoning-effort', value: preferred, scale: 'unified', basis: 'preference' }
}

// A model turned off, withdrawn or unknown does not come back on its own: the Run ends, not waits.
function absentFailure(reason: Extract<ProfileResolution, { kind: 'absent' }>['reason']): Failure {
  return { kind: 'invalid', field: 'model', reason: reason === 'excluded' ? 'not-enabled' : reason }
}

export async function selectModel(
  ports: SelectionPorts,
  input: SelectInput,
): Promise<Outcome<Selected, Failure>> {
  if (input.alterations.length > 0) return fail({ kind: 'unsupported' })

  const session = await ports.bindings.sessionOf(input)
  if ('failure' in session) return session

  const reading = ports.readSelection({
    principal: input.principal,
    tenant: input.tenant,
    session: session.ok,
  })
  if (reading === undefined)
    return fail(unavailable('session', 'the session service is not available'))
  const saved = await reading
  if ('failure' in saved) return fail(fromSession(saved.failure))
  const route = saved.ok.selection.name

  const resolving = ports.resolveProfile({
    principal: input.principal,
    tenant: input.tenant,
    kind: 'llm',
    route,
    required: ports.bindings.requirementOf(input),
  })
  if (resolving === undefined)
    return fail(unavailable('modelProfiles', 'the model profiles service is not available'))
  const resolved = await resolving
  if ('failure' in resolved) return fail(fromProfiles(resolved.failure))

  const resolution = resolved.ok
  if (resolution.kind === 'absent') return fail(absentFailure(resolution.reason))
  if (resolution.profile.identity.route !== route)
    return fail(
      unavailable('modelProfiles', `the answer for route "${route}" is for another route`),
    )
  if (!resolution.selectable)
    return fail(
      unavailable(
        'modelProfiles',
        `route "${route}" is not selectable (${resolution.reasons.join(', ')})`,
      ),
    )

  const { definition } = resolution.profile
  const { reasoningEffort } = saved.ok.selection
  if (
    reasoningEffort !== undefined &&
    !supportedReasoningEfforts(definition).includes(reasoningEffort)
  )
    return fail({ kind: 'invalid', field: 'reasoningEffort', reason: 'unsupported-effort' })

  const effort = effortOf(reasoningEffort, resolution.defaultReasoningEffort)
  return succeed({
    recipient: { route, profile: resolution.profile.adoption },
    resolution: { ...resolution, selectable: true },
    parameters:
      effort === undefined
        ? definition.parameters
        : [
            ...definition.parameters.filter(parameter => parameter.kind !== 'reasoning-effort'),
            effort,
          ],
    tools: input.scope,
    evidence: saved.ok.source,
  })
}
