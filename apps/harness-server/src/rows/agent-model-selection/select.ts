import type { Failure, ModelSelection } from '@omne-harness/agent-contract'
import type { ModalityRequirement } from '@omne-harness/model-contract'
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
    input: Parameters<ModelProfilesService<unknown>['resolve']>[0],
  ): ReturnType<ModelProfilesService<unknown>['resolve']> | undefined
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
    route,
    required: ports.bindings.requirementOf(input),
  })
  if (resolving === undefined)
    return fail(unavailable('modelProfiles', 'the model profiles service is not available'))
  const resolved = await resolving
  if ('failure' in resolved) return fail(fromProfiles(resolved.failure))

  const resolution = resolved.ok
  if (resolution.kind === 'absent')
    return fail(
      unavailable('modelProfiles', `route "${route}" has no profile (${resolution.reason})`),
    )
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

  return succeed({
    recipient: { route, profile: resolution.profile.adoption },
    resolution: { ...resolution, selectable: true },
    parameters: resolution.profile.definition.parameters,
    tools: input.scope,
    evidence: saved.ok.source,
  })
}
