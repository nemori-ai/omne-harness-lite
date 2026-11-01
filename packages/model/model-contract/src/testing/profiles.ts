// The profile double: a `ModelProfiles<P>` that answers from tables the test fills. A list answer
// and a resolution are looked up by the minted tenant text, the principal identity and every other
// input field, so a consumer that drops an input field finds no answer. The double checks that an
// answer is consistent with itself and with its input before it keeps the answer; it does not
// evaluate scopes, sources, locks or credentials. A scripted answer proves nothing about them.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import type { ModelFailure } from '../result.ts'
import type {
  ModalityRequirement,
  ModelChoices,
  ModelProfile,
  ModelProfiles,
  ProfileResolution,
} from '../profile.ts'
import { createAccessRules, type ScriptedAccessDecision } from './access.ts'
import { misuse } from './error.ts'
import { copyChoices, copyResolution, profileScopeFailure } from './profile-values.ts'
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

type Row<P, K, T> = Readonly<{
  tenant: string
  principal: P
  key: K
  answer: Outcome<T, ModelFailure>
}>

const REASONS = ['modality', 'locked', 'scope'] as const
const CREDENTIALS = ['available', 'missing', 'unreadable', 'unavailable'] as const
const ABSENT = ['unknown-name', 'withdrawn', 'excluded'] as const

/** A frozen answer that shares nothing with the caller: the payload is copied with `copy`. */
function frozenAnswer<T>(
  answer: Outcome<T, ModelFailure>,
  copy: (value: T) => T,
): Outcome<T, ModelFailure> {
  return Object.freeze('ok' in answer ? succeed(copy(answer.ok)) : fail(frozenCopy(answer.failure)))
}

function refusal(failure: ModelFailure): Outcome<never, ModelFailure> {
  return Object.freeze(fail(Object.freeze(failure)))
}

function covers(profile: ModelProfile, required: ModalityRequirement): boolean {
  const input: readonly string[] = profile.definition.input
  return required.modalities.every(modality => input.includes(modality))
}

/**
 * Checks one resolution against the tenant and the requirement it answers. A resolved answer
 * carries an active profile of a scope that applies to the tenant; its selectability equals the
 * absence of reasons, and the modality reason is there exactly when the profile does not cover
 * the requirement. Locks, scope reasons and credentials are what the script says.
 */
function checkResolution(
  resolution: ProfileResolution,
  tenant: TenantId,
  required: ModalityRequirement,
): void {
  if (resolution.kind === 'absent') {
    if (!ABSENT.includes(resolution.reason)) throw misuse('the absent reason is not known')
    return
  }
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

function checkChoices(
  input: Parameters<ModelProfiles<unknown>['list']>[0],
  answer: ModelChoices,
): void {
  const routes = new Set<string>()
  for (const choice of answer.choices) {
    if (choice.kind !== 'resolved' || !choice.selectable)
      throw misuse('a choice must be a selectable resolution')
    checkResolution(choice, input.tenant, input.required)
    if (routes.has(choice.profile.identity.route)) throw misuse('a choice route repeats')
    routes.add(choice.profile.identity.route)
  }
  const { selected } = answer
  if (input.selected === null) {
    if (selected !== null) throw misuse('a list without a selection has no selected item')
    return
  }
  if (selected === null || selected.route !== input.selected)
    throw misuse('the selected item must keep the asked route')
  const { resolution } = selected
  checkResolution(resolution, input.tenant, input.required)
  if (resolution.kind === 'resolved' && resolution.profile.identity.route !== selected.route)
    throw misuse('the selected resolution names another route')
  const listed = answer.choices.find(choice =>
    choice.kind === 'resolved' ? choice.profile.identity.route === selected.route : false,
  )
  if (resolution.kind === 'resolved' && resolution.selectable) {
    if (listed === undefined || !sameValue(listed, resolution))
      throw misuse('a selectable selection must be the choice of the same route')
  } else if (listed !== undefined) {
    throw misuse('a selection that cannot be chosen is not a choice')
  }
}

export function createScriptedModelProfiles<P>(): ScriptedModelProfiles<P> {
  const rules = createAccessRules<P>()
  type ListKey = Readonly<{ selected: string | null; required: ModalityRequirement }>
  type ResolveKey = Readonly<{ route: string; required: ModalityRequirement }>
  const lists: Row<P, ListKey, ModelChoices>[] = []
  const resolutions: Row<P, ResolveKey, ProfileResolution>[] = []
  const recorded: ScriptedModelProfileCall<P>[] = []

  function put<K, T>(rows: Row<P, K, T>[], row: Row<P, K, T>): void {
    const at = rows.findIndex(
      item =>
        item.tenant === row.tenant &&
        Object.is(item.principal, row.principal) &&
        sameValue(item.key, row.key),
    )
    if (at === -1) rows.push(row)
    else rows[at] = row
  }

  function find<K, T>(rows: readonly Row<P, K, T>[], access: Access<P>, key: K) {
    const tenant = tenantText(access.tenant)
    return rows.find(
      row =>
        row.tenant === tenant &&
        Object.is(row.principal, access.principal) &&
        sameValue(row.key, key),
    )
  }

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
      const row = find(lists, snapshot, {
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
      const row = find(resolutions, snapshot, {
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
      if ('ok' in answer) checkChoices(input, answer.ok)
      put(lists, {
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
      put(resolutions, {
        tenant,
        principal: input.principal,
        key: Object.freeze({ route: input.route, required: frozenCopy(input.required) }),
        answer: frozenAnswer(answer, copyResolution),
      })
    },
    calls: () => Object.freeze([...recorded]),
  }
}
