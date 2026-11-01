// The profile double: a `ModelProfiles<P>` that answers from tables the test fills. A list answer
// and a resolution are looked up by the minted tenant text, the principal identity and every other
// input field, so a consumer that drops an input field finds no answer. The double checks that an
// answer is consistent with itself and with its input before it keeps the answer; it does not
// evaluate scopes, sources, locks or credentials. A scripted answer proves nothing about them.
import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import type { ModelFailure } from '../result.ts'
import type {
  ModalityRequirement,
  ModelChoices,
  ModelProfiles,
  ProfileResolution,
} from '../profile.ts'
import { createAccessRules, type ScriptedAccessDecision } from './access.ts'
import { misuse } from './error.ts'
import {
  copyChoices,
  copyResolution,
  covers,
  findRow,
  frozenAnswer,
  profileScopeFailure,
  putRow,
  refusal,
  type ScriptRow,
} from './profile-values.ts'
import { frozenCopy, sameValue, tenantText } from './values.ts'

/** One call of the business port, recorded with a snapshot of its input when it arrived. */
export type ScriptedModelProfileCall<P> =
  | Readonly<{
      sequence: number
      kind: 'list'
      input: Parameters<ModelProfiles<P>['list']>[0]
    }>
  | Readonly<{
      sequence: number
      kind: 'resolve'
      input: Parameters<ModelProfiles<P>['resolve']>[0]
    }>

export type ScriptedModelProfiles<P> = Readonly<{
  /** The business port. It carries none of the controls below. */
  profiles: ModelProfiles<P>
  /** The test control plane; an access that was never set is denied. */
  setAccess(access: Access<P>, decision: ScriptedAccessDecision): void
  /** The answer to a `list` call with exactly this input; a second set replaces it. */
  setList(
    input: Parameters<ModelProfiles<P>['list']>[0],
    answer: Awaited<ReturnType<ModelProfiles<P>['list']>>,
  ): void
  /** The answer to a `resolve` call with exactly this input; a second set replaces it. */
  setResolution(
    input: Parameters<ModelProfiles<P>['resolve']>[0],
    answer: Awaited<ReturnType<ModelProfiles<P>['resolve']>>,
  ): void
  /** Every business call so far, in arrival order, as a new frozen array. */
  calls(): readonly ScriptedModelProfileCall<P>[]
}>

type ListInput = Parameters<ModelProfiles<unknown>['list']>[0]
type Resolved = Extract<ProfileResolution, { kind: 'resolved' }>

const REASONS = ['modality', 'locked', 'scope'] as const
const CREDENTIALS = ['available', 'missing', 'unreadable', 'unavailable'] as const
const ABSENT = ['unknown-name', 'withdrawn', 'excluded'] as const

/** Checks one resolution against the tenant and the requirement it answers. */
function checkResolution(
  resolution: ProfileResolution,
  tenant: TenantId,
  required: ModalityRequirement,
): void {
  if (resolution.kind === 'resolved') checkResolved(resolution, tenant, required)
  else if (!ABSENT.includes(resolution.reason)) throw misuse('the absent reason is not known')
}

/**
 * A resolved answer carries an active profile of a scope that applies to the tenant. Its
 * selectability equals the absence of reasons, and the modality reason is there exactly when the
 * profile does not cover the requirement. Locks, scope reasons and credentials are what the
 * script says.
 */
function checkResolved(resolution: Resolved, tenant: TenantId, required: ModalityRequirement) {
  const { profile, reasons } = resolution
  if (profileScopeFailure(profile.identity.scope, tenant) !== null)
    throw misuse('the scripted profile scope does not apply to the tenant')
  if (profile.availability !== 'active') throw misuse('a resolved profile must be active')
  if (!reasons.every(reason => REASONS.includes(reason)))
    throw misuse('the resolution reason is not known')
  if (new Set(reasons).size !== reasons.length) throw misuse('a resolution reason repeats')
  if (resolution.selectable !== (reasons.length === 0))
    throw misuse('selectable must equal the absence of reasons')
  if (covers(profile, required) === reasons.includes('modality'))
    throw misuse('the modality reason must state exactly whether the profile covers the input')
  if (!CREDENTIALS.includes(resolution.credential))
    throw misuse('the credential state is not known')
}

/** Checks the choices of a list and gives each choice by its route. */
function checkChoiceList(input: ListInput, answer: ModelChoices): ReadonlyMap<string, Resolved> {
  const routes = new Map<string, Resolved>()
  for (const choice of answer.choices) {
    if (choice.kind !== 'resolved')
      throw misuse('a choice must be a resolved profile, not an absence')
    if (!choice.selectable) throw misuse('a choice must be selectable')
    checkResolution(choice, input.tenant, input.required)
    const { route } = choice.profile.identity
    if (routes.has(route)) throw misuse('a choice route repeats')
    routes.set(route, choice)
  }
  return routes
}

/** Checks the selected item of a list against the asked selection, then against the choices. */
function checkSelection(
  input: ListInput,
  answer: ModelChoices,
  routes: ReadonlyMap<string, Resolved>,
): void {
  const { selected } = answer
  if (input.selected === null) {
    if (selected !== null) throw misuse('a list without a selection has no selected item')
    return
  }
  if (selected === null || selected.route !== input.selected)
    throw misuse('the selected item must keep the asked route')
  checkSelectedResolution(input, selected, routes.get(selected.route))
}

/**
 * Checks the resolution of the selected item and the choice of its route, if any. A selectable
 * selection is the choice of its route; an absent or unselectable one is not a choice.
 */
function checkSelectedResolution(
  input: ListInput,
  selected: NonNullable<ModelChoices['selected']>,
  listed: Resolved | undefined,
): void {
  const { resolution } = selected
  checkResolution(resolution, input.tenant, input.required)
  if (resolution.kind === 'resolved' && resolution.profile.identity.route !== selected.route)
    throw misuse('the selected resolution names another route')
  if (resolution.kind === 'absent' || !resolution.selectable) {
    if (listed !== undefined) throw misuse('a selection that cannot be chosen is not a choice')
    return
  }
  if (listed === undefined) throw misuse('a selectable selection must be one of the choices')
  if (!sameValue(listed, resolution))
    throw misuse('a selectable selection must equal the choice of its route')
}

export function createScriptedModelProfiles<P>(): ScriptedModelProfiles<P> {
  const rules = createAccessRules<P>()
  type ListKey = Readonly<{ selected: string | null; required: ModalityRequirement }>
  type ResolveKey = Readonly<{ route: string; required: ModalityRequirement }>
  const lists: ScriptRow<P, ListKey, ModelChoices>[] = []
  const resolutions: ScriptRow<P, ResolveKey, ProfileResolution>[] = []
  const recorded: ScriptedModelProfileCall<P>[] = []

  /** Steps 2 to 4 of the read order: the tenant, then the control plane. */
  function qualify(access: Access<P>, action: string): ModelFailure | null {
    if (!tenantCodec.encode(access.tenant).ok) return { kind: 'denied', action: 'tenant' }
    const decision = rules.decide(access)
    if (decision === 'allow') return null
    if (decision === 'deny') return { kind: 'denied', action }
    return { kind: 'unavailable', dependency: 'model-profiles', diagnostic: 'scripted-access' }
  }

  function record(call: ScriptedModelProfileCall<P>): void {
    recorded.push(Object.freeze(call))
  }

  const profiles: ModelProfiles<P> = {
    async list(input) {
      const snapshot = Object.freeze({
        tenant: input.tenant,
        principal: input.principal,
        selected: input.selected,
        required: frozenCopy(input.required),
      })
      record({ sequence: recorded.length + 1, kind: 'list', input: snapshot })
      const refused = qualify(snapshot, 'profiles.list')
      if (refused !== null) return refusal(refused)
      const row = findRow(lists, snapshot, {
        selected: snapshot.selected,
        required: snapshot.required,
      })
      if (row === undefined) throw misuse('no scripted profiles.list answer')
      return row.answer
    },
    async resolve(input) {
      const snapshot = Object.freeze({
        tenant: input.tenant,
        principal: input.principal,
        route: input.route,
        required: frozenCopy(input.required),
      })
      record({ sequence: recorded.length + 1, kind: 'resolve', input: snapshot })
      const refused = qualify(snapshot, 'profiles.resolve')
      if (refused !== null) return refusal(refused)
      const row = findRow(resolutions, snapshot, {
        route: snapshot.route,
        required: snapshot.required,
      })
      if (row === undefined) throw misuse('no scripted profiles.resolve answer')
      return row.answer
    },
  }

  return {
    profiles,
    setAccess: (access, decision) => rules.set(access, decision),
    setList(input, answer) {
      const tenant = tenantText(input.tenant)
      if ('ok' in answer) checkSelection(input, answer.ok, checkChoiceList(input, answer.ok))
      putRow(lists, {
        tenant,
        principal: input.principal,
        key: Object.freeze({ selected: input.selected, required: frozenCopy(input.required) }),
        answer: frozenAnswer(answer, copyChoices),
      })
    },
    setResolution(input, answer) {
      const tenant = tenantText(input.tenant)
      if ('ok' in answer) {
        checkResolution(answer.ok, input.tenant, input.required)
        if (answer.ok.kind === 'resolved' && answer.ok.profile.identity.route !== input.route)
          throw misuse('the scripted resolution names another route')
      }
      putRow(resolutions, {
        tenant,
        principal: input.principal,
        key: Object.freeze({ route: input.route, required: frozenCopy(input.required) }),
        answer: frozenAnswer(answer, copyResolution),
      })
    },
    calls: () => Object.freeze([...recorded]),
  }
}
