// The selection itself, apart from the Cordis wiring: read the route that the Session saved, resolve
// it through the profiles, and give the Agent a `SelectedModel`. Every failure is a failure. No
// path here gives a model that the Session did not save, and none asks the profiles about a route
// other than the saved one (Agent SPEC "模型选择" 3; Session SPEC "模型选择与切换": no silent swap).
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

/** The two things in a `select` call that the Agent does not state and the row must not guess. */
export type SelectionBindings = Readonly<{
  /**
   * The session whose saved selection applies to this call. `select` carries an execution and a
   * scope but no session, and no contract port maps one to the other yet, so the row takes the
   * mapping as a binding. The default binding names no session (see `index.ts`).
   */
  sessionOf(input: SelectInput): Outcome<SessionId, Failure>
  /**
   * The modality the request needs, which the Agent contract says the selection port takes from the
   * history evidence. The default asks for text only, with the history as the source.
   */
  requirementOf(input: SelectInput): ModalityRequirement
}>

/**
 * What the row asks of the tree on every call. A `undefined` answer means the service is absent
 * now: the row does not keep a reference across calls.
 */
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

/** The Session read failures, in the Agent's words. The Session's own diagnostic text stays there. */
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
  // An alteration (an extension's `select_model` output) would have to be checked against locks and
  // modalities. Nothing here can do that, so it is refused and not dropped.
  if (input.alterations.length > 0) return fail({ kind: 'unsupported' })

  const session = ports.bindings.sessionOf(input)
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
    // The tools come from the runtime's own scope, which `select` receives. This row reads no tool
    // description (known limitation); the evidence is the commit that saved the selection.
    tools: input.scope,
    evidence: saved.ok.source,
  })
}
